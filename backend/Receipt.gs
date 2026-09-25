/** Receipt.gs — ใบเสร็จรับเงิน (design/Receipt.dc.html). A receipt is issued from a stay (the room line plus the
 *  other income tied to it that was left to "รวมในใบเสร็จ") or from other income alone (a walk-in diner, a line paid
 *  on the spot). The customer's name, address, tax id and phone, the VAT rate and mode are copied onto the receipt, so
 *  a printed receipt never changes when the customer or the company settings do. A receipt is never deleted: it is
 *  cancelled (the number stays used), which frees its stay and lines for a new receipt and puts back the booking's
 *  payment status. Numbers follow Company.receiptPattern (DocNumber.gs nextReceiptNo_).
 *    list(month, q, filters) · candidates() · prepare({bookingNo} | {otherIncomeNos}) · create · get · cancel · print · export */
var RECEIPT_UNIT = {MINIBAR: 'PCS', FOOD: 'SET', LAUNDRY: 'TIME', SHUTTLE: 'TRIP', LATE: 'TIME'};

/** {refDocNo: receiptNo} for every booking / other income already on a receipt that is not cancelled. */
function receiptedRefs_() {
  var live = {}, out = {};
  readTable('Receipts').forEach(function (r) { if (r.status !== 'cancelled') live[r.docNo] = 1; });
  readTable('ReceiptItems').forEach(function (i) { if (live[i.docNo] && i.refDocNo) out[i.refDocNo] = i.docNo; });
  return out;
}

/** subtotal − discount by the VAT mode: included (the total holds the VAT) or excluded (VAT on top). */
function receiptMoney_(subtotal, discount, vr, mode) {
  subtotal = Math.round(subtotal * 100) / 100;
  var after = Math.round((subtotal - discount) * 100) / 100, vat, net, total;
  if (mode === 'excluded') { net = after; vat = Math.round(net * vr) / 100; total = Math.round((net + vat) * 100) / 100; }
  else { total = after; vat = Math.round(total * vr / (100 + vr) * 100) / 100; net = Math.round((total - vat) * 100) / 100; }
  return {subtotal: subtotal, discount: discount, netBeforeVat: net, vat: vat, total: total};
}

function receiptRoomLine_(b, types) {
  var t = types[b.typeCode] || {};
  return {refDocNo: b.docNo, kind: 'room', description: 'ค่าห้องพัก ' + (t.name || b.typeCode),
    detail: 'ห้อง ' + b.typeCode + ' ' + b.roomNo + ' · ' + fmtDateTh_(b.checkIn) + ' – ' + fmtDateTh_(b.checkOut),
    qty: b.nights, unit: 'NIGHT', unitPrice: b.rate, amount: Math.round(b.rate * b.nights * 100) / 100};
}
function receiptOtherLine_(o, cat) {
  return {refDocNo: o.docNo, kind: 'other', description: cat(o.category),
    detail: (o.description ? o.description + ' ' : '') + '(' + o.docNo + ')',
    qty: o.qty, unit: RECEIPT_UNIT[o.category] || 'TIME', unitPrice: o.unitPrice, amount: o.amount};
}
function roomTypeMap_() {
  var m = {};
  readTable('RoomTypes').forEach(function (t) { m[t.code] = t; });
  return m;
}
function userNames_() {
  var m = {};
  readTable('Users').forEach(function (u) { m[u.username] = u.fullName; });
  return m;
}

var ReceiptService = {
  /** a = {month, q, filters: {payMethod, status}, page, pageSize} */
  list: function (a) {
    a = a || {};
    var all = readTable('Receipts'), f = a.filters || {}, today = today_();
    var months = filterOptions_(all.map(function (r) { return {m: r.date.slice(0, 7)}; }), 'm', monthLabel_)
      .sort(function (x, y) { return x.value < y.value ? 1 : -1; });
    var month = a.month || (months.some(function (m) { return m.value === today.slice(0, 7); }) ? today.slice(0, 7) : (months[0] || {}).value || today.slice(0, 7));
    var inMonth = all.filter(function (r) { return r.date.slice(0, 7) === month; });
    var active = inMonth.filter(function (r) { return r.status !== 'cancelled'; });
    var sum = function (xs, k) { return Math.round(xs.reduce(function (s, r) { return s + r[k]; }, 0) * 100) / 100; };
    var q = String(a.q || '').trim().toLowerCase();
    var rows = inMonth.filter(function (r) {
      if (q && !(r.docNo.toLowerCase().indexOf(q) >= 0 || String(r.customerName).toLowerCase().indexOf(q) >= 0 ||
          String(r.bookingNo).toLowerCase().indexOf(q) >= 0 || String(r.customerTaxId).indexOf(q) >= 0)) return false;
      return (!f.payMethod || r.payMethod === f.payMethod) && (!f.status || (f.status === 'cancelled') === (r.status === 'cancelled'));
    }).sort(function (x, y) { return x.docNo < y.docNo ? 1 : -1; });
    var out = pageOf_(rows, a.page, a.pageSize);
    var items = {}, bookings = {}, names = userNames_();
    readTable('ReceiptItems').forEach(function (i) { items[i.docNo] = (items[i.docNo] || 0) + 1; });
    readTable('RoomIncome').forEach(function (b) { bookings[b.docNo] = b; });
    out.rows.forEach(function (r) {
      r.items = items[r.docNo] || 0;
      r.roomNo = bookings[r.bookingNo] ? bookings[r.bookingNo].roomNo : '';
      r.issuedByName = names[r.issuedBy] || r.issuedBy;
    });
    out.pageSum = sum(out.rows.filter(function (r) { return r.status !== 'cancelled'; }), 'total');
    out.month = month;
    out.months = months;
    out.kpi = {amount: sum(active, 'total'), count: active.length, vat: sum(active, 'vat'), cancelled: inMonth.length - active.length,
               pending: ReceiptService.pending_().length};
    var pay = dropdownLabel_('pay');
    out.options = {
      payMethod: filterOptions_(inMonth, 'payMethod', pay),
      status: [{value: 'active', label: 'ใช้งาน', count: active.length}, {value: 'cancelled', label: 'ยกเลิก', count: inMonth.length - active.length}]
        .filter(function (o) { return o.count; })
    };
    return out;
  },

  /** Stays that have checked out (up to today), are not cancelled and have no receipt for the room yet. */
  pending_: function () {
    var done = receiptedRefs_(), today = today_(), from = addDays_(today, -90);
    return readTable('RoomIncome').filter(function (b) { return isLive_(b) && b.checkOut <= today && b.checkOut >= from && !done[b.docNo]; });
  },

  /** What a new receipt can be made from: stays with something left to receipt, and other income with no stay. */
  candidates: function () {
    var done = receiptedRefs_(), today = today_(), from = addDays_(today, -90), to = addDays_(today, 30), open = {};
    readTable('OtherIncome').forEach(function (o) { if (o.bookingNo && !done[o.docNo]) open[o.bookingNo] = (open[o.bookingNo] || 0) + 1; });
    var bookings = readTable('RoomIncome').filter(function (b) {
      return isLive_(b) && b.checkOut >= from && b.checkIn <= to && (!done[b.docNo] || open[b.docNo]);
    }).sort(function (x, y) { return x.checkOut < y.checkOut ? 1 : x.checkOut > y.checkOut ? -1 : x.docNo < y.docNo ? 1 : -1; })
      .map(function (b) { return [b.docNo, b.guestName, b.roomNo, b.checkIn, b.checkOut, b.payStatus, b.customerId, done[b.docNo] ? 1 : 0, b.checkOut <= today ? 1 : 0]; });
    var cat = dropdownLabel_('othercat');
    var walkins = readTable('OtherIncome').filter(function (o) { return !o.bookingNo && !done[o.docNo] && o.date >= from; })
      .sort(function (x, y) { return x.docNo < y.docNo ? 1 : -1; })
      .map(function (o) { return [o.docNo, o.date, cat(o.category), o.description, o.amount, o.roomNo]; });
    return {bookings: bookings, walkins: walkins};
  },

  /** The draft of a new receipt: customer copied from the stay's customer, the lines that can go on it. */
  prepare: function (a) {
    a = a || {};
    var done = receiptedRefs_(), cat = dropdownLabel_('othercat'), lines = [], customer = {customerId: '', name: 'ลูกค้าทั่วไป', address: '', taxId: '', phone: ''};
    var b = null, discount = 0, payMethod = '';
    if (a.bookingNo) {
      b = findById('RoomIncome', a.bookingNo);
      if (!b) throw appError_('NOT_FOUND', 'ไม่พบการจอง ' + a.bookingNo + ' อาจถูกลบไปแล้ว');
      if (!isLive_(b)) throw fieldError_('bookingNo', 'การจอง ' + b.docNo + ' ถูกยกเลิกแล้ว จึงออกใบเสร็จไม่ได้');
      var room = receiptRoomLine_(b, roomTypeMap_());
      room.receipted = done[b.docNo] || '';
      lines.push(room);
      readTable('OtherIncome').filter(function (o) { return o.bookingNo === b.docNo; })
        .sort(function (x, y) { return x.docNo < y.docNo ? -1 : 1; })
        .forEach(function (o) { var l = receiptOtherLine_(o, cat); l.receipted = done[o.docNo] || ''; l.ownPay = o.payMethod; lines.push(l); });
      var c = b.customerId ? findById('Customers', b.customerId) : null;
      customer = {customerId: b.customerId, name: c ? c.name : b.guestName, address: c ? c.address : '', taxId: c ? c.taxId : '', phone: (c && c.phone) || b.phone};
      discount = b.discount;
      payMethod = b.payMethod;
    } else {
      (a.otherIncomeNos || []).forEach(function (no) {
        var o = findById('OtherIncome', no);
        if (!o) throw appError_('NOT_FOUND', 'ไม่พบรายการ ' + no + ' อาจถูกลบไปแล้ว');
        var l = receiptOtherLine_(o, cat); l.receipted = done[o.docNo] || ''; l.ownPay = o.payMethod; lines.push(l);
        payMethod = payMethod || o.payMethod;
      });
    }
    var co = readKV('Company');
    return {booking: b ? {docNo: b.docNo, guestName: b.guestName, roomNo: b.roomNo, typeCode: b.typeCode, checkIn: b.checkIn, checkOut: b.checkOut,
              payStatus: b.payStatus, channel: dropdownLabel_('channel')(b.channel)} : null,
            customer: customer, lines: lines, discount: discount, payMethod: payMethod,
            vatRate: Number(co.vatRate) || 0, vatMode: co.vatMode === 'excluded' ? 'excluded' : 'included'};
  },

  /** d = {bookingNo, refs: [docNo of the stay and / or other income], date, payMethod, payNote, note,
   *       customerId, customerName, customerAddress, customerTaxId, customerPhone} */
  create: function (user, d) {
    d = d || {};
    var clean = validate_('Receipt', d);
    if (clean.date > today_()) throw fieldError_('date', 'วันที่ใบเสร็จต้องไม่เกินวันนี้ กรุณาเลือกวันใหม่');
    var refs = (d.refs || []).map(String).filter(function (x, i, all) { return x && all.indexOf(x) === i; });
    if (!refs.length) throw fieldError_('refs', 'กรุณาเลือกรายการอย่างน้อย 1 รายการ');
    var bookingNo = String(d.bookingNo || '');
    return withLock_(function () {
      var done = receiptedRefs_(), cat = dropdownLabel_('othercat'), lines = [], b = null, discount = 0;
      if (bookingNo) {
        b = findById('RoomIncome', bookingNo);
        if (!b) throw appError_('NOT_FOUND', 'ไม่พบการจอง ' + bookingNo + ' อาจถูกลบไปแล้ว');
        if (!isLive_(b)) throw fieldError_('bookingNo', 'การจอง ' + b.docNo + ' ถูกยกเลิกแล้ว จึงออกใบเสร็จไม่ได้');
      }
      refs.forEach(function (ref) {
        if (done[ref]) throw fieldError_('refs', ref + ' อยู่ในใบเสร็จ ' + done[ref] + ' แล้ว — ยกเลิกใบเสร็จนั้นก่อนถ้าต้องการออกใหม่');
        if (b && ref === b.docNo) { lines.unshift(receiptRoomLine_(b, roomTypeMap_())); discount = b.discount; return; }
        var o = findById('OtherIncome', ref);
        if (!o) throw appError_('NOT_FOUND', 'ไม่พบรายการ ' + ref + ' อาจถูกลบไปแล้ว กรุณาเปิดแบบฟอร์มใหม่');
        if (bookingNo && o.bookingNo !== bookingNo) throw fieldError_('refs', ref + ' ผูกกับการจองอื่น — ใบเสร็จหนึ่งใบรวมได้เฉพาะรายการของการเข้าพักเดียวกัน');
        var l = receiptOtherLine_(o, cat); l.bookingNo = o.bookingNo; lines.push(l);
      });
      if (!bookingNo) {   // other income only: every line from the same stay, or none
        var stays = lines.map(function (l) { return l.bookingNo; }).filter(function (x, i, all) { return all.indexOf(x) === i; });
        if (stays.length > 1) throw fieldError_('refs', 'รายการที่เลือกมาจากหลายการเข้าพัก — ใบเสร็จหนึ่งใบรวมได้เฉพาะรายการของการเข้าพักเดียวกัน');
        bookingNo = stays[0] || '';
      }
      var co = readKV('Company'), vr = Number(co.vatRate) || 0, mode = co.vatMode === 'excluded' ? 'excluded' : 'included';
      var money = receiptMoney_(lines.reduce(function (s, l) { return s + l.amount; }, 0), discount, vr, mode);
      var docNo = nextReceiptNo_(), now = nowISO_();
      var roomIn = b && refs.indexOf(b.docNo) >= 0;
      var r = {docNo: docNo, date: clean.date, customerId: String(d.customerId || ''), bookingNo: bookingNo, subtotal: money.subtotal,
        discount: money.discount, netBeforeVat: money.netBeforeVat, vat: money.vat, total: money.total, payMethod: clean.payMethod,
        status: 'active', issuedBy: user.username, createdAt: now, customerName: clean.customerName, customerAddress: clean.customerAddress,
        customerTaxId: clean.customerTaxId, customerPhone: clean.customerPhone, payNote: clean.payNote, note: clean.note, vatRate: vr,
        vatMode: mode, prevPayStatus: roomIn && b.payStatus !== 'paid' ? b.payStatus : '', cancelReason: '', cancelledBy: '', cancelledAt: '', printCount: 0};
      if (r.customerId && !findById('Customers', r.customerId)) r.customerId = '';
      insertRow('Receipts', r);
      insertRows('ReceiptItems', lines.map(function (l, i) {
        return {itemId: docNo + '-' + (i + 1), docNo: docNo, line: i + 1, description: l.description, detail: l.detail, qty: l.qty,
                unit: l.unit, unitPrice: l.unitPrice, amount: l.amount, refDocNo: l.refDocNo};
      }));
      if (roomIn && (b.payStatus !== 'paid' || !b.payMethod)) {   // the receipt says the stay is paid
        updateRow('RoomIncome', b.docNo, {payStatus: 'paid', payMethod: b.payMethod || clean.payMethod, updatedAt: now});
      }
      audit('CREATE', 'Receipts', docNo, {bookingNo: bookingNo, refs: refs, total: money.total});
      return ReceiptService.get(docNo);
    });
  },

  get: function (docNo) {
    var r = findById('Receipts', docNo);
    if (!r) throw appError_('NOT_FOUND', 'ไม่พบใบเสร็จ ' + docNo + ' อาจพิมพ์เลขผิด กรุณารีเฟรชหน้า');
    var unit = dropdownLabel_('unit'), names = userNames_();
    r.items = readTable('ReceiptItems').filter(function (i) { return i.docNo === docNo; })
      .sort(function (a, b) { return a.line - b.line; })
      .map(function (i) { i.unitLabel = unit(i.unit); return i; });
    var b = r.bookingNo ? findById('RoomIncome', r.bookingNo) : null;
    if (b) {
      var t = roomTypeMap_()[b.typeCode] || {};
      r.stay = {roomNo: b.roomNo, typeCode: b.typeCode, typeName: t.name || b.typeCode, checkIn: b.checkIn, checkOut: b.checkOut,
                channel: dropdownLabel_('channel')(b.channel), room: r.items.some(function (i) { return i.refDocNo === b.docNo; })};
    }
    r.payLabel = dropdownLabel_('pay')(r.payMethod);
    r.words = bahtText_(r.total);
    r.issuedByName = names[r.issuedBy] || r.issuedBy;
    r.cancelledByName = r.cancelledBy ? names[r.cancelledBy] || r.cancelledBy : '';
    return r;
  },

  cancel: function (user, docNo, reason) {
    reason = String(reason || '').trim();
    if (reason.length < 3) throw fieldError_('reason', 'กรุณาระบุเหตุผลที่ยกเลิกใบเสร็จ อย่างน้อย 3 ตัวอักษร');
    if (reason.length > 200) throw fieldError_('reason', 'เหตุผลยาวเกิน 200 ตัวอักษร กรุณาย่อให้สั้นลง');
    return withLock_(function () {
      var r = findById('Receipts', docNo);
      if (!r) throw appError_('NOT_FOUND', 'ไม่พบใบเสร็จ ' + docNo + ' อาจถูกลบไปแล้ว');
      if (r.status === 'cancelled') throw appError_('IN_USE', 'ใบเสร็จ ' + docNo + ' ถูกยกเลิกไปแล้ว');
      updateRow('Receipts', docNo, {status: 'cancelled', cancelReason: reason, cancelledBy: user.username, cancelledAt: nowISO_()});
      var b = r.prevPayStatus && r.bookingNo ? findById('RoomIncome', r.bookingNo) : null;
      if (b && b.payStatus === 'paid') updateRow('RoomIncome', b.docNo, {payStatus: r.prevPayStatus, updatedAt: nowISO_()});   // back to มัดจำ / ค้างชำระ
      audit('CANCEL', 'Receipts', docNo, {reason: reason, total: r.total});
      return ReceiptService.get(docNo);
    });
  },

  /** Printing is audited and counted (a reprint says so on the page). */
  print: function (user, docNo, copies) {
    return withLock_(function () {
      var r = findById('Receipts', docNo);
      if (!r) throw appError_('NOT_FOUND', 'ไม่พบใบเสร็จ ' + docNo);
      var n = (r.printCount || 0) + 1;
      updateRow('Receipts', docNo, {printCount: n});
      audit('PRINT', 'Receipts', docNo, {copies: copies ? 2 : 1, time: n});
      return {printCount: n};
    });
  },

  export: function (user, a) {
    a = a || {};
    var r = ReceiptService.list({month: a.month, q: a.q, filters: a.filters, pageSize: 'all'}), pay = dropdownLabel_('pay');
    audit('EXPORT', 'Receipts', r.month, {rows: r.total});
    return {month: r.month, headers: ['เลขที่', 'วันที่', 'ลูกค้า', 'เลขประจำตัวผู้เสียภาษี', 'อ้างอิงการจอง', 'มูลค่าก่อนภาษี', 'ภาษีมูลค่าเพิ่ม', 'จำนวนเงินรวม', 'วิธีชำระ', 'สถานะ', 'ผู้ออก'],
      rows: r.rows.map(function (x) { return [x.docNo, x.date, x.customerName, x.customerTaxId, x.bookingNo, x.netBeforeVat, x.vat, x.total, pay(x.payMethod),
        x.status === 'cancelled' ? 'ยกเลิก' : 'ใช้งาน', x.issuedByName]; })};
  }
};

/** 5580 → ห้าพันห้าร้อยแปดสิบบาทถ้วน · 1234.5 → หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์ (as Excel BAHTTEXT). */
function bahtText_(amount) {
  var n = Math.round(Math.abs(Number(amount) || 0) * 100), baht = Math.floor(n / 100), satang = n % 100;
  var digit = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'], place = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
  var group = function (x, higher) {   // 0 … 999,999; higher: millions come before it (1,000,001 → …ล้านเอ็ด)
    var s = String(x), out = '';
    for (var i = 0; i < s.length; i++) {
      var d = Number(s[i]), p = s.length - i - 1;
      if (!d) continue;
      if (p === 1 && d === 1) out += 'สิบ';
      else if (p === 1 && d === 2) out += 'ยี่สิบ';
      else if (p === 0 && d === 1 && (s.length > 1 || higher)) out += 'เอ็ด';
      else out += digit[d] + place[p];
    }
    return out;
  };
  var read = function (x) { return x >= 1000000 ? read(Math.floor(x / 1000000)) + 'ล้าน' + group(x % 1000000, true) : group(x); };
  if (!baht && !satang) return 'ศูนย์บาทถ้วน';
  return (baht ? read(baht) + 'บาท' : '') + (satang ? read(satang) + 'สตางค์' : 'ถ้วน');
}
