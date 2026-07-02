/**
 * UtilizationAudit.gs — "are we using our platform well?" turned into a
 * quantified, prioritized answer instead of a gut feeling.
 *
 * Every project has an EDMS / construction-management platform that's
 * supposed to be the single system of record. Whether it actually is gets
 * asked in a meeting, answered with an impression, and never checked again.
 * This checks it: pull the populated-record count for every module across
 * every building/phase, classify the gap, and rank what to fix first.
 *
 * The one judgment call this can't make for you: whether a module is
 * STRUCTURAL (something everything else depends on — asset registers, zone
 * hierarchies, template libraries) or TRANSACTIONAL (volume that's expected
 * to grow as a building's schedule progresses — RFIs, submittals, photos).
 * A structural module sitting at 2% of its origin building's count is a real
 * gap; a transactional module doing the same thing is often just an earlier
 * building not being that far along yet. Get that classification wrong and
 * everything downstream misreads normal project tapering as a crisis, or a
 * real crisis as normal tapering — so it's an explicit input, not inferred.
 */

var UTIL_NEGLIGIBLE_RATIO = 0.05; // below this fraction of the max building's count = negligible
var UTIL_DEFAULT_FLOOR = 50;      // minimum record count before "negligible" is even meaningful

/**
 * @param {Object} row {mandated:boolean, kind:'structural'|'transactional'|'legacy',
 *   counts:Object<string,number>, thinFloor?:number}
 * @return {'UNUSED_OPTIONAL'|'ACCOUNT_WIDE_GAP'|'PROPAGATION_GAP'|'HEALTHY'}
 *
 * UNUSED_OPTIONAL   — a superseded/non-mandated module sitting at zero. Fine.
 * ACCOUNT_WIDE_GAP  — mandated, and effectively unused everywhere. Not a
 *                      building-progress issue — nobody has turned this on.
 * PROPAGATION_GAP   — populated in one building, negligible or absent in the
 *                      others. The pattern of a config/template never cloned
 *                      forward — the single biggest fix-it-once lever.
 * HEALTHY           — present everywhere, or tapering in a way consistent
 *                      with normal project-phase differences.
 */
function classifyModuleUtilization_(row) {
  var counts = row.counts;
  var buildings = Object.keys(counts);
  var values = buildings.map(function (b) { return counts[b]; });
  var total = values.reduce(function (a, b) { return a + b; }, 0);
  var floor = row.thinFloor || UTIL_DEFAULT_FLOOR;

  if (!row.mandated && total === 0) return 'UNUSED_OPTIONAL';
  if (total === 0) return 'ACCOUNT_WIDE_GAP';

  if (row.kind === 'structural') {
    var maxV = Math.max.apply(null, values);
    if (maxV < floor) return 'ACCOUNT_WIDE_GAP'; // even the best building barely touched it
    var negligibleSomewhere = buildings.some(function (b) {
      return counts[b] < maxV * UTIL_NEGLIGIBLE_RATIO;
    });
    return negligibleSomewhere ? 'PROPAGATION_GAP' : 'HEALTHY';
  }

  // transactional: tapering by building is expected — only a real flag if
  // account-wide volume never cleared the floor at all
  var maxV2 = Math.max.apply(null, values);
  return maxV2 < floor ? 'ACCOUNT_WIDE_GAP' : 'HEALTHY';
}

/** Run every module through the classifier and group by severity. */
function buildUtilizationReport_(modules) {
  var classified = modules.map(function (m) {
    return Object.assign({}, m, { status: classifyModuleUtilization_(m) });
  });
  var order = { ACCOUNT_WIDE_GAP: 0, PROPAGATION_GAP: 1, HEALTHY: 2, UNUSED_OPTIONAL: 3 };
  classified.sort(function (a, b) { return order[a.status] - order[b.status]; });
  return classified;
}
