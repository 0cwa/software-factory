#!/usr/bin/env python3
"""Heuristic critic for DOCX visual quality with lint-aware gates."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Optional, Tuple

from docx import Document


DEFAULT_WORD_TABLES = {"Table Grid", "Normal Table"}


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--docx", required=True)
    p.add_argument("--lint", required=True)
    p.add_argument("--manifest", required=True)
    p.add_argument("--plan", required=False)
    p.add_argument("--json", action="store_true")
    return p.parse_args()


def load_json(path: Optional[str]) -> Dict[str, Any]:
    if not path:
        return {}
    return json.loads(Path(path).read_text(encoding="utf-8"))


def normalize_manifest(payload: Dict[str, Any]) -> Dict[str, Any]:
    return payload.get("style_manifest") if isinstance(payload.get("style_manifest"), dict) else payload


def normalize_plan(payload: Dict[str, Any]) -> Dict[str, Any]:
    return payload.get("document_plan") if isinstance(payload.get("document_plan"), dict) else payload


def clamp(value: float) -> float:
    return round(max(0.0, min(10.0, value)), 2)


def document_type(plan: Dict[str, Any], manifest: Dict[str, Any], lint: Dict[str, Any]) -> str:
    for item in lint.get("plan_checks", []) or []:
        if str(item).startswith("document_type="):
            return str(item).split("=", 1)[1]
    return str(plan.get("document_type") or plan.get("type") or manifest.get("document_type") or "general").lower()


def score_doc(doc: Document, manifest: Dict[str, Any], lint: Dict[str, Any], plan: Dict[str, Any]) -> Dict[str, float]:
    paras = [p for p in doc.paragraphs if p.text.strip()]
    headings = [p for p in paras if p.style and p.style.name.startswith("Heading")]
    title_like = [p for p in paras if p.style and p.style.name in {"Title", "Subtitle"}]
    normal_paras = [p for p in paras if p.style and p.style.name == "Normal"]
    longest = max((len(p.text) for p in paras), default=0)
    avg_len = mean([len(p.text) for p in paras]) if paras else 0
    direct_spacing = sum(1 for p in paras if p.paragraph_format.space_after is not None or p.paragraph_format.space_before is not None)
    tables = doc.tables
    styled_tables = [t for t in tables if t.style and t.style.name not in DEFAULT_WORD_TABLES]
    table_headered = 0
    for table in tables:
        if table.rows and " ".join(cell.text.strip() for cell in table.rows[0].cells).strip():
            table_headered += 1

    palette = manifest.get("palette") or manifest.get("color_palette") or manifest.get("colors") or {}
    has_palette = bool(palette)
    fallback_pressure = len(lint.get("fallback_warnings", []) or [])
    lint_warning_pressure = sum(len(lint.get(key, []) or []) for key in ["hierarchy_warnings", "spacing_warnings", "accessibility_warnings", "page_budget_warnings"])

    hierarchy = 4.0 + min(3.0, len(headings) * 0.9) + (1.2 if title_like else 0) - min(2.0, fallback_pressure * 0.4)
    spacing = 4.0 + min(3.0, direct_spacing / max(1, len(paras)) * 4) - min(2.5, len(lint.get("spacing_warnings", []) or []) * 1.2)
    readability = 8.5 - max(0, longest - 500) / 180 - max(0, avg_len - 180) / 90
    typography = 5.0 + (1.5 if title_like else 0) + (1.0 if headings else 0) - (2.0 if len(normal_paras) / max(1, len(paras)) > 0.8 else 0)
    layout = 6.0 - min(3.0, lint_warning_pressure * 0.55) + (0.8 if direct_spacing else -1.2)
    tables_score = 7.0
    if tables:
        tables_score = 4.5 + min(2.0, len(styled_tables)) + min(1.5, table_headered / max(1, len(tables)) * 1.5)
        if len(styled_tables) == 0:
            tables_score -= 1.5
    doc_fit = 6.5 - min(2.5, fallback_pressure * 0.6) - min(2.0, len(lint.get("page_budget_warnings", []) or []) * 1.2)
    if document_type(plan, manifest, lint) == "invoice":
        doc_fit += 0.8 if tables else -1.5
        doc_fit -= 1.0 if len(paras) > 35 else 0
    if has_palette:
        typography += 0.5
        layout += 0.4
    else:
        typography -= 0.8
        layout -= 0.6

    return {
        "hierarchy": clamp(hierarchy),
        "spacing": clamp(spacing),
        "readability": clamp(readability),
        "typography": clamp(typography),
        "layout": clamp(layout),
        "tables": clamp(tables_score),
        "document_fit": clamp(doc_fit),
    }


def finding(kind: str, category: str, message: str, action: str) -> Dict[str, str]:
    return {"type": kind, "category": category, "message": message, "action": action}


def build_findings(scores: Dict[str, float], lint: Dict[str, Any], doc: Document, manifest: Dict[str, Any], plan: Dict[str, Any]) -> List[Dict[str, str]]:
    findings: List[Dict[str, str]] = []
    lint_status = lint.get("status")
    if lint_status == "fail":
        findings.append(finding("major", "lint", "Linter reported failure; critic cannot approve visual quality.", "Fix lint remediation items and regenerate before critique."))
    elif lint_status == "warning":
        findings.append(finding("minor", "lint", "Linter reported warnings; final pass is blocked until warnings are routed.", "Resolve or explicitly accept lint warnings, then rerun critic."))

    if lint.get("fallback_warnings"):
        findings.append(finding("major" if lint_status == "fail" else "minor", "typography", "Renderer fallbacks remain in the package evidence.", "Map missing semantic tokens to real template styles or rerender in strict mode."))
    if scores["hierarchy"] < 6:
        findings.append(finding("major", "hierarchy", "Visual hierarchy is not strong enough for a polished DOCX.", "Increase title/H1/H2 contrast and map section tokens consistently."))
    if scores["spacing"] < 6:
        findings.append(finding("minor", "spacing", "Spacing rhythm is weak or too dependent on Word defaults.", "Apply manifest spacing tokens directly to body, heading, note, and table paragraphs."))
    if scores["typography"] < 6:
        findings.append(finding("major", "aesthetic", "Typography still reads too close to default Word output.", "Use manifest fonts, type scale, and palette accents more visibly."))
    if scores["tables"] < 6 and doc.tables:
        findings.append(finding("minor", "table", "Tables lack enough styling or header clarity.", "Apply header shading, bold header text, compact cell spacing, and a non-default table style."))
    if scores["document_fit"] < 6:
        findings.append(finding("major", "document_fit", "Layout does not fit the document type or page budget well enough.", "Adjust planner layout model and renderer compact/page-budget settings."))
    if not (manifest.get("palette") or manifest.get("color_palette") or manifest.get("colors")):
        findings.append(finding("minor", "aesthetic", "No palette evidence is available to verify brand expression.", "Provide manifest palette tokens and rerender visible accents."))
    return findings


def options_for(status: str) -> List[Dict[str, List[str] | str]]:
    if status == "pass":
        return []
    return [
        {
            "label": "Option A",
            "adjustments": [
                "Rerender in strict mode and eliminate all fallback styles",
                "Strengthen title, section heading, table header, and callout contrast",
            ],
        },
        {
            "label": "Option B",
            "adjustments": [
                "Revise the plan around a compact document-type layout model",
                "Reduce long paragraph clusters and add purposeful table or summary structure",
            ],
        },
    ]


def main() -> int:
    args = parse_args()
    lint = load_json(args.lint)
    manifest = normalize_manifest(load_json(args.manifest))
    plan = normalize_plan(load_json(args.plan)) if args.plan else {}
    doc = Document(args.docx)

    scoring = score_doc(doc, manifest, lint, plan)
    findings = build_findings(scoring, lint, doc, manifest, plan)
    scoring["overall"] = round(mean(scoring.values()), 2)

    major_count = len([f for f in findings if f["type"] == "major"])
    lint_status = lint.get("status")
    if lint_status == "fail" or scoring["overall"] < 4.5 or any(f["category"] == "lint" and f["type"] == "major" for f in findings):
        status = "reject"
    elif lint_status == "warning" or major_count or scoring["overall"] < 7.25 or findings:
        status = "revise"
    else:
        status = "pass"

    out = {
        "status": status,
        "scores": scoring,
        "findings": findings,
        "options": options_for(status),
        "next": {
            "retry_goal": "docx-style-renderer or docx-style-linter" if status != "pass" else "none",
            "final_delivery": "Export + final approval" if status == "pass" else "blocked until revision",
        },
        "file": str(Path(args.docx).resolve()),
    }

    if args.json:
        print(json.dumps(out, indent=2))
    else:
        print(out)
    return 0 if status == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
