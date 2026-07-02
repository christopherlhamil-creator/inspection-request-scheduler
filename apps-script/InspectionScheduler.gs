/**
 * InspectionScheduler.gs — the server engine.
 *
 * Google Apps Script backend for the inspection board. Two things here are the
 * point of the whole system:
 *
 *   1. travelConflicts_()  — travel-aware conflict detection for one inspector.
 *   2. advanceSignoff()    — the request lifecycle as an explicit state machine.
 *
 * Everything else (storage, board assembly, transport) exists to serve those.
 * Client-specific parsing of the CM platform's export lived in a separate
 * intake handler and is intentionally omitted; requests here are already
 * normalized rows.
 *
 * Style note: plain var/function, no ES6 sugar — matches Apps Script norms and
 * keeps the single global scope predictable.
 */

// ── storage ────────────────────────────────────────────────────────────────

var INSP_COLS = [
  'id', 'lane', 'building', 'zone', 'description', 'company', 'poc',
  'req_date', 'req_time', 'status', 'result',
  'qc_tech', 'field_engineer', 'note', 'record_id', 'updated_at'
];

function getDb_() {
  return SpreadsheetApp.openById(PROJECT_CONFIG.dbId);
}

function getTab_() {
  var ss = getDb_();
  var sh = ss.getSheetByName(PROJECT_CONFIG.tabName);
  if (!sh) {
    sh = ss.insertSheet(PROJECT_CONFIG.tabName);
    sh.appendRow(INSP_COLS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readRows_() {
  var sh = getTab_();
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var head = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var r = {};
    for (var c = 0; c < head.length; c++) r[head[c]] = values[i][c];
    rows.push(r);
  }
  return rows;
}

/**
 * UPSERT by id — never delete a row, so a request's history survives edits.
 * Returns the row's 1-based sheet index.
 */
function upsertRow_(rec) {
  var sh = getTab_();
  var ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  rec.updated_at = nowIso_();
  var line = INSP_COLS.map(function (k) { return rec[k] == null ? '' : rec[k]; });
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === rec.id) {
      sh.getRange(i + 2, 1, 1, INSP_COLS.length).setValues([line]);
      return i + 2;
    }
  }
  sh.appendRow(line);
  return sh.getLastRow();
}

// ── travel-aware conflict detection ────────────────────────────────────────

/**
 * The core algorithm. Given the day's scheduled inspections for the single
 * authority inspector, flag any adjacent pair whose time gap is smaller than
 * the travel time between their zones — i.e. physically impossible for one
 * person to make.
 *
 * Mutates each row's `_conflict` field (string reason, or '' when clear) and
 * returns the count flagged.
 */
function travelConflicts_(rows) {
  rows.forEach(function (r) { r._conflict = ''; });

  var live = rows.filter(function (r) {
    return CLOSED_STATES.indexOf(r.status) === -1 &&
           PROJECT_CONFIG.lanes[r.lane] &&
           PROJECT_CONFIG.lanes[r.lane].conflictScan &&
           r.req_date && r.req_time;
  });

  // Group by day, then walk each day in time order comparing neighbours.
  var byDay = {};
  live.forEach(function (r) { (byDay[r.req_date] = byDay[r.req_date] || []).push(r); });

  var flagged = 0;
  Object.keys(byDay).forEach(function (day) {
    var items = byDay[day].sort(function (a, b) { return toMin_(a.req_time) - toMin_(b.req_time); });
    for (var i = 0; i < items.length - 1; i++) {
      var prev = items[i], next = items[i + 1];
      var gap = toMin_(next.req_time) - (toMin_(prev.req_time) + PROJECT_CONFIG.inspectionMinutes);
      var need = travelMinutes_(prev.zone, next.zone);

      var clash = false, why = '';
      if (need != null) {
        if (gap < need) { clash = true; why = 'needs ' + need + ' min travel, only ' + Math.max(gap, 0) + ' min gap'; }
      } else if (toMin_(prev.req_time) === toMin_(next.req_time)) {
        clash = true; why = 'same time, zone TBD';
      }
      if (clash) {
        if (!prev._conflict) { prev._conflict = 'conflicts with ' + shortDesc_(next) + ' · ' + why; flagged++; }
        next._conflict = 'conflicts with ' + shortDesc_(prev) + ' · ' + why;
        flagged++;
      }
    }
  });
  return flagged;
}

/** Travel cost between two zone codes, or null if either is unknown. */
function travelMinutes_(a, b) {
  if (!a || !b) return null;
  var t = PROJECT_CONFIG.travel;
  if (a === b) return t.sameZone;
  var aP = String(a).split('-'), bP = String(b).split('-');
  var sameBuilding = aP[0] === bP[0];
  var sameArea = sameBuilding && aP[1] === bP[1];
  if (sameArea) return t.sameArea;
  return sameBuilding ? t.sameBuilding : t.crossBuilding;
}

// ── sign-off state machine ─────────────────────────────────────────────────

/**
 * Advance a request one step along SIGNOFF_CHAIN, enforcing legal transitions.
 * `payload` carries the data a given step needs (assignee, pass/fail, FE, …).
 * Throws on an illegal move rather than silently corrupting state.
 */
function advanceSignoff(id, toState, payload) {
  payload = payload || {};
  var rows = readRows_();
  var rec = findById_(rows, id);
  if (!rec) throw new Error('Unknown request: ' + id);

  switch (toState) {
    case 'Scheduled':                       // Dispatcher assigns a tech + slot
      requireState_(rec, ['Requested', 'RescheduleRequested', 'OnHold']);
      rec.qc_tech = payload.qc_tech || rec.qc_tech || 'unassigned';
      if (payload.req_date) rec.req_date = payload.req_date;
      if (payload.req_time) rec.req_time = payload.req_time;
      break;
    case 'Inspected':                       // QC tech records pass/fail
      requireState_(rec, ['Scheduled']);
      rec.result = payload.result === 'Fail' ? 'Fail' : 'Pass';
      if (rec.result === 'Fail') { rec.status = 'Failed'; return save_(rec); }
      break;
    case 'SuperBuyoff':                     // Super buys off, names the FE
      requireState_(rec, ['Inspected']);
      rec.field_engineer = payload.field_engineer || '';
      break;
    case 'AHJSigned':                       // Authority signs — green sticker
      requireState_(rec, ['SuperBuyoff']);
      break;
    default:
      throw new Error('Unsupported transition: ' + toState);
  }
  rec.status = toState;
  return save_(rec);
}

/** Sub-initiated moves that keep a request in the open pane. */
function subRequest(id, action, note) {
  var rec = findById_(readRows_(), id);
  if (!rec) throw new Error('Unknown request: ' + id);
  var map = { reschedule: 'RescheduleRequested', hold: 'OnHold', withdraw: 'Withdrawn', release: 'Requested' };
  if (!map[action]) throw new Error('Unknown sub action: ' + action);
  rec.status = map[action];
  if (note) rec.note = note;
  return save_(rec);
}

function requireState_(rec, allowed) {
  if (allowed.indexOf(rec.status) === -1) {
    throw new Error('Cannot move "' + rec.id + '" from ' + rec.status + '; expected one of ' + allowed.join(', '));
  }
}

function save_(rec) { upsertRow_(rec); return true; }

// ── board assembly + transport ─────────────────────────────────────────────

/**
 * Build the two-pane board payload the client renders.
 *
 * Returns a JSON STRING, not an object. google.script.run silently delivers
 * null to the success handler when an object graph contains Date values it
 * can't serialize — a Sheet cell typed as a date becomes a Date on read. We
 * flatten to plain strings and stringify so the transport is deterministic;
 * the client JSON.parses it.
 */
function getInspectionBoard(filter) {
  filter = filter || {};
  var rows = readRows_().map(cleanRow_);
  travelConflicts_(rows);

  var building = filter.building || '';
  var okBuilding = function (r) { return !building || r.building === building; };

  var left = rows.filter(function (r) { return okBuilding(r) && OPEN_STATES.indexOf(r.status) !== -1; });
  var right = rows.filter(function (r) { return okBuilding(r) && OPEN_STATES.indexOf(r.status) === -1; });

  bySlot_(left); bySlot_(right);

  var payload = {
    left: left,
    right: right,
    counts: {
      open: left.length,
      scheduled: right.filter(function (r) { return CLOSED_STATES.indexOf(r.status) === -1; }).length,
      conflicts: left.concat(right).filter(function (r) { return r._conflict; }).length,
      failed: right.filter(function (r) { return r.status === 'Failed'; }).length
    },
    generated_at: nowIso_()
  };
  return JSON.stringify(payload);
}

/** Flatten a raw sheet row to JSON-safe primitives (Dates → yyyy-MM-dd / HH:mm). */
function cleanRow_(r) {
  var out = {};
  INSP_COLS.forEach(function (k) { out[k] = r[k]; });
  out.req_date = dateStr_(r.req_date);
  out.req_time = timeStr_(r.req_time);
  out.record_url = recordUrl_(r.record_id);
  return out;
}

function recordUrl_(id) {
  var tpl = PROJECT_CONFIG.recordUrlTemplate;
  return (tpl && id) ? tpl.replace('{id}', encodeURIComponent(id)) : '';
}

// ── small helpers ──────────────────────────────────────────────────────────

function findById_(rows, id) {
  for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
  return null;
}

function bySlot_(rows) {
  rows.sort(function (a, b) {
    var da = String(a.req_date || ''), db = String(b.req_date || '');
    if (da !== db) return da < db ? -1 : 1;
    return toMin_(a.req_time) - toMin_(b.req_time);
  });
}

function shortDesc_(r) { return String(r.description || r.id).split(' — ')[0]; }
function toMin_(hhmm) { var p = String(hhmm || '').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); }

function dateStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v ? String(v) : '';
}
function timeStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  return v ? String(v) : '';
}
function nowIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}
