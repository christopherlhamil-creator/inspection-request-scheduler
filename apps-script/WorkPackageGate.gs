/**
 * WorkPackageGate.gs — the compliance backbone the scheduler feeds.
 *
 * A work package (a discrete scope of work) can't open until a chain of
 * prerequisites is satisfied, and inspection evidence is one of them:
 *
 *   Submittal approved → RFIs resolved → Pre-install meeting held → Gate
 *
 * The part worth reading is computeGateStatus_(): engineering changes happen
 * mid-project, and when one revises the drawing governing a work package, any
 * inspection recorded *before* that revision date no longer proves anything.
 * The gate re-locks (NEEDS_REVERIFICATION) until the work is re-inspected
 * against the current drawing — otherwise a passed inspection could quietly
 * certify work against a design that no longer exists.
 */

var GATE_STATES = {
  BLOCKED: 'BLOCKED',                       // a non-inspection prerequisite is unmet
  READY: 'READY',                           // prerequisites clear, awaiting inspection
  NEEDS_REVERIFICATION: 'NEEDS_REVERIFICATION', // evidence predates the governing revision
  OPEN: 'OPEN'                              // every prerequisite satisfied, evidence current
};

/**
 * @param {Object} pkg required shape:
 *   { id, submittalStatus: 'Approved'|'Pending'|'Rejected',
 *     rfisClear: boolean, preInstallMeetingHeld: boolean,
 *     governingRevisionDate: Date }
 * @param {Object|null} evidence latest passing inspection for this package, or
 *   null if none exists yet: { inspectedAt: Date, result: 'Pass'|'Fail' }
 * @return {{state:string, reason:string}}
 */
function computeGateStatus_(pkg, evidence) {
  if (pkg.submittalStatus !== 'Approved') {
    return { state: GATE_STATES.BLOCKED, reason: 'submittal ' + pkg.submittalStatus.toLowerCase() };
  }
  if (!pkg.rfisClear) {
    return { state: GATE_STATES.BLOCKED, reason: 'open RFIs against this scope' };
  }
  if (!pkg.preInstallMeetingHeld) {
    return { state: GATE_STATES.BLOCKED, reason: 'pre-install meeting not held' };
  }
  if (!evidence || evidence.result !== 'Pass') {
    return { state: GATE_STATES.READY, reason: 'awaiting a passing inspection' };
  }
  if (evidence.inspectedAt < pkg.governingRevisionDate) {
    return {
      state: GATE_STATES.NEEDS_REVERIFICATION,
      reason: 'evidence dated ' + fmtDate_(evidence.inspectedAt) +
        ' predates the governing revision (' + fmtDate_(pkg.governingRevisionDate) + ')'
    };
  }
  return { state: GATE_STATES.OPEN, reason: 'all prerequisites satisfied, evidence current' };
}

/**
 * Re-run every open work package's gate after a drawing revision lands. This
 * is the staleness cascade: one engineering change can flip many packages
 * from OPEN back to NEEDS_REVERIFICATION in a single pass. Called on-demand
 * after each revision is logged, not on a timer — the cascade only needs to
 * run when something that could invalidate evidence actually changes.
 */
function reassessAffectedPackages_(revisedDrawingId, revisionDate, packages, evidenceByPackageId) {
  var affected = packages.filter(function (p) { return p.governingDrawingId === revisedDrawingId; });
  affected.forEach(function (p) { p.governingRevisionDate = revisionDate; });
  return affected.map(function (p) {
    return { id: p.id, gate: computeGateStatus_(p, evidenceByPackageId[p.id] || null) };
  });
}

function fmtDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
