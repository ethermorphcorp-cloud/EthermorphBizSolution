/** MasterCache.gs — every table is read from CacheService before the sheet (TableCache), and the master tables are
 *  also sent to the browser as one versioned bundle (MasterCache).
 *
 *  TableCache: each table has its own version (a short string in the cache). Its rows are stored compactly
 *  ({h: header, r: [[values]]}) as JSON cut into chunks under keys that include that version, so bumping the version
 *  is all it takes to invalidate it — old chunks are never read again and expire by themselves.
 *   - One request reads every version (and the sheet stamp) with a single getAll, then each table with one more
 *     getAll (its count plus the first TC_FIRST chunks); a route can prefetch several tables in one call (Api.gs reads).
 *   - Writes: Database.gs marks the table (touched_) and withLock_ bumps it after the flush, before the lock is
 *     released, so no request can cache old rows under the new version. A version created by this request (first
 *     read, or evicted) is not used to store rows in the same request, which closes the race with a bump.
 *   - Business tables (not master) are also keyed by the sheet stamp: the spreadsheet's last-updated time from Drive,
 *     checked at most every STAMP_TTL seconds. A row typed straight into the sheet shows up within about that long.
 *     Master tables keep their explicit bumps (clearMasterCache after editing them by hand).
 *   - Inside the write lock, business tables are read from the sheet itself (Database.gs readSheet_): key checks,
 *     overlaps and numbers never rely on the cache. AuditLog and Sequences are never cached.
 *  The cache is best effort: an evicted or oversized table is simply read from the sheet.
 */
var MASTER_TABLES = {Config: 1, Company: 1, Users: 1, Dropdowns: 1, RoomTypes: 1, Rooms: 1};
var MASTER_PUBLIC = ['Company', 'Dropdowns', 'RoomTypes', 'Rooms'];   // what master.get sends (never Users)
var TC_SKIP = {AuditLog: 1, Sequences: 1};
var MC_TTL = 21600;        // the cache maximum: 6 hours
var MC_CHUNK = 30000;      // characters per chunk: ≤ 90 KB even if every one is 3-byte Thai (limit 100 KB per value)
var MC_MAX_CHUNKS = 40;    // a table bigger than this (≈ 1.2 M characters) is read from the sheet every time
var TC_FIRST = 4;          // chunks asked for together with the count (most tables fit)
var STAMP_TTL = 20;        // seconds between two Drive checks of the spreadsheet's last-updated time
var TC_REQ_ = null;        // this request: {shop, v: {table: version}, fresh: {table: 1}, stamp, hit: {table: rows}}

function tcCached_(name) { return !!SCHEMA[name] && !TC_SKIP[name]; }
function tcEncode_(rows) {
  var h = rows.length ? Object.keys(rows[0]) : [];
  return JSON.stringify({h: h, r: rows.map(function (o) { return h.map(function (k) { return o[k]; }); })});
}
function tcDecode_(s) {
  var d = JSON.parse(s);
  return d.r.map(function (a) { var o = {}; d.h.forEach(function (k, i) { o[k] = a[i]; }); return o; });
}

var TableCache = {
  state_: function () {
    if (!TC_REQ_ || TC_REQ_.shop !== SHOP.id) TC_REQ_ = {shop: SHOP.id, v: null, fresh: {}, stamp: null, hit: {}};
    return TC_REQ_;
  },

  /** Every table's version (and the cached stamp) in one cache call per request. */
  versions: function () {
    var st = TableCache.state_();
    if (st.v) return st.v;
    var c = cache_(), names = Object.keys(SCHEMA).filter(tcCached_);
    var got = c.getAll(names.map(function (n) { return 'mcv_' + n; }).concat(['stamp'])), v = {}, add = {}, any = false;
    names.forEach(function (n) {
      var x = got['mcv_' + n];
      if (!x) { x = newVersion_(); add['mcv_' + n] = x; st.fresh[n] = 1; any = true; }
      v[n] = x;
    });
    if (any) c.putAll(add, MC_TTL);
    st.stamp = got.stamp || null;
    st.v = v;
    return v;
  },

  /** The spreadsheet's last-updated time (Drive), cached for STAMP_TTL seconds; 'x' when Drive cannot say. */
  stamp: function () {
    var st = TableCache.state_();
    TableCache.versions();
    if (st.stamp) return st.stamp;
    var s = 'x';
    try { s = DriveApp.getFileById(SHOP.sheetId).getLastUpdated().getTime().toString(36); } catch (e) {}
    cache_().put('stamp', s, STAMP_TTL);
    st.stamp = s;
    return s;
  },

  key_: function (name) {
    return 'tc_' + name + '_' + TableCache.versions()[name] + (MASTER_TABLES[name] ? '' : '_' + TableCache.stamp()) + '_';
  },

  /** Cached rows of several tables with as few cache calls as possible: {table: rows} for the hits.
   *  sbx: a demo session token — that session's change sets for these tables come in the same call (Database.gs). */
  fetch: function (names, sbx) {
    var c = cache_(), st = TableCache.state_(), bases = {}, keys = [], sk = [];
    if (sbx) names.forEach(function (n) { var k = 'sbx_' + sbx + '_' + n; if (!(k in SBX_REQ_)) { sk.push(k); keys.push(k); } });
    names.forEach(function (n) {
      bases[n] = TableCache.key_(n);
      keys.push(bases[n] + 'n');
      for (var i = 0; i < TC_FIRST; i++) keys.push(bases[n] + i);
    });
    var got = c.getAll(keys), more = [];
    sk.forEach(function (k) { SBX_REQ_[k] = got[k] == null ? null : got[k]; });
    names.forEach(function (n) { for (var i = TC_FIRST, cnt = Number(got[bases[n] + 'n']); i < cnt; i++) more.push(bases[n] + i); });
    if (more.length) { var extra = c.getAll(more); for (var k in extra) got[k] = extra[k]; }
    var out = {};
    names.forEach(function (n) {
      var cnt = Number(got[bases[n] + 'n']), parts = [];
      if (!cnt) return;
      for (var i = 0; i < cnt; i++) { if (got[bases[n] + i] == null) return; parts.push(got[bases[n] + i]); }
      try { out[n] = st.hit[n] = tcDecode_(parts.join('')); } catch (e) {}
    });
    return out;
  },

  /** Api.gs: the tables a route is about to read, fetched together. */
  prefetch: function (names, sbx) {
    var st = TableCache.state_();
    names = names.filter(function (n) { return tcCached_(n) && !REQ_[n] && !st.hit[n]; });
    if (names.length) TableCache.fetch(names, sbx);
  },

  /** Rows of one table from the cache; on a miss, load() reads the sheet and the result is cached. */
  table: function (name, load) {
    var st = TableCache.state_();
    if (st.hit[name]) { var h = st.hit[name]; delete st.hit[name]; return h; }
    var hit = TableCache.fetch([name])[name];
    if (hit) { delete st.hit[name]; return hit; }
    var base = TableCache.key_(name), rows = load();
    if (st.fresh[name]) return rows;   // a version made in this request: a bump may have overtaken it
    var s = tcEncode_(rows), count = Math.ceil(s.length / MC_CHUNK) || 1;
    if (count <= MC_MAX_CHUNKS) {
      var parts = {};
      for (var j = 0; j < count; j++) parts[base + j] = s.substr(j * MC_CHUNK, MC_CHUNK);
      try {
        cache_().putAll(parts, MC_TTL);
        cache_().put(base + 'n', String(count), MC_TTL);   // written last: a reader never finds a count without its chunks
      } catch (e) {}   // the cache is full or unavailable: the sheet stays the source
    }
    return rows;
  },

  /** These tables changed: every later read (this request included) loads them again. */
  bump: function (names) {
    var st = TableCache.state_(), put = {};
    names.forEach(function (n) {
      var v = newVersion_();
      put['mcv_' + n] = v;
      if (st.v) st.v[n] = v;
      delete st.hit[n];
    });
    if (names.length) cache_().putAll(put, MC_TTL);
  },

  /** Every table of the current hotel (after editing sheets by hand, setup, reset). */
  clear: function () {
    TableCache.bump(Object.keys(SCHEMA).filter(tcCached_));
    cache_().remove('stamp');
    if (TC_REQ_) TC_REQ_.stamp = null;
    return true;
  }
};

var MasterCache = {
  version: function (name) { return TableCache.versions()[name]; },
  table: function (name, load) { return TableCache.table(name, load); },
  bump: function (name) { TableCache.bump([name]); },

  /** A demo session changed a master table in its sandbox: only that session's bundle version changes. */
  bumpSandbox: function () {
    if (SANDBOX && SANDBOX !== '-') cache_().put('sbxv_' + SANDBOX, newVersion_(), SANDBOX_TTL);
  },

  /** Drop every cached table of the current hotel (master.clearCache, clearMasterCache). */
  clear: function () { return TableCache.clear(); },

  /** master.get: {version, changed:false} when the browser is current, else the public master data. */
  bundle: function (clientVersion) {
    var v = MASTER_PUBLIC.map(function (n) { return MasterCache.version(n); }).join('.');   // before reading the data
    if (SANDBOX && SANDBOX !== '-') { var s = cache_().get('sbxv_' + SANDBOX); if (s) v += '.' + s; }
    if (clientVersion && String(clientVersion) === v) return {version: v, changed: false};
    TableCache.prefetch(MASTER_PUBLIC);
    return {
      version: v,
      changed: true,
      company: readKV('Company'),
      dropdowns: readTable('Dropdowns').sort(function (a, b) {
        return a.group < b.group ? -1 : a.group > b.group ? 1 : a.sort - b.sort;
      }),
      roomTypes: readTable('RoomTypes'),
      rooms: readTable('Rooms').sort(function (a, b) { return String(a.roomNo).localeCompare(String(b.roomNo), 'en', {numeric: true}); })
    };
  }
};

function newVersion_() { return Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }

/** Run from the editor after editing any sheet by hand: clears the cached tables of every hotel. */
function clearMasterCache() {
  var reg = registry_(), done = [];
  Object.keys(reg).forEach(function (id) {
    if (String(reg[id].PACKAGE_TYPE).toUpperCase() !== APP_TYPE) return;
    try { useShop_(id, true); } catch (e) { return; }
    if (!SHOP.sheetId) return;
    MasterCache.clear();
    done.push(id);
  });
  SHOP = null;
  resetRequest_();
  return 'cleared: ' + done.join(', ');
}
/** Same, under the name the handoff uses. */
function clearCache() { return clearMasterCache(); }
