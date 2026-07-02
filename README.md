# Inspection Request Scheduler

A single-inspector scheduling board with **travel-aware conflict detection**, feeding a **compliance
gate** for large construction projects — the kind where a whole campus of trades all want the one city
(AHJ) inspector at 2 PM, and where an inspection isn't the finish line, it's evidence that unlocks a
scope of work.

**▶ Live interactive demo:** open [`index.html`](index.html) in any browser — no build step, no server,
no dependencies, works offline. All data is synthetic. Try the **section crosswalk** normalizer with a
messy code of your own, watch the **change timeline** re-lock a work package, assign an inspection and
walk its sign-off chain, watch the conflict scan flag two 2 PM requests in different buildings, and check
the **lessons learned register** for a live, per-building carry-forward call on every recurring failure.

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

## The foundation everything else assumes: one canonical section key

Every join in this system — spec line to drawing, drawing to submittal, submittal to inspection — quietly
assumes a spec section means the same thing wherever it's referenced. It doesn't, automatically. The same
section shows up as a legacy 5-digit code with no leading division digit (`19100`), a modern 6-digit code
with no separators (`033000`), a fully-formatted code with a sub-paragraph locator tacked on
(`01 32 33.12`), or plain data-entry garbage, depending on which system logged it. Reconcile those
inconsistently and every downstream join silently drifts.

The **section crosswalk** panel in the demo is a live version of the actual normalizer — type any of
those forms in and it either resolves to one canonical `NN NN NN` key or, for anything genuinely
ambiguous (two codes in one cell, a digit run too long to be a real section), **refuses to guess** and
says why. Below it, a coverage matrix shows how many of five source systems have a record for each
section, with a health flag (`Thin` / `OK` / `Strong`), and an orphan check runs in both directions:
scoped work with no supporting evidence anywhere, and evidence with no scoped work behind it. This is the
part that has to be right before anything built on top of it — the change timeline, the gates, the
lessons register — can be trusted.

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

## Lessons learned: the part that's actually repeatable across projects

Everything above is specific to one project's spec and one project's cross-references. The **lessons
learned register** is the one piece that's a pure function of two generic inputs — a failure tally and a
build-progress map — which is what makes it the most literally "take this to the next job" part of the
whole system.

Quality-requirements specs commonly obligate incorporating lessons learned into ongoing trade training.
In practice that usually means a QA lead reading a failure log by hand and hoping the pattern that
mattered sticks. This does the mining mechanically instead:

1. **Tally** every classified inspection failure by pattern (category, trade, and what happened).
2. **Promote** a pattern to a lesson once it clears a recurrence threshold — enough occurrences to be a
   real trend, not noise from one bad week.
3. **Check every lesson against what hasn't started yet.** A pattern from a trade whose scope is already
   finished in every other building is merely informative. The same pattern from a trade that hasn't
   *started* its scope somewhere else yet is the highest-value thing in the whole register — the
   preventive action can still land before the mistake has a chance to repeat.

The demo's panel shows exactly this: patterns sorted by recurrence, the highest-frequency ones flagged
critical, and a per-building **Actionable now** / **Verify carried over** chip on every lesson — computed
live from a small build-progress model, not hand-typed per lesson. One pattern is deliberately left below
the promotion threshold to show the filter actually filters.

What's deliberately *not* automated: the root cause and the preventive-action text are still a QA
professional's judgment call. That's the honest boundary — this finds where the judgment is worth
spending, it doesn't replace it.

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

## System map

The scheduler, the change timeline, and the gates are one spoke of a larger hub-and-spoke QMS — a single
Apps Script deploy with one lean database, extended by independent modules rather than one monolith.
Not every spoke has a build in this portfolio; the shape of the whole system is real, and the two spokes
below get their own code sample because they're the least visible from the UI and the most likely to get
asked about directly.

| Spoke | What it did |
|---|---|
| **Inspection Scheduler** *(this repo)* | Travel-conflict scheduling, sign-off chain, change timeline, work package gates |
| **XLSX / hyperlink import** *(this repo, [`apps-script/XlsxImport.gs`](apps-script/XlsxImport.gs))* | Parses the CM platform's spreadsheet exports with no external library, including hyperlink resolution via the workbook's relationships XML |
| **Bootstrap / deploy** *(this repo, [`apps-script/BootstrapDeploy.gs`](apps-script/BootstrapDeploy.gs))* | Name-based Drive resource discovery — the same script deploys to a new Google account with zero hardcoded IDs |
| **Lessons learned** *(this repo, [`apps-script/LessonsLearned.gs`](apps-script/LessonsLearned.gs))* | Mines a failure tally for recurring patterns and flags which ones are still actionable elsewhere on the project |
| **Section crosswalk** *(this repo, [`apps-script/SectionCrosswalk.gs`](apps-script/SectionCrosswalk.gs))* | Reconciles inconsistent spec-section formats to one canonical key; coverage/orphan audit across source systems |
| Sub Portal | External subcontractor view — reschedule, hold, withdraw an inspection request without internal-tool access |
| MEP PM Board | Trade coordination view for mechanical/electrical/plumbing scope |
| 3-Week Look-Ahead | Rolling schedule view scoped to near-term work |
| Daily Report | Field QC daily reporting |
| NCR Register | Non-conformance tracking and corrective-action verification |
| Concrete Break Tracking | Lab break-test results parsed and matched against the pour schedule |
| Notifications / Feedback | Routed alerts and an in-app feedback loop |
| Executive Dashboard / Command Center | Roll-up views for project leadership |
| Calendar sync | Two-way sync between the inspection schedule and a Google Calendar, so a scheduled inspection shows up as a real calendar event and a calendar edit reflects back — the same conflict-detection principle as the travel scan, applied to meeting-room double-booking |

## License

[MIT](LICENSE) — the code is a portfolio sample; use any of it.
