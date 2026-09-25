/** Room.gs — ประเภทห้องพัก and the rooms. Master data (MasterCache).
 *  "มีผู้เข้าพัก" is not typed in: a room is occupied when a booking that is not cancelled covers tonight
 *  (checkIn ≤ today < checkOut). Rooms.status holds only what people set by hand: free, clean, off. */
var ROOM_MANUAL_STATUS = ['free', 'clean', 'off'];

/** The room's status as the screens show it, plus tonight's booking. */
function roomNow_(room, liveByRoom, today) {
  var b = (liveByRoom[room.roomNo] || []).filter(function (x) { return x.checkIn <= today && today < x.checkOut; })[0];
  var status = room.status === 'off' ? 'off' : b ? 'occ' : room.status === 'occ' ? 'free' : room.status;
  return {status: status, guest: b ? b.guestName : '', bookingNo: b ? b.docNo : '', checkOut: b ? b.checkOut : ''};
}

var RoomService = {
  /** Room types with room count and this month's occupancy; rooms with their status now and current guest. */
  overview: function () {
    var today = today_(), month = today.slice(0, 7), first = month + '-01';
    var days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    var after = addDays_(first, days);   // first day of next month
    var types = readTable('RoomTypes'), rooms = readTable('Rooms'), live = {}, nights = {};
    readTable('RoomIncome').forEach(function (b) {
      if (b.payStatus === 'cxl') return;
      (live[b.roomNo] = live[b.roomNo] || []).push(b);
      var from = b.checkIn > first ? b.checkIn : first, to = b.checkOut < after ? b.checkOut : after;
      if (to > from) nights[b.typeCode] = (nights[b.typeCode] || 0) + nightsBetween_(from, to);
    });
    var roomsOut = rooms.map(function (r) {
      var now = roomNow_(r, live, today);
      r.statusSet = r.status;
      r.status = now.status; r.guest = now.guest; r.bookingNo = now.bookingNo; r.checkOut = now.checkOut;
      r.bookings = (live[r.roomNo] || []).length;
      return r;
    }).sort(function (a, b) { return String(a.roomNo).localeCompare(String(b.roomNo), 'en', {numeric: true}); });
    var typesOut = types.map(function (t) {
      var mine = roomsOut.filter(function (r) { return r.typeCode === t.code; });
      t.rooms = mine.length;
      t.occupied = mine.filter(function (r) { return r.status === 'occ'; }).length;
      t.occupancy = mine.length ? Math.round((nights[t.code] || 0) / (mine.length * days) * 1000) / 10 : 0;
      return t;
    });
    return {types: typesOut, rooms: roomsOut, month: month, today: today};
  },

  typeSave: function (user, d, isNew) {
    d = d || {};
    if (d.code) d.code = String(d.code).trim().toUpperCase();
    if (d.active === undefined) d.active = true;
    if (!Number(d.weekendPrice)) d.weekendPrice = d.price;
    d.amenities = String(d.amenities || '').split(',').map(function (s) { return s.trim(); }).filter(String).join(',');
    var clean = validate_('RoomType', d);
    return withLock_(function () {
      var cur = findById('RoomTypes', clean.code);
      if (isNew) {
        if (cur) throw fieldError_('code', 'รหัส ' + clean.code + ' มีอยู่แล้ว กรุณาใช้รหัสอื่น');
        insertRow('RoomTypes', clean);
        audit('CREATE', 'RoomTypes', clean.code, clean);
      } else {
        if (!cur) throw appError_('NOT_FOUND', 'ไม่พบประเภทห้อง ' + clean.code + ' กรุณารีเฟรชหน้า');
        updateRow('RoomTypes', clean.code, clean);
        audit('UPDATE', 'RoomTypes', clean.code, clean);
      }
      return clean;
    });
  },

  /** A type with rooms cannot go; one that bookings use is closed for sale instead of deleted. */
  typeDelete: function (user, code) {
    return withLock_(function () {
      var t = findById('RoomTypes', code);
      if (!t) throw appError_('NOT_FOUND', 'ไม่พบประเภทห้อง ' + code + ' กรุณารีเฟรชหน้า');
      var rooms = readTable('Rooms').filter(function (r) { return r.typeCode === code; }).length;
      if (rooms) throw appError_('IN_USE', 'ประเภท ' + t.name + ' ยังมีห้อง ' + rooms + ' ห้อง — ย้ายห้องไปประเภทอื่นหรือลบห้องก่อน');
      var used = readTable('RoomIncome').filter(function (b) { return b.typeCode === code; }).length;
      if (used) {
        updateRow('RoomTypes', code, {active: false});
        audit('DEACTIVATE', 'RoomTypes', code, {used: used});
        return {deactivated: true, used: used};
      }
      deleteRow('RoomTypes', code);
      audit('DELETE', 'RoomTypes', code, {name: t.name});
      return {deleted: true};
    });
  },

  roomSave: function (user, d, isNew) {
    d = d || {};
    if (d.roomNo) d.roomNo = String(d.roomNo).trim();
    var clean = validate_('Room', d);
    if (ROOM_MANUAL_STATUS.indexOf(clean.status) < 0) {
      throw fieldError_('status', 'สถานะ "มีผู้เข้าพัก" มาจากการจองโดยอัตโนมัติ — เลือกได้เฉพาะ ว่าง ทำความสะอาด หรือปิดปรับปรุง');
    }
    return withLock_(function () {
      var cur = findById('Rooms', clean.roomNo);
      if (isNew) {
        if (cur) throw fieldError_('roomNo', 'ห้อง ' + clean.roomNo + ' มีอยู่แล้ว กรุณาใช้เลขห้องอื่น');
        insertRow('Rooms', clean);
        audit('CREATE', 'Rooms', clean.roomNo, clean);
      } else {
        if (!cur) throw appError_('NOT_FOUND', 'ไม่พบห้อง ' + clean.roomNo + ' กรุณารีเฟรชหน้า');
        if (cur.typeCode !== clean.typeCode) {
          var booked = readTable('RoomIncome').some(function (b) { return b.roomNo === clean.roomNo && b.payStatus !== 'cxl' && b.checkOut > today_(); });
          if (booked) throw fieldError_('typeCode', 'ห้องนี้มีการจองที่ยังไม่เช็คเอาท์ — เปลี่ยนประเภทห้องได้หลังการจองเหล่านั้นสิ้นสุด');
        }
        updateRow('Rooms', clean.roomNo, clean);
        audit('UPDATE', 'Rooms', clean.roomNo, clean);
      }
      return clean;
    });
  },

  roomDelete: function (user, roomNo) {
    return withLock_(function () {
      if (!findById('Rooms', roomNo)) throw appError_('NOT_FOUND', 'ไม่พบห้อง ' + roomNo + ' กรุณารีเฟรชหน้า');
      var used = readTable('RoomIncome').filter(function (b) { return b.roomNo === roomNo; }).length;
      if (used) throw appError_('IN_USE', 'ห้อง ' + roomNo + ' มีประวัติการจอง ' + used + ' รายการ จึงลบไม่ได้ — เปลี่ยนสถานะเป็นปิดปรับปรุงแทน');
      deleteRow('Rooms', roomNo);
      audit('DELETE', 'Rooms', roomNo);
      return true;
    });
  },

  /** Front desk: ว่าง / ทำความสะอาด / ปิดปรับปรุง. */
  roomStatus: function (user, roomNo, status, note) {
    if (ROOM_MANUAL_STATUS.indexOf(status) < 0) throw appError_('VALIDATION', 'เลือกสถานะ ว่าง ทำความสะอาด หรือปิดปรับปรุง', 'status');
    return withLock_(function () {
      var cur = findById('Rooms', roomNo);
      if (!cur) throw appError_('NOT_FOUND', 'ไม่พบห้อง ' + roomNo + ' กรุณารีเฟรชหน้า');
      var patch = {status: status};
      if (note !== undefined) patch.note = String(note).slice(0, 300);
      updateRow('Rooms', roomNo, patch);
      audit('STATUS', 'Rooms', roomNo, {from: cur.status, to: status});
      return true;
    });
  }
};
