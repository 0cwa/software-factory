#!/usr/bin/env python3
"""Deterministic regression fixtures for inventory_skills frontmatter parsing."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from inventory_skills import parse_scalar  # noqa: E402


class BlockScalarFixtures(unittest.TestCase):
    def assert_description(self, header: str, body: str, expected: str) -> None:
        frontmatter = f"description: {header}\n{body}\nnext: value"
        self.assertEqual(parse_scalar(frontmatter, "description"), expected, header)

    def test_existing_bare_headers(self) -> None:
        self.assert_description(">", "  alpha\n  beta", "alpha beta")
        self.assert_description("|", "  alpha\n  beta", "alpha\nbeta")

    def test_chomping_indicators(self) -> None:
        self.assert_description(">-", "  alpha\n  beta", "alpha beta")
        self.assert_description(">+", "  alpha\n  beta", "alpha beta\n")
        self.assert_description("|-", "  alpha\n  beta", "alpha\nbeta")
        self.assert_description("|+", "  alpha\n  beta", "alpha\nbeta\n")
        self.assert_description("|-", "  alpha\n\n", "alpha")
        self.assert_description("|+", "  alpha\n\n", "alpha\n\n")

    def test_indentation_indicators_in_both_orders(self) -> None:
        for digit in "123456789":
            body = f"{' ' * int(digit)}alpha\n{' ' * int(digit)}beta"
            for header in (f">{digit}-", f">-{digit}"):
                self.assert_description(header, body, "alpha beta")
            for header in (f"|{digit}+", f"|+{digit}"):
                self.assert_description(header, body, "alpha\nbeta\n")

    def test_invalid_indentation_indicator_is_not_a_block_header(self) -> None:
        self.assertEqual(parse_scalar("description: |0", "description"), "|0")

    def test_pi_agent_rust_description(self) -> None:
        frontmatter = """description: >-
  Speeds up pi_agent_rust development and verification workflows. Use when editing providers,
  tools, sessions, extensions, installer/uninstaller logic, or triaging regressions in this repo.
"""
        description = parse_scalar(frontmatter, "description")
        self.assertIsNotNone(description)
        self.assertEqual(len(description), 187)


if __name__ == "__main__":
    unittest.main()
