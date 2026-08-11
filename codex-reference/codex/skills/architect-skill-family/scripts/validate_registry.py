#!/usr/bin/env python3
"""Validate an architect-skill-family capability registry."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


KINDS = {"entry-skill", "internal-module", "extension", "incubator"}
MATURITIES = {"incubator", "prototype", "stable", "deprecated"}
PROVENANCE = {"personal", "plugin", "system", "project"}
SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$")
REQUIRED_CAPABILITY_FIELDS = {
    "id",
    "name",
    "version",
    "summary",
    "operational_failure_prevented",
    "kind",
    "maturity",
    "location",
    "provenance",
    "canonical_owner_of",
    "positive_triggers",
    "negative_triggers",
    "distinct_deliverable",
    "consumes_contracts",
    "emits_contracts",
    "depends_on",
    "composes_with",
    "authority_class",
    "mutation_surface",
    "overlaps",
    "supersedes",
    "replaced_by",
    "context_cost",
    "golden_tasks",
    "trigger_tests",
    "last_verified",
    "evidence_projects",
    "promotion_gate",
}


def require_list(value: Any, label: str, errors: list[str]) -> list[Any]:
    if not isinstance(value, list):
        errors.append(f"{label} must be a list")
        return []
    return value


def find_cycle(graph: dict[str, list[str]]) -> list[str] | None:
    visiting: set[str] = set()
    visited: set[str] = set()
    trail: list[str] = []

    def visit(node: str) -> list[str] | None:
        if node in visiting:
            start = trail.index(node)
            return trail[start:] + [node]
        if node in visited:
            return None
        visiting.add(node)
        trail.append(node)
        for dependency in graph.get(node, []):
            cycle = visit(dependency)
            if cycle:
                return cycle
        trail.pop()
        visiting.remove(node)
        visited.add(node)
        return None

    for node in graph:
        cycle = visit(node)
        if cycle:
            return cycle
    return None


def validate(data: Any) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not isinstance(data, dict):
        return ["registry root must be an object"], warnings

    version = data.get("registry_version")
    if not isinstance(version, str) or not SEMVER_RE.match(version):
        errors.append("registry_version must be a semantic version such as 1.0.0")
    family = data.get("family")
    if not isinstance(family, dict) or not all(family.get(key) for key in ("id", "purpose", "workspace")):
        errors.append("family must provide non-empty id, purpose, and workspace")

    contracts = require_list(data.get("contracts"), "contracts", errors)
    contract_refs: set[str] = set()
    for index, contract in enumerate(contracts):
        label = f"contracts[{index}]"
        if not isinstance(contract, dict):
            errors.append(f"{label} must be an object")
            continue
        contract_id = contract.get("id")
        contract_version = contract.get("version")
        contract_owner = contract.get("owner")
        if not isinstance(contract_id, str) or not contract_id:
            errors.append(f"{label}.id must be non-empty")
            continue
        if not isinstance(contract_version, str) or not SEMVER_RE.match(contract_version):
            errors.append(f"{label}.version must be semantic versioning")
        else:
            contract_ref = f"{contract_id}@{contract_version}"
            if contract_ref in contract_refs:
                errors.append(f"duplicate contract claim: {contract_ref}")
            contract_refs.add(contract_ref)
        if not isinstance(contract_owner, str) or not contract_owner:
            errors.append(f"{label}.owner must be non-empty")
        if not contract.get("path"):
            errors.append(f"{label}.path must be non-empty")

    capabilities = require_list(data.get("capabilities"), "capabilities", errors)
    by_id: dict[str, dict[str, Any]] = {}
    owners: dict[str, list[str]] = defaultdict(list)
    graph: dict[str, list[str]] = {}

    for index, capability in enumerate(capabilities):
        label = f"capabilities[{index}]"
        if not isinstance(capability, dict):
            errors.append(f"{label} must be an object")
            continue
        missing = sorted(REQUIRED_CAPABILITY_FIELDS - capability.keys())
        if missing:
            errors.append(f"{label} missing fields: {', '.join(missing)}")
        capability_id = capability.get("id")
        if not isinstance(capability_id, str) or not capability_id:
            errors.append(f"{label}.id must be non-empty")
            continue
        if capability_id in by_id:
            errors.append(f"duplicate capability id: {capability_id}")
        by_id[capability_id] = capability

        version = capability.get("version")
        if not isinstance(version, str) or not SEMVER_RE.match(version):
            errors.append(f"{capability_id}.version must be semantic versioning")
        if capability.get("kind") not in KINDS:
            errors.append(f"{capability_id}.kind must be one of {sorted(KINDS)}")
        if capability.get("maturity") not in MATURITIES:
            errors.append(f"{capability_id}.maturity must be one of {sorted(MATURITIES)}")
        if capability.get("provenance") not in PROVENANCE:
            errors.append(f"{capability_id}.provenance must be one of {sorted(PROVENANCE)}")

        for primitive in require_list(capability.get("canonical_owner_of"), f"{capability_id}.canonical_owner_of", errors):
            if isinstance(primitive, str) and primitive:
                owners[primitive].append(capability_id)
            else:
                errors.append(f"{capability_id}.canonical_owner_of entries must be non-empty strings")

        positive = require_list(capability.get("positive_triggers"), f"{capability_id}.positive_triggers", errors)
        negative = require_list(capability.get("negative_triggers"), f"{capability_id}.negative_triggers", errors)
        golden = require_list(capability.get("golden_tasks"), f"{capability_id}.golden_tasks", errors)
        trigger_tests = require_list(capability.get("trigger_tests"), f"{capability_id}.trigger_tests", errors)
        evidence = require_list(capability.get("evidence_projects"), f"{capability_id}.evidence_projects", errors)

        if capability.get("kind") == "entry-skill":
            if not positive or not negative:
                errors.append(f"{capability_id}: entry-skill requires positive and negative triggers")
            if not capability.get("distinct_deliverable"):
                errors.append(f"{capability_id}: entry-skill requires a distinct_deliverable")
        if capability.get("maturity") == "stable":
            if capability.get("provenance") in {"personal", "project"}:
                if len(evidence) < 2:
                    errors.append(f"{capability_id}: locally governed stable capability requires evidence from at least two projects")
                if not golden or not trigger_tests:
                    errors.append(f"{capability_id}: locally governed stable capability requires golden tasks and trigger tests")
            elif not golden or not trigger_tests or not evidence:
                warnings.append(f"{capability_id}: externally governed stable capability lacks complete local verification evidence")
        if capability.get("maturity") == "deprecated" and not capability.get("replaced_by"):
            errors.append(f"{capability_id}: deprecated capability requires replaced_by")

        dependencies = require_list(capability.get("depends_on"), f"{capability_id}.depends_on", errors)
        graph[capability_id] = [item for item in dependencies if isinstance(item, str)]
        for field in ("consumes_contracts", "emits_contracts"):
            for contract_ref in require_list(capability.get(field), f"{capability_id}.{field}", errors):
                if contract_ref not in contract_refs:
                    errors.append(f"{capability_id}.{field} references unknown contract {contract_ref!r}")

        context_cost = capability.get("context_cost")
        if not isinstance(context_cost, dict):
            errors.append(f"{capability_id}.context_cost must be an object")
        else:
            if not isinstance(context_cost.get("exposed"), bool):
                errors.append(f"{capability_id}.context_cost.exposed must be boolean")
            elif capability.get("kind") == "entry-skill" and context_cost.get("exposed") is not True:
                errors.append(f"{capability_id}: entry-skill context_cost.exposed must be true")
            elif capability.get("kind") == "internal-module" and context_cost.get("exposed") is not False:
                errors.append(f"{capability_id}: internal-module context_cost.exposed must be false")
            for metric in ("description_characters", "skill_lines"):
                metric_value = context_cost.get(metric)
                if metric_value is None:
                    warnings.append(f"{capability_id}.context_cost.{metric} is not measured")
                elif not isinstance(metric_value, int) or isinstance(metric_value, bool) or metric_value < 0:
                    errors.append(f"{capability_id}.context_cost.{metric} must be a non-negative integer or null")

        if "/plugins/cache/" in str(capability.get("location", "")):
            warnings.append(f"{capability_id}: location appears to be a generated plugin cache; treat it as read-only")

    for primitive, capability_ids in sorted(owners.items()):
        if len(capability_ids) > 1:
            errors.append(f"primitive {primitive!r} has multiple canonical owners: {', '.join(capability_ids)}")

    known_ids = set(by_id)
    for capability_id, dependencies in graph.items():
        for dependency in dependencies:
            if dependency not in known_ids:
                errors.append(f"{capability_id}.depends_on references unknown capability {dependency!r}")
    for capability_id, capability in by_id.items():
        for field in ("composes_with", "overlaps"):
            for reference in require_list(capability.get(field), f"{capability_id}.{field}", errors):
                if reference not in known_ids:
                    errors.append(f"{capability_id}.{field} references unknown capability {reference!r}")
        for field in ("supersedes", "replaced_by"):
            reference = capability.get(field)
            if reference is not None and reference not in known_ids:
                errors.append(f"{capability_id}.{field} references unknown capability {reference!r}")

    cycle = find_cycle(graph)
    if cycle:
        errors.append(f"capability dependency cycle: {' -> '.join(cycle)}")
    return errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("registry", type=Path)
    parser.add_argument("--json", action="store_true", dest="json_output")
    args = parser.parse_args()
    try:
        data = json.loads(args.registry.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"Unable to read registry: {error}", file=sys.stderr)
        return 2

    errors, warnings = validate(data)
    if args.json_output:
        print(json.dumps({"valid": not errors, "errors": errors, "warnings": warnings}, indent=2))
    else:
        for warning in warnings:
            print(f"WARNING: {warning}")
        for error in errors:
            print(f"ERROR: {error}")
        print("Registry is valid." if not errors else f"Registry has {len(errors)} error(s).")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
