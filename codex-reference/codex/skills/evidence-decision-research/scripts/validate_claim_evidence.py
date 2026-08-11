#!/usr/bin/env python3
"""Validate claim-evidence-case v1 artifacts and completion gates."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


REQUIRED_FIELDS = {
    "contract_version",
    "case_id",
    "objective",
    "status",
    "as_of",
    "scope",
    "source_policy",
    "questions",
    "claims",
    "sources",
    "evidence_links",
    "counterevidence_checked",
    "unresolved",
    "conclusion",
    "extensions",
}
STATUSES = {"draft", "researching", "synthesizing", "complete", "blocked"}
CLAIM_STATUSES = {"proposed", "supported", "mixed", "unsupported", "refuted", "unknown"}
CONFIDENCE = {"high", "medium", "low", "none"}


def require_object(value: Any, label: str, errors: list[str]) -> dict[str, Any]:
    if not isinstance(value, dict):
        errors.append(f"{label} must be an object")
        return {}
    return value


def require_list(value: Any, label: str, errors: list[str]) -> list[Any]:
    if not isinstance(value, list):
        errors.append(f"{label} must be a list")
        return []
    return value


def nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def indexed_records(
    items: list[Any], label: str, required: set[str], errors: list[str]
) -> dict[str, dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    for index, item in enumerate(items):
        item_label = f"{label}[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{item_label} must be an object")
            continue
        missing = sorted(required - item.keys())
        if missing:
            errors.append(f"{item_label} missing fields: {', '.join(missing)}")
        record_id = item.get("id")
        if not nonempty(record_id):
            errors.append(f"{item_label}.id must be non-empty")
        elif record_id in records:
            errors.append(f"duplicate {label} id: {record_id}")
        else:
            records[record_id] = item
    return records


def validate(data: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["artifact root must be an object"]
    missing = sorted(REQUIRED_FIELDS - data.keys())
    if missing:
        errors.append(f"missing fields: {', '.join(missing)}")
    if data.get("contract_version") != "1.0.0":
        errors.append("contract_version must be 1.0.0")
    for field in ("case_id", "objective", "as_of"):
        if not nonempty(data.get(field)):
            errors.append(f"{field} must be non-empty")
    status = data.get("status")
    if status not in STATUSES:
        errors.append("status is invalid")

    scope = require_object(data.get("scope"), "scope", errors)
    for field in ("includes", "excludes", "constraints"):
        require_list(scope.get(field), f"scope.{field}", errors)

    policy = require_object(data.get("source_policy"), "source_policy", errors)
    if policy.get("primary") not in {"required-when-available", "preferred", "not-required"}:
        errors.append("source_policy.primary is invalid")
    if policy.get("freshness") not in {"required", "context-dependent", "not-required"}:
        errors.append("source_policy.freshness is invalid")
    exceptions = require_list(policy.get("exceptions"), "source_policy.exceptions", errors)

    questions = indexed_records(
        require_list(data.get("questions"), "questions", errors),
        "questions",
        {"id", "question", "scope", "status", "answer_claim_ids"},
        errors,
    )
    claims = indexed_records(
        require_list(data.get("claims"), "claims", errors),
        "claims",
        {
            "id",
            "statement",
            "status",
            "confidence",
            "materiality",
            "primary_evidence_required",
            "freshness_required",
        },
        errors,
    )
    sources = indexed_records(
        require_list(data.get("sources"), "sources", errors),
        "sources",
        {"id", "title", "locator", "source_type", "publisher", "retrieved_at", "freshness", "summary"},
        errors,
    )
    links = indexed_records(
        require_list(data.get("evidence_links"), "evidence_links", errors),
        "evidence_links",
        {"id", "claim_id", "source_id", "direction", "directness", "strength", "locator", "note"},
        errors,
    )
    unresolved = indexed_records(
        require_list(data.get("unresolved"), "unresolved", errors),
        "unresolved",
        {"id", "question", "impact", "next_check"},
        errors,
    )
    conclusion = require_object(data.get("conclusion"), "conclusion", errors)
    extensions = require_object(data.get("extensions"), "extensions", errors)
    if not isinstance(data.get("counterevidence_checked"), bool):
        errors.append("counterevidence_checked must be boolean")

    for question_id, question in questions.items():
        if not nonempty(question.get("question")) or not nonempty(question.get("scope")):
            errors.append(f"question {question_id} requires question and scope")
        if question.get("status") not in {"open", "answered", "disqualified", "blocked"}:
            errors.append(f"question {question_id} has invalid status")
        answer_ids = require_list(question.get("answer_claim_ids"), f"question {question_id}.answer_claim_ids", errors)
        for claim_id in answer_ids:
            if claim_id not in claims:
                errors.append(f"question {question_id} references unknown claim {claim_id!r}")
        if question.get("status") == "answered" and not answer_ids:
            errors.append(f"answered question {question_id} requires an answer claim")

    for claim_id, claim in claims.items():
        if not nonempty(claim.get("statement")):
            errors.append(f"claim {claim_id}.statement must be non-empty")
        if claim.get("status") not in CLAIM_STATUSES:
            errors.append(f"claim {claim_id} has invalid status")
        if claim.get("confidence") not in CONFIDENCE:
            errors.append(f"claim {claim_id} has invalid confidence")
        if claim.get("materiality") not in {"required", "decision-relevant", "context"}:
            errors.append(f"claim {claim_id} has invalid materiality")
        for field in ("primary_evidence_required", "freshness_required"):
            if not isinstance(claim.get(field), bool):
                errors.append(f"claim {claim_id}.{field} must be boolean")

    for source_id, source in sources.items():
        for field in ("title", "locator", "publisher", "retrieved_at", "summary"):
            if not nonempty(source.get(field)):
                errors.append(f"source {source_id}.{field} must be non-empty")
        if source.get("source_type") not in {"primary", "secondary", "observed"}:
            errors.append(f"source {source_id} has invalid source_type")
        if source.get("freshness") not in {"current", "stale", "unknown", "not-applicable"}:
            errors.append(f"source {source_id} has invalid freshness")

    links_by_claim: dict[str, list[dict[str, Any]]] = {claim_id: [] for claim_id in claims}
    linked_sources: set[str] = set()
    for link_id, link in links.items():
        claim_id = link.get("claim_id")
        source_id = link.get("source_id")
        if claim_id not in claims:
            errors.append(f"evidence link {link_id} references unknown claim {claim_id!r}")
        else:
            links_by_claim[claim_id].append(link)
        if source_id not in sources:
            errors.append(f"evidence link {link_id} references unknown source {source_id!r}")
        else:
            linked_sources.add(source_id)
        if link.get("direction") not in {"supports", "contradicts", "context"}:
            errors.append(f"evidence link {link_id} has invalid direction")
        if link.get("directness") not in {"direct", "inferred"}:
            errors.append(f"evidence link {link_id} has invalid directness")
        if link.get("strength") not in {"strong", "moderate", "weak"}:
            errors.append(f"evidence link {link_id} has invalid strength")
        for field in ("locator", "note"):
            if not nonempty(link.get(field)):
                errors.append(f"evidence link {link_id}.{field} must be non-empty")

    exception_gates: set[tuple[str, str]] = set()
    for index, exception in enumerate(exceptions):
        if not isinstance(exception, dict):
            errors.append(f"source_policy.exceptions[{index}] must be an object")
            continue
        claim_id = exception.get("claim_id")
        gate = exception.get("gate")
        if claim_id not in claims:
            errors.append(f"source policy exception references unknown claim {claim_id!r}")
        if gate not in {"primary", "freshness"}:
            errors.append(f"source policy exception for {claim_id!r} has invalid gate")
        if not nonempty(exception.get("reason")):
            errors.append(f"source policy exception for {claim_id!r} requires a reason")
        if claim_id in claims and gate in {"primary", "freshness"}:
            exception_gates.add((claim_id, gate))

    for unresolved_id, item in unresolved.items():
        if not nonempty(item.get("question")) or not nonempty(item.get("next_check")):
            errors.append(f"unresolved {unresolved_id} requires question and next_check")
        if item.get("impact") not in {"blocking", "material", "minor"}:
            errors.append(f"unresolved {unresolved_id} has invalid impact")

    if conclusion.get("status") not in {"pending", "recommendation", "no-decision", "blocked", "not-applicable"}:
        errors.append("conclusion.status is invalid")
    if conclusion.get("confidence") not in CONFIDENCE:
        errors.append("conclusion.confidence is invalid")
    for field in ("summary", "decision_impact"):
        if not isinstance(conclusion.get(field), str):
            errors.append(f"conclusion.{field} must be a string")
    rationale_ids = require_list(conclusion.get("rationale_claim_ids"), "conclusion.rationale_claim_ids", errors)
    for claim_id in rationale_ids:
        if claim_id not in claims:
            errors.append(f"conclusion references unknown claim {claim_id!r}")

    validate_decision_extension(extensions.get("evidence-review.decision"), claims, conclusion, errors)
    validate_review_extension(extensions.get("evidence-review.review"), claims, links, errors)
    validate_discovery_extension(extensions.get("evidence-review.discovery"), claims, errors)

    if status == "complete":
        if not questions:
            errors.append("status complete requires at least one research question")
        if not claims:
            errors.append("status complete requires at least one claim")
        if any(question.get("status") in {"open", "blocked"} for question in questions.values()):
            errors.append("status complete forbids open or blocked questions")
        if data.get("counterevidence_checked") is not True:
            errors.append("status complete requires counterevidence_checked=true")
        if conclusion.get("status") in {None, "pending", "blocked"}:
            errors.append("status complete requires a non-pending, non-blocked conclusion")
        if not nonempty(conclusion.get("summary")) or not nonempty(conclusion.get("decision_impact")):
            errors.append("status complete requires conclusion summary and decision_impact")
        if conclusion.get("status") == "recommendation" and not rationale_ids:
            errors.append("a completed recommendation requires rationale claims")
        if any(item.get("impact") == "blocking" for item in unresolved.values()):
            errors.append("status complete forbids blocking unresolved items")
        for source_id in sources:
            if source_id not in linked_sources:
                errors.append(f"status complete forbids unlinked source {source_id}")
        for claim_id, claim in claims.items():
            claim_links = links_by_claim.get(claim_id, [])
            if claim.get("status") == "proposed":
                errors.append(f"status complete forbids proposed claim {claim_id}")
            if claim.get("materiality") in {"required", "decision-relevant"} and not claim_links:
                errors.append(f"material claim {claim_id} requires evidence")
            decisive_links = [link for link in claim_links if link.get("direction") in {"supports", "contradicts"}]
            if claim.get("primary_evidence_required") and (claim_id, "primary") not in exception_gates:
                if not any(sources.get(link.get("source_id"), {}).get("source_type") in {"primary", "observed"} for link in decisive_links):
                    errors.append(f"claim {claim_id} requires primary or observed evidence")
            if claim.get("freshness_required") and (claim_id, "freshness") not in exception_gates:
                if not any(sources.get(link.get("source_id"), {}).get("freshness") == "current" for link in decisive_links):
                    errors.append(f"claim {claim_id} requires current evidence")
    return errors


def validate_decision_extension(
    value: Any, claims: dict[str, dict[str, Any]], conclusion: dict[str, Any], errors: list[str]
) -> None:
    if value is None:
        return
    extension = require_object(value, "extensions.evidence-review.decision", errors)
    options = indexed_records(
        require_list(extension.get("options"), "decision.options", errors),
        "decision.options",
        {"id", "label", "claim_ids", "disqualified"},
        errors,
    )
    for option_id, option in options.items():
        if not nonempty(option.get("label")) or not isinstance(option.get("disqualified"), bool):
            errors.append(f"decision option {option_id} requires label and boolean disqualified")
        for claim_id in require_list(option.get("claim_ids"), f"decision option {option_id}.claim_ids", errors):
            if claim_id not in claims:
                errors.append(f"decision option {option_id} references unknown claim {claim_id!r}")
    selected = extension.get("selected_option_id")
    if selected is not None and selected not in options:
        errors.append(f"decision selected_option_id references unknown option {selected!r}")
    if selected in options and options[selected].get("disqualified") is True:
        errors.append("decision selected option cannot be disqualified")
    if conclusion.get("status") == "recommendation" and not selected:
        errors.append("decision recommendation requires selected_option_id")


def validate_review_extension(
    value: Any, claims: dict[str, dict[str, Any]], links: dict[str, dict[str, Any]], errors: list[str]
) -> None:
    if value is None:
        return
    extension = require_object(value, "extensions.evidence-review.review", errors)
    findings = indexed_records(
        require_list(extension.get("findings"), "review.findings", errors),
        "review.findings",
        {"id", "claim_id", "disposition", "action", "evidence_link_ids", "validation_refs"},
        errors,
    )
    for finding_id, finding in findings.items():
        if finding.get("claim_id") not in claims:
            errors.append(f"review finding {finding_id} references unknown claim {finding.get('claim_id')!r}")
        if finding.get("disposition") not in {"valid", "stale", "intentional", "duplicate", "unclear"}:
            errors.append(f"review finding {finding_id} has invalid disposition")
        if finding.get("action") not in {"fixed", "fix-recommended", "skipped", "deferred", "response-drafted", "no-change"}:
            errors.append(f"review finding {finding_id} has invalid action")
        link_ids = require_list(finding.get("evidence_link_ids"), f"review finding {finding_id}.evidence_link_ids", errors)
        if not link_ids:
            errors.append(f"review finding {finding_id} requires evidence links")
        for link_id in link_ids:
            if link_id not in links:
                errors.append(f"review finding {finding_id} references unknown evidence link {link_id!r}")
        validation_refs = require_list(finding.get("validation_refs"), f"review finding {finding_id}.validation_refs", errors)
        if finding.get("action") == "fixed" and not validation_refs:
            errors.append(f"fixed review finding {finding_id} requires validation_refs")


def validate_discovery_extension(value: Any, claims: dict[str, dict[str, Any]], errors: list[str]) -> None:
    if value is None:
        return
    extension = require_object(value, "extensions.evidence-review.discovery", errors)
    constraints = indexed_records(
        require_list(extension.get("constraints"), "discovery.constraints", errors),
        "discovery.constraints",
        {"id", "statement", "priority"},
        errors,
    )
    hard_ids = {item_id for item_id, item in constraints.items() if item.get("priority") == "hard"}
    for constraint_id, constraint in constraints.items():
        if not nonempty(constraint.get("statement")):
            errors.append(f"discovery constraint {constraint_id}.statement must be non-empty")
        if constraint.get("priority") not in {"hard", "preference"}:
            errors.append(f"discovery constraint {constraint_id} has invalid priority")
    candidates = indexed_records(
        require_list(extension.get("candidates"), "discovery.candidates", errors),
        "discovery.candidates",
        {"id", "name", "locator", "qualification", "checked_at", "constraint_results"},
        errors,
    )
    for candidate_id, candidate in candidates.items():
        for field in ("name", "locator", "checked_at"):
            if not nonempty(candidate.get(field)):
                errors.append(f"discovery candidate {candidate_id}.{field} must be non-empty")
        if candidate.get("qualification") not in {"qualifies", "rejected", "unknown"}:
            errors.append(f"discovery candidate {candidate_id} has invalid qualification")
        results = require_list(candidate.get("constraint_results"), f"candidate {candidate_id}.constraint_results", errors)
        seen: dict[str, str] = {}
        for index, result in enumerate(results):
            if not isinstance(result, dict):
                errors.append(f"candidate {candidate_id}.constraint_results[{index}] must be an object")
                continue
            constraint_id = result.get("constraint_id")
            if constraint_id not in constraints:
                errors.append(f"candidate {candidate_id} references unknown constraint {constraint_id!r}")
            elif constraint_id in seen:
                errors.append(f"candidate {candidate_id} duplicates constraint result {constraint_id}")
            else:
                seen[constraint_id] = result.get("status")
            if result.get("status") not in {"pass", "fail", "unknown"}:
                errors.append(f"candidate {candidate_id} has invalid result for {constraint_id!r}")
            if result.get("claim_id") not in claims:
                errors.append(f"candidate {candidate_id} references unknown claim {result.get('claim_id')!r}")
        missing_hard = sorted(hard_ids - seen.keys())
        if missing_hard:
            errors.append(f"candidate {candidate_id} missing hard constraints: {', '.join(missing_hard)}")
        hard_states = [seen.get(constraint_id) for constraint_id in hard_ids]
        if candidate.get("qualification") == "qualifies" and any(state != "pass" for state in hard_states):
            errors.append(f"qualifying candidate {candidate_id} must pass every hard constraint")
        if candidate.get("qualification") == "rejected" and "fail" not in hard_states:
            errors.append(f"rejected candidate {candidate_id} requires a failed hard constraint")
        if candidate.get("qualification") == "unknown":
            if "fail" in hard_states or "unknown" not in hard_states:
                errors.append(f"unknown candidate {candidate_id} requires no hard failure and at least one unknown")


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
            print("Claim-evidence artifact is valid.")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
