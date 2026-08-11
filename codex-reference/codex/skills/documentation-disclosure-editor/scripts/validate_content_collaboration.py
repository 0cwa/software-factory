#!/usr/bin/env python3
"""Validate content-collaboration-case v1 artifacts and completion gates."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


REQUIRED = {"contract_version", "case_id", "objective", "status", "audiences", "content_items", "decisions", "attribution", "validation", "unresolved", "next_action", "extensions"}


def nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def list_value(value: Any, label: str, errors: list[str]) -> list[Any]:
    if not isinstance(value, list):
        errors.append(f"{label} must be a list")
        return []
    return value


def record_map(items: list[Any], label: str, required: set[str], errors: list[str], key: str = "id") -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append(f"{label}[{index}] must be an object")
            continue
        missing = sorted(required - item.keys())
        if missing:
            errors.append(f"{label}[{index}] missing fields: {', '.join(missing)}")
        item_id = item.get(key)
        if not nonempty(item_id):
            errors.append(f"{label}[{index}].{key} must be non-empty")
        elif item_id in result:
            errors.append(f"duplicate {label} {key}: {item_id}")
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
        if not nonempty(data.get(field)):
            errors.append(f"{field} must be non-empty")
    status = data.get("status")
    if status not in {"draft", "mapping", "editing", "reviewing", "complete", "blocked"}:
        errors.append("status is invalid")

    audiences = record_map(list_value(data.get("audiences"), "audiences", errors), "audiences", {"id", "reader_goal"}, errors)
    for audience_id, audience in audiences.items():
        if not nonempty(audience.get("reader_goal")):
            errors.append(f"audience {audience_id}.reader_goal must be non-empty")

    items = record_map(list_value(data.get("content_items"), "content_items", errors), "content_items", {"id", "reader_question", "priority", "destination", "source_refs"}, errors)
    for item_id, item in items.items():
        if not nonempty(item.get("reader_question")) or not nonempty(item.get("destination")):
            errors.append(f"content item {item_id} requires reader_question and destination")
        if item.get("priority") not in {"primary", "secondary", "reference"}:
            errors.append(f"content item {item_id}.priority is invalid")
        list_value(item.get("source_refs"), f"content item {item_id}.source_refs", errors)
        duplicate = item.get("duplicate_of")
        if duplicate is not None and duplicate not in items:
            errors.append(f"content item {item_id} references unknown duplicate {duplicate!r}")

    decisions = record_map(list_value(data.get("decisions"), "decisions", errors), "decisions", {"id", "decision", "rationale", "source_item_ids"}, errors)
    decided_items: set[str] = set()
    for decision_id, decision in decisions.items():
        if not nonempty(decision.get("decision")) or not nonempty(decision.get("rationale")):
            errors.append(f"decision {decision_id} requires decision and rationale")
        if decision.get("status") not in {"proposed", "accepted", "rejected", "superseded"}:
            errors.append(f"decision {decision_id}.status is invalid")
        for item_id in list_value(decision.get("source_item_ids"), f"decision {decision_id}.source_item_ids", errors):
            if item_id not in items:
                errors.append(f"decision {decision_id} references unknown content item {item_id!r}")
            else:
                decided_items.add(item_id)

    attribution = list_value(data.get("attribution"), "attribution", errors)
    attributed_items: set[str] = set()
    for index, entry in enumerate(attribution):
        if not isinstance(entry, dict):
            errors.append(f"attribution[{index}] must be an object")
            continue
        item_id = entry.get("item_id")
        if item_id not in items:
            errors.append(f"attribution[{index}] references unknown content item {item_id!r}")
        else:
            attributed_items.add(item_id)
        if entry.get("origin") not in {"human", "agent", "mixed", "source"}:
            errors.append(f"attribution[{index}].origin is invalid")
        if entry.get("status") not in {"instruction", "accepted-edit", "proposal", "question", "rejected"}:
            errors.append(f"attribution[{index}].status is invalid")
        if not nonempty(entry.get("author_ref")):
            errors.append(f"attribution[{index}].author_ref must be non-empty")

    gates = record_map(list_value(data.get("validation"), "validation", errors), "validation", {"id", "criterion", "status", "evidence_refs"}, errors)
    for gate_id, gate in gates.items():
        if not nonempty(gate.get("criterion")):
            errors.append(f"validation {gate_id}.criterion must be non-empty")
        if gate.get("status") not in {"pending", "passed", "failed", "not-applicable"}:
            errors.append(f"validation {gate_id}.status is invalid")
        refs = list_value(gate.get("evidence_refs"), f"validation {gate_id}.evidence_refs", errors)
        if gate.get("status") == "passed" and not refs:
            errors.append(f"passed validation {gate_id} requires evidence_refs")

    unresolved = record_map(list_value(data.get("unresolved"), "unresolved", errors), "unresolved", {"id", "question", "owner", "impact", "next_check"}, errors)
    if not isinstance(data.get("extensions"), dict):
        errors.append("extensions must be an object")

    if status == "complete":
        if not audiences or not items:
            errors.append("status complete requires audiences and content items")
        if any(gate.get("status") not in {"passed", "not-applicable"} for gate in gates.values()):
            errors.append("status complete requires every validation gate passed or not-applicable")
        if any(item.get("impact") == "blocking" for item in unresolved.values()):
            errors.append("status complete forbids blocking unresolved choices")
        if set(items) - attributed_items:
            errors.append("status complete requires attribution for every content item")
        if set(items) - decided_items:
            errors.append("status complete requires every content item referenced by a decision")
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
            print("Content-collaboration artifact is valid.")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
