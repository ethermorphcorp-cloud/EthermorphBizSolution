/** Customer.gs — ข้อมูลลูกค้า: server-side list (search, filters that exist in the data, paging), history,
 *  save, delete (only when no booking or receipt uses the customer), Excel export / import (the browser reads and
 *  writes the .xlsx; rows travel as JSON). Phone numbers and tax ids stay strings end to end. */
var CUSTOMER_EXPORT_COLS = [
  ['customerId', 'รหัส'], ['name', 'ชื่อ-นามสกุล / บริษัท'], ['type', 'ประเภท'], ['nationality', 'สัญชาติ'],
  ['phone', 'โทรศัพท์'], ['email', 'อีเมล'], ['taxId', 'เลขประจำตัวผู้เสียภาษี'], ['address', 'ที่อยู่'], ['note', 'หมายเหตุ'],
  ['stays', 'เข้าพัก (ครั้ง)'], ['spent', 'ยอดใช้จ่ายรวม'], ['lastStay', 'เข้าพักล่าสุด']
];
var CUSTOMER_IMPORT_MAX = 1000;

/** {customerId: {stays, spent, lastStay}} from the bookings that were not cancelled. */
function customerStats_() {
  var st = {};
  readTable('RoomIncome').forEach(function (b) {
    if (b.payStatus === 'cxl' || !b.customerId) return;
    var s = st[b.customerId] || (st[b.customerId] = {stays: 0, spent: 0, lastStay: ''});
    s.stays++;
    s.spent += b.total;
    if (b.checkIn > s.lastStay) s.lastStay = b.checkIn;
  });
  return st;
}
function withStats_(customers) {
  var st = customerStats_();
  return customers.map(function (c) {
    var s = st[c.customerId] || {stays: 0, spent: 0, lastStay: ''};
    c.stays = s.stays; c.spent = Math.round(s.spent * 100) / 100; c.lastStay = s.lastStay;
    return c;
  });
}

/** Every customer in a light shape for the booking form's search box (≈40 bytes each). */
function customerLookup_() {
  return readTable('Customers').map(function (c) { return [c.customerId, c.name, c.phone, c.type]; })
    .sort(function (a, b) { return a[0] < b[0] ? 1 : -1; });
}

var CustomerService = {
  /** a = {q, filters: {type, nationality, lastStay: '30'|'90'|'365'|'never'}, sort: {key, dir}, page, pageSize} */
  list: function (a) {
    a = a || {};
    var f = a.filters || {}, q = String(a.q || '').trim().toLowerCase(), qDigits = q.replace(/\D/g, '');
    var all = withStats_(readTable('Customers'));
    var typeLabel = dropdownLabel_('custtype');
    var since = function (days) { return addDays_(today_(), -Number(days)); };
    var rows = all.filter(function (c) {
      if (q && !(String(c.name).toLowerCase().indexOf(q) >= 0 || c.customerId.toLowerCase().indexOf(q) >= 0 ||
          String(c.email).toLowerCase().indexOf(q) >= 0 || (qDigits.length >= 3 && String(c.phone).replace(/\D/g, '').indexOf(qDigits) >= 0))) return false;
      if (f.type && c.type !== f.type) return false;
      if (f.nationality && c.nationality !== f.nationality) return false;
      if (f.lastStay === 'never') return !c.stays;
      if (f.lastStay && (!c.lastStay || c.lastStay < since(f.lastStay))) return false;
      return true;
    });
    var s = a.sort || {}, key = {customerId: 1, name: 1, stays: 1, spent: 1, lastStay: 1}[s.key] ? s.key : 'customerId';
    var dir = s.key && s.dir === 'asc' ? 1 : -1;   // newest customers first by default
    rows.sort(function (x, y) {
      var u = x[key], v = y[key];
      return (u > v ? 1 : u < v ? -1 : 0) * dir || (x.customerId < y.customerId ? 1 : -1);
    });
    var out = pageOf_(rows, a.page, a.pageSize);
    out.count = all.length;
    out.options = {
      type: filterOptions_(all, 'type', typeLabel),
      nationality: filterOptions_(all, 'nationality'),
      lastStay: [['30', '30 วันล่าสุด'], ['90', '90 วันล่าสุด'], ['365', '1 ปีล่าสุด'], ['never', 'ยังไม่เคยเข้าพัก']].map(function (o) {
        var n = all.filter(function (c) { return o[0] === 'never' ? !c.stays : c.lastStay && c.lastStay >= since(o[0]); }).length;
        return {value: o[0], label: o[1], count: n};
      }).filter(function (o) { return o.count; })
    };
    return out;
  },

  /** The customer with stats and stay history (newest first). */
  get: function (id) {
    var c = findById('Customers', id);
    if (!c) throw appError_('NOT_FOUND', 'ไม่พบลูกค้ารหัส ' + id + ' อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');
    c = withStats_([c])[0];
    c.history = readTable('RoomIncome').filter(function (b) { return b.customerId === id; })
      .sort(function (x, y) { return x.checkIn < y.checkIn ? 1 : -1; }).slice(0, 100)
      .map(function (b) {
        return {docNo: b.docNo, checkIn: b.checkIn, checkOut: b.checkOut, nights: b.nights, typeCode: b.typeCode,
                roomNo: b.roomNo, total: b.total, payStatus: b.payStatus, channel: b.channel};
      });
    return c;
  },

  save: function (user, d) {
    d = d || {};
    if (!d.type) d.type = 'GEN';
    var clean = validate_('Customer', d), id = d.customerId || '';
    return withLock_(function () {
      if (id) {
        if (!findById('Customers', id)) throw appError_('NOT_FOUND', 'ไม่พบลูกค้ารหัส ' + id + ' อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');
        clean.updatedAt = nowISO_();
        updateRow('Customers', id, clean);
        audit('UPDATE', 'Customers', id, clean);
      } else {
        id = nextId_('Customers', 'CU-', 4);
        clean.customerId = id;
        clean.createdAt = nowISO_();
        insertRow('Customers', clean);
        audit('CREATE', 'Customers', id, clean);
      }
      clean.customerId = id;
      return clean;
    });
  },

  delete: function (user, id) {
    return withLock_(function () {
      var c = findById('Customers', id);
      if (!c) throw appError_('NOT_FOUND', 'ไม่พบลูกค้ารหัส ' + id + ' อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');
      var stays = readTable('RoomIncome').filter(function (b) { return b.customerId === id; }).length;
      var receipts = readTable('Receipts').filter(function (r) { return r.customerId === id; }).length;
      if (stays || receipts) {
        throw appError_('IN_USE', c.name + ' มีประวัติ' + (stays ? 'การเข้าพัก ' + stays + ' รายการ' : 'ใบเสร็จ ' + receipts + ' ใบ') +
          ' จึงลบไม่ได้ — แก้ไขข้อมูลแทนได้');
      }
      deleteRow('Customers', id);
      audit('DELETE', 'Customers', id, {name: c.name});
      return true;
    });
  },

  /** Every customer, with stats, as rows for the .xlsx the browser writes. Audited as an export. */
  export: function (user) {
    var typeLabel = dropdownLabel_('custtype');
    var rows = withStats_(readTable('Customers')).map(function (c) {
      c.type = typeLabel(c.type);
      return CUSTOMER_EXPORT_COLS.map(function (col) { return c[col[0]]; });
    });
    audit('EXPORT', 'Customers', '', {rows: rows.length});
    return {headers: CUSTOMER_EXPORT_COLS.map(function (c) { return c[1]; }), rows: rows};
  },

  /** rows = [{name, type (code or label), nationality, phone, email, taxId, address, note}] read from Excel.
   *  check: true → validate only (the preview). Otherwise every valid row that is not a duplicate is added in one
   *  write. A row whose phone (or name when it has no phone) matches an existing customer is skipped. */
  import: function (user, rows, check) {
    rows = (rows || []).slice(0, CUSTOMER_IMPORT_MAX + 1);
    if (!rows.length) throw appError_('VALIDATION', 'ไม่พบข้อมูลในไฟล์ กรุณาใช้ไฟล์ตามแบบฟอร์มนำเข้า');
    if (rows.length > CUSTOMER_IMPORT_MAX) throw appError_('VALIDATION', 'นำเข้าได้ครั้งละไม่เกิน ' + CUSTOMER_IMPORT_MAX + ' รายการ กรุณาแบ่งไฟล์');
    var types = readTable('Dropdowns').filter(function (d) { return d.group === 'custtype'; });
    var existing = readTable('Customers'), seenPhone = {}, seenName = {};
    existing.forEach(function (c) { if (c.phone) seenPhone[c.phone.replace(/\D/g, '')] = c.customerId; seenName[String(c.name).trim().toLowerCase()] = c.customerId; });
    var ok = [], errors = [], skipped = [];
    rows.forEach(function (r, i) {
      var line = i + 2;   // row 1 is the header in the file
      var t = String(r.type || '').trim();
      var hit = types.filter(function (x) { return x.code === t.toUpperCase() || x.label === t; })[0];
      if (t && !hit) { errors.push({row: line, field: 'type', message: 'ไม่พบประเภทลูกค้า "' + t + '" — ใช้ ' + types.map(function (x) { return x.label; }).join(', ')}); return; }
      r.type = hit ? hit.code : 'GEN';
      var clean;
      try { clean = validate_('Customer', r); }
      catch (e) { errors.push({row: line, field: e.field || '', message: e.message}); return; }
      var pk = clean.phone.replace(/\D/g, ''), nk = clean.name.toLowerCase();
      var dup = pk ? seenPhone[pk] : seenName[nk];
      if (dup) { skipped.push({row: line, message: 'ซ้ำกับลูกค้า ' + dup}); return; }
      if (pk) seenPhone[pk] = 'แถว ' + line; else seenName[nk] = 'แถว ' + line;
      ok.push(clean);
    });
    if (check) return {valid: ok.length, errors: errors, skipped: skipped};
    if (!ok.length) return {added: 0, errors: errors, skipped: skipped};
    return withLock_(function () {
      var next = Number(nextId_('Customers', 'CU-', 4).slice(3)), now = nowISO_();
      ok.forEach(function (c) { c.customerId = 'CU-' + pad_(next++, 4); c.createdAt = now; });
      insertRows('Customers', ok);
      audit('IMPORT', 'Customers', '', {added: ok.length, errors: errors.length, skipped: skipped.length});
      return {added: ok.length, first: ok[0].customerId, last: ok[ok.length - 1].customerId, errors: errors, skipped: skipped};
    });
  }
};
