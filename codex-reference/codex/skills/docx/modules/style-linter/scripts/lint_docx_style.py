#!/usr/bin/env python3
"""DOCX style linter for render, plan, and manifest conformance."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Set

from docx import Document


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--docx", required=True)
    p.add_argument("--manifest", required=True)
    p.add_argument("--plan", required=True)
    p.add_argument("--render-report", required=True)
    p.add_argument("--fail-on-warning", action="store_true", help="Return non-zero when lint status is warning.")
    return p.parse_args()


def load_json(path: str) -> Dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def normalize_manifest(payload: Dict[str, Any]) -> Dict[str, Any]:
    return payload.get("style_manifest") if isinstance(payload.get("style_manifest"), dict) else payload


def normalize_plan(payload: Dict[str, Any]) -> Dict[str, Any]:
    return payload.get("document_plan") if isinstance(payload.get("document_plan"), dict) else payload


def get_present_style_names(document: Document) -> Set[str]:
    return {s.name for s in document.styles}


def iter_sections(sections: Iterable[Dict[str, Any]]) -> Iterable[Dict[str, Any]]:
    for section in sections or []:
        yield section
        yield from iter_sections(section.get("blocks", []) or [])
        yield from iter_sections(section.get("children", []) or [])


def required_tokens(manifest: Dict[str, Any], plan: Dict[str, Any]) -> List[str]:
    hm = manifest.get("hierarchy_map", {})
    page = manifest.get("page_style", {})
    tokens = {v for v in hm.values() if v}
    tokens.update(v for v in [page.get("header"), page.get("footer"), page.get("section_break_rule")] if v)
    for section in iter_sections(plan.get("sections", []) or []):
        for key in ("style_token", "heading_style_token"):
            if section.get(key):
                tokens.add(section[key])
    return sorted(tokens)


def all_doc_text(doc: Document) -> str:
    parts = [p.text for p in doc.paragraphs]
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                parts.append(cell.text)
    return "\n".join(parts)


def document_type(plan: Dict[str, Any], manifest: Dict[str, Any], render_report: Dict[str, Any]) -> str:
    result = render_report.get("result", {}) if isinstance(render_report, dict) else {}
    return str(plan.get("document_type") or plan.get("type") or manifest.get("document_type") or result.get("document_type") or "general").lower()


def page_budget(plan: Dict[str, Any], manifest: Dict[str, Any], render_report: Dict[str, Any]) -> Dict[str, Any]:
    result = render_report.get("result", {}) if isinstance(render_report, dict) else {}
    raw = plan.get("page_budget") or manifest.get("page_budget") or result.get("page_budget") or {}
    if isinstance(raw, int):
        raw = {"target_pages": raw}
    return raw if isinstance(raw, dict) else {}


def validate_required_fields(plan: Dict[str, Any], manifest: Dict[str, Any], render_report: Dict[str, Any], text: str) -> List[str]:
    errors: List[str] = []
    if not str(plan.get("title") or "").strip():
        errors.append("Document plan is missing required title")
    if not plan.get("sections"):
        errors.append("Document plan has no sections")

    if document_type(plan, manifest, render_report) == "invoice":
        lowered = text.lower()
        required_groups = {
            "invoice identity": ["invoice", "tax invoice", "receipt"],
            "recipient/client": ["client", "customer", "bill to", "recipient", "sold to"],
            "date": ["date", "issued", "due"],
            "total/amount due": ["total", "amount due", "balance due", "grand total"],
        }
        for label, terms in required_groups.items():
            if not any(term in lowered for term in terms):
                errors.append(f"Invoice is missing required visible field cue: {label}")
    return errors


def heading_warnings(doc: Document, plan: Dict[str, Any], compact_invoice: bool) -> List[str]:
    warnings: List[str] = []
    prev_level = 0
    headings = []
    for p in doc.paragraphs:
        name = p.style.name if p.style else ""
        level = 0
        if name.startswith("Heading"):
            try:
                level = int(name.split()[1])
            except Exception:
                level = 1
        if level:
            headings.append(p.text.strip())
            if prev_level and level > prev_level + 1:
                warnings.append(f"Heading jump from H{prev_level} to H{level}: '{p.text[:60]}'")
            prev_level = level

    planned_top = len(plan.get("sections", []) or [])
    if planned_top >= 2 and len(headings) < planned_top and not compact_invoice:
        warnings.append(f"Rendered heading count {len(headings)} is lower than planned top-level sections {planned_top}")
    if planned_top < 2 and not compact_invoice:
        warnings.append("Plan has fewer than two sections; editorial density may be too thin")
    return warnings


def spacing_checks(doc: Document, compact_invoice: bool) -> tuple[List[str], List[str]]:
    warnings: List[str] = []
    summary: List[str] = []
    paras = [p for p in doc.paragraphs if p.text.strip()]
    if not paras:
        warnings.append("Document has no non-empty paragraphs to evaluate spacing")
        return warnings, summary

    zero_after = 0
    explicit_spacing = 0
    long_paras = 0
    for p in paras:
        fmt = p.paragraph_format
        if fmt.space_after is None and fmt.space_before is None:
            zero_after += 1
        else:
            explicit_spacing += 1
        if len(p.text) > (420 if compact_invoice else 650):
            long_paras += 1

    if explicit_spacing == 0:
        warnings.append("No explicit paragraph spacing detected; output may look like default Word flow")
    if long_paras:
        warnings.append(f"{long_paras} long paragraph(s) reduce scanability")
    summary.append(f"Checked spacing on {len(paras)} non-empty paragraphs; {explicit_spacing} have direct spacing overrides")
    return warnings, summary


def accessibility_checks(doc: Document) -> tuple[List[str], List[str]]:
    warnings: List[str] = []
    summary: List[str] = []
    empty_runs = 0
    prev_empty = False
    all_caps_headings = 0
    table_header_issues = 0

    for p in doc.paragraphs:
        empty = not p.text.strip()
        if empty and prev_empty:
            empty_runs += 1
        prev_empty = empty
        if p.style and p.style.name.startswith("Heading"):
            text = p.text.strip()
            if len(text) > 8 and text.upper() == text:
                all_caps_headings += 1

    for table in doc.tables:
        if not table.rows:
            table_header_issues += 1
            continue
        header_text = " ".join(cell.text.strip() for cell in table.rows[0].cells).strip()
        if not header_text:
            table_header_issues += 1

    if empty_runs:
        warnings.append(f"Detected {empty_runs} repeated empty paragraph spacer(s)")
    if all_caps_headings > 2:
        warnings.append(f"Detected {all_caps_headings} all-caps headings; this can hurt readability")
    if table_header_issues:
        warnings.append(f"Detected {table_header_issues} table(s) without visible header text")
    summary.append(f"Checked {len(doc.paragraphs)} paragraphs and {len(doc.tables)} tables for accessibility signals")
    return warnings, summary


def page_budget_warnings(doc: Document, plan: Dict[str, Any], manifest: Dict[str, Any], render_report: Dict[str, Any]) -> List[str]:
    warnings: List[str] = []
    budget = page_budget(plan, manifest, render_report)
    target = budget.get("target_pages") or budget.get("max_pages") or budget.get("pages")
    if not target:
        return warnings
    try:
        target_pages = int(target)
    except (TypeError, ValueError):
        return [f"Page budget target is not numeric: {target}"]
    paras = [p for p in doc.paragraphs if p.text.strip()]
    table_rows = sum(len(t.rows) for t in doc.tables)
    chars = sum(len(p.text) for p in paras) + sum(len(cell.text) for table in doc.tables for row in table.rows for cell in row.cells)
    pressure = len(paras) * 0.08 + table_rows * 0.12 + chars / 3200
    if pressure > target_pages * 1.35:
        warnings.append(f"Content density estimate {pressure:.1f} pages may exceed target page budget {target_pages}")
    return warnings


def fallback_warnings(render_report: Dict[str, Any]) -> List[str]:
    result = render_report.get("result", {}) if isinstance(render_report, dict) else {}
    warnings = []
    warnings.extend(str(x) for x in result.get("warnings", []) or [])
    warnings.extend(f"Fallback style used: {x}" for x in result.get("fallback_styles_used", []) or [])
    warnings.extend(f"Unresolved style token: {x}" for x in result.get("unresolved_style_tokens", []) or [])
    return warnings


def lint_docx(docx_path: str, manifest_path: str, plan_path: str, render_report_path: str) -> Dict[str, Any]:
    manifest = normalize_manifest(load_json(manifest_path))
    plan = normalize_plan(load_json(plan_path))
    render_report = load_json(render_report_path)
    doc = Document(docx_path)
    present = get_present_style_names(doc)
    required = required_tokens(manifest, plan)
    missing = [t for t in required if t not in present]
    text = all_doc_text(doc)
    doc_type = document_type(plan, manifest, render_report)
    compact_invoice = doc_type == "invoice" and bool(page_budget(plan, manifest, render_report).get("compact_layout"))

    field_errors = validate_required_fields(plan, manifest, render_report, text)
    hierarchy = heading_warnings(doc, plan, compact_invoice)
    spacing_warnings, spacing_summary = spacing_checks(doc, compact_invoice)
    accessibility_warnings, accessibility_summary = accessibility_checks(doc)
    budget_warnings = page_budget_warnings(doc, plan, manifest, render_report)
    fallbacks = fallback_warnings(render_report)

    render_status = render_report.get("status", "missing") if isinstance(render_report, dict) else "missing"
    result = render_report.get("result", {}) if isinstance(render_report, dict) else {}
    strict_fallbacks = bool(result.get("strict") and result.get("unresolved_style_tokens"))

    fail_reasons: List[str] = []
    if render_status in {"fail", "missing"}:
        fail_reasons.append(f"Renderer status is {render_status}")
    if missing:
        fail_reasons.append("Required style token(s) missing from DOCX styles")
    if field_errors:
        fail_reasons.extend(field_errors)
    if strict_fallbacks:
        fail_reasons.append("Strict renderer reported unresolved style fallbacks")

    nonblocking = []
    nonblocking.extend(fallbacks)
    nonblocking.extend(hierarchy)
    nonblocking.extend(spacing_warnings)
    nonblocking.extend(accessibility_warnings)
    nonblocking.extend(budget_warnings)
    if render_status == "warning":
        nonblocking.append("Renderer status is warning")

    if fail_reasons:
        status = "fail"
    elif nonblocking:
        status = "warning"
    else:
        status = "ok"

    remediation = [f"Add or map required style token in template/manifest: {x}" for x in missing]
    remediation.extend(f"Resolve renderer fallback: {x}" for x in fallbacks)
    remediation.extend(f"Fix required field: {x}" for x in field_errors)
    remediation.extend(f"Address hierarchy issue: {x}" for x in hierarchy)
    remediation.extend(f"Address spacing issue: {x}" for x in spacing_warnings)
    remediation.extend(f"Address accessibility issue: {x}" for x in accessibility_warnings)
    remediation.extend(f"Address page budget issue: {x}" for x in budget_warnings)

    handoff = "docx-critic"
    if status != "ok":
        handoff = "docx-style-planner" if field_errors else "docx-style-renderer"

    return {
        "status": status,
        "file": str(Path(docx_path).resolve()),
        "required_style_coverage": {
            "required": len(required),
            "present": len([x for x in required if x in present]),
            "missing": missing,
        },
        "render_report_status": render_status,
        "fallback_warnings": fallbacks,
        "field_errors": field_errors,
        "hierarchy_warnings": hierarchy,
        "spacing_warnings": spacing_warnings,
        "spacing_summary": spacing_summary,
        "accessibility_warnings": accessibility_warnings,
        "accessibility_summary": accessibility_summary,
        "page_budget_warnings": budget_warnings,
        "plan_checks": [f"document_type={doc_type}", f"sections={len(plan.get('sections', []) or [])}"],
        "remediation": remediation,
        "recommend_handoff": handoff,
        "recommend_handoff_if_ok": "docx-critic",
    }


def main() -> int:
    args = parse_args()
    report = lint_docx(args.docx, args.manifest, args.plan, args.render_report)
    print(json.dumps(report, indent=2))
    if report["status"] == "fail" or (args.fail_on_warning and report["status"] == "warning"):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
