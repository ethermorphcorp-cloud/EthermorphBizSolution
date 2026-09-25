/** Expense.gs — บันทึกรายจ่าย (design/Expenses.dc.html): expenses by category with their receipts / tax invoices
 *  attached (Upload.gs). The month list carries KPIs, the category chips (only categories that have rows, with
 *  counts), pay-method and attachment filters, and the page total. */
var ExpenseService = {
  /** a = {month, q, filters: {category, payMethod, attach: 'yes' | 'no'}, page, pageSize} */
  list: function (a) {
    a = a || {};
    var all = readTable('Expenses'), f = a.filters || {}, files = attachmentCounts_();
    var months = filterOptions_(all.map(function (e) { return {m: e.date.slice(0, 7)}; }), 'm', monthLabel_)
      .sort(function (x, y) { return x.value < y.value ? 1 : -1; });
    var month = a.month || (months.some(function (m) { return m.value === today_().slice(0, 7); }) ? today_().slice(0, 7) : (months[0] || {}).value || today_().slice(0, 7));
    var inMonth = all.filter(function (e) { return e.date.slice(0, 7) === month; });
    inMonth.forEach(function (e) { e.files = files[e.docNo] || 0; });
    var catLabel = dropdownLabel_('expcat'), pay = dropdownLabel_('pay');
    var cats = filterOptions_(inMonth, 'category', catLabel).map(function (o) {
      o.amount = Math.round(inMonth.filter(function (e) { return e.category === o.value; }).reduce(function (s, e) { return s + e.amount; }, 0) * 100) / 100;
      return o;
    });
    var top = cats.slice().sort(function (x, y) { return y.amount - x.amount; })[0];
    var q = String(a.q || '').trim().toLowerCase();
    var base = inMonth.filter(function (e) {
      if (q && !(e.docNo.toLowerCase().indexOf(q) >= 0 || String(e.description).toLowerCase().indexOf(q) >= 0 || String(e.vendor).toLowerCase().indexOf(q) >= 0)) return false;
      return (!f.payMethod || e.payMethod === f.payMethod) && (!f.attach || (f.attach === 'yes' ? e.files > 0 : !e.files));
    });
    var rows = base.filter(function (e) { return !f.category || e.category === f.category; })
      .sort(function (x, y) { return x.docNo < y.docNo ? 1 : -1; });
    var out = pageOf_(rows, a.page, a.pageSize);
    out.pageSum = Math.round(out.rows.reduce(function (s, e) { return s + e.amount; }, 0) * 100) / 100;
    out.month = month;
    out.months = months;
    var total = inMonth.reduce(function (s, e) { return s + e.amount; }, 0);
    out.kpi = {amount: Math.round(total * 100) / 100, count: inMonth.length, top: top ? {label: top.label, amount: top.amount} : null,
               noFile: inMonth.filter(function (e) { return !e.files; }).length};
    out.chips = filterOptions_(base, 'category', catLabel);   // counts follow the search and the other filters
    out.chipsAll = base.length;
    out.options = {
      payMethod: filterOptions_(inMonth, 'payMethod', pay),
      attach: [{value: 'yes', label: 'มีเอกสาร', count: inMonth.filter(function (e) { return e.files; }).length},
               {value: 'no', label: 'ยังไม่แนบเอกสาร', count: out.kpi.noFile}].filter(function (o) { return o.count; })
    };
    var names = {};
    readTable('Users').forEach(function (u) { names[u.username] = u.fullName; });
    out.rows.forEach(function (e) { e.createdByName = names[e.createdBy] || e.createdBy; });
    return out;
  },

  get: function (docNo) {
    var e = findById('Expenses', docNo);
    if (!e) throw appError_('NOT_FOUND', 'ไม่พบรายจ่าย ' + docNo + ' อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');
    e.attachments = AttachmentService.list(docNo);
    return e;
  },

  save: function (user, d) {
    d = d || {};
    var docNo = d.docNo || '';
    var clean = validate_('Expense', d);
    return withLock_(function () {
      if (docNo) {
        if (!findById('Expenses', docNo)) throw appError_('NOT_FOUND', 'ไม่พบรายจ่าย ' + docNo + ' อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');
        clean.updatedAt = nowISO_();
        updateRow('Expenses', docNo, clean);
        audit('UPDATE', 'Expenses', docNo, {category: clean.category, amount: clean.amount});
      } else {
        docNo = nextDocNo(DOC_PREFIX.expense);
        clean.docNo = docNo; clean.createdBy = user.username; clean.createdAt = nowISO_();
        insertRow('Expenses', clean);
        audit('CREATE', 'Expenses', docNo, {category: clean.category, amount: clean.amount});
      }
      clean.docNo = docNo;
      return clean;
    });
  },

  delete: function (user, docNo) {
    return withLock_(function () {
      var e = findById('Expenses', docNo);
      if (!e) throw appError_('NOT_FOUND', 'ไม่พบรายจ่าย ' + docNo + ' อาจถูกลบไปแล้ว');
      dropAttachments_(docNo);
      deleteRow('Expenses', docNo);
      audit('DELETE', 'Expenses', docNo, {description: e.description, amount: e.amount});
      return true;
    });
  },

  export: function (user, a) {
    a = a || {};
    var r = ExpenseService.list({month: a.month, q: a.q, filters: a.filters, pageSize: 'all'});
    var cat = dropdownLabel_('expcat'), pay = dropdownLabel_('pay');
    audit('EXPORT', 'Expenses', r.month, {rows: r.total});
    return {month: r.month, headers: ['เลขที่', 'วันที่', 'รายการ', 'ผู้ขาย/ผู้รับเงิน', 'หมวดหมู่', 'วิธีชำระ', 'ยอดเงิน', 'เอกสารแนบ', 'ผู้บันทึก'],
      rows: r.rows.map(function (e) { return [e.docNo, e.date, e.description, e.vendor, cat(e.category), pay(e.payMethod), e.amount, e.files, e.createdByName]; })};
  }
};
