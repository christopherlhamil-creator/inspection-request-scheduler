/**
 * BootstrapDeploy.gs — self-configuring first run, no hardcoded file IDs.
 *
 * A Spreadsheet or Drive folder ID is only valid inside the Google account
 * that created it — hardcode one and the script breaks the moment it's
 * copied to a different account (a new client, a personal sandbox, a
 * teammate's Drive). This resolves every resource **by name** instead, and
 * remembers what it found in Script Properties so the lookup only happens
 * once per account.
 *
 * Run bootstrap() once after copying this project to a fresh Google account.
 * Nothing here is fired automatically — you decide when it runs.
 */

var BOOTSTRAP_KEYS = {
  dbId: 'inspectionDbId',
  rootFolderId: 'rootFolderId'
};

/**
 * Idempotent — safe to run again. Creates whatever is missing, reuses
 * whatever it already found (by name) last time.
 */
function bootstrap() {
  var props = PropertiesService.getScriptProperties();
  var root = getOrCreateFolder_(props, BOOTSTRAP_KEYS.rootFolderId, 'Inspection Scheduler', DriveApp.getRootFolder());
  var db = getOrCreateSpreadsheetIn_(props, BOOTSTRAP_KEYS.dbId, PROJECT_CONFIG.tabName + ' Database', root);
  return { rootFolderId: root.getId(), dbId: db.getId() };
}

/**
 * Resolve a Drive folder by name under `parent`, creating it if absent.
 * The resolved ID is cached in Script Properties under `propKey` so
 * subsequent calls skip the Drive search entirely — folder lookups are the
 * slow part of a cold start, and there's no reason to repeat one.
 */
function getOrCreateFolder_(props, propKey, name, parent) {
  var cached = props.getProperty(propKey);
  if (cached) {
    try { return DriveApp.getFolderById(cached); } catch (e) { /* stale ID — fall through and re-resolve */ }
  }
  var existing = parent.getFoldersByName(name);
  var folder = existing.hasNext() ? existing.next() : parent.createFolder(name);
  props.setProperty(propKey, folder.getId());
  return folder;
}

/** Same pattern, for a Spreadsheet living inside a specific folder. */
function getOrCreateSpreadsheetIn_(props, propKey, name, parentFolder) {
  var cached = props.getProperty(propKey);
  if (cached) {
    try { return SpreadsheetApp.openById(cached); } catch (e) { /* stale ID — fall through and re-resolve */ }
  }
  var files = parentFolder.getFilesByName(name);
  var ss;
  if (files.hasNext()) {
    ss = SpreadsheetApp.open(files.next());
  } else {
    ss = SpreadsheetApp.create(name);
    var file = DriveApp.getFileById(ss.getId());
    parentFolder.addFile(file);
    DriveApp.getRootFolder().removeFile(file); // Apps Script creates new Sheets at Drive root by default
  }
  props.setProperty(propKey, ss.getId());
  return ss;
}

/** One-line health check: confirms every resolved resource still opens. */
function diagBootstrap() {
  var props = PropertiesService.getScriptProperties();
  var report = {};
  Object.keys(BOOTSTRAP_KEYS).forEach(function (label) {
    var id = props.getProperty(BOOTSTRAP_KEYS[label]);
    report[label] = id ? (tryOpen_(id) ? 'OK (' + id + ')' : 'STALE — will re-resolve on next bootstrap()') : 'not yet bootstrapped';
  });
  return report;
}

function tryOpen_(id) {
  try { DriveApp.getFileById(id); return true; } catch (e) { return false; }
}
