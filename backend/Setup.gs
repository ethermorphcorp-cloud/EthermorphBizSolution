/** Setup.gs — run from the Apps Script editor. Every function here is safe to run again; none deletes data
 *  except resetAllData().
 *
 *  setup()              start here. Command Center tabs (adds missing columns only), the demo hotel row DEMO-HOTEL,
 *                       then every PACKAGE_TYPE = HOTEL row: blank SHEET_ID → new Spreadsheet (written back), pepper
 *                       SALT_<CUS_ID>, every sheet in SCHEMA, Config / Company / Dropdown defaults, owner / 1234,
 *                       Drive folders and APP_URL. The demo hotel also gets the sample master data (Demo.gs).
 *                       Run it again after the first deploy to fill APP_URL.
 *  setupShop('CUS001')  the same for one hotel (call it from a small wrapper — the Run button passes no arguments)
 *  resetAllData()       wipes every data row of one hotel (headers stay). Set the Script Property ALLOW_RESET to the
 *                       hotel's CUS_ID, run, and it removes the property itself. Run setup() afterwards.
 */
var SETUP = {
  HEAD_BG: '#e3f3f1',   // design token primary-soft
  HEAD_FG: '#0a5a54'    // design token primary-hover
};

function setup() {
  var log = [setupCommandCenter(), ensureDemoRow_(), setupPendingShops()];
  var url = ScriptApp.getService().getUrl();
  log.push(url ? 'web app: ' + url + '?shop=<CUS_ID>  ·  demo: ' + url + '?demo=1'
               : 'not deployed yet — Deploy ▸ New deployment ▸ Web app, then run setup() again to fill APP_URL');
  var out = log.join('\n');
  console.log(out);
  return out;
}

/** The Command Center's Customers and License_Log tabs: missing tabs are created, missing columns appended
 *  (header names compared in upper case — License_Log's are lower case). A column whose header repeats an earlier
 *  one and holds no data is removed (an earlier version of this function added License_Log's header again on
 *  every run). */
function setupCommandCenter() {
  var ss = commandCenter_(), log = [];
  var headOf = function (sh) {
    return sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
      .map(function (h) { return String(h).trim().toUpperCase(); }) : [];
  };
  Object.keys(CC_TABS).forEach(function (name) {
    var cols = CC_TABS[name];
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var have = headOf(sh), removed = 0;
    for (var c = have.length - 1; c >= 0; c--) {
      if (!have[c] || have.indexOf(have[c]) === c) continue;
      var rows = sh.getLastRow() - 1;
      var empty = rows < 1 || sh.getRange(2, c + 1, rows, 1).getValues().every(function (v) { return v[0] === '' || v[0] === null; });
      if (empty) { sh.deleteColumn(c + 1); removed++; }
    }
    if (removed) { have = headOf(sh); log.push(name + ': removed ' + removed + ' repeated empty columns'); }
    var missing = cols.filter(function (c) { return have.indexOf(c.toUpperCase()) < 0; });
    if (!missing.length) return;
    sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]);
    sh.getRange(1, 1, 1, have.length + missing.length)
      .setFontWeight('bold').setBackground(SETUP.HEAD_BG).setFontColor(SETUP.HEAD_FG);
    sh.setFrozenRows(1);
    log.push(name + ': added ' + missing.join(', '));
  });
  clearRegistryCache();
  return 'Command Center ready: ' + ss.getUrl() + (log.length ? ' (' + log.join('; ') + ')' : '');
}

/** The demo hotel row (one per app type, like Retail's DEMO-STARTER / DEMO-STANDARD), written into the first row
 *  with a blank CUS_ID. appendRow is not used: the DEMO_MODE checkboxes run down the whole tab, so it would land
 *  below them (row 1002). A demo row found below a blank row is moved up. */
function ensureDemoRow_() {
  var sh = commandCenter_().getSheetByName('Customers');
  var values = sh.getDataRange().getValues();
  var head = values[0].map(function (h) { return String(h).trim().toUpperCase(); });
  var idCol = head.indexOf('CUS_ID'), at = -1, blank = -1;
  if (idCol < 0) throw new Error('แท็บ Customers ไม่มีคอลัมน์ CUS_ID');
  for (var r = 1; r < values.length; r++) {
    var id = String(values[r][idCol]).trim().toUpperCase();
    if (id === DEMO_SHOP_ID) { if (at < 0) at = r; }
    else if (!id && blank < 0) blank = r;
  }
  var out;
  if (at >= 0 && (blank < 0 || blank > at)) return DEMO_SHOP_ID + ' already listed';
  if (at >= 0) {
    sh.getRange(blank + 1, 1, 1, head.length).setValues([values[at]]);
    sh.deleteRow(at + 1);
    out = 'moved ' + DEMO_SHOP_ID + ' from row ' + (at + 1) + ' to row ' + (blank + 1);
  } else {
    var row = {CUS_ID: DEMO_SHOP_ID, CUS_NAME: 'โรงแรมสาธิต · สายธาร', PACKAGE_TYPE: APP_TYPE, PACKAGE_TIER: 'STANDARD',
               STATUS: 'DEMO', DEMO_MODE: true, START_DATE: today_(), CREATED_AT: nowISO_(), REMARK: 'โรงแรมสาธิตสำหรับลูกค้าทดลองใช้'};
    var cells = head.map(function (h) { return row[h] === undefined ? '' : row[h]; });
    if (blank >= 0) sh.getRange(blank + 1, 1, 1, head.length).setValues([cells]); else sh.appendRow(cells);
    out = 'added ' + DEMO_SHOP_ID + ' at row ' + (blank >= 0 ? blank + 1 : values.length + 1);
  }
  clearRegistryCache();
  return out;
}

/** Every HOTEL row: new ones are set up, existing ones get any sheets, columns and defaults added since.
 *  One hotel failing does not stop the others. */
function setupPendingShops() {
  var reg = registry_(), done = [];
  Object.keys(reg).forEach(function (id) {
    if (String(reg[id].PACKAGE_TYPE).toUpperCase() !== APP_TYPE) return;
    try { done.push(setupShop(id)); }
    catch (e) { done.push(id + ': FAILED — ' + e.message); }
    finally { SHOP = null; resetRequest_(); }
  });
  return done.length ? done.join('\n') : 'no HOTEL rows in the Command Center';
}

/** Prepares one hotel. Blank SHEET_ID → a new spreadsheet, written back to the Command Center. */
function setupShop(cusId) {
  var shop = useShop_(cusId, true), log = [];
  if (!shop.sheetId) {
    var ss = SpreadsheetApp.create((shop.name || shop.id) + ' · Hotel');
    setShopField_(shop.id, 'SHEET_ID', ss.getId());
    shop = useShop_(shop.id, true);
    log.push('new spreadsheet ' + ss.getUrl());
  }
  if (!P.getProperty('SALT_' + shop.id)) P.setProperty('SALT_' + shop.id, Utilities.getUuid() + Utilities.getUuid());
  log.push(createSchema());
  log.push(seedDefaults_());
  if (shop.demo && !readTable('RoomTypes').length) log.push(seedDemoMasters_());
  log.push(seedOwner());
  if (shop.demo && !readTable('RoomIncome').length) log.push(seedDemoData_());
  if (shop.demo && readTable('Expenses').length && !readTable('Attachments').length) log.push(seedDemoAttachments_());
  driveRoot_();
  var url = ScriptApp.getService().getUrl();
  if (url && !registry_()[shop.id].APP_URL) setShopField_(shop.id, 'APP_URL', url + '?shop=' + shop.id);
  audit('SETUP', 'System', '', {shop: shop.id});
  return shop.id + ': ' + log.filter(String).join(' · ');
}

/** Creates every sheet in SCHEMA that is missing, appends missing columns to existing headers (never deletes or
 *  reorders), formats every column as text and styles the header. */
function createSchema() {
  var ss = ss_(), created = [], widened = [];
  Object.keys(SCHEMA).forEach(function (name, i) {
    var cols = SCHEMA[name], isNew = false;
    var sh = ss.getSheetByName(name);
    if (!sh) { sh = ss.insertSheet(name, i); created.push(name); isNew = true; }
    var have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String) : [];
    var missing = cols.filter(function (c) { return have.indexOf(c) < 0; });
    var width = have.length + missing.length;
    if (sh.getMaxColumns() < width) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
    if (missing.length) {
      sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]);
      if (!isNew) widened.push(name + ' +' + missing.join(','));
    }
    sh.getRange(1, 1, sh.getMaxRows(), width).setNumberFormat('@');   // text: leading zeros and ISO dates survive
    sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground(SETUP.HEAD_BG).setFontColor(SETUP.HEAD_FG);
    sh.setFrozenRows(1);
    if (isNew && sh.getMaxColumns() > width) sh.deleteColumns(width + 1, sh.getMaxColumns() - width);
  });
  // drop the blank "Sheet1" a new spreadsheet starts with
  ss.getSheets().forEach(function (sh) {
    if (!SCHEMA[sh.getName()] && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  ss.setSpreadsheetTimeZone(TZ);
  HEAD_ = {};
  REQ_ = {};
  var out = [];
  if (created.length) out.push('created ' + created.join(', '));
  if (widened.length) out.push('columns ' + widened.join('; '));
  return out.length ? out.join(' · ') : 'all ' + Object.keys(SCHEMA).length + ' sheets up to date';
}

/** Config and Company keys that are missing, and every dropdown group that has no options yet. */
function seedDefaults_() {
  var log = [];
  var addMissing = function (name, defaults) {
    var cur = readKV(name), patch = {};
    Object.keys(defaults).forEach(function (k) { if (!(k in cur)) patch[k] = defaults[k]; });
    if (Object.keys(patch).length) { writeKV(name, patch); log.push(name + ' +' + Object.keys(patch).length); }
  };
  addMissing('Config', DEFAULT_CONFIG);
  var company = {};
  for (var k in DEFAULT_COMPANY) company[k] = DEFAULT_COMPANY[k];
  company.hotelName = SHOP.name || '';
  addMissing('Company', company);

  var have = {};
  readTable('Dropdowns').forEach(function (d) { have[d.group] = 1; });
  var rows = [];
  Object.keys(DEFAULT_DROPDOWNS).forEach(function (g) {
    if (have[g]) return;
    DEFAULT_DROPDOWNS[g].forEach(function (o, i) {
      rows.push({key: g + '.' + o[0], group: g, code: o[0], label: o[1], sort: (i + 1) * 10, active: true});
    });
  });
  if (rows.length) { insertRows('Dropdowns', rows); log.push('Dropdowns +' + rows.length); }
  return log.join(' · ');
}

/** First user when the hotel has no Owner. Change the password right after the first sign-in. */
function seedOwner() {
  var users = readTable('Users');
  if (users.some(function (u) { return u.role === 'Owner' || u.username === 'owner'; })) return '';
  var salt = newSalt_();
  insertRow('Users', {
    userId: nextId_('Users', 'USR-', 3), username: 'owner', fullName: 'เจ้าของโรงแรม', email: '', phone: '',
    role: 'Owner', status: 'active', passwordHash: hashPassword_(DEFAULT_PASSWORD, salt), salt: salt,
    lastLoginAt: '', createdAt: nowISO_(), updatedAt: ''
  });
  return 'owner / ' + DEFAULT_PASSWORD;
}

/** Wipes all data rows of the hotel named in the ALLOW_RESET script property (headers stay). */
function resetAllData() {
  var id = P.getProperty('ALLOW_RESET');
  if (!id) throw new Error('ป้องกันการลบข้อมูล: ตั้ง Script Property ALLOW_RESET = CUS_ID ของโรงแรมที่จะล้าง แล้วรันอีกครั้ง');
  useShop_(id, true);
  var ss = ss_();
  withLock_(function () {
    Object.keys(SCHEMA).forEach(function (name) {
      var sh = ss.getSheetByName(name);
      if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getMaxColumns()).clearContent();
    });
  });
  MasterCache.clear();
  P.deleteProperty('ALLOW_RESET');
  return SHOP.id + ': all data cleared — run setup() to seed it again';
}
