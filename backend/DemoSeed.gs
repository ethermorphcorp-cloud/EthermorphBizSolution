/** DemoSeed.gs — the demo hotel's customers and April – September 2026 transactions.
 *  Every row the designs show by number comes from DemoData (Demo.gs); the rest is generated around them so the
 *  screens' totals come out exactly:
 *    September: room revenue ฿402,650 per room type as on the Dashboard, 226 nights (ADR ฿1,781.64), BK-202609-0001
 *    … 0071; other income ฿83,600 in 117 items per category; expenses ฿172,840 in 58 items per category.
 *    April – August: revenue and expenses per month as on the Dashboard / Reports charts (room = 83 %), bookings
 *    per month as in the Income-Rooms month dropdown. 214 customers (GEN 168 · VIP 21 · CORP 14 · OTA 11).
 *  Room revenue belongs to the month of check-in and excludes cancelled bookings (payStatus cxl). Stays never
 *  overlap in a room. Deterministic: a fixed seed gives the same hotel on every run.
 *
 *  seedDemoHotel()  run from the editor: fills an empty DEMO-HOTEL (setup() does the same when RoomIncome is empty).
 *                   To seed again: Script Property ALLOW_RESET = DEMO-HOTEL, resetAllData(), then setup().
 */
var DEMO_SEED = 20260924;
var TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function seedDemoHotel() {
  useShop_(DEMO_SHOP_ID, true);
  try {
    if (!readTable('RoomTypes').length) seedDemoMasters_();
    var out = seedDemoData_();
    console.log(out);
    return out;
  } finally { SHOP = null; resetRequest_(); }
}

function seedDemoData_() {
  if (readTable('RoomIncome').length || readTable('OtherIncome').length || readTable('Expenses').length) {
    return 'demo data: already there — ALLOW_RESET + resetAllData() first to seed again';
  }
  ensureDropdownCodes_();
  var rnd = demoRng_(DEMO_SEED);
  var customers = demoCustomers_(rnd);
  var bookings = demoBookings_(rnd, customers);
  var other = demoOtherIncome_(rnd, bookings);
  var expenses = demoExpenses_(rnd);
  demoCustomerDates_(rnd, customers, bookings);

  withLock_(function () {
    insertRows('Customers', customers);
    insertRows('RoomIncome', bookings);
    insertRows('OtherIncome', other);
    insertRows('Expenses', expenses);
    demoSequences_([].concat(bookings, other, expenses));
    audit('SEED', 'System', '', {customers: customers.length, roomIncome: bookings.length, otherIncome: other.length, expenses: expenses.length});
  });
  return 'demo data: ' + customers.length + ' customers, ' + bookings.length + ' bookings, ' + other.length +
    ' other income, ' + expenses.length + ' expenses';
}

/** Dropdown options added to DEFAULT_DROPDOWNS after the demo hotel was set up (e.g. othercat OTHER). */
function ensureDropdownCodes_() {
  var have = {}, rows = [];
  readTable('Dropdowns').forEach(function (d) { have[d.key] = 1; });
  Object.keys(DEFAULT_DROPDOWNS).forEach(function (g) {
    DEFAULT_DROPDOWNS[g].forEach(function (o, i) {
      if (!have[g + '.' + o[0]]) rows.push({key: g + '.' + o[0], group: g, code: o[0], label: o[1], sort: (i + 1) * 10, active: true});
    });
  });
  if (rows.length) insertRows('Dropdowns', rows);
}

/* ---------- customers ---------- */

var DEMO_NAMES = {
  thaiFirst: ['สมชาย', 'สมหญิง', 'วิชัย', 'สุรีย์', 'ประภา', 'อนุชา', 'จิราพร', 'ธนากร', 'พิมพ์ชนก', 'ณัฐพล', 'ศิริพร', 'กมล',
              'วีระ', 'อัญชลี', 'ชัยวัฒน์', 'รัตนา', 'ปิยะ', 'สุภาพร', 'เอกชัย', 'นันทนา', 'ธีรพงษ์', 'มยุรี', 'ภานุ',
              'จันทร์เพ็ญ', 'สุทธิพงษ์', 'วาสนา', 'ไพโรจน์', 'อรุณี', 'ศักดิ์ชัย', 'ดวงใจ'],
  thaiLast: ['ใจดี', 'สุขสันต์', 'ทองคำ', 'แก้วมณี', 'บุญมา', 'จันทร์หอม', 'วงศ์สวัสดิ์', 'เรืองศรี', 'สายทอง', 'ปัญญาดี',
             'คำแสน', 'อินทร์แก้ว', 'ธนาวุฒิ', 'ชัยมงคล', 'ศรีวิไล', 'กิตติกุล', 'นาคสวัสดิ์', 'บุญเรือง', 'พรมมินทร์', 'ดวงแก้ว'],
  // [first names, family names, nationality] — names are only combined within one nationality
  foreign: [
    [['Mr. David', 'Ms. Sarah', 'Mr. Oliver', 'Ms. Emma'], ['Smith', 'Brown', 'Taylor', 'Wilson'], 'อังกฤษ'],
    [['Mr. Michael', 'Ms. Jessica', 'Mr. Ryan'], ['Johnson', 'Miller', 'Davis'], 'อเมริกา'],
    [['Mr. Lukas', 'Ms. Sophie', 'Mr. Felix'], ['Schmidt', 'Weber', 'Wagner'], 'เยอรมนี'],
    [['Mr. Thomas', 'Ms. Camille', 'Mr. Hugo'], ['Martin', 'Dubois', 'Bernard'], 'ฝรั่งเศส'],
    [['Mr. Hiroshi', 'Ms. Yuki', 'Mr. Takeshi', 'Ms. Aiko'], ['Sato', 'Suzuki', 'Nakamura', 'Yamamoto'], 'ญี่ปุ่น'],
    [['Mr. Minho', 'Ms. Jiyeon', 'Mr. Seojun'], ['Lee', 'Choi', 'Jung'], 'เกาหลีใต้'],
    [['Mr. Wei', 'Ms. Mei', 'Mr. Hao'], ['Wang', 'Zhang', 'Liu'], 'จีน'],
    [['Mr. Jack', 'Ms. Chloe'], ['Thompson', 'Walker'], 'ออสเตรเลีย']
  ],
  corp: ['บริษัท เชียงใหม่ทราเวล จำกัด', 'บริษัท ล้านนาอินเตอร์ จำกัด', 'บริษัท นอร์ทเทิร์นฟู้ด จำกัด', 'บริษัท ไทยเทคโซลูชั่น จำกัด',
         'บริษัท สยามคอนสตรัคชั่น จำกัด', 'หจก. ดอยสุเทพการค้า', 'บริษัท บางกอกเมดิคอล จำกัด', 'บริษัท เอเชียอีเวนท์ จำกัด',
         'บริษัท กรีนเอเนอร์ยี่ จำกัด', 'บริษัท ลำพูนอุตสาหกรรม จำกัด', 'บริษัท ภูเขาทอง ทัวร์ จำกัด', 'บริษัท ไทยแลนด์ออดิท จำกัด']
};

function demoCustomers_(rnd) {
  var D = DemoData, used = {}, phones = {}, out = [], fixedIds = {}, left = {};
  for (var t in D.customerTypeCounts) left[t] = D.customerTypeCounts[t];
  D.customers.forEach(function (c) {
    used[c[1]] = 1; phones[c[3]] = 1; fixedIds[c[0]] = 1; left[c[4]]--;
    out.push(demoCustomer_(c[0], c[1], c[4], c[5], c[3], c[2], rnd));
  });
  var types = [];
  for (var k in left) for (var i = 0; i < left[k]; i++) types.push(k);
  demoShuffle_(types, rnd);
  var corp = DEMO_NAMES.corp.slice(), n = 0;
  for (var no = 1; types.length; no++) {
    var id = 'CU-' + pad_(no, 4);
    if (fixedIds[id]) continue;
    var type = types.pop(), name, nat = 'ไทย', email = '';
    if (type === 'CORP') {
      name = corp.length ? corp.shift() : 'บริษัท ลูกค้าองค์กร ' + (++n) + ' จำกัด';
    } else if (type === 'OTA' || rnd() < 0.22) {
      do {
        var f = demoPick_(rnd, DEMO_NAMES.foreign);
        name = demoPick_(rnd, f[0]) + ' ' + demoPick_(rnd, f[1]);
        nat = f[2];
      } while (used[name]);
      email = name.replace(/^M[rs]+\. /, '').toLowerCase().replace(/[^a-z]+/g, '.') + '@gmail.com';
    } else {
      do { name = 'คุณ' + demoPick_(rnd, DEMO_NAMES.thaiFirst) + ' ' + demoPick_(rnd, DEMO_NAMES.thaiLast); } while (used[name]);
      if (rnd() < 0.45) email = 'guest' + id.slice(3) + '@gmail.com';
    }
    used[name] = 1;
    var phone;
    do {
      phone = type === 'CORP' ? '053-' + demoDigits_(rnd, 3) + '-' + demoDigits_(rnd, 3)
                              : '0' + demoPick_(rnd, ['8', '9', '6']) + demoDigits_(rnd, 1) + '-' + demoDigits_(rnd, 3) + '-' + demoDigits_(rnd, 4);
    } while (phones[phone]);
    phones[phone] = 1;
    out.push(demoCustomer_(id, name, type, nat, phone, email, rnd));
  }
  return out.sort(function (a, b) { return a.customerId < b.customerId ? -1 : 1; });
}
function demoCustomer_(id, name, type, nat, phone, email, rnd) {
  var corp = type === 'CORP';
  return {
    customerId: id, name: name, type: type, nationality: nat, phone: phone, email: email,
    taxId: corp ? '0' + demoDigits_(rnd, 12) : '',
    address: corp ? demoPick_(rnd, ['อำเภอเมืองเชียงใหม่ จังหวัดเชียงใหม่ 50200', 'เขตบางรัก กรุงเทพมหานคร 10500',
                                    'อำเภอเมืองลำพูน จังหวัดลำพูน 51000', 'อำเภอสันทราย จังหวัดเชียงใหม่ 50210']) : '',
    note: type === 'VIP' ? 'ลูกค้าประจำ' : '', createdAt: '', updatedAt: ''
  };
}
/** createdAt = the day before the customer's first booking was made, else a date in 2025 – March 2026. */
function demoCustomerDates_(rnd, customers, bookings) {
  var first = {};
  bookings.forEach(function (b) { if (!first[b.customerId] || b.createdAt < first[b.customerId]) first[b.customerId] = b.createdAt; });
  customers.forEach(function (c) {
    c.createdAt = first[c.customerId]
      ? demoAddDays_(first[c.customerId].slice(0, 10), -1) + 'T' + demoTime_(rnd)
      : demoAddDays_('2025-01-05', Math.floor(rnd() * 430)) + 'T' + demoTime_(rnd);
  });
}

/* ---------- room income ---------- */

function demoBookings_(rnd, customers) {
  var D = DemoData, price = {}, maxGuests = {}, roomsOf = {}, occ = {}, out = [], custById = {};
  D.roomTypes.forEach(function (t) { price[t[0]] = t[2]; maxGuests[t[0]] = t[4]; });
  D.rooms.forEach(function (r) { (roomsOf[r[1]] = roomsOf[r[1]] || []).push(r[0]); occ[r[0]] = {}; });
  customers.forEach(function (c) { custById[c.customerId] = c; });
  var block = function (room, from, nights) { for (var i = 0; i < nights; i++) occ[room][demoAddDays_(from, i)] = 1; };

  // the designs' bookings first; their nights are taken before anything is generated
  var fixed = D.bookings.map(function (b) {
    if (b[7] !== 'cxl') block(b[3], b[4], b[5]);
    var c = custById[b[1]];
    return demoBooking_({docNo: b[0], customer: c, typeCode: b[2], roomNo: b[3], checkIn: b[4], nights: b[5], rate: price[b[2]],
      discount: 0, channel: b[6], payStatus: b[7], guests: b[8], payMethod: b[9], lead: b[6] === 'WALKIN' ? 0 : 3}, rnd);
  });
  block(D.roomOff.roomNo, D.roomOff.from, demoDaysBetween_(D.roomOff.from, D.roomOff.to) + 1);
  out = out.concat(fixed);

  // customers drawn with weights: regulars (VIP, companies) come back more often
  var pool = [];
  customers.forEach(function (c) { var w = {VIP: 4, CORP: 3}[c.type] || 1; for (var i = 0; i < w; i++) pool.push(c); });
  var codes = ['SUP', 'DLX', 'FAM', 'STE'];

  D.months.forEach(function (m, mi) {
    var ym = m[0], dim = demoDim_(ym), sep = mi === D.months.length - 1;
    var lastNight = sep ? D.sepLastGeneratedNight : ym + '-' + pad_(dim, 2);
    var roomRev = sep ? codes.reduce(function (s, t) { return s + D.sepRoomByType[t]; }, 0) : Math.round(m[1] * 0.83 / 10) * 10;
    var target = {};
    if (sep) codes.forEach(function (t) { target[t] = D.sepRoomByType[t]; });
    else {
      var sum = 0;
      codes.forEach(function (t, j) { target[t] = Math.round(roomRev * (D.typeShare[t] + D.typeWiggle[mi][j]) / 10) * 10; sum += target[t]; });
      target.DLX += roomRev - sum;
    }
    var mine = fixed.filter(function (b) { return b.checkIn.slice(0, 7) === ym && b.payStatus !== 'cxl'; });
    var numbered = fixed.filter(function (b) { return b.docNo.slice(3, 9) === ym.replace('-', ''); });
    var countTarget = m[3] - numbered.length;
    var need = {}, totalNights = 0;
    codes.forEach(function (t) {
      var rev = target[t], nights = sep ? D.sepNightsByType[t] : 0;
      mine.forEach(function (b) { if (b.typeCode === t) { rev -= b.total; nights -= b.nights; } });
      if (!sep) nights = Math.ceil(rev / price[t]);
      if (nights * price[t] < rev) throw new Error('demo seed: ' + ym + ' ' + t + ' needs more nights');
      need[t] = {rev: rev, nights: nights};
      totalNights += nights;
    });

    // stays are cut from a dense schedule of free nights, then picked at random until the nights are reached;
    // longer stays are tried until the count fits the month's booking count
    var chosen;
    for (var k = 0; k < 40; k++) {
      var avg = totalNights / Math.max(1, countTarget - 2) * (1 + k * 0.08);
      chosen = [];
      var ok = codes.every(function (t) {
        var slots = demoSlots_(roomsOf[t], ym + '-01', lastNight, occ, avg, rnd), got = 0, mineT = [];
        demoShuffle_(slots, rnd);
        for (var s = 0; s < slots.length && got < need[t].nights; s++) {
          var sl = slots[s];
          sl.nights = Math.min(sl.nights, need[t].nights - got);
          got += sl.nights;
          mineT.push({typeCode: t, roomNo: sl.roomNo, checkIn: sl.checkIn, nights: sl.nights, discount: 0});
        }
        if (got < need[t].nights) return false;
        // what the nights earn above the target is given back as discounts on the longest stays (≤ 4 of them)
        var extra = need[t].nights * price[t] - need[t].rev;
        if (extra > 0) {
          var big = mineT.slice().sort(function (a, b) { return b.nights - a.nights; }).slice(0, 4);
          demoSplit_(extra, Math.min(big.length, Math.ceil(extra / price[t])), 10, rnd, true)
            .forEach(function (p, i) { big[i].discount = p; });
          if (big.some(function (b) { return b.discount >= b.nights * price[t]; })) return false;
        }
        chosen = chosen.concat(mineT);
        return true;
      });
      if (ok && chosen.length <= countTarget) break;
      chosen = null;
    }
    if (!chosen) throw new Error('demo seed: could not place the stays of ' + ym);

    // cancelled bookings make up the month's count; they hold no nights and earn nothing
    for (var c = chosen.length; c < countTarget; c++) {
      var ct = demoPick_(rnd, codes);
      chosen.push({typeCode: ct, roomNo: demoPick_(rnd, roomsOf[ct]), nights: 1 + Math.floor(rnd() * 2), discount: 0, cxl: true,
        checkIn: demoAddDays_(ym + '-01', Math.floor(rnd() * (demoDaysBetween_(ym + '-01', lastNight)) ))});
    }
    chosen.sort(function (a, b) { return a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : a.roomNo < b.roomNo ? -1 : 1; });
    var taken = {};
    numbered.forEach(function (b) { taken[b.docNo] = 1; });
    var no = 0;
    chosen.forEach(function (s) {
      var docNo;
      do { docNo = 'BK-' + ym.replace('-', '') + '-' + pad_(++no, 4); } while (taken[docNo]);
      var cust = demoPick_(rnd, pool);
      var channel = cust.type === 'OTA' ? demoPick_(rnd, ['BKG', 'BKG', 'AGD'])
        : cust.type === 'CORP' ? demoPick_(rnd, ['PHONE', 'PHONE', 'LINE'])
        : demoWeighted_(rnd, [['WALKIN', 64], ['PHONE', 38], ['LINE', 22], ['BKG', 71], ['AGD', 45]]);
      var checkOut = demoAddDays_(s.checkIn, s.nights), status;
      if (s.cxl) status = 'cxl';
      else if (checkOut <= D.today) status = s.checkIn >= '2026-09-01' && rnd() < 0.08 ? 'due' : 'paid';
      else status = 'dep';
      var pay = status === 'cxl' || status === 'due' ? ''
        : cust.type === 'CORP' ? demoPick_(rnd, ['TRANSFER', 'CREDIT'])
        : channel === 'BKG' || channel === 'AGD' ? demoPick_(rnd, ['CARD', 'CARD', 'TRANSFER'])
        : channel === 'WALKIN' ? demoPick_(rnd, ['CASH', 'CASH', 'QR', 'CARD'])
        : demoWeighted_(rnd, [['CASH', 30], ['TRANSFER', 120], ['CARD', 30], ['QR', 47]]);
      out.push(demoBooking_({docNo: docNo, customer: cust, typeCode: s.typeCode, roomNo: s.roomNo, checkIn: s.checkIn,
        nights: s.nights, rate: price[s.typeCode], discount: s.discount, channel: channel, payStatus: status, payMethod: pay,
        guests: Math.max(1, Math.min(maxGuests[s.typeCode], cust.type === 'CORP' ? 2 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * maxGuests[s.typeCode]))),
        lead: channel === 'WALKIN' ? 0 : 1 + Math.floor(rnd() * 21)}, rnd));
    });
  });
  return out.sort(function (a, b) { return a.docNo < b.docNo ? -1 : 1; });
}

function demoBooking_(o, rnd) {
  var gross = o.rate * o.nights, total = gross - o.discount;
  var vat = Number(DemoData.company.vatRate) || 0;
  var created = demoAddDays_(o.checkIn, -o.lead);
  if (created > DemoData.today) created = DemoData.today;
  return {
    docNo: o.docNo, customerId: o.customer.customerId, guestName: o.customer.name, phone: o.customer.phone,
    typeCode: o.typeCode, roomNo: o.roomNo, checkIn: o.checkIn, checkOut: demoAddDays_(o.checkIn, o.nights), nights: o.nights,
    guests: o.guests, rate: o.rate, discount: o.discount, total: total,
    vatAmount: Math.round(total * vat / (100 + vat) * 100) / 100,
    channel: o.channel, payMethod: o.payMethod, payStatus: o.payStatus,
    deposit: o.payStatus === 'dep' ? Math.min(total, Math.max(500, Math.round(total * 0.3 / 100) * 100)) : 0,
    note: o.discount ? 'ส่วนลดโปรโมชั่น' : '',
    createdBy: rnd() < 0.7 ? 'frontdesk1' : rnd() < 0.5 ? 'maneerat' : 'somchai',
    createdAt: created + 'T' + demoTime_(rnd), updatedAt: ''
  };
}

/** Free nights of these rooms between from and lastNight, cut into back-to-back stays of about avg nights. */
function demoSlots_(rooms, from, lastNight, occ, avg, rnd) {
  var out = [], days = demoDaysBetween_(from, lastNight) + 1;
  rooms.forEach(function (room) {
    var d = 0;
    while (d < days) {
      if (occ[room][demoAddDays_(from, d)]) { d++; continue; }
      var want = Math.max(1, Math.min(7, Math.round(avg + (rnd() * 2 - 1) * avg * 0.5))), n = 0;
      while (n < want && d + n < days && !occ[room][demoAddDays_(from, d + n)]) n++;
      out.push({roomNo: room, checkIn: demoAddDays_(from, d), nights: n});
      d += n;
    }
  });
  return out;
}

/* ---------- other income ---------- */

var DEMO_OTHER = {
  MINIBAR: {unit: 5, prices: [60, 65, 80, 90, 120], desc: ['เครื่องดื่มและขนมใน Minibar', 'เบียร์และน้ำดื่ม', 'น้ำอัดลมและขนม', 'กาแฟกระป๋องและขนม']},
  FOOD:    {unit: 5, prices: [225, 450, 890], desc: ['อาหารเช้าเพิ่ม', 'ชุดอาหารเย็น', 'อาหารกลางวัน', 'Room service', 'เครื่องดื่มที่ล็อบบี้']},
  LAUNDRY: {unit: 40, prices: [120, 40], desc: ['ซักรีดเสื้อผ้า 1 ถุง', 'ซักรีดด่วน', 'รีดผ้า']},
  SHUTTLE: {unit: 300, prices: [], desc: ['รับจากสนามบินเชียงใหม่', 'ส่งสนามบินเชียงใหม่', 'รับส่งสถานีรถไฟเชียงใหม่']},
  LATE:    {unit: 300, prices: [], desc: ['เช็คเอาท์ 14:00', 'เช็คเอาท์ 16:00', 'เช็คเอาท์ 18:00']},
  OTHER:   {unit: 10, prices: [150, 50], desc: ['เช่าจักรยาน 1 วัน', 'ฝากกระเป๋า', 'เช่ารถจักรยานยนต์', 'ค่ากุญแจห้องหาย']}
};

function demoOtherIncome_(rnd, bookings) {
  var D = DemoData, out = [], cats = Object.keys(D.sepOther);
  var sepTotal = cats.reduce(function (s, c) { return s + D.sepOther[c][1]; }, 0);
  var fixed = D.otherIncome.map(function (r) {
    return demoOther_({docNo: r[0], date: r[1], category: r[2], description: r[3], roomNo: r[4], bookingNo: r[5], qty: r[6],
      unitPrice: r[7], payMethod: r[8]}, rnd);
  });
  D.months.forEach(function (m, mi) {
    var ym = m[0], sep = mi === D.months.length - 1;
    var last = sep ? demoAddDays_(fixed[0].date, 0) : ym + '-' + pad_(demoDim_(ym), 2);   // before OI-202609-0110
    var otherRev = m[1] - (sep ? 402650 : Math.round(m[1] * 0.83 / 10) * 10);
    var stays = bookings.filter(function (b) { return b.payStatus !== 'cxl' && b.checkIn.slice(0, 7) === ym && b.checkIn <= last; });
    var items = [], drift = otherRev;
    var plan = cats.map(function (c) {
      var amt, cnt;
      if (sep) { amt = D.sepOther[c][1]; cnt = D.sepOther[c][0]; }
      else {
        amt = Math.round(otherRev * D.sepOther[c][1] / sepTotal / DEMO_OTHER[c].unit) * DEMO_OTHER[c].unit;
        cnt = Math.max(1, Math.round(D.sepOther[c][0] * otherRev / sepTotal));
      }
      drift -= amt;
      return {c: c, amt: amt, cnt: cnt};
    });
    plan[cats.indexOf('FOOD')].amt += drift;   // rounding left over
    plan.forEach(function (p) {
      if (sep) fixed.forEach(function (f) { if (f.category === p.c) { p.amt -= f.amount; p.cnt--; } });
      demoSplit_(p.amt, p.cnt, DEMO_OTHER[p.c].unit, rnd).forEach(function (amount) {
        var def = DEMO_OTHER[p.c], unitPrice = amount, qty = 1;
        def.prices.some(function (pr) { if (amount % pr === 0 && amount / pr <= 6) { unitPrice = pr; qty = amount / pr; return true; } return false; });
        // late check-out happens on the check-out day; the shuttle meets the guest on arrival or takes them on departure
        var leaving = stays.filter(function (s) { return s.checkOut <= last; });
        var b = p.c === 'FOOD' && rnd() < 0.2 ? null : demoPick_(rnd, p.c === 'LATE' && leaving.length ? leaving : stays);
        var date, desc = demoPick_(rnd, def.desc);
        if (b && p.c === 'LATE' && b.checkOut <= last) date = b.checkOut;
        else if (b && p.c === 'SHUTTLE') {
          var leave = b.checkOut <= last && rnd() < 0.5;
          date = leave ? b.checkOut : b.checkIn;
          desc = leave ? 'ส่งสนามบินเชียงใหม่' : demoPick_(rnd, ['รับจากสนามบินเชียงใหม่', 'รับจากสถานีรถไฟเชียงใหม่']);
        } else if (b) {
          var end = b.checkOut < last ? b.checkOut : last;
          date = demoAddDays_(b.checkIn, Math.floor(rnd() * (demoDaysBetween_(b.checkIn, end) + 1)));
        } else {
          date = demoAddDays_(ym + '-01', Math.floor(rnd() * (demoDaysBetween_(ym + '-01', last) + 1)));
          desc += ' (ลูกค้าภายนอก)';
        }
        items.push({date: date, category: p.c, description: desc, roomNo: b ? b.roomNo : '', bookingNo: b ? b.docNo : '',
          qty: qty, unitPrice: unitPrice, payMethod: rnd() < 0.35 ? '' : demoWeighted_(rnd, [['CASH', 88], ['TRANSFER', 120], ['CARD', 51], ['QR', 47]])});
      });
    });
    items.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.category < b.category ? -1 : 1; });
    items.forEach(function (it, i) {
      it.docNo = 'OI-' + ym.replace('-', '') + '-' + pad_(i + 1, 4);
      out.push(demoOther_(it, rnd));
    });
  });
  return out.concat(fixed);
}
function demoOther_(o, rnd) {
  o.amount = Math.round(o.qty * o.unitPrice * 100) / 100;
  o.createdBy = rnd() < 0.8 ? 'frontdesk1' : 'maneerat';
  o.createdAt = o.date + 'T' + demoTime_(rnd);
  o.updatedAt = '';
  return o;
}

/* ---------- expenses ---------- */

var DEMO_EXP = {
  FNB:   {by: 'frontdesk1', pay: ['CASH', 'CASH', 'CARD'], items: [['ผักและผลไม้สด', 'ตลาดเมืองใหม่'], ['เนื้อสัตว์และอาหารแห้ง', 'แม็คโคร สาขาเชียงใหม่'],
          ['น้ำดื่มสำหรับห้องพัก', 'ร้านน้ำดื่มสายธาร'], ['ไข่ไก่และนมสด', 'ฟาร์มไข่สันทราย'], ['กาแฟและชา', 'ร้านวาวีกาแฟ'],
          ['เครื่องดื่มสำหรับ Minibar', 'แม็คโคร สาขาเชียงใหม่'], ['ขนมปังอาหารเช้า', 'ร้านเบเกอรี่บ้านขนม']]},
  AMEN:  {by: 'piyanuch', pay: ['TRANSFER'], items: [['สบู่ แชมพู แปรงสีฟัน (Amenities)', 'บริษัท โฮเทลซัพพลาย จำกัด'],
          ['กระดาษทิชชู่และกระดาษชำระ', 'แม็คโคร สาขาเชียงใหม่'], ['ผ้าขนหนูและผ้าปูที่นอน', 'ร้านผ้าเชียงใหม่'],
          ['น้ำยาทำความสะอาด', 'บริษัท โฮเทลซัพพลาย จำกัด'], ['รองเท้าสลิปเปอร์', 'บริษัท โฮเทลซัพพลาย จำกัด']]},
  MAINT: {by: 'somchai', pay: ['TRANSFER', 'CASH'], items: [['ซ่อมก๊อกน้ำ ห้อง {room}', 'ช่างประปาสารภี'], ['เปลี่ยนหลอดไฟทางเดิน', 'ร้านไฟฟ้าสารภี'],
          ['ล้างเครื่องปรับอากาศ', 'หจก. เชียงใหม่แอร์เซอร์วิส'], ['ซ่อมประตูห้อง {room}', 'ช่างไม้สมบูรณ์']]},
  MKT:   {by: 'maneerat', pay: ['CARD'], items: [['โฆษณา Facebook Ads', 'Meta Platforms'], ['โฆษณา Google Ads', 'Google Asia Pacific'],
          ['พิมพ์แผ่นพับโปรโมชั่น', 'ร้านพิมพ์ดีไซน์']]},
  TAX:   {by: 'piyanuch', pay: ['TRANSFER'], items: [['ค่าธรรมเนียมโอนเงิน', 'ธนาคารกสิกรไทย'], ['ค่าธรรมเนียมเครื่องรูดบัตร', 'ธนาคารกสิกรไทย'],
          ['อากรแสตมป์และค่าธรรมเนียมเอกสาร', 'สำนักงานสรรพากรพื้นที่']]}
};
var DEMO_SALARY = [['เงินเดือนผู้จัดการ', 18000], ['เงินเดือนพนักงานต้อนรับ', 15000], ['เงินเดือนแม่บ้าน', 13000],
                   ['เงินเดือนพนักงานครัว', 12000], ['เงินเดือนพนักงานซ่อมบำรุง', 10000], ['เงินเดือนพนักงานรักษาความปลอดภัย', 10000]];

function demoExpenses_(rnd) {
  var D = DemoData, out = [], cats = Object.keys(D.sepExpense);
  var base = D.sepExpense;
  var sepRest = cats.reduce(function (s, c) { return c === 'SALARY' ? s : s + base[c][1]; }, 0);   // ฿94,840
  var fixed = D.expenses.map(function (e) {
    return demoExpense_({docNo: e[0], date: e[1], category: e[2], description: e[3], vendor: e[4], payMethod: e[5], amount: e[6], createdBy: e[7]}, rnd);
  });
  D.months.forEach(function (m, mi) {
    var ym = m[0], sep = mi === D.months.length - 1, y = Number(ym.slice(0, 4)), mo = Number(ym.slice(5, 7));
    var prev = TH_MONTH[(mo + 10) % 12] + (mo === 1 ? ' ' + (y - 1) : '');
    var last = sep ? demoAddDays_(fixed[0].date, 0) : ym + '-' + pad_(demoDim_(ym), 2);   // before EX-202609-0051
    var day = function (from) { return demoAddDays_(ym + '-' + pad_(from, 2), Math.floor(rnd() * (demoDaysBetween_(ym + '-' + pad_(from, 2), last) + 1))); };
    var rest = m[2] - 78000, amt = {}, drift = rest;
    cats.forEach(function (c) {
      if (c === 'SALARY') return;
      amt[c] = sep ? base[c][1] : Math.round(rest * base[c][1] / sepRest / 10) * 10;
      drift -= amt[c];
    });
    amt.FNB += drift;
    if (sep) fixed.forEach(function (f) { amt[f.category] -= f.amount; });
    var items = [];
    DEMO_SALARY.forEach(function (s) {
      items.push({date: ym + '-01', category: 'SALARY', description: s[0] + ' ' + prev, vendor: '', payMethod: 'TRANSFER', amount: s[1], createdBy: 'piyanuch'});
    });
    // utilities: electricity is the big one; September's is in DemoData
    var water = Math.round((sep ? 4470 : amt.UTIL * 0.138) / 10) * 10, net = 1600;
    if (!sep) items.push({date: day(18), category: 'UTIL', description: 'ค่าไฟฟ้า ' + prev + ' ' + y, vendor: 'การไฟฟ้าส่วนภูมิภาค', payMethod: 'TRANSFER', amount: amt.UTIL - water - net, createdBy: 'piyanuch'});
    items.push({date: day(5), category: 'UTIL', description: 'ค่าน้ำประปา ' + prev, vendor: 'การประปาส่วนภูมิภาค', payMethod: 'TRANSFER', amount: water, createdBy: 'piyanuch'});
    items.push({date: day(5), category: 'UTIL', description: 'ค่าอินเทอร์เน็ต ' + prev, vendor: 'บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน)', payMethod: 'TRANSFER', amount: net, createdBy: 'piyanuch'});
    // OTA commissions: Booking.com (September's is in DemoData), Agoda, then payment fees
    var otaCount = base.OTA[0] - (sep ? 1 : 0);
    demoSplit_(amt.OTA, otaCount, 10, rnd, false, sep ? [3] : [6, 3]).forEach(function (a, i) {
      var k = i + (sep ? 1 : 0);
      var d = k === 0 ? ['คอมมิชชั่น Booking.com (' + prev + ')', 'Booking.com B.V.'] : k === 1 ? ['คอมมิชชั่น Agoda (' + prev + ')', 'Agoda Company Pte. Ltd.']
        : ['ค่าธรรมเนียมการชำระเงินผ่าน OTA', k % 2 ? 'Agoda Company Pte. Ltd.' : 'Booking.com B.V.'];
      items.push({date: day(k < 2 ? 15 : 2), category: 'OTA', description: d[0], vendor: d[1], payMethod: 'TRANSFER', amount: a, createdBy: 'piyanuch'});
    });
    Object.keys(DEMO_EXP).forEach(function (c) {
      var def = DEMO_EXP[c], cnt = base[c][0];
      if (sep) fixed.forEach(function (f) { if (f.category === c) cnt--; });
      demoSplit_(amt[c], cnt, 10, rnd).forEach(function (a) {
        var it = demoPick_(rnd, def.items);
        items.push({date: day(2), category: c, description: it[0].replace('{room}', demoPick_(rnd, ['101', '102', '203', '301', '402'])),
          vendor: it[1], payMethod: demoPick_(rnd, def.pay), amount: a, createdBy: def.by});
      });
    });
    items.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.category < b.category ? -1 : 1; });
    items.forEach(function (it, i) {
      it.docNo = 'EX-' + ym.replace('-', '') + '-' + pad_(i + 1, 4);
      out.push(demoExpense_(it, rnd));
    });
  });
  return out.concat(fixed);
}
function demoExpense_(o, rnd) {
  o.createdAt = o.date + 'T' + demoTime_(rnd);
  o.updatedAt = '';
  return o;
}

/* ---------- Attachments ---------- */

/** Attachment rows for the demo expenses (no Drive files: a demo download says so). Expenses shows September with
 *  7 of 58 not attached — EX-202609-0051 and 0053 plus five cash purchases — and EX-202609-0056 with two files.
 *  Run by setup() whenever the demo hotel has expenses and no attachments, so an already seeded demo gets them too. */
function seedDemoAttachments_() {
  var rnd = demoRng_(DEMO_SEED + 5), sep = DemoData.months[DemoData.months.length - 1][0];
  var exps = readTable('Expenses').sort(function (a, b) { return a.docNo < b.docNo ? -1 : 1; });
  var none = {'EX-202609-0051': 1, 'EX-202609-0053': 1}, fixed = {};
  DemoData.expenses.forEach(function (e) { fixed[e[0]] = 1; });
  var cash = exps.filter(function (e) { return e.date.slice(0, 7) === sep && !fixed[e.docNo] && e.category === 'FNB' && e.payMethod === 'CASH'; });
  for (var n = 0; n < 5 && cash.length; n++) none[cash.splice(Math.floor(rnd() * cash.length), 1)[0].docNo] = 1;
  var kind = {SALARY: ['สลิปโอนเงินเดือน', 'pdf'], UTIL: ['ใบแจ้งหนี้', 'pdf'], OTA: ['ใบแจ้งหนี้', 'pdf'], TAX: ['ใบเสร็จ', 'pdf'], MKT: ['ใบกำกับภาษี', 'pdf']};
  var rows = [];
  exps.forEach(function (e) {
    if (none[e.docNo] || (e.date.slice(0, 7) !== sep && rnd() < 0.08)) return;
    var k = kind[e.category] || ['ใบเสร็จ', 'jpg'], files = [k];
    if (e.docNo === 'EX-202609-0056') files.push(['ใบเสนอราคา', 'pdf']);
    files.forEach(function (f, i) {
      rows.push({fileId: 'DEMO-' + e.docNo + '-' + (i + 1), docNo: e.docNo, fileName: f[0] + '_' + e.docNo + '.' + f[1],
        mime: f[1] === 'pdf' ? 'application/pdf' : 'image/jpeg', size: Math.round((80 + rnd() * 3400) * 1024), driveUrl: '',
        uploadedBy: e.createdBy, uploadedAt: e.createdAt});
    });
  });
  withLock_(function () { insertRows('Attachments', rows); });
  return 'demo attachments: ' + rows.length;
}

/* ---------- Sequences ---------- */

/** last = the highest number per PREFIX-yyyyMM, so the next save continues after the demo rows. */
function demoSequences_(rows) {
  var last = {};
  rows.forEach(function (r) {
    var p = String(r.docNo).split('-'), key = p[0] + '-' + p[1];
    last[key] = Math.max(last[key] || 0, Number(p[2]));
  });
  var have = {};
  readTable('Sequences').forEach(function (s) { have[s.key] = s.last; });
  var add = [];
  Object.keys(last).forEach(function (key) {
    if (key in have) { if (have[key] < last[key]) updateRow('Sequences', key, {last: last[key]}); }
    else add.push({key: key, prefix: key.split('-')[0], yyyymm: key.split('-')[1], last: last[key]});
  });
  insertRows('Sequences', add);
}

/* ---------- helpers ---------- */

function demoRng_(seed) {   // mulberry32
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function demoPick_(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }
function demoWeighted_(rnd, pairs) {
  var sum = pairs.reduce(function (s, p) { return s + p[1]; }, 0), x = rnd() * sum;
  for (var i = 0; i < pairs.length; i++) { x -= pairs[i][1]; if (x < 0) return pairs[i][0]; }
  return pairs[pairs.length - 1][0];
}
function demoShuffle_(arr, rnd) {
  for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  return arr;
}
function demoDigits_(rnd, n) { var s = ''; while (s.length < n) s += Math.floor(rnd() * 10); return s; }
function demoTime_(rnd) { return pad_(8 + Math.floor(rnd() * 13), 2) + ':' + pad_(Math.floor(rnd() * 60), 2) + ':00'; }
function demoDim_(ym) { return new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate(); }
function demoAddDays_(iso, n) { return addDays_(iso, n); }
function demoDaysBetween_(a, b) { return nightsBetween_(a, b); }
/** total (a multiple of unit) split into count positive multiples of unit. lead: extra weight for the first items.
 *  even: near-equal parts (for discounts). */
function demoSplit_(total, count, unit, rnd, even, lead) {
  if (count <= 0) { if (total) throw new Error('demo seed: ' + total + ' left with no items'); return []; }
  var units = Math.round(total / unit);
  if (units < count) throw new Error('demo seed: cannot split ' + total + ' into ' + count + ' items');
  var w = [];
  for (var i = 0; i < count; i++) w.push((lead && lead[i]) || (even ? 1 : 0.4 + rnd()));
  var ws = w.reduce(function (s, x) { return s + x; }, 0);
  var alloc = w.map(function (x) { return Math.max(1, Math.floor(units * x / ws)); });
  var diff = units - alloc.reduce(function (s, x) { return s + x; }, 0);
  for (var k = 0; diff !== 0; k = (k + 1) % count) {
    if (diff > 0) { alloc[k]++; diff--; } else if (alloc[k] > 1) { alloc[k]--; diff++; }
  }
  return alloc.map(function (a) { return a * unit; });
}

/* ---------- Receipts ---------- */

/** Receipts up to the designs' "today": every paid stay on its check-out day (room + the other income left to
 *  "รวมในใบเสร็จ"), and every line of other income paid on the spot on its own. Numbered by date within each month,
 *  which makes BK-202609-0057's receipt (the first one on 24/09) RC-202609-0112 as in design/Receipt.
 *  Run by setup() whenever the demo hotel has bookings and no receipts, so an already seeded demo gets them too. */
function seedDemoReceipts_() {
  var D = DemoData, rnd = demoRng_(DEMO_SEED + 6), cut = D.today, fixedNo = 'BK-202609-0057';
  var custs = {}, types = roomTypeMap_(), cat = dropdownLabel_('othercat'), co = readKV('Company');
  var vr = Number(co.vatRate) || 0, mode = co.vatMode === 'excluded' ? 'excluded' : 'included';
  var cu = findById('Customers', 'CU-0205');   // design/Receipt shows her address
  if (cu && !cu.address) updateRow('Customers', 'CU-0205', {address: '123/45 ถนนนิมมานเหมินท์ ตำบลสุเทพ อำเภอเมืองเชียงใหม่ จังหวัดเชียงใหม่ 50200'});
  readTable('Customers').forEach(function (c) { custs[c.customerId] = c; });
  var bookings = {}, withStay = {};
  readTable('RoomIncome').forEach(function (b) { bookings[b.docNo] = b; });
  var other = readTable('OtherIncome').sort(function (a, b) { return a.docNo < b.docNo ? -1 : 1; });
  other.forEach(function (o) { if (o.bookingNo && !o.payMethod) (withStay[o.bookingNo] = withStay[o.bookingNo] || []).push(o); });
  var who = function (b) {
    var c = b && custs[b.customerId];
    return c ? {customerId: c.customerId, customerName: c.name, customerAddress: c.address, customerTaxId: c.taxId, customerPhone: c.phone || b.phone}
      : {customerId: '', customerName: 'ลูกค้าทั่วไป', customerAddress: '', customerTaxId: '', customerPhone: ''};
  };
  var drafts = [];
  Object.keys(bookings).forEach(function (no) {
    var b = bookings[no];
    if (b.payStatus !== 'paid' || b.checkOut > cut) return;
    var lines = [receiptRoomLine_(b, types)].concat((withStay[no] || []).map(function (o) { return receiptOtherLine_(o, cat); }));
    var fixed = no === fixedNo;
    drafts.push({lines: lines, discount: b.discount, bookingNo: no, who: who(b), date: b.checkOut, payMethod: fixed ? 'TRANSFER' : b.payMethod,
      payNote: fixed ? 'ธนาคารกสิกรไทย · วันที่โอน 24/09/2026' : '', issuedBy: fixed ? 'somchai' : demoPick_(rnd, ['frontdesk1', 'frontdesk2']),
      at: b.checkOut + 'T' + (fixed ? '08:05:00' : pad_(9 + Math.floor(rnd() * 3), 2) + ':' + pad_(Math.floor(rnd() * 60), 2) + ':00'), first: fixed});
  });
  other.forEach(function (o) {
    if (!o.payMethod || o.date > cut) return;
    drafts.push({lines: [receiptOtherLine_(o, cat)], discount: 0, bookingNo: o.bookingNo, who: who(bookings[o.bookingNo]), date: o.date,
      payMethod: o.payMethod, payNote: '', issuedBy: o.createdBy, at: o.createdAt, first: false});
  });
  drafts.sort(function (a, b) {
    return a.date < b.date ? -1 : a.date > b.date ? 1 : a.first !== b.first ? (a.first ? -1 : 1) : a.at < b.at ? -1 : a.at > b.at ? 1 : 0;
  });
  var count = {}, receipts = [], items = [];
  drafts.forEach(function (d) {
    var ym = d.date.slice(0, 7).replace('-', ''), n = count[ym] = (count[ym] || 0) + 1, docNo = DOC_PREFIX.receipt + '-' + ym + '-' + pad_(n, 4);
    var m = receiptMoney_(d.lines.reduce(function (s, l) { return s + l.amount; }, 0), d.discount, vr, mode);
    receipts.push(Object.assign({docNo: docNo, date: d.date, bookingNo: d.bookingNo, subtotal: m.subtotal, discount: m.discount,
      netBeforeVat: m.netBeforeVat, vat: m.vat, total: m.total, payMethod: d.payMethod, status: 'active', issuedBy: d.issuedBy,
      createdAt: d.at, payNote: d.payNote, note: '', vatRate: vr, vatMode: mode, prevPayStatus: '', cancelReason: '', cancelledBy: '',
      cancelledAt: '', printCount: 1}, d.who));
    d.lines.forEach(function (l, i) {
      items.push({itemId: docNo + '-' + (i + 1), docNo: docNo, line: i + 1, description: l.description, detail: l.detail, qty: l.qty,
        unit: l.unit, unitPrice: l.unitPrice, amount: l.amount, refDocNo: l.refDocNo});
    });
  });
  withLock_(function () {
    insertRows('Receipts', receipts);
    insertRows('ReceiptItems', items);
    demoSequences_(receipts);
  });
  var mine = receipts.filter(function (r) { return r.bookingNo === fixedNo; })[0];
  return 'demo receipts: ' + receipts.length + ' (' + fixedNo + ' → ' + (mine ? mine.docNo : '-') + ')';
}
