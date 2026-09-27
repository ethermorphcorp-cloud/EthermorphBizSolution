/** Report.gs — รายงาน (design/Reports.dc.html), three reports over a range of months:
 *    pl        รายได้ vs ค่าใช้จ่ายรายเดือน: room / other income, expenses, profit and margin per month + totals
 *    roomType  รายได้รายประเภทห้อง: per room type rooms, nights sold, occupancy, ADR, revenue, share; revenue per month
 *    expense   ค่าใช้จ่ายรายหมวด: category × month (only categories with rows), or one month day by day with its big items
 *  The same rules as the Dashboard and the lists: room revenue and nights belong to the month of check-in and exclude
 *  cancelled bookings; other income and expenses to the month of their date. The range offers only months with data.
 *  report.get returns all three for one range (the tabs switch without asking again); report.pl / roomType / expense
 *  return one each. */
var REPORT_MAX_MONTHS = 24;
var REPORT_BIG_SHARE = 0.05;   // a single expense ≥ 5 % of its month is named on the daily chart

function reportMonthsWithData_(rooms, other, exp) {
  var seen = {};
  rooms.forEach(function (b) { seen[b.checkIn.slice(0, 7)] = 1; });
  other.forEach(function (o) { seen[o.date.slice(0, 7)] = 1; });
  exp.forEach(function (e) { seen[e.date.slice(0, 7)] = 1; });
  return Object.keys(seen).sort();
}
function reportShift_(ym, n) {
  var d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
function reportDays_(ym) { return new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate(); }
function reportMonthFull_(ym) { return TH_MONTH_FULL[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4); }
var TH_MONTH_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
var r2_ = function (n) { return Math.round(n * 100) / 100; };

var ReportService = {
  /** {from, to}: yyyy-MM. Default: the six months up to this month (or the latest month with data). */
  range_: function (a, available) {
    a = a || {};
    var ok = function (m) { return /^\d{4}-\d{2}$/.test(String(m || '')); };
    var thisMonth = today_().slice(0, 7), last = available.length ? available[available.length - 1] : thisMonth;
    var to = ok(a.to) ? a.to : (available.indexOf(thisMonth) >= 0 ? thisMonth : last);
    var from = ok(a.from) ? a.from : reportShift_(to, -5);
    if (!ok(a.from) && available.length && from < available[0]) from = available[0] <= to ? available[0] : to;
    if (from > to) { var t = from; from = to; to = t; }
    var months = [];
    for (var m = from; m <= to && months.length < REPORT_MAX_MONTHS; m = reportShift_(m, 1)) months.push(m);
    to = months[months.length - 1];
    return {from: from, to: to, months: months, firstDay: from + '-01', lastDay: to + '-' + pad_(reportDays_(to), 2),
            label: monthLabel_(from) + (from === to ? '' : ' – ' + monthLabel_(to))};
  },

  /** a = {from, to, month (daily expenses; default the range's last month)} */
  get: function (a) {
    a = a || {};
    var rooms = readTable('RoomIncome'), other = readTable('OtherIncome'), exp = readTable('Expenses');
    var available = reportMonthsWithData_(rooms, other, exp), range = ReportService.range_(a, available);
    var inRange = function (ym) { return ym >= range.from && ym <= range.to; };
    var live = rooms.filter(function (b) { return isLive_(b) && inRange(b.checkIn.slice(0, 7)); });
    var oth = other.filter(function (o) { return inRange(o.date.slice(0, 7)); });
    var ex = exp.filter(function (e) { return inRange(e.date.slice(0, 7)); });
    return {
      range: range,
      available: available.slice().reverse().map(function (m) { return {value: m, label: monthLabel_(m)}; }),
      pl: ReportService.pl_(range, live, oth, ex),
      roomType: ReportService.roomType_(range, live),
      expense: ReportService.expense_(range, ex, a.month)
    };
  },
  pl: function (a) { return ReportService.get(a).pl; },
  roomType: function (a) { return ReportService.get(a).roomType; },
  expense: function (a) { return ReportService.get(a).expense; },

  pl_: function (range, live, oth, ex) {
    var months = range.months.map(function (ym) {
      var room = r2_(live.filter(function (b) { return b.checkIn.slice(0, 7) === ym; }).reduce(function (s, b) { return s + b.total; }, 0));
      var other = r2_(oth.filter(function (o) { return o.date.slice(0, 7) === ym; }).reduce(function (s, o) { return s + o.amount; }, 0));
      var expense = r2_(ex.filter(function (e) { return e.date.slice(0, 7) === ym; }).reduce(function (s, e) { return s + e.amount; }, 0));
      var revenue = r2_(room + other), profit = r2_(revenue - expense);
      return {month: ym, label: monthLabel_(ym), full: reportMonthFull_(ym), room: room, other: other, revenue: revenue, expense: expense,
              profit: profit, margin: revenue ? Math.round(profit / revenue * 1000) / 10 : null};
    });
    var t = function (k) { return r2_(months.reduce(function (s, m) { return s + m[k]; }, 0)); };
    var total = {room: t('room'), other: t('other'), revenue: t('revenue'), expense: t('expense'), profit: t('profit')};
    total.margin = total.revenue ? Math.round(total.profit / total.revenue * 1000) / 10 : null;
    return {months: months, total: total};
  },

  roomType_: function (range, live) {
    var types = readTable('RoomTypes'), rooms = readTable('Rooms');
    var days = range.months.reduce(function (s, m) { return s + reportDays_(m); }, 0);
    var revenue = r2_(live.reduce(function (s, b) { return s + b.total; }, 0));
    var list = types.map(function (t) {
      var mine = live.filter(function (b) { return b.typeCode === t.code; });
      var count = rooms.filter(function (r) { return r.typeCode === t.code; }).length;
      var rev = r2_(mine.reduce(function (s, b) { return s + b.total; }, 0)), nights = mine.reduce(function (s, b) { return s + b.nights; }, 0);
      return {code: t.code, name: t.name, rooms: count, nights: nights, revenue: rev,
              occupancy: count && days ? Math.round(nights / (count * days) * 1000) / 10 : 0,
              adr: nights ? r2_(rev / nights) : 0, share: revenue ? Math.round(rev / revenue * 1000) / 10 : 0};
    });
    var nights = list.reduce(function (s, t) { return s + t.nights; }, 0);
    var months = range.months.map(function (ym) {
      var by = {}, total = 0;
      types.forEach(function (t) {
        by[t.code] = r2_(live.filter(function (b) { return b.typeCode === t.code && b.checkIn.slice(0, 7) === ym; }).reduce(function (s, b) { return s + b.total; }, 0));
        total += by[t.code];
      });
      return {month: ym, label: monthLabel_(ym), byType: by, total: r2_(total)};
    });
    return {types: list, months: months, days: days,
            total: {rooms: rooms.length, nights: nights, revenue: revenue, occupancy: rooms.length && days ? Math.round(nights / (rooms.length * days) * 1000) / 10 : 0,
                    adr: nights ? r2_(revenue / nights) : 0}};
  },

  expense_: function (range, ex, month) {
    var label = dropdownLabel_('expcat');
    var order = readTable('Dropdowns').filter(function (d) { return d.group === 'expcat'; }).sort(function (a, b) { return a.sort - b.sort; })
      .map(function (d) { return d.code; });
    var cats = filterOptions_(ex, 'category', label).map(function (o) { return o.value; })
      .sort(function (a, b) { var x = order.indexOf(a), y = order.indexOf(b); return (x < 0 ? 999 : x) - (y < 0 ? 999 : y); });
    var grand = r2_(ex.reduce(function (s, e) { return s + e.amount; }, 0));
    var rows = cats.map(function (c) {
      var mine = ex.filter(function (e) { return e.category === c; });
      var values = range.months.map(function (ym) { return r2_(mine.filter(function (e) { return e.date.slice(0, 7) === ym; }).reduce(function (s, e) { return s + e.amount; }, 0)); });
      var total = r2_(values.reduce(function (s, v) { return s + v; }, 0));
      return {code: c, label: label(c), values: values, total: total, count: mine.length, share: grand ? Math.round(total / grand * 1000) / 10 : 0};
    }).sort(function (a, b) { return b.total - a.total; });
    var monthTotals = range.months.map(function (ym) { return r2_(ex.filter(function (e) { return e.date.slice(0, 7) === ym; }).reduce(function (s, e) { return s + e.amount; }, 0)); });

    // one month, day by day
    var m = range.months.indexOf(String(month)) >= 0 ? String(month) : range.to;
    var inMonth = ex.filter(function (e) { return e.date.slice(0, 7) === m; }), monthTotal = r2_(inMonth.reduce(function (s, e) { return s + e.amount; }, 0));
    var days = [];
    for (var d = 1; d <= reportDays_(m); d++) {
      var iso = m + '-' + pad_(d, 2), mine = inMonth.filter(function (e) { return e.date === iso; });
      // the day's biggest category is named when it is ≥ 5 % of the month: one line by its description, several by the category
      var per = {};
      mine.forEach(function (e) { var x = per[e.category] || (per[e.category] = {amount: 0, items: []}); x.amount += e.amount; x.items.push(e); });
      var topCat = Object.keys(per).sort(function (a, b) { return per[b].amount - per[a].amount; })[0], top = topCat ? per[topCat] : null;
      days.push({date: iso, value: r2_(mine.reduce(function (s, e) { return s + e.amount; }, 0)), count: mine.length,
                 big: top && monthTotal && top.amount >= monthTotal * REPORT_BIG_SHARE
                   ? {description: top.items.length === 1 ? top.items[0].description : label(topCat) + ' (' + top.items.length + ' รายการ)', amount: r2_(top.amount)} : null});
    }
    var byCat = filterOptions_(inMonth, 'category', label).map(function (o) {
      return {code: o.value, label: o.label, count: o.count, value: r2_(inMonth.filter(function (e) { return e.category === o.value; }).reduce(function (s, e) { return s + e.amount; }, 0))};
    }).sort(function (a, b) { return b.value - a.value; });
    return {rows: rows, monthTotals: monthTotals, grand: grand,
            daily: {month: m, label: monthLabel_(m), days: days, total: monthTotal, categories: byCat}};
  }
};
