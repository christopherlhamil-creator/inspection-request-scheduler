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

## The five things worth reading

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
