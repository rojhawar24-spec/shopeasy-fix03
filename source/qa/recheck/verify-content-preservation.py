#!/usr/bin/env python3
"""Compatibility entry point for the disposable buyer browser QA workflow."""
from pathlib import Path
import runpy
import sys

runner = Path(__file__).resolve().parents[1] / "run-browser-qa.py"
arguments = sys.argv[1:]
if not any(argument == "--suite" or argument.startswith("--suite=") for argument in arguments):
    arguments = ["--suite", "public", *arguments]
sys.argv = [str(runner), *arguments]
runpy.run_path(str(runner), run_name="__main__")
