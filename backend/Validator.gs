/** Validator.gs — validation layer 2 (server). Layer 1 is the browser (js-validate), layer 3 the repository
 *  (Database.gs: primary key and format on write).
 *
 *  validate_(entity, data) checks data against RULES[entity] and returns a clean object holding only the fields
 *  in the rule set, converted to their type (phone and tax id stay strings). The first problem throws
 *  fieldError_(field, message) so the UI can highlight that input. Messages say how to fix the value.
 *
 *  Rule keys: label, req, type (text | phone | email | taxId | money | num | int | date | time | bool | enum |
 *  dropdown | ref), max (text length or number), min, oneOf (enum), group (dropdown), table (ref), pattern + hint.
 */

/** Every error the server raises on purpose carries a code; Api.gs sends {ok:false, code, message, field}. */
function appError_(code, message, field) {
  var e = new Error(message);
  e.code = code;
  if (field) e.field = field;
  return e;
}
function fieldError_(field, message) { return appError_('VALIDATION', message, field); }

var RULES = {
  Company: {
    companyName:    {label: 'ชื่อบริษัท', req: true, max: 150},
    hotelName:      {label: 'ชื่อโรงแรม', req: true, max: 150},
    taxId:          {label: 'เลขประจำตัวผู้เสียภาษี', type: 'taxId'},
    branch:         {label: 'สาขา', max: 60},
    address:        {label: 'ที่อยู่', max: 400},
    phone:          {label: 'โทรศัพท์', type: 'phone'},
    email:          {label: 'อีเมล', type: 'email'},
    website:        {label: 'เว็บไซต์', max: 150},
    logoFileId:     {label: 'โลโก้', max: 100},
    vatRate:        {label: 'อัตรา VAT', type: 'num', min: 0, max: 30},
    vatMode:        {label: 'รูปแบบ VAT', type: 'enum', oneOf: VAT_MODES},
    receiptPattern: {label: 'รูปแบบเลขที่ใบเสร็จ', max: 40, pattern: /^[A-Z]{2,4}-(\{YYYYMM\}-)?\{#{3,6}\}$/, hint: 'ใช้รูปแบบ RC-{YYYYMM}-{####}'},
    checkInTime:    {label: 'เวลาเช็คอิน', type: 'time'},
    checkOutTime:   {label: 'เวลาเช็คเอาท์', type: 'time'},
    currency:       {label: 'สกุลเงิน', type: 'enum', oneOf: ['THB']}
  },
  User: {
    username: {label: 'ชื่อผู้ใช้', req: true, pattern: /^[a-z0-9._-]{3,30}$/, hint: 'ใช้ a-z, 0-9, จุด, ขีด ความยาว 3–30 ตัว'},
    fullName: {label: 'ชื่อ-นามสกุล', req: true, max: 120},
    email:    {label: 'อีเมล', type: 'email'},
    phone:    {label: 'เบอร์โทร', type: 'phone'},
    role:     {label: 'บทบาท', req: true, type: 'enum', oneOf: ROLES},
    status:   {label: 'สถานะ', req: true, type: 'enum', oneOf: USER_STATUS}
  },
  Dropdown: {
    group:  {label: 'กลุ่มตัวเลือก', req: true, type: 'enum', oneOf: Object.keys(DROPDOWN_GROUPS)},
    code:   {label: 'รหัส', req: true, pattern: /^[A-Z0-9_]{1,20}$/, hint: 'ใช้ตัวพิมพ์ใหญ่ A-Z, 0-9 หรือ _ ไม่เกิน 20 ตัว'},
    label:  {label: 'ชื่อที่แสดง', req: true, max: 80},
    sort:   {label: 'ลำดับ', type: 'int', min: 0, max: 9999},
    active: {label: 'สถานะ', type: 'bool'}
  },
  Customer: {
    name:        {label: 'ชื่อลูกค้า', req: true, max: 150},
    type:        {label: 'ประเภทลูกค้า', type: 'dropdown', group: 'custtype'},
    nationality: {label: 'สัญชาติ', max: 60},
    phone:       {label: 'เบอร์โทร', type: 'phone'},
    email:       {label: 'อีเมล', type: 'email'},
    taxId:       {label: 'เลขประจำตัวผู้เสียภาษี', type: 'taxId'},
    address:     {label: 'ที่อยู่', max: 400},
    note:        {label: 'หมายเหตุ', max: 500}
  },
  RoomType: {
    code:         {label: 'รหัสประเภทห้อง', req: true, pattern: /^[A-Z0-9]{2,6}$/, hint: 'ใช้ตัวพิมพ์ใหญ่หรือตัวเลข 2–6 ตัว เช่น DLX'},
    name:         {label: 'ชื่อประเภทห้อง', req: true, max: 80},
    price:        {label: 'ราคาปกติ', req: true, type: 'money', min: 0},
    weekendPrice: {label: 'ราคาศุกร์-เสาร์', type: 'money', min: 0},
    maxGuests:    {label: 'จำนวนผู้เข้าพักสูงสุด', req: true, type: 'int', min: 1, max: 20},
    bedType:      {label: 'ประเภทเตียง', max: 60},
    amenities:    {label: 'สิ่งอำนวยความสะดวก', max: 400},
    active:       {label: 'สถานะ', type: 'bool'}
  },
  Room: {
    roomNo:   {label: 'เลขที่ห้อง', req: true, pattern: /^[0-9A-Za-z-]{1,10}$/, hint: 'ใช้ตัวเลข ตัวอักษร หรือขีด ไม่เกิน 10 ตัว'},
    typeCode: {label: 'ประเภทห้อง', req: true, type: 'ref', table: 'RoomTypes'},
    floor:    {label: 'ชั้น', type: 'int', min: -5, max: 200},
    status:   {label: 'สถานะห้อง', req: true, type: 'enum', oneOf: ROOM_STATUS},
    note:     {label: 'หมายเหตุ', max: 300}
  },
  RoomIncome: {
    customerId: {label: 'ลูกค้า', type: 'ref', table: 'Customers'},
    guestName:  {label: 'ชื่อผู้เข้าพัก', req: true, max: 150},
    phone:      {label: 'เบอร์โทร', type: 'phone'},
    typeCode:   {label: 'ประเภทห้อง', req: true, type: 'ref', table: 'RoomTypes'},
    roomNo:     {label: 'เลขที่ห้อง', req: true, type: 'ref', table: 'Rooms'},
    checkIn:    {label: 'วันเช็คอิน', req: true, type: 'date'},
    checkOut:   {label: 'วันเช็คเอาท์', req: true, type: 'date'},
    guests:     {label: 'จำนวนผู้เข้าพัก', req: true, type: 'int', min: 1, max: 20},
    rate:       {label: 'ราคาต่อคืน', req: true, type: 'money', min: 0},
    discount:   {label: 'ส่วนลด', type: 'money', min: 0},
    channel:    {label: 'ช่องทางการจอง', req: true, type: 'dropdown', group: 'channel'},
    payMethod:  {label: 'วิธีชำระเงิน', type: 'dropdown', group: 'pay'},
    payStatus:  {label: 'สถานะการชำระ', req: true, type: 'enum', oneOf: PAY_STATUS},
    deposit:    {label: 'เงินมัดจำ', type: 'money', min: 0},
    note:       {label: 'หมายเหตุ', max: 500}
  },
  OtherIncome: {
    date:        {label: 'วันที่', req: true, type: 'date'},
    category:    {label: 'ประเภทรายได้', req: true, type: 'dropdown', group: 'othercat'},
    description: {label: 'รายละเอียด', max: 300},
    roomNo:      {label: 'เลขที่ห้อง', type: 'ref', table: 'Rooms'},
    bookingNo:   {label: 'เลขที่การจอง', type: 'ref', table: 'RoomIncome'},
    qty:         {label: 'จำนวน', req: true, type: 'num', min: 0.01},
    unitPrice:   {label: 'ราคาต่อหน่วย', req: true, type: 'money', min: 0},
    payMethod:   {label: 'วิธีชำระเงิน', type: 'dropdown', group: 'pay'}
  },
  Expense: {
    date:        {label: 'วันที่', req: true, type: 'date'},
    category:    {label: 'หมวดหมู่', req: true, type: 'dropdown', group: 'expcat'},
    description: {label: 'รายละเอียด', req: true, max: 300},
    vendor:      {label: 'ผู้ขาย/ผู้รับเงิน', max: 150},
    payMethod:   {label: 'วิธีชำระเงิน', req: true, type: 'dropdown', group: 'pay'},
    amount:      {label: 'จำนวนเงิน', req: true, type: 'money', min: 0.01}
  }
};

/** Cross-field checks, run after every field passed. Receives the clean object. */
var CHECKS = {
  RoomIncome: function (o) {
    if (o.checkOut <= o.checkIn) throw fieldError_('checkOut', 'วันเช็คเอาท์ต้องอยู่หลังวันเช็คอิน กรุณาเลือกวันใหม่');
    if (o.discount > o.rate * nightsBetween_(o.checkIn, o.checkOut)) throw fieldError_('discount', 'ส่วนลดมากกว่ายอดค่าห้อง กรุณาลดส่วนลด');
  },
  Room: function (o) {
    var t = findById('RoomTypes', o.typeCode);
    if (t && !t.active) throw fieldError_('typeCode', 'ประเภทห้องนี้ปิดใช้งานอยู่ กรุณาเลือกประเภทอื่น');
  }
};

function validate_(entity, data) {
  var rules = RULES[entity];
  if (!rules) throw new Error('ไม่มีกฎตรวจสอบสำหรับ ' + entity);
  data = data || {};
  var out = {};
  Object.keys(rules).forEach(function (f) { out[f] = checkField_(f, rules[f], data[f]); });
  if (CHECKS[entity]) CHECKS[entity](out);
  return out;
}

function checkField_(f, r, v) {
  var label = r.label || f, type = r.type || 'text';
  var blank = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  if (blank) {
    if (r.req) throw fieldError_(f, (type === 'enum' || type === 'dropdown' || type === 'ref' || type === 'date' ? 'กรุณาเลือก' : 'กรุณากรอก') + label);
    return type === 'money' || type === 'num' || type === 'int' ? 0 : type === 'bool' ? false : '';
  }
  var s = String(v).trim(), n;
  switch (type) {
    case 'text':
      if (r.max && s.length > r.max) throw fieldError_(f, label + 'ยาวเกิน ' + r.max + ' ตัวอักษร กรุณาย่อให้สั้นลง');
      if (r.pattern && !r.pattern.test(s)) throw fieldError_(f, label + 'ไม่ถูกต้อง — ' + (r.hint || 'กรุณาตรวจสอบรูปแบบ'));
      return s;
    case 'phone':
      s = s.replace(/\s+/g, '');
      if (!/^\+?[0-9-]+$/.test(s) || !/^(0[0-9]{8,9}|\+[0-9]{8,15})$/.test(s.replace(/-/g, ''))) {
        throw fieldError_(f, label + 'ต้องเป็นตัวเลข 9–10 หลักขึ้นต้นด้วย 0 เช่น 081-234-5678 หรือเบอร์ต่างประเทศขึ้นต้นด้วย +');
      }
      return s;   // text: the leading 0 is kept
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s.length > 120) throw fieldError_(f, label + 'ไม่ถูกต้อง เช่น name@example.com');
      return s.toLowerCase();
    case 'taxId':
      s = s.replace(/[\s-]/g, '');
      if (!/^[0-9]{13}$/.test(s)) throw fieldError_(f, label + 'ต้องเป็นตัวเลข 13 หลัก');
      return s;
    case 'money':
    case 'num':
    case 'int':
      n = Number(s.replace(/[,฿\s]/g, ''));
      if (!isFinite(n)) throw fieldError_(f, label + 'ต้องเป็นตัวเลข');
      if (type === 'int' && Math.floor(n) !== n) throw fieldError_(f, label + 'ต้องเป็นจำนวนเต็ม');
      if (r.min !== undefined && n < r.min) throw fieldError_(f, label + 'ต้องไม่น้อยกว่า ' + r.min);
      if (r.max !== undefined && n > r.max) throw fieldError_(f, label + 'ต้องไม่เกิน ' + r.max);
      return type === 'money' ? Math.round(n * 100) / 100 : n;
    case 'date':
      s = parseDate_(s);
      if (!s || !isRealDate_(s)) throw fieldError_(f, label + 'ไม่ถูกต้อง กรุณาเลือกวันที่ในรูปแบบ วว/ดด/ปปปป');
      return s;
    case 'time':
      if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(s)) throw fieldError_(f, label + 'ต้องอยู่ในรูปแบบ HH:mm เช่น 14:00');
      return s;
    case 'bool':
      return v === true || /^(true|1|yes|on)$/i.test(s);
    case 'enum':
      if (r.oneOf.indexOf(s) < 0) throw fieldError_(f, 'กรุณาเลือก' + label + 'จากรายการ');
      return s;
    case 'dropdown':
      if (!readTable('Dropdowns').some(function (d) { return d.group === r.group && d.code === s; })) {
        throw fieldError_(f, 'ไม่พบ' + label + ' "' + s + '" กรุณาเลือกจากรายการ หรือเพิ่มในหน้าตั้งค่า Dropdown');
      }
      return s;
    case 'ref':
      if (!findById(r.table, s)) throw fieldError_(f, 'ไม่พบ' + label + ' "' + s + '" กรุณาเลือกจากรายการ');
      return s;
    default:
      throw new Error('unknown rule type ' + type);
  }
}

function isRealDate_(iso) {
  var p = iso.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
}
/** Nights between two yyyy-MM-dd dates. */
function nightsBetween_(from, to) {
  var a = from.split('-').map(Number), b = to.split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}
