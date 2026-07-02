/**
 * XlsxImport.gs — parsing a construction-management platform's XLSX export
 * without any external library.
 *
 * Apps Script has no native XLSX reader. An .xlsx is a zip of XML parts, so
 * this parses it directly: unzip, read the shared-string table, read the
 * sheet's cell grid, and — the part worth reading — resolve each cell's
 * hyperlink by joining the sheet's <hyperlink> elements against the
 * worksheet's *relationships* file, not the sheet XML itself. XLSX stores a
 * hyperlink's URL in a separate part and only leaves a relationship-ID
 * pointer (`r:id="rId12"`) on the cell; the actual URL lives in
 * xl/worksheets/_rels/sheetN.xml.rels, keyed by that same id. Missing this
 * join is why a naive parser sees hyperlinked cells as plain text.
 */

/**
 * @param {Blob} blob the .xlsx file
 * @param {number} sheetIndex 1-based sheet position in the workbook
 * @return {{rows: Array<Array<string>>, hyperlinks: Object<string,string>}}
 *   rows: the sheet as a 2D array of strings (shared strings resolved).
 *   hyperlinks: cell reference (e.g. "Q5") → URL, for every linked cell.
 */
function parseXlsxSheet_(blob, sheetIndex) {
  var parts = unzipToMap_(blob);
  var shared = parseSharedStrings_(parts['xl/sharedStrings.xml']);
  var sheetPath = 'xl/worksheets/sheet' + sheetIndex + '.xml';
  var relsPath = 'xl/worksheets/_rels/sheet' + sheetIndex + '.xml.rels';

  var sheetXml = parts[sheetPath];
  if (!sheetXml) throw new Error('No such sheet: ' + sheetPath);

  return {
    rows: parseSheetGrid_(sheetXml, shared),
    hyperlinks: resolveHyperlinks_(sheetXml, parts[relsPath])
  };
}

function unzipToMap_(blob) {
  var files = Utilities.unzip(blob);
  var map = {};
  files.forEach(function (f) { map[f.getName()] = f.getDataAsString('UTF-8'); });
  return map;
}

/** Shared strings are stored once and referenced by index from every cell. */
function parseSharedStrings_(xml) {
  if (!xml) return [];
  var out = [];
  var siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g, m;
  while ((m = siRe.exec(xml))) out.push(extractRunsText_(m[1]));
  return out;
}

/** A string entry (<si> or <is>) may hold one <t> or several rich-text runs. */
function extractRunsText_(xml) {
  var text = '', tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g, tm;
  while ((tm = tRe.exec(xml))) text += tm[1];
  return decodeXmlEntities_(text);
}

/**
 * Cells that are empty come through as either `<c r="B4"/>` (self-closing) or
 * `<c r="B4"></c>` — a regex that only matches the `<c ...>value</c>` form
 * silently drops every empty cell from the grid, which shifts every column
 * after it. Matching both forms and skipping only cells with no `<v>` at all
 * is what keeps column alignment correct on a sparse export.
 */
function parseSheetGrid_(xml, shared) {
  var rows = [];
  var rowRe = /<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  var cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  var rowMatch;
  while ((rowMatch = rowRe.exec(xml))) {
    var rowIdx = parseInt(rowMatch[1], 10) - 1;
    var rowXml = rowMatch[2];
    var row = rows[rowIdx] = rows[rowIdx] || [];
    cellRe.lastIndex = 0;
    var cellMatch;
    while ((cellMatch = cellRe.exec(rowXml))) {
      var attrs = cellMatch[1], inner = cellMatch[2] || '';
      var ref = (attrs.match(/r="([A-Z]+)(\d+)"/) || [])[1];
      if (!ref) continue;
      var col = colLetterToIndex_(ref);
      var type = (attrs.match(/t="(\w+)"/) || [])[1];
      if (type === 'inlineStr') {
        // rare in Excel-authored exports (which use the shared-string table
        // below) but some writer libraries inline the text directly
        var isMatch = inner.match(/<is>([\s\S]*?)<\/is>/);
        row[col] = isMatch ? extractRunsText_(isMatch[1]) : '';
        continue;
      }
      var vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
      if (!vMatch) { row[col] = ''; continue; }
      var raw = vMatch[1];
      row[col] = type === 's' ? (shared[parseInt(raw, 10)] || '') : decodeXmlEntities_(raw);
    }
  }
  return rows;
}

/**
 * The join that makes hyperlinks resolvable: the sheet lists
 * `<hyperlink ref="Q5" r:id="rId12"/>`, and the *relationships* part lists
 * `<Relationship Id="rId12" Target="https://…"/>`. Neither file alone has
 * both the cell and the URL.
 */
function resolveHyperlinks_(sheetXml, relsXml) {
  var links = {};
  if (!relsXml) return links;

  // Attribute order on <Relationship> is NOT guaranteed — real exports write
  // Type, Target, TargetMode, Id in that order, i.e. Id LAST. A regex that
  // assumes Id precedes Target matches nothing against a real file; extract
  // each attribute independently per element instead of anchoring on order.
  var relIdToUrl = {};
  var relRe = /<Relationship\b[^>]*\/>/g, rm;
  while ((rm = relRe.exec(relsXml))) {
    var tag = rm[0];
    var id = (tag.match(/\bId="(rId\d+)"/) || [])[1];
    var target = (tag.match(/\bTarget="([^"]+)"/) || [])[1];
    if (id && target) relIdToUrl[id] = decodeXmlEntities_(target);
  }

  var hlRe = /<hyperlink\b[^>]*\/>/g, hm;
  while ((hm = hlRe.exec(sheetXml))) {
    var htag = hm[0];
    var ref = (htag.match(/\bref="([A-Z]+\d+)"/) || [])[1];
    var rid = (htag.match(/\br:id="(rId\d+)"/) || [])[1];
    var url = rid && relIdToUrl[rid];
    if (ref && url) links[ref] = url;
  }
  return links;
}

function colLetterToIndex_(ref) {
  var letters = ref.match(/[A-Z]+/)[0], n = 0;
  for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

function decodeXmlEntities_(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
