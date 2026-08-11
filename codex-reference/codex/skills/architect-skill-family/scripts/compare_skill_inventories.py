#!/usr/bin/env python3
"""Compare two inventory_skills.py reports and flag context regressions."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def load_report(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"unable to read {path}: {error}") from error
    if not isinstance(data, dict) or not isinstance(data.get("skills"), list):
        raise ValueError(f"{path} is not an inventory_skills.py report")
    return data


def skill_map(report: dict[str, Any], label: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for index, skill in enumerate(report["skills"]):
        if not isinstance(skill, dict):
            raise ValueError(f"{label}.skills[{index}] must be an object")
        name = skill.get("name")
        if not isinstance(name, str) or not name:
            raise ValueError(f"{label}.skills[{index}].name must be non-empty")
        if name in result:
            continue
        result[name] = skill
    return result


def integer(report: dict[str, Any], field: str, label: str) -> int:
    value = report.get(field)
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError(f"{label}.{field} must be an integer")
    return value


def broken_links(report: dict[str, Any]) -> list[dict[str, Any]]:
    failures: list[dict[str, Any]] = []
    for skill in report["skills"]:
        missing = skill.get("missing_local_links", [])
        if isinstance(missing, list) and missing:
            failures.append({"skill": skill.get("name"), "missing_local_links": missing})
    return failures


def missing_metadata(report: dict[str, Any]) -> list[str]:
    return sorted(
        str(skill.get("name"))
        for skill in report["skills"]
        if skill.get("has_agents_metadata") is not True
    )


def broken_link_keys(report: dict[str, Any]) -> set[tuple[str, str]]:
    return {
        (str(item["skill"]), str(target))
        for item in broken_links(report)
        for target in item["missing_local_links"]
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("current", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--fail-on-regression", action="store_true")
    parser.add_argument("--max-added-entry-skills", type=int)
    parser.add_argument("--max-description-character-increase", type=int)
    args = parser.parse_args()

    if args.max_added_entry_skills is not None and args.max_added_entry_skills < 0:
        parser.error("--max-added-entry-skills must be non-negative")
    if args.max_description_character_increase is not None and args.max_description_character_increase < 0:
        parser.error("--max-description-character-increase must be non-negative")

    try:
        baseline = load_report(args.baseline)
        current = load_report(args.current)
        before = skill_map(baseline, "baseline")
        after = skill_map(current, "current")
        before_count = integer(baseline, "skill_count", "baseline")
        after_count = integer(current, "skill_count", "current")
        before_chars = integer(baseline, "description_characters_total", "baseline")
        after_chars = integer(current, "description_characters_total", "current")
    except ValueError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2

    added = sorted(set(after) - set(before))
    removed = sorted(set(before) - set(after))
    common = sorted(set(before) & set(after))
    changed: list[dict[str, Any]] = []
    moved: list[dict[str, str]] = []
    for name in common:
        old = before[name]
        new = after[name]
        old_path = str(old.get("path", ""))
        new_path = str(new.get("path", ""))
        if old_path != new_path:
            moved.append({"name": name, "before": old_path, "after": new_path})
        old_description = int(old.get("description_characters", 0))
        new_description = int(new.get("description_characters", 0))
        description_changed = old.get("description") != new.get("description")
        old_lines = int(old.get("skill_lines", 0))
        new_lines = int(new.get("skill_lines", 0))
        if description_changed or old_description != new_description or old_lines != new_lines:
            changed.append(
                {
                    "name": name,
                    "description_changed": description_changed,
                    "description_characters_before": old_description,
                    "description_characters_after": new_description,
                    "description_characters_delta": new_description - old_description,
                    "skill_lines_before": old_lines,
                    "skill_lines_after": new_lines,
                    "skill_lines_delta": new_lines - old_lines,
                }
            )

    regressions: list[str] = []
    baseline_duplicates = baseline.get("duplicate_names", {})
    current_duplicates = current.get("duplicate_names", {})
    if not isinstance(baseline_duplicates, dict):
        baseline_duplicates = {}
    if not isinstance(current_duplicates, dict):
        current_duplicates = {}
    new_duplicates = sorted(set(current_duplicates) - set(baseline_duplicates))
    if new_duplicates:
        regressions.append(f"new duplicate skill names: {', '.join(new_duplicates)}")
    baseline_missing_roots = baseline.get("missing_roots", [])
    current_missing_roots = current.get("missing_roots", [])
    if not isinstance(baseline_missing_roots, list):
        baseline_missing_roots = []
    if not isinstance(current_missing_roots, list):
        current_missing_roots = []
    new_missing_roots = sorted(set(current_missing_roots) - set(baseline_missing_roots))
    if new_missing_roots:
        regressions.append(f"new missing roots: {', '.join(new_missing_roots)}")
    new_broken_links = sorted(broken_link_keys(current) - broken_link_keys(baseline))
    if new_broken_links:
        regressions.append(f"new missing local links: {len(new_broken_links)}")
    new_missing_metadata = sorted(set(missing_metadata(current)) - set(missing_metadata(baseline)))
    if new_missing_metadata:
        regressions.append(
            f"new skills without agents/openai.yaml: {', '.join(new_missing_metadata)}"
        )

    count_delta = after_count - before_count
    character_delta = after_chars - before_chars
    if args.max_added_entry_skills is not None and count_delta > args.max_added_entry_skills:
        regressions.append(
            f"entry-point increase {count_delta} exceeds limit {args.max_added_entry_skills}"
        )
    if (
        args.max_description_character_increase is not None
        and character_delta > args.max_description_character_increase
    ):
        regressions.append(
            "description-character increase "
            f"{character_delta} exceeds limit {args.max_description_character_increase}"
        )

    result = {
        "report_version": "1.0.0",
        "baseline": str(args.baseline),
        "current": str(args.current),
        "summary": {
            "entry_skills_before": before_count,
            "entry_skills_after": after_count,
            "entry_skills_delta": count_delta,
            "description_characters_before": before_chars,
            "description_characters_after": after_chars,
            "description_characters_delta": character_delta,
        },
        "added": added,
        "removed": removed,
        "moved": moved,
        "changed": changed,
        "duplicate_names": current_duplicates,
        "missing_roots": current_missing_roots,
        "broken_links": broken_links(current),
        "missing_agents_metadata": missing_metadata(current),
        "new_duplicate_names": new_duplicates,
        "new_missing_roots": new_missing_roots,
        "new_broken_links": [
            {"skill": skill, "missing_local_link": target}
            for skill, target in new_broken_links
        ],
        "new_missing_agents_metadata": new_missing_metadata,
        "regressions": regressions,
    }
    rendered = json.dumps(result, indent=2, sort_keys=True) + "\n"
    try:
        if args.output:
            args.output.write_text(rendered, encoding="utf-8")
        else:
            sys.stdout.write(rendered)
    except OSError as error:
        print(f"ERROR: unable to write report: {error}", file=sys.stderr)
        return 2
    return 1 if args.fail_on_regression and regressions else 0


if __name__ == "__main__":
    raise SystemExit(main())
