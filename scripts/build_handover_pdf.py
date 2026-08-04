"""Render a repository Markdown document to a branded PDF.

Uses the portable design-system tokens from ``docs/design-system/executive-bi.css`` so a
printed handover looks like the product it describes. Mermaid fences are rendered in the
browser before capture.

Requires the ``markdown`` package and a local Chrome or Chromium install. No build step and
no Node dependency, so it runs the same on the VM and on a laptop.

    python scripts/build_handover_pdf.py docs/landcare-pm-handover.md \
        output/pdf/LandCare-PM-Handover.pdf
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parents[1]
DESIGN_TOKENS = ROOT / "docs" / "design-system" / "executive-bi.css"
MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"

CHROME_CANDIDATES = (
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Program Files/Google/Chrome/Application/chrome.exe",
    "/Program Files (x86)/Google/Chrome/Application/chrome.exe",
)

PRINT_CSS = """
@page { size: A4; margin: 13mm 12mm 14mm; }
body { margin: 0; background: #fff; }
.bi-dashboard {
  display: block;
  max-width: none;
  margin: 0;
  padding: 0;
  background: #fff;
  font-size: 9.2pt;
  line-height: 1.45;
}
.bi-dashboard h1 {
  margin: 0 0 4pt;
  color: var(--bi-deep);
  font-size: 21pt;
  letter-spacing: -.02em;
  line-height: 1.1;
}
.bi-dashboard h2 {
  margin: 10pt 0 4pt;
  padding-top: 4pt;
  border-top: 2px solid var(--bi-primary);
  color: var(--bi-deep);
  font-size: 12.5pt;
  break-after: avoid;
}
.bi-dashboard h3 { margin: 8pt 0 3pt; color: var(--bi-deep); font-size: 10.5pt; break-after: avoid; }
.bi-dashboard p, .bi-dashboard li { margin: 0 0 3.5pt; color: #111820; }
.bi-dashboard ol, .bi-dashboard ul { margin: 0 0 5pt; padding-left: 14pt; }
.bi-dashboard a { color: var(--bi-primary); text-decoration: none; }
.bi-dashboard strong { color: var(--bi-deep); }
.bi-dashboard hr { margin: 12pt 0 0; border: 0; border-top: 1px solid var(--bi-line); }

.bi-dashboard table {
  width: 100%;
  margin: 4pt 0 7pt;
  border-collapse: collapse;
  font-size: 8.2pt;
  line-height: 1.4;
  break-inside: auto;
}
/* Split long tables at row boundaries instead of pushing the whole block to the
   next page, and repeat the header on the continuation. */
.bi-dashboard thead { display: table-header-group; }
.bi-dashboard tr { break-inside: avoid; }
.bi-dashboard th {
  padding: 3.5pt 6pt;
  color: #fff;
  background: var(--bi-deep);
  text-align: left;
  font-weight: 700;
}
.bi-dashboard td { padding: 3.5pt 6pt; border-bottom: 1px solid var(--bi-line); vertical-align: top; }
.bi-dashboard tbody tr:nth-child(even) { background: #f6f9fb; }

.bi-dashboard code {
  padding: 0 2pt;
  background: var(--bi-accent-soft);
  color: var(--bi-deep);
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 8.2pt;
}
.bi-dashboard pre {
  margin: 4pt 0 7pt;
  padding: 6pt 8pt;
  border-left: 3px solid var(--bi-primary);
  background: #f4f7f9;
  break-inside: avoid;
  white-space: pre-wrap;
  word-break: break-word;
}
.bi-dashboard pre code { padding: 0; background: none; font-size: 7.8pt; line-height: 1.4; }

.doc-figure { margin: 5pt 0 8pt; text-align: center; break-inside: avoid; }
.doc-figure svg { max-width: 100%; max-height: 215pt; height: auto; }
/* The diagram arrives as a <pre> so Markdown leaves it alone; strip the code-block skin. */
.bi-dashboard pre.mermaid {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  white-space: normal;
}

.doc-footer {
  margin-top: 10pt;
  padding-top: 4pt;
  border-top: 1px solid var(--bi-line);
  color: var(--bi-muted);
  font-size: 7.6pt;
}
"""

PAGE_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>{title}</title>
<style>{tokens}</style>
<style>{print_css}</style>
</head>
<body>
<main class="bi-dashboard">
{body}
<p class="doc-footer">ura-gis/land-care-assurance · Generated {generated} from <code>{source}</code> ·
Regenerate: <code>python scripts/build_handover_pdf.py {source} {target}</code></p>
</main>
<script src="{mermaid}"></script>
<script>
  mermaid.initialize({{
    startOnLoad: true,
    theme: "base",
    themeVariables: {{
      primaryColor: "#e8f6fc", primaryTextColor: "#00334f", primaryBorderColor: "#006c9f",
      lineColor: "#60717a", fontFamily: "Manrope, Segoe UI, Arial, sans-serif", fontSize: "13px"
    }}
  }});
</script>
</body>
</html>
"""


def find_chrome() -> str:
    for name in ("google-chrome", "chromium", "chromium-browser"):
        found = shutil.which(name)
        if found:
            return found
    for candidate in CHROME_CANDIDATES:
        if Path(candidate).is_file():
            return candidate
    raise SystemExit("Chrome or Chromium is required to print the PDF but was not found.")


def extract_mermaid(text: str) -> tuple[str, list[str]]:
    """Replace mermaid fences with placeholders so Markdown does not escape them."""
    diagrams: list[str] = []

    def swap(match: re.Match[str]) -> str:
        diagrams.append(match.group(1).strip())
        return f"\n@@MERMAID{len(diagrams) - 1}@@\n"

    return re.sub(r"```mermaid\n(.*?)\n```", swap, text, flags=re.DOTALL), diagrams


def restore_mermaid(html: str, diagrams: list[str]) -> str:
    for index, diagram in enumerate(diagrams):
        figure = f'<div class="doc-figure"><pre class="mermaid">{diagram}</pre></div>'
        html = html.replace(f"<p>@@MERMAID{index}@@</p>", figure).replace(f"@@MERMAID{index}@@", figure)
    return html


def build_html(source: Path, target: Path) -> str:
    text, diagrams = extract_mermaid(source.read_text(encoding="utf-8"))
    body = markdown.markdown(text, extensions=["tables", "fenced_code", "sane_lists", "attr_list"])
    title_match = re.search(r"^#\s+(.+)$", text, flags=re.MULTILINE)
    return PAGE_TEMPLATE.format(
        title=title_match.group(1) if title_match else source.stem,
        tokens=DESIGN_TOKENS.read_text(encoding="utf-8-sig"),
        print_css=PRINT_CSS,
        body=restore_mermaid(body, diagrams),
        source=source.relative_to(ROOT).as_posix(),
        target=target.relative_to(ROOT).as_posix(),
        generated=dt.date.today().isoformat(),
        mermaid=MERMAID_CDN,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Markdown file to render")
    parser.add_argument("target", type=Path, help="PDF path to write")
    parser.add_argument("--keep-html", action="store_true", help="Keep the intermediate HTML beside the PDF")
    parser.add_argument("--virtual-time-budget", type=int, default=15000, help="Milliseconds allowed for Mermaid to draw")
    args = parser.parse_args()

    source = args.source.resolve()
    target = args.target.resolve()
    if not source.is_file():
        raise SystemExit(f"Source Markdown not found: {source}")
    target.parent.mkdir(parents=True, exist_ok=True)

    html = build_html(source, target)
    html_path = target.with_suffix(".html") if args.keep_html else Path(tempfile.mkdtemp()) / f"{source.stem}.html"
    html_path.write_text(html, encoding="utf-8")

    subprocess.run(
        [
            find_chrome(),
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            "--no-pdf-header-footer",
            f"--virtual-time-budget={args.virtual_time_budget}",
            f"--print-to-pdf={target}",
            html_path.as_uri(),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    if not target.is_file():
        raise SystemExit("Chrome did not produce a PDF.")
    print(f"Wrote {target.relative_to(ROOT)} ({target.stat().st_size // 1024} KB) from {source.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
