# GitHub and Pages Handover Runbook

This runbook is for the cutover from the personal repository owner to the
`ura-gis` organization. It deliberately contains no credential values.

## Before the window

1. Create `ura-gis`, enable 2FA for all members, appoint at least two owners,
   and invite the successor's individual GitHub account.
2. Create the `landcare-maintainers` team and grant it `Maintain` on
   `land-care-assurance` after transfer.
3. Record names only: Pages environment, Actions secrets, Actions variables,
   collaborators, branch (`master`), workflows, and ArcGIS item URLs.
4. Set these repository variables after transfer:

   | Variable | Value |
   |---|---|
   | `LANDCARE_EMAIL_RECIPIENTS` | Approved operations distribution list |
   | `LANDCARE_ISSUE_ASSIGNEE` | Successor GitHub username, or blank |

5. Prepare a pull request containing the URL, workflow, documentation, and
   design-system changes. Do not merge it before the transfer window.
6. Pause the 7:00 AM VM task and note its previous enabled/running state.

## Transfer and deploy

1. From the current repository owner, open **Settings → Danger Zone → Transfer**
   and transfer `land-care-assurance` to `ura-gis`.
2. Open the transferred repository as an organization owner. Confirm the
   default branch is `master`, Pages is configured for GitHub Actions, and the
   `github-pages` environment exists.
3. Update a local clone:

   ```powershell
   git remote set-url origin https://github.com/ura-gis/land-care-assurance.git
   git fetch origin
   git switch master
   git pull --ff-only origin master
   ```

4. Merge the prepared pull request and run the Pages workflow. Check the new
   routes:

   - `/monitoring/`
   - `/kpi/`
   - `/contractor/`
   - `/survey-submission/`
   - `/design-system/example.html`

5. Update ArcGIS dashboard embeds, item descriptions, bookmarks, and any URA
   operational links to `https://ura-gis.github.io/land-care-assurance/`.
6. Configure the repository deploy key and VM SSH remote following
   [`task-scheduler-vm-operations.md`](task-scheduler-vm-operations.md). Run
   `git ls-remote origin` as the scheduled-task identity before enabling the
   task.
7. Run one checked refresh, verify the status JSON and Pages deployment, then
   resume the scheduled task.

## Verification and sign-off

- `git fetch` and `git push` work from the successor's clone.
- Pages workflow is green and all five routes load.
- ArcGIS shell loads the new Pages URL.
- Morning brief manual `dry-run` uploads an artifact without sending email or
  creating an issue; live delivery is tested separately by the operations owner.
- Two unattended VM refresh cycles complete with `status: success`.
- Only after sign-off: remove the departing account, old deploy keys, old
  Windows credentials, and temporary cutover access.

GitHub repository transfers preserve the Git repository location redirect, but
GitHub Pages links do not redirect. Keep the old repository path unused after
transfer so GitHub's repository redirect remains intact.
