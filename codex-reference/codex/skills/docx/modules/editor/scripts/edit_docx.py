#!/usr/bin/env python3
"""Surgical DOCX edits with audit log."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from docx import Document
from docx.text.paragraph import Paragraph
from docx.oxml import OxmlElement


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--docx", required=True)
    p.add_argument("--plan", required=False, help="optional edit plan json")
    p.add_argument("--out", required=True)
    p.add_argument("--json", action="store_true")
    p.add_argument("--strict", action="store_true")
    return p.parse_args()


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip().lower()


def paragraph_style_name(paragraph: Paragraph) -> str:
    try:
        return paragraph.style.name or ""
    except Exception:
        return ""


def heading_level(paragraph: Paragraph) -> Optional[int]:
    match = re.match(r"Heading\s+(\d+)$", paragraph_style_name(paragraph), re.IGNORECASE)
    return int(match.group(1)) if match else None


def find_heading_bounds(document: Document, target: str) -> Optional[Tuple[int, int, int]]:
    wanted = normalize_text(target)
    if not wanted:
        return None

    paragraphs = document.paragraphs
    for index, paragraph in enumerate(paragraphs):
        level = heading_level(paragraph)
        if level is None:
            continue
        text = normalize_text(paragraph.text)
        if text == wanted or wanted in text:
            end = len(paragraphs)
            for next_index in range(index + 1, len(paragraphs)):
                next_level = heading_level(paragraphs[next_index])
                if next_level is not None and next_level <= level:
                    end = next_index
                    break
            return index, end, level
    return None


def scoped_paragraphs(document: Document, target: str) -> Tuple[List[Tuple[int, Paragraph]], str]:
    paragraphs = list(enumerate(document.paragraphs))
    if not target:
        return paragraphs, "document"

    bounds = find_heading_bounds(document, target)
    if bounds:
        start, end, _level = bounds
        return paragraphs[start + 1:end], "heading_section"

    wanted = normalize_text(target)
    matches = [(index, paragraph) for index, paragraph in paragraphs if wanted in normalize_text(paragraph.text)]
    return matches, "target_paragraph"


def insert_paragraph_after(paragraph: Paragraph, text: str = "") -> Paragraph:
    new_element = OxmlElement("w:p")
    paragraph._p.addnext(new_element)
    new_paragraph = Paragraph(new_element, paragraph._parent)
    if text:
        new_paragraph.add_run(text)
    return new_paragraph


def remove_paragraph(paragraph: Paragraph) -> None:
    element = paragraph._element
    parent = element.getparent()
    if parent is not None:
        parent.remove(element)


def apply_edit_replace_text(document: Document, item: Dict[str, Any]) -> Dict[str, Any]:
    target = item.get("target", "")
    before = item.get("before", "")
    after = item.get("after", "")
    if not before:
        return {
            "action": "replace_text",
            "target": target,
            "before": before,
            "after": after,
            "result": "skipped",
            "reason": "missing before pattern",
        }

    count = 0
    matched: List[Dict[str, Any]] = []
    candidates, scope = scoped_paragraphs(document, target)

    for index, paragraph in candidates:
        old_text = paragraph.text
        replacements = old_text.count(before)
        if not replacements:
            continue
        new_text = old_text.replace(before, after)
        paragraph.text = new_text
        count += replacements
        matched.append({
            "paragraph_index": index,
            "replacements": replacements,
            "before_text": old_text,
            "after_text": new_text,
        })

    return {
        "action": "replace_text",
        "target": target,
        "before": before,
        "after": after,
        "result": "applied" if count else "skipped",
        "reason": "" if count else "before pattern not found in scoped paragraphs",
        "count": count,
        "scope": scope,
        "matched_paragraphs": matched,
    }


def apply_edit_append(document: Document, item: Dict[str, Any]) -> Dict[str, Any]:
    target = item.get("target", "")
    after = item.get("after", "")
    paragraphs = document.paragraphs
    anchor: Optional[Paragraph] = None
    placement = "document_end"

    if target:
        bounds = find_heading_bounds(document, target)
        if bounds:
            start, _end, _level = bounds
            anchor = paragraphs[start]
            placement = "after_heading"
        else:
            wanted = normalize_text(target)
            for paragraph in paragraphs:
                if wanted in normalize_text(paragraph.text):
                    anchor = paragraph
                    placement = "after_target"
                    break

    if anchor is not None:
        paragraph = insert_paragraph_after(anchor, after)
    else:
        paragraph = document.add_paragraph(after)
        if target:
            placement = "document_end_target_not_found"

    return {
        "action": "append",
        "target": target,
        "before": "",
        "after": after,
        "result": "applied" if paragraph is not None else "conflict",
        "placement": placement,
    }


def apply_edit_rewrite_section(document: Document, item: Dict[str, Any]) -> Dict[str, Any]:
    target = item.get("target", "")
    before = item.get("before", "")
    after = item.get("after", "")
    bounds = find_heading_bounds(document, target)
    if not bounds:
        return {
            "action": "rewrite_section",
            "target": target,
            "before": before,
            "after": after,
            "result": "skipped",
            "reason": "target heading not found",
        }

    start, end, level = bounds
    paragraphs = document.paragraphs
    heading = paragraphs[start]
    old_paragraphs = paragraphs[start + 1:end]
    old_text = "\n".join(p.text for p in old_paragraphs).strip()

    if before and before not in old_text:
        return {
            "action": "rewrite_section",
            "target": target,
            "before": before,
            "after": after,
            "result": "conflict",
            "reason": "before text not found inside target section",
            "heading_level": level,
            "old_text": old_text,
        }

    for paragraph in old_paragraphs:
        remove_paragraph(paragraph)

    anchor = heading
    new_lines = after.splitlines() or ([after] if after else [])
    inserted = 0
    for line in new_lines:
        anchor = insert_paragraph_after(anchor, line)
        inserted += 1

    return {
        "action": "rewrite_section",
        "target": target,
        "before": before or old_text,
        "after": after,
        "result": "applied",
        "heading_level": level,
        "removed_paragraphs": len(old_paragraphs),
        "inserted_paragraphs": inserted,
        "boundary": "until next same-or-higher-level heading",
        "limitation": "paragraph content only; tables and other non-paragraph blocks are not rewritten",
    }


def changelog_entry(edit: Dict[str, Any]) -> str:
    action = edit.get("action", "edit")
    target = edit.get("target") or "document"
    result = edit.get("result", "")
    if action == "replace_text":
        return f"replace_text {result}: {edit.get('count', 0)} replacement(s) in {target}"
    if action == "append":
        return f"append {result}: added paragraph at {edit.get('placement', 'document_end')} for {target}"
    if action == "rewrite_section":
        return f"rewrite_section {result}: rewrote section bounded by heading {target}"
    return f"{action} {result}: {target}"


def apply_edits(document: Document, plan: Dict[str, Any], strict: bool = False) -> list:
    edits = []
    for item in plan.get("edits", []):
        action = item.get("action")
        if action == "replace_text":
            edits.append(apply_edit_replace_text(document, item))
        elif action == "append":
            edits.append(apply_edit_append(document, item))
        elif action == "rewrite_section":
            edits.append(apply_edit_rewrite_section(document, item))
        else:
            edits.append({
                "action": action,
                "target": item.get("target", ""),
                "result": "conflict" if strict else "skipped",
                "reason": "unsupported_action_strict" if strict else "unsupported_action",
            })
    return edits


def status_for_edits(edits: List[Dict[str, Any]], strict: bool) -> str:
    results = {edit.get("result") for edit in edits}
    if "conflict" in results:
        return "fail" if strict else "warning"
    if "skipped" in results:
        return "fail" if strict else "warning"
    return "ok"


def main() -> int:
    args = parse_args()
    plan: Dict[str, Any] = {}
    if args.plan:
        plan = json.loads(Path(args.plan).read_text(encoding="utf-8"))

    doc = Document(args.docx)
    edits = apply_edits(doc, plan, strict=args.strict)
    status = status_for_edits(edits, args.strict)

    out = {
        "phase": "final",
        "target_docx": str(Path(args.docx).resolve()),
        "out": str(Path(args.out).resolve()),
        "status": status,
        "edits": edits,
        "changelog": [changelog_entry(e) for e in edits],
        "handoff": "docx-style-linter",
    }
    doc.save(args.out)

    if args.json:
        print(json.dumps(out, indent=2))
    else:
        print(out)
    return 0 if status in ("ok", "warning") else 1


if __name__ == "__main__":
    raise SystemExit(main())
