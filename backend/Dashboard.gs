/** Dashboard.gs — dashboard.summary(month): KPIs and the four charts of the Dashboard (design/Main.dc.html), plus today
 *  (always today, whatever month is chosen): the stays checking in and out, and the rooms' status right now.
 *  Room revenue belongs to the month of check-in and excludes cancelled bookings; other income and expenses to the
 *  month of their date — the same rules as every other screen, so the numbers agree everywhere. */
var DashboardService = {
  summary: function (month) {
    var rooms = readTable('RoomIncome'), other = readTable('OtherIncome'), exp = readTable('Expenses');
    var live = rooms.filter(isLive_);
    var seen = {};
    rooms.forEach(function (b) { seen[b.checkIn.slice(0, 7)] = 1; });
    other.forEach(function (o) { seen[o.date.slice(0, 7)] = 1; });
    exp.forEach(function (e) { seen[e.date.slice(0, 7)] = 1; });
    var months = Object.keys(seen).sort().reverse();
    var today = today_(), thisMonth = today.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(String(month || ''))) month = seen[thisMonth] || !months.length ? thisMonth : months[0];

    var sum = function (list, f) { return Math.round(list.reduce(function (s, x) { return s + f(x); }, 0) * 100) / 100; };
    var totals = function (ym) {
      var room = sum(live.filter(function (b) { return b.checkIn.slice(0, 7) === ym; }), function (b) { return b.total; });
      var oth = sum(other.filter(function (o) { return o.date.slice(0, 7) === ym; }), function (o) { return o.amount; });
      var ex = sum(exp.filter(function (e) { return e.date.slice(0, 7) === ym; }), function (e) { return e.amount; });
      var revenue = Math.round((room + oth) * 100) / 100, profit = Math.round((revenue - ex) * 100) / 100;
      return {month: ym, label: monthLabel_(ym), room: room, other: oth, revenue: revenue, expense: ex, profit: profit,
              margin: revenue ? Math.round(profit / revenue * 1000) / 10 : null};
    };
    var shift = function (ym, n) { var d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
    var series = [];
    for (var i = 5; i >= 0; i--) series.push(totals(shift(month, -i)));
    var cur = series[5], prev = series[4];

    // occupancy: nights sold in the month so far (the whole month once it is over) over rooms × days
    var roomList = readTable('Rooms'), first = month + '-01';
    var days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    var end = addDays_(first, days), upTo = month === thisMonth ? addDays_(today, 1) : end;
    var nights = 0;
    if (upTo > first) live.forEach(function (b) {
      var a = b.checkIn > first ? b.checkIn : first, z = b.checkOut < upTo ? b.checkOut : upTo;
      if (z > a) nights += nightsBetween_(a, z);
    });
    var elapsed = upTo > first ? nightsBetween_(first, upTo) : 0;
    var tonight = live.filter(function (b) { return b.checkIn <= today && today < b.checkOut; }).length;

    var types = readTable('RoomTypes');
    var inMonth = live.filter(function (b) { return b.checkIn.slice(0, 7) === month; });
    var byType = types.map(function (t) {
      return {code: t.code, label: t.name, value: sum(inMonth.filter(function (b) { return b.typeCode === t.code; }), function (b) { return b.total; })};
    });
    var catOrder = readTable('Dropdowns').filter(function (d) { return d.group === 'othercat'; }).sort(function (a, b) { return a.sort - b.sort; });
    var otherInMonth = other.filter(function (o) { return o.date.slice(0, 7) === month; });
    var byIncome = [{code: 'ROOM', label: 'ห้องพัก', value: cur.room}].concat(catOrder.map(function (d) {
      return {code: d.code, label: d.label, value: sum(otherInMonth.filter(function (o) { return o.category === d.code; }), function (o) { return o.amount; })};
    }));
    var expLabel = dropdownLabel_('expcat');
    var byExpense = filterOptions_(exp.filter(function (e) { return e.date.slice(0, 7) === month; }), 'category', expLabel).map(function (o) {
      return {code: o.value, label: o.label, value: sum(exp.filter(function (e) { return e.date.slice(0, 7) === month && e.category === o.value; }), function (e) { return e.amount; }), count: o.count};
    }).sort(function (a, b) { return b.value - a.value; });

    // today: check-ins then check-outs (amount = room + its รวมในใบเสร็จ lines), and every room's status now
    var extra = extrasByBooking_(), byRoom = {};
    live.forEach(function (b) { (byRoom[b.roomNo] = byRoom[b.roomNo] || []).push(b); });
    var stay = function (b, act) {
      return {docNo: b.docNo, guestName: b.guestName, phone: b.phone, typeCode: b.typeCode, roomNo: b.roomNo, act: act,
              amount: Math.round((b.total + ((extra[b.docNo] || {}).amount || 0)) * 100) / 100, payStatus: b.payStatus};
    };
    var byDoc = function (a, b) { return a.docNo < b.docNo ? -1 : 1; };
    var ins = live.filter(function (b) { return b.checkIn === today; }).sort(byDoc).map(function (b) { return stay(b, 'in'); });
    var outs = live.filter(function (b) { return b.checkOut === today; }).sort(byDoc).map(function (b) { return stay(b, 'out'); });
    var status = {occ: 0, free: 0, clean: 0, off: 0};
    roomList.forEach(function (r) { var s = roomNow_(r, byRoom, today).status; status[s] = (status[s] || 0) + 1; });

    var pct = function (a, b) { return b ? Math.round((a - b) / b * 1000) / 10 : null; };
    return {
      month: month, label: monthLabel_(month), today: today,
      months: months.map(function (m) { return {value: m, label: monthLabel_(m)}; }),
      kpi: {revenue: cur.revenue, room: cur.room, other: cur.other, expense: cur.expense, profit: cur.profit, margin: cur.margin,
            revenueChange: pct(cur.revenue, prev.revenue), expenseChange: pct(cur.expense, prev.expense),
            occupancy: roomList.length && elapsed ? Math.round(nights / (roomList.length * elapsed) * 1000) / 10 : 0,
            nights: nights, rooms: roomList.length, tonight: tonight, prevLabel: prev.label},
      series: series,
      incomeByCategory: byIncome,
      revenueByRoomType: byType,
      expenseByCategory: byExpense,
      todayStays: {date: today, checkIns: ins.length, checkOuts: outs.length, rows: ins.concat(outs)},
      roomStatus: {total: roomList.length, occ: status.occ, free: status.free, clean: status.clean, off: status.off}
    };
  }
};
