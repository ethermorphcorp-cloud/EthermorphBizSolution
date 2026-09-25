/** Config.gs — sheet schema, column types, packages, roles and defaults.
 *  Same CORE as the Retail Template (Template_Retail/app): one deployment serves every hotel listed in the
 *  Command Center with PACKAGE_TYPE = HOTEL (see Tenant.gs). Script Properties:
 *    COMMAND_SHEET_ID = the Command Center spreadsheet (shared with Retail)
 *    SALT_<CUS_ID>    = one password pepper per hotel, created by setupShop(); never stored in a sheet
 *  Each hotel's SHEET_ID and DRIVE_FOLDER_ID live in the Command Center, not here.
 */
var P = PropertiesService.getScriptProperties();
var TZ = 'Asia/Bangkok';

/** Every sheet, in the order Setup.gs creates them. The first column is the primary key (except AuditLog).
 *  Every cell is stored as text (format '@'): phone numbers, tax ids and room numbers keep their leading zeros and
 *  dates stay yyyy-MM-dd. Database.gs turns NUM_COLS / BOOL_COLS back into numbers and booleans on read.
 *  Writes follow the header row of the sheet, so a column added here is appended by createSchema() and old rows
 *  keep working. */
var SCHEMA = {
  Config:       ['key','value'],
  Company:      ['key','value'],
  Users:        ['userId','username','fullName','email','phone','role','status','passwordHash','salt','lastLoginAt',
                 'createdAt','updatedAt'],
  Dropdowns:    ['key','group','code','label','sort','active'],
  Customers:    ['customerId','name','type','nationality','phone','email','taxId','address','note','createdAt','updatedAt'],
  RoomTypes:    ['code','name','price','weekendPrice','maxGuests','bedType','amenities','active'],
  Rooms:        ['roomNo','typeCode','floor','status','note','offUntil'],
  RoomIncome:   ['docNo','customerId','guestName','phone','typeCode','roomNo','checkIn','checkOut','nights','guests',
                 'rate','discount','total','vatAmount','channel','payMethod','payStatus','deposit','note',
                 'createdBy','createdAt','updatedAt'],
  OtherIncome:  ['docNo','date','category','description','roomNo','bookingNo','qty','unitPrice','amount','payMethod',
                 'createdBy','createdAt','updatedAt'],
  Expenses:     ['docNo','date','category','description','vendor','payMethod','amount','createdBy','createdAt','updatedAt'],
  Receipts:     ['docNo','date','customerId','bookingNo','subtotal','discount','netBeforeVat','vat','total','payMethod',
                 'status','issuedBy','createdAt'],
  ReceiptItems: ['itemId','docNo','line','description','detail','qty','unit','unitPrice','amount','refDocNo'],
  Attachments:  ['fileId','docNo','fileName','mime','size','driveUrl','uploadedBy','uploadedAt'],
  Sequences:    ['key','prefix','yyyymm','last'],
  AuditLog:     ['at','user','action','entity','docNo','detail']
};

/** key/value sheets: readKV / writeKV. */
var KV_TABLES = {Config: 1, Company: 1};
/** Tables whose first column is not unique (never updated or deleted by key). */
var NO_PK = {AuditLog: 1};

var NUM_COLS = {price:1, weekendPrice:1, maxGuests:1, sort:1, floor:1, nights:1, guests:1, rate:1, discount:1, total:1,
                vatAmount:1, deposit:1, qty:1, unitPrice:1, amount:1, subtotal:1, netBeforeVat:1, vat:1, line:1,
                size:1, last:1};
var BOOL_COLS = {active:1};
/** key/value entries read back as numbers; 'TRUE'/'FALSE' always become booleans. */
var KV_NUM = {vatRate:1, sessionMin:1};

/** Feature flags per package (PACKAGE_TIER in the Command Center, plus FEATURE_OVERRIDES).
 *  Hotel tiers are not priced yet: STANDARD has everything. An unknown tier falls back to the first one here. */
var FEATURES = {
  STANDARD: {roles:true, dashboard:true, roomIncome:true, booking:true, otherIncome:true, expense:true, receipt:true,
             report:true, upload:true}
};

var ROLES = ['Owner', 'Admin', 'Accounting', 'FrontDesk'];
/** Permissions are 'area.verb'; 'area.*' allows every verb, '*' everything. Keep in sync with the client. */
var PERMS = {
  Owner:      ['*'],
  Admin:      ['*'],
  Accounting: ['dashboard.view', 'customer.view', 'customer.export', 'room.view', 'roomIncome.view', 'booking.view',
               'otherIncome.*', 'expense.*', 'receipt.*', 'report.view', 'upload.*'],
  FrontDesk:  ['dashboard.view', 'customer.view', 'customer.edit', 'room.view', 'room.status', 'roomIncome.view',
               'roomIncome.edit', 'booking.view', 'otherIncome.view', 'otherIncome.edit', 'receipt.view',
               'receipt.create', 'upload.*']
};

/** Document prefixes: PREFIX-yyyyMM-#### (DocNumber.gs). Customers use CU-#### (not per month). */
var DOC_PREFIX = {roomIncome: 'BK', otherIncome: 'OI', expense: 'EX', receipt: 'RC'};

var ROOM_STATUS = ['free', 'occ', 'clean', 'off'];
var PAY_STATUS = ['paid', 'dep', 'due', 'cxl'];
var USER_STATUS = ['active', 'suspended'];
var VAT_MODES = ['included', 'excluded'];

/** Password a new user starts with, and the one "reset password" sets. Change it at the first sign-in. */
var DEFAULT_PASSWORD = '1234';

/** Dropdown groups (Settings ▸ Dropdown). Every new hotel starts with these options. */
var DROPDOWN_GROUPS = {
  channel:  'ช่องทางการจอง',
  pay:      'วิธีชำระเงิน',
  expcat:   'หมวดหมู่ค่าใช้จ่าย',
  othercat: 'ประเภทรายได้อื่น',
  custtype: 'ประเภทลูกค้า',
  unit:     'หน่วยนับ'
};
var DEFAULT_DROPDOWNS = {
  channel:  [['WALKIN', 'Walk-in'], ['PHONE', 'โทรศัพท์'], ['LINE', 'LINE Official'], ['BKG', 'Booking.com'],
             ['AGD', 'Agoda'], ['EXP', 'Expedia']],
  pay:      [['CASH', 'เงินสด'], ['TRANSFER', 'โอนเงิน'], ['CARD', 'บัตรเครดิต'], ['QR', 'QR PromptPay'],
             ['CREDIT', 'วางบิล (บริษัท)']],
  expcat:   [['SALARY', 'เงินเดือนพนักงาน'], ['UTIL', 'ค่าน้ำ-ค่าไฟ'], ['FNB', 'วัตถุดิบอาหารและเครื่องดื่ม'],
             ['AMEN', 'ของใช้ในห้องพัก (Amenities)'], ['MAINT', 'ซ่อมบำรุง'], ['OTA', 'ค่าคอมมิชชั่น OTA'],
             ['MKT', 'การตลาดและโฆษณา'], ['TAX', 'ภาษีและค่าธรรมเนียม'], ['OTHER', 'อื่นๆ']],
  othercat: [['MINIBAR', 'Minibar'], ['FOOD', 'ห้องอาหาร'], ['LAUNDRY', 'ซักรีด'], ['SHUTTLE', 'รถรับส่งสนามบิน'],
             ['LATE', 'Late check-out'], ['EXTRABED', 'เตียงเสริม'], ['OTHER', 'อื่นๆ']],
  custtype: [['GEN', 'ทั่วไป'], ['VIP', 'VIP'], ['CORP', 'บริษัท/องค์กร'], ['OTA', 'OTA']],
  unit:     [['NIGHT', 'คืน'], ['PCS', 'ชิ้น'], ['TIME', 'ครั้ง'], ['SET', 'ชุด'], ['TRIP', 'เที่ยว']]
};

/** Where each dropdown group is used (Settings ▸ Dropdown shows it under the title). */
var DROPDOWN_HINTS = {
  channel: 'ใช้ในหน้าบันทึกรายได้ห้องพัก', pay: 'ใช้ในรายได้ รายจ่าย และใบเสร็จ',
  expcat: 'ใช้ในหน้าบันทึกรายจ่ายและรายงานค่าใช้จ่าย', othercat: 'ใช้ในหน้าบันทึกรายได้อื่นๆ',
  custtype: 'ใช้ในข้อมูลลูกค้า', unit: 'ใช้ในรายได้อื่นและใบเสร็จ'
};
/** Columns that store each group's codes: an option used there is deactivated instead of deleted. */
var DROPDOWN_USAGE = {
  channel: [['RoomIncome', 'channel']],
  pay: [['RoomIncome', 'payMethod'], ['OtherIncome', 'payMethod'], ['Expenses', 'payMethod'], ['Receipts', 'payMethod']],
  expcat: [['Expenses', 'category']],
  othercat: [['OtherIncome', 'category']],
  custtype: [['Customers', 'type']],
  unit: [['ReceiptItems', 'unit']]
};

/** Config sheet defaults for a new hotel. */
var DEFAULT_CONFIG = {sessionMin: 30, dateFormat: 'dd/MM/yyyy', timeFormat: 'HH:mm'};
/** Company sheet defaults for a new hotel (hotelName comes from CUS_NAME). */
var DEFAULT_COMPANY = {
  companyName: '', hotelName: '', taxId: '', branch: 'สำนักงานใหญ่', address: '', phone: '', email: '', website: '',
  logoFileId: '', vatRate: 7, vatMode: 'included', receiptPattern: 'RC-{YYYYMM}-{####}', checkInTime: '14:00',
  checkOutTime: '12:00', currency: 'THB'
};
