/** Booking.gs — ตารางจองห้องพักรายวัน (design/Income-Booking.dc.html): rooms × days, one bar per stay, read from
 *  RoomIncome + Rooms (no sheet of its own). A bar that starts before or ends after the range is clipped. */
var BookingService = {
  /** from yyyy-MM-dd, days 7..31, typeCode optional → {from, days, dates, rooms, bars, offs, summary} */
  grid: function (from, days, typeCode) {
    from = parseDate_(from) || today_();
    days = Math.max(7, Math.min(31, Number(days) || 14));
    var to = addDays_(from, days), dates = [];
    for (var i = 0; i < days; i++) dates.push(addDays_(from, i));
    var types = readTable('RoomTypes'), tmap = {};
    types.forEach(function (t) { tmap[t.code] = t; });
    var order = {};
    types.forEach(function (t, i) { order[t.code] = i; });
    var rooms = readTable('Rooms').filter(function (r) { return !typeCode || r.typeCode === typeCode; })
      .sort(function (a, b) { return (order[a.typeCode] - order[b.typeCode]) || String(a.roomNo).localeCompare(String(b.roomNo), 'en', {numeric: true}); })
      .map(function (r) {
        var t = tmap[r.typeCode] || {};
        return {roomNo: r.roomNo, typeCode: r.typeCode, typeName: t.name || r.typeCode, price: t.price || 0, status: r.status, offUntil: r.offUntil, note: r.note};
      });
    var inGrid = {};
    rooms.forEach(function (r) { inGrid[r.roomNo] = 1; });
    var idx = function (d) { return nightsBetween_(from, d); };
    var bars = readTable('RoomIncome').filter(function (b) { return isLive_(b) && inGrid[b.roomNo] && overlaps_(b, from, to); })
      .map(function (b) {
        var s = Math.max(0, idx(b.checkIn)), e = Math.min(days, idx(b.checkOut));
        return {docNo: b.docNo, roomNo: b.roomNo, start: s, span: e - s, clipL: b.checkIn < from, clipR: b.checkOut > to,
                guestName: b.guestName, phone: b.phone, payStatus: b.payStatus, nights: b.nights, checkIn: b.checkIn, checkOut: b.checkOut, total: b.total};
      });
    // closed for repair: from today (or the range start) until offUntil, or to the end of the range
    var today = today_();
    var offs = rooms.filter(function (r) { return roomOffDuring_(r, from, to); }).map(function (r) {
      var s = Math.max(0, idx(today > from ? today : from));
      var e = r.offUntil ? Math.min(days, idx(addDays_(r.offUntil, 1))) : days;
      return {roomNo: r.roomNo, start: s, span: Math.max(1, e - s), note: r.note, offUntil: r.offUntil};
    });
    var summary = dates.map(function (d, i) {
      var busy = {};
      bars.forEach(function (b) { if (b.start <= i && i < b.start + b.span) busy[b.roomNo] = 1; });
      offs.forEach(function (o) { if (o.start <= i && i < o.start + o.span) busy[o.roomNo] = 1; });
      var n = Object.keys(busy).length;
      return {date: d, free: rooms.length - n, occupancy: rooms.length ? Math.round(n / rooms.length * 100) : 0};
    });
    var typeOptions = filterOptions_(readTable('Rooms'), 'typeCode', function (c) { return (tmap[c] || {}).name || c; });
    return {from: from, days: days, dates: dates, today: today, rooms: rooms, bars: bars, offs: offs, summary: summary, typeOptions: typeOptions};
  }
};

/** The browser prints or exports a page itself; it reports that here so the audit log has it. */
function clientAudit_(user, a) {
  if (['PRINT', 'EXPORT', 'TEST'].indexOf(a.action) < 0) throw appError_('VALIDATION', 'ไม่รองรับการบันทึกประเภทนี้');
  audit(a.action, String(a.entity || '').slice(0, 40), String(a.docNo || '').slice(0, 40), String(a.detail || '').slice(0, 300));
  return true;
}
