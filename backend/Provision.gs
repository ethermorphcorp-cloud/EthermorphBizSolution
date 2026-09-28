/** Provision.gs — called by the Command Center's admin web app (Apps Script project bound to the Command Center) to set
 *  up a hotel right after it adds the Customers row. POST body (JSON): {action, token, cusId}.
 *
 *  Only Ethermorph can call it: `token` is the caller's OAuth token (ScriptApp.getOAuthToken() in the Command Center
 *  project) and Google's tokeninfo must say it belongs to the account this web app runs as (Execute as: Me).
 *
 *    ping   → {appType, url}                           the Command Center checks the link before it starts
 *    setup  → setupShop(cusId): spreadsheet, sheets, owner / 1234, Drive folders, APP_URL (a demo hotel also gets
 *             the sample data here, as in setup())
 *    seed   → sample data for a hotel that is not a demo (TRIAL / ACTIVE): the demo hotel's company, room types,
 *             rooms, users, customers, bookings, income, expenses and receipts — under the hotel's own name.
 *             Demo attachments are left out: their files exist only in demo mode. Clear it all with resetAllData().
 */
var PROVISION_BUSY_TTL = 360;   // seconds: one action at a time per hotel (an execution never runs longer)

function doPost(e) {
  var out, id = '', busy = '';
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    provisionAuth_(req.token);
    var fn = PROVISION_ACTIONS[req.action];
    if (!fn) throw new Error('ไม่รู้จักคำสั่ง ' + req.action);
    if (req.action !== 'ping') {
      id = String(req.cusId || '').trim().toUpperCase();
      var c = CacheService.getScriptCache();
      if (c.get('provision_' + id)) throw new Error(id + ' กำลังตั้งค่าอยู่ — รอสักครู่แล้วกดตรวจสถานะ');
      busy = 'provision_' + id;
      c.put(busy, '1', PROVISION_BUSY_TTL);
      clearRegistryCache();   // the row was just added by a script, which fires no onEdit trigger
    }
    out = {ok: true, data: fn(id)};
  } catch (err) {
    console.error('provision: ' + err.message);
    out = {ok: false, error: err.message};
  } finally {
    if (busy) CacheService.getScriptCache().remove(busy);
    SHOP = null;
    resetRequest_();
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

var PROVISION_ACTIONS = {
  ping: function () { return {appType: APP_TYPE, url: webAppUrl_()}; },
  setup: function (id) { var log = setupShop(id); return provisionRow_(id, log); },
  seed: function (id) {
    var shop = useShop_(id, true), log = [];
    if (!shop.sheetId) throw new Error(id + ' ยังไม่มี Spreadsheet — รันขั้น setup ก่อน');
    if (!readTable('RoomTypes').length) {
      log.push(seedDemoMasters_());
      writeKV('Company', {hotelName: shop.name || ''});   // the demo company details stay, under this hotel's name
    }
    if (!readTable('RoomIncome').length) log.push(seedDemoData_());
    if (readTable('RoomIncome').length && !readTable('Receipts').length) log.push(seedDemoReceipts_());
    return provisionRow_(id, id + ': ' + (log.filter(String).join(' · ') || 'sample data already there'));
  }
};

/** The caller must be the account this web app runs as. Throws otherwise. */
function provisionAuth_(token) {
  if (!token) throw new Error('ไม่ได้รับอนุญาต');
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo', {method: 'post', payload: {access_token: String(token)}, muteHttpExceptions: true});
  var info = {};
  try { info = JSON.parse(res.getContentText()); } catch (e) {}
  var me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (res.getResponseCode() !== 200 || !me || String(info.email || '').toLowerCase() !== me || String(info.email_verified) !== 'true' ||
      String(info.scope || '').indexOf('https://www.googleapis.com/auth/script.external_request') < 0) {
    throw new Error('ไม่ได้รับอนุญาต');
  }
}

/** What the Command Center shows after each step: the hotel's row as it is now. */
function provisionRow_(id, log) {
  clearRegistryCache();
  var row = registry_()[id] || {};
  return {cusId: id, sheetId: row.SHEET_ID || '', driveFolderId: row.DRIVE_FOLDER_ID || '', appUrl: row.APP_URL || '',
          demo: isDemo_(row), log: log};
}
