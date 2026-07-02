# Inspection Request Scheduler

A single-inspector scheduling board with **travel-aware conflict detection** for large construction
projects — the kind where a whole campus of trades all want the one city (AHJ) inspector at 2 PM, and
someone has to figure out that he physically cannot be in two buildings at once.

**▶ Live interactive demo:** open [`index.html`](index.html) in any browser — no build step, no server,
no dependencies, works offline. All data is synthetic. Assign a request, walk the sign-off chain, and
watch the conflict scan flag two 2 PM requests in different buildings.

---

## The problem this solves

On a multi-building project, formal inspections funnel through a **single authority** — one municipal
inspector, or one third-party special inspector. Every subcontractor submits a request, almost always
for the same convenient time slot, against whichever building they happen to be working in.

The naïve schedule treats each request independently and cheerfully books three inspections for 2:00 PM.
But the inspector is one person with a truck. If a 2:00 in Building 3 needs him, and Building 1 is a
22-minute drive away, the 2:15 in Building 1 is already impossible before anyone shows up. Field crews
stand around. The inspector's day falls apart. Nobody finds out until it's happening.

This tool makes that collision **visible at request time** and turns the scheduler's job from
"transcribe requests" into "resolve conflicts."

## How it works

**Two panes, one flow.** Requests come in on the left. The dispatcher assigns an inspector/tech and a
time; the card moves right into the day's actual schedule. Every card carries its own lifecycle instead
of being one row in a status column.

**Travel-aware conflict scan.** Scheduled inspections are sorted by time and checked pairwise. Two
inspections are in conflict when the gap between them is smaller than the travel time between their
zones. A per-zone travel matrix (building-to-building drive minutes) drives the check, so a back-to-back
pair *within* one building is fine while the same gap *across* buildings flags red — with the specific
reason ("needs 22 min travel, only 10 min gap").

**A real sign-off chain, not just a status field.** Each inspection walks a chain that mirrors the field
process:

```
Requested → Assigned → Inspected (pass/fail) → Super buy-off (assigns field engineer) → AHJ sign-off (green sticker)
```

State is encoded in *form* as well as label — color, chip, and position all move together, so what needs
attention reads at a glance.

**Two lanes.** Authority-having (AHJ) inspections get the full conflict logic because they share one
inspector. Third-party testing-agency inspections are a separate entity the team only reviews and
counter-signs — no conflict resolution — so they're filtered into their own lane rather than polluting
the conflict scan.

## Design notes

- **Information design over decoration.** It's a board that gets *operated*, not read. Summary counts up
  top, semantic color (green good / amber hold / red conflict) kept separate from the UI accent, tabular
  figures so times and dates line up in columns.
- **Field-ops palette.** Steel blue and hi-vis amber against a warm-grey ground — reads like the safety
  vocabulary of the site it serves, not a generic SaaS dashboard.
- **Self-contained.** One HTML file, no external fonts or scripts, works offline. The demo ships an
  in-memory mock backend so Assign, the sign-off chain, filters, and the conflict scan all actually run
  in the browser.

## Origin

This is a sanitized, synthetic-data reconstruction of a production tool I built as the QA/QC manager on a
large data-center project, where formal inspections across three buildings all routed through one
municipal inspector. All client identifiers, personnel, contractor names, project data, and integration
credentials have been removed; the project, people, and companies in the demo are invented.

The production version ran on Google Apps Script + Google Sheets and ingested inspection requests
automatically from the project's construction-management platform. See
[`apps-script/`](apps-script/) for the genericized server-side engine (request parser + conflict
detection) with a configuration layer in place of the original hard-wired constants.

## License

[MIT](LICENSE) — the code is a portfolio sample; use any of it.
