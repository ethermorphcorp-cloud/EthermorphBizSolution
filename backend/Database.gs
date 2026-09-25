/** Database.gs — the repository: the only file that talks to the hotel's Spreadsheet.
 *  Rules: batch reads/writes (getValues/setValues), never cell by cell. Every write goes through withLock_,
 *  checks the primary key (validation layer 3), stores text only, and refreshes the master cache when a master
 *  table changed. Tables are served from the cache (MasterCache.gs TableCache) and read once per request; inside the
 *  write lock, business tables come from the sheet itself.
 */
var SS_ = {};     // spreadsheet handle per sheet id, for the life of one execution
var REQ_ = {};    // rows read during this request, per table (cleared by Api.gs and whenever the lock is taken)
var HEAD_ = {};   // header row per table, for this request

function ss_() {
  if (!SHOP) throw new Error('ยังไม่ได้เลือกโรงแรม');
  return SS_[SHOP.sheetId] || (SS_[SHOP.sheetId] = SpreadsheetApp.openById(SHOP.sheetId));
}
function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบชีต ' + name + ' — รัน setup() ก่อน');
  return sh;
}
/** The script cache is shared by every hotel (and by Retail's registry key), so each key is prefixed with the hotel id. */
function cache_() {
  if (!SHOP) throw new Error('ยังไม่ได้เลือกโรงแรม');
  var c = CacheService.getScriptCache(), pre = SHOP.id + ':';
  var full = function (k) { return pre + k; };
  return {
    get: function (k) { return c.get(pre + k); },
    put: function (k, v, ttl) { return c.put(pre + k, v, ttl); },
    remove: function (k) { return c.remove(pre + k); },
    removeAll: function (ks) { return c.removeAll(ks.map(full)); },
    getAll: function (ks) {
      var got = c.getAll(ks.map(full)), out = {};
      ks.forEach(function (k) { if (got[pre + k] != null) out[k] = got[pre + k]; });
      return out;
    },
    putAll: function (o, ttl) {
      var m = {};
      for (var k in o) m[pre + k] = o[k];
      return c.putAll(m, ttl);
    }
  };
}

/* ---------- Demo mode (DEMO_MODE in the Command Center) ----------
 * Ported from Retail. Nothing a demo visitor does reaches the Sheet. Each signed-in session keeps a private change
 * set per table in the cache — {rows} for a key/value table, else {add, upd, del} — and readTable lays it over the
 * real rows. It disappears on logout or after SANDBOX_TTL. Setup functions run with SANDBOX = null and write for real,
 * which is how the demo data gets there.
 *   SANDBOX = null  normal hotel (or setup): real writes
 *   SANDBOX = '-'   demo hotel, nobody signed in yet: writes are dropped
 *   SANDBOX = token demo hotel, signed in: writes go to that session's change set
 */
var SANDBOX = null;
var SANDBOX_TTL = 21600;   // the cache maximum: 6 hours

var SBX_REQ_ = {};   // this request: sandbox key → raw change set (or null), so a table's changes are fetched once

function sbxKey_(name) { return 'sbx_' + SANDBOX + '_' + name; }
function sbxRaw_(name) {
  var k = sbxKey_(name);
  if (!(k in SBX_REQ_)) SBX_REQ_[k] = cache_().get(k);
  return SBX_REQ_[k];
}
function sbxGet_(name) {
  var raw = sbxRaw_(name);
  return raw ? JSON.parse(raw) : {add: [], upd: {}, del: {}};
}
function sbxPut_(name, d) {
  var s = JSON.stringify(d);
  if (s.length > 30000) throw appError_('DEMO_FULL', 'ข้อมูลทดลองในรอบนี้เต็มแล้ว กรุณาออกจากระบบแล้วเข้าใหม่');   // ≤ 90 KB of Thai text
  cache_().put(sbxKey_(name), s, SANDBOX_TTL);
  SBX_REQ_[sbxKey_(name)] = s;
  if (MASTER_TABLES[name]) MasterCache.bumpSandbox();
  delete REQ_[name];
}
/** Shape a record the way readTable returns it after a round trip through the text-formatted sheet. */
function sbxRow_(name, obj) {
  var o = {};
  SCHEMA[name].forEach(function (h) { o[h] = cast_(h, toCell_(obj[h])); });
  return o;
}
function sbxApply_(name, rows) {
  if (!SANDBOX || SANDBOX === '-') return rows;
  var raw = sbxRaw_(name);
  if (!raw) return rows;
  var d = JSON.parse(raw), col = SCHEMA[name][0];
  if (d.rows) return d.rows;
  return rows.filter(function (r) { return !d.del[r[col]]; })
    .map(function (r) { return d.upd[r[col]] || r; })
    .concat(d.add);
}
function sbxClear_(token) {
  SBX_REQ_ = {};
  cache_().removeAll(Object.keys(SCHEMA).map(function (n) { return 'sbx_' + token + '_' + n; }).concat(['sbxv_' + token]));
}
function sbxInsert_(name, objs) {
  if (SANDBOX === '-') return objs.length;
  var d = sbxGet_(name);
  objs.forEach(function (o) { d.add.push(sbxRow_(name, o)); });
  sbxPut_(name, d);
  return objs.length;
}
function sbxUpdate_(name, id, obj) {
  if (SANDBOX === '-') return obj;
  var col = SCHEMA[name][0], d = sbxGet_(name), row = sbxRow_(name, obj);
  var i = d.add.map(function (r) { return String(r[col]); }).indexOf(String(id));
  if (i >= 0) d.add[i] = row; else d.upd[id] = row;
  sbxPut_(name, d);
  return obj;
}
function sbxDelete_(name, id) {
  if (SANDBOX === '-') return true;
  var col = SCHEMA[name][0], d = sbxGet_(name);
  var i = d.add.map(function (r) { return String(r[col]); }).indexOf(String(id));
  if (i >= 0) d.add.splice(i, 1); else { d.del[id] = 1; delete d.upd[id]; }
  sbxPut_(name, d);
  return true;
}

/* ---------- Cell conversion ---------- */

/** Sheet cell -> JS value. Every column is text; NUM_COLS / BOOL_COLS are converted back. */
function cast_(h, v) {
  if (v instanceof Date) v = Utilities.formatDate(v, TZ, 'yyyy-MM-dd');   // a date typed by hand into the sheet
  if (NUM_COLS[h]) return Number(v) || 0;
  if (BOOL_COLS[h]) return v === true || String(v).toUpperCase() === 'TRUE';
  return v === null || v === undefined ? '' : String(v);
}
/** JS value -> text for the sheet. Strings are written as-is, so '0812345678' keeps its leading zero. */
function toCell_(v) {
  if (v === undefined || v === null) return '';
  if (v === true) return 'TRUE';
  if (v === false) return 'FALSE';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/* ---------- Reads ---------- */

/** A whole table as an array of objects (one batch getValues). In demo mode, with the session's changes.
 *  Returns copies: callers may change them freely. */
function readTable(name) {
  return sbxApply_(name, readSheet_(name)).map(function (r) {
    var o = {};
    for (var k in r) o[k] = r[k];
    return o;
  });
}
function readSheet_(name) {
  if (REQ_[name]) return REQ_[name];
  // a table written in the current lock is read from the sheet until its version is bumped; inside a real write
  // lock business tables always are (key checks, overlaps and numbers never rely on the cache)
  var live = LOCK_BUMP_[name] || (LOCK_DEPTH_ > 0 && SANDBOX === null && !MASTER_TABLES[name]);
  var rows = tcCached_(name) && !live ? TableCache.table(name, function () { return readRaw_(name); }) : readRaw_(name);
  REQ_[name] = rows;
  return rows;
}
function readRaw_(name) {
  var values = sheet_(name).getDataRange().getValues();
  var head = (values.shift() || SCHEMA[name]).map(String);
  HEAD_[name] = head;
  return values.filter(function (r) { return String(r[0]).length; }).map(function (r) {
    var o = {};
    head.forEach(function (h, i) { if (h) o[h] = cast_(h, r[i]); });
    return o;
  });
}
/** One record by primary key, or null. */
function findById(name, id) {
  var col = SCHEMA[name][0];
  return readTable(name).filter(function (r) { return String(r[col]) === String(id); })[0] || null;
}

/** key/value sheets (Config, Company). */
function readKV(name) {
  var o = {};
  readTable(name).forEach(function (r) {
    var v = r.value;
    if (typeof v === 'string' && (v.charAt(0) === '{' || v.charAt(0) === '[')) { try { v = JSON.parse(v); } catch (e) {} }
    else if (v === 'TRUE' || v === 'FALSE') v = v === 'TRUE';
    else if (KV_NUM[r.key]) v = Number(v) || 0;
    o[r.key] = v;
  });
  return o;
}

/* ---------- Writes ---------- */

function header_(name) {
  if (HEAD_[name]) return HEAD_[name];
  var sh = sheet_(name);
  HEAD_[name] = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
  return HEAD_[name];
}
/** Cells in the order of the sheet's own header row. */
function rowValues_(name, obj) {
  return header_(name).map(function (h) { return toCell_(obj[h]); });
}
/** Called after every real write to a table. */
function touched_(name) {
  delete REQ_[name];
  if (tcCached_(name)) LOCK_BUMP_[name] = 1;   // bumped after flush, still inside the lock (see withLock_)
}

/** Append one or many records in a single setValues call. Refuses a primary key that already exists. */
function insertRows(name, objs) {
  if (!objs.length) return 0;
  return withLock_(function () {
    if (!NO_PK[name]) assertNewKeys_(name, objs);
    if (SANDBOX !== null) return sbxInsert_(name, objs);
    var sh = sheet_(name), head = header_(name);
    var rows = objs.map(function (o) { return rowValues_(name, o); });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, head.length).setNumberFormat('@').setValues(rows);
    touched_(name);
    return objs.length;
  });
}
function insertRow(name, obj) { insertRows(name, [obj]); return obj; }

function assertNewKeys_(name, objs) {
  var col = SCHEMA[name][0], seen = {};
  readTable(name).forEach(function (r) { seen[String(r[col])] = 1; });
  objs.forEach(function (o) {
    var id = String(o[col] === undefined ? '' : o[col]);
    if (!id) throw appError_('VALIDATION', 'ไม่มีรหัสรายการ (' + col + ') กรุณาลองใหม่', col);
    if (seen[id]) throw appError_('DUPLICATE', 'รหัส ' + id + ' มีอยู่แล้ว กรุณาใช้รหัสอื่น', col);
    seen[id] = 1;
  });
}

/** Sheet row number (1-based) of a record by its primary key, or -1. */
function findRowIndex_(sh, name, id) {
  var col = header_(name).indexOf(SCHEMA[name][0]) + 1;
  var n = sh.getLastRow();
  if (n < 2 || col < 1) return -1;
  var ids = sh.getRange(2, col, n - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

/** Merge patch into the record with this primary key. The key itself cannot change. Returns the merged record. */
function updateRow(name, id, patch) {
  var col = SCHEMA[name][0];
  if (patch[col] !== undefined && String(patch[col]) !== String(id)) {
    throw appError_('VALIDATION', 'แก้ไขรหัส ' + col + ' ของรายการที่บันทึกแล้วไม่ได้', col);
  }
  return withLock_(function () {
    var cur = findById(name, id);
    if (!cur) throw appError_('NOT_FOUND', 'ไม่พบรายการ ' + id + ' อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');
    for (var k in patch) cur[k] = patch[k];
    if (SANDBOX !== null) return sbxUpdate_(name, id, cur);
    var sh = sheet_(name), r = findRowIndex_(sh, name, id), head = header_(name);
    if (r < 0) throw appError_('NOT_FOUND', 'ไม่พบรายการ ' + id + ' อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');
    sh.getRange(r, 1, 1, head.length).setNumberFormat('@').setValues([rowValues_(name, cur)]);
    touched_(name);
    return cur;
  });
}

/** Several updates in one write: patches = {id: patch}. Reads the table once, writes the changed rows back as one
 *  block (first to last changed row). Returns the merged records. */
function updateRows(name, patches) {
  var ids = Object.keys(patches);
  if (!ids.length) return [];
  return withLock_(function () {
    var col = SCHEMA[name][0], byId = {};
    readTable(name).forEach(function (r) { byId[String(r[col])] = r; });
    var merged = ids.map(function (id) {
      var cur = byId[id];
      if (!cur) throw appError_('NOT_FOUND', 'ไม่พบรายการ ' + id + ' อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');
      for (var k in patches[id]) if (k !== col) cur[k] = patches[id][k];
      return cur;
    });
    if (SANDBOX !== null) { merged.forEach(function (r) { sbxUpdate_(name, r[col], r); }); return merged; }
    var sh = sheet_(name), head = header_(name), last = sh.getLastRow();
    var keyCol = head.indexOf(col);
    var values = sh.getRange(2, 1, last - 1, head.length).getValues(), at = {}, lo = Infinity, hi = -1;
    values.forEach(function (r, i) { at[String(r[keyCol])] = i; });
    merged.forEach(function (r) {
      var i = at[String(r[col])];
      if (i === undefined) throw appError_('NOT_FOUND', 'ไม่พบรายการ ' + r[col] + ' อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');
      values[i] = rowValues_(name, r);
      lo = Math.min(lo, i); hi = Math.max(hi, i);
    });
    var block = values.slice(lo, hi + 1).map(function (r) { return r.map(function (v) { return cast_('', v); }); });
    sh.getRange(lo + 2, 1, block.length, head.length).setNumberFormat('@').setValues(block);
    touched_(name);
    return merged;
  });
}

function deleteRow(name, id) {
  return withLock_(function () {
    if (!findById(name, id)) return false;
    if (SANDBOX !== null) return sbxDelete_(name, id);
    var sh = sheet_(name), r = findRowIndex_(sh, name, id);
    if (r < 0) return false;
    sh.deleteRow(r);
    touched_(name);
    return true;
  });
}

/** Upsert keys into a key/value sheet (keys not in patch are kept). */
function writeKV(name, patch) {
  return withLock_(function () {
    if (SANDBOX !== null) {
      var merged = {};
      readTable(name).forEach(function (r) { merged[r.key] = r.value; });
      for (var k in patch) merged[k] = toCell_(patch[k]);
      if (SANDBOX !== '-') sbxPut_(name, {rows: Object.keys(merged).map(function (key) { return {key: key, value: merged[key]}; })});
      return patch;
    }
    var sh = sheet_(name), last = sh.getLastRow();
    var rows = last > 1 ? sh.getRange(2, 1, last - 1, 2).getValues() : [];
    var at = {};
    rows.forEach(function (r, i) { at[String(r[0])] = i; });
    Object.keys(patch).forEach(function (key) {
      var v = toCell_(patch[key]);
      if (key in at) rows[at[key]][1] = v; else { at[key] = rows.length; rows.push([key, v]); }
    });
    if (rows.length) sh.getRange(2, 1, rows.length, 2).setNumberFormat('@').setValues(rows.map(function (r) { return [String(r[0]), cast_('value', r[1])]; }));
    touched_(name);
    return patch;
  });
}

/* ---------- LockService ----------
 * Every write goes through withLock_ so two users never clash. Nested calls (a save that takes a document number,
 * writes two tables and the audit log) share one lock: only the outermost call acquires and releases it, so the
 * whole save is one critical section. On acquiring, the per-request read memo is dropped so everything read inside
 * the lock is current. Before releasing: flush the writes, then bump the master cache versions, so no other request
 * can cache the old rows under the new version.
 * Demo sessions write to their own cache sandbox and never take the script lock (it is shared by every hotel).
 */
var LOCK_WAIT_MS = 30000;
var LOCK_DEPTH_ = 0;
var LOCK_BUMP_ = {};

function withLock_(fn) {
  if (LOCK_DEPTH_ > 0 || SANDBOX !== null) {
    LOCK_DEPTH_++;
    try { return fn(); } finally { LOCK_DEPTH_--; }
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) throw appError_('LOCK_TIMEOUT', 'ระบบกำลังบันทึกรายการอื่นอยู่ กรุณาลองใหม่อีกครั้ง');
  LOCK_DEPTH_ = 1;
  LOCK_BUMP_ = {};
  REQ_ = {};
  try {
    var out = fn();
    SpreadsheetApp.flush();
    return out;
  } finally {
    TableCache.bump(Object.keys(LOCK_BUMP_));
    LOCK_BUMP_ = {};
    LOCK_DEPTH_ = 0;
    lock.releaseLock();
  }
}
/** Public name used in the handoff docs. */
function withLock(fn) { return withLock_(fn); }

/* ---------- Ids and time ---------- */

/** Next running id for a table: PREFIX + number padded to `pad` (CU-0001). Call inside withLock_. */
function nextId_(name, prefix, pad) {
  var col = SCHEMA[name][0], max = 0;
  readTable(name).forEach(function (r) {
    var s = String(r[col]);
    if (s.indexOf(prefix) === 0) { var n = Number(s.slice(prefix.length)); if (n > max) max = n; }
  });
  return prefix + pad_(max + 1, pad);
}
function pad_(n, len) { var s = String(n); while (s.length < len) s = '0' + s; return s; }
function nowISO_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
/** yyyy-MM-dd plus n days (calendar arithmetic in UTC, so no time-zone drift). */
function addDays_(iso, n) {
  var p = String(iso).split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.getUTCFullYear() + '-' + pad_(d.getUTCMonth() + 1, 2) + '-' + pad_(d.getUTCDate(), 2);
}

/** Forget everything read during this request (Api.gs calls it when the request ends). */
function resetRequest_() { REQ_ = {}; HEAD_ = {}; LOCK_BUMP_ = {}; LOCK_DEPTH_ = 0; TC_REQ_ = null; SBX_REQ_ = {}; }
