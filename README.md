# LandCare Assurance v1.0

LandCare Assurance is a map-first operational product for URA LandCare: a contractor selects an assigned parcel, submits field evidence, URA reviews it, and supervisors monitor trusted Regrid, assignment, and approved-evidence context.

Current handover status: start with the [`handover readiness checklist`](handover/04-readiness-checklist.md). Live operational data comes from ArcGIS Online at page load. The former 7 AM dashboard refresh is deprecated.

Public application:

- [Map Monitor](https://ura-gis.github.io/land-care-assurance/monitoring/)
- [KPI Dashboard](https://ura-gis.github.io/land-care-assurance/kpi/)
- [Contractor Portal](https://ura-gis.github.io/land-care-assurance/contractor/)
- [Survey Submission](https://ura-gis.github.io/land-care-assurance/survey-submission/)
- [Public Survey123 form](https://survey123.arcgis.com/share/02a003254ba546c28b4997b42e0f220b)

## Start here

| Need | Read this |
|---|---|
| **Take over this project** | [`handover/04-readiness-checklist.md`](handover/04-readiness-checklist.md), then [`handover/`](handover/) |
| Administer the repository and Pages | [`HANDOVER.md`](HANDOVER.md), [`AGENTS.md`](AGENTS.md), and [`docs/github-handover-runbook.md`](docs/github-handover-runbook.md) |
| Understand the full data and submission lifecycle | [`docs/landcare-submission-and-evidence-flow.md`](docs/landcare-submission-and-evidence-flow.md) |
| Understand sources, metric rules, runtime layers, and daily refresh | [`docs/landcare-architecture.md`](docs/landcare-architecture.md) |
| Operate the KPI finance feed | [`docs/powerbi-landcare-finance-source.md`](docs/powerbi-landcare-finance-source.md); use the [NetSuite guide](docs/netsuite-landcare-finance-source.md) for reconciliation |
| Retire or inspect the deprecated 7 AM VM task | [`docs/task-scheduler-vm-operations.md`](docs/task-scheduler-vm-operations.md) |
| Configure Survey123 review, webhook, PostgreSQL, and public evidence | [`docs/survey123-landcare-network-setup.md`](docs/survey123-landcare-network-setup.md) |
| Present or hand over the product | [`docs/v1.0-operational-handover.md`](docs/v1.0-operational-handover.md) and [`docs/v1.0-presentation-script.md`](docs/v1.0-presentation-script.md) |

## Core operating rules

- **Completion evidence is displayed at the assignment polygon.** The Map and KPI completion numerator uses raw survey records whose parcel key matches an assignment; unique completed parcels remain diagnostic only. The Survey123 point is never displayed on the public map.
- **Contractors can choose a parcel from the list or directly on the map.** Both controls use the same assignment ID and prefill the same Survey123 fields.
- **Public intake is anonymous; evidence is validated.** A Survey123 record affects the dashboard only when its parcel, period, contractor, and assignment ID match an authoritative assignment. A photo is optional and shown when available.
- **Images are lazy-loaded.** Map Monitor exposes a safe full-image link for existing Regrid photos and, once the VM endpoint is enabled, approved Survey123 photos.

---

# Current operating model

- Oscar's 4 AM Regrid/GIS pipeline loads PostgreSQL and publishes the live ArcGIS survey and assignment layers.
- Map Monitor, KPI, contractor, and submission pages query ArcGIS directly at page load.
- GitHub Pages serves the application, and Power BI supplies the secure Land Care Budget and Parcel Area report pages.
- `docs/landcare/data/` remains a checked-in compatibility fallback and finance contract. It is not the freshness source.
- The former `LandCare-Daily-Dashboard-Refresh.task` at 7 AM is deprecated. Its scripts remain only for recovery or a documented future reactivation.

See [`docs/task-scheduler-vm-operations.md`](docs/task-scheduler-vm-operations.md) for the controlled VM retirement procedure.
