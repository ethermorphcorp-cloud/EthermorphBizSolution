// smoke-test.js — node tools/smoke-test.js
// Runs backend/*.gs in Node against in-memory fakes of SpreadsheetApp, CacheService, LockService,
// PropertiesService, DriveApp, Utilities, ScriptApp and HtmlService, then exercises the CORE: setup(), the router,
// login and sessions, the demo sandbox, MasterCache versions, document numbers, validation and the text-only
// sheet format. Fakes: tools/gas-fakes.js. The real test is setup() in the Apps Script editor.
const fs = require('fs'), path = require('path');
const {createGas} = require('./gas-fakes');
const root = path.join(__dirname, '..');
const gas = createGas(root);
const {ctx, G, books, props, cacheStore, Book, fmtDate} = gas;

/* ---------- test helpers ---------- */
let failed = 0, passed = 0;
function check(name, cond, info) {
  if (cond) passed++; else { failed++; console.log('FAIL ' + name + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); }
}
const api = (shop, action, token, payload) => ctx.api(shop, action, token, payload);
const sheetOf = (shopId, name) => {
  const row = G('registry_()')[shopId];
  return books[row.SHEET_ID].getSheetByName(name);
};
const dataRows = (shopId, name) => sheetOf(shopId, name).getDataRange().getValues().slice(1).filter(r => String(r[0]).length);
const within = (shopId, fn) => { ctx.__fn = fn; G(`useShop_('${shopId}'); try { __fn(); } finally { SHOP = null; SANDBOX = null; resetRequest_(); }`); };

/* ---------- Command Center shaped like the real one ----------
 * DEMO_MODE is the last column (Retail added it later) with FALSE checkboxes down to row 1001, and License_Log's
 * lower-case header was repeated three times by the first version of setupCommandCenter. */
const cc = Book('Command Center');
cc.getSheetByName('Sheet1').name = 'Customers';
const ccSh = cc.getSheetByName('Customers');
ccSh.commandCenter = true;   // the Command Center holds real booleans (DEMO_MODE)
const ccHead = G('CC_TABS.Customers').filter(h => h !== 'DEMO_MODE').concat(['DEMO_MODE']);
ccSh.rows.push(ccHead.slice());
const ccRow = o => ccHead.map(h => (o[h] === undefined ? (h === 'DEMO_MODE' ? false : '') : o[h]));
ccSh.rows.push(ccRow({CUS_ID: 'CUS001', CUS_NAME: 'ร้านค้า', PACKAGE_TYPE: 'RETAIL', STATUS: 'ACTIVE', SHEET_ID: 'x'}));
ccSh.rows.push(ccRow({CUS_ID: 'HT001', CUS_NAME: 'โรงแรมทดสอบ', PACKAGE_TYPE: 'HOTEL', PACKAGE_TIER: 'STANDARD', STATUS: 'ACTIVE'}));
while (ccSh.rows.length < 1001) ccSh.rows.push(ccRow({}));
const logSh = cc.insertSheet('License_Log');
logSh.commandCenter = true;
const logHead = ['ts', 'cus_id', 'field', 'old_value', 'new_value', 'by'];
logSh.rows.push(logHead.concat(logHead, logHead), ['2026-09-24T13:30:58', 'DEMO-STANDARD', 'SHEET_ID', 'a', 'a', 'x@y'].concat(Array(12).fill('')));
props.COMMAND_SHEET_ID = cc.getId();
const ccIdCol = ccHead.indexOf('CUS_ID');
const ccRowOf = id => ccSh.rows.findIndex(r => r && r[ccIdCol] === id) + 1;

/* ---------- setup() ---------- */
const out1 = ctx.setup();
check('setup mentions both hotels', /HT001: /.test(out1) && /DEMO-HOTEL: /.test(out1), out1);
check('setup has no failure', !/FAILED/.test(out1), out1);
check('retail row untouched', !/CUS001/.test(out1));
const reg = G('registry_()');
check('HT001 got SHEET_ID, DRIVE, APP_URL', reg.HT001.SHEET_ID && reg.HT001.DRIVE_FOLDER_ID && /\?shop=HT001$/.test(reg.HT001.APP_URL), reg.HT001);
check('demo row added as DEMO', reg['DEMO-HOTEL'] && reg['DEMO-HOTEL'].STATUS === 'DEMO' && reg['DEMO-HOTEL'].PACKAGE_TYPE === 'HOTEL');
check('demo row written into the first blank row, not below the checkboxes', ccRowOf('DEMO-HOTEL') === 4, ccRowOf('DEMO-HOTEL'));
check('demo row ticks the DEMO_MODE checkbox', ccSh.rows[3][ccHead.indexOf('DEMO_MODE')] === true);
check('Customers tab keeps its 1001 rows', ccSh.getLastRow() === 1001, ccSh.getLastRow());
check('repeated License_Log header removed', JSON.stringify(logSh.rows[0].filter(String)) === JSON.stringify(logHead) &&
  logSh.rows[1][1] === 'DEMO-STANDARD', logSh.rows[0]);
check('pepper per hotel', props.SALT_HT001 && props['SALT_DEMO-HOTEL'] && props.SALT_HT001 !== props['SALT_DEMO-HOTEL']);
const schema = G('SCHEMA');
Object.keys(schema).forEach(n => {
  const sh = sheetOf('HT001', n);
  check('sheet ' + n, sh && JSON.stringify(sh.rows[0]) === JSON.stringify(schema[n]), sh && sh.rows[0]);
});
check('blank Sheet1 removed', !books[reg.HT001.SHEET_ID].getSheetByName('Sheet1'));
check('36 default dropdowns', dataRows('HT001', 'Dropdowns').length === 36, dataRows('HT001', 'Dropdowns').length);
check('HT001 has only owner', dataRows('HT001', 'Users').length === 1 && dataRows('HT001', 'Users')[0][1] === 'owner');
check('HT001 has no room types', dataRows('HT001', 'RoomTypes').length === 0);
check('demo has 4 room types, 12 rooms, 5 users', dataRows('DEMO-HOTEL', 'RoomTypes').length === 4 &&
  dataRows('DEMO-HOTEL', 'Rooms').length === 12 && dataRows('DEMO-HOTEL', 'Users').length === 5);
const nonText = Object.values(books).flatMap(b => b.sheets.flatMap(s => s.nonText));
check('every cell written as text', nonText.length === 0, nonText.slice(0, 5));

const out2 = ctx.setup();
check('License_Log header stays single', logSh.rows[0].filter(String).length === 6, logSh.rows[0]);
check('no second demo row', ccSh.rows.filter(r => r && r[ccIdCol] === 'DEMO-HOTEL').length === 1);
// the state the first version left behind: DEMO-HOTEL appended at row 1002, below the checkboxes
const demoCells = ccSh.rows[3].slice();
ccSh.rows[3] = ccRow({});
ccSh.rows.push(demoCells);
G('clearRegistryCache()');
const out3 = ctx.setup();
check('demo row moved up from row 1002', ccRowOf('DEMO-HOTEL') === 4 && ccSh.getLastRow() === 1001 && /moved DEMO-HOTEL from row 1002 to row 4/.test(out3), out3);
check('moved row keeps its SHEET_ID', G('registry_()')['DEMO-HOTEL'].SHEET_ID === reg['DEMO-HOTEL'].SHEET_ID);
check('setup is idempotent', dataRows('HT001', 'Dropdowns').length === 36 && dataRows('HT001', 'Users').length === 1 &&
  dataRows('DEMO-HOTEL', 'Rooms').length === 12 && !/FAILED/.test(out2), out2);

/* ---------- demo data: the totals the designs show ---------- */
{
  const tbl = n => { let rows; within('DEMO-HOTEL', () => { rows = G(`readTable('${n}')`); }); return rows; };
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const bk = tbl('RoomIncome'), oi = tbl('OtherIncome'), ex = tbl('Expenses'), cu = tbl('Customers');
  const live = bk.filter(b => b.payStatus !== 'cxl');
  const D = G('DemoData');
  const sepRoom = live.filter(b => b.checkIn.startsWith('2026-09'));
  check('Sep room revenue ฿402,650', sum(sepRoom, b => b.total) === 402650, sum(sepRoom, b => b.total));
  const byType = {};
  sepRoom.forEach(b => { byType[b.typeCode] = (byType[b.typeCode] || 0) + b.total; });
  check('Sep revenue per room type (Dashboard donut)', JSON.stringify(byType, Object.keys(D.sepRoomByType).sort()) === JSON.stringify(D.sepRoomByType, Object.keys(D.sepRoomByType).sort()), byType);
  check('Sep 226 nights, ADR ฿1,781.64', sum(sepRoom, b => b.nights) === 226 && (402650 / 226).toFixed(2) === '1781.64', sum(sepRoom, b => b.nights));
  const sepOther = oi.filter(o => o.date.startsWith('2026-09')), sepExp = ex.filter(e => e.date.startsWith('2026-09'));
  check('Sep other income ฿83,600 in 117', sum(sepOther, o => o.amount) === 83600 && sepOther.length === 117, [sum(sepOther, o => o.amount), sepOther.length]);
  Object.keys(D.sepOther).forEach(c => {
    const xs = sepOther.filter(o => o.category === c);
    check('Sep other ' + c, xs.length === D.sepOther[c][0] && sum(xs, o => o.amount) === D.sepOther[c][1], [xs.length, sum(xs, o => o.amount)]);
  });
  check('Sep expenses ฿172,840 in 58', sum(sepExp, e => e.amount) === 172840 && sepExp.length === 58, [sum(sepExp, e => e.amount), sepExp.length]);
  Object.keys(D.sepExpense).forEach(c => {
    const xs = sepExp.filter(e => e.category === c);
    check('Sep expense ' + c, xs.length === D.sepExpense[c][0] && sum(xs, e => e.amount) === D.sepExpense[c][1], [xs.length, sum(xs, e => e.amount)]);
  });
  D.months.forEach(m => {
    const ym = m[0];
    const rev = sum(live.filter(b => b.checkIn.startsWith(ym)), b => b.total) + sum(oi.filter(o => o.date.startsWith(ym)), o => o.amount);
    const exp = sum(ex.filter(e => e.date.startsWith(ym)), e => e.amount);
    const nos = bk.filter(b => b.docNo.startsWith('BK-' + ym.replace('-', ''))).map(b => b.docNo).sort();
    const seq = Array.from({length: m[3]}, (_, i) => 'BK-' + ym.replace('-', '') + '-' + String(i + 1).padStart(4, '0'));
    check('month ' + ym + ' revenue / expenses', rev === m[1] && exp === m[2], [rev, m[1], exp, m[2]]);
    check('month ' + ym + ' has BK-…-0001 to ' + m[3] + ' without gaps', JSON.stringify(nos) === JSON.stringify(seq), nos.length);
    const room = sum(live.filter(b => b.checkIn.startsWith(ym)), b => b.total);
    if (ym !== '2026-09') check('month ' + ym + ' room = 83 %', room === Math.round(m[1] * 0.83 / 10) * 10, room);
  });
  const nightsOf = b => Array.from({length: b.nights}, (_, i) => { const d = new Date(b.checkIn + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
  const taken = {}, clash = [];
  live.forEach(b => nightsOf(b).forEach(n => { const k = b.roomNo + n; if (taken[k]) clash.push([taken[k], b.docNo, n]); taken[k] = b.docNo; }));
  check('no two stays share a room night', clash.length === 0, clash.slice(0, 3));
  check('room 104 empty while under repair', !live.some(b => b.roomNo === '104' && nightsOf(b).some(n => n >= '2026-09-21' && n <= '2026-09-27')));
  const fixedNos = new Set(D.bookings.map(b => b[0]));
  const inGrid = live.filter(b => nightsOf(b).some(n => n >= '2026-09-21' && n <= '2026-10-04'));
  check('booking grid 21/09–04/10 shows only the designed stays', inGrid.every(b => fixedNos.has(b.docNo)), inGrid.filter(b => !fixedNos.has(b.docNo)).map(b => b.docNo));
  const b61 = bk.find(b => b.docNo === 'BK-202609-0061');
  check('designed row BK-202609-0061', b61 && b61.guestName === 'คุณวรรณา ศรีสุข' && b61.phone === '089-765-4321' && b61.roomNo === '204' &&
    b61.checkOut === '2026-09-26' && b61.total === 3600 && b61.payStatus === 'paid' && b61.channel === 'WALKIN', b61);
  const o117 = oi.find(o => o.docNo === 'OI-202609-0117'), e54 = ex.find(e => e.docNo === 'EX-202609-0054');
  check('designed rows OI-0117 / EX-0054', o117 && o117.amount === 180 && o117.bookingNo === 'BK-202609-0057' && e54 && e54.amount === 26380);
  check('generated Sep other income before OI-0110 and inside the stay', oi.filter(o => o.date.startsWith('2026-09') && o.docNo < 'OI-202609-0110').every(o => {
    if (o.date > '2026-09-21') return false;
    if (!o.bookingNo) return true;
    const b = bk.find(x => x.docNo === o.bookingNo);
    return b && b.payStatus !== 'cxl' && o.date >= b.checkIn && o.date <= b.checkOut && o.roomNo === b.roomNo;
  }));
  check('generated Sep expenses dated before EX-0051', ex.filter(e => e.docNo.startsWith('EX-202609') && e.docNo < 'EX-202609-0051').every(e => e.date <= '2026-09-18'));
  const types = {};
  cu.forEach(c => { types[c.type] = (types[c.type] || 0) + 1; });
  check('214 customers GEN 168 · VIP 21 · CORP 14 · OTA 11', cu.length === 214 && cu[cu.length - 1].customerId === 'CU-0214' &&
    JSON.stringify(types, ['GEN', 'VIP', 'CORP', 'OTA']) === JSON.stringify(D.customerTypeCounts, ['GEN', 'VIP', 'CORP', 'OTA']), types);
  check('customer phones unique', new Set(cu.map(c => c.phone)).size === cu.length);
  check('every booking guest is its customer', bk.every(b => { const c = cu.find(x => x.customerId === b.customerId); return c && c.name === b.guestName && c.phone === b.phone; }));
  const docs = bk.map(b => b.docNo).concat(oi.map(o => o.docNo), ex.map(e => e.docNo));
  check('document numbers unique', new Set(docs).size === docs.length);
  let seqs;
  within('DEMO-HOTEL', () => { seqs = G("readTable('Sequences').reduce(function (o, s) { o[s.key] = s.last; return o; }, {})"); });
  check('Sequences continue after the demo rows', seqs['BK-202609'] === 71 && seqs['BK-202610'] === 4 && seqs['OI-202609'] === 117 && seqs['EX-202609'] === 58, seqs);
  const bad = [];
  within('DEMO-HOTEL', () => {
    const pairs = [['RoomIncome', bk], ['OtherIncome', oi], ['Expense', ex], ['Customer', cu]];
    pairs.forEach(([entity, rows]) => rows.forEach(r => {
      ctx.__r = r;
      try { G(`validate_('${entity}', __r)`); } catch (e) { if (bad.length < 5) bad.push([entity, r.docNo || r.customerId, e.field, e.message]); }
    }));
  });
  check('every demo row passes the Validator', bad.length === 0, bad);
  check('demo rows are text in the sheet', dataRows('DEMO-HOTEL', 'RoomIncome').every(r => r.every(x => typeof x === 'string')));
  const again = G('JSON.stringify(demoBookings_(demoRng_(DEMO_SEED), demoCustomers_(demoRng_(DEMO_SEED))))');
  check('seed is deterministic', again === G('JSON.stringify(demoBookings_(demoRng_(DEMO_SEED), demoCustomers_(demoRng_(DEMO_SEED))))'));
  let msg;
  within('DEMO-HOTEL', () => { msg = G('seedDemoData_()'); });
  check('seeding twice is refused', /already there/.test(msg) && tbl('RoomIncome').length === bk.length, msg);
}

/* ---------- schema evolution: a new column is appended, old rows still read ---------- */
G("SCHEMA.Rooms.push('capacityNote')");
within('HT001', () => G('createSchema()'));
check('new column appended', sheetOf('HT001', 'Rooms').rows[0].slice(-1)[0] === 'capacityNote');
G('SCHEMA.Rooms.pop()');

/* ---------- router, login, sessions ---------- */
let r = api('NOPE', 'app.info', null, {});
check('unknown hotel refused', !r.ok && r.code === 'SHOP', r);
r = api('CUS001', 'app.info', null, {});
check('retail shop refused', !r.ok && r.code === 'SHOP', r);
r = api('HT001', 'nope.action', null, {});
check('unknown action', !r.ok && r.code === 'NOT_FOUND', r);
r = api('HT001', 'app.info', null, {});
check('app.info', r.ok && r.data.hotelName === 'โรงแรมทดสอบ' && r.data.demo === false && /\?demo=1$/.test(r.data.demoUrl), r);
r = api('HT001', 'master.get', 'bad-token', {});
check('no session', !r.ok && r.code === 'SESSION_EXPIRED', r);
r = api('HT001', 'auth.login', null, {username: 'owner', password: 'wrong'});
check('wrong password', !r.ok && r.code === 'VALIDATION' && r.field === 'password', r);
r = api('HT001', 'auth.login', null, {username: 'OWNER', password: '1234'});
check('login (case-insensitive username)', r.ok && r.data.token && r.data.user.role === 'Owner' && !('passwordHash' in r.data.user), r);
const tok = r.ok && r.data.token;
check('lastLoginAt written', /^\d{4}-\d\d-\d\dT/.test(dataRows('HT001', 'Users')[0][9]));
check('audit LOGIN', dataRows('HT001', 'AuditLog').some(x => x[2] === 'LOGIN' && x[1] === 'owner'));
r = api('HT001', 'auth.me', tok, {});
check('auth.me', r.ok && r.data.user.username === 'owner' && r.data.perms[0] === '*' && r.data.ttl === 1800 && r.data.features.receipt === true, r);
r = api('HT001', 'auth.login', null, {username: 'owner', password: '1234', remember: true});
check('login carries master data and a 6-hour remembered session', r.ok && r.data.master && r.data.master.changed &&
  r.data.master.dropdowns.length > 30 && r.data.ttl === 21600 && r.data.demo === false, r.ok ? {ttl: r.data.ttl} : r);
r = api('HT001', 'app.boot', null, {});
check('app.boot without a token: login screen', r.ok && r.data.session === null && r.data.master === null && r.data.info.hotelName === 'โรงแรมทดสอบ' && r.data.info.package === 'Standard', r);
r = api('HT001', 'app.boot', 'stale-token', {});
check('app.boot with a stale token: login screen', r.ok && r.data.session === null, r);
r = api('HT001', 'app.boot', tok, {});
const bootVer = r.ok && r.data.master && r.data.master.version;
check('app.boot with a valid token: session + master', r.ok && r.data.session.user.username === 'owner' && r.data.master.changed && bootVer, r);
r = api('HT001', 'app.boot', tok, {version: bootVer});
check('app.boot with a current master version sends no master rows', r.ok && r.data.master.changed === false && !r.data.master.dropdowns, r);
for (let i = 0; i < 5; i++) api('HT001', 'auth.login', null, {username: 'owner', password: 'x'});
r = api('HT001', 'auth.login', null, {username: 'owner', password: '1234'});
check('locked after 5 failures', !r.ok && r.code === 'LOCKED', r);
Object.keys(cacheStore).filter(k => /fail_owner/.test(k)).forEach(k => delete cacheStore[k]);

/* ---------- master.get + MasterCache versions ---------- */
r = api('HT001', 'master.get', tok, {});
check('master.get bundle', r.ok && r.data.changed && r.data.dropdowns.length === 36 && r.data.company.hotelName === 'โรงแรมทดสอบ', r.ok ? {} : r);
const v1 = r.data.version;
r = api('HT001', 'master.get', tok, {version: v1});
check('master.get unchanged', r.ok && r.data.changed === false && r.data.version === v1, r);
within('HT001', () => G("insertRow('RoomTypes', {code: 'SUP', name: 'Superior', price: 1200, weekendPrice: 1400, maxGuests: 2, active: true})"));
r = api('HT001', 'master.get', tok, {version: v1});
check('master version bumps after write', r.ok && r.data.changed && r.data.version !== v1 && r.data.roomTypes.length === 1 &&
  r.data.roomTypes[0].price === 1200 && r.data.roomTypes[0].active === true, r.ok ? r.data.roomTypes : r);
within('HT001', () => G("updateRow('Users', 'USR-001', {phone: '0812345678'})"));
r = api('HT001', 'master.get', tok, {version: r.data.version});
check('Users write does not change the public version', r.ok && r.data.changed === false, r);
check('cache chunks stored', Object.keys(cacheStore).some(k => /^HT001:mc_Dropdowns_.*_0$/.test(k)));
// a write read back inside the same lock sees the new rows (not the cached ones)
within('HT001', () => G(`withLock_(function () {
  updateRow('RoomTypes', 'SUP', {price: 1300});
  if (readTable('RoomTypes')[0].price !== 1300) throw new Error('stale read inside lock');
})`));
check('fresh read inside lock', true);
// big master table spans several cache chunks
within('HT001', () => G(`insertRows('Dropdowns', Array.from({length: 400}, function (_, i) {
  return {key: 'unit.X' + i, group: 'unit', code: 'X' + i, label: 'หน่วยทดสอบภาษาไทยยาวๆ เพื่อให้เกินหนึ่งก้อน ' + i, sort: 1000 + i, active: true};
}))`));
r = api('HT001', 'master.get', tok, {});
const chunks = Object.keys(cacheStore).filter(k => new RegExp('^HT001:mc_Dropdowns_').test(k) && !/_n$/.test(k));
check('multi-chunk master table', r.ok && r.data.dropdowns.length === 436, r.ok ? r.data.dropdowns.length : r);
r = api('HT001', 'master.get', tok, {});
check('multi-chunk read back from cache', r.ok && r.data.dropdowns.length === 436 && chunks.length >= 1);

/* ---------- document numbers ---------- */
let nos;
within('HT001', () => { nos = G("[nextDocNo('BK'), nextDocNo('BK'), nextDocNo('RC'), peekDocNo('BK')]"); });
const ym = fmtDate(new Date(), '', 'yyyyMM');
check('doc numbers', JSON.stringify(nos) === JSON.stringify([`BK-${ym}-0001`, `BK-${ym}-0002`, `RC-${ym}-0001`, `BK-${ym}-0003`]), nos);
check('Sequences rows', dataRows('HT001', 'Sequences').length === 2);
gas.lock.reset();
within('HT001', () => G("withLock_(function () { nextDocNo('EX'); insertRow('Customers', {customerId: nextId_('Customers', 'CU-', 4), name: 'ก', phone: '0891234567', createdAt: nowISO_()}); audit('CREATE', 'Customers', 'CU-0001'); })"));
check('nested writes take the lock once', gas.lock.acquired === 1, gas.lock.acquired);
const cust = dataRows('HT001', 'Customers')[0];
check('leading zero kept', cust[4] === '0891234567' && typeof cust[4] === 'string', cust);
within('HT001', () => {
  let err;
  try { G("insertRow('Customers', {customerId: 'CU-0001', name: 'dup'})"); } catch (e) { err = e; }
  check('duplicate key refused', err && err.code === 'DUPLICATE', err && err.message);
});

/* ---------- validation ---------- */
within('HT001', () => {
  const v = G("validate_('Customer', {name: ' สมชาย ', phone: '081 234 5678', taxId: '0-5055-66012-34-5', type: 'VIP'})");
  check('validate cleans', v.name === 'สมชาย' && v.phone === '0812345678' && v.taxId === '0505566012345', v);
  const bad = (entity, data, field) => {
    let e; try { ctx.__d = data; G(`validate_('${entity}', __d)`); } catch (x) { e = x; }
    check(`validate ${entity}.${field}`, e && e.code === 'VALIDATION' && e.field === field, e ? [e.field, e.message] : 'no error');
  };
  bad('Customer', {name: ''}, 'name');
  bad('Customer', {name: 'a', phone: '12345'}, 'phone');
  bad('Customer', {name: 'a', type: 'NOPE'}, 'type');
  bad('Customer', {name: 'a', taxId: '123'}, 'taxId');
  bad('Expense', {date: '31/02/2026', category: 'UTIL', description: 'x', payMethod: 'CASH', amount: 10}, 'date');
  bad('Expense', {date: '2026-09-25', category: 'UTIL', description: 'x', payMethod: 'CASH', amount: 0}, 'amount');
  bad('RoomIncome', {guestName: 'a', typeCode: 'SUP', roomNo: '999'}, 'roomNo');
  const e2 = G("validate_('Expense', {date: '25/09/2026', category: 'UTIL', description: 'ค่าไฟ', payMethod: 'CASH', amount: '1,250.505'})");
  check('date + money normalised', e2.date === '2026-09-25' && e2.amount === 1250.51, e2);
});

/* ---------- demo hotel: sandbox ---------- */
r = api('DEMO-HOTEL', 'auth.login', null, {username: 'maneerat', password: '1234'});
check('demo user login', r.ok && r.data.demo === true, r);
r = api('HT001', 'auth.demo', null, {});
check('auth.demo refused on a real hotel', !r.ok && r.code === 'FORBIDDEN', r);
r = api('DEMO-HOTEL', 'auth.demo', null, {});
check('auth.demo', r.ok && r.data.user.username === 'maneerat' && r.data.user.role === 'Owner', r);
const dtok = r.data.token;
const realUsersBefore = JSON.stringify(sheetOf('DEMO-HOTEL', 'Users').rows);
const realAuditBefore = dataRows('DEMO-HOTEL', 'AuditLog').length;
const realSeqBefore = JSON.stringify(dataRows('DEMO-HOTEL', 'Sequences'));
r = api('DEMO-HOTEL', 'master.get', dtok, {});
const dv1 = r.data.version;
ctx.__tok = dtok;
G(`useShop_('DEMO-HOTEL'); SANDBOX = __tok; try {
  insertRow('Rooms', {roomNo: '501', typeCode: 'STE', floor: 5, status: 'free'});
  updateRow('Rooms', '101', {status: 'clean'});
  deleteRow('Rooms', '402');
  writeKV('Company', {hotelName: 'ทดลองเปลี่ยนชื่อ'});
  nextDocNo('BK');
} finally { SHOP = null; SANDBOX = null; resetRequest_(); }`);
check('demo sheet unchanged', dataRows('DEMO-HOTEL', 'Rooms').length === 12 && JSON.stringify(dataRows('DEMO-HOTEL', 'Sequences')) === realSeqBefore &&
  JSON.stringify(sheetOf('DEMO-HOTEL', 'Users').rows) === realUsersBefore && dataRows('DEMO-HOTEL', 'AuditLog').length === realAuditBefore);
r = api('DEMO-HOTEL', 'master.get', dtok, {version: dv1});
const rooms = r.ok ? r.data.rooms : [];
check('demo session sees its changes', r.ok && r.data.changed && rooms.length === 12 && rooms.some(x => x.roomNo === '501') &&
  !rooms.some(x => x.roomNo === '402') && rooms.find(x => x.roomNo === '101').status === 'clean' &&
  r.data.company.hotelName === 'ทดลองเปลี่ยนชื่อ', r.ok ? {n: rooms.length, hotel: r.data.company.hotelName} : r);
r = api('DEMO-HOTEL', 'auth.demo', null, {});
const other = r.data.token;
r = api('DEMO-HOTEL', 'master.get', other, {});
check('other demo session does not see them', r.ok && r.data.rooms.length === 12 && !r.data.rooms.some(x => x.roomNo === '501') &&
  r.data.company.hotelName === 'โรงแรมสายธาร');
r = api('DEMO-HOTEL', 'auth.logout', dtok, {});
check('logout', r.ok && !Object.keys(cacheStore).some(k => k.indexOf('sbx_' + dtok) >= 0));
r = api('DEMO-HOTEL', 'master.get', dtok, {});
check('session gone after logout', !r.ok && r.code === 'SESSION_EXPIRED');

/* ---------- permissions, change password, doGet ---------- */
r = api('DEMO-HOTEL', 'auth.login', null, {username: 'frontdesk1', password: '1234'});
const ftok = r.data.token;
r = api('DEMO-HOTEL', 'master.clearCache', ftok, {});
check('FrontDesk cannot clear cache', !r.ok && r.code === 'FORBIDDEN', r);
r = api('DEMO-HOTEL', 'auth.login', null, {username: 'frontdesk2', password: '1234'});
check('suspended user refused', !r.ok && r.field === 'username', r);
r = api('HT001', 'auth.changePassword', tok, {oldPassword: '1234', newPassword: '12'});
check('short password refused', !r.ok && r.field === 'newPassword', r);
r = api('HT001', 'auth.changePassword', tok, {oldPassword: '1234', newPassword: 'n3w-pass'});
check('change password', r.ok, r);
check('old password no longer works', !api('HT001', 'auth.login', null, {username: 'owner', password: '1234'}).ok);
check('new password works', api('HT001', 'auth.login', null, {username: 'owner', password: 'n3w-pass'}).ok);
let page = ctx.doGet({parameter: {demo: '1'}});
check('doGet ?demo=1', page.boot && page.boot.shop === 'DEMO-HOTEL' && page.boot.demo === true && page.boot.url, page.boot);
{
  const html = page.getContent();
  const files = fs.readdirSync(path.join(root, 'frontend')).filter(f => f.endsWith('.html') && f !== 'index.html').map(f => f.slice(0, -5));
  const included = [...fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8').matchAll(/include\('frontend\/([\w-]+)'\)/g)].map(m => m[1]);
  check('index.html includes every frontend file', files.every(f => included.includes(f)), files.filter(f => !included.includes(f)));
  check('page renders: no scriptlet left, BOOT set, boot call last', !/<\?/.test(html) && html.includes('var BOOT = {"shop":"DEMO-HOTEL"') &&
    html.lastIndexOf('Shell.boot()') > html.lastIndexOf('Pages.dashboard'), html.slice(0, 200));
  check('page title is the hotel', /โรงแรมสายธาร/.test(page.title), page.title);
}
page = ctx.doGet({parameter: {shop: 'ht001'}});
check('doGet ?shop=', page.boot && page.boot.shop === 'HT001' && page.boot.hotelName === 'โรงแรมทดสอบ', page.boot);
page = ctx.doGet({parameter: {}});
check('doGet without shop shows the error page', /เปิดระบบไม่ได้/.test(page.html));
check('lock released', gas.lock.held === 0);
check('request state cleared', G('SHOP === null && SANDBOX === null && CURRENT_USER === null && LOCK_DEPTH_ === 0'));

/* ---------- step 3: settings, users, customers, rooms ---------- */
{
  const T = api('HT001', 'auth.login', null, {username: 'owner', password: 'n3w-pass'}).data.token;   // real writes
  const D = api('DEMO-HOTEL', 'auth.login', null, {username: 'maneerat', password: '1234'}).data.token;   // sandbox
  const call = (shop, tok, action, payload) => api(shop, action, tok, payload || {});

  // dropdowns
  let r = call('DEMO-HOTEL', D, 'settings.dropdown.list');
  const ch = r.ok && r.data.find(g => g.group === 'channel');
  check('dropdown list: 6 groups with usage', r.ok && r.data.length === 6 && ch.items.find(i => i.code === 'WALKIN').used > 0 &&
    ch.items.find(i => i.code === 'EXP').used === 0 && ch.hint, r.ok ? ch.items.map(i => i.code + ':' + i.used) : r);
  r = call('HT001', T, 'settings.dropdown.save', {data: {group: 'channel', code: 'trip', label: 'Trip.com'}});
  check('dropdown add (code upper-cased, active)', r.ok && r.data.key === 'channel.TRIP', r);
  r = call('HT001', T, 'settings.dropdown.save', {data: {group: 'channel', code: 'TRIP2', label: 'trip.com'}});
  check('dropdown duplicate label refused', !r.ok && r.field === 'label', r);
  r = call('HT001', T, 'settings.dropdown.save', {data: {key: 'channel.TRIP', label: 'Trip.com (OTA)', active: true}, _mv: ''});
  check('dropdown edit + master bundle rides along', r.ok && r.master && r.master.dropdowns.some(d => d.key === 'channel.TRIP' && d.label === 'Trip.com (OTA)'), r.ok ? Object.keys(r) : r);
  const mv = r.master && r.master.version;
  r = call('HT001', T, 'settings.dropdown.list', {_mv: mv});
  check('no master bundle when nothing changed', r.ok && !r.master);
  r = call('DEMO-HOTEL', D, 'settings.dropdown.delete', {key: 'channel.WALKIN'});
  check('used option is deactivated, not deleted', r.ok && r.data.deactivated && r.data.used > 0, r);
  r = call('HT001', T, 'settings.dropdown.delete', {key: 'channel.TRIP'});
  check('unused option deleted', r.ok && r.data.deleted, r);
  const codes = call('HT001', T, 'settings.dropdown.list').data.find(g => g.group === 'pay').items.map(i => i.code);
  r = call('HT001', T, 'settings.dropdown.reorder', {group: 'pay', codes: codes.slice().reverse()});
  const after = call('HT001', T, 'settings.dropdown.list').data.find(g => g.group === 'pay').items.map(i => i.code);
  check('reorder', r.ok && JSON.stringify(after) === JSON.stringify(codes.slice().reverse()), after);
  r = call('HT001', T, 'settings.dropdown.reorder', {group: 'pay', codes: codes.slice(1)});
  check('reorder with a stale list refused', !r.ok && r.code === 'CONFLICT', r);
  const units = call('HT001', T, 'settings.dropdown.list').data.find(g => g.group === 'unit').items;
  units.slice(1).forEach(u => call('HT001', T, 'settings.dropdown.delete', {key: u.key}));
  r = call('HT001', T, 'settings.dropdown.delete', {key: units[0].key});
  check('the last active option of a group stays', !r.ok && r.code === 'IN_USE', r);

  // company
  const co = call('DEMO-HOTEL', D, 'settings.company.get').data;
  r = call('DEMO-HOTEL', D, 'settings.company.save', {data: Object.assign({}, co, {taxId: '12345'})});
  check('company: bad tax id', !r.ok && r.field === 'taxId', r);
  r = call('DEMO-HOTEL', D, 'settings.company.save', {data: Object.assign({}, co, {receiptPattern: 'RC-0001'})});
  check('company: bad receipt pattern', !r.ok && r.field === 'receiptPattern', r);
  r = call('DEMO-HOTEL', D, 'settings.company.save', {data: Object.assign({}, co, {hotelName: 'สายธาร ริเวอร์'}), _mv: ''});
  check('company save updates the master bundle', r.ok && r.master && r.master.company.hotelName === 'สายธาร ริเวอร์' && r.master.company.phone === '053-123-456', r.ok ? '' : r);
  r = call('DEMO-HOTEL', D, 'settings.company.logo', {file: {mime: 'image/png', data: 'AAAA'}});
  check('logo upload refused in demo', !r.ok && r.code === 'DEMO_READONLY', r);
  r = call('HT001', T, 'settings.company.logo', {file: {mime: 'image/png', data: Buffer.from('png').toString('base64')}});
  check('logo upload (real hotel)', r.ok && r.data.logoFileId, r);

  // users
  r = call('HT001', T, 'user.save', {data: {username: 'Desk01', fullName: 'พนักงาน หนึ่ง', role: 'FrontDesk', status: 'active', phone: '0891112222'}});
  const newUser = r.ok && r.data.userId;
  check('user create gets the default password', r.ok && r.data.password === '1234' && api('HT001', 'auth.login', null, {username: 'desk01', password: '1234'}).ok, r);
  r = call('HT001', T, 'user.save', {data: {username: 'owner', fullName: 'x', role: 'Admin', status: 'active'}});
  check('duplicate username refused', !r.ok && r.field === 'username', r);
  const me = call('HT001', T, 'auth.me').data.user;
  r = call('HT001', T, 'user.save', {data: Object.assign({}, me, {role: 'Admin'})});
  check('cannot change own role', !r.ok && r.field === 'role', r);
  r = call('HT001', T, 'user.save', {data: Object.assign({}, me, {status: 'suspended'})});
  check('cannot suspend self', !r.ok && r.field === 'status', r);
  r = call('HT001', T, 'user.save', {data: {userId: newUser, username: 'desk01', fullName: 'พนักงาน หนึ่ง', role: 'FrontDesk', status: 'suspended'}});
  check('suspend another user', r.ok && !api('HT001', 'auth.login', null, {username: 'desk01', password: '1234'}).ok, r);
  r = call('HT001', T, 'user.resetPassword', {userId: newUser});
  check('reset password', r.ok && r.data.password === '1234', r);
  const desk = api('DEMO-HOTEL', 'auth.login', null, {username: 'frontdesk1', password: '1234'}).data.token;
  r = call('DEMO-HOTEL', desk, 'user.list');
  check('FrontDesk cannot list users', !r.ok && r.code === 'FORBIDDEN', r);
  r = call('DEMO-HOTEL', D, 'user.list');
  check('user list: active first, Owner first', r.ok && r.data[0].role === 'Owner' && r.data[r.data.length - 1].status === 'suspended' && !('passwordHash' in r.data[0]), r.ok ? r.data.map(u => u.username) : r);

  // customers
  r = call('DEMO-HOTEL', D, 'customer.list', {page: 1, pageSize: 8});
  check('customer list page 1 of 214, newest first', r.ok && r.data.total === 214 && r.data.rows.length === 8 && r.data.rows[0].customerId === 'CU-0214' &&
    r.data.rows[0].stays > 0 && r.data.rows[0].lastStay, r.ok ? r.data.rows[0] : r);
  const opt = r.data.options;
  check('customer filter options come with counts', opt.type.find(o => o.value === 'VIP').count === 21 && opt.type.find(o => o.value === 'VIP').label === 'VIP' &&
    opt.nationality[0].value === 'ไทย' && opt.nationality.every(o => o.count > 0), opt);
  r = call('DEMO-HOTEL', D, 'customer.list', {filters: {type: 'CORP'}, pageSize: 50});
  check('filter by type', r.ok && r.data.total === 14 && r.data.rows.every(c => c.type === 'CORP'), r.ok ? r.data.total : r);
  r = call('DEMO-HOTEL', D, 'customer.list', {q: '089 765 4321'});
  check('search by phone digits', r.ok && r.data.rows[0].customerId === 'CU-0214', r.ok ? r.data.rows.map(c => c.customerId) : r);
  r = call('DEMO-HOTEL', D, 'customer.list', {sort: {key: 'spent', dir: 'desc'}, pageSize: 3});
  check('sort by spending', r.ok && r.data.rows[0].spent >= r.data.rows[1].spent, r.ok ? r.data.rows.map(c => c.spent) : r);
  r = call('DEMO-HOTEL', D, 'customer.get', {customerId: 'CU-0214'});
  check('customer history', r.ok && r.data.history.some(h => h.docNo === 'BK-202609-0061'), r.ok ? r.data.history.length : r);
  r = call('DEMO-HOTEL', D, 'customer.save', {data: {name: 'คุณทดสอบ ใหม่', phone: '0812345000', nationality: 'ไทย'}});
  check('customer create: CU-0215, GEN, phone as text', r.ok && r.data.customerId === 'CU-0215' && r.data.type === 'GEN' && r.data.phone === '0812345000', r);
  r = call('DEMO-HOTEL', D, 'customer.delete', {customerId: 'CU-0214'});
  check('customer with stays cannot be deleted', !r.ok && r.code === 'IN_USE', r);
  r = call('DEMO-HOTEL', D, 'customer.delete', {customerId: 'CU-0215'});
  check('new customer deleted', r.ok, r);
  r = call('DEMO-HOTEL', desk, 'customer.delete', {customerId: 'CU-0001'});
  check('FrontDesk cannot delete customers', !r.ok && r.code === 'FORBIDDEN', r);
  r = call('DEMO-HOTEL', D, 'customer.export');
  check('export rows + headers', r.ok && r.data.rows.length === 214 && r.data.headers[0] === 'รหัส' && typeof r.data.rows[0][4] === 'string', r.ok ? r.data.headers : r);
  const imp = [{name: 'คุณนำเข้า หนึ่ง', type: 'VIP', phone: '0899999001'}, {name: 'คุณนำเข้า สอง', type: 'ลูกค้าแปลก'},
               {name: 'คุณซ้ำ', phone: '089-765-4321'}, {name: '', phone: '0899999002'}, {name: 'บริษัท นำเข้า จำกัด', type: 'บริษัท/องค์กร', taxId: '0105555000001'}];
  r = call('DEMO-HOTEL', D, 'customer.import', {rows: imp, check: true});
  check('import preview', r.ok && r.data.valid === 2 && r.data.errors.length === 2 && r.data.skipped.length === 1 && r.data.errors[0].row === 3, r.ok ? r.data : r);
  r = call('DEMO-HOTEL', D, 'customer.import', {rows: imp});
  const n = call('DEMO-HOTEL', D, 'customer.list', {q: 'นำเข้า'});
  check('import adds the valid rows', r.ok && r.data.added === 2 && n.data.total === 2 && n.data.rows.some(c => c.type === 'CORP'), r.ok ? r.data : r);

  // rooms
  r = call('DEMO-HOTEL', D, 'room.overview');
  const ov = r.data, today = ov && ov.today;
  check('room overview: 4 types, 12 rooms', r.ok && ov.types.length === 4 && ov.rooms.length === 12 &&
    ov.types.find(t => t.code === 'SUP').rooms === 4 && ov.types.every(t => t.occupancy >= 0 && t.occupancy <= 100), r.ok ? ov.types.map(t => t.code + ':' + t.occupancy) : r);
  const bk = call('DEMO-HOTEL', D, 'customer.get', {customerId: 'CU-0214'});   // any read to keep the session warm
  let consistent = true;
  within('DEMO-HOTEL', () => {
    const live = G("readTable('RoomIncome')").filter(b => b.payStatus !== 'cxl' && b.checkIn <= today && today < b.checkOut);
    ov.rooms.forEach(rm => {
      const b = live.find(x => x.roomNo === rm.roomNo);
      if (rm.statusSet !== 'off' && (!!b !== (rm.status === 'occ') || (b && rm.guest !== b.guestName))) consistent = false;
    });
  });
  check('occupied = a booking covers tonight (guest shown)', consistent && bk.ok);
  r = call('DEMO-HOTEL', D, 'roomType.save', {isNew: true, data: {code: 'dlx', name: 'x', price: 1, maxGuests: 1}});
  check('room type duplicate code', !r.ok && r.field === 'code', r);
  r = call('DEMO-HOTEL', D, 'roomType.save', {isNew: true, data: {code: 'VIL', name: 'Pool Villa', price: 6500, maxGuests: 4, amenities: 'สระส่วนตัว , Wi-Fi,'}});
  check('room type create (weekend price defaults, amenities tidied)', r.ok && r.data.weekendPrice === 6500 && r.data.amenities === 'สระส่วนตัว,Wi-Fi', r);
  r = call('DEMO-HOTEL', D, 'roomType.delete', {code: 'SUP'});
  check('type with rooms cannot be deleted', !r.ok && r.code === 'IN_USE', r);
  r = call('DEMO-HOTEL', D, 'room.save', {isNew: true, data: {roomNo: '501', typeCode: 'VIL', floor: 5, status: 'occ'}});
  check('room status occ is not typed in', !r.ok && r.field === 'status', r);
  r = call('DEMO-HOTEL', D, 'room.save', {isNew: true, data: {roomNo: '501', typeCode: 'VIL', floor: 5, status: 'free'}, _mv: ''});
  check('room create reaches the master bundle', r.ok && r.master.rooms.some(x => x.roomNo === '501'), r.ok ? '' : r);
  r = call('DEMO-HOTEL', D, 'room.delete', {roomNo: '101'});
  check('room with bookings cannot be deleted', !r.ok && r.code === 'IN_USE', r);
  r = call('DEMO-HOTEL', D, 'room.delete', {roomNo: '501'});
  const r2 = call('DEMO-HOTEL', D, 'roomType.delete', {code: 'VIL'});
  check('empty room and unused type deleted', r.ok && r2.ok && r2.data.deleted, [r, r2]);
  r = call('DEMO-HOTEL', desk, 'room.status', {roomNo: '103', status: 'clean'});
  const r3 = call('DEMO-HOTEL', desk, 'room.save', {data: {roomNo: '103', typeCode: 'SUP', status: 'free'}});
  check('FrontDesk changes room status but cannot edit rooms', r.ok && !r3.ok && r3.code === 'FORBIDDEN', [r, r3]);
  r = call('DEMO-HOTEL', D, 'filter.options', {entity: 'Expenses', field: 'category', scope: {month: '2026-09'}});
  check('filter.options: Sep expense categories with counts', r.ok && r.data.length === 8 && r.data.find(o => o.value === 'FNB').count === 22 &&
    r.data.find(o => o.value === 'FNB').label === 'วัตถุดิบอาหารและเครื่องดื่ม', r.ok ? r.data : r);
  r = call('DEMO-HOTEL', desk, 'filter.options', {entity: 'Expenses', field: 'category'});
  check('filter.options respects permissions', !r.ok && r.code === 'FORBIDDEN', r);
  check('demo sheet still untouched', dataRows('DEMO-HOTEL', 'Customers').length === 214 && dataRows('DEMO-HOTEL', 'Rooms').length === 12);
}

/* ---------- step 4: room income, calendar, booking grid ---------- */
{
  const D = api('DEMO-HOTEL', 'auth.login', null, {username: 'maneerat', password: '1234'}).data.token;
  const desk = api('DEMO-HOTEL', 'auth.login', null, {username: 'frontdesk1', password: '1234'}).data.token;
  const call = (tok, action, payload) => api('DEMO-HOTEL', action, tok, payload || {});
  let r = call(D, 'roomIncome.list', {month: '2026-09', pageSize: 8});
  const L = r.data;
  check('Sep KPIs match Income-Rooms', r.ok && L.kpi.revenue === 402650 && L.kpi.nights === 226 && L.kpi.adr === 1781.64 && L.total === 71 && L.counts.other === 117,
    r.ok ? {kpi: L.kpi, total: L.total, counts: L.counts} : r);
  check('months that have data, newest first, with counts', L.months[0].value >= '2026-09' && L.months.find(m => m.value === '2026-08').count === 71 &&
    L.months.find(m => m.value === '2026-04').label === 'เม.ย. 2026', L.months);
  check('list page: newest doc first, page sum excludes cancelled', L.rows[0].docNo === 'BK-202609-0071' && L.rows.length === 8 &&
    L.pageSum.total === L.rows.filter(b => b.payStatus !== 'cxl').reduce((s, b) => s + b.total, 0), L.pageSum);
  check('filter options with labels', L.options.channel.find(o => o.value === 'BKG').label === 'Booking.com' && L.options.payStatus.find(o => o.value === 'cxl'), L.options.payStatus);
  r = call(D, 'roomIncome.list', {month: '2026-09', filters: {payStatus: 'due'}, q: '', pageSize: 50});
  check('filter by status', r.ok && r.data.rows.every(b => b.payStatus === 'due') && r.data.total === L.kpi.dueCount, r.ok ? r.data.total : r);
  r = call(D, 'roomIncome.list', {month: '2026-09', q: '089-765-4321'});
  check('search by phone', r.ok && r.data.rows[0].docNo === 'BK-202609-0061', r.ok ? r.data.rows.map(b => b.docNo) : r);

  const base = {customerId: 'CU-0214', typeCode: 'SUP', roomNo: '101', checkIn: '2027-01-10', checkOut: '2027-01-12', guests: 2,
                rate: 1200, discount: 0, channel: 'WALKIN', payMethod: 'CASH', payStatus: 'paid'};
  r = call(D, 'roomIncome.save', {data: Object.assign({}, base, {customerId: ''})});
  check('customer required', !r.ok && r.field === 'customerId', r);
  r = call(D, 'roomIncome.save', {data: Object.assign({}, base, {guests: 3})});
  check('guests over the room type capacity', !r.ok && r.field === 'guests', r);
  r = call(D, 'roomIncome.save', {data: Object.assign({}, base, {roomNo: '201'})});
  check('room must belong to the type', !r.ok && r.field === 'roomNo', r);
  r = call(D, 'roomIncome.save', {data: Object.assign({}, base, {payStatus: 'dep', deposit: 5000})});
  check('deposit over the total', !r.ok && r.field === 'deposit' && /฿2,400.00/.test(r.message), r);
  r = call(D, 'roomIncome.save', {data: Object.assign({}, base, {payStatus: 'dep', deposit: 1000, discount: 100}), _mv: ''});
  const nb = r.ok && r.data;
  check('booking saved: nights, total, VAT inside, guest from the customer', r.ok && /^BK-\d{6}-\d{4}$/.test(nb.docNo) && nb.nights === 2 && nb.total === 2300 &&
    nb.vatAmount === Math.round(2300 * 7 / 107 * 100) / 100 && nb.guestName === 'คุณวรรณา ศรีสุข' && nb.phone === '089-765-4321' && nb.createdBy === 'maneerat', r);
  r = call(D, 'roomIncome.save', {data: Object.assign({}, base, {checkIn: '2027-01-11', checkOut: '2027-01-13'})});
  check('overlapping stay in the same room refused', !r.ok && r.field === 'roomNo' && r.message.includes(nb.docNo), r);
  r = call(D, 'roomIncome.save', {data: Object.assign({}, base, {checkIn: '2027-01-12', checkOut: '2027-01-13'})});
  check('back-to-back stay is fine', r.ok, r);
  const next = r.data;
  r = call(D, 'roomIncome.availability', {checkIn: '2027-01-11', checkOut: '2027-01-12'});
  check('availability: 101 taken, 102 free', r.ok && !r.data['101'].free && r.data['101'].docNo === nb.docNo && r.data['102'].free, r.ok ? r.data['101'] : r);
  r = call(D, 'roomIncome.availability', {checkIn: '2027-01-11', checkOut: '2027-01-12', exceptDocNo: nb.docNo});
  check('availability ignores the booking being edited', r.ok && r.data['101'].free);
  r = call(D, 'roomIncome.save', {data: Object.assign({}, base, {docNo: nb.docNo, checkOut: '2027-01-11', payStatus: 'paid'})});
  check('edit keeps the doc number', r.ok && r.data.docNo === nb.docNo && r.data.nights === 1 && r.data.deposit === 0, r);
  r = call(D, 'roomIncome.cancel', {docNo: next.docNo});
  const again = call(D, 'roomIncome.save', {data: Object.assign({}, base, {checkIn: '2027-01-12', checkOut: '2027-01-14'})});
  check('cancel frees the room', r.ok && again.ok, [r, again]);
  r = call(D, 'roomIncome.delete', {docNo: 'BK-202609-0057'});
  check('booking with other income cannot be deleted', !r.ok && r.code === 'IN_USE', r);
  r = call(desk, 'roomIncome.delete', {docNo: nb.docNo});
  check('FrontDesk cannot delete bookings', !r.ok && r.code === 'FORBIDDEN', r);
  r = call(desk, 'roomIncome.save', {data: Object.assign({}, base, {roomNo: '102', checkIn: '2027-02-01', checkOut: '2027-02-02'})});
  check('FrontDesk can book', r.ok, r);
  r = call(D, 'roomIncome.delete', {docNo: nb.docNo});
  check('delete an unreferenced booking', r.ok && !call(D, 'roomIncome.get', {docNo: nb.docNo}).ok, r);
  r = call(D, 'roomIncome.get', {docNo: 'BK-202609-0057'});
  check('get with linked other income', r.ok && r.data.other.some(o => o.docNo === 'OI-202609-0117'), r.ok ? r.data.other.length : r);

  r = call(D, 'roomIncome.calendar', {month: '2026-09'});
  const d24 = r.ok && r.data.days.find(d => d.date === '2026-09-24');
  check('calendar: 30 days, 24/09 check-ins and other income', r.ok && r.data.days.length === 30 && d24.items.some(x => x.docNo === 'BK-202609-0061') &&
    d24.items.some(x => x.docNo === 'OI-202609-0117' && x.name === 'Minibar') && d24.occ > 0 && d24.occ <= 12 &&
    d24.rev === d24.items.filter(x => x.payStatus !== 'cxl').reduce((s, x) => s + x.amount, 0), d24);
  const sepRev = r.data.days.reduce((s, d) => s + d.rev, 0);
  check('calendar revenue for the month = room + other', Math.round(sepRev) === 486250, sepRev);

  r = call(D, 'booking.grid', {from: '2026-09-21', days: 14});
  const G2 = r.data;
  const bar = no => G2.bars.find(b => b.docNo === no);
  check('grid: 12 rooms × 14 days', r.ok && G2.rooms.length === 12 && G2.dates.length === 14 && G2.dates[13] === '2026-10-04' && G2.summary.length === 14, r.ok ? G2.dates : r);
  check('grid bars: position, clipping, phone', bar('BK-202609-0059').start === 1 && bar('BK-202609-0059').span === 3 &&
    bar('BK-202609-0053').clipL && bar('BK-202609-0053').start === 0 && bar('BK-202610-0004').clipR && bar('BK-202610-0004').start === 11 &&
    bar('BK-202610-0004').span === 3 && bar('BK-202609-0061').phone === '089-765-4321' && !bar('BK-202609-0060'), [bar('BK-202609-0053'), bar('BK-202610-0004')]);
  check('grid summary: free rooms per day', G2.summary.every(s => s.free >= 0 && s.free <= 12 && s.occupancy === Math.round((12 - s.free) / 12 * 100)), G2.summary);
  r = call(D, 'booking.grid', {from: '2026-09-21', days: 7, typeCode: 'STE'});
  check('grid filtered by type', r.ok && r.data.rooms.length === 2 && r.data.bars.every(b => b.roomNo.startsWith('4')) && r.data.typeOptions.length === 4, r.ok ? r.data.rooms : r);
  r = call(D, 'roomIncome.export', {month: '2026-09'});
  check('export rows', r.ok && r.data.rows.length === 71 && r.data.headers[0] === 'เลขที่', r.ok ? r.data.rows.length : r);
  r = call(desk, 'audit.client', {action: 'PRINT', entity: 'Booking', detail: 'grid 21/09–04/10'});
  const r2 = call(desk, 'audit.client', {action: 'DELETE_ALL'});
  check('client audit: print/export only', r.ok && !r2.ok, [r, r2]);
  check('demo bookings sheet untouched', dataRows('DEMO-HOTEL', 'RoomIncome').length === 367);
}

/* ---------- dashboard.summary ---------- */
{
  const D = api('DEMO-HOTEL', 'auth.login', null, {username: 'maneerat', password: '1234'}).data.token;
  let r = api('DEMO-HOTEL', 'dashboard.summary', D, {month: '2026-09'});
  const s = r.data;
  check('dashboard KPIs match Main.dc.html', r.ok && s.kpi.revenue === 486250 && s.kpi.expense === 172840 && s.kpi.profit === 313410 &&
    s.kpi.margin === 64.5 && s.kpi.room === 402650 && s.kpi.other === 83600, r.ok ? s.kpi : r);
  const M = [['2026-04', 352000, 148200], ['2026-05', 318400, 151300], ['2026-06', 296200, 139600], ['2026-07', 402100, 160400], ['2026-08', 432600, 167600], ['2026-09', 486250, 172840]];
  check('combo series: 6 months of revenue / expenses / margin', s.series.length === 6 &&
    s.series.every((x, i) => x.month === M[i][0] && x.revenue === M[i][1] && x.expense === M[i][2] && x.margin === Math.round((M[i][1] - M[i][2]) / M[i][1] * 1000) / 10), s.series);
  const rt = Object.fromEntries(s.revenueByRoomType.map(x => [x.code, x.value]));
  check('donut: revenue by room type (SUP DLX FAM STE order)', s.revenueByRoomType.map(x => x.code).join() === 'SUP,DLX,FAM,STE' &&
    rt.DLX === 153000 && rt.SUP === 108720 && rt.STE === 84550 && rt.FAM === 56380, s.revenueByRoomType);
  const ic = Object.fromEntries(s.incomeByCategory.map(x => [x.code, x.value]));
  check('donut: income by category (room first, then the dropdown order)', s.incomeByCategory[0].code === 'ROOM' && ic.ROOM === 402650 && ic.FOOD === 41850 &&
    ic.MINIBAR === 18960 && s.incomeByCategory.reduce((t, x) => t + x.value, 0) === 486250, s.incomeByCategory);
  check('bars: expenses by category, largest first', s.expenseByCategory[0].code === 'SALARY' && s.expenseByCategory[0].value === 78000 &&
    s.expenseByCategory.length === 8 && s.expenseByCategory.reduce((t, x) => t + x.value, 0) === 172840 && s.expenseByCategory[0].label === 'เงินเดือนพนักงาน', s.expenseByCategory);
  check('months with data, newest first', s.months[0].value >= '2026-09' && s.months.some(m => m.value === '2026-04'), s.months);
  check('occupancy and tonight', s.kpi.occupancy > 0 && s.kpi.occupancy <= 100 && s.kpi.rooms === 12 && s.kpi.tonight >= 0, s.kpi);
  r = api('DEMO-HOTEL', 'dashboard.summary', D, {month: '2026-04'});
  check('an earlier month', r.ok && r.data.kpi.revenue === 352000 && r.data.series[0].month === '2025-11' && r.data.series[0].revenue === 0 && r.data.series[0].margin === null, r.ok ? r.data.series[0] : r);
}

/* ---------- step 5: other income, expenses, chunked upload ---------- */
{
  const D = api('DEMO-HOTEL', 'auth.login', null, {username: 'maneerat', password: '1234'}).data.token;
  const desk = api('DEMO-HOTEL', 'auth.login', null, {username: 'frontdesk1', password: '1234'}).data.token;
  const T = api('HT001', 'auth.login', null, {username: 'owner', password: 'n3w-pass'}).data.token;
  const dcall = (tok, action, payload) => api('DEMO-HOTEL', action, tok, payload || {});
  const hcall = (action, payload) => api('HT001', action, T, payload || {});

  // expenses
  let r = dcall(D, 'expense.list', {month: '2026-09', pageSize: 8});
  const E = r.data;
  check('expense KPIs (Expenses.dc.html)', r.ok && E.kpi.amount === 172840 && E.kpi.count === 58 && E.kpi.top.label === 'เงินเดือนพนักงาน' &&
    E.kpi.top.amount === 78000 && E.kpi.noFile === 7 && E.rows[0].docNo === 'EX-202609-0058' && E.rows[0].createdByName === 'ธนพล สุขใจ', r.ok ? E.kpi : r);
  check('expense chips: categories with counts', E.chips.length === 8 && E.chips.find(c => c.value === 'FNB').count === 22 && E.chipsAll === 58, E.chips);
  check('demo attachments: 0056 has two files, 0051 and 0053 none', E.rows.find(e => e.docNo === 'EX-202609-0056').files === 2 && E.rows.find(e => e.docNo === 'EX-202609-0053').files === 0, E.rows.map(e => e.docNo + ':' + e.files));
  r = dcall(D, 'expense.list', {month: '2026-09', filters: {attach: 'no'}, pageSize: 50});
  check('filter: not attached', r.ok && r.data.total === 7 && r.data.rows.every(e => !e.files), r.ok ? r.data.total : r);
  r = dcall(D, 'attachment.download', {fileId: 'DEMO-EX-202609-0058-1'});
  check('demo attachment download explains itself', !r.ok && r.code === 'DEMO_READONLY', r);
  r = dcall(D, 'expense.list', {month: '2026-09', filters: {category: 'FNB'}, pageSize: 50});
  check('filter by category', r.ok && r.data.total === 22 && r.data.rows.every(e => e.category === 'FNB') && r.data.chips.length === 8, r.ok ? r.data.total : r);
  r = dcall(D, 'expense.list', {month: '2026-09', q: 'booking.com'});
  check('search vendor', r.ok && r.data.rows.some(e => e.docNo === 'EX-202609-0057'), r.ok ? r.data.rows.map(e => e.docNo) : r);
  r = dcall(desk, 'expense.list', {});
  check('FrontDesk cannot see expenses', !r.ok && r.code === 'FORBIDDEN', r);
  r = dcall(D, 'expense.save', {data: {date: '2026-09-25', category: 'MAINT', description: 'ซ่อมท่อน้ำ', payMethod: 'CASH', amount: '1,250'}});
  check('expense save', r.ok && /^EX-\d{6}-\d{4}$/.test(r.data.docNo) && r.data.amount === 1250 && r.data.createdBy === 'maneerat', r);
  const ex1 = r.data.docNo;
  r = dcall(D, 'expense.save', {data: {date: '2026-09-25', category: 'NOPE', description: 'x', payMethod: 'CASH', amount: 10}});
  check('expense: unknown category', !r.ok && r.field === 'category', r);
  r = dcall(D, 'expense.delete', {docNo: ex1});
  check('expense delete', r.ok, r);
  r = dcall(D, 'expense.export', {month: '2026-09'});
  check('expense export: every row', r.ok && r.data.rows.length === 58, r.ok ? r.data.rows.length : r);

  // other income
  r = dcall(D, 'otherIncome.list', {month: '2026-09', pageSize: 8});
  const O = r.data;
  check('other income KPIs and categories (Income-Other.dc.html)', r.ok && O.kpi.amount === 83600 && O.kpi.count === 117 &&
    O.categories.find(c => c.code === 'MINIBAR').amount === 18960 && O.categories.find(c => c.code === 'FOOD').count === 36 &&
    O.categories.find(c => c.code === 'EXTRABED').count === 0 && O.rows[0].docNo === 'OI-202609-0117' && O.counts.rooms === 71, r.ok ? O.categories : r);
  check('pay filter includes "with the receipt"', O.options.payMethod.some(o => o.value === '-' && o.count > 0), O.options.payMethod);
  r = dcall(D, 'otherIncome.list', {month: '2026-09', filters: {category: 'SHUTTLE'}, pageSize: 50});
  check('filter by category', r.ok && r.data.total === 9, r.ok ? r.data.total : r);
  r = dcall(D, 'otherIncome.bookings');
  check('bookings to link', r.ok && r.data.some(b => b[0] === 'BK-202609-0064' && b[1] === '201'), r.ok ? r.data.length : r);
  r = dcall(desk, 'otherIncome.save', {data: {date: '2026-09-25', category: 'MINIBAR', description: 'น้ำดื่ม', bookingNo: 'BK-202609-0064', roomNo: '999', qty: 2, unitPrice: 20, payMethod: ''}});
  check('FrontDesk adds other income; the stay decides the room', r.ok && r.data.roomNo === '201' && r.data.amount === 40, r);
  const oi1 = r.data.docNo;
  r = dcall(D, 'otherIncome.save', {data: {date: '2026-09-25', category: 'FOOD', bookingNo: 'BK-202609-0060', qty: 1, unitPrice: 100}});
  check('cannot link a cancelled stay', !r.ok && r.field === 'bookingNo', r);
  r = dcall(desk, 'otherIncome.delete', {docNo: oi1});
  check('FrontDesk cannot delete other income', !r.ok && r.code === 'FORBIDDEN', r);
  const oi2 = dcall(D, 'otherIncome.save', {data: {date: '2026-09-25', category: 'LAUNDRY', roomNo: '203', qty: 1, unitPrice: 120, payMethod: 'CASH'}}).data;
  r = dcall(D, 'otherIncome.delete', {docNo: oi2.docNo});
  check('other income delete (room only, no stay)', r.ok && oi2.roomNo === '203' && oi2.bookingNo === '', r);

  // upload
  r = dcall(D, 'upload.init', {meta: {fileName: 'a.pdf', mime: 'application/pdf', size: 10, entity: 'Expenses'}});
  check('upload refused in demo', !r.ok && r.code === 'DEMO_READONLY', r);
  const exp = hcall('expense.save', {data: {date: '2026-09-25', category: 'UTIL', description: 'ค่าไฟ ส.ค.', payMethod: 'TRANSFER', amount: 26380}}).data;
  r = hcall('upload.init', {meta: {fileName: 'big.pdf', mime: 'application/pdf', size: 51 * 1024 * 1024, entity: 'Expenses'}});
  check('over 50 MB refused', !r.ok && r.field === 'file', r);
  r = hcall('upload.init', {meta: {fileName: 'run.exe', mime: 'application/x-msdownload', size: 100, entity: 'Expenses'}});
  check('file type refused', !r.ok && r.field === 'file', r);
  const MB = 1024 * 1024, size = 5 * MB + 10;
  const file = Buffer.alloc(size, 0).map((_, i) => (i * 7) % 251);
  const slice = (a, b) => file.subarray(a, b).toString('base64');
  r = hcall('upload.init', {meta: {fileName: 'invoice_aircon.pdf', mime: 'application/pdf', size, entity: 'Expenses'}});
  const up = r.data;
  check('upload.init: 2 MB slices', r.ok && up.chunkSize === 2 * MB && up.offset === 0, r);
  r = hcall('upload.append', {uploadId: up.uploadId, offset: 0, data: slice(0, 2 * MB)});
  check('slice 1 → offset 2 MB', r.ok && r.data.offset === 2 * MB, r);
  r = hcall('upload.append', {uploadId: up.uploadId, offset: 2 * MB, data: slice(2 * MB, 2 * MB + 1000)});
  check('a middle slice must be whole 256 KB blocks', !r.ok, r);
  gas.uploads.dropNext = true;
  r = hcall('upload.append', {uploadId: up.uploadId, offset: 2 * MB, data: slice(2 * MB, 4 * MB)});
  check('dropped answer → retry error', !r.ok && r.code === 'UPLOAD_RETRY', r);
  r = hcall('upload.status', {uploadId: up.uploadId});
  check('status asks Drive: resume at 4 MB', r.ok && r.data.offset === 4 * MB, r);
  r = hcall('upload.append', {uploadId: up.uploadId, offset: 2 * MB, data: slice(2 * MB, 4 * MB)});
  check('a stale offset gets the server offset back', r.ok && r.data.resync && r.data.offset === 4 * MB, r);
  hcall('user.save', {data: {username: 'acc01', fullName: 'บัญชี หนึ่ง', role: 'Accounting', status: 'active'}});
  const other = api('HT001', 'auth.login', null, {username: 'acc01', password: '1234'});
  r = hcall('upload.append', {uploadId: up.uploadId, offset: 4 * MB, data: slice(4 * MB, size)});
  check('last slice → Drive file', r.ok && r.data.done && r.data.fileId, r);
  const fileId = r.data.fileId;
  check('Drive holds the exact bytes', Buffer.from(gas.files[fileId].blob.bytes).equals(file) && gas.files[fileId].blob.name === 'invoice_aircon.pdf');
  r = hcall('upload.finalize', {uploadIds: [up.uploadId], docNo: exp.docNo});
  check('finalize attaches to the expense', r.ok && r.data.attached === 1, r);
  r = hcall('expense.list', {month: '2026-09'});
  check('expense list counts the attachment', r.ok && r.data.rows.find(e => e.docNo === exp.docNo).files === 1 && r.data.kpi.noFile === 0, r.ok ? r.data.kpi : r);
  r = hcall('attachment.download', {fileId});
  check('download returns the file', r.ok && Buffer.from(r.data.data, 'base64').equals(file), r.ok ? r.data.fileName : r);
  // an upload for a saved document attaches itself; one never saved can be discarded
  const small = Buffer.from('hello receipt');
  r = hcall('upload.init', {meta: {fileName: 'slip.jpg', mime: 'image/jpeg', size: small.length, entity: 'Expenses', docNo: exp.docNo}});
  r = hcall('upload.append', {uploadId: r.data.uploadId, offset: 0, data: small.toString('base64')});
  check('upload for an existing document attaches on completion', r.ok && r.data.done && hcall('attachment.list', {docNo: exp.docNo}).data.length === 2, r);
  r = hcall('upload.init', {meta: {fileName: 'draft.png', mime: 'image/png', size: small.length, entity: 'Expenses'}});
  const draft = r.data.uploadId;
  const done = hcall('upload.append', {uploadId: draft, offset: 0, data: small.toString('base64')}).data;
  r = hcall('upload.discard', {uploadIds: [draft]});
  check('discard bins an unsaved upload', r.ok && r.data.discarded === 1 && gas.files[done.fileId].trashed, r);
  r = hcall('attachment.delete', {fileId});
  check('attachment delete bins the file', r.ok && gas.files[fileId].trashed && hcall('attachment.list', {docNo: exp.docNo}).data.length === 1, r);
  r = hcall('expense.delete', {docNo: exp.docNo});
  check('deleting the expense takes its attachments', r.ok && hcall('attachment.list', {docNo: exp.docNo}).data.length === 0, r);
  check('attachment rows are text', dataRows('HT001', 'Attachments').every(x => x.every(c => typeof c === 'string')));
  r = api('HT001', 'upload.status', other.data.token, {uploadId: up.uploadId});
  check("another user cannot touch someone's upload", !r.ok && r.code === 'FORBIDDEN', r);
}

/* ---------- step 6: receipts ---------- */
{
  const login = u => api('DEMO-HOTEL', 'auth.login', null, {username: u, password: '1234'}).data.token;
  const D = login('maneerat'), desk = login('frontdesk1'), acc = login('piyanuch');
  const dcall = (tok, action, payload) => api('DEMO-HOTEL', action, tok, payload || {});
  const T0 = G('today_()');

  // design/Receipt: RC-202609-0112
  let r = dcall(D, 'receipt.get', {docNo: 'RC-202609-0112'});
  const R = r.data;
  check('design receipt RC-202609-0112 (Receipt.dc.html)', r.ok && R.bookingNo === 'BK-202609-0057' && R.total === 5580 && R.vat === 365.05 &&
    R.netBeforeVat === 5214.95 && R.words === 'ห้าพันห้าร้อยแปดสิบบาทถ้วน' && R.issuedByName === 'สมชาย ใจดี' && R.payLabel === 'โอนเงิน' &&
    R.customerAddress.indexOf('123/45 ถนนนิมมานเหมินท์') === 0 && R.stay.typeName === 'Deluxe' && R.stay.channel === 'Agoda', r.ok ? R : r);
  check('design receipt lines', R.items.length === 2 && R.items[0].description === 'ค่าห้องพัก Deluxe' && R.items[0].detail === 'ห้อง DLX 203 · 21/09/2026 – 24/09/2026' &&
    R.items[0].unitLabel === 'คืน' && R.items[1].detail === 'น้ำอัดลม 2, ขนม 1 (OI-202609-0117)' && R.items[1].unitLabel === 'ชิ้น', R.items);
  check('amount in Thai words', G("[bahtText_(0), bahtText_(21), bahtText_(101), bahtText_(1000001), bahtText_(1234.5), bahtText_(0.25), bahtText_(12000000)].join('|')") ===
    'ศูนย์บาทถ้วน|ยี่สิบเอ็ดบาทถ้วน|หนึ่งร้อยเอ็ดบาทถ้วน|หนึ่งล้านเอ็ดบาทถ้วน|หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์|ยี่สิบห้าสตางค์|สิบสองล้านบาทถ้วน');
  r = dcall(D, 'receipt.list', {month: '2026-09', pageSize: 10});
  check('receipt list: September', r.ok && r.data.kpi.count === 116 && r.data.rows[0].docNo === 'RC-202609-0116' && r.data.kpi.pending > 0 && r.data.months.length === 6,
    r.ok ? r.data.kpi : r);
  r = dcall(D, 'receipt.list', {month: '2026-09', q: 'อรทัย'});
  check('receipt search by customer', r.ok && r.data.rows.some(x => x.docNo === 'RC-202609-0112'), r.ok ? r.data.total : r);

  // issue one from a stay that checked out unpaid
  const cand = dcall(desk, 'receipt.candidates').data;
  const due = cand.bookings.find(b => b[5] === 'due' && b[8] && !b[7]);
  check('candidates: a checked-out unpaid stay', !!due && cand.walkins.every(w => w.length === 6), cand.bookings.slice(0, 3));
  r = dcall(desk, 'receipt.prepare', {bookingNo: due[0]});
  const P = r.data;
  check('prepare: room line first, customer copied', r.ok && P.lines[0].kind === 'room' && P.lines[0].refDocNo === due[0] && !P.lines[0].receipted && P.customer.name, r);
  const refs = P.lines.filter(l => !l.receipted && !l.ownPay).map(l => l.refDocNo);
  const base = {bookingNo: due[0], refs, date: T0, payMethod: 'CASH', customerId: P.customer.customerId, customerName: P.customer.name,
    customerAddress: P.customer.address, customerTaxId: P.customer.taxId, customerPhone: P.customer.phone};
  r = dcall(desk, 'receipt.create', {data: Object.assign({}, base, {date: '2099-01-01'})});
  check('receipt: a future date is refused', !r.ok && r.field === 'date', r);
  r = dcall(desk, 'receipt.create', {data: Object.assign({}, base, {customerTaxId: '12345'})});
  check('receipt: tax id must be 13 digits', !r.ok && r.field === 'customerTaxId', r);
  r = dcall(desk, 'receipt.create', {data: Object.assign({}, base, {refs: []})});
  check('receipt: at least one line', !r.ok && r.field === 'refs', r);
  r = dcall(desk, 'receipt.create', {data: base});
  const rc1 = r.data;
  const lineSum = P.lines.filter(l => refs.indexOf(l.refDocNo) >= 0).reduce((s, l) => s + l.amount, 0);
  check('FrontDesk issues a receipt from a stay', r.ok && /^RC-\d{6}-\d{4}$/.test(rc1.docNo) && rc1.items.length === refs.length &&
    Math.abs(rc1.total - (lineSum - P.discount)) < 0.005 && Math.abs(rc1.vat - Math.round(rc1.total * 7 / 107 * 100) / 100) < 0.005 && rc1.prevPayStatus === 'due', r);
  let bk = dcall(desk, 'roomIncome.get', {docNo: due[0]}).data;
  check('the stay is paid once receipted', bk.payStatus === 'paid' && bk.receipts.some(x => x.docNo === rc1.docNo && x.status === 'active'), bk.payStatus);
  r = dcall(desk, 'receipt.create', {data: base});
  check('a stay cannot be receipted twice', !r.ok && r.field === 'refs' && r.message.indexOf(rc1.docNo) >= 0, r);
  r = dcall(desk, 'roomIncome.cancel', {docNo: due[0]});
  check('a receipted stay cannot be cancelled', !r.ok && r.code === 'IN_USE' && r.message.indexOf('ใบเสร็จ') >= 0, r);
  r = dcall(D, 'otherIncome.delete', {docNo: 'OI-202609-0117'});
  check('other income on a receipt cannot be deleted', !r.ok && r.code === 'IN_USE' && r.message.indexOf('RC-202609-0112') >= 0, r);
  r = dcall(desk, 'receipt.print', {docNo: rc1.docNo, copies: true});
  check('print is counted', r.ok && r.data.printCount === 1 && dcall(desk, 'receipt.print', {docNo: rc1.docNo}).data.printCount === 2, r);

  // cancel: Accounting only, with a reason; the stay goes back to ค้างชำระ and can be receipted again
  r = dcall(desk, 'receipt.cancel', {docNo: rc1.docNo, reason: 'ชื่อผิด'});
  check('FrontDesk cannot cancel a receipt', !r.ok && r.code === 'FORBIDDEN', r);
  r = dcall(acc, 'receipt.cancel', {docNo: rc1.docNo, reason: ''});
  check('cancel needs a reason', !r.ok && r.field === 'reason', r);
  // sandboxes are per session: Accounting cannot see FrontDesk's demo receipt — cancel one of the seeded ones instead
  r = dcall(acc, 'receipt.cancel', {docNo: 'RC-202609-0112', reason: 'พิมพ์ชื่อลูกค้าผิด'});
  check('Accounting cancels a receipt', r.ok && r.data.status === 'cancelled' && r.data.cancelledByName === 'ปิยะนุช ทองคำ' && r.data.cancelReason === 'พิมพ์ชื่อลูกค้าผิด', r);
  r = dcall(acc, 'receipt.cancel', {docNo: 'RC-202609-0112', reason: 'ซ้ำ'});
  check('cancelling twice is refused', !r.ok && r.code === 'IN_USE', r);
  r = dcall(acc, 'receipt.prepare', {bookingNo: 'BK-202609-0057'});
  check('a cancelled receipt frees its lines', r.ok && r.data.lines.every(l => !l.receipted), r.ok ? r.data.lines : r);
  r = dcall(acc, 'receipt.list', {month: '2026-09', filters: {status: 'cancelled'}});
  check('list: cancelled filter and KPI', r.ok && r.data.total === 1 && r.data.kpi.cancelled === 1 && r.data.kpi.count === 115 &&
    r.data.kpi.amount === Math.round((dcall(D, 'receipt.list', {month: '2026-09'}).data.kpi.amount - 5580) * 100) / 100, r.ok ? r.data.kpi : r);
  const P2 = dcall(D, 'receipt.prepare', {bookingNo: due[0]}).data;
  r = dcall(D, 'receipt.create', {data: Object.assign({}, base, {refs: [due[0]], customerName: 'บริษัท ทดสอบ จำกัด', customerTaxId: '0105561234567'})});
  check('receipt keeps its own copy of the customer', r.ok && r.data.customerName === 'บริษัท ทดสอบ จำกัด' && r.data.customerTaxId === '0105561234567' &&
    dcall(D, 'customer.get', {customerId: P2.customer.customerId}).data.name === P2.customer.name, r);
  r = dcall(D, 'receipt.cancel', {docNo: r.data.docNo, reason: 'ทดสอบยกเลิก'});
  bk = dcall(D, 'roomIncome.get', {docNo: due[0]}).data;
  check('cancelling puts the stay back to ค้างชำระ', r.ok && bk.payStatus === 'due', bk.payStatus);

  // other income alone (a walk-in), and lines of two stays never share a receipt
  const walk = dcall(D, 'otherIncome.save', {data: {date: '2026-09-25', category: 'FOOD', description: 'ชุดอาหารเย็น', qty: 2, unitPrice: 445, payMethod: 'CASH'}}).data;
  r = dcall(D, 'receipt.create', {data: {refs: [walk.docNo], date: T0, payMethod: 'CASH', customerName: 'ลูกค้าทั่วไป'}});
  check('walk-in receipt', r.ok && r.data.bookingNo === '' && r.data.total === 890 && !r.data.stay && r.data.items[0].unitLabel === 'ชุด', r);
  const w2 = dcall(D, 'otherIncome.save', {data: {date: '2026-09-25', category: 'LAUNDRY', qty: 1, unitPrice: 120, payMethod: 'CASH'}}).data;
  const linked = dcall(D, 'otherIncome.save', {data: {date: '2026-09-25', category: 'MINIBAR', bookingNo: 'BK-202609-0064', qty: 1, unitPrice: 40, payMethod: 'CASH'}}).data;
  r = dcall(D, 'receipt.create', {data: {refs: [w2.docNo, linked.docNo], date: T0, payMethod: 'CASH', customerName: 'x'}});
  check('lines of different stays are refused', !r.ok && r.field === 'refs', r);
  r = dcall(D, 'receipt.create', {data: {bookingNo: 'BK-202609-0057', refs: [w2.docNo], date: T0, payMethod: 'CASH', customerName: 'x'}});
  check('a line of another stay is refused', !r.ok && r.field === 'refs', r);
  r = dcall(D, 'receipt.createFromBooking', {bookingNo: 'BK-202609-0064', otherIncomeNos: [linked.docNo]});
  check('receipt.createFromBooking', r.ok && r.data.items.length === 2 && r.data.items[0].refDocNo === 'BK-202609-0064', r);

  // numbering follows Company.receiptPattern
  let nos;
  within('HT001', () => {
    nos = G("(function () { var old = readKV('Company').receiptPattern; withLock_(function () { writeKV('Company', {receiptPattern: 'INV-{######}'}); });" +
      " var a = nextReceiptNo_(), b = nextReceiptNo_(); withLock_(function () { writeKV('Company', {receiptPattern: old}); }); return [a, b, nextReceiptNo_()]; })()");
  });
  check('receipt numbers follow the pattern', nos[0] === 'INV-000001' && nos[1] === 'INV-000002' && /^RC-\d{6}-\d{4}$/.test(nos[2]), nos);
  r = dcall(D, 'receipt.export', {month: '2026-09'});
  check('receipt export', r.ok && r.data.rows.length === dcall(D, 'receipt.list', {month: '2026-09'}).data.total && r.data.headers.length === 11, r.ok ? r.data.rows.length : r);
  check('receipt rows are text in the sheet', dataRows('DEMO-HOTEL', 'Receipts').every(x => x.every(c => typeof c === 'string')));
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
