/** Tenant.gs — one web app serves every hotel. The Command Center spreadsheet (Ethermorph's, shared with the Retail
 *  Template and never shared with customers) lists the customers; the URL picks one: .../exec?shop=CUS001.
 *  This project serves only rows with PACKAGE_TYPE = HOTEL.
 *
 *  Command Center tab "Customers" (header row 1, one customer per row) — keep CC_TABS in sync with Retail's Tenant.gs:
 *    CUS_ID | CUS_NAME | PACKAGE_TYPE | PACKAGE_TIER | STATUS | DEMO_MODE | SHEET_ID | DRIVE_FOLDER_ID | OWNER_EMAIL |
 *    START_DATE | EXPIRES_AT | FEATURE_OVERRIDES | APP_URL | CONTACT_NAME | CONTACT_PHONE | LAST_SEEN | REMARK |
 *    CREATED_AT | UPDATED_AT
 *  Both projects are standalone. Each installs its own onEdit trigger on the Command Center (setup ▸ setupCommandCenter):
 *  this one clears its cached registry at once and logs licence changes of HOTEL rows in License_Log.
 *
 *  Everything a module needs about the current hotel is in SHOP, set once per request by useShop_().
 */
var APP_TYPE = 'HOTEL';
var DEMO_SHOP_ID = 'DEMO-HOTEL';                          // ?demo=1 and the login screen's Demo button open this one
var SHOP = null;
var OPEN_STATUSES = {ACTIVE: 1, TRIAL: 1, DEMO: 1};       // SUSPENDED / CANCELLED cannot sign in
var REGISTRY_TTL = 300;
var CC_TABS = {
  Customers: ['CUS_ID','CUS_NAME','PACKAGE_TYPE','PACKAGE_TIER','STATUS','DEMO_MODE','SHEET_ID','DRIVE_FOLDER_ID','OWNER_EMAIL',
              'START_DATE','EXPIRES_AT','FEATURE_OVERRIDES','APP_URL','CONTACT_NAME','CONTACT_PHONE','LAST_SEEN','REMARK',
              'CREATED_AT','UPDATED_AT'],
  License_Log: ['ts','cus_id','field','old_value','new_value','by']
};

var LICENSE_COLS = {PACKAGE_TYPE: 1, PACKAGE_TIER: 1, STATUS: 1, DEMO_MODE: 1, EXPIRES_AT: 1, FEATURE_OVERRIDES: 1, SHEET_ID: 1, DRIVE_FOLDER_ID: 1};

var COMMAND_SHEET_ID = '1cIlHeQ8FsF1IUYNbOGeW-QnR6yt06WL-Jbms6_mU1eg';   // Ethermorph's Command Center (same as Retail)

/** The Command Center: Script Property COMMAND_SHEET_ID if set, else the id above. */
function commandCenter_() {
  var id = P.getProperty('COMMAND_SHEET_ID') || COMMAND_SHEET_ID;
  if (!id) throw new Error('ไม่พบ Command Center — ตั้ง Script Property COMMAND_SHEET_ID');
  return SpreadsheetApp.openById(id);
}

/** Every customer row, keyed by CUS_ID. Cached for REGISTRY_TTL seconds. */
function registry_() {
  var hit = CacheService.getScriptCache().get('registry');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var sh = commandCenter_().getSheetByName('Customers');
  if (!sh) throw new Error('ไม่พบแท็บ Customers ใน Command Center — รัน setup()');
  var values = sh.getDataRange().getValues();
  var head = values.shift().map(function (h) { return String(h).trim().toUpperCase(); });
  var out = {};
  values.forEach(function (r) {
    var o = {};
    head.forEach(function (h, i) {   // date cells come back as Date: keep them as yyyy-MM-dd whatever the sheet's locale
      o[h] = r[i] instanceof Date ? Utilities.formatDate(r[i], TZ, 'yyyy-MM-dd') : String(r[i] === null ? '' : r[i]).trim();
    });
    if (o.CUS_ID) out[o.CUS_ID.toUpperCase()] = o;
  });
  CacheService.getScriptCache().put('registry', JSON.stringify(out), REGISTRY_TTL);
  return out;
}
function clearRegistryCache() { CacheService.getScriptCache().remove('registry'); return 'ok'; }

/** Picks the hotel for this request. Throws a Thai message the login screen / error page can show.
 *  forSetup skips the status, expiry and SHEET_ID checks so Setup.gs can prepare a hotel before it opens. */
function useShop_(id, forSetup) {
  id = String(id || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,32}$/.test(id)) throw appError_('SHOP', 'ลิงก์ไม่ถูกต้อง — ไม่ได้ระบุรหัสโรงแรม กรุณาเปิดจากลิงก์ที่ได้รับจาก Ethermorph');
  var row = registry_()[id];
  if (!row) throw appError_('SHOP', 'ไม่พบโรงแรมรหัส ' + id + ' กรุณาตรวจสอบลิงก์');
  if (String(row.PACKAGE_TYPE).toUpperCase() !== APP_TYPE) throw appError_('SHOP', 'รหัส ' + id + ' ไม่ได้ใช้ระบบโรงแรม');
  var status = String(row.STATUS).toUpperCase();
  var exp = parseDate_(row.EXPIRES_AT);
  if (!forSetup) {
    if (!OPEN_STATUSES[status]) throw appError_('SHOP', 'โรงแรมนี้ถูกระงับการใช้งาน กรุณาติดต่อ Ethermorph');
    if (exp && exp < today_()) throw appError_('SHOP', 'สิทธิ์การใช้งานหมดอายุเมื่อ ' + exp.split('-').reverse().join('/') + ' กรุณาติดต่อ Ethermorph');
    if (!row.SHEET_ID) throw appError_('SHOP', 'โรงแรม ' + id + ' ยังไม่ได้ตั้งค่า กรุณาติดต่อ Ethermorph');
  }
  var tier = String(row.PACKAGE_TIER).toUpperCase();
  SHOP = {
    id: id, name: row.CUS_NAME, status: status, tier: FEATURES[tier] ? tier : Object.keys(FEATURES)[0],
    sheetId: row.SHEET_ID, driveId: row.DRIVE_FOLDER_ID, overrides: parseJson_(row.FEATURE_OVERRIDES),
    demo: isDemo_(row)
  };
  return SHOP;
}

function shopPackage_() { return SHOP.tier; }
/** Feature flags = the tier's flags plus this hotel's FEATURE_OVERRIDES (e.g. {"upload":false}). */
function shopFeatures_() {
  var f = {}, base = FEATURES[shopPackage_()];
  for (var k in base) f[k] = base[k];
  for (var o in SHOP.overrides) if (o in f) f[o] = SHOP.overrides[o] === true;
  return f;
}
/** Password pepper per hotel, in Script Properties (never in a sheet). Created by setupShop. */
function shopSalt_() {
  var s = P.getProperty('SALT_' + SHOP.id);
  if (!s) throw new Error('โรงแรม ' + SHOP.id + ' ยังไม่มีค่า SALT — รัน setup()');
  return s;
}

/** The web app's public link (…/exec): the deployment users open. `clasp deploy --deploymentId <id>` puts each new
 *  version on the same deployment, so the link never changes. Script Property WEBAPP_URL overrides it (another
 *  deployment, a custom domain; APP_BASE_URL is Retail's name for it and wins). ScriptApp.getService().getUrl() is only
 *  the last resort: run from the editor it returns the /dev test link, which only the script's editors can open. */
var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbydnWSudHs-34atLkR4bOb2NIe-IoqzoaJbcyrsGrFP7XRWDMswk0-eikiUt4rg29HxqQ/exec';
function webAppUrl_() {
  var props = PropertiesService.getScriptProperties(), prop = props.getProperty('APP_BASE_URL') || props.getProperty('WEBAPP_URL');
  if (prop) return String(prop).trim();
  if (WEBAPP_URL) return WEBAPP_URL;
  var u = ScriptApp.getService().getUrl() || '';
  return /\/exec$/.test(u) ? u : '';
}

/** Installable onEdit trigger on the Command Center (ensureEditTrigger_ in Setup.gs), ported from Retail: forget this
 *  project's cached registry, and log licence changes of HOTEL rows (a PACKAGE_TYPE changed away from HOTEL too).
 *  Retail's own trigger logs its rows, so nothing is logged twice. */
function onCommandCenterEdit(e) {
  if (!e || !e.range || e.range.getSheet().getName() !== 'Customers' || e.range.getRow() < 2) return;
  clearRegistryCache();
  var sh = e.range.getSheet();
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(function (h) { return String(h).trim().toUpperCase(); });
  var block = sh.getRange(e.range.getRow(), 1, e.range.getNumRows(), head.length).getDisplayValues();
  var single = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1;
  var idCol = head.indexOf('CUS_ID'), typeCol = head.indexOf('PACKAGE_TYPE');
  var rows = [];
  block.forEach(function (vals) {
    var mine = String(vals[typeCol]).trim().toUpperCase() === APP_TYPE ||
      (single && head[e.range.getColumn() - 1] === 'PACKAGE_TYPE' && String(e.oldValue || '').trim().toUpperCase() === APP_TYPE);
    if (!mine) return;
    for (var c = 0; c < e.range.getNumColumns(); c++) {
      var i = e.range.getColumn() - 1 + c, field = head[i];
      if (!LICENSE_COLS[field]) continue;
      rows.push([nowISO_(), vals[idCol], field, single ? (e.oldValue || '') : '(หลายช่อง)', vals[i], (e.user && e.user.getEmail()) || '']);
    }
  });
  if (!rows.length) return;
  var log = e.source.getSheetByName('License_Log');
  if (log) log.getRange(log.getLastRow() + 1, 1, rows.length, rows[0].length).setNumberFormat('@').setValues(rows);
}

/** Writes one cell of the hotel's row (SHEET_ID, DRIVE_FOLDER_ID, APP_URL, LAST_SEEN …). */
function setShopField_(id, field, value) {
  var sh = commandCenter_().getSheetByName('Customers');
  var values = sh.getDataRange().getDisplayValues();
  var head = values[0].map(function (h) { return String(h).trim().toUpperCase(); });
  var col = head.indexOf(field), idCol = head.indexOf('CUS_ID');
  if (col < 0 || idCol < 0) throw new Error('แท็บ Customers ไม่มีคอลัมน์ ' + (col < 0 ? field : 'CUS_ID'));
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][idCol]).trim().toUpperCase() === id) {
      sh.getRange(r + 1, col + 1).setValue(value);
      clearRegistryCache();
      return true;
    }
  }
  throw new Error('ไม่พบรหัส ' + id + ' ในแท็บ Customers');
}

/** LAST_SEEN, written at most once a day per hotel so sign-ins stay cheap. */
function touchLastSeen_() {
  var key = 'seen_' + SHOP.id + '_' + today_();
  var c = CacheService.getScriptCache();
  if (c.get(key)) return;
  try { setShopField_(SHOP.id, 'LAST_SEEN', nowISO_()); c.put(key, '1', 21600); }
  catch (e) { console.warn('LAST_SEEN: ' + e.message); }
}

/** DEMO_MODE checkbox: ticked = demo (nothing is saved for real). Blank cell: STATUS = DEMO decides. */
function isDemo_(row) {
  var v = String(row.DEMO_MODE || '').trim().toUpperCase();
  if (!v) return String(row.STATUS).toUpperCase() === 'DEMO';
  return /^(TRUE|YES|Y|1|ON|เปิด)$/.test(v);
}

/** dd/MM/yyyy or yyyy-MM-dd -> yyyy-MM-dd; '' when blank or unreadable. */
function parseDate_(s) {
  s = String(s || '').trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + pad_(m[2], 2) + '-' + pad_(m[1], 2);
  return '';
}
function parseJson_(s) {
  if (!s) return {};
  try { var o = JSON.parse(s); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}
