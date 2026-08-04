"""Build the LandCare owner guide PDF from Markdown using pandoc and tectonic.

Markdown stays the single source of truth. This converts it to LaTeX with the branded
template in ``ura-report.latex`` and compiles with tectonic, which fetches any missing
LaTeX packages on first use and caches them.

    python handover/build/build_report.py

Requires ``pandoc`` and ``tectonic`` on PATH. Install tectonic with ``brew install tectonic``.
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "handover" / "build"
TEMPLATE = BUILD / "ura-report.latex"
DEFAULT_SOURCE = ROOT / "handover" / "01-owner-guide.md"
DEFAULT_TARGET = ROOT / "handover" / "01-owner-guide.pdf"
LOGO_SOURCE = ROOT / "docs" / "landcare" / "assets" / "ura-logo.png"

# Markdown carries \archdiagram as a bare line so GitHub renders the document cleanly.
# Pandoc would wrap it in a paragraph, so it is emitted as a raw LaTeX block instead.
DIAGRAM_TOKEN = "\\archdiagram"


# Break after a separator, or inside a long unbroken alphanumeric run such as an
# ArcGIS item ID. TeX has no breakpoint in either case and the cell overruns.
# Windows paths reach LaTeX as \textbackslash{}, so match that before bare separators.
SEPARATORS = re.compile(r"(\\textbackslash\{\}|\\_|[/.:@-])")
LONG_RUN = re.compile(r"[A-Za-z0-9]{16,}")
TEXTTT_OPEN = "\\texttt{"


def breakable_span(inner: str) -> str:
    """Insert zero-width break opportunities inside one \\texttt argument."""
    inner = SEPARATORS.sub(r"\1\\LCbrk{}", inner)
    return LONG_RUN.sub(
        lambda run: "\\LCbrk{}".join(
            run.group(0)[i : i + 12] for i in range(0, len(run.group(0)), 12)
        ),
        inner,
    )


def add_breakpoints(text: str) -> str:
    """Rewrite every \\texttt{...} span so long identifiers can wrap in a table cell.

    A regex cannot do this. Pandoc emits Windows paths as \\textbackslash{} inside the
    argument, so the closing brace has to be found by counting depth.
    """
    out: list[str] = []
    index = 0
    while True:
        start = text.find(TEXTTT_OPEN, index)
        if start == -1:
            out.append(text[index:])
            return "".join(out)
        out.append(text[index:start])
        cursor = start + len(TEXTTT_OPEN)
        depth = 1
        while cursor < len(text) and depth:
            char = text[cursor]
            if char == "\\":
                cursor += 2
                continue
            depth += (char == "{") - (char == "}")
            cursor += 1
        if depth:  # unbalanced: leave the rest alone rather than corrupt the document
            out.append(text[start:])
            return "".join(out)
        inner = text[start + len(TEXTTT_OPEN) : cursor - 1]
        out.append(TEXTTT_OPEN + breakable_span(inner) + "}")
        index = cursor


def require(tool: str, hint: str) -> str:
    found = shutil.which(tool)
    if not found:
        raise SystemExit(f"{tool} is required but was not found on PATH. {hint}")
    return found


def to_latex(source: Path, work: Path) -> Path:
    """Run pandoc, then promote the diagram placeholder to a raw LaTeX macro call."""
    tex = work / "owner-guide.tex"
    # tectonic resolves \includegraphics relative to the .tex, so stage the logo
    # beside it and reference it by bare name. Keeps the generated .tex portable.
    if LOGO_SOURCE.is_file():
        shutil.copyfile(LOGO_SOURCE, work / LOGO_SOURCE.name)
    subprocess.run(
        [
            require("pandoc", "Install with: brew install pandoc"),
            str(source),
            "--from=markdown+yaml_metadata_block+pipe_tables+backtick_code_blocks",
            "--to=latex",
            "--standalone",
            f"--template={TEMPLATE}",
            "--number-sections",
            "--highlight-style=tango",
            "--columns=90",
            f"--metadata=date:{dt.date.today():%d %B %Y}",
            f"--metadata=logo:{LOGO_SOURCE.name}",
            "--output",
            str(tex),
        ],
        check=True,
        cwd=ROOT,
    )
    document = tex.read_text(encoding="utf-8")
    # Pandoc escapes the backslash and wraps the token. Only rewrite occurrences after
    # \begin{document}, otherwise the substitution corrupts the macro's own definition
    # in the template preamble.
    marker = "\\begin{document}"
    head, separator, tail = document.partition(marker)
    if not separator:
        raise SystemExit("pandoc output has no \\begin{document}; template is broken.")
    for wrapped in (
        "\\textbackslash archdiagram",
        "\\textbackslash{}archdiagram",
        DIAGRAM_TOKEN,
    ):
        tail = tail.replace(wrapped, "\\archdiagram{}")
    tail = add_breakpoints(tail)
    tex.write_text(head + separator + tail, encoding="utf-8")
    return tex


def compile_pdf(tex: Path, target: Path) -> None:
    result = subprocess.run(
        [
            require("tectonic", "Install with: brew install tectonic"),
            "--outdir",
            str(tex.parent),
            "--keep-logs",
            str(tex),
        ],
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    produced = tex.with_suffix(".pdf")
    if result.returncode or not produced.is_file():
        sys.stderr.write(result.stdout[-4000:])
        sys.stderr.write(result.stderr[-4000:])
        raise SystemExit("tectonic failed to produce a PDF.")
    # Surface overfull boxes without failing the build; they are a layout smell.
    warnings = [line for line in result.stderr.splitlines() if "Overfull" in line]
    if warnings:
        print(f"note: {len(warnings)} overfull box warnings")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(produced, target)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("target", nargs="?", type=Path, default=DEFAULT_TARGET)
    parser.add_argument("--keep-tex", action="store_true", help="Write the .tex beside the PDF")
    args = parser.parse_args()

    source = args.source.resolve()
    target = args.target.resolve()
    if not source.is_file():
        raise SystemExit(f"Source Markdown not found: {source}")

    work = BUILD / ".work"
    work.mkdir(parents=True, exist_ok=True)
    tex = to_latex(source, work)
    compile_pdf(tex, target)
    if args.keep_tex:
        shutil.copyfile(tex, target.with_suffix(".tex"))

    print(f"Wrote {target.relative_to(ROOT)} ({target.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
