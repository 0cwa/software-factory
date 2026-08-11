#!/usr/bin/env python3
"""Compose DOCX files into one document."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Dict, List, Tuple


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--inputs", nargs="+", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--policy", choices=["base", "last", "strict"], default="base")
    p.add_argument("--insert-page-breaks", action="store_true")
    p.add_argument("--json", action="store_true")
    return p.parse_args()


def validate_inputs(inputs: List[str], output: str) -> Tuple[bool, List[Dict[str, str]]]:
    checks: List[Dict[str, str]] = []
    ok = True
    for raw in inputs:
        path = Path(raw)
        status = "ok"
        reason = ""
        if not path.exists():
            status = "fail"
            reason = "missing"
        elif not path.is_file():
            status = "fail"
            reason = "not_a_file"
        elif path.suffix.lower() != ".docx":
            status = "fail"
            reason = "not_docx"
        elif not os.access(path, os.R_OK):
            status = "fail"
            reason = "not_readable"
        if status != "ok":
            ok = False
        checks.append({"path": str(path.resolve()), "status": status, "reason": reason})

    out_path = Path(output)
    parent = out_path.parent if out_path.parent != Path("") else Path(".")
    if not parent.exists():
        ok = False
        checks.append({"path": str(parent.resolve()), "status": "fail", "reason": "output_parent_missing"})
    elif not os.access(parent, os.W_OK):
        ok = False
        checks.append({"path": str(parent.resolve()), "status": "fail", "reason": "output_parent_not_writable"})

    return ok, checks


def policy_report(policy: str) -> Dict[str, str]:
    if policy == "base":
        return {
            "requested": policy,
            "applied": "base",
            "status": "honored",
            "message": "docxcompose uses the first document as the base style source.",
        }
    if policy == "last":
        return {
            "requested": policy,
            "applied": "base",
            "status": "fallback",
            "message": "last-wins style precedence is not implemented; composed with base-document precedence.",
        }
    return {
        "requested": policy,
        "applied": "base",
        "status": "not_enforced",
        "message": "strict style-conflict detection is not implemented; composition proceeds with a warning.",
    }


def style_conflict_placeholder(policy: str) -> List[Dict[str, str]]:
    return [{
        "status": "not_evaluated",
        "policy": policy,
        "message": "This script does not inspect or reconcile style definitions; run docx-style-linter or a dedicated OOXML style check for real conflicts.",
    }]


def compose(inputs: List[str], output: str, policy: str, insert_breaks: bool) -> dict:
    valid, validation = validate_inputs(inputs, output)
    if not valid:
        return {
            "status": "fail",
            "error": "input_validation_failed",
            "input_validation": validation,
            "output_path": str(Path(output).resolve()),
            "inputs": [str(Path(p).resolve()) for p in inputs],
        }

    try:
        from docxcompose.composer import Composer
        from docx import Document
    except Exception as e:
        return {
            "status": "fail",
            "error": "docxcompose_not_available",
            "message": str(e),
            "remediation": "pip install docxcompose or use a dedicated conversion flow",
        }

    docs = [Document(p) for p in inputs]
    base = docs[0]
    composer = Composer(base)
    breaks_inserted = 0

    for extra in docs[1:]:
        if insert_breaks:
            base.add_page_break()
            breaks_inserted += 1
        composer.append(extra)

    composer.save(output)
    report = policy_report(policy)
    conflicts = style_conflict_placeholder(policy)
    warning = report["status"] != "honored" or any(c.get("status") == "not_evaluated" for c in conflicts)

    return {
        "status": "warning" if warning else "ok",
        "output_path": str(Path(output).resolve()),
        "inputs": [str(Path(p).resolve()) for p in inputs],
        "input_validation": validation,
        "policy": policy,
        "policy_report": report,
        "sections": len(docs),
        "paragraphs": sum(len(d.paragraphs) for d in docs),
        "insert_page_breaks": insert_breaks,
        "page_breaks_inserted": breaks_inserted,
        "style_conflicts": conflicts,
        "next": "docx-style-linter",
    }


def main() -> int:
    args = parse_args()
    out = compose(args.inputs, args.output, args.policy, args.insert_page_breaks)
    if args.json:
        print(json.dumps(out, indent=2))
    else:
        print(out)
    return 0 if out.get("status") in ("ok", "warning") else 1


if __name__ == "__main__":
    raise SystemExit(main())
