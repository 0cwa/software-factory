#!/usr/bin/env python3
"""Validate a metadata-only skill routing regression suite."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$")
CATEGORIES = {"positive", "negative", "boundary", "paraphrase"}
EXPECTATIONS = {"must-trigger", "must-not-trigger"}


def read_json(path: Path, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"unable to read {label} {path}: {error}") from error


def validate_suite(data: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["suite root must be an object"]
    version = data.get("suite_version")
    if not isinstance(version, str) or not SEMVER_RE.match(version):
        errors.append("suite_version must be semantic versioning")
    if not isinstance(data.get("entry_skill"), str) or not data["entry_skill"]:
        errors.append("entry_skill must be non-empty")
    if not isinstance(data.get("description_snapshot"), str) or not data["description_snapshot"]:
        errors.append("description_snapshot must be non-empty")
    cases = data.get("cases")
    if not isinstance(cases, list) or not cases:
        errors.append("cases must be a non-empty list")
        return errors

    ids: set[str] = set()
    seen_categories: set[str] = set()
    seen_expectations: set[str] = set()
    for index, case in enumerate(cases):
        label = f"cases[{index}]"
        if not isinstance(case, dict):
            errors.append(f"{label} must be an object")
            continue
        case_id = case.get("id")
        if not isinstance(case_id, str) or not case_id:
            errors.append(f"{label}.id must be non-empty")
        elif case_id in ids:
            errors.append(f"duplicate case id: {case_id}")
        else:
            ids.add(case_id)
        category = case.get("category")
        if category not in CATEGORIES:
            errors.append(f"{label}.category must be one of {sorted(CATEGORIES)}")
        else:
            seen_categories.add(category)
        expected = case.get("expected")
        if expected not in EXPECTATIONS:
            errors.append(f"{label}.expected must be one of {sorted(EXPECTATIONS)}")
        else:
            seen_expectations.add(expected)
        if not isinstance(case.get("prompt"), str) or not case["prompt"].strip():
            errors.append(f"{label}.prompt must be non-empty")

    missing_categories = sorted(CATEGORIES - seen_categories)
    if missing_categories:
        errors.append(f"suite is missing categories: {', '.join(missing_categories)}")
    missing_expectations = sorted(EXPECTATIONS - seen_expectations)
    if missing_expectations:
        errors.append(f"suite is missing expectations: {', '.join(missing_expectations)}")
    return errors


def validate_inventory(suite: dict[str, Any], inventory: Any) -> list[str]:
    if not isinstance(inventory, dict) or not isinstance(inventory.get("skills"), list):
        return ["inventory must be an inventory_skills.py report"]
    matches = [
        skill
        for skill in inventory["skills"]
        if isinstance(skill, dict) and skill.get("name") == suite.get("entry_skill")
    ]
    if not matches:
        return [f"entry skill {suite.get('entry_skill')!r} is absent from inventory"]
    if len(matches) > 1:
        return [f"entry skill {suite.get('entry_skill')!r} is duplicated in inventory"]
    actual = matches[0].get("description")
    expected = suite.get("description_snapshot")
    if actual != expected:
        return ["description_snapshot does not match the inventoried entry skill description"]
    return []


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("suite", type=Path)
    parser.add_argument("--inventory", type=Path)
    parser.add_argument("--json", action="store_true", dest="json_output")
    args = parser.parse_args()

    try:
        data = read_json(args.suite, "suite")
        errors = validate_suite(data)
        if args.inventory and isinstance(data, dict):
            inventory = read_json(args.inventory, "inventory")
            errors.extend(validate_inventory(data, inventory))
    except ValueError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2

    if args.json_output:
        print(json.dumps({"valid": not errors, "errors": errors}, indent=2))
    else:
        for error in errors:
            print(f"ERROR: {error}")
        if not errors:
            print(f"Routing suite is valid ({len(data['cases'])} cases).")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
