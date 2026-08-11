#!/usr/bin/env python3
"""Create, update, and validate DOCX workflow state JSON.

This helper intentionally uses only the Python standard library. It implements
structural checks plus orchestration completion gates for the DOCX workflow
state contract.
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKFLOW_STATUSES = {"draft", "in_progress", "blocked", "failed", "complete"}
MODES = {"single_skill", "full_workflow"}
STAGES = {
    "intake",
    "research_compliance",
    "design",
    "plan",
    "render",
    "lint",
    "edit",
    "compose",
    "critique",
    "handoff",
}
STAGE_STATUSES = {"pending", "running", "pass", "revise", "reject", "blocked", "failed", "skipped"}
STAGE_STATUS_ALIASES = {"complete": "pass", "done": "pass", "in_progress": "running", "fail": "failed"}
CRITIC_STATUSES = {"pass", "revise", "reject"}
SEVERITIES = {"info", "warning", "error", "blocker"}
BLOCKING_SEVERITIES = {"error", "blocker"}
DEFAULT_REQUIRED_STAGES = ["intake", "design", "plan", "render", "lint", "critique", "handoff"]
SPECIALIST_STAGES = {"research_compliance", "design", "plan", "render", "lint", "edit", "compose", "critique"}
FINAL_DOCX_KEYS = {"rendered_docx", "edited_docx", "composed_docx"}
REQUIRED_ARTIFACTS_BY_STAGE = {
    "research_compliance": ["research_compliance_brief"],
    "design": ["style_manifest"],
    "plan": ["document_plan"],
    "render": ["rendered_docx"],
    "lint": ["lint_report"],
    "edit": ["edited_docx"],
    "compose": ["composed_docx"],
    "critique": ["critique_report"],
    "handoff": ["handoff_note"],
}
REQUIRED_TOP_LEVEL = {
    "workflow_id",
    "created_at",
    "updated_at",
    "mode",
    "status",
    "current_stage",
    "required_stages",
    "artifacts",
    "stage_results",
    "issues",
    "next_actions",
}


def now_utc() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize_stage_status(status: str) -> str:
    return STAGE_STATUS_ALIASES.get(status, status)


def default_required_stages(require_research_compliance: bool = False) -> list[str]:
    stages = list(DEFAULT_REQUIRED_STAGES)
    if require_research_compliance and "research_compliance" not in stages:
        stages.insert(1, "research_compliance")
    return stages


def new_state(
    workflow_id: str | None = None,
    stage: str = "intake",
    mode: str = "single_skill",
    required_stages: list[str] | None = None,
) -> dict[str, Any]:
    timestamp = now_utc()
    return {
        "workflow_id": workflow_id or f"docx-{uuid.uuid4().hex[:12]}",
        "created_at": timestamp,
        "updated_at": timestamp,
        "mode": mode,
        "status": "draft",
        "current_stage": stage,
        "required_stages": required_stages or default_required_stages(),
        "artifacts": {},
        "stage_results": {},
        "issues": [],
        "next_actions": [],
    }


def load_state(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError("state root must be an object")
    return data


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(state, handle, indent=2, sort_keys=True)
        handle.write("\n")


def validate_state(state: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    keys = set(state)
    missing = REQUIRED_TOP_LEVEL - keys
    extra = keys - REQUIRED_TOP_LEVEL
    if missing:
        errors.append("missing required fields: " + ", ".join(sorted(missing)))
    if extra:
        errors.append("unknown top-level fields: " + ", ".join(sorted(extra)))

    _require_string(state, "workflow_id", errors, min_length=1)
    _require_string(state, "created_at", errors, min_length=1)
    _require_string(state, "updated_at", errors, min_length=1)
    _require_enum(state, "mode", MODES, errors)
    _require_enum(state, "status", WORKFLOW_STATUSES, errors)
    _require_enum(state, "current_stage", STAGES, errors)
    _validate_required_stages(state, errors)
    _validate_artifacts(state, errors)
    _validate_stage_results(state, errors)
    _validate_issues(state, errors)
    _require_string_array(state.get("next_actions"), errors, "next_actions")

    if state.get("status") == "complete":
        _validate_completion_gates(state, errors)
    return errors


def _validate_required_stages(state: dict[str, Any], errors: list[str]) -> None:
    required_stages = state.get("required_stages")
    if not isinstance(required_stages, list) or not required_stages:
        errors.append("required_stages must be a non-empty array")
        return
    seen: set[str] = set()
    for index, stage in enumerate(required_stages):
        if stage not in STAGES:
            errors.append(f"required_stages[{index}] must be one of: " + ", ".join(sorted(STAGES)))
        elif stage in seen:
            errors.append(f"required_stages contains duplicate stage: {stage}")
        seen.add(stage)


def _validate_artifacts(state: dict[str, Any], errors: list[str]) -> None:
    artifacts = state.get("artifacts")
    if not isinstance(artifacts, dict):
        errors.append("artifacts must be an object")
        return
    for key, value in artifacts.items():
        if not isinstance(key, str) or not key:
            errors.append("artifact keys must be non-empty strings")
        if not isinstance(value, str) or not value:
            errors.append(f"artifacts.{key} must be a non-empty string")


def _validate_stage_results(state: dict[str, Any], errors: list[str]) -> None:
    stage_results = state.get("stage_results")
    if not isinstance(stage_results, dict):
        errors.append("stage_results must be an object")
        return
    for stage, result in stage_results.items():
        if stage not in STAGES:
            errors.append(f"stage_results has unknown stage: {stage}")
        if not isinstance(result, dict):
            errors.append(f"stage_results.{stage} must be an object")
            continue
        allowed = {"status", "summary", "agent", "artifact_keys", "completed_at", "critic_status", "notes"}
        extra_result = set(result) - allowed
        if extra_result:
            errors.append(f"stage_results.{stage} has unknown fields: " + ", ".join(sorted(extra_result)))
        _require_enum(result, "status", STAGE_STATUSES, errors, prefix=f"stage_results.{stage}.")
        _require_string(result, "summary", errors, prefix=f"stage_results.{stage}.")
        if "agent" in result:
            _require_string(result, "agent", errors, prefix=f"stage_results.{stage}.", min_length=1)
        if "artifact_keys" in result:
            _require_string_array(result["artifact_keys"], errors, f"stage_results.{stage}.artifact_keys")
        if "completed_at" in result and not isinstance(result["completed_at"], str):
            errors.append(f"stage_results.{stage}.completed_at must be a string")
        if "critic_status" in result:
            _require_enum(result, "critic_status", CRITIC_STATUSES, errors, prefix=f"stage_results.{stage}.")
            if stage == "critique" and result.get("status") != result.get("critic_status"):
                errors.append("stage_results.critique.status must match critic_status")
        if "notes" in result:
            _require_string_array(result["notes"], errors, f"stage_results.{stage}.notes")


def _validate_issues(state: dict[str, Any], errors: list[str]) -> None:
    issues = state.get("issues")
    if not isinstance(issues, list):
        errors.append("issues must be an array")
        return
    for index, issue in enumerate(issues):
        path = f"issues[{index}]"
        if not isinstance(issue, dict):
            errors.append(f"{path} must be an object")
            continue
        allowed = {"severity", "stage", "message", "artifact_key", "path"}
        extra_issue = set(issue) - allowed
        if extra_issue:
            errors.append(f"{path} has unknown fields: " + ", ".join(sorted(extra_issue)))
        _require_enum(issue, "severity", SEVERITIES, errors, prefix=f"{path}.")
        _require_string(issue, "stage", errors, prefix=f"{path}.")
        _require_string(issue, "message", errors, prefix=f"{path}.", min_length=1)
        for optional in ("artifact_key", "path"):
            if optional in issue and not isinstance(issue[optional], str):
                errors.append(f"{path}.{optional} must be a string")


def _validate_completion_gates(state: dict[str, Any], errors: list[str]) -> None:
    required_stages = state.get("required_stages") if isinstance(state.get("required_stages"), list) else []
    artifacts = state.get("artifacts") if isinstance(state.get("artifacts"), dict) else {}
    stage_results = state.get("stage_results") if isinstance(state.get("stage_results"), dict) else {}
    issues = state.get("issues") if isinstance(state.get("issues"), list) else []

    for stage in required_stages:
        result = stage_results.get(stage)
        if not isinstance(result, dict):
            errors.append(f"status=complete requires stage_results.{stage}")
            continue
        if result.get("status") != "pass":
            errors.append(f"status=complete requires stage_results.{stage}.status=pass")
        if state.get("mode") == "full_workflow" and stage in SPECIALIST_STAGES:
            agent = result.get("agent")
            if not isinstance(agent, str) or not agent or agent == "orchestrator":
                errors.append(f"status=complete requires subagent name for stage_results.{stage}.agent")
        for artifact_key in REQUIRED_ARTIFACTS_BY_STAGE.get(stage, []):
            if artifact_key not in artifacts:
                errors.append(f"status=complete requires artifacts.{artifact_key}")
            elif "artifact_keys" in result and artifact_key not in result.get("artifact_keys", []):
                errors.append(f"status=complete requires {artifact_key} in stage_results.{stage}.artifact_keys")

    if "critique" in required_stages:
        critique = stage_results.get("critique")
        if not isinstance(critique, dict) or critique.get("critic_status") != "pass":
            errors.append("status=complete requires stage_results.critique.critic_status=pass")
    if not FINAL_DOCX_KEYS.intersection(artifacts):
        errors.append("status=complete requires a final DOCX artifact: rendered_docx, edited_docx, or composed_docx")
    for index, issue in enumerate(issues):
        if isinstance(issue, dict) and issue.get("severity") in BLOCKING_SEVERITIES:
            errors.append(f"status=complete blocked by issues[{index}] severity={issue.get('severity')}")


def _require_string(data: dict[str, Any], key: str, errors: list[str], prefix: str = "", min_length: int = 0) -> None:
    value = data.get(key)
    if not isinstance(value, str):
        errors.append(f"{prefix}{key} must be a string")
    elif len(value) < min_length:
        errors.append(f"{prefix}{key} must not be empty")


def _require_enum(data: dict[str, Any], key: str, allowed: set[str], errors: list[str], prefix: str = "") -> None:
    value = data.get(key)
    if value not in allowed:
        errors.append(f"{prefix}{key} must be one of: " + ", ".join(sorted(allowed)))


def _require_string_array(value: Any, errors: list[str], path: str) -> None:
    if not isinstance(value, list):
        errors.append(f"{path} must be an array")
        return
    for index, item in enumerate(value):
        if not isinstance(item, str) or not item:
            errors.append(f"{path}[{index}] must be a non-empty string")


def parse_key_value(items: list[str]) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for item in items:
        if "=" not in item:
            raise ValueError(f"expected KEY=VALUE, got {item!r}")
        key, value = item.split("=", 1)
        if not key:
            raise ValueError("artifact key must not be empty")
        parsed[key] = value
    return parsed


def cmd_init(args: argparse.Namespace) -> int:
    required_stages = args.required_stage or default_required_stages(args.require_research_compliance)
    state = new_state(args.workflow_id, args.stage, args.mode, required_stages)
    errors = validate_state(state)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    save_state(args.path, state)
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    state = load_state(args.path)
    errors = validate_state(state)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print("valid")
    return 0


def cmd_update(args: argparse.Namespace) -> int:
    state = load_state(args.path)
    if args.mode:
        state["mode"] = args.mode
    if args.status:
        state["status"] = args.status
    if args.stage:
        state["current_stage"] = args.stage
    if args.required_stage:
        state["required_stages"] = args.required_stage
    if args.require_research_compliance and "research_compliance" not in state.get("required_stages", []):
        stages = list(state.get("required_stages", default_required_stages()))
        insert_at = 1 if "intake" in stages else 0
        stages.insert(insert_at, "research_compliance")
        state["required_stages"] = stages
    if args.next_action:
        state.setdefault("next_actions", [])
        state["next_actions"].extend(args.next_action)
    if args.artifact:
        state.setdefault("artifacts", {})
        state["artifacts"].update(parse_key_value(args.artifact))
    if args.stage_result:
        artifact_keys = [item for group in args.stage_artifact_key for item in group]
        stage_status = normalize_stage_status(args.stage_status)
        result: dict[str, Any] = {
            "status": stage_status,
            "summary": args.stage_summary or "",
        }
        if args.agent:
            result["agent"] = args.agent
        if artifact_keys:
            result["artifact_keys"] = artifact_keys
        if args.critic_status:
            result["critic_status"] = args.critic_status
        if stage_status not in {"pending", "running"}:
            result["completed_at"] = now_utc()
        state.setdefault("stage_results", {})[args.stage_result] = result
    if args.issue:
        state.setdefault("issues", [])
        severity, stage, message = args.issue
        state["issues"].append({"severity": severity, "stage": stage, "message": message})
    state["updated_at"] = now_utc()
    errors = validate_state(state)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    save_state(args.path, state)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init", help="create a new workflow state file")
    init_parser.add_argument("path", type=Path)
    init_parser.add_argument("--workflow-id")
    init_parser.add_argument("--mode", choices=sorted(MODES), default="single_skill")
    init_parser.add_argument("--stage", choices=sorted(STAGES), default="intake")
    init_parser.add_argument("--required-stage", choices=sorted(STAGES), action="append", default=[])
    init_parser.add_argument("--require-research-compliance", action="store_true")
    init_parser.set_defaults(func=cmd_init)

    validate_parser = subparsers.add_parser("validate", help="validate a workflow state file")
    validate_parser.add_argument("path", type=Path)
    validate_parser.set_defaults(func=cmd_validate)

    update_parser = subparsers.add_parser("update", help="update a workflow state file")
    update_parser.add_argument("path", type=Path)
    update_parser.add_argument("--mode", choices=sorted(MODES))
    update_parser.add_argument("--status", choices=sorted(WORKFLOW_STATUSES))
    update_parser.add_argument("--stage", choices=sorted(STAGES))
    update_parser.add_argument("--required-stage", choices=sorted(STAGES), action="append", default=[])
    update_parser.add_argument("--require-research-compliance", action="store_true")
    update_parser.add_argument("--artifact", action="append", default=[], metavar="KEY=PATH")
    update_parser.add_argument("--next-action", action="append", default=[])
    update_parser.add_argument("--stage-result", choices=sorted(STAGES))
    update_parser.add_argument("--stage-status", choices=sorted(STAGE_STATUSES | set(STAGE_STATUS_ALIASES)), default="pass")
    update_parser.add_argument("--stage-summary")
    update_parser.add_argument("--stage-artifact-key", action="append", nargs="+", default=[])
    update_parser.add_argument("--agent")
    update_parser.add_argument("--critic-status", choices=sorted(CRITIC_STATUSES))
    update_parser.add_argument("--issue", nargs=3, metavar=("SEVERITY", "STAGE", "MESSAGE"))
    update_parser.set_defaults(func=cmd_update)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
