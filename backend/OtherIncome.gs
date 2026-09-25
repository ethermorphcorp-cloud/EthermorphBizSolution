/** OtherIncome.gs — รายได้อื่นๆ (design/Income-Other.dc.html): Minibar, ห้องอาหาร, ซักรีด … A line can be tied to a
 *  stay (bookingNo → its room) so it goes on the same receipt, to a room only, or stand alone (a walk-in diner).
 *  amount = qty × unitPrice. payMethod '' means "รวมในใบเสร็จ" (paid with the stay) or not paid yet. */
var OtherIncomeService = {
  /** a = {month, q, filters: {category, payMethod}, page, pageSize} */
  list: function (a) {
    a = a || {};
    var all = readTable('OtherIncome'), f = a.filters || {};
    var months = filterOptions_(all.map(function (o) { return {m: o.date.slice(0, 7)}; }), 'm', monthLabel_)
      .sort(function (x, y) { return x.value < y.value ? 1 : -1; });
    var month = a.month || (months.some(function (m) { return m.value === today_().slice(0, 7); }) ? today_().slice(0, 7) : (months[0] || {}).value || today_().slice(0, 7));
    var inMonth = all.filter(function (o) { return o.date.slice(0, 7) === month; });
    var files = attachmentCounts_();
    inMonth.forEach(function (o) { o.files = files[o.docNo] || 0; });
    var total = inMonth.reduce(function (s, o) { return s + o.amount; }, 0);
    var cats = readTable('Dropdowns').filter(function (d) { return d.group === 'othercat'; }).sort(function (x, y) { return x.sort - y.sort; });
    var byCat = cats.map(function (d) {
      var xs = inMonth.filter(function (o) { return o.category === d.code; });
      var amt = Math.round(xs.reduce(function (s, o) { return s + o.amount; }, 0) * 100) / 100;
      return {code: d.code, label: d.label, amount: amt, count: xs.length, share: total ? Math.round(amt / total * 1000) / 10 : 0};
    });
    var q = String(a.q || '').trim().toLowerCase();
    var rows = inMonth.filter(function (o) {
      if (q && !(o.docNo.toLowerCase().indexOf(q) >= 0 || String(o.description).toLowerCase().indexOf(q) >= 0 ||
          String(o.roomNo).toLowerCase() === q || String(o.bookingNo).toLowerCase().indexOf(q) >= 0)) return false;
      return (!f.category || o.category === f.category) && (f.payMethod === undefined || f.payMethod === '' ? true :
        f.payMethod === '-' ? !o.payMethod : o.payMethod === f.payMethod);
    }).sort(function (x, y) { return x.docNo < y.docNo ? 1 : -1; });
    var out = pageOf_(rows, a.page, a.pageSize);
    out.pageSum = Math.round(out.rows.reduce(function (s, o) { return s + o.amount; }, 0) * 100) / 100;
    out.month = month;
    out.months = months;
    out.total = rows.length;
    out.kpi = {amount: Math.round(total * 100) / 100, count: inMonth.length};
    out.categories = byCat;
    var pay = dropdownLabel_('pay');
    out.options = {payMethod: filterOptions_(inMonth.map(function (o) { return {p: o.payMethod || '-'}; }), 'p', function (v) { return v === '-' ? 'รวมในใบเสร็จ / ยังไม่ชำระ' : pay(v); })};
    out.counts = {rooms: readTable('RoomIncome').filter(function (b) { return b.checkIn.slice(0, 7) === month; }).length, other: inMonth.length};
    return out;
  },

  get: function (docNo) {
    var o = findById('OtherIncome', docNo);
    if (!o) throw appError_('NOT_FOUND', 'ไม่พบรายการ ' + docNo + ' อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');
    if (o.bookingNo) { var b = findById('RoomIncome', o.bookingNo); o.booking = b ? {docNo: b.docNo, guestName: b.guestName, roomNo: b.roomNo, checkIn: b.checkIn, checkOut: b.checkOut} : null; }
    o.attachments = AttachmentService.list(docNo);
    return o;
  },

  /** Stays a line can be tied to: live bookings from 60 days back to 30 days ahead, newest first. */
  bookings: function () {
    var from = addDays_(today_(), -60), to = addDays_(today_(), 30);
    return readTable('RoomIncome').filter(function (b) { return isLive_(b) && b.checkOut >= from && b.checkIn <= to; })
      .sort(function (x, y) { return x.checkIn < y.checkIn ? 1 : -1; })
      .map(function (b) { return [b.docNo, b.roomNo, b.guestName, b.checkIn, b.checkOut]; });
  },

  save: function (user, d) {
    d = d || {};
    var docNo = d.docNo || '';
    var linked = d.bookingNo ? findById('RoomIncome', d.bookingNo) : null;
    if (linked) d.roomNo = linked.roomNo;   // the stay decides the room, before the room is checked
    var clean = validate_('OtherIncome', d);
    if (clean.bookingNo) {
      var b = findById('RoomIncome', clean.bookingNo);
      if (!isLive_(b)) throw fieldError_('bookingNo', 'การจอง ' + b.docNo + ' ถูกยกเลิกแล้ว กรุณาเลือกการจองอื่น');
      clean.roomNo = b.roomNo;   // the stay decides the room
    }
    clean.amount = Math.round(clean.qty * clean.unitPrice * 100) / 100;
    if (!(clean.amount > 0)) throw fieldError_('unitPrice', 'ยอดรวมต้องมากกว่า 0 กรุณาตรวจจำนวนและราคาต่อหน่วย');
    return withLock_(function () {
      if (docNo) {
        if (!findById('OtherIncome', docNo)) throw appError_('NOT_FOUND', 'ไม่พบรายการ ' + docNo + ' อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');
        clean.updatedAt = nowISO_();
        updateRow('OtherIncome', docNo, clean);
        audit('UPDATE', 'OtherIncome', docNo, {category: clean.category, amount: clean.amount});
      } else {
        docNo = nextDocNo(DOC_PREFIX.otherIncome);
        clean.docNo = docNo; clean.createdBy = user.username; clean.createdAt = nowISO_();
        insertRow('OtherIncome', clean);
        audit('CREATE', 'OtherIncome', docNo, {category: clean.category, amount: clean.amount, bookingNo: clean.bookingNo});
      }
      clean.docNo = docNo;
      return clean;
    });
  },

  delete: function (user, docNo) {
    return withLock_(function () {
      var o = findById('OtherIncome', docNo);
      if (!o) throw appError_('NOT_FOUND', 'ไม่พบรายการ ' + docNo + ' อาจถูกลบไปแล้ว');
      if (readTable('ReceiptItems').some(function (i) { return i.refDocNo === docNo; })) {
        throw appError_('IN_USE', 'รายการนี้อยู่ในใบเสร็จแล้ว จึงลบไม่ได้ — ยกเลิกใบเสร็จก่อน');
      }
      dropAttachments_(docNo);
      deleteRow('OtherIncome', docNo);
      audit('DELETE', 'OtherIncome', docNo, {category: o.category, amount: o.amount});
      return true;
    });
  },

  export: function (user, a) {
    a = a || {};
    var r = OtherIncomeService.list({month: a.month, q: a.q, filters: a.filters, pageSize: 'all'});
    var cat = dropdownLabel_('othercat'), pay = dropdownLabel_('pay');
    audit('EXPORT', 'OtherIncome', r.month, {rows: r.total});
    return {month: r.month, headers: ['เลขที่', 'วันที่', 'ประเภท', 'รายการ', 'ห้อง', 'เลขที่การจอง', 'จำนวน', 'ราคาต่อหน่วย', 'ยอดรวม', 'วิธีชำระ', 'ผู้บันทึก'],
      rows: r.rows.map(function (o) { return [o.docNo, o.date, cat(o.category), o.description, o.roomNo, o.bookingNo, o.qty, o.unitPrice, o.amount, o.payMethod ? pay(o.payMethod) : 'รวมในใบเสร็จ', o.createdBy]; })};
  }
};
