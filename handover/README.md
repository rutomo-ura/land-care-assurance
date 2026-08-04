# LandCare Assurance handover

Everything the next owner needs, in one folder. Start here rather than anywhere else in the
repository.

**If you are an AI agent:** read `../AGENTS.md`, then `01-owner-guide.md`, then
`02-agent-playbook.md`. The URA design system is installed as a skill at
`../.claude/skills/ura-landcare-design/` and is discovered automatically.

## What is in here

| File | What it is | Read it when |
|---|---|---|
| [`01-owner-guide.md`](01-owner-guide.md) | The complete reference: architecture, metrics, daily operations, the Regrid replacement, design system, risks | First. This is the document |
| [`01-owner-guide.pdf`](01-owner-guide.pdf) | The same guide typeset as a report, 13 pages | You want to print it or send it to someone outside the repo |
| [`02-agent-playbook.md`](02-agent-playbook.md) | Prompts and recipes for changing the app with an AI agent | You are about to make a change |
| [`03-presentation.pdf`](03-presentation.pdf) | 7-slide walkthrough of the product and the handover | You are briefing someone in a meeting |
| [`03-presentation.pptx`](03-presentation.pptx) | The editable deck | You need to present it yourself |
| [`build/`](build) | The LaTeX toolchain that produces the PDF | You edited the guide and need to rebuild |

## What the product is

A map-first web application that answers one question for URA supervisors: for this service
period, which assigned parcels were actually serviced, by whom, and with what evidence.

Live at `https://ura-gis.github.io/land-care-assurance/`:
[`/monitoring/`](https://ura-gis.github.io/land-care-assurance/monitoring/) supervisor map,
[`/kpi/`](https://ura-gis.github.io/land-care-assurance/kpi/) executive dashboard,
[`/contractor/`](https://ura-gis.github.io/land-care-assurance/contractor/) contractor portal.

## Three things to know before you touch anything

1. **Live ArcGIS is authoritative at page load.** The JSON under `docs/landcare/data/` is a
   fallback cache and the finance contract, not truth. Numbers move without a commit.
2. **Completion is raw assignment-matched survey records over Active assigned.** Request Only
   is excluded. It is deliberately not a unique-parcel count. Changing this moves every
   published number.
3. **All ArcGIS access lives in two files**, `docs/landcare/survey-layer.js` and
   `docs/landcare/assignment-layer.js`. An endpoint anywhere else is a defect.

## First week

1. Clone, push, and run the tests.
2. Watch two unattended refresh cycles complete with `status: success`.
3. Run the morning brief manually in `dry-run` mode and read the artifact.
4. Open all three routes and reconcile one contractor's numbers by hand against the map.
5. Make one harmless documentation change through an agent, end to end, including tests.
6. Decide whether to deploy the Survey123 evidence path this quarter. It is the single
   blocker on retiring the Regrid subscription.

## Rebuilding the PDF

Edit `01-owner-guide.md`, which is the source of truth, then:

```bash
python handover/build/build_report.py
```

Needs `pandoc` and `tectonic` (`brew install pandoc tectonic`). Tectonic fetches any missing
LaTeX packages on first run and caches them.

## Also in the repository

`../HANDOVER.md` is the repository and Pages cutover checklist. `../AGENTS.md` is the rule
set agents read automatically. `../docs/` holds the deeper references the owner guide links
to: architecture, metrics glossary, VM runbook, Survey123 setup.
