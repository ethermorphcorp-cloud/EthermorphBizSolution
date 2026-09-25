/** MasterCache.gs — master tables are read from CacheService before the sheet, and replaced when a master changes.
 *  Each table has its own version (a short string kept in the cache). The table is stored as JSON cut into chunks
 *  of MC_CHUNK characters under keys that include that version, so bumping the version is all it takes to
 *  invalidate it: old chunks are never read again and expire by themselves.
 *  Database.gs calls MasterCache.table() for every MASTER_TABLES read and bumps the version after each write
 *  (withLock_). master.get sends the browser the public tables plus one combined version; the browser sends the
 *  version back next time and gets {changed:false} while nothing changed.
 */
var MASTER_TABLES = {Config: 1, Company: 1, Users: 1, Dropdowns: 1, RoomTypes: 1, Rooms: 1};
var MASTER_PUBLIC = ['Company', 'Dropdowns', 'RoomTypes', 'Rooms'];   // what master.get sends (never Users)
var MC_TTL = 21600;        // the cache maximum: 6 hours
var MC_CHUNK = 30000;      // characters per chunk: ≤ 90 KB even if every one is 3-byte Thai (limit 100 KB per value)
var MC_MAX_CHUNKS = 30;    // a table bigger than this is read from the sheet every time

var MasterCache = {
  /** Current version of one table; a new one is made when the cache has none (first read, or evicted). */
  version: function (name) {
    var c = cache_(), k = 'mcv_' + name, v = c.get(k);
    if (!v) { v = newVersion_(); c.put(k, v, MC_TTL); }
    return v;
  },

  /** Rows of a master table from the cache; on a miss, load() reads the sheet and the result is cached. */
  table: function (name, load) {
    var c = cache_(), base = 'mc_' + name + '_' + MasterCache.version(name) + '_';
    var n = Number(c.get(base + 'n'));
    if (n) {
      var keys = [];
      for (var i = 0; i < n; i++) keys.push(base + i);
      var got = c.getAll(keys);
      if (keys.every(function (k) { return k in got; })) {
        try { return JSON.parse(keys.map(function (k) { return got[k]; }).join('')); } catch (e) {}
      }
    }
    var rows = load();
    var s = JSON.stringify(rows), count = Math.ceil(s.length / MC_CHUNK) || 1;
    if (count <= MC_MAX_CHUNKS) {
      var parts = {};
      for (var j = 0; j < count; j++) parts[base + j] = s.substr(j * MC_CHUNK, MC_CHUNK);
      c.putAll(parts, MC_TTL);
      c.put(base + 'n', String(count), MC_TTL);   // written last: a reader never finds a count without its chunks
    }
    return rows;
  },

  /** The table changed: every later read loads it again. Database.gs calls this after the write is flushed. */
  bump: function (name) {
    cache_().put('mcv_' + name, newVersion_(), MC_TTL);
  },

  /** A demo session changed a master table in its sandbox: only that session's bundle version changes. */
  bumpSandbox: function () {
    if (SANDBOX && SANDBOX !== '-') cache_().put('sbxv_' + SANDBOX, newVersion_(), SANDBOX_TTL);
  },

  /** Drop every master table of the current hotel (e.g. after editing a sheet by hand). */
  clear: function () {
    Object.keys(MASTER_TABLES).forEach(function (name) { MasterCache.bump(name); });
    return true;
  },

  /** master.get: {version, changed:false} when the browser is current, else the public master data. */
  bundle: function (clientVersion) {
    var v = MASTER_PUBLIC.map(function (n) { return MasterCache.version(n); }).join('.');   // before reading the data
    if (SANDBOX && SANDBOX !== '-') { var s = cache_().get('sbxv_' + SANDBOX); if (s) v += '.' + s; }
    if (clientVersion && String(clientVersion) === v) return {version: v, changed: false};
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

/** Run from the editor after editing a master sheet by hand: clears it for every hotel. */
function clearMasterCache() {
  var reg = registry_(), done = [];
  Object.keys(reg).forEach(function (id) {
    if (String(reg[id].PACKAGE_TYPE).toUpperCase() !== APP_TYPE) return;
    useShop_(id, true);
    MasterCache.clear();
    done.push(id);
  });
  SHOP = null;
  return 'cleared: ' + done.join(', ');
}
