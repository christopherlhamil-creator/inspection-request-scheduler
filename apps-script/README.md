# Server engine (Google Apps Script)

The genericized backend behind the [board demo](../index.html). This is the part that ran on Google
Apps Script + Google Sheets in production — reduced here to the two pieces worth reading and lifted off
any one client via a [`Config.gs`](Config.gs) layer.

| File | What's in it |
|---|---|
| [`Config.gs`](Config.gs) | `PROJECT_CONFIG` — buildings, zone codes, the travel-time matrix, the two review lanes, deep-link template. Point the engine at a different project by editing this file only. Also defines the sign-off chain and the open/closed state sets. |
| [`InspectionScheduler.gs`](InspectionScheduler.gs) | The engine: storage (UPSERT, never delete), `travelConflicts_()`, the `advanceSignoff()` state machine, and `getInspectionBoard()` board assembly. |
| [`WorkPackageGate.gs`](WorkPackageGate.gs) | The compliance backbone: `computeGateStatus_()` gates a work package on submittals/RFIs/meeting/inspection evidence, and `reassessAffectedPackages_()` runs the staleness cascade when a drawing revision lands. |
| [`XlsxImport.gs`](XlsxImport.gs) | Reads a construction-management platform's `.xlsx` export with no external library — unzips it, parses the shared-string table and cell grid, and resolves hyperlinked cells by joining the sheet's `<hyperlink>` elements against the worksheet's *relationships* XML. Covered by the tests described below. |
| [`BootstrapDeploy.gs`](BootstrapDeploy.gs) | Self-configuring first run: resolves the database Spreadsheet and Drive folder **by name**, not by ID, so a copy of this project works on a fresh Google account with zero config edits. |
| [`LessonsLearned.gs`](LessonsLearned.gs) | Mines a project's own inspection-failure history for recurring patterns, promotes a pattern to a lesson once it clears a recurrence threshold, and flags which lessons are urgent because that trade's scope hasn't started elsewhere on the project yet. |
| [`SectionCrosswalk.gs`](SectionCrosswalk.gs) | The foundation everything else assumes: reconciles a spec section referenced in five inconsistent formats to one canonical key, refusing to guess on genuinely ambiguous input, then audits coverage and finds orphans in both directions. |

## The seven things worth reading

**`travelConflicts_()`** — the whole reason the tool exists. Scheduled inspections for the single
authority inspector are grouped by day and walked in time order; each adjacent pair is flagged when the
gap between them is smaller than the travel time between their zones. One inspector, one truck — a 2:00
in one building and a 2:15 in another 22 minutes away is impossible, and this makes it impossible *on
screen* instead of in the field.

**`advanceSignoff()`** — the request lifecycle as an explicit state machine
(`Requested → Scheduled → Inspected → SuperBuyoff → AHJSigned`), with each transition guarded so an
illegal move throws instead of silently corrupting a record. A fail short-circuits to `Failed` and
notifies the superintendent rather than continuing the chain.

**`computeGateStatus_()`** — inspections aren't the end of the line, they're evidence that unlocks a
work package. This function is the reason the whole system exists: it treats a passing inspection as
provisional, valid only against the drawing revision that was current when it was recorded. When an
engineering change revises that drawing, `reassessAffectedPackages_()` re-runs the gate for every
package governed by it — potentially flipping several from `OPEN` back to `NEEDS_REVERIFICATION` in one
pass. Without this, a passed inspection could quietly certify installed work against a design that no
longer exists.

**`parseXlsxSheet_()` / `resolveHyperlinks_()`** — Apps Script has no XLSX library, so this reads the
format directly: an `.xlsx` is a zip of XML parts, and a hyperlinked cell doesn't carry its URL — it
carries a relationship-ID pointer (`r:id="rId12"`) that only resolves by cross-referencing the
worksheet's separate `_rels` file. Two bugs surfaced writing this that are worth naming because they're
exactly the kind of thing that passes a glance and fails on real data: a self-closing empty cell
(`<c r="B4"/>`) parsed with a regex that only matched `<c>value</c>` silently drops the cell and shifts
every column after it; and the `<Relationship>` element's attribute order is not guaranteed — real
exports write `Target` *before* `Id`, so a regex anchored on `Id` preceding `Target` matches nothing
against an actual file. Both are covered by a small Node-based test harness (two hand-built fixtures —
one shared-string, one inline-string — with a sparse row and two hyperlinked cells) before this shipped.

**`promoteToLessons_()` / `carryForwardStatus_()`** — the honest scope of what's automated here. Finding
which failure patterns are worth a QA professional's attention is mechanical: tally by pattern, promote
once it clears a recurrence threshold. Writing the actual lesson — root cause, preventive action — is
still a human judgment call, and this doesn't pretend otherwise. What it automates is the second, equally
important judgment call: given a build-progress map (which trade has started where), is this lesson
merely informative or is it still possible to act on before the mistake repeats. A pattern from a trade
that hasn't started its scope in another building yet is worth far more than the same pattern from a
trade that already finished there — and that comparison is exactly what a person re-reading a static
spreadsheet is least likely to make consistently across every lesson, every building, every week.

**`normalizeSectionCode_()`** — the join key every other file in this repo quietly assumes exists. The
same spec section is referenced as a legacy 5-digit MasterFormat code with no leading division digit
(`19100`), a modern 6-digit code with no separators (`033000`), a fully-formatted code with a
sub-paragraph locator (`01 32 33.12`), or plain data-entry garbage — depending on which system logged it.
This normalizes all of the legitimate forms to one canonical `NN NN NN` key and, just as importantly,
**refuses to normalize anything genuinely ambiguous** (two codes crammed into one cell, a digit run too
long to be a real section) rather than silently guessing and mis-joining two different sections. Tested
against the exact shapes of input that show up in a real export — including the specific failure modes
(multi-value cells, out-of-range digit counts, non-numeric garbage) — before shipping.
`buildCoverageMatrix_()` and `findOrphans_()` then run on top of that key: per section, how many of N
source systems have a record, and — checking both directions — which scoped work items have no
supporting evidence anywhere, and which evidence has no scoped work item behind it.

## Two implementation notes from production

- **UPSERT, never delete.** Rows are keyed by `id` and updated in place, so a request's history survives
  every edit. Deletion would orphan the CM platform's record IDs.
- **`getInspectionBoard()` returns a JSON *string*.** `google.script.run` silently hands the client
  `null` when the returned object graph contains `Date` values it can't serialize — and a Sheet cell
  typed as a date reads back as a `Date`. Flattening every row to primitives and `JSON.stringify`-ing
  makes the transport deterministic; the client `JSON.parse`s it. This one cost an afternoon.

## What's not here

The intake handler that parsed the construction-management platform's inspection-request export (a
wide, section-anchored spreadsheet) is client-specific and omitted. The engine above assumes requests
already arrive as normalized rows matching `INSP_COLS`.
