/**
 * TemplateParityAudit.gs — two failure modes that look identical in a raw
 * count, and need opposite fixes.
 *
 * When a project has several near-identical instances (buildings, phases,
 * sites) built from one canonical configuration, "instance B has fewer
 * templates than instance A" is not one problem — it's two, and a raw count
 * can't tell them apart:
 *
 *   SUBSET — instance B's templates are all a clean subset of A's. It just
 *            hasn't finished cloning yet. Fix: clone the rest.
 *   DRIFT  — instance B has templates that DON'T match anything in A — its
 *            team rebuilt or renamed forms by hand instead of cloning. Fix:
 *            reconcile/dedupe those unique entries BEFORE cloning anything
 *            else, or the clone operation compounds the mess.
 *
 * Treating a DRIFT dimension as if it were just thin (and cloning on top of
 * it) locks in duplicate, inconsistently-named templates permanently. This
 * is why the classification checks for ANY unique (non-matching) entries
 * before it ever looks at the ratio.
 */

var PARITY_RATIO = 0.95; // count/canonicalCount at or above this = treat as parity, not "thin"

/**
 * @param {Object} row {canonicalCount:number, count:number, sharedWithCanonical:number}
 *   sharedWithCanonical = how many of this instance's entries actually match
 *   a canonical entry (by name/key) — NOT just the smaller of the two counts.
 * @return {'NOT_BUILT'|'DRIFT'|'SUBSET'|'PARITY'}
 */
function classifyTemplateParity_(row) {
  if (row.count === 0 && row.canonicalCount > 0) return 'NOT_BUILT';

  var unique = row.count - row.sharedWithCanonical;
  if (unique > 0) return 'DRIFT'; // checked BEFORE the ratio — drift matters more than volume

  var ratio = row.canonicalCount > 0 ? row.count / row.canonicalCount : 1;
  return ratio >= PARITY_RATIO ? 'PARITY' : 'SUBSET';
}

/**
 * The freeze-and-clone sequencing rule: DRIFT dimensions must be reconciled
 * before anything is cloned onto them (cloning onto an already-diverged
 * config just creates more duplicates); NOT_BUILT and SUBSET dimensions are
 * clone-safe immediately. This is why drift-cleanup always sorts first.
 */
function buildParityReport_(dimensions) {
  var order = { DRIFT: 0, NOT_BUILT: 1, SUBSET: 2, PARITY: 3 };
  return dimensions.map(function (d) {
    return Object.assign({}, d, { status: classifyTemplateParity_(d) });
  }).sort(function (a, b) { return order[a.status] - order[b.status]; });
}
