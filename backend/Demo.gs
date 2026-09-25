/** Demo.gs — the demo hotel "โรงแรมสายธาร", the same data as the design files (design/*.dc.html, renderVals()).
 *  setup() writes it into the DEMO-HOTEL spreadsheet for real (SANDBOX = null); visitors then only ever change
 *  their own session sandbox (Database.gs).
 *  This file holds the masters and every row the designs show by number; DemoSeed.gs generates the rest of
 *  April – September 2026 around them so the totals match the screens.
 */
var DemoData = {
  company: {
    companyName: 'บริษัท สายธาร ฮอสพิทาลิตี้ จำกัด', hotelName: 'โรงแรมสายธาร', taxId: '0505566012345',
    branch: 'สำนักงานใหญ่', address: '88/8 หมู่ 3 ถนนเชียงใหม่-ลำพูน ตำบลหนองผึ้ง อำเภอสารภี จังหวัดเชียงใหม่ 50140',
    phone: '053-123-456', email: 'contact@saitarn-hotel.com', website: 'saitarn-hotel.com', vatRate: 7,
    vatMode: 'included', receiptPattern: 'RC-{YYYYMM}-{####}', checkInTime: '14:00', checkOutTime: '12:00', currency: 'THB'
  },
  // code, name, price, weekendPrice, maxGuests, bedType, amenities (RoomTypes.dc.html)
  roomTypes: [
    ['SUP', 'Superior', 1200, 1400, 2, 'Queen', 'Wi-Fi,แอร์,ทีวี'],
    ['DLX', 'Deluxe', 1800, 2100, 3, 'King / Twin', 'Wi-Fi,ระเบียง,Minibar'],
    ['FAM', 'Family', 2600, 2900, 4, '2 Queen', 'Wi-Fi,Minibar,โซฟาเบด'],
    ['STE', 'Suite', 3900, 4500, 4, 'King', 'วิวแม่น้ำ,อ่างอาบน้ำ,Minibar']
  ],
  // roomNo, typeCode, floor, status, note
  rooms: [
    ['101', 'SUP', 1, 'occ', ''], ['102', 'SUP', 1, 'clean', 'เช็คเอาท์ 11:20 รอแม่บ้าน'], ['103', 'SUP', 1, 'free', ''],
    ['104', 'SUP', 1, 'off', 'ซ่อมเครื่องปรับอากาศ ถึง 27/09/2026'],
    ['201', 'DLX', 2, 'occ', 'ขอหมอนเพิ่ม 1 ใบ'], ['202', 'DLX', 2, 'free', ''], ['203', 'DLX', 2, 'free', ''],
    ['204', 'DLX', 2, 'occ', 'ลูกค้า VIP'],
    ['301', 'FAM', 3, 'free', ''], ['302', 'FAM', 3, 'free', ''],
    ['401', 'STE', 4, 'free', ''], ['402', 'STE', 4, 'free', '']
  ],
  // username, fullName, email, phone, role, status, lastLoginAt (Settings.dc.html) — password DEFAULT_PASSWORD
  users: [
    ['maneerat', 'มณีรัตน์ วงศ์ดี', 'maneerat@saitarn-hotel.com', '089-001-2233', 'Owner', 'active', '2026-09-24T09:12:00'],
    ['somchai', 'สมชาย ใจดี', 'somchai@saitarn-hotel.com', '081-234-5678', 'Admin', 'active', '2026-09-24T13:58:00'],
    ['piyanuch', 'ปิยะนุช ทองคำ', 'piyanuch@saitarn-hotel.com', '062-445-7788', 'Accounting', 'active', '2026-09-23T17:40:00'],
    ['frontdesk1', 'ธนพล สุขใจ', 'thanapol@saitarn-hotel.com', '095-334-1200', 'FrontDesk', 'active', '2026-09-24T14:02:00'],
    ['frontdesk2', 'กานดา มีสุข', 'kanda@saitarn-hotel.com', '098-765-0012', 'FrontDesk', 'suspended', '2026-08-02T20:15:00']
  ],

  /* ---------- rows the designs show (Customers, Income-Rooms, Income-Booking, Main, Income-Other, Expenses) ---------- */

  // customerId, name, email, phone, type, nationality — CU-0214 is the latest of 214 customers
  customers: [
    ['CU-0214', 'คุณวรรณา ศรีสุข', 'wanna.s@gmail.com', '089-765-4321', 'VIP', 'ไทย'],
    ['CU-0213', 'Mr. James Carter', 'j.carter@outlook.com', '061-220-4478', 'OTA', 'อังกฤษ'],
    ['CU-0212', 'บริษัท ไทยทัวร์ จำกัด', 'booking@thaitour.co.th', '02-345-6789', 'CORP', 'ไทย'],
    ['CU-0211', 'คุณธีระ วงศ์ใหญ่', '', '081-990-1234', 'GEN', 'ไทย'],
    ['CU-0210', 'Mr. Park Jisoo', 'park.jisoo@naver.com', '090-887-6655', 'GEN', 'เกาหลีใต้'],
    ['CU-0209', 'คุณสุดา ใจงาม', '', '087-432-1098', 'GEN', 'ไทย'],
    ['CU-0208', 'คุณประเสริฐ มั่นคง', 'prasert.m@hotmail.com', '081-234-5678', 'GEN', 'ไทย'],
    ['CU-0207', 'Ms. Anna Berg', 'anna.berg@gmail.com', '097-331-2045', 'OTA', 'สวีเดน'],
    ['CU-0206', 'คุณสมศักดิ์ ทองดี', '', '089-222-3344', 'GEN', 'ไทย'],
    ['CU-0205', 'คุณอรทัย แก้วใส', '', '086-111-0923', 'GEN', 'ไทย'],
    ['CU-0204', 'คุณมาลี ศรีทอง', '', '062-118-9900', 'GEN', 'ไทย'],
    ['CU-0203', 'คุณปวีณา สายสุข', 'paweena.s@gmail.com', '083-456-1200', 'GEN', 'ไทย'],
    ['CU-0202', 'บริษัท สยามเทรดดิ้ง จำกัด', 'admin@siamtrading.co.th', '02-555-0199', 'CORP', 'ไทย'],
    ['CU-0201', 'Ms. Lena Hoffmann', 'lena.h@web.de', '095-876-1032', 'OTA', 'เยอรมนี'],
    ['CU-0200', 'คุณนภา รุ่งเรือง', '', '084-567-2201', 'GEN', 'ไทย'],
    ['CU-0199', 'ครอบครัวเจริญสุข', '', '085-640-7788', 'GEN', 'ไทย'],
    ['CU-0198', 'คุณสุนีย์ มีชัย', '', '087-765-3321', 'GEN', 'ไทย'],
    ['CU-0197', 'คุณกิตติ พรหมมา', 'kitti.p@gmail.com', '080-009-1122', 'VIP', 'ไทย'],
    ['CU-0190', 'Mr. Kenji Tanaka', 'k.tanaka@yahoo.co.jp', '093-551-2040', 'GEN', 'ญี่ปุ่น']
  ],
  customerTypeCounts: {GEN: 168, VIP: 21, CORP: 14, OTA: 11},   // Settings ▸ Dropdown ▸ ประเภทลูกค้า

  // docNo, customerId, typeCode, roomNo, checkIn, nights, channel, payStatus, guests, payMethod — list price per night
  bookings: [
    ['BK-202609-0053', 'CU-0198', 'FAM', '302', '2026-09-20', 3, 'PHONE', 'paid', 3, 'CASH'],
    ['BK-202609-0054', 'CU-0200', 'DLX', '202', '2026-09-21', 3, 'LINE', 'paid', 2, 'TRANSFER'],
    ['BK-202609-0057', 'CU-0205', 'DLX', '203', '2026-09-21', 3, 'AGD', 'paid', 2, 'CARD'],
    ['BK-202609-0058', 'CU-0201', 'SUP', '102', '2026-09-21', 3, 'BKG', 'due', 1, ''],
    ['BK-202609-0059', 'CU-0208', 'SUP', '101', '2026-09-22', 3, 'WALKIN', 'paid', 2, 'CASH'],
    ['BK-202609-0060', 'CU-0209', 'SUP', '103', '2026-09-23', 1, 'AGD', 'cxl', 2, ''],
    ['BK-202609-0061', 'CU-0214', 'DLX', '204', '2026-09-24', 2, 'WALKIN', 'paid', 2, 'CASH'],
    ['BK-202609-0062', 'CU-0213', 'STE', '401', '2026-09-24', 2, 'BKG', 'dep', 2, 'CARD'],
    ['BK-202609-0063', 'CU-0212', 'FAM', '301', '2026-09-24', 2, 'PHONE', 'due', 4, ''],
    ['BK-202609-0064', 'CU-0197', 'DLX', '201', '2026-09-24', 3, 'LINE', 'dep', 2, 'QR'],
    ['BK-202609-0065', 'CU-0211', 'DLX', '202', '2026-09-25', 1, 'PHONE', 'dep', 2, 'TRANSFER'],
    ['BK-202609-0066', 'CU-0190', 'SUP', '102', '2026-09-26', 2, 'BKG', 'dep', 1, 'CARD'],
    ['BK-202609-0067', 'CU-0210', 'STE', '402', '2026-09-25', 4, 'AGD', 'dep', 2, 'CARD'],
    ['BK-202609-0068', 'CU-0206', 'SUP', '101', '2026-09-27', 2, 'LINE', 'dep', 2, 'QR'],
    ['BK-202609-0069', 'CU-0207', 'DLX', '203', '2026-09-28', 3, 'BKG', 'dep', 2, 'CARD'],
    ['BK-202609-0070', 'CU-0203', 'DLX', '202', '2026-09-29', 4, 'PHONE', 'dep', 2, 'TRANSFER'],
    ['BK-202609-0071', 'CU-0204', 'SUP', '103', '2026-09-30', 2, 'LINE', 'dep', 2, 'QR'],
    ['BK-202610-0002', 'CU-0202', 'DLX', '204', '2026-10-01', 3, 'PHONE', 'dep', 2, 'TRANSFER'],
    ['BK-202610-0004', 'CU-0199', 'FAM', '301', '2026-10-02', 4, 'PHONE', 'dep', 4, 'TRANSFER']
  ],
  roomOff: {roomNo: '104', from: '2026-09-21', to: '2026-09-27'},   // Income-Booking: ปิดปรับปรุง

  // docNo, date, category, description, roomNo, bookingNo, qty, unitPrice, payMethod ('' = รวมในใบเสร็จ / ค้างชำระ)
  otherIncome: [
    ['OI-202609-0110', '2026-09-21', 'OTHER', 'เช่าจักรยาน 1 วัน', '202', 'BK-202609-0054', 1, 150, 'CASH'],
    ['OI-202609-0111', '2026-09-22', 'FOOD', 'ชุดอาหารเย็น (ลูกค้าภายนอก)', '', '', 1, 890, 'CASH'],
    ['OI-202609-0112', '2026-09-22', 'MINIBAR', 'เบียร์ 2, น้ำดื่ม 2', '302', 'BK-202609-0053', 4, 65, 'QR'],
    ['OI-202609-0113', '2026-09-23', 'LATE', 'เช็คเอาท์ 16:00', '102', 'BK-202609-0058', 1, 300, ''],
    ['OI-202609-0114', '2026-09-24', 'SHUTTLE', 'รับจากสนามบินเชียงใหม่', '401', 'BK-202609-0062', 1, 600, 'CARD'],
    ['OI-202609-0115', '2026-09-24', 'FOOD', 'อาหารเช้าเพิ่ม 2 ท่าน', '204', 'BK-202609-0061', 2, 225, 'TRANSFER'],
    ['OI-202609-0116', '2026-09-24', 'LAUNDRY', 'ซักรีดเสื้อผ้า 1 ถุง', '101', 'BK-202609-0059', 1, 120, 'CASH'],
    ['OI-202609-0117', '2026-09-24', 'MINIBAR', 'น้ำอัดลม 2, ขนม 1', '203', 'BK-202609-0057', 3, 60, '']
  ],

  // docNo, date, category, description, vendor, payMethod, amount, createdBy
  expenses: [
    ['EX-202609-0051', '2026-09-18', 'FNB', 'น้ำดื่มสำหรับห้องพัก 40 แพ็ก', 'ร้านน้ำดื่มสายธาร', 'CASH', 1600, 'frontdesk1'],
    ['EX-202609-0052', '2026-09-19', 'MKT', 'โฆษณา Facebook Ads', 'Meta Platforms', 'CARD', 1500, 'maneerat'],
    ['EX-202609-0053', '2026-09-20', 'FNB', 'เนื้อสัตว์และอาหารแห้ง', 'แม็คโคร สาขาเชียงใหม่', 'CARD', 3120, 'frontdesk1'],
    ['EX-202609-0054', '2026-09-21', 'UTIL', 'ค่าไฟฟ้า ส.ค. 2026', 'การไฟฟ้าส่วนภูมิภาค', 'TRANSFER', 26380, 'piyanuch'],
    ['EX-202609-0055', '2026-09-22', 'AMEN', 'สบู่ แชมพู แปรงสีฟัน (Amenities)', 'บริษัท โฮเทลซัพพลาย จำกัด', 'TRANSFER', 4650, 'piyanuch'],
    ['EX-202609-0056', '2026-09-23', 'MAINT', 'ซ่อมเครื่องปรับอากาศ ห้อง 104', 'หจก. เชียงใหม่แอร์เซอร์วิส', 'TRANSFER', 2800, 'somchai'],
    ['EX-202609-0057', '2026-09-23', 'OTA', 'คอมมิชชั่น Booking.com (ส.ค.)', 'Booking.com B.V.', 'TRANSFER', 11240, 'piyanuch'],
    ['EX-202609-0058', '2026-09-24', 'FNB', 'ผักและผลไม้สด', 'ตลาดเมืองใหม่', 'CASH', 1840, 'frontdesk1']
  ],

  /* ---------- totals the screens show (Main, Reports, Income-Rooms, Income-Other, Expenses) ---------- */

  today: '2026-09-24',   // the designs' "today"
  // month, revenue, expenses, bookings in the month dropdown (Income-Rooms)
  months: [['2026-04', 352000, 148200, 57], ['2026-05', 318400, 151300, 52], ['2026-06', 296200, 139600, 48],
           ['2026-07', 402100, 160400, 66], ['2026-08', 432600, 167600, 71], ['2026-09', 486250, 172840, 71]],
  sepRoomByType: {DLX: 153000, SUP: 108720, STE: 84550, FAM: 56380},   // Main: รายได้ตามประเภทห้อง = ฿402,650
  sepNightsByType: {SUP: 91, DLX: 85, FAM: 25, STE: 25},               // Income-Rooms: 226 คืน · ADR ฿1,781.64
  sepLastGeneratedNight: '2026-09-20',   // Income-Booking shows 21/09 – 04/10 exactly as designed: generated stays end before it
  typeShare: {SUP: 0.27, DLX: 0.38, FAM: 0.14, STE: 0.21},             // Reports ▸ รายได้รายประเภทห้อง (เม.ย.–ส.ค.)
  typeWiggle: [[0.01, -0.01, 0.01, -0.01], [-0.02, 0.01, 0, 0.01], [0.01, 0, -0.02, 0.01], [0, 0.02, -0.01, -0.01], [-0.01, 0.01, 0.01, -0.01]],
  // other income per category in September: [count, amount] — Income-Other (117 รายการ ฿83,600)
  sepOther: {MINIBAR: [42, 18960], FOOD: [36, 41850], LAUNDRY: [18, 4320], SHUTTLE: [9, 10800], LATE: [7, 4200], OTHER: [5, 3470]},
  // expenses per category in September: [count, amount] — Expenses (58 รายการ ฿172,840)
  sepExpense: {SALARY: [6, 78000], UTIL: [3, 32450], FNB: [22, 24880], OTA: [8, 18610], AMEN: [9, 10900], MAINT: [5, 4700],
               MKT: [2, 2300], TAX: [3, 1000]}
};

/** Company, room types, rooms and users of the demo hotel. Called by setupShop when RoomTypes is empty. */
function seedDemoMasters_() {
  writeKV('Company', DemoData.company);
  insertRows('RoomTypes', DemoData.roomTypes.map(function (t) {
    return {code: t[0], name: t[1], price: t[2], weekendPrice: t[3], maxGuests: t[4], bedType: t[5], amenities: t[6], active: true};
  }));
  insertRows('Rooms', DemoData.rooms.map(function (r) {
    return {roomNo: r[0], typeCode: r[1], floor: r[2], status: r[3], note: r[4],
            offUntil: r[0] === DemoData.roomOff.roomNo ? DemoData.roomOff.to : ''};
  }));
  var have = {};
  readTable('Users').forEach(function (u) { have[u.username] = 1; });
  var next = Number(nextId_('Users', 'USR-', 3).slice(4)), now = nowISO_();
  var users = DemoData.users.filter(function (u) { return !have[u[0]]; }).map(function (u) {
    var salt = newSalt_();
    return {userId: 'USR-' + pad_(next++, 3), username: u[0], fullName: u[1], email: u[2], phone: u[3], role: u[4], status: u[5],
            passwordHash: hashPassword_(DEFAULT_PASSWORD, salt), salt: salt, lastLoginAt: u[6], createdAt: now, updatedAt: ''};
  });
  insertRows('Users', users);
  return 'demo masters: ' + DemoData.roomTypes.length + ' room types, ' + DemoData.rooms.length + ' rooms, ' + users.length + ' users';
}
