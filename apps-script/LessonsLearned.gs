/**
 * LessonsLearned.gs — turning your own inspection-failure history into a
 * prioritized, spec-tied training register, automatically.
 *
 * Quality-requirements specs commonly obligate incorporating lessons learned
 * into ongoing trade training — but "incorporate lessons learned" usually
 * means someone reading a failure log by hand and hoping they remember what
 * mattered. This does the mining mechanically: aggregate classified
 * inspection failures by pattern, promote a pattern to a "lesson" once it
 * recurs often enough to be a real trend rather than noise, and then check
 * each lesson against what scope hasn't started yet elsewhere — because a
 * lesson about a scope not yet built anywhere else is worth far more than
 * one about a scope that's already finished.
 *
 * This is deliberately NOT "AI writes your lessons." Root cause and
 * preventive action are still a QA professional's judgment call — that part
 * doesn't scale and shouldn't pretend to. What scales is finding the
 * patterns worth that judgment, and telling you which ones are urgent.
 */

var LESSON_MIN_COUNT = 5;      // recurrences before a pattern counts as a lesson, not noise
var LESSON_CRITICAL_COUNT = 25; // recurrences before a lesson is flagged highest-priority

/**
 * @param {Array<{category:string, trade:string, pattern:string, building:string, count:number}>} tally
 *   pre-aggregated failure counts per (category, trade, pattern, building) — the
 *   output of a checklist-question rollup, not raw per-inspection rows.
 * @return {Array} tally rows that clear LESSON_MIN_COUNT, sorted highest-count first,
 *   each tagged `critical: true` once it clears LESSON_CRITICAL_COUNT.
 */
function promoteToLessons_(tally) {
  return tally
    .filter(function (row) { return row.count >= LESSON_MIN_COUNT; })
    .map(function (row) { return Object.assign({}, row, { critical: row.count >= LESSON_CRITICAL_COUNT }); })
    .sort(function (a, b) { return b.count - a.count; });
}

/**
 * For one lesson, decide how urgent it is for every OTHER building/phase on
 * the project.
 *
 * @param {Object} lesson a row from promoteToLessons_(), with `.trade`
 * @param {Object<string, Array<string>>} scopeStartedByBuilding map of
 *   building → list of trades whose scope has already started there.
 * @param {Array<string>} otherBuildings every building except the lesson's origin
 * @return {Object<string,string>} building → 'ACTIONABLE' | 'REVIEW'
 *   ACTIONABLE: that trade's scope hasn't started there yet — the highest-value
 *     carry-forward, because the preventive action can still be applied before
 *     the mistake has a chance to repeat.
 *   REVIEW: that scope already started there — verify the pattern wasn't
 *     repeated rather than assuming the lesson arrived in time.
 */
function carryForwardStatus_(lesson, scopeStartedByBuilding, otherBuildings) {
  var status = {};
  otherBuildings.forEach(function (b) {
    var started = (scopeStartedByBuilding[b] || []).indexOf(lesson.trade) !== -1;
    status[b] = started ? 'REVIEW' : 'ACTIONABLE';
  });
  return status;
}

/**
 * The full register: every lesson, with its per-building carry-forward status
 * attached, ready to render.
 */
function buildLessonsRegister_(tally, buildings, scopeStartedByBuilding) {
  var lessons = promoteToLessons_(tally);
  return lessons.map(function (lesson) {
    var others = buildings.filter(function (b) { return b !== lesson.building; });
    return Object.assign({}, lesson, {
      carryForward: carryForwardStatus_(lesson, scopeStartedByBuilding, others)
    });
  });
}
