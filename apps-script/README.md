# Server engine (Google Apps Script)

The genericized backend behind the [board demo](../index.html). This is the part that ran on Google
Apps Script + Google Sheets in production — reduced here to the two pieces worth reading and lifted off
any one client via a [`Config.gs`](Config.gs) layer.

| File | What's in it |
|---|---|
| [`Config.gs`](Config.gs) | `PROJECT_CONFIG` — buildings, zone codes, the travel-time matrix, the two review lanes, deep-link template. Point the engine at a different project by editing this file only. Also defines the sign-off chain and the open/closed state sets. |
| [`InspectionScheduler.gs`](InspectionScheduler.gs) | The engine: storage (UPSERT, never delete), `travelConflicts_()`, the `advanceSignoff()` state machine, and `getInspectionBoard()` board assembly. |
| [`WorkPackageGate.gs`](WorkPackageGate.gs) | The compliance backbone: `computeGateStatus_()` gates a work package on submittals/RFIs/meeting/inspection evidence, and `reassessAffectedPackages_()` runs the staleness cascade when a drawing revision lands. |

## The three things worth reading

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
