#!/usr/bin/env python3
"""Validate safe-change-run v1 artifacts and lifecycle gates."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


STATUSES = [
    "draft",
    "snapshotted",
    "planned",
    "dry-run-verified",
    "approved",
    "applying",
    "verifying",
    "complete",
]
TERMINAL_STATUSES = {"rolled-back", "blocked"}
AUTHORITY_DIMENSIONS = {"read", "write", "external", "live", "destructive", "privileged"}
AUTHORITY_STATES = {"allowed", "read-only", "approval-required", "forbidden", "unknown"}
APPROVAL_STATES = {"not-needed", "not-requested", "requested", "granted", "denied"}
REQUIRED_FIELDS = {
    "contract_version",
    "run_id",
    "objective",
    "mode",
    "status",
    "target",
    "scope",
    "authority",
    "snapshots",
    "plan",
    "dry_run",
    "approval",
    "apply_receipts",
    "verification",
    "rollback",
    "blockers",
    "next_action",
}


def object_field(data: dict[str, Any], field: str, errors: list[str]) -> dict[str, Any]:
    value = data.get(field)
    if not isinstance(value, dict):
        errors.append(f"{field} must be an object")
        return {}
    return value


def list_field(data: dict[str, Any], field: str, errors: list[str]) -> list[Any]:
    value = data.get(field)
    if not isinstance(value, list):
        errors.append(f"{field} must be a list")
        return []
    return value


def all_passed(items: Any) -> bool:
    return isinstance(items, list) and bool(items) and all(
        isinstance(item, dict) and item.get("status") == "passed" for item in items
    )


def non_empty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate_condition_list(items: list[Any], label: str, errors: list[str]) -> None:
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append(f"{label}[{index}] must be an object")
        elif item.get("status") not in {"pending", "passed", "failed"}:
            errors.append(f"{label}[{index}].status is invalid")


def validate_snapshot(value: Any, label: str, errors: list[str]) -> None:
    if value is None:
        return
    if not isinstance(value, dict):
        errors.append(f"{label} must be an object or null")
        return
    for field in ("artifact_ref", "digest", "captured_at"):
        if not non_empty_string(value.get(field)):
            errors.append(f"{label}.{field} must be non-empty")
    scope = value.get("scope")
    if not (
        non_empty_string(scope)
        or isinstance(scope, dict) and bool(scope)
        or isinstance(scope, list) and bool(scope)
    ):
        errors.append(f"{label}.scope must be non-empty")


def validate(data: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["artifact root must be an object"]
    missing = sorted(REQUIRED_FIELDS - data.keys())
    if missing:
        errors.append(f"missing fields: {', '.join(missing)}")
    if data.get("contract_version") != "1.0.0":
        errors.append("contract_version must be 1.0.0")
    for field in ("run_id", "objective", "next_action"):
        if not isinstance(data.get(field), str) or not data[field].strip():
            errors.append(f"{field} must be non-empty")
    if data.get("mode") not in {"read-only", "dry-run", "apply"}:
        errors.append("mode must be read-only, dry-run, or apply")
    status = data.get("status")
    if status not in set(STATUSES) | TERMINAL_STATUSES:
        errors.append("status is invalid")

    target = object_field(data, "target", errors)
    for field in ("kind", "locator", "environment"):
        if not isinstance(target.get(field), str) or not target[field].strip():
            errors.append(f"target.{field} must be non-empty")
    if "resolved_identity" not in target:
        errors.append("target.resolved_identity is required")
    scope = object_field(data, "scope", errors)
    for field in ("includes", "excludes"):
        scope_items = list_field(scope, field, errors)
        for index, item in enumerate(scope_items):
            if not isinstance(item, dict) or not item:
                errors.append(f"scope.{field}[{index}] must be a non-empty object")

    authority = object_field(data, "authority", errors)
    missing_dimensions = sorted(AUTHORITY_DIMENSIONS - authority.keys())
    if missing_dimensions:
        errors.append(f"authority missing dimensions: {', '.join(missing_dimensions)}")
    for dimension in AUTHORITY_DIMENSIONS & authority.keys():
        if authority[dimension] not in AUTHORITY_STATES:
            errors.append(f"authority.{dimension} has invalid state")

    snapshots = object_field(data, "snapshots", errors)
    for field in ("before", "after"):
        if field not in snapshots:
            errors.append(f"snapshots.{field} is required")
        else:
            validate_snapshot(snapshots[field], f"snapshots.{field}", errors)
    plan = object_field(data, "plan", errors)
    if "generated_from" not in plan:
        errors.append("plan.generated_from is required")
    operations = list_field(plan, "operations", errors)
    operation_ids: set[str] = set()
    for index, operation in enumerate(operations):
        if not isinstance(operation, dict):
            errors.append(f"plan.operations[{index}] must be an object")
            continue
        operation_id = operation.get("id")
        if not isinstance(operation_id, str) or not operation_id:
            errors.append(f"plan.operations[{index}].id must be non-empty")
        elif operation_id in operation_ids:
            errors.append(f"duplicate operation id: {operation_id}")
        else:
            operation_ids.add(operation_id)
        for field in ("action", "target", "expected_effect"):
            if not isinstance(operation.get(field), str) or not operation[field]:
                errors.append(f"plan.operations[{index}].{field} must be non-empty")
        for field in ("destructive", "reversible"):
            if not isinstance(operation.get(field), bool):
                errors.append(f"plan.operations[{index}].{field} must be boolean")
        preconditions = list_field(operation, "preconditions", errors)
        for condition_index, condition in enumerate(preconditions):
            if not (
                non_empty_string(condition)
                or isinstance(condition, dict) and bool(condition)
            ):
                errors.append(
                    f"plan.operations[{index}].preconditions[{condition_index}] must be non-empty"
                )

    dry_run = object_field(data, "dry_run", errors)
    if dry_run.get("status") not in {"pending", "passed", "failed"}:
        errors.append("dry_run.status is invalid")
    for field in ("command", "exit_code", "side_effects_detected"):
        if field not in dry_run:
            errors.append(f"dry_run.{field} is required")
    if dry_run.get("command") is not None and not non_empty_string(dry_run.get("command")):
        errors.append("dry_run.command must be non-empty or null")
    exit_code = dry_run.get("exit_code")
    if exit_code is not None and (not isinstance(exit_code, int) or isinstance(exit_code, bool)):
        errors.append("dry_run.exit_code must be an integer or null")
    side_effects = dry_run.get("side_effects_detected")
    if side_effects is not None and not isinstance(side_effects, bool):
        errors.append("dry_run.side_effects_detected must be boolean or null")
    predicted_ids = list_field(dry_run, "predicted_operation_ids", errors)
    if any(not non_empty_string(item) for item in predicted_ids):
        errors.append("dry_run.predicted_operation_ids entries must be non-empty strings")
    if len(predicted_ids) != len(set(item for item in predicted_ids if isinstance(item, str))):
        errors.append("dry_run.predicted_operation_ids must be unique")
    invariants = list_field(dry_run, "invariants", errors)
    validate_condition_list(invariants, "dry_run.invariants", errors)
    approval = object_field(data, "approval", errors)
    required_dimensions = list_field(approval, "required_dimensions", errors)
    if any(dimension not in AUTHORITY_DIMENSIONS for dimension in required_dimensions):
        errors.append("approval.required_dimensions contains an unknown dimension")
    if approval.get("state") not in APPROVAL_STATES:
        errors.append("approval.state is invalid")
    for field in ("scope", "observed_at"):
        if field not in approval:
            errors.append(f"approval.{field} is required")
    if approval.get("observed_at") is not None and not non_empty_string(approval.get("observed_at")):
        errors.append("approval.observed_at must be non-empty or null")
    receipts = list_field(data, "apply_receipts", errors)
    for index, receipt in enumerate(receipts):
        if not isinstance(receipt, dict):
            errors.append(f"apply_receipts[{index}] must be an object")
            continue
        for field in ("operation_id", "evidence_location", "observed_at"):
            if not non_empty_string(receipt.get(field)):
                errors.append(f"apply_receipts[{index}].{field} must be non-empty")
        if receipt.get("status") not in {"applied", "skipped", "failed"}:
            errors.append(f"apply_receipts[{index}].status is invalid")
        result = receipt.get("result")
        if not (non_empty_string(result) or isinstance(result, dict) and bool(result)):
            errors.append(f"apply_receipts[{index}].result must be non-empty")
    verification = object_field(data, "verification", errors)
    postconditions = list_field(verification, "postconditions", errors)
    unchanged_conditions = list_field(verification, "unchanged_conditions", errors)
    validate_condition_list(postconditions, "verification.postconditions", errors)
    validate_condition_list(unchanged_conditions, "verification.unchanged_conditions", errors)
    omissions = list_field(verification, "omissions", errors)
    for index, omission in enumerate(omissions):
        if not isinstance(omission, dict):
            errors.append(f"verification.omissions[{index}] must be an object")
        elif omission.get("status") not in {"explained", "restored", "unresolved"}:
            errors.append(f"verification.omissions[{index}].status is invalid")
    rollback = object_field(data, "rollback", errors)
    for field in ("condition", "procedure"):
        if field not in rollback:
            errors.append(f"rollback.{field} is required")
        elif rollback.get(field) is not None and not non_empty_string(rollback.get(field)):
            errors.append(f"rollback.{field} must be non-empty or null")
    rollback_dimensions = list_field(rollback, "required_dimensions", errors)
    if any(dimension not in AUTHORITY_DIMENSIONS for dimension in rollback_dimensions):
        errors.append("rollback.required_dimensions contains an unknown dimension")
    if rollback.get("status") not in {"not-planned", "planned", "ready", "in-progress", "completed", "failed"}:
        errors.append("rollback.status is invalid")
    blockers = list_field(data, "blockers", errors)
    for index, blocker in enumerate(blockers):
        if not (non_empty_string(blocker) or isinstance(blocker, dict) and bool(blocker)):
            errors.append(f"blockers[{index}] must be non-empty")

    if status in STATUSES:
        phase = STATUSES.index(status)
        if phase >= STATUSES.index("snapshotted") and not snapshots.get("before"):
            errors.append(f"status {status} requires snapshots.before")
        if phase >= STATUSES.index("planned") and not operations:
            errors.append(f"status {status} requires planned operations")
        if phase >= STATUSES.index("dry-run-verified"):
            if dry_run.get("status") != "passed" or dry_run.get("exit_code") != 0:
                errors.append(f"status {status} requires a passing dry run with exit_code 0")
            if dry_run.get("side_effects_detected") is not False:
                errors.append(f"status {status} requires side_effects_detected=false")
            if not all_passed(dry_run.get("invariants")):
                errors.append(f"status {status} requires at least one passing dry-run invariant")
        if phase >= STATUSES.index("approved") and required_dimensions:
            if approval.get("state") != "granted":
                errors.append(f"status {status} requires granted scoped approval")
            for dimension in required_dimensions:
                if authority.get(dimension) not in {"allowed", "approval-required"}:
                    errors.append(f"approval cannot override forbidden or unknown {dimension} authority")
        if phase >= STATUSES.index("applying") and data.get("mode") != "apply":
            errors.append(f"status {status} requires mode=apply")
        if status == "complete":
            if not snapshots.get("after"):
                errors.append("status complete requires snapshots.after")
            receipt_ids = {
                receipt.get("operation_id")
                for receipt in receipts
                if isinstance(receipt, dict) and receipt.get("status") in {"applied", "skipped"}
            }
            if operation_ids - receipt_ids:
                errors.append("status complete requires an applied or skipped receipt for every operation")
            if not all_passed(verification.get("postconditions")):
                errors.append("status complete requires at least one passing postcondition")
            if any(
                not isinstance(item, dict) or item.get("status") not in {"explained", "restored"}
                for item in omissions
            ):
                errors.append("status complete forbids unresolved omissions")
    if status == "rolled-back" and rollback.get("status") != "completed":
        errors.append("status rolled-back requires rollback.status=completed")
    return errors


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
            print("Safe-change artifact is valid.")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
