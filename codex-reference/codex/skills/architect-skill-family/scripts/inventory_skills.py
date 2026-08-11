#!/usr/bin/env python3
"""Inventory Codex skills without requiring a YAML dependency."""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from collections import defaultdict
from pathlib import Path


FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---(?:\s*\n|\Z)", re.DOTALL)
LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
FENCED_BLOCK_RE = re.compile(r"^\s*(```|~~~).*?^\s*\1\s*$", re.DOTALL | re.MULTILINE)


def parse_block_header(raw: str) -> tuple[str, str | None, int | None] | None:
    """Parse a YAML block scalar header without accepting invalid indicators."""
    header = raw.strip()
    if " #" in header:
        header = header.split(" #", 1)[0].rstrip()
    if not header or header[0] not in "|>":
        return None

    style = header[0]
    chomping: str | None = None
    indentation: int | None = None
    for indicator in header[1:]:
        if indicator in "+-" and chomping is None:
            chomping = indicator
        elif indicator in "123456789" and indentation is None:
            indentation = int(indicator)
        else:
            return None
    return style, chomping, indentation


def _fold_block_lines(lines: list[str]) -> str:
    """Fold ordinary YAML lines while retaining blank and more-indented lines."""
    rendered: list[str] = []
    index = 0
    while index < len(lines):
        line = lines[index]
        if not line:
            end = index
            while end < len(lines) and not lines[end]:
                end += 1
            rendered.append("\n" * (end - index))
            index = end
            continue

        rendered.append(line)
        if index + 1 < len(lines) and lines[index + 1]:
            if line.startswith(" ") or lines[index + 1].startswith(" "):
                rendered.append("\n")
            else:
                rendered.append(" ")
        index += 1
    return "".join(rendered)


def _parse_block_scalar(
    lines: list[str],
    index: int,
    key_indent: int,
    style: str,
    chomping: str | None,
    indentation: int | None,
) -> str:
    content: list[str] = []
    content_indent = key_indent + indentation if indentation is not None else None
    for continuation in lines[index + 1 :]:
        if not continuation.strip():
            content.append("")
            continue
        leading_spaces = len(continuation) - len(continuation.lstrip(" "))
        if leading_spaces <= key_indent:
            break
        if content_indent is None:
            content_indent = leading_spaces
        if leading_spaces < content_indent:
            break
        content.append(continuation[content_indent:])

    if not content:
        return ""
    value = "\n".join(content) if style == "|" else _fold_block_lines(content)
    if chomping == "-":
        return value.rstrip("\n")
    if chomping == "+":
        return value if value.endswith("\n") else value + "\n"
    return value.rstrip("\n")


def parse_scalar(frontmatter: str, key: str) -> str | None:
    lines = frontmatter.splitlines()
    for index, line in enumerate(lines):
        match = re.match(rf"^{re.escape(key)}\s*:\s*(.*)$", line)
        if not match:
            continue
        raw = match.group(1).strip()
        block_header = parse_block_header(raw)
        if block_header:
            style, chomping, indentation = block_header
            if chomping is None and indentation is None:
                parts: list[str] = []
                for continuation in lines[index + 1 :]:
                    if continuation and not continuation[0].isspace():
                        break
                    parts.append(continuation.strip())
                separator = "\n" if style == "|" else " "
                return separator.join(part for part in parts if part)
            key_indent = len(line) - len(line.lstrip(" "))
            return _parse_block_scalar(
                lines, index, key_indent, style, chomping, indentation
            )
        if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in {'"', "'"}:
            try:
                value = ast.literal_eval(raw)
                return value if isinstance(value, str) else raw
            except (SyntaxError, ValueError):
                return raw[1:-1]
        return raw or None
    return None


def inspect_skill(skill_md: Path) -> dict[str, object]:
    text = skill_md.read_text(encoding="utf-8", errors="replace")
    frontmatter_match = FRONTMATTER_RE.search(text)
    frontmatter = frontmatter_match.group(1) if frontmatter_match else ""
    name = parse_scalar(frontmatter, "name")
    description = parse_scalar(frontmatter, "description") or ""
    root = skill_md.parent
    local_links: list[str] = []
    missing_links: list[str] = []
    searchable_text = FENCED_BLOCK_RE.sub("", text)
    for target in LINK_RE.findall(searchable_text):
        clean_target = target.split("#", 1)[0]
        if not clean_target or "://" in clean_target or clean_target.startswith("#"):
            continue
        local_links.append(clean_target)
        if not (root / clean_target).exists():
            missing_links.append(clean_target)

    return {
        "name": name,
        "path": str(root),
        "description": description,
        "description_characters": len(description),
        "skill_lines": len(text.splitlines()),
        "has_agents_metadata": (root / "agents" / "openai.yaml").exists(),
        "local_links": sorted(set(local_links)),
        "missing_local_links": sorted(set(missing_links)),
        "frontmatter_found": bool(frontmatter_match),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("roots", nargs="+", type=Path, help="Skill roots to inventory recursively")
    parser.add_argument("--output", type=Path, help="Write JSON to this path instead of stdout")
    parser.add_argument("--fail-on-duplicates", action="store_true")
    args = parser.parse_args()

    skill_files: set[Path] = set()
    missing_roots: list[str] = []
    for root in args.roots:
        if not root.exists():
            missing_roots.append(str(root))
            continue
        if root.is_file() and root.name == "SKILL.md":
            skill_files.add(root.resolve())
        else:
            skill_files.update(path.resolve() for path in root.rglob("SKILL.md"))

    skills = [inspect_skill(path) for path in sorted(skill_files)]
    paths_by_name: dict[str, list[str]] = defaultdict(list)
    for skill in skills:
        name = skill.get("name")
        if isinstance(name, str) and name:
            paths_by_name[name].append(str(skill["path"]))
    duplicates = {name: paths for name, paths in paths_by_name.items() if len(paths) > 1}

    report = {
        "roots": [str(root) for root in args.roots],
        "missing_roots": missing_roots,
        "skill_count": len(skills),
        "description_characters_total": sum(int(skill["description_characters"]) for skill in skills),
        "duplicate_names": duplicates,
        "skills": skills,
    }
    rendered = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    else:
        sys.stdout.write(rendered)

    if args.fail_on_duplicates and duplicates:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
