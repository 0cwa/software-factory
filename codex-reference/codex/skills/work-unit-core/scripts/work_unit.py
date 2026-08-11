#!/usr/bin/env python3
"""Create, validate, transition, and select work units using only stdlib."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any


CONTRACT_VERSION = "1.0.0"
STATUSES = {"planned", "ready", "active", "review", "verified", "complete", "blocked", "replanned"}
AUTHORITY_STATES = {"allowed", "read-only", "approval-required", "forbidden", "unknown"}
TRANSITIONS = {
    "planned": {"ready", "blocked", "replanned"},
    "ready": {"active", "blocked", "replanned"},
    "active": {"review", "blocked", "replanned"},
    "review": {"active", "verified", "blocked", "replanned"},
    "verified": {"complete", "active", "replanned"},
    "blocked": {"ready", "replanned"},
    "replanned": {"ready", "blocked"},
    "complete": set(),
}
ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
EXTENSION_RE = re.compile(r"^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$")
WAITING_ACTION_RE = re.compile(r"^\s*(?:wait|await|pending)\b", re.IGNORECASE)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    rendered = json.dumps(data, indent=2, sort_keys=False) + "\n"
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(rendered, encoding="utf-8")
    temporary.replace(path)


def _require_type(value: Any, expected: type, label: str, errors: list[str]) -> bool:
    if not isinstance(value, expected):
        errors.append(f"{label} must be {expected.__name__}")
        return False
    return True


def _validate_named_objects(
    items: Any,
    label: str,
    required: set[str],
    allowed: set[str],
    errors: list[str],
) -> None:
    if not _require_type(items, list, label, errors):
        return
    seen: set[str] = set()
    for index, item in enumerate(items):
        item_label = f"{label}[{index}]"
        if not _require_type(item, dict, item_label, errors):
            continue
        missing = sorted(required - item.keys())
        if missing:
            errors.append(f"{item_label} missing: {', '.join(missing)}")
        unexpected = sorted(set(item) - allowed)
        if unexpected:
            errors.append(f"{item_label} has unexpected fields: {', '.join(unexpected)}")
        item_id = item.get("id")
        if not isinstance(item_id, str) or not item_id:
            errors.append(f"{item_label}.id must be a non-empty string")
        elif item_id in seen:
            errors.append(f"{label} has duplicate id {item_id!r}")
        else:
            seen.add(item_id)


def _validate_simple_schema(value: Any, schema: dict[str, Any], label: str) -> list[str]:
    """Validate the JSON Schema subset used by namespaced extension schemas."""
    errors: list[str] = []
    expected_type = schema.get("type")
    type_map = {
        "object": dict,
        "array": list,
        "string": str,
        "boolean": bool,
        "null": type(None),
    }
    if isinstance(expected_type, list):
        expected = tuple(type_map[item] for item in expected_type if item in type_map)
    else:
        expected = type_map.get(expected_type)
    if expected is not None and not isinstance(value, expected):
        errors.append(f"{label} must be {expected_type}")
        return errors
    if "const" in schema and value != schema["const"]:
        errors.append(f"{label} must equal {schema['const']!r}")
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{label} must be one of {schema['enum']!r}")
    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0):
            errors.append(f"{label} is shorter than minLength")
        pattern = schema.get("pattern")
        if pattern and not re.match(pattern, value):
            errors.append(f"{label} does not match {pattern!r}")
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            errors.append(f"{label} has fewer than minItems")
        if schema.get("uniqueItems"):
            normalized = [json.dumps(item, sort_keys=True) for item in value]
            if len(normalized) != len(set(normalized)):
                errors.append(f"{label} items must be unique")
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(value):
                errors.extend(_validate_simple_schema(item, item_schema, f"{label}[{index}]"))
    if isinstance(value, dict):
        required = set(schema.get("required", []))
        missing = sorted(required - value.keys())
        if missing:
            errors.append(f"{label} missing: {', '.join(missing)}")
        properties = schema.get("properties", {})
        additional = schema.get("additionalProperties", True)
        for key, item in value.items():
            if key in properties:
                errors.extend(_validate_simple_schema(item, properties[key], f"{label}.{key}"))
            elif additional is False:
                errors.append(f"{label} has unexpected field {key!r}")
            elif isinstance(additional, dict):
                errors.extend(_validate_simple_schema(item, additional, f"{label}.{key}"))
    return errors


def validate_extensions(document: dict[str, Any], namespace: str, schema: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    containers: list[tuple[str, dict[str, Any]]] = []
    if isinstance(document.get("extensions"), dict):
        containers.append(("extensions", document["extensions"]))
    for index, unit in enumerate(document.get("work_units", []) if isinstance(document, dict) else []):
        if isinstance(unit, dict) and isinstance(unit.get("extensions"), dict):
            containers.append((f"work_units[{index}].extensions", unit["extensions"]))
    for label, extensions in containers:
        if namespace in extensions:
            errors.extend(_validate_simple_schema(extensions[namespace], schema, f"{label}[{namespace!r}]"))
    return errors


def load_extension_schemas(specifications: list[str]) -> tuple[list[tuple[str, dict[str, Any]]], list[str]]:
    loaded: list[tuple[str, dict[str, Any]]] = []
    errors: list[str] = []
    for specification in specifications:
        if "=" not in specification:
            errors.append(f"extension schema must use NAMESPACE=PATH: {specification!r}")
            continue
        namespace, raw_path = specification.split("=", 1)
        if not EXTENSION_RE.match(namespace):
            errors.append(f"invalid extension namespace: {namespace!r}")
            continue
        try:
            schema = load_json(Path(raw_path))
        except (OSError, json.JSONDecodeError) as error:
            errors.append(f"unable to load extension schema {raw_path!r}: {error}")
            continue
        if not isinstance(schema, dict):
            errors.append(f"extension schema {raw_path!r} must be an object")
            continue
        loaded.append((namespace, schema))
    return loaded, errors


def default_extension_registry_path() -> Path | None:
    configured = os.environ.get("WORK_UNIT_EXTENSION_REGISTRY")
    candidates = [Path(configured)] if configured else []
    candidates.append(Path(__file__).resolve().parents[3] / "extension-registry.json")
    candidates.append(Path(__file__).resolve().parents[1] / "assets" / "extension-registry.json")
    return next((path for path in candidates if path.is_file()), None)


def _extension_namespaces(document: dict[str, Any]) -> set[str]:
    namespaces: set[str] = set()
    containers = [document.get("extensions", {})]
    containers.extend(
        unit.get("extensions", {})
        for unit in document.get("work_units", [])
        if isinstance(unit, dict)
    )
    for extensions in containers:
        if isinstance(extensions, dict):
            namespaces.update(key for key in extensions if isinstance(key, str))
    return namespaces


def load_extension_registry(path: Path) -> tuple[dict[str, Path], list[str]]:
    try:
        registry = load_json(path)
    except (OSError, json.JSONDecodeError) as error:
        return {}, [f"unable to load extension registry {str(path)!r}: {error}"]
    if not isinstance(registry, dict) or not isinstance(registry.get("extensions"), dict):
        return {}, [f"extension registry {str(path)!r} must contain an extensions object"]
    mappings: dict[str, Path] = {}
    errors: list[str] = []
    for namespace, entry in registry["extensions"].items():
        if not EXTENSION_RE.match(namespace) or not isinstance(entry, dict) or not isinstance(entry.get("schema"), str):
            errors.append(f"invalid extension registry entry: {namespace!r}")
            continue
        schema_path = Path(entry["schema"])
        mappings[namespace] = schema_path if schema_path.is_absolute() else path.parent / schema_path
    return mappings, errors


def validate_artifact(
    document: dict[str, Any],
    schema_specifications: list[str] | None = None,
    registry_path: Path | None = None,
) -> list[str]:
    errors = validate_document(document)
    namespaces = _extension_namespaces(document)
    mappings: dict[str, Path] = {}
    resolved_registry = registry_path or default_extension_registry_path()
    if resolved_registry is not None:
        registry_mappings, registry_errors = load_extension_registry(resolved_registry)
        mappings.update(registry_mappings)
        errors.extend(registry_errors)
    explicit, explicit_errors = load_extension_schemas(schema_specifications or [])
    errors.extend(explicit_errors)
    explicit_schemas = {namespace: schema for namespace, schema in explicit}
    for namespace in sorted(namespaces):
        schema = explicit_schemas.get(namespace)
        if schema is None and namespace in mappings:
            try:
                loaded = load_json(mappings[namespace])
                schema = loaded if isinstance(loaded, dict) else None
            except (OSError, json.JSONDecodeError) as error:
                errors.append(f"unable to load extension schema {str(mappings[namespace])!r}: {error}")
        if schema is None:
            errors.append(f"extension {namespace!r} is present but has no configured schema")
            continue
        errors.extend(validate_extensions(document, namespace, schema))
    return errors


def validate_unit(unit: Any, label: str = "work_unit") -> list[str]:
    errors: list[str] = []
    if not _require_type(unit, dict, label, errors):
        return errors
    required = {
        "contract_version", "work_id", "objective", "scope", "authority", "owner", "status",
        "dependencies", "acceptance_gates", "deliverables", "evidence_refs", "blockers",
        "next_action", "extensions",
    }
    missing = sorted(required - unit.keys())
    if missing:
        errors.append(f"{label} missing: {', '.join(missing)}")
    unexpected = sorted(set(unit) - required)
    if unexpected:
        errors.append(f"{label} has unexpected fields: {', '.join(unexpected)}")
    if unit.get("contract_version") != CONTRACT_VERSION:
        errors.append(f"{label}.contract_version must be {CONTRACT_VERSION}")
    work_id = unit.get("work_id")
    if not isinstance(work_id, str) or not ID_RE.match(work_id):
        errors.append(f"{label}.work_id must match {ID_RE.pattern}")
    if not isinstance(unit.get("objective"), str) or not unit.get("objective", "").strip():
        errors.append(f"{label}.objective must be a non-empty string")

    scope = unit.get("scope")
    if _require_type(scope, dict, f"{label}.scope", errors):
        unexpected_scope = sorted(set(scope) - {"workspaces", "includes", "excludes"})
        if unexpected_scope:
            errors.append(f"{label}.scope has unexpected fields: {', '.join(unexpected_scope)}")
        for field in ("workspaces", "includes", "excludes"):
            value = scope.get(field)
            if not isinstance(value, list) or not all(isinstance(item, str) and item for item in value):
                errors.append(f"{label}.scope.{field} must be a list of non-empty strings")
            elif len(value) != len(set(value)):
                errors.append(f"{label}.scope.{field} must contain unique items")
        if isinstance(scope.get("workspaces"), list) and not scope["workspaces"]:
            errors.append(f"{label}.scope.workspaces must not be empty")

    authority = unit.get("authority")
    if _require_type(authority, dict, f"{label}.authority", errors):
        unexpected_authority = sorted(set(authority) - {"read", "write", "external", "live", "destructive", "privileged", "commit", "push", "approvals", "approval_state"})
        if unexpected_authority:
            errors.append(f"{label}.authority has unexpected fields: {', '.join(unexpected_authority)}")
        for field in ("read", "write", "external", "live", "destructive"):
            if authority.get(field) not in AUTHORITY_STATES:
                errors.append(f"{label}.authority.{field} has an invalid state")
        for field in ("privileged", "commit", "push"):
            if field in authority and authority.get(field) not in AUTHORITY_STATES:
                errors.append(f"{label}.authority.{field} has an invalid state")
        if authority.get("approval_state") not in {"not-needed", "not-requested", "requested", "granted", "denied", "unknown"}:
            errors.append(f"{label}.authority.approval_state has an invalid state")
        approvals = authority.get("approvals")
        if approvals is not None:
            approval_fields = {"write", "external", "live", "destructive", "privileged", "commit", "push"}
            approval_states = {"not-needed", "not-requested", "requested", "granted", "denied", "unknown"}
            if not isinstance(approvals, dict):
                errors.append(f"{label}.authority.approvals must be an object")
            else:
                unexpected_approvals = sorted(set(approvals) - approval_fields)
                if unexpected_approvals:
                    errors.append(f"{label}.authority.approvals has unexpected fields: {', '.join(unexpected_approvals)}")
                for field, value in approvals.items():
                    if value not in approval_states:
                        errors.append(f"{label}.authority.approvals.{field} has an invalid state")

    owner = unit.get("owner")
    if isinstance(owner, str):
        if not owner.strip():
            errors.append(f"{label}.owner must be a non-empty string")
    elif isinstance(owner, dict):
        missing_owner = sorted({"id", "role"} - owner.keys())
        if missing_owner:
            errors.append(f"{label}.owner missing: {', '.join(missing_owner)}")
        unexpected_owner = sorted(set(owner) - {"id", "role"})
        if unexpected_owner:
            errors.append(f"{label}.owner has unexpected fields: {', '.join(unexpected_owner)}")
        for field in ("id", "role"):
            if not isinstance(owner.get(field), str) or not owner.get(field, "").strip():
                errors.append(f"{label}.owner.{field} must be a non-empty string")
    else:
        errors.append(f"{label}.owner must be a string or object")

    status = unit.get("status")
    if status not in STATUSES:
        errors.append(f"{label}.status has an invalid value")
    dependencies = unit.get("dependencies")
    if not isinstance(dependencies, list) or not all(isinstance(item, str) and ID_RE.match(item) for item in dependencies):
        errors.append(f"{label}.dependencies must be a list of work ids")
    elif len(dependencies) != len(set(dependencies)):
        errors.append(f"{label}.dependencies must be unique")
    elif work_id in dependencies:
        errors.append(f"{label} cannot depend on itself")

    _validate_named_objects(
        unit.get("acceptance_gates"),
        f"{label}.acceptance_gates",
        {"id", "criterion", "status", "evidence_refs"},
        {"id", "criterion", "status", "evidence_refs"},
        errors,
    )
    evidence_ids = {
        item.get("id")
        for item in unit.get("evidence_refs", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    for index, gate in enumerate(unit.get("acceptance_gates", [])):
        if isinstance(gate, dict) and (not isinstance(gate.get("criterion"), str) or not gate.get("criterion", "").strip()):
            errors.append(f"{label}.acceptance_gates[{index}].criterion must be a non-empty string")
        if isinstance(gate, dict):
            refs = gate.get("evidence_refs")
            if not isinstance(refs, list) or not all(isinstance(ref, str) and ref for ref in refs):
                errors.append(f"{label}.acceptance_gates[{index}].evidence_refs must be a list of non-empty strings")
        if isinstance(gate, dict) and gate.get("status") not in {"pending", "passed", "failed", "skipped"}:
            errors.append(f"{label}.acceptance_gates[{index}].status has an invalid value")
        if isinstance(gate, dict) and gate.get("status") in {"passed", "failed"}:
            refs = gate.get("evidence_refs")
            if not isinstance(refs, list) or not refs:
                errors.append(f"{label}.acceptance_gates[{index}] requires evidence for {gate.get('status')} status")
            elif any(ref not in evidence_ids for ref in refs):
                errors.append(f"{label}.acceptance_gates[{index}] references unknown evidence")
    _validate_named_objects(
        unit.get("deliverables"),
        f"{label}.deliverables",
        {"id", "location", "status"},
        {"id", "location", "status", "summary"},
        errors,
    )
    for index, deliverable in enumerate(unit.get("deliverables", [])):
        if isinstance(deliverable, dict) and (not isinstance(deliverable.get("location"), str) or not deliverable.get("location", "").strip()):
            errors.append(f"{label}.deliverables[{index}].location must be a non-empty string")
        if isinstance(deliverable, dict) and "summary" in deliverable and not isinstance(deliverable.get("summary"), str):
            errors.append(f"{label}.deliverables[{index}].summary must be a string")
        if isinstance(deliverable, dict) and deliverable.get("status") not in {"planned", "created", "verified", "omitted"}:
            errors.append(f"{label}.deliverables[{index}].status has an invalid value")
    _validate_named_objects(
        unit.get("evidence_refs"),
        f"{label}.evidence_refs",
        {"id", "kind", "location", "summary"},
        {"id", "kind", "location", "summary", "observed_at"},
        errors,
    )
    for index, evidence in enumerate(unit.get("evidence_refs", [])):
        if isinstance(evidence, dict):
            for field in ("location", "summary"):
                if not isinstance(evidence.get(field), str) or not evidence.get(field, "").strip():
                    errors.append(f"{label}.evidence_refs[{index}].{field} must be a non-empty string")
            if "observed_at" in evidence and evidence.get("observed_at") is not None and not isinstance(evidence.get("observed_at"), str):
                errors.append(f"{label}.evidence_refs[{index}].observed_at must be a string or null")
        if isinstance(evidence, dict) and evidence.get("kind") not in {"command", "test", "inspection", "artifact", "decision", "external"}:
            errors.append(f"{label}.evidence_refs[{index}].kind has an invalid value")
    _validate_named_objects(
        unit.get("blockers"),
        f"{label}.blockers",
        {"id", "description", "state", "owner"},
        {"id", "description", "state", "owner"},
        errors,
    )
    for index, blocker in enumerate(unit.get("blockers", [])):
        if isinstance(blocker, dict):
            for field in ("description", "owner"):
                if not isinstance(blocker.get(field), str) or not blocker.get(field, "").strip():
                    errors.append(f"{label}.blockers[{index}].{field} must be a non-empty string")
        if isinstance(blocker, dict) and blocker.get("state") not in {"open", "resolved"}:
            errors.append(f"{label}.blockers[{index}].state has an invalid value")

    next_action = unit.get("next_action")
    if _require_type(next_action, dict, f"{label}.next_action", errors):
        unexpected_action = sorted(set(next_action) - {"action", "owner", "command", "requires_approval"})
        if unexpected_action:
            errors.append(f"{label}.next_action has unexpected fields: {', '.join(unexpected_action)}")
        for field in ("action", "owner"):
            if not isinstance(next_action.get(field), str) or not next_action[field].strip():
                errors.append(f"{label}.next_action.{field} must be a non-empty string")
        if not isinstance(next_action.get("requires_approval"), bool):
            errors.append(f"{label}.next_action.requires_approval must be boolean")
        if "command" in next_action and next_action.get("command") is not None and not isinstance(next_action.get("command"), str):
            errors.append(f"{label}.next_action.command must be a string or null")

    extensions = unit.get("extensions")
    if _require_type(extensions, dict, f"{label}.extensions", errors):
        for namespace in extensions:
            if not EXTENSION_RE.match(namespace):
                errors.append(f"{label}.extensions key {namespace!r} must be namespaced")

    if status in {"verified", "complete"}:
        gates = unit.get("acceptance_gates", [])
        if not gates or any(not isinstance(gate, dict) or gate.get("status") != "passed" for gate in gates):
            errors.append(f"{label}: {status} requires every acceptance gate to be passed")
        if not unit.get("evidence_refs"):
            errors.append(f"{label}: {status} requires evidence_refs")
    if status == "complete":
        deliverables = unit.get("deliverables", [])
        if not deliverables or any(item.get("status") not in {"verified", "omitted"} for item in deliverables if isinstance(item, dict)):
            errors.append(f"{label}: complete requires verified or explicitly omitted deliverables")
    if status == "blocked" and not any(item.get("state") == "open" for item in unit.get("blockers", []) if isinstance(item, dict)):
        errors.append(f"{label}: blocked requires an open blocker")
    if status == "ready" and isinstance(next_action, dict) and WAITING_ACTION_RE.match(str(next_action.get("action", ""))):
        errors.append(f"{label}: ready requires an executable next action, not dependency-waiting text")
    return errors


def _find_cycle(graph: dict[str, list[str]]) -> list[str] | None:
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


def validate_document(data: Any) -> list[str]:
    if not isinstance(data, dict) or "work_units" not in data:
        return validate_unit(data)
    errors: list[str] = []
    required = {"contract_version", "ledger_id", "objective", "work_units", "evidence_refs", "extensions"}
    missing_fields = sorted(required - data.keys())
    if missing_fields:
        errors.append(f"ledger missing: {', '.join(missing_fields)}")
    unexpected_fields = sorted(set(data) - required)
    if unexpected_fields:
        errors.append(f"ledger has unexpected fields: {', '.join(unexpected_fields)}")
    if data.get("contract_version") != CONTRACT_VERSION:
        errors.append(f"ledger.contract_version must be {CONTRACT_VERSION}")
    if not isinstance(data.get("ledger_id"), str) or not ID_RE.match(data.get("ledger_id", "")):
        errors.append("ledger.ledger_id is invalid")
    if not isinstance(data.get("objective"), str) or not data.get("objective", "").strip():
        errors.append("ledger.objective must be a non-empty string")
    units = data.get("work_units")
    if not isinstance(units, list):
        return errors + ["ledger.work_units must be a list"]
    ids: list[str] = []
    for index, unit in enumerate(units):
        errors.extend(validate_unit(unit, f"ledger.work_units[{index}]"))
        if isinstance(unit, dict) and isinstance(unit.get("work_id"), str):
            ids.append(unit["work_id"])
    duplicate_ids = sorted({item for item in ids if ids.count(item) > 1})
    if duplicate_ids:
        errors.append(f"ledger has duplicate work ids: {', '.join(duplicate_ids)}")
    known = set(ids)
    status_by_id = {
        unit.get("work_id"): unit.get("status")
        for unit in units
        if isinstance(unit, dict) and isinstance(unit.get("work_id"), str)
    }
    graph: dict[str, list[str]] = {}
    for unit in units:
        if not isinstance(unit, dict) or unit.get("work_id") not in known:
            continue
        dependencies = [item for item in unit.get("dependencies", []) if isinstance(item, str)]
        graph[unit["work_id"]] = dependencies
        missing = sorted(set(dependencies) - known)
        if missing:
            errors.append(f"{unit['work_id']} has missing dependencies: {', '.join(missing)}")
        incomplete = sorted(dependency for dependency in dependencies if status_by_id.get(dependency) != "complete")
        if unit.get("status") in {"ready", "active", "review", "verified", "complete"} and incomplete:
            errors.append(f"{unit['work_id']} is {unit.get('status')} with incomplete dependencies: {', '.join(incomplete)}")
        if unit.get("status") == "ready" and any(
            blocker.get("state") == "open" for blocker in unit.get("blockers", []) if isinstance(blocker, dict)
        ):
            errors.append(f"{unit['work_id']} is ready with an open blocker")
    cycle = _find_cycle(graph)
    if cycle:
        errors.append(f"ledger dependency cycle: {' -> '.join(cycle)}")
    extensions = data.get("extensions")
    if not isinstance(extensions, dict):
        errors.append("ledger.extensions must be an object")
    elif any(not EXTENSION_RE.match(key) for key in extensions):
        errors.append("ledger.extensions keys must be namespaced")
    if not isinstance(data.get("evidence_refs"), list) or not all(
        isinstance(item, str) and item for item in data.get("evidence_refs", [])
    ):
        errors.append("ledger.evidence_refs must be a list of non-empty strings")
    return errors


def ready_units(ledger: dict[str, Any]) -> list[dict[str, Any]]:
    units = ledger.get("work_units", [])
    by_id = {unit.get("work_id"): unit for unit in units if isinstance(unit, dict)}
    ready: list[dict[str, Any]] = []
    for unit in units:
        if not isinstance(unit, dict) or unit.get("status") not in {"planned", "ready", "replanned"}:
            continue
        open_blockers = any(item.get("state") == "open" for item in unit.get("blockers", []) if isinstance(item, dict))
        dependencies_done = all(by_id.get(dep, {}).get("status") == "complete" for dep in unit.get("dependencies", []))
        if not open_blockers and dependencies_done:
            ready.append(unit)
    return ready


def select_next_unit(document: dict[str, Any]) -> dict[str, Any] | None:
    if "work_units" not in document:
        return None if document.get("status") == "complete" else document
    ready = ready_units(document)
    if ready:
        return ready[0]
    for status in ("active", "review", "blocked", "verified", "replanned", "planned", "ready"):
        for unit in document.get("work_units", []):
            if isinstance(unit, dict) and unit.get("status") == status:
                return unit
    return None


def new_unit(args: argparse.Namespace) -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "work_id": args.work_id,
        "objective": args.objective,
        "scope": {"workspaces": args.workspace, "includes": [], "excludes": []},
        "authority": {
            "read": "allowed",
            "write": args.write_authority,
            "external": "unknown",
            "live": "unknown",
            "destructive": "approval-required",
            "privileged": "unknown",
            "commit": "unknown",
            "push": "unknown",
            "approvals": {
                "write": "not-requested",
                "external": "not-requested",
                "live": "not-requested",
                "destructive": "not-requested",
                "privileged": "not-requested",
                "commit": "not-requested",
                "push": "not-requested",
            },
            "approval_state": "not-requested",
        },
        "owner": args.owner,
        "status": "planned",
        "dependencies": [],
        "acceptance_gates": [],
        "deliverables": [],
        "evidence_refs": [],
        "blockers": [],
        "next_action": {"action": "Define acceptance gates", "owner": args.owner, "command": None, "requires_approval": False},
        "extensions": {},
    }


def command_validate(args: argparse.Namespace) -> int:
    try:
        data = load_json(args.path)
    except (OSError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    errors = validate_artifact(data, args.extension_schema, args.extension_registry)
    if args.json:
        print(json.dumps({"valid": not errors, "errors": errors}, indent=2))
    else:
        for error in errors:
            print(f"ERROR: {error}")
        print("Valid work-unit document." if not errors else f"Invalid work-unit document: {len(errors)} error(s).")
    return 0 if not errors else 1


def command_init(args: argparse.Namespace) -> int:
    unit = new_unit(args)
    errors = validate_unit(unit)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 2
    write_json(args.output, unit)
    return 0


def command_init_ledger(args: argparse.Namespace) -> int:
    ledger = {
        "contract_version": CONTRACT_VERSION,
        "ledger_id": args.ledger_id,
        "objective": args.objective,
        "work_units": [],
        "evidence_refs": [],
        "extensions": {},
    }
    errors = validate_document(ledger)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 2
    write_json(args.output, ledger)
    return 0


def command_add(args: argparse.Namespace) -> int:
    ledger = load_json(args.ledger)
    unit = load_json(args.unit)
    errors = validate_artifact(ledger, args.extension_schema, args.extension_registry)
    errors.extend(validate_artifact(unit, args.extension_schema, args.extension_registry))
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    if any(item.get("work_id") == unit["work_id"] for item in ledger["work_units"]):
        print(f"ERROR: duplicate work id {unit['work_id']}", file=sys.stderr)
        return 1
    ledger["work_units"].append(unit)
    errors = validate_artifact(ledger, args.extension_schema, args.extension_registry)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    write_json(args.ledger, ledger)
    return 0


def command_update(args: argparse.Namespace) -> int:
    document = load_json(args.path)
    patch = load_json(args.patch)
    if not isinstance(patch, dict):
        print("ERROR: update patch must be a JSON object", file=sys.stderr)
        return 1
    allowed = {
        "objective", "scope", "authority", "owner", "dependencies", "acceptance_gates",
        "deliverables", "evidence_refs", "blockers", "next_action", "extensions",
    }
    unexpected = sorted(set(patch) - allowed)
    if unexpected:
        print(f"ERROR: update patch has unsupported fields: {', '.join(unexpected)}", file=sys.stderr)
        return 1
    units = document.get("work_units", [document]) if isinstance(document, dict) else []
    unit = next((item for item in units if isinstance(item, dict) and item.get("work_id") == args.work_id), None)
    if unit is None:
        print(f"ERROR: unknown work id {args.work_id}", file=sys.stderr)
        return 1
    unit.update(patch)
    errors = validate_artifact(document, args.extension_schema, args.extension_registry)
    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors), file=sys.stderr)
        return 1
    write_json(args.path, document)
    return 0


def command_transition(args: argparse.Namespace) -> int:
    document = load_json(args.path)
    units = document.get("work_units", [document]) if isinstance(document, dict) else []
    unit = next((item for item in units if isinstance(item, dict) and item.get("work_id") == args.work_id), None)
    if unit is None:
        print(f"ERROR: unknown work id {args.work_id}", file=sys.stderr)
        return 1
    before = unit.get("status")
    if args.to not in TRANSITIONS.get(before, set()):
        print(f"ERROR: transition {before} -> {args.to} is not allowed", file=sys.stderr)
        return 1
    if args.next_action:
        unit["next_action"]["action"] = args.next_action
    unit["status"] = args.to
    errors = validate_artifact(document, args.extension_schema, args.extension_registry)
    if errors:
        unit["status"] = before
        print("\n".join(f"ERROR: {error}" for error in errors), file=sys.stderr)
        return 1
    write_json(args.path, document)
    return 0


def command_ready(args: argparse.Namespace) -> int:
    ledger = load_json(args.path)
    errors = validate_artifact(ledger, args.extension_schema, args.extension_registry)
    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors), file=sys.stderr)
        return 1
    units = ready_units(ledger)
    if args.mark:
        stale = [unit["work_id"] for unit in units if WAITING_ACTION_RE.match(str(unit.get("next_action", {}).get("action", "")))]
        if stale:
            print(f"ERROR: replace dependency-waiting next actions before marking ready: {', '.join(stale)}", file=sys.stderr)
            return 1
        for unit in units:
            if unit["status"] in {"planned", "replanned"}:
                unit["status"] = "ready"
        write_json(args.path, ledger)
    print(json.dumps([unit["work_id"] for unit in units], indent=2))
    return 0


def command_next(args: argparse.Namespace) -> int:
    document = load_json(args.path)
    errors = validate_artifact(document, args.extension_schema, args.extension_registry)
    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors), file=sys.stderr)
        return 1
    unit = select_next_unit(document)
    print(json.dumps(unit, indent=2) if unit else "null")
    return 0


def add_extension_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--extension-schema", action="append", default=[], metavar="NAMESPACE=PATH")
    parser.add_argument("--extension-registry", type=Path)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate = subparsers.add_parser("validate")
    validate.add_argument("path", type=Path)
    validate.add_argument("--json", action="store_true")
    validate.add_argument(
        "--extension-schema",
        action="append",
        default=[],
        metavar="NAMESPACE=PATH",
        help="Validate each occurrence of a namespaced extension against a bundled schema (repeatable).",
    )
    validate.add_argument(
        "--extension-registry",
        type=Path,
        help="Resolve all present extension namespaces from a registry; the source-family registry is discovered automatically.",
    )
    validate.set_defaults(func=command_validate)

    init = subparsers.add_parser("init")
    init.add_argument("--work-id", required=True)
    init.add_argument("--objective", required=True)
    init.add_argument("--workspace", action="append", required=True)
    init.add_argument("--owner", default="primary")
    init.add_argument("--write-authority", choices=sorted(AUTHORITY_STATES), default="unknown")
    init.add_argument("--output", type=Path, required=True)
    init.set_defaults(func=command_init)

    init_ledger = subparsers.add_parser("init-ledger")
    init_ledger.add_argument("--ledger-id", required=True)
    init_ledger.add_argument("--objective", required=True)
    init_ledger.add_argument("--output", type=Path, required=True)
    init_ledger.set_defaults(func=command_init_ledger)

    add = subparsers.add_parser("add")
    add.add_argument("--ledger", type=Path, required=True)
    add.add_argument("--unit", type=Path, required=True)
    add_extension_arguments(add)
    add.set_defaults(func=command_add)

    update = subparsers.add_parser("update")
    update.add_argument("path", type=Path)
    update.add_argument("--work-id", required=True)
    update.add_argument("--patch", type=Path, required=True)
    add_extension_arguments(update)
    update.set_defaults(func=command_update)

    transition = subparsers.add_parser("transition")
    transition.add_argument("path", type=Path)
    transition.add_argument("--work-id", required=True)
    transition.add_argument("--to", choices=sorted(STATUSES), required=True)
    transition.add_argument("--next-action")
    add_extension_arguments(transition)
    transition.set_defaults(func=command_transition)

    ready = subparsers.add_parser("ready")
    ready.add_argument("path", type=Path)
    ready.add_argument("--mark", action="store_true")
    add_extension_arguments(ready)
    ready.set_defaults(func=command_ready)

    next_unit = subparsers.add_parser("next")
    next_unit.add_argument("path", type=Path)
    add_extension_arguments(next_unit)
    next_unit.set_defaults(func=command_next)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        return args.func(args)
    except (OSError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
