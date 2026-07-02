# Inspection Request Scheduler

A single-inspector scheduling board with **travel-aware conflict detection**, feeding a **compliance
gate** for large construction projects — the kind where a whole campus of trades all want the one city
(AHJ) inspector at 2 PM, and where an inspection isn't the finish line, it's evidence that unlocks a
scope of work.

**▶ Live interactive demo:** open [`index.html`](index.html) in any browser — no build step, no server,
no dependencies, works offline. All data is synthetic. Assign a request, walk the sign-off chain, watch
the conflict scan flag two 2 PM requests in different buildings — then scroll to the **change timeline**
and click an engineering change notice: watch it highlight exactly which work package it just re-locked,
and why.

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

## Beyond scheduling: the compliance backbone

The scheduler is the front door. What makes it more than a calendar is what the inspection evidence
*feeds*, and what actually drives all of it: **Division 1 of the spec**. Every work package traces back
to one Division 1 requirement, and every requirement gates a chain of prerequisites before it can open —

```
Div 1 requirement → Submittal approved → RFIs resolved → Pre-install meeting held → Work package gate
```

— with an inspection as one of the gate's required proofs. On its own, that's a checklist. What makes it
a *system* is Division 1 doing double duty as a **cross-reference database**: every spec line already
knows which drawing governs it, which submittal satisfies it, which work package it gates, and which
inspection proves it. That join is what makes the next part possible.

**The hard part: engineering changes happen mid-project.** Change control lands an engineering change
notice that revises the drawing governing a work package — and every spec line joined to that drawing
picks up the change automatically, because the reference already existed. Any inspection recorded
*before* that revision date no longer proves anything against the current design; the gate re-locks
until the work is re-inspected. Miss that, and a passed inspection quietly certifies work against a
design that no longer exists.

The demo's **change timeline** is that cross-reference made visible. Select an engineering change notice
and it shows, immediately, every work package it touches and what happened to each one — not by
re-deriving anything, just by walking the join that was already there. The **work package gates** below
it show the same data in its resting state, in all four outcomes:

| State | Meaning |
|---|---|
| **Blocked** | A prerequisite (submittal, RFI, meeting) isn't satisfied yet — inspection status is irrelevant until it is. |
| **Ready** | Every prerequisite is clear; the package is waiting on its inspection. |
| **Reverify** | Inspection evidence exists, but a later design change revised the governing drawing — the gate re-locked. |
| **Open** | Every prerequisite is satisfied and the evidence on file postdates the current drawing revision. |

This is the actual reason the production system existed: not "can we schedule this inspection" but "can
we prove, at any moment, exactly which drawing revision every piece of installed work was verified
against" — for an entire project, without a compliance team assembling that answer by hand.

One more thing this buys, once the spine is live from kickoff: **closeout stops being a scramble.** A
turnover package or a commissioning checklist is just a query against data that's already there — every
submittal, drawing revision, and inspection accumulated daily instead of reconstructed in the last week
of the project.

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

The production version ran on Google Apps Script + Google Sheets and ingested inspection requests, RFIs,
submittals, and drawing revisions automatically from the project's construction-management platform. The
spec cross-reference itself was prototyped in Python — fast to iterate on while the parsing rules for a
35,000-line spec book were still being worked out — then rebuilt in Apps Script so it could run natively
and autonomously inside a Google Workspace environment that didn't allow external AI tools or APIs. See
[`apps-script/`](apps-script/) for the genericized server-side engine (conflict detection, sign-off
state machine, and the work-package gate logic) with a configuration layer in place of the original
hard-wired constants.

## License

[MIT](LICENSE) — the code is a portfolio sample; use any of it.
