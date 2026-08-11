#!/usr/bin/env python3
"""Render a validated work unit or ledger as a resumable Markdown handoff."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import shlex
import sys
from pathlib import Path
from typing import Any


def resolve_core() -> Path | None:
    candidates: list[Path] = []
    configured = os.environ.get("WORK_UNIT_CORE")
    if configured:
        candidates.append(Path(configured))
    candidates.append(Path(__file__).resolve().parents[3] / "modules" / "work-unit-core")
    codex_root = os.environ.get("CODEX_HOME")
    if codex_root:
        candidates.append(Path(codex_root) / "skills" / "work-unit-core")
        candidates.append(Path(codex_root) / "skill-modules" / "work-unit-core")
    else:
        candidates.append(Path.home() / ".codex" / "skills" / "work-unit-core")
        candidates.append(Path.home() / ".codex" / "skill-modules" / "work-unit-core")
    for candidate in candidates:
        if (candidate / "scripts" / "work_unit.py").is_file():
            return candidate
    return None


def load_core(core: Path) -> Any:
    path = core / "scripts" / "work_unit.py"
    spec = importlib.util.spec_from_file_location("work_unit_core", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to import {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def units_from(document: dict[str, Any]) -> list[dict[str, Any]]:
    if "work_units" in document:
        return [item for item in document["work_units"] if isinstance(item, dict)]
    return [document]


def bullet(lines: list[str], empty: str = "- None recorded.") -> str:
    return "\n".join(f"- {line}" for line in lines) if lines else empty


def owner_text(owner: Any) -> str:
    if isinstance(owner, dict):
        return f"{owner.get('id', 'unknown')} ({owner.get('role', 'owner')})"
    return str(owner)


def authority_lines(units: list[dict[str, Any]]) -> list[str]:
    seen: set[str] = set()
    lines: list[str] = []
    for unit in units:
        authority = unit.get("authority", {})
        rendered = ", ".join(
            f"{key}={authority.get(key, 'unknown')}"
            for key in ("read", "write", "external", "live", "destructive", "privileged", "commit", "push")
        )
        rendered += f", approval={authority.get('approval_state', 'unknown')}"
        approvals = authority.get("approvals", {})
        if isinstance(approvals, dict) and approvals:
            rendered += ", approvals[" + ", ".join(f"{key}={value}" for key, value in approvals.items()) + "]"
        line = f"`{unit.get('work_id')}`: {rendered}"
        if line not in seen:
            seen.add(line)
            lines.append(line)
    return lines


def extension_values(document: dict[str, Any], units: list[dict[str, Any]], field: str) -> list[tuple[str, Any]]:
    values: list[tuple[str, Any]] = []
    containers = [("ledger", document.get("extensions", {}))]
    containers.extend((str(unit.get("work_id")), unit.get("extensions", {})) for unit in units)
    for label, extensions in containers:
        handoff = extensions.get("staged-workflows.handoff", {}) if isinstance(extensions, dict) else {}
        if isinstance(handoff, dict) and field in handoff:
            values.append((label, handoff[field]))
    return values


def unit_line(unit: dict[str, Any]) -> str:
    action = unit.get("next_action", {}).get("action", "No next action recorded")
    return f"`{unit.get('work_id')}` — {unit.get('status')}: {unit.get('objective')} Owner: {owner_text(unit.get('owner'))}. Next: {action}"


def blocker_lines(units: list[dict[str, Any]]) -> list[str]:
    result: list[str] = []
    for unit in units:
        for blocker in unit.get("blockers", []):
            if blocker.get("state") == "open":
                result.append(f"`{unit.get('work_id')}/{blocker.get('id')}`: {blocker.get('description')} Owner: {blocker.get('owner')}.")
    return result


def evidence_lines(document: dict[str, Any], units: list[dict[str, Any]]) -> list[str]:
    result = [str(item) for item in document.get("evidence_refs", []) if isinstance(item, str)]
    for unit in units:
        for evidence in unit.get("evidence_refs", []):
            result.append(
                f"`{unit.get('work_id')}/{evidence.get('id')}` [{evidence.get('kind')}]: "
                f"{evidence.get('summary')} ({evidence.get('location')})"
            )
    return result


def decision_lines(document: dict[str, Any], units: list[dict[str, Any]]) -> list[str]:
    results: list[str] = []
    extension_sets = [document.get("extensions", {})] + [unit.get("extensions", {}) for unit in units]
    for extensions in extension_sets:
        handoff = extensions.get("staged-workflows.handoff", {}) if isinstance(extensions, dict) else {}
        for decision in handoff.get("decisions", []) if isinstance(handoff, dict) else []:
            if isinstance(decision, str):
                results.append(decision)
            elif isinstance(decision, dict):
                state = decision.get("state", "unresolved")
                owner = decision.get("owner", "unknown owner")
                results.append(f"{decision.get('decision', 'Unnamed decision')} [{state}; owner: {owner}]")
    return results


def resume_lines(
    document: dict[str, Any],
    units: list[dict[str, Any]],
    core: Any,
    core_path: Path,
    input_path: Path,
    selected: dict[str, Any] | None,
) -> list[str]:
    custom: list[str] = []
    extension_sets = [document.get("extensions", {})] + [unit.get("extensions", {}) for unit in units]
    for extensions in extension_sets:
        handoff = extensions.get("staged-workflows.handoff", {}) if isinstance(extensions, dict) else {}
        for check in handoff.get("resume_checks", []) if isinstance(handoff, dict) else []:
            if isinstance(check, dict):
                custom.append(
                    f"`{check.get('command', 'missing command')}` — expected: {check.get('expected', 'not recorded')} "
                    f"[authority: {check.get('authority', 'unknown')}]"
                )
    workspaces: list[str] = []
    for unit in units:
        for workspace in unit.get("scope", {}).get("workspaces", []):
            if workspace not in workspaces:
                workspaces.append(workspace)
    lines = [
        f"`test -d {shlex.quote(workspace)}` — expected: exit 0; otherwise the handoff workspace has drifted [authority: read]"
        for workspace in workspaces
    ]
    core_cli = shlex.quote(str(core_path / "scripts" / "work_unit.py"))
    artifact = shlex.quote(str(input_path))
    registry_path = core.default_extension_registry_path()
    registry_arg = f" --extension-registry {shlex.quote(str(registry_path))}" if registry_path else ""
    lines.append(
        f"`python3 {core_cli} validate {artifact}{registry_arg}` — expected: Valid work-unit document. [authority: read]"
    )
    expected_next = "null" if selected is None else f"work_id={selected.get('work_id')}"
    lines.append(
        f"`python3 {core_cli} next {artifact}` — expected: {expected_next} [authority: read]"
    )
    return lines + custom


def next_action_text(unit: dict[str, Any] | None, core_path: Path, input_path: Path) -> str:
    if unit is None:
        command = f"python3 {shlex.quote(str(core_path / 'scripts' / 'work_unit.py'))} next {shlex.quote(str(input_path))}"
        return (
            "Work unit: none\n\n"
            "Action: Confirm that no incomplete work unit remains, then close the objective or request new scope.\n\n"
            f"Command: `{command}`\n\n"
            "Expected: `null`"
        )
    action = unit.get("next_action", {})
    lines = [
        f"Work unit: `{unit.get('work_id')}`",
        f"Action: {action.get('action', 'No action recorded')}",
        f"Owner: {action.get('owner', owner_text(unit.get('owner')))}",
        f"Requires approval: {'yes' if action.get('requires_approval') else 'no'}",
    ]
    if action.get("command"):
        lines.append(f"Command: `{action['command']}`")
    return "\n\n".join(lines)


def render(
    document: dict[str, Any],
    core: Any,
    title: str,
    template: str,
    core_path: Path,
    input_path: Path,
) -> str:
    units = units_from(document)
    completed = [unit_line(unit) for unit in units if unit.get("status") == "complete"]
    current = [unit_line(unit) for unit in units if unit.get("status") != "complete"]
    selected = core.select_next_unit(document)
    objective = document.get("objective") or units[0].get("objective")
    counts: dict[str, int] = {}
    for unit in units:
        counts[unit.get("status", "unknown")] = counts.get(unit.get("status", "unknown"), 0) + 1
    state_lines = [f"{status}: {count}" for status, count in sorted(counts.items())]
    state_lines.extend(f"{label} source state: {value}" for label, value in extension_values(document, units, "source_state"))
    authority_summary = authority_lines(units)
    for label, notes in extension_values(document, units, "authority_notes"):
        if isinstance(notes, dict):
            authority_summary.extend(f"{label} note `{key}`: {value}" for key, value in notes.items())
    return template.format(
        contract_version=document.get("contract_version", "unknown"),
        title=title,
        objective=objective,
        state_summary=bullet(state_lines),
        authority_summary=bullet(authority_summary),
        completed_units=bullet(completed),
        current_units=bullet(current),
        blockers=bullet(blocker_lines(units)),
        evidence=bullet(evidence_lines(document, units)),
        decisions=bullet(decision_lines(document, units)),
        next_action=next_action_text(selected, core_path, input_path),
        resume_checks=bullet(resume_lines(document, units, core, core_path, input_path, selected)),
    ).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--title", default="Resumable handoff")
    args = parser.parse_args()

    core_path = resolve_core()
    if core_path is None:
        print("ERROR: work-unit-core not found", file=sys.stderr)
        return 2
    try:
        document = json.loads(args.input.read_text(encoding="utf-8"))
        core = load_core(core_path)
        errors = core.validate_artifact(document)
        if errors:
            print("\n".join(f"ERROR: {error}" for error in errors), file=sys.stderr)
            return 1
        template_path = Path(__file__).resolve().parents[1] / "assets" / "handoff.template.md"
        output = render(
            document,
            core,
            args.title,
            template_path.read_text(encoding="utf-8"),
            core_path,
            args.input.resolve(),
        )
        if args.output:
            args.output.write_text(output, encoding="utf-8")
        else:
            sys.stdout.write(output)
        return 0
    except (OSError, json.JSONDecodeError, RuntimeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
