/**
 * SectionCrosswalk.gs — one canonical key across systems that don't agree.
 *
 * The same spec section shows up differently everywhere it's referenced:
 * legacy 5-digit MasterFormat without a leading division digit ("19100"),
 * a modern 6-digit code with no separators ("033000"), a fully-formatted
 * code with a sub-paragraph locator tacked on ("01 32 33.12"), or outright
 * data-entry garbage. Every join across spec / drawings / submittals /
 * inspections depends on treating all of those as the same key. This
 * normalizes to one canonical "NN NN NN" form and — just as importantly —
 * refuses to guess on anything genuinely ambiguous, reporting it as a
 * failure instead of silently mis-joining two different sections.
 */

/**
 * @param {string} raw
 * @return {{ok:true, canonical:string} | {ok:false, reason:string}}
 */
function normalizeSectionCode_(raw) {
  var s = String(raw == null ? '' : raw).trim();
  if (!s) return { ok: false, reason: 'empty' };

  // A "/" or "," means the source cell holds more than one code — there's no
  // correct single answer to pick, so this is a refusal, not a guess.
  if (/[\/,]/.test(s)) return { ok: false, reason: 'multiple codes in one cell' };

  var compact = s.replace(/\s+/g, ''); // "01 32 33.12" -> "013233.12"
  var m = compact.match(/^(\d{5,7})(?:\.\d+)?/);
  if (!m) return { ok: false, reason: 'no leading numeric section code' };

  var digits = m[1];
  if (digits.length === 7) return { ok: false, reason: 'too many digits — ambiguous division/section split' };
  if (digits.length === 5) digits = '0' + digits; // legacy MasterFormat, no leading division digit

  return { ok: true, canonical: digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim() };
}

/**
 * One shape drives everything below: recordCounts[source][section] = count.
 * `source` is any system that references a section — a work-item log, a
 * submittal register, an inspection log, a drawing index, whatever a given
 * project actually has.
 */

/**
 * Per canonical section, how many records each source contributes, plus a
 * coarse health flag. Thresholds are deliberately coarse — this is a triage
 * signal ("look here first"), not a precision metric.
 */
function buildCoverageMatrix_(recordCounts, allSections) {
  var sources = Object.keys(recordCounts);
  return allSections.map(function (section) {
    var counts = {}, sourcesPresent = 0;
    sources.forEach(function (source) {
      var n = (recordCounts[source][section]) || 0;
      counts[source] = n;
      if (n > 0) sourcesPresent++;
    });
    var health = sourcesPresent >= 4 ? 'Strong' : sourcesPresent >= 2 ? 'OK' : 'Thin';
    return { section: section, counts: counts, sourcesPresent: sourcesPresent, health: health };
  });
}

/**
 * Orphans in both directions — a work item with nothing behind it, and
 * evidence with nowhere to attach. Each direction hides a different failure
 * mode, which is why this checks both instead of just one.
 *
 * @param {string} workItemSource the source that defines "what work exists"
 *   (e.g. a scope-of-work register) — every other source counts as evidence.
 */
function findOrphans_(recordCounts, allSections, workItemSource) {
  var evidenceSources = Object.keys(recordCounts).filter(function (s) { return s !== workItemSource; });
  function hasEvidence(section) {
    return evidenceSources.some(function (s) { return (recordCounts[s][section] || 0) > 0; });
  }
  function hasWorkItem(section) {
    return (recordCounts[workItemSource][section] || 0) > 0;
  }
  return {
    orphanWorkItems: allSections.filter(function (s) { return hasWorkItem(s) && !hasEvidence(s); }),
    orphanEvidence: allSections.filter(function (s) { return !hasWorkItem(s) && hasEvidence(s); })
  };
}
