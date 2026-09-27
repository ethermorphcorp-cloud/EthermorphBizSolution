/** RoomIncome.gs — รายได้ห้องพัก (bookings): list with KPIs, the booking form, calendar, availability.
 *  A booking belongs to the month of its check-in. Cancelled bookings (payStatus cxl) stay in the list but hold no
 *  nights and earn nothing. Two live bookings never share a room night (checked inside the lock on save).
 *  Money: net = rate × nights − discount. VAT follows Company.vatMode: included → total = net, vat inside;
 *  excluded → vat = net × rate%, total = net + vat. */
var TH_MONTH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function monthLabel_(ym) { return TH_MONTH_SHORT[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4); }
function isLive_(b) { return b.payStatus !== 'cxl'; }
/** Does booking b hold room nights in [from, to)? */
function overlaps_(b, from, to) { return b.checkIn < to && from < b.checkOut; }

var RoomIncomeService = {
  /** a = {month, q, filters: {typeCode, channel, payStatus}, sort: {key, dir}, page, pageSize} */
  list: function (a) {
    a = a || {};
    var all = readTable('RoomIncome'), f = a.filters || {};
    var months = filterOptions_(all.map(function (b) { return {m: b.checkIn.slice(0, 7)}; }), 'm', monthLabel_)
      .sort(function (x, y) { return x.value < y.value ? 1 : -1; });
    var month = a.month || (months.some(function (m) { return m.value === today_().slice(0, 7); }) ? today_().slice(0, 7) : (months[0] || {}).value || today_().slice(0, 7));
    var inMonth = all.filter(function (b) { return b.checkIn.slice(0, 7) === month; });
    // other income tied to a stay and left to "รวมในใบเสร็จ" (no pay method of its own) is part of what the guest pays
    var extra = extrasByBooking_();
    inMonth.forEach(function (b) {
      var x = extra[b.docNo] || {amount: 0, count: 0};
      b.extras = x.amount; b.extrasCount = x.count;
      b.grand = isLive_(b) ? Math.round((b.total + x.amount) * 100) / 100 : b.total;
    });
    var live = inMonth.filter(isLive_);
    var revenue = live.reduce(function (s, b) { return s + b.total; }, 0), nights = live.reduce(function (s, b) { return s + b.nights; }, 0);
    var due = inMonth.filter(function (b) { return b.payStatus === 'due'; });
    var q = String(a.q || '').trim().toLowerCase(), qd = q.replace(/\D/g, '');
    var rows = inMonth.filter(function (b) {
      if (q && !(b.docNo.toLowerCase().indexOf(q) >= 0 || String(b.guestName).toLowerCase().indexOf(q) >= 0 ||
          String(b.roomNo).toLowerCase() === q || (qd.length >= 3 && String(b.phone).replace(/\D/g, '').indexOf(qd) >= 0))) return false;
      return (!f.typeCode || b.typeCode === f.typeCode) && (!f.channel || b.channel === f.channel) && (!f.payStatus || b.payStatus === f.payStatus);
    });
    var s = a.sort || {}, key = {docNo: 1, guestName: 1, checkIn: 1, nights: 1, total: 1}[s.key] ? s.key : 'docNo', dir = s.key && s.dir === 'asc' ? 1 : -1;
    if (key === 'total') key = 'grand';   // the column shows the room with its other income
    rows.sort(function (x, y) { return (x[key] > y[key] ? 1 : x[key] < y[key] ? -1 : 0) * dir || (x.docNo < y.docNo ? 1 : -1); });
    var out = pageOf_(rows, a.page, a.pageSize);
    var pageLive = out.rows.filter(isLive_);
    out.pageSum = {count: out.rows.length, nights: pageLive.reduce(function (t, b) { return t + b.nights; }, 0),
                   total: Math.round(pageLive.reduce(function (t, b) { return t + b.grand; }, 0) * 100) / 100};
    out.month = month;
    out.months = months;
    out.kpi = {revenue: Math.round(revenue * 100) / 100, nights: nights, adr: nights ? Math.round(revenue / nights * 100) / 100 : 0,
               due: Math.round(due.reduce(function (t, b) { return t + b.grand - b.deposit; }, 0) * 100) / 100, dueCount: due.length};
    var types = {};
    readTable('RoomTypes').forEach(function (t) { types[t.code] = t.name; });
    out.options = {
      typeCode: filterOptions_(inMonth, 'typeCode', function (c) { return types[c] || c; }),
      channel: filterOptions_(inMonth, 'channel', dropdownLabel_('channel')),
      payStatus: filterOptions_(inMonth, 'payStatus', function (v) { return {paid: 'ชำระแล้ว', dep: 'มัดจำ', due: 'ค้างชำระ', cxl: 'ยกเลิก'}[v] || v; })
    };
    out.counts = {rooms: inMonth.length, other: readTable('OtherIncome').filter(function (o) { return o.date.slice(0, 7) === month; }).length};
    return out;
  },

  get: function (docNo) {
    var b = findById('RoomIncome', docNo);
    if (!b) throw appError_('NOT_FOUND', 'ไม่พบการจอง ' + docNo + ' อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');
    b.other = readTable('OtherIncome').filter(function (o) { return o.bookingNo === docNo; });
    b.receipts = readTable('Receipts').filter(function (r) { return r.bookingNo === docNo; }).map(function (r) { return {docNo: r.docNo, status: r.status, total: r.total}; });
    b.attachments = AttachmentService.list(docNo);
    return b;
  },

  /** Rooms of the stay period: {roomNo: {free, docNo, guestName, off}} — the booking form's room list. */
  availability: function (checkIn, checkOut, exceptDocNo) {
    checkIn = parseDate_(checkIn); checkOut = parseDate_(checkOut);
    if (!checkIn || !checkOut || checkOut <= checkIn) throw appError_('VALIDATION', 'กรุณาเลือกวันเช็คอินและเช็คเอาท์ให้ถูกต้อง', 'checkOut');
    var taken = {};
    readTable('RoomIncome').forEach(function (b) {
      if (isLive_(b) && b.docNo !== exceptDocNo && overlaps_(b, checkIn, checkOut) && !taken[b.roomNo]) taken[b.roomNo] = b;
    });
    var out = {};
    readTable('Rooms').forEach(function (r) {
      var b = taken[r.roomNo], off = roomOffDuring_(r, checkIn, checkOut);
      out[r.roomNo] = {free: !b && !off, docNo: b ? b.docNo : '', guestName: b ? b.guestName : '', off: off};
    });
    return out;
  },

  save: function (user, d) {
    d = d || {};
    var docNo = d.docNo || '';
    var cust = d.customerId ? findById('Customers', d.customerId) : null;
    if (!d.customerId) throw fieldError_('customerId', 'กรุณาเลือกลูกค้า หรือกด ลูกค้าใหม่ เพื่อเพิ่มก่อน');
    if (!cust) throw fieldError_('customerId', 'ไม่พบลูกค้ารหัส ' + d.customerId + ' กรุณาเลือกจากรายการ');
    if (!d.guestName) d.guestName = cust.name;
    if (!d.phone) d.phone = cust.phone;
    var clean = validate_('RoomIncome', d);
    var type = findById('RoomTypes', clean.typeCode), room = findById('Rooms', clean.roomNo);
    if (room.typeCode !== clean.typeCode) throw fieldError_('roomNo', 'ห้อง ' + clean.roomNo + ' ไม่ใช่ห้องประเภท ' + type.name + ' กรุณาเลือกห้องใหม่');
    if (clean.guests > type.maxGuests) throw fieldError_('guests', type.name + ' รับได้สูงสุด ' + type.maxGuests + ' คน กรุณาเลือกห้องที่ใหญ่ขึ้น');
    var money = bookingMoney_(clean.rate, nightsBetween_(clean.checkIn, clean.checkOut), clean.discount);
    if (clean.payStatus === 'dep') {
      if (!(clean.deposit > 0)) throw fieldError_('deposit', 'กรุณากรอกยอดมัดจำ');
      if (clean.deposit > money.total) throw fieldError_('deposit', 'ยอดมัดจำต้องไม่เกินยอดสุทธิ ' + fmtBaht_(money.total));
    } else clean.deposit = 0;
    if ((clean.payStatus === 'paid' || clean.payStatus === 'dep') && !clean.payMethod) throw fieldError_('payMethod', 'กรุณาเลือกวิธีชำระเงิน');
    return withLock_(function () {
      var cur = docNo ? findById('RoomIncome', docNo) : null;
      if (docNo && !cur) throw appError_('NOT_FOUND', 'ไม่พบการจอง ' + docNo + ' อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');
      if (clean.payStatus !== 'cxl') {
        var clash = readTable('RoomIncome').filter(function (b) {
          return isLive_(b) && b.docNo !== docNo && b.roomNo === clean.roomNo && overlaps_(b, clean.checkIn, clean.checkOut);
        })[0];
        if (clash) throw fieldError_('roomNo', 'ห้อง ' + clean.roomNo + ' มีการจอง ' + clash.docNo + ' (' + clash.guestName + ') ช่วง ' +
          fmtDateTh_(clash.checkIn) + ' – ' + fmtDateTh_(clash.checkOut) + ' แล้ว กรุณาเลือกห้องหรือวันอื่น');
        if (roomOffDuring_(room, clean.checkIn, clean.checkOut) && !(cur && cur.roomNo === clean.roomNo)) {
          throw fieldError_('roomNo', 'ห้อง ' + clean.roomNo + ' ปิดปรับปรุงในช่วงนี้ กรุณาเลือกห้องอื่น หรือเปลี่ยนสถานะห้องก่อน');
        }
      }
      var rec = {customerId: cust.customerId, guestName: clean.guestName, phone: clean.phone, typeCode: clean.typeCode, roomNo: clean.roomNo,
                 checkIn: clean.checkIn, checkOut: clean.checkOut, nights: money.nights, guests: clean.guests, rate: clean.rate,
                 discount: clean.discount, total: money.total, vatAmount: money.vat, channel: clean.channel, payMethod: clean.payMethod,
                 payStatus: clean.payStatus, deposit: clean.deposit, note: clean.note};
      if (cur) {
        rec.updatedAt = nowISO_();
        updateRow('RoomIncome', docNo, rec);
        audit('UPDATE', 'RoomIncome', docNo, {room: rec.roomNo, checkIn: rec.checkIn, total: rec.total, payStatus: rec.payStatus});
      } else {
        docNo = nextDocNo(DOC_PREFIX.roomIncome);
        rec.docNo = docNo; rec.createdBy = user.username; rec.createdAt = nowISO_();
        insertRow('RoomIncome', rec);
        audit('CREATE', 'RoomIncome', docNo, {room: rec.roomNo, checkIn: rec.checkIn, total: rec.total, payStatus: rec.payStatus});
      }
      rec.docNo = docNo;
      return rec;
    });
  },

  /** Cancel keeps the record (payStatus cxl) and frees the room. */
  cancel: function (user, docNo) {
    return withLock_(function () {
      var b = findById('RoomIncome', docNo);
      if (!b) throw appError_('NOT_FOUND', 'ไม่พบการจอง ' + docNo + ' กรุณารีเฟรชหน้า');
      if (b.payStatus === 'cxl') return true;
      if (readTable('Receipts').some(function (r) { return r.bookingNo === docNo && r.status !== 'cancelled'; })) {
        throw appError_('IN_USE', 'การจองนี้ออกใบเสร็จแล้ว — ยกเลิกใบเสร็จก่อน แล้วจึงยกเลิกการจอง');
      }
      updateRow('RoomIncome', docNo, {payStatus: 'cxl', updatedAt: nowISO_()});
      audit('CANCEL', 'RoomIncome', docNo, {from: b.payStatus});
      return true;
    });
  },

  /** Only a booking nothing refers to (other income, receipts) can be deleted; otherwise cancel it. */
  delete: function (user, docNo) {
    return withLock_(function () {
      var b = findById('RoomIncome', docNo);
      if (!b) throw appError_('NOT_FOUND', 'ไม่พบการจอง ' + docNo + ' กรุณารีเฟรชหน้า');
      var other = readTable('OtherIncome').filter(function (o) { return o.bookingNo === docNo; }).length;
      var rc = readTable('Receipts').filter(function (r) { return r.bookingNo === docNo; }).length;
      if (other || rc) throw appError_('IN_USE', 'การจองนี้มี' + (rc ? 'ใบเสร็จ ' + rc + ' ใบ' : 'รายได้อื่นที่ผูกไว้ ' + other + ' รายการ') + ' จึงลบไม่ได้ — ใช้ ยกเลิกการจอง แทน');
      dropAttachments_(docNo);
      deleteRow('RoomIncome', docNo);
      audit('DELETE', 'RoomIncome', docNo, {guest: b.guestName, total: b.total});
      return true;
    });
  },

  /** Month view: per day — rooms occupied that night, check-ins, other income, revenue (check-ins + other). */
  calendar: function (month) {
    month = /^\d{4}-\d{2}$/.test(String(month)) ? month : today_().slice(0, 7);
    var first = month + '-01', days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    var roomsCount = readTable('Rooms').length, bookings = readTable('RoomIncome'), live = bookings.filter(isLive_);
    var other = readTable('OtherIncome').filter(function (o) { return o.date.slice(0, 7) === month; });
    var out = [];
    for (var i = 0; i < days; i++) {
      var d = addDays_(first, i), next = addDays_(d, 1);
      var ins = bookings.filter(function (b) { return b.checkIn === d; })
        .map(function (b) { return {kind: 'room', docNo: b.docNo, name: b.guestName, roomNo: b.roomNo, typeCode: b.typeCode, amount: b.total, payStatus: b.payStatus}; });
      var oi = other.filter(function (o) { return o.date === d; })
        .map(function (o) { return {kind: 'other', docNo: o.docNo, name: o.category, roomNo: o.roomNo, amount: o.amount, payStatus: o.payMethod ? 'paid' : 'due'}; });
      var occ = live.filter(function (b) { return overlaps_(b, d, next); }).length;
      var rev = ins.filter(function (x) { return x.payStatus !== 'cxl'; }).concat(oi).reduce(function (s, x) { return s + x.amount; }, 0);
      out.push({date: d, occ: occ, rev: Math.round(rev * 100) / 100, items: ins.concat(oi)});
    }
    var cats = dropdownLabel_('othercat');
    out.forEach(function (day) { day.items.forEach(function (x) { if (x.kind === 'other') x.name = cats(x.name); }); });
    return {month: month, rooms: roomsCount, today: today_(), days: out};
  },

  /** Rows for the .xlsx the browser writes (the month and filters of the list). Audited. */
  export: function (user, a) {
    a = a || {};
    var r = RoomIncomeService.list({month: a.month, q: a.q, filters: a.filters, pageSize: 'all'});
    var ch = dropdownLabel_('channel'), pay = dropdownLabel_('pay');
    var st = {paid: 'ชำระแล้ว', dep: 'มัดจำ', due: 'ค้างชำระ', cxl: 'ยกเลิก'};
    audit('EXPORT', 'RoomIncome', r.month, {rows: r.total});
    return {
      month: r.month,
      headers: ['เลขที่', 'ผู้เข้าพัก', 'โทรศัพท์', 'ประเภทห้อง', 'ห้อง', 'เช็คอิน', 'เช็คเอาท์', 'คืน', 'ผู้เข้าพัก (คน)', 'ราคาต่อคืน', 'ส่วนลด',
                'ค่าห้องสุทธิ', 'VAT', 'รายได้อื่นรวมในใบเสร็จ', 'ยอดรวม', 'ช่องทาง', 'วิธีชำระ', 'สถานะ', 'มัดจำ', 'หมายเหตุ'],
      rows: r.rows.map(function (b) {
        return [b.docNo, b.guestName, b.phone, b.typeCode, b.roomNo, b.checkIn, b.checkOut, b.nights, b.guests, b.rate, b.discount,
                b.total, b.vatAmount, b.extras, b.grand, ch(b.channel), b.payMethod ? pay(b.payMethod) : '', st[b.payStatus] || b.payStatus, b.deposit, b.note];
      })
    };
  }
};

/** {nights, net, vat, total} by the company's VAT mode. */
function bookingMoney_(rate, nights, discount) {
  var c = readKV('Company'), vr = Number(c.vatRate) || 0, net = Math.round((rate * nights - (discount || 0)) * 100) / 100;
  if (c.vatMode === 'excluded') {
    var vat = Math.round(net * vr) / 100;
    return {nights: nights, net: net, vat: vat, total: Math.round((net + vat) * 100) / 100};
  }
  return {nights: nights, net: net, vat: Math.round(net * vr / (100 + vr) * 100) / 100, total: net};
}

/** A room closed for repair during [from, to): status off from today until offUntil (inclusive), or with no end. */
function roomOffDuring_(room, from, to) {
  if (room.status !== 'off') return false;
  if (!room.offUntil) return today_() < to;
  return room.offUntil >= from && today_() < to;
}

/** {bookingNo: {amount, count}} of other income tied to a stay with no pay method of its own (รวมในใบเสร็จ). */
function extrasByBooking_() {
  var m = {};
  readTable('OtherIncome').forEach(function (o) {
    if (!o.bookingNo || o.payMethod) return;
    var x = m[o.bookingNo] || (m[o.bookingNo] = {amount: 0, count: 0});
    x.amount = Math.round((x.amount + o.amount) * 100) / 100;
    x.count++;
  });
  return m;
}

function fmtDateTh_(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; }
function fmtBaht_(n) {
  var s = (Math.round(n * 100) / 100).toFixed(2).split('.');
  return '฿' + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + s[1];
}
