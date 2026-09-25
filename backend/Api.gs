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
  'booking.grid':        {perm: 'booking.view', feature: 'booking', fn: function (a) { return BookingService.grid(a.from, a.days, a.typeCode); }},
  'dashboard.summary':   {perm: 'dashboard.view', feature: 'dashboard', fn: function (a) { return DashboardService.summary(a.month); }},

  'otherIncome.list':    {perm: 'otherIncome.view', feature: 'otherIncome', fn: function (a) { return OtherIncomeService.list(a); }},
  'otherIncome.get':     {perm: 'otherIncome.view', feature: 'otherIncome', fn: function (a) { return OtherIncomeService.get(a.docNo); }},
  'otherIncome.bookings': {perm: 'otherIncome.edit', feature: 'otherIncome', fn: function () { return OtherIncomeService.bookings(); }},
  'otherIncome.save':    {perm: 'otherIncome.edit', feature: 'otherIncome', fn: function (a, u) { return OtherIncomeService.save(u, a.data); }},
  'otherIncome.delete':  {perm: 'otherIncome.delete', feature: 'otherIncome', fn: function (a, u) { return OtherIncomeService.delete(u, a.docNo); }},
  'otherIncome.export':  {perm: 'otherIncome.view', feature: 'otherIncome', fn: function (a, u) { return OtherIncomeService.export(u, a); }},

  'expense.list':        {perm: 'expense.view', feature: 'expense', fn: function (a) { return ExpenseService.list(a); }},
  'expense.get':         {perm: 'expense.view', feature: 'expense', fn: function (a) { return ExpenseService.get(a.docNo); }},
  'expense.save':        {perm: 'expense.edit', feature: 'expense', fn: function (a, u) { return ExpenseService.save(u, a.data); }},
  'expense.delete':      {perm: 'expense.delete', feature: 'expense', fn: function (a, u) { return ExpenseService.delete(u, a.docNo); }},
  'expense.export':      {perm: 'expense.view', feature: 'expense', fn: function (a, u) { return ExpenseService.export(u, a); }},

  'upload.init':         {perm: 'upload.create', feature: 'upload', noDemo: true, fn: function (a, u) { return UploadService.init(u, a.meta); }},
  'upload.append':       {perm: 'upload.create', feature: 'upload', noDemo: true, fn: function (a, u) { return UploadService.append(u, a.uploadId, a.offset, a.data); }},
  'upload.status':       {perm: 'upload.create', feature: 'upload', noDemo: true, fn: function (a, u) { return UploadService.status(u, a.uploadId); }},
  'upload.finalize':     {perm: 'upload.create', feature: 'upload', noDemo: true, fn: function (a, u) { return UploadService.finalize(u, a.uploadIds, a.docNo); }},
  'upload.discard':      {perm: 'upload.create', feature: 'upload', noDemo: true, fn: function (a, u) { return UploadService.discard(u, a.uploadIds); }},
  'attachment.list':     {fn: function (a, u) { attachmentNeed_(u, a.docNo, 'view'); return AttachmentService.list(a.docNo); }},
  'attachment.download': {fn: function (a, u) { var x = findById('Attachments', a.fileId); attachmentNeed_(u, x ? x.docNo : '', 'view'); return AttachmentService.download(a.fileId); }},
  'attachment.delete':   {noDemo: true, fn: function (a, u) { var x = findById('Attachments', a.fileId); attachmentNeed_(u, x ? x.docNo : '', 'edit'); return AttachmentService.remove(u, a.fileId); }},
  'receipt.list':        {perm: 'receipt.view', feature: 'receipt', fn: function (a) { return ReceiptService.list(a); }},
  'receipt.get':         {perm: 'receipt.view', feature: 'receipt', fn: function (a) { return ReceiptService.get(a.docNo); }},
  'receipt.candidates':  {perm: 'receipt.create', feature: 'receipt', fn: function () { return ReceiptService.candidates(); }},
  'receipt.prepare':     {perm: 'receipt.create', feature: 'receipt', fn: function (a) { return ReceiptService.prepare(a); }},
  'receipt.create':      {perm: 'receipt.create', feature: 'receipt', fn: function (a, u) { return ReceiptService.create(u, a.data); }},
  'receipt.createFromBooking': {perm: 'receipt.create', feature: 'receipt', fn: function (a, u) {   // the stay + its other income, today, as prepared
    var p = ReceiptService.prepare({bookingNo: a.bookingNo}), c = p.customer;
    var refs = [a.bookingNo].concat(a.otherIncomeNos || []);
    return ReceiptService.create(u, {bookingNo: a.bookingNo, refs: refs, date: today_(), payMethod: a.payMethod || p.payMethod || 'CASH',
      customerId: c.customerId, customerName: c.name, customerAddress: c.address, customerTaxId: c.taxId, customerPhone: c.phone});
  }},
  'receipt.cancel':      {perm: 'receipt.cancel', feature: 'receipt', fn: function (a, u) { return ReceiptService.cancel(u, a.docNo, a.reason); }},
  'receipt.print':       {perm: 'receipt.view', feature: 'receipt', fn: function (a, u) { return ReceiptService.print(u, a.docNo, a.copies); }},
  'receipt.export':      {perm: 'receipt.view', feature: 'receipt', fn: function (a, u) { return ReceiptService.export(u, a); }}
  // step 7: report.*
};

/** Tables a route reads, fetched from the cache in one round trip before it runs (MasterCache.gs TableCache.prefetch).
 *  Only a speed-up: a table missing here is still read, one cache call later. */
var ROUTE_READS = (function () {
  var stay = ['RoomIncome', 'OtherIncome', 'Rooms', 'RoomTypes', 'Dropdowns', 'Company'];
  var rc = ['Receipts', 'ReceiptItems', 'RoomIncome', 'OtherIncome', 'RoomTypes', 'Users', 'Dropdowns', 'Company', 'Customers'];
  var map = {
    'dashboard.summary': ['RoomIncome', 'OtherIncome', 'Expenses', 'Rooms', 'RoomTypes', 'Dropdowns'],
    'roomIncome.list': stay, 'roomIncome.export': stay, 'roomIncome.calendar': stay, 'roomIncome.availability': stay,
    'roomIncome.get': stay.concat(['Receipts', 'Attachments']),
    'booking.grid': ['RoomIncome', 'Rooms', 'RoomTypes'], 'room.overview': ['RoomIncome', 'Rooms', 'RoomTypes'],
    'otherIncome.list': ['OtherIncome', 'RoomIncome', 'Dropdowns', 'Attachments'], 'otherIncome.export': ['OtherIncome', 'RoomIncome', 'Dropdowns', 'Attachments'],
    'otherIncome.get': ['OtherIncome', 'RoomIncome', 'Attachments'], 'otherIncome.bookings': ['RoomIncome'],
    'expense.list': ['Expenses', 'Dropdowns', 'Attachments'], 'expense.export': ['Expenses', 'Dropdowns', 'Attachments'], 'expense.get': ['Expenses', 'Attachments'],
    'receipt.list': rc, 'receipt.get': rc, 'receipt.candidates': rc, 'receipt.prepare': rc, 'receipt.export': rc,
    'customer.list': ['Customers', 'RoomIncome', 'Receipts', 'Dropdowns'], 'customer.get': ['Customers', 'RoomIncome', 'Receipts', 'OtherIncome', 'Dropdowns'],
    'customer.export': ['Customers', 'RoomIncome', 'Receipts', 'Dropdowns'], 'customer.lookup': ['Customers']
  };
  return map;
})();

function api(shop, action, token, payload) {
  try {
    var route = ROUTES[action];
    if (!route) throw appError_('NOT_FOUND', 'ไม่รู้จักคำสั่ง ' + action);
    useShop_(shop);   // every call re-checks the Command Center: a suspended hotel stops at its next click
    SANDBOX = SHOP.demo ? '-' : null;
    // the session's user and the route's tables (with a demo session's changes to them) in one cache call
    TableCache.prefetch((route.pub ? [] : ['Users']).concat(ROUTE_READS[action] || []), SHOP.demo && token ? token : null);
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
