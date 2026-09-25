/** Api.gs — doGet, include and the router: the single entry point the browser talks to.
 *  The page is opened as .../exec?shop=CUS001 (or ?demo=1 for the demo hotel) and sends that id on every call:
 *    google.script.run.api(shop, action, token, payload)
 *      -> hotel (Command Center) -> session -> permission -> package flag -> service -> Database.gs -> Sheets
 *  Always returns {ok:true, data} or {ok:false, code, message, field}.
 *
 *  Actions that change data run as usual in a demo hotel, but Database.gs keeps their rows in the signed-in
 *  session's sandbox, never in the sheet. Actions that would touch Drive (noDemo:true) are refused in demo.
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    useShop_(p.demo === '1' ? DEMO_SHOP_ID : p.shop);
    var company = readKV('Company');
    var t = HtmlService.createTemplateFromFile('frontend/index');
    t.boot = {shop: SHOP.id, demo: SHOP.demo, hotelName: company.hotelName || SHOP.name || '', url: ScriptApp.getService().getUrl() || ''};
    return t.evaluate()
      .setTitle((company.hotelName || SHOP.name || 'Hotel') + ' · ระบบบริหารรายได้-รายจ่ายโรงแรม')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    console.error('doGet: ' + err.message);
    return HtmlService.createHtmlOutput(shopErrorPage_(err.code ? err.message : 'เปิดระบบไม่ได้ กรุณาลองใหม่อีกครั้ง'))
      .setTitle('ระบบบริหารโรงแรม').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } finally {
    SHOP = null;
    resetRequest_();
  }
}
function include(file) { return HtmlService.createHtmlOutputFromFile(file).getContent(); }

/** Unknown, suspended or expired hotel: a plain page with the reason, no app and no data. */
function shopErrorPage_(message) {
  var esc = String(message).replace(/[&<>"]/g, function (ch) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]; });
  return '<div style="font-family:\'Noto Sans Thai\',system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 16px;color:#14212b">' +
    '<h1 style="font-size:20px;margin:0 0 8px">เปิดระบบไม่ได้</h1><p style="margin:0;line-height:1.6;color:#55626c">' + esc + '</p></div>';
}

/** Route table. pub: no session needed · perm: role permission · feature: package flag ·
 *  noDemo: refused in a demo hotel. fn(payload, user, token) returns the data. Later steps add their services here. */
var ROUTES = {
  'app.ping':            {pub: true, fn: function () { return {time: nowISO_()}; }},
  'app.info':            {pub: true, fn: function () { return publicInfo_(); }},
  'app.boot':            {pub: true, fn: function (a, u, token) { return appBoot_(token, a.version); }},
  'auth.login':          {pub: true, fn: function (a) { return withMaster_(login(a.username, a.password, a.remember), a.version); }},
  'auth.demo':           {pub: true, fn: function (a) { return withMaster_(loginDemo(), a.version); }},
  'auth.logout':         {pub: true, fn: function (a, u, token) { return logout(token); }},
  'auth.me':             {fn: function (a, u, token) { return sessionInfo_(u, session_(token).ttl); }},
  'auth.changePassword': {fn: function (a, u) { return changePassword(u, a.oldPassword, a.newPassword); }},
  'master.get':          {fn: function (a) { return MasterCache.bundle(a.version); }},
  'master.clearCache':   {perm: 'settings.edit', fn: function () { return MasterCache.clear(); }},
  'filter.options':      {fn: function (a, u) { return filterOptions(u, a.entity, a.field, a.scope); }},

  'settings.dropdown.list':    {perm: 'settings.view', fn: function () { return SettingService.dropdownList(); }},
  'settings.dropdown.save':    {perm: 'settings.edit', fn: function (a, u) { return SettingService.dropdownSave(u, a.data); }},
  'settings.dropdown.delete':  {perm: 'settings.edit', fn: function (a, u) { return SettingService.dropdownDelete(u, a.key); }},
  'settings.dropdown.reorder': {perm: 'settings.edit', fn: function (a, u) { return SettingService.dropdownReorder(u, a.group, a.codes); }},
  'settings.company.get':      {perm: 'settings.view', fn: function () { return SettingService.companyGet(); }},
  'settings.company.save':     {perm: 'settings.edit', fn: function (a, u) { return SettingService.companySave(u, a.data); }},
  'settings.company.logo':     {perm: 'settings.edit', noDemo: true, fn: function (a, u) { return SettingService.companyLogo(u, a.file); }},

  'user.list':           {perm: 'user.view', fn: function () { return UserService.list(); }},
  'user.save':           {perm: 'user.edit', fn: function (a, u) { return UserService.save(u, a.data); }},
  'user.resetPassword':  {perm: 'user.edit', fn: function (a, u) { return UserService.resetPassword(u, a.userId); }},

  'customer.list':       {perm: 'customer.view', fn: function (a) { return CustomerService.list(a); }},
  'customer.get':        {perm: 'customer.view', fn: function (a) { return CustomerService.get(a.customerId); }},
  'customer.save':       {perm: 'customer.edit', fn: function (a, u) { return CustomerService.save(u, a.data); }},
  'customer.delete':     {perm: 'customer.delete', fn: function (a, u) { return CustomerService.delete(u, a.customerId); }},
  'customer.export':     {perm: 'customer.export', fn: function (a, u) { return CustomerService.export(u); }},
  'customer.import':     {perm: 'customer.import', fn: function (a, u) { return CustomerService.import(u, a.rows, a.check); }},

  'room.overview':       {perm: 'room.view', fn: function () { return RoomService.overview(); }},
  'roomType.save':       {perm: 'room.edit', fn: function (a, u) { return RoomService.typeSave(u, a.data, a.isNew === true); }},
  'roomType.delete':     {perm: 'room.edit', fn: function (a, u) { return RoomService.typeDelete(u, a.code); }},
  'room.save':           {perm: 'room.edit', fn: function (a, u) { return RoomService.roomSave(u, a.data, a.isNew === true); }},
  'room.delete':         {perm: 'room.edit', fn: function (a, u) { return RoomService.roomDelete(u, a.roomNo); }},
  'room.status':         {perm: 'room.status', fn: function (a, u) { return RoomService.roomStatus(u, a.roomNo, a.status, a.note); }},
  'audit.client':        {fn: function (a, u) { return clientAudit_(u, a); }},

  'roomIncome.list':     {perm: 'roomIncome.view', feature: 'roomIncome', fn: function (a) { return RoomIncomeService.list(a); }},
  'roomIncome.get':      {perm: 'roomIncome.view', feature: 'roomIncome', fn: function (a) { return RoomIncomeService.get(a.docNo); }},
  'roomIncome.availability': {perm: 'roomIncome.view', feature: 'roomIncome', fn: function (a) { return RoomIncomeService.availability(a.checkIn, a.checkOut, a.exceptDocNo); }},
  'roomIncome.save':     {perm: 'roomIncome.edit', feature: 'roomIncome', fn: function (a, u) { return RoomIncomeService.save(u, a.data); }},
  'roomIncome.cancel':   {perm: 'roomIncome.edit', feature: 'roomIncome', fn: function (a, u) { return RoomIncomeService.cancel(u, a.docNo); }},
  'roomIncome.delete':   {perm: 'roomIncome.delete', feature: 'roomIncome', fn: function (a, u) { return RoomIncomeService.delete(u, a.docNo); }},
  'roomIncome.calendar': {perm: 'roomIncome.view', feature: 'roomIncome', fn: function (a) { return RoomIncomeService.calendar(a.month); }},
  'roomIncome.export':   {perm: 'roomIncome.view', feature: 'roomIncome', fn: function (a, u) { return RoomIncomeService.export(u, a); }},
  'customer.lookup':     {perm: 'roomIncome.view', fn: function () { return customerLookup_(); }},
  'booking.grid':        {perm: 'booking.view', feature: 'booking', fn: function (a) { return BookingService.grid(a.from, a.days, a.typeCode); }}
  // step 5+: dashboard.summary, otherIncome.*, expense.*, receipt.*, report.*, upload.*
};

function api(shop, action, token, payload) {
  try {
    var route = ROUTES[action];
    if (!route) throw appError_('NOT_FOUND', 'ไม่รู้จักคำสั่ง ' + action);
    useShop_(shop);   // every call re-checks the Command Center: a suspended hotel stops at its next click
    SANDBOX = SHOP.demo ? '-' : null;
    var user = null;
    if (!route.pub) {
      user = session_(token).user;
      CURRENT_USER = user;
      if (SHOP.demo) SANDBOX = token;
      if (route.perm) need_(user, route.perm);
    }
    if (route.feature) needFeature_(route.feature);
    if (route.noDemo && SHOP.demo) throw appError_('DEMO_READONLY', 'โหมดสาธิตไม่บันทึกไฟล์ลง Google Drive — ใช้งานจริงได้หลังติดตั้งระบบ');
    var out = {ok: true, data: route.fn(payload || {}, user, token)};
    // the browser sends its master version (_mv); when master data changed — this call or another user — the
    // new bundle rides along, so no page has to ask for it
    if (user && payload && typeof payload._mv === 'string') {
      var mb = MasterCache.bundle(payload._mv);
      if (mb.changed) out.master = mb;
    }
    return out;
  } catch (err) {
    console.error(action + ': ' + err.message + (err.stack ? '\n' + err.stack : ''));
    return {
      ok: false,
      code: err.code || 'ERROR',
      message: err.code ? err.message : 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ (' + err.message + ')',
      field: err.field || null
    };
  } finally {
    CURRENT_USER = null;
    SANDBOX = null;
    SHOP = null;
    resetRequest_();
  }
}

/** What the login screen needs before anyone signs in: nothing private. */
function publicInfo_() {
  var c = readKV('Company'), url = ScriptApp.getService().getUrl(), tier = shopPackage_();
  return {
    shop: SHOP.id,
    hotelName: c.hotelName || SHOP.name || '',
    companyName: c.companyName || '',
    logoFileId: c.logoFileId || '',
    demo: SHOP.demo,
    demoUrl: url && registry_()[DEMO_SHOP_ID] ? url + '?demo=1' : '',
    package: tier.charAt(0) + tier.slice(1).toLowerCase(),
    features: shopFeatures_()
  };
}

/** The page's first call: public info, plus the session and master data when the saved token is still valid —
 *  one round trip instead of three. */
function appBoot_(token, version) {
  var out = {info: publicInfo_(), session: null, master: null};
  var s = token ? session_(token, true) : null;
  if (s) {
    CURRENT_USER = s.user;
    if (SHOP.demo) SANDBOX = token;
    out.session = sessionInfo_(s.user, s.ttl);
    out.master = MasterCache.bundle(version);
  }
  return out;
}

/** Sign-in answers carry the master data too, so the shell opens without another call. */
function withMaster_(session, version) {
  session.master = MasterCache.bundle(version);
  return session;
}
