/**
 * Config.gs — configuration layer.
 *
 * In the production system every constant below was hard-wired to one client
 * (project IDs, contractor codes, deep-link URLs, personnel). Here they are
 * lifted into a single PROJECT_CONFIG object so the engine is reusable: point
 * it at a different project by editing this file only.
 *
 * Apps Script shares one global scope across all .gs files, so PROJECT_CONFIG
 * is visible everywhere without import/require.
 */

var PROJECT_CONFIG = {
  // Where the lean database lives. A dedicated Spreadsheet (not the app's own
  // bound sheet) so heavy inspection writes never contend with the rest of the
  // hub and can't trip the 10M-cell ceiling.
  dbId: 'PUT_SPREADSHEET_ID_HERE',
  tabName: 'Inspection_Requests',

  // Buildings on the project. Codes are matched against the {building} segment
  // of each zone code (see zones).
  buildings: ['B1', 'B2', 'B3'],

  // Zone codes: {building}-{area}-{sub}. The area segment drives travel cost.
  // area codes: EY electrical yard · MY mechanical yard · BL building · UT utilities
  zones: [
    'B1-EY-1', 'B1-EY-2', 'B1-MY-1', 'B1-BL-1', 'B1-BL-2', 'B1-UT',
    'B2-EY-1', 'B2-MY-1', 'B2-BL-1',
    'B3-UT'
  ],

  // Travel minutes between areas for the single inspector. The conflict scan
  // uses this to decide whether two back-to-back inspections are physically
  // possible. Real deployments load a measured matrix; these are fallbacks.
  travel: {
    sameZone: 0,   // identical zone code
    sameArea: 4,   // same building + same area (e.g. B1-EY-1 → B1-EY-2)
    sameBuilding: 9,
    crossBuilding: 22
  },

  // Minutes an inspection is assumed to occupy on site (used by the gap math).
  inspectionMinutes: 30,

  // Two independent review lanes. Only the authority-having lane shares the one
  // inspector and therefore gets conflict detection; the third-party lane is
  // reviewed and counter-signed only.
  lanes: {
    AHJ: { label: 'Authority (AHJ)', conflictScan: true },
    THIRD_PARTY: { label: 'Third-party testing', conflictScan: false }
  },

  // Deep-link back to the construction-management platform's record. {id} is
  // substituted per request; leave blank to omit the link.
  recordUrlTemplate: '' // e.g. 'https://cm.example.com/records/{id}'
};

// The sign-off chain, in order. State is one of these ids. Each step names the
// role that advances it — this is the field process encoded as a state machine.
var SIGNOFF_CHAIN = [
  { id: 'Requested',   label: 'Requested',            by: 'Subcontractor' },
  { id: 'Scheduled',   label: 'Assigned',             by: 'Dispatcher' },
  { id: 'Inspected',   label: 'Inspected (pass/fail)', by: 'QC Tech' },
  { id: 'SuperBuyoff', label: 'Super buy-off',        by: 'Superintendent' },
  { id: 'AHJSigned',   label: 'AHJ sign-off',         by: 'Authority' }
];

// States that keep a request in the left ("awaiting a slot") pane.
var OPEN_STATES = ['Requested', 'RescheduleRequested', 'OnHold'];

// Terminal states excluded from the conflict scan (nothing left to collide).
var CLOSED_STATES = ['Failed', 'AHJSigned', 'Withdrawn'];
