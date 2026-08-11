#!/usr/bin/env python3
"""Render DOCX from style plan and manifest JSON with explicit quality gates."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from docx import Document
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


CANONICAL_TYPE = {
    "hero": "Title",
    "section_intro": "Heading 1",
    "section_title": "Heading 1",
    "section_body": "Normal",
    "metric_block": "Heading 2",
    "callout_box": "Intense Quote",
    "insight_box": "Intense Quote",
    "kpi_callout": "Normal",
    "table_block": "Normal",
    "figure_block": "Normal",
    "quote_block": "Intense Quote",
    "appendix": "Heading 1",
    "code_snippet": "No Spacing",
    "note_box": "Intense Quote",
    "invoice_summary": "Normal",
    "invoice_line_items": "Normal",
    "payment_terms": "Normal",
    "tax_summary": "Normal",
}

ALIGNMENTS = {
    "left": WD_ALIGN_PARAGRAPH.LEFT,
    "center": WD_ALIGN_PARAGRAPH.CENTER,
    "centre": WD_ALIGN_PARAGRAPH.CENTER,
    "right": WD_ALIGN_PARAGRAPH.RIGHT,
    "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
}


def normalize_manifest(payload: Dict[str, Any]) -> Dict[str, Any]:
    if isinstance(payload.get("style_manifest"), dict):
        return payload["style_manifest"]
    return payload


def normalize_plan(payload: Dict[str, Any]) -> Dict[str, Any]:
    if isinstance(payload.get("document_plan"), dict):
        return payload["document_plan"]
    return payload


def _load_json(path: str) -> Dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def nested_get(data: Dict[str, Any], paths: Sequence[Sequence[str]], default: Any = None) -> Any:
    for path in paths:
        cur: Any = data
        for key in path:
            if not isinstance(cur, dict) or key not in cur:
                cur = None
                break
            cur = cur[key]
        if cur not in (None, "", [], {}):
            return cur
    return default


def parse_color(value: Any) -> Optional[RGBColor]:
    if not value:
        return None
    text = str(value).strip().lstrip("#")
    if len(text) == 3:
        text = "".join(ch * 2 for ch in text)
    if len(text) != 6:
        return None
    try:
        return RGBColor(int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16))
    except ValueError:
        return None


def color_hex(value: Any, default: str = "") -> str:
    if not value:
        return default
    text = str(value).strip().lstrip("#")
    if len(text) == 3:
        text = "".join(ch * 2 for ch in text)
    return text.upper() if len(text) == 6 else default


def palette_sources(manifest: Dict[str, Any]) -> List[Dict[str, Any]]:
    sources = []
    for key in ("palette", "color_palette", "colors"):
        value = manifest.get(key)
        if isinstance(value, dict):
            sources.append(value)
    return sources


def palette_value(manifest: Dict[str, Any], *names: str, default: str = "") -> str:
    for pal in palette_sources(manifest):
        for name in names:
            value = pal.get(name)
            if isinstance(value, dict):
                value = value.get("hex") or value.get("value")
            if value:
                return str(value)
    return default


def mm_to_inches(mm: Any, default_mm: float) -> float:
    try:
        return float(mm) / 25.4
    except (TypeError, ValueError):
        return default_mm / 25.4


def pt_value(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def document_type(plan: Dict[str, Any], manifest: Dict[str, Any]) -> str:
    return str(plan.get("document_type") or plan.get("type") or manifest.get("document_type") or "general").lower()


def page_budget(plan: Dict[str, Any], manifest: Dict[str, Any]) -> Dict[str, Any]:
    raw = plan.get("page_budget") or manifest.get("page_budget") or {}
    if isinstance(raw, int):
        raw = {"target_pages": raw}
    target = raw.get("target_pages") or raw.get("max_pages") or raw.get("pages")
    compact = bool(raw.get("compact_layout") or raw.get("compact") or manifest.get("compact_invoice_layout"))
    if document_type(plan, manifest) == "invoice" and target in (None, ""):
        target = 1
        compact = True
    return {"target_pages": target, "compact_layout": compact}


def existing_styles(document: Document) -> Set[str]:
    return {style.name for style in document.styles}


def style_exists(document: Document, style_name: str) -> bool:
    return style_name in existing_styles(document)


def token_to_style(
    document: Document,
    token: str,
    warnings: List[str],
    errors: List[str],
    fallback_styles_used: Set[str],
    unresolved_tokens: Set[str],
    strict: bool,
) -> str:
    token = token or "section_body"
    if token in existing_styles(document):
        return token
    fallback = CANONICAL_TYPE.get(token, "Normal")
    # Canonical fallbacks are deterministic and supported by policy; do not block strict
    # mode when they map to a concrete native style.
    if token in CANONICAL_TYPE and fallback in existing_styles(document):
        return fallback

    fallback_styles_used.add(f"{token}->{fallback}")
    unresolved_tokens.add(token)
    message = f"Style token '{token}' missing; used canonical fallback '{fallback}'"
    if strict:
        errors.append(message)
    else:
        warnings.append(message)
    return fallback if fallback in existing_styles(document) else "Normal"


def paragraph_spacing(manifest: Dict[str, Any], role: str, compact: bool) -> Tuple[float, float, float]:
    spacing = manifest.get("spacing", {})
    role_spacing = spacing.get(role, {}) if isinstance(spacing.get(role), dict) else {}
    before = role_spacing.get("before_pt", spacing.get(f"{role}_before_pt"))
    after = role_spacing.get("after_pt", spacing.get(f"{role}_after_pt"))
    line = role_spacing.get("line_spacing", spacing.get("line_spacing"))
    defaults = {
        "title": (0, 10, 1.05),
        "heading": (8, 4, 1.08),
        "body": (0, 6, 1.12),
        "note": (3, 4, 1.05),
        "table": (0, 2, 1.0),
    }
    d_before, d_after, d_line = defaults.get(role, defaults["body"])
    if compact:
        d_before = min(d_before, 4)
        d_after = min(d_after, 3)
        d_line = min(d_line, 1.03)
    return pt_value(before, d_before), pt_value(after, d_after), pt_value(line, d_line)


def apply_paragraph_format(paragraph, manifest: Dict[str, Any], role: str, align: Optional[str], compact: bool) -> None:
    before, after, line = paragraph_spacing(manifest, role, compact)
    fmt = paragraph.paragraph_format
    fmt.space_before = Pt(before)
    fmt.space_after = Pt(after)
    fmt.line_spacing = line
    alignment = align or nested_get(manifest, [["alignment", role], ["layout", f"{role}_alignment"]])
    if alignment:
        fmt.alignment = ALIGNMENTS.get(str(alignment).lower(), fmt.alignment)


def set_run_style(run, manifest: Dict[str, Any], role: str, size_pt: float, bold: bool = False) -> None:
    typo = manifest.get("typography", {})
    fonts = typo.get("font_family", {}) if isinstance(typo.get("font_family"), dict) else {}
    if role in {"title", "heading"}:
        font = fonts.get("heading") or typo.get("heading")
    else:
        font = fonts.get("body") or typo.get("body") or typo.get("fallback_body")
    font = font or typo.get("font_family")
    if font:
        run.font.name = str(font)
    run.font.size = Pt(size_pt)
    run.bold = bold
    color = None
    if role == "title":
        color = palette_value(manifest, "title", "heading", "primary_text", "text", default="")
    elif role == "heading":
        color = palette_value(manifest, "heading", "primary", "primary_text", "text", default="")
    elif role == "note":
        color = palette_value(manifest, "muted_text", "secondary_text", "text", default="")
    else:
        color = palette_value(manifest, "body", "primary_text", "text", default="")
    rgb = parse_color(color)
    if rgb:
        run.font.color.rgb = rgb


def add_paragraph(
    document: Document,
    text: Any,
    style_name: str,
    manifest: Dict[str, Any],
    role: str,
    compact: bool,
    bold: bool = False,
    align: Optional[str] = None,
    size_key: Optional[str] = None,
) -> None:
    typo = manifest.get("typography", {})
    scale = typo.get("type_scale", {}) if isinstance(typo.get("type_scale"), dict) else {}
    defaults = {"title": 26 if compact else 30, "heading": 14 if compact else 18, "body": 9.5 if compact else 11, "note": 8.5 if compact else 9}
    size = pt_value(scale.get(size_key or f"{role}_pt"), defaults.get(role, 11))
    paragraph = document.add_paragraph(style=style_name)
    run = paragraph.add_run(str(text or ""))
    set_run_style(run, manifest, role, size, bold=bold)
    apply_paragraph_format(paragraph, manifest, role, align, compact)


def shade_cell(cell, fill_hex: str) -> None:
    if not fill_hex:
        return
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill_hex)


def set_cell_border(cell, color: str = "CBD5E1", size: str = "6", edges: Sequence[str] = ("top", "left", "bottom", "right")) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for edge in edges:
        tag = "w:" + edge
        element = borders.find(qn(tag))
        if element is None:
            element = OxmlElement(tag)
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), size)
        element.set(qn("w:space"), "0")
        element.set(qn("w:color"), color)


def clear_cell_border(cell) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = "w:" + edge
        element = borders.find(qn(tag))
        if element is None:
            element = OxmlElement(tag)
            borders.append(element)
        element.set(qn("w:val"), "nil")


def set_cell_margins(cell, top: int = 70, start: int = 100, bottom: int = 70, end: int = 100) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    margins = tc_pr.first_child_found_in("w:tcMar")
    if margins is None:
        margins = OxmlElement("w:tcMar")
        tc_pr.append(margins)
    for key, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = margins.find(qn("w:" + key))
        if node is None:
            node = OxmlElement("w:" + key)
            margins.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_cell_width(cell, inches: float) -> None:
    cell.width = Inches(inches)
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_w = tc_pr.first_child_found_in("w:tcW")
    if tc_w is None:
        tc_w = OxmlElement("w:tcW")
        tc_pr.append(tc_w)
    tc_w.set(qn("w:w"), str(int(inches * 1440)))
    tc_w.set(qn("w:type"), "dxa")


def set_table_widths(table, widths: Sequence[float]) -> None:
    table.autofit = False
    for row in table.rows:
        for idx, cell in enumerate(row.cells):
            if idx < len(widths):
                set_cell_width(cell, widths[idx])


def best_table_style(document: Document, manifest: Dict[str, Any], warnings: List[str]) -> str:
    requested = nested_get(manifest, [["table", "style"], ["tables", "style"], ["table_style"]])
    candidates = [requested, "Light List Accent 1", "Light Shading Accent 1", "Medium List 1 Accent 1", "Table Grid"]
    for style in candidates:
        if style and style_exists(document, str(style)):
            return str(style)
    warnings.append("No styled table style found; used default Word table formatting")
    return "Table Grid"


def styled_table(document: Document, rows: int, cols: int, widths: Sequence[float], manifest: Dict[str, Any], warnings: List[str]):
    table = document.add_table(rows=rows, cols=cols)
    table.style = best_table_style(document, manifest, warnings)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_widths(table, widths)
    for row in table.rows:
        for cell in row.cells:
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    return table


def append_text(paragraph, text: Any, manifest: Dict[str, Any], role: str, size: float, color: str, bold: bool = False, all_caps: bool = False) -> None:
    run = paragraph.add_run(str(text or "").upper() if all_caps else str(text or ""))
    set_run_style(run, manifest, role, size, bold=bold)
    parsed = parse_color(color)
    if parsed:
        run.font.color.rgb = parsed
    run.font.all_caps = all_caps


def write_cell(
    cell,
    text: Any,
    manifest: Dict[str, Any],
    role: str = "body",
    size: float = 8.8,
    color: str = "",
    bold: bool = False,
    all_caps: bool = False,
    align: Optional[int] = None,
) -> None:
    cell.text = ""
    paragraph = cell.paragraphs[0]
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.space_after = Pt(0)
    paragraph.paragraph_format.line_spacing = 1.0
    if align is not None:
        paragraph.alignment = align
    lines = str(text or "").splitlines() or [""]
    for index, line in enumerate(lines):
        if index:
            paragraph.add_run().add_break()
        append_text(paragraph, line, manifest, role, size, color, bold=bold, all_caps=all_caps)


def label_value_cell(cell, label: str, value: Any, manifest: Dict[str, Any], fill: str, border: str, *, label_color: str, value_color: str) -> None:
    shade_cell(cell, fill)
    set_cell_border(cell, border, "6")
    set_cell_margins(cell, top=85, start=110, bottom=85, end=110)
    cell.text = ""
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(2)
    append_text(p, label, manifest, "heading", 7.4, label_color, bold=True, all_caps=True)
    p2 = cell.add_paragraph()
    p2.paragraph_format.space_before = Pt(0)
    p2.paragraph_format.space_after = Pt(0)
    p2.paragraph_format.line_spacing = 1.0
    for idx, line in enumerate(str(value or "").splitlines() or [""]):
        if idx:
            p2.add_run().add_break()
        append_text(p2, line, manifest, "body", 8.8, value_color)


def set_cell_text(cell, text: Any, manifest: Dict[str, Any], role: str, compact: bool, bold: bool = False) -> None:
    cell.text = ""
    paragraph = cell.paragraphs[0]
    run = paragraph.add_run(str(text or ""))
    size = 8.5 if compact else 9.5
    set_run_style(run, manifest, role, size, bold=bold)
    apply_paragraph_format(paragraph, manifest, "table", None, compact)


def table_rows(section: Dict[str, Any], cols: int) -> List[List[Any]]:
    if isinstance(section.get("items"), list):
        rows = []
        for item in section["items"]:
            if isinstance(item, dict):
                rows.append([item.get(key, "") for key in section.get("columns", item.keys())])
            elif isinstance(item, list):
                rows.append(item[:cols] + [""] * max(0, cols - len(item)))
            else:
                rows.append([item] + [""] * (cols - 1))
        return rows
    grid = section.get("grid")
    if isinstance(grid, dict):
        return [(grid.get(str(i)) or [""] * cols)[:cols] for i in range(len(grid))]
    if isinstance(grid, list):
        return [(row if isinstance(row, list) else [row])[:cols] + [""] * max(0, cols - len(row if isinstance(row, list) else [row])) for row in grid]
    count = int(section.get("rows") or 0)
    return [[""] * cols for _ in range(count)]


def add_table(document: Document, section: Dict[str, Any], manifest: Dict[str, Any], warnings: List[str], compact: bool) -> int:
    columns = section.get("columns") or section.get("headers") or []
    rows_from_data = table_rows(section, max(1, len(columns) or int(section.get("cols") or 2)))
    cols = max(1, int(section.get("cols") or len(columns) or (len(rows_from_data[0]) if rows_from_data else 2)))
    has_header = bool(columns)
    table = document.add_table(rows=len(rows_from_data) + (1 if has_header else 0), cols=cols)

    table_style = nested_get(manifest, [["table", "style"], ["tables", "style"], ["table_style"]])
    if table_style and table_style in existing_styles(document):
        table.style = table_style
    elif table_style:
        warnings.append(f"Table style '{table_style}' missing; left table with default Word table formatting")
    elif "Light List Accent 1" in existing_styles(document):
        table.style = "Light List Accent 1"
    else:
        warnings.append("No explicit table style supplied; used default Word table formatting")

    header_fill = color_hex(palette_value(manifest, "table_header_bg", "accent", "primary", default=""), "")
    header_text = parse_color(palette_value(manifest, "table_header_text", "background", default="FFFFFF"))
    body_fill = color_hex(palette_value(manifest, "table_body_bg", "surface", default=""), "")

    if has_header:
        for idx, cell in enumerate(table.rows[0].cells):
            set_cell_text(cell, columns[idx] if idx < len(columns) else "", manifest, "heading", compact, bold=True)
            if header_fill:
                shade_cell(cell, header_fill)
            if header_text:
                for run in cell.paragraphs[0].runs:
                    run.font.color.rgb = header_text

    start = 1 if has_header else 0
    for row_idx, row in enumerate(rows_from_data):
        cells = table.rows[start + row_idx].cells
        for col_idx, cell in enumerate(cells):
            set_cell_text(cell, row[col_idx] if col_idx < len(row) else "", manifest, "body", compact)
            if body_fill and row_idx % 2 == 0:
                shade_cell(cell, body_fill)
    return 1


def add_section(
    document: Document,
    section: Dict[str, Any],
    manifest: Dict[str, Any],
    warnings: List[str],
    errors: List[str],
    fallback_styles_used: Set[str],
    unresolved_tokens: Set[str],
    strict: bool,
    compact: bool,
) -> Dict[str, int]:
    counts = {"sections": 1, "blocks": 0}
    kind = section.get("type") or section.get("block_type") or "section_body"
    token = section.get("style_token") or ("table_block" if kind == "table_block" else "section_body")

    heading = section.get("heading") or section.get("title") or section.get("label")
    if heading:
        style = token_to_style(document, section.get("heading_style_token") or "section_title", warnings, errors, fallback_styles_used, unresolved_tokens, strict)
        add_paragraph(document, heading, style, manifest, "heading", compact, bold=True, size_key="h1_pt")
        counts["blocks"] += 1

    body = section.get("body") or section.get("content") or section.get("text")
    if body:
        style = token_to_style(document, token, warnings, errors, fallback_styles_used, unresolved_tokens, strict)
        add_paragraph(document, body, style, manifest, "body", compact, align=section.get("align"))
        counts["blocks"] += 1

    for note in section.get("notes", []) or []:
        style = token_to_style(document, "note_box", warnings, errors, fallback_styles_used, unresolved_tokens, strict)
        add_paragraph(document, note, style, manifest, "note", compact)
        counts["blocks"] += 1

    if kind == "table_block" or section.get("columns") or section.get("grid") or section.get("items"):
        counts["blocks"] += add_table(document, section, manifest, warnings, compact)

    for block in section.get("blocks", []) or []:
        child_counts = add_section(document, block, manifest, warnings, errors, fallback_styles_used, unresolved_tokens, strict, compact)
        counts["sections"] += child_counts["sections"]
        counts["blocks"] += child_counts["blocks"]

    for child in section.get("children", []) or []:
        child_counts = add_section(document, child, manifest, warnings, errors, fallback_styles_used, unresolved_tokens, strict, compact)
        counts["sections"] += child_counts["sections"]
        counts["blocks"] += child_counts["blocks"]

    return counts


def apply_page_setup(document: Document, manifest: Dict[str, Any], compact: bool) -> None:
    spacing = manifest.get("spacing", {})
    page = manifest.get("page_style", {})
    margin = spacing.get("page_margin_mm", page.get("margin_mm", 16 if compact else 25))
    top = spacing.get("page_margin_top_mm", margin)
    bottom = spacing.get("page_margin_bottom_mm", margin)
    left = spacing.get("page_margin_left_mm", margin)
    right = spacing.get("page_margin_right_mm", margin)
    for section in document.sections:
        section.top_margin = Inches(mm_to_inches(top, 16 if compact else 25))
        section.bottom_margin = Inches(mm_to_inches(bottom, 16 if compact else 25))
        section.left_margin = Inches(mm_to_inches(left, 16 if compact else 25))
        section.right_margin = Inches(mm_to_inches(right, 16 if compact else 25))


def apply_metadata(document: Document, plan: Dict[str, Any], manifest: Dict[str, Any]) -> None:
    document.core_properties.author = str(nested_get(manifest, [["metadata", "author"], ["brand_archetype", "name"]], "docx-renderer"))
    document.core_properties.title = str(plan.get("title") or "Generated document")
    document.core_properties.subject = f"type={document_type(plan, manifest)}"


def invoice_color(manifest: Dict[str, Any], *names: str, default: str) -> str:
    return color_hex(palette_value(manifest, *names, default=default), default).upper()


def normalized_key(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum())


def lookup_invoice_value(plan: Dict[str, Any], names: Sequence[str], default: str) -> str:
    containers = [
        plan.get("invoice"),
        plan.get("invoice_fields"),
        plan.get("metadata"),
        plan.get("fields"),
        plan.get("billing"),
        plan.get("payment"),
    ]
    wanted = {normalized_key(name) for name in names}
    for container in containers:
        if not isinstance(container, dict):
            continue
        normalized = {normalized_key(str(key)): value for key, value in container.items()}
        for key in wanted:
            value = normalized.get(key)
            if value not in (None, "", [], {}):
                return str(value)
    return default


def section_text(section: Dict[str, Any]) -> str:
    parts = []
    for key in ("body", "content", "text", "description", "value"):
        value = section.get(key)
        if value:
            parts.append(str(value))
    return "\n".join(parts)


def find_invoice_section(plan: Dict[str, Any], keywords: Sequence[str], types: Sequence[str] = ()) -> Optional[Dict[str, Any]]:
    wanted = [item.lower() for item in keywords]
    wanted_types = {item.lower() for item in types}
    for section in plan.get("sections", []) or []:
        kind = str(section.get("type") or section.get("block_type") or "").lower()
        if kind in wanted_types:
            return section
        haystack = " ".join(str(section.get(key) or "") for key in ("id", "label", "heading", "title", "type", "block_type")).lower()
        if any(word in haystack for word in wanted):
            return section
    return None


def party_value(plan: Dict[str, Any], role: str, default: str) -> str:
    parties = plan.get("parties")
    aliases = {
        "from": ("from", "supplier", "contractor", "seller", "issuer"),
        "bill_to": ("bill_to", "billto", "client", "customer", "buyer", "recipient"),
    }
    if isinstance(parties, dict):
        normalized = {normalized_key(str(key)): value for key, value in parties.items()}
        for alias in aliases[role]:
            value = normalized.get(normalized_key(alias))
            if value not in (None, "", [], {}):
                return "\n".join(str(item) for item in value) if isinstance(value, list) else str(value)
    section = find_invoice_section(plan, aliases[role])
    text = section_text(section) if section else ""
    if text:
        return text
    return default


def line_item_section(plan: Dict[str, Any]) -> Dict[str, Any]:
    section = find_invoice_section(plan, ["line", "item", "service", "work"], ["invoice_line_items"])
    if section:
        return section
    for candidate in plan.get("sections", []) or []:
        columns = candidate.get("columns") or candidate.get("headers")
        if columns and any("total" in str(col).lower() or "description" in str(col).lower() for col in columns):
            return candidate
    return {
        "columns": ["Date", "Technical Work", "Units", "Rate", "Line Total"],
        "items": [
            {
                "Date": "[YYYY-MM-DD]",
                "Technical Work": "[IT systems engineering / automation / support]",
                "Units": "[hours]",
                "Rate": "[currency] [rate]",
                "Line Total": "[currency] [amount]",
            }
        ],
    }


def payment_text(plan: Dict[str, Any]) -> str:
    section = find_invoice_section(plan, ["payment", "terms"], ["payment_terms"])
    if section and section_text(section):
        return section_text(section)
    method = lookup_invoice_value(plan, ["payment_method", "method"], "[bank transfer/card/other]")
    reference = lookup_invoice_value(plan, ["payment_reference", "reference", "po"], "[contract + PO]")
    terms = lookup_invoice_value(plan, ["payment_terms", "terms"], "[N]-day terms")
    return f"Method: {method}\nReference: {reference}\nTerms: {terms}\nTax: VAT/tax treatment to be confirmed before issuance"


def add_invoice_heading(document: Document, text: str, manifest: Dict[str, Any], color: str) -> None:
    paragraph = document.add_paragraph(style="Heading 1")
    paragraph.paragraph_format.space_before = Pt(9)
    paragraph.paragraph_format.space_after = Pt(4)
    append_text(paragraph, text, manifest, "heading", 9.5, color, bold=True)
    p_pr = paragraph._p.get_or_add_pPr()
    p_bdr = p_pr.find(qn("w:pBdr"))
    if p_bdr is None:
        p_bdr = OxmlElement("w:pBdr")
        p_pr.append(p_bdr)
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "8")
    bottom.set(qn("w:space"), "3")
    bottom.set(qn("w:color"), color)
    p_bdr.append(bottom)


def render_invoice(plan: Dict[str, Any], manifest: Dict[str, Any], output_path: Path, strict: bool = False) -> Dict[str, Any]:
    document = Document()
    warnings: List[str] = []
    budget = page_budget(plan, manifest)
    compact = bool(budget.get("compact_layout"))
    apply_metadata(document, plan, manifest)
    apply_page_setup(document, manifest, True)

    ink = invoice_color(manifest, "text", "ink", "primary_text", default="0F172A")
    muted = invoice_color(manifest, "muted", "muted_text", "secondary_text", default="64748B")
    panel = invoice_color(manifest, "surface", "panel", default="F8FAFC")
    line = invoice_color(manifest, "surface_variant", "line", default="CBD5E1")
    accent = invoice_color(manifest, "accent", "primary", "blue", default="2563EB")
    dark = invoice_color(manifest, "dark", "heading", default="111827")
    soft = invoice_color(manifest, "table_body_bg", "soft_blue", default="EAF2FF")

    title = str(plan.get("title") or "Technical Services Invoice")
    subtitle = lookup_invoice_value(plan, ["subtitle", "service_summary"], "IT systems work / automation / infrastructure support")
    total_due = lookup_invoice_value(plan, ["total_due", "amount_due", "balance_due", "total"], "[currency] [total_due]")

    header = styled_table(document, 1, 2, [4.9, 2.55], manifest, warnings)
    left, right = header.rows[0].cells
    for cell, fill in ((left, dark), (right, accent)):
        shade_cell(cell, fill)
        clear_cell_border(cell)
        set_cell_margins(cell, top=150, start=170, bottom=150, end=170)
    write_cell(left, "Technical Services\nInvoice", manifest, "title", 25, "FFFFFF", bold=True)
    write_cell(right, f"Total Due\n{total_due}", manifest, "heading", 14, "FFFFFF", bold=True, align=WD_ALIGN_PARAGRAPH.RIGHT)

    subtitle_p = document.add_paragraph()
    subtitle_p.paragraph_format.space_before = Pt(4)
    subtitle_p.paragraph_format.space_after = Pt(2)
    subtitle_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    append_text(subtitle_p, subtitle, manifest, "body", 8.2, muted)

    meta_values = [
        ("Invoice #", lookup_invoice_value(plan, ["invoice_number", "invoice_no", "number"], "[INV-####]")),
        ("Issue Date", lookup_invoice_value(plan, ["issue_date", "invoice_date", "date"], "[YYYY-MM-DD]")),
        ("Due Date", lookup_invoice_value(plan, ["due_date"], "[YYYY-MM-DD]")),
        ("Currency", lookup_invoice_value(plan, ["currency"], "[GBP/USD/EUR]")),
    ]
    meta = styled_table(document, 1, 4, [1.85, 1.85, 1.85, 1.9], manifest, warnings)
    for cell, (label, value) in zip(meta.rows[0].cells, meta_values):
        label_value_cell(cell, label, value, manifest, panel, line, label_color=muted, value_color=ink)

    add_invoice_heading(document, "Billing", manifest, accent)
    parties = styled_table(document, 1, 2, [3.66, 3.79], manifest, warnings)
    from_value = party_value(plan, "from", "[Contractor Legal Name]\n[Contractor Address]\n[Contractor Email]\n[Tax/VAT ID if applicable]")
    to_value = party_value(plan, "bill_to", "Basic Income Earth Network (BIEN)\n[BIEN finance-confirmed invoice address]\nbasicincome.org")
    label_value_cell(parties.rows[0].cells[0], "From", from_value, manifest, panel, line, label_color=muted, value_color=ink)
    label_value_cell(parties.rows[0].cells[1], "Bill To", to_value, manifest, soft, line, label_color=muted, value_color=ink)

    add_invoice_heading(document, "Services", manifest, accent)
    items_section = line_item_section(plan)
    columns = items_section.get("columns") or items_section.get("headers") or ["Date", "Technical Work", "Units", "Rate", "Line Total"]
    rows = table_rows(items_section, max(1, len(columns)))
    if not rows:
        rows = [["[YYYY-MM-DD]", "[service description]", "[hours]", "[currency] [rate]", "[currency] [amount]"]]
    widths = [1.05, 3.0, 0.9, 1.05, 1.45]
    if len(columns) != 5:
        widths = [7.45 / max(1, len(columns))] * len(columns)
    items = styled_table(document, len(rows) + 1, len(columns), widths, manifest, warnings)
    for idx, label in enumerate(columns):
        cell = items.rows[0].cells[idx]
        shade_cell(cell, dark)
        set_cell_border(cell, dark, "6")
        set_cell_margins(cell, top=85, start=85, bottom=85, end=85)
        write_cell(cell, label, manifest, "heading", 7.8, "FFFFFF", bold=True, all_caps=True)
    for row_idx, row in enumerate(rows, start=1):
        for col_idx, value in enumerate(row):
            cell = items.rows[row_idx].cells[col_idx]
            shade_cell(cell, "FFFFFF" if row_idx % 2 else panel)
            set_cell_border(cell, line, "4")
            set_cell_margins(cell, top=80, start=85, bottom=80, end=85)
            align = WD_ALIGN_PARAGRAPH.RIGHT if col_idx >= max(0, len(columns) - 3) else None
            write_cell(cell, value, manifest, "body", 8.6, ink, align=align)

    add_invoice_heading(document, "Payment", manifest, accent)
    pay = styled_table(document, 1, 2, [4.25, 3.2], manifest, warnings)
    payment_cell, totals_cell = pay.rows[0].cells
    label_value_cell(payment_cell, "Payment Details", payment_text(plan), manifest, panel, line, label_color=muted, value_color=ink)
    shade_cell(totals_cell, soft)
    set_cell_border(totals_cell, accent, "10")
    set_cell_margins(totals_cell, top=115, start=150, bottom=115, end=150)
    totals = [
        ("Subtotal", lookup_invoice_value(plan, ["subtotal"], "[currency] [subtotal]")),
        ("VAT / Tax", lookup_invoice_value(plan, ["tax", "tax_amount", "vat"], "[currency] [tax_amount]")),
        ("Total Due", total_due),
    ]
    totals_cell.text = ""
    for idx, (label, value) in enumerate(totals):
        paragraph = totals_cell.paragraphs[0] if idx == 0 else totals_cell.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        paragraph.paragraph_format.space_after = Pt(2 if idx < 2 else 0)
        append_text(paragraph, label + "  ", manifest, "heading", 8.2 if idx < 2 else 10.5, muted if idx < 2 else accent, bold=True, all_caps=idx == 2)
        append_text(paragraph, value, manifest, "heading", 9.4 if idx < 2 else 16, ink if idx < 2 else accent, bold=True)

    source_note = lookup_invoice_value(plan, ["source_note", "compliance_note", "note"], "")
    if source_note:
        note = document.add_paragraph()
        note.paragraph_format.space_before = Pt(7)
        note.paragraph_format.space_after = Pt(0)
        append_text(note, source_note, manifest, "note", 7.2, muted)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    document.save(str(output_path))
    return {
        "phase": "final",
        "status": "warning" if warnings else "ok",
        "output_path": str(output_path.resolve()),
        "result": {
            "sections_rendered": 3,
            "blocks_rendered": 7,
            "document_type": "invoice",
            "layout_model": "compact_invoice",
            "page_budget": budget,
            "warnings": warnings,
            "errors": [],
            "fallback_styles_used": [],
            "unresolved_style_tokens": [],
            "strict": strict,
        },
        "handoff": {
            "next_skill": "docx-style-linter",
            "required_checks": [
                "validate_style_presence",
                "render_report_status",
                "fallback_resolution",
                "heading_hierarchy",
                "spacing_checks",
                "accessibility_checks",
                "page_budget_hints",
                "invoice_layout_model",
            ],
        },
    }


def render(plan_payload: Dict[str, Any], manifest: Dict[str, Any], output_path: Path, strict: bool = False) -> Dict[str, Any]:
    plan = normalize_plan(plan_payload)
    if document_type(plan, manifest) == "invoice":
        return render_invoice(plan, manifest, output_path, strict=strict)

    doc = Document()
    warnings: List[str] = []
    errors: List[str] = []
    fallback_styles_used: Set[str] = set()
    unresolved_tokens: Set[str] = set()
    budget = page_budget(plan, manifest)
    compact = bool(budget.get("compact_layout"))

    if not plan.get("title"):
        warnings.append("Document plan is missing title; renderer used metadata fallback")

    apply_metadata(doc, plan, manifest)
    apply_page_setup(doc, manifest, compact)

    sections_rendered = 0
    blocks_rendered = 0
    title = plan.get("title")
    if title:
        style = token_to_style(doc, "hero", warnings, errors, fallback_styles_used, unresolved_tokens, strict)
        add_paragraph(doc, title, style, manifest, "title", compact, bold=True, align="center" if compact and document_type(plan, manifest) == "invoice" else None, size_key="title_pt")
        blocks_rendered += 1

    sections = sorted(plan.get("sections", []) or [], key=lambda x: x.get("order", 0))
    for section in sections:
        counts = add_section(doc, section, manifest, warnings, errors, fallback_styles_used, unresolved_tokens, strict, compact)
        sections_rendered += counts["sections"]
        blocks_rendered += counts["blocks"]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(output_path))

    status = "fail" if errors else ("warning" if warnings or fallback_styles_used else "ok")
    return {
        "phase": "final",
        "status": status,
        "output_path": str(output_path.resolve()),
        "result": {
            "sections_rendered": sections_rendered,
            "blocks_rendered": blocks_rendered,
            "document_type": document_type(plan, manifest),
            "page_budget": budget,
            "warnings": warnings,
            "errors": errors,
            "fallback_styles_used": sorted(fallback_styles_used),
            "unresolved_style_tokens": sorted(unresolved_tokens),
            "strict": strict,
        },
        "handoff": {
            "next_skill": "docx-style-linter",
            "required_checks": [
                "validate_style_presence",
                "render_report_status",
                "fallback_resolution",
                "heading_hierarchy",
                "spacing_checks",
                "accessibility_checks",
                "page_budget_hints",
            ],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", help="Optional path to write render report JSON.")
    parser.add_argument("--strict", action="store_true", help="Treat style fallbacks as render failures.")
    parser.add_argument("--indent", type=int, default=2)
    parser.add_argument("--json", action="store_true", help="Print the render report as JSON.")
    args = parser.parse_args()

    report = render(_load_json(args.plan), normalize_manifest(_load_json(args.manifest)), Path(args.output), strict=args.strict)
    if args.report:
        Path(args.report).write_text(json.dumps(report, indent=args.indent), encoding="utf-8")
    if args.json:
        print(json.dumps(report, indent=args.indent))
    return 1 if report["status"] == "fail" else 0


if __name__ == "__main__":
    raise SystemExit(main())
