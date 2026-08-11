#!/usr/bin/env python3
"""Validate development-quality-case v1 artifacts and completion gates."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


REQUIRED = {"contract_version", "case_id", "objective", "status", "trigger", "scope", "options", "decision", "blast_radius", "preservation_gates", "validation", "deferrals", "blockers", "next_action", "extensions"}


def obj(value: Any, label: str, errors: list[str]) -> dict[str, Any]:
    if not isinstance(value, dict):
        errors.append(f"{label} must be an object")
        return {}
    return value


def seq(value: Any, label: str, errors: list[str]) -> list[Any]:
    if not isinstance(value, list):
        errors.append(f"{label} must be a list")
        return []
    return value


def text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def records(items: list[Any], label: str, fields: set[str], errors: list[str]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append(f"{label}[{index}] must be an object")
            continue
        missing = sorted(fields - item.keys())
        if missing:
            errors.append(f"{label}[{index}] missing fields: {', '.join(missing)}")
        item_id = item.get("id")
        if not text(item_id):
            errors.append(f"{label}[{index}].id must be non-empty")
        elif item_id in result:
            errors.append(f"duplicate {label} id: {item_id}")
        else:
            result[item_id] = item
    return result


def validate(data: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["artifact root must be an object"]
    missing = sorted(REQUIRED - data.keys())
    if missing:
        errors.append(f"missing fields: {', '.join(missing)}")
    if data.get("contract_version") != "1.0.0":
        errors.append("contract_version must be 1.0.0")
    for field in ("case_id", "objective", "next_action"):
        if not text(data.get(field)):
            errors.append(f"{field} must be non-empty")
    status = data.get("status")
    if status not in {"draft", "assessing", "planned", "validating", "complete", "blocked"}:
        errors.append("status is invalid")

    trigger = obj(data.get("trigger"), "trigger", errors)
    if not text(trigger.get("observation")):
        errors.append("trigger.observation must be non-empty")
    evidence_refs = seq(trigger.get("evidence_refs"), "trigger.evidence_refs", errors)
    if trigger.get("recurrence") not in {"one-off", "repeated", "systemic", "unknown"}:
        errors.append("trigger.recurrence is invalid")

    scope = obj(data.get("scope"), "scope", errors)
    for field in ("includes", "excludes", "constraints"):
        seq(scope.get(field), f"scope.{field}", errors)

    options = records(seq(data.get("options"), "options", errors), "options", {"id", "summary", "expected_value", "effort", "risk", "reversibility", "tradeoffs"}, errors)
    for option_id, option in options.items():
        if not text(option.get("summary")):
            errors.append(f"option {option_id}.summary must be non-empty")
        if option.get("expected_value") not in {"high", "medium", "low", "unknown"}:
            errors.append(f"option {option_id}.expected_value is invalid")
        if option.get("effort") not in {"small", "medium", "large", "unknown"}:
            errors.append(f"option {option_id}.effort is invalid")
        if option.get("risk") not in {"low", "medium", "high", "unknown"}:
            errors.append(f"option {option_id}.risk is invalid")
        if option.get("reversibility") not in {"easy", "moderate", "hard", "unknown"}:
            errors.append(f"option {option_id}.reversibility is invalid")
        seq(option.get("tradeoffs"), f"option {option_id}.tradeoffs", errors)

    decision = obj(data.get("decision"), "decision", errors)
    outcome = decision.get("outcome")
    if outcome not in {"pending", "proceed", "defer", "no-change", "blocked"}:
        errors.append("decision.outcome is invalid")
    selected = decision.get("option_id")
    if selected is not None and selected not in options:
        errors.append(f"decision.option_id references unknown option {selected!r}")
    if not isinstance(decision.get("rationale"), str):
        errors.append("decision.rationale must be a string")

    blast = obj(data.get("blast_radius"), "blast_radius", errors)
    for field in ("files", "interfaces", "data", "users", "unknowns"):
        seq(blast.get(field), f"blast_radius.{field}", errors)

    preservation = validate_gates(data.get("preservation_gates"), "preservation_gates", errors)
    validation = validate_gates(data.get("validation"), "validation", errors)
    records(seq(data.get("deferrals"), "deferrals", errors), "deferrals", {"id", "item", "reason", "upgrade_seam"}, errors)
    blockers = records(seq(data.get("blockers"), "blockers", errors), "blockers", {"id", "description", "owner", "next_check"}, errors)
    obj(data.get("extensions"), "extensions", errors)

    if status == "complete":
        if not evidence_refs:
            errors.append("status complete requires trigger evidence")
        if outcome not in {"proceed", "defer", "no-change"}:
            errors.append("status complete requires a settled decision")
        if outcome == "proceed" and selected not in options:
            errors.append("a completed proceed decision requires a valid selected option")
        if not text(decision.get("rationale")):
            errors.append("status complete requires decision rationale")
        if any(gate.get("status") not in {"passed", "not-applicable"} for gate in preservation.values()):
            errors.append("status complete requires every preservation gate passed or not-applicable")
        if any(gate.get("status") not in {"passed", "not-applicable"} for gate in validation.values()):
            errors.append("status complete requires every validation gate passed or not-applicable")
        if blockers:
            errors.append("status complete forbids blockers")
    return errors


def validate_gates(value: Any, label: str, errors: list[str]) -> dict[str, dict[str, Any]]:
    gates = records(seq(value, label, errors), label, {"id", "criterion", "status", "evidence_refs"}, errors)
    for gate_id, gate in gates.items():
        if not text(gate.get("criterion")):
            errors.append(f"{label} {gate_id}.criterion must be non-empty")
        if gate.get("status") not in {"pending", "passed", "failed", "not-applicable"}:
            errors.append(f"{label} {gate_id}.status is invalid")
        refs = seq(gate.get("evidence_refs"), f"{label} {gate_id}.evidence_refs", errors)
        if gate.get("status") == "passed" and not refs:
            errors.append(f"passed {label} {gate_id} requires evidence_refs")
    return gates


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path)
    parser.add_argument("--json", action="store_true", dest="json_output")
    args = parser.parse_args()
    try:
        data = json.loads(args.artifact.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"ERROR: unable to read artifact: {error}", file=sys.stderr)
        return 2
    errors = validate(data)
    if args.json_output:
        print(json.dumps({"valid": not errors, "errors": errors}, indent=2))
    else:
        for error in errors:
            print(f"ERROR: {error}")
        if not errors:
            print("Development-quality artifact is valid.")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
