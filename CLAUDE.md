# Ethermorph Hotel Template — Handoff สำหรับ Claude Code

เอกสารนี้สรุปงานออกแบบจาก Cowork เพื่อใช้พัฒนาต่อใน Claude Code
คัดลอกไฟล์นี้ไปไว้ที่ root ของ repo ในชื่อ `CLAUDE.md` (หรืออ้างอิงจากไฟล์นั้น) เพื่อให้ Claude Code อ่านทุกครั้งที่เริ่ม session

- Design canvas (ต้นฉบับ): https://claude.ai/code/artifact/0ea15473-6349-4530-a054-83be968b2038
- Design system: Ethermorph Retail (Retail Template) — `design/tokens.json`
- ไฟล์ออกแบบรายหน้าจอ: `design/*.dc.html` (HTML + inline style ใช้เป็น reference ของ layout, สี, ระยะ และข้อความ ไม่ใช่โค้ด production)

---

## 1. ภาพรวมระบบ

Web app บริหารรายได้-รายจ่ายโรงแรมสำหรับ SME ไทย
- Stack: **Google Apps Script** (HtmlService SPA) + **Google Sheets** (ฐานข้อมูล) + **Google Drive** (ไฟล์แนบ)
- Architecture: CORE เดียวกับ Retail Template — Client → Router → Service → Repository → Sheets
- ภาษา UI: ไทย, คำธุรกิจอังกฤษที่ SME ใช้ (Dashboard, VAT, OTA, Minibar)
- Font: Noto Sans Thai (Google Fonts 300–700) ทั้งระบบ
- Responsive: desktop (sidebar) / mobile < 992px (drawer + bottom nav + ตารางแบบการ์ดซ้อน)

> โครงสร้างไฟล์ (ข้อ 4) เทียบกับ source จริงของ Retail Template (`../Template_Retail/app`) แล้ว และใช้ pattern เดียวกัน:
> web app ตัวเดียวให้บริการทุกโรงแรมผ่าน Command Center (แถว `PACKAGE_TYPE = HOTEL`), `Database.gs` เป็นไฟล์เดียวที่แตะชีต,
> demo เก็บการแก้ไขใน sandbox ของ session แทนการบล็อกการเขียน — `HANDOFF.md` คือฉบับเดิมก่อนปรับ

## 2. หน้าจอ (map กับไฟล์ออกแบบ)

| # | หน้าจอ | ไฟล์ออกแบบ | จุดสำคัญ |
|---|---|---|---|
| 1 | Login | `Login.dc.html` | แสดง/ซ่อนรหัสผ่าน, จดจำการเข้าสู่ระบบ, ปุ่ม Demo Mode |
| 2.1 | ตั้งค่าทั่วไป | `Settings.dc.html` | แท็บย่อย: Dropdown (กลุ่มตัวเลือก + ลากเรียง + ปิดใช้งานแทนลบถ้าถูกใช้แล้ว) / ข้อมูลบริษัท / ผู้ใช้งาน |
| 2.2 | ข้อมูลลูกค้า | `Customers.dc.html` | ตาราง + filter เฉพาะค่าที่มีข้อมูล + row action dropdown (portal) + นำเข้า/ส่งออก Excel |
| 2.3 | ประเภทห้องพัก | `RoomTypes.dc.html` | การ์ดประเภทห้อง (ราคาปกติ/ศุกร์-เสาร์, ความจุ, สิ่งอำนวยความสะดวก, occupancy) + ตารางห้อง + สถานะห้อง |
| 3.1 | รายได้ห้องพัก (ตาราง) | `Income-Rooms.dc.html` | แท็บ ห้องพัก/อื่นๆ/ตารางจอง, สลับ ตาราง/ปฏิทิน, KPI strip, dropdown เดือน (เฉพาะเดือนที่มีข้อมูล), แถวรวม |
| 3 | รายได้ (ปฏิทิน) | `Income-Calendar.dc.html` | ปฏิทินเดือน คลิกวันแล้วแสดงรายการด้านขวา (หัวข้อหน้า: "บันทึกการจองห้องพัก") |
| 3.2 | รายได้อื่นๆ | `Income-Other.dc.html` | Minibar, ห้องอาหาร, ซักรีด ฯลฯ ผูกกับ booking ได้, chip filter ตามประเภท |
| 3.3 | ตารางจองห้องพักรายวัน | `Income-Booking.dc.html` | แถว = ประเภทห้อง, เลขที่ห้อง / คอลัมน์ = D1…D14 / แถบจองแสดงชื่อ + เบอร์โทร, สีตามสถานะ, แถวสรุปห้องว่าง/อัตราเข้าพัก, คลิกช่องว่างเพื่อจอง |
| 3 | Modal เพิ่มรายได้ห้องพัก | `Income-Modal.dc.html` | combobox ลูกค้า, auto-fill เบอร์/ราคา/จำนวนคืน, validation error, สรุปยอด + VAT, chunk upload |
| 4 | บันทึกรายจ่าย | `Expenses.dc.html` | chip filter หมวด (มีจำนวน), เอกสารแนบ, empty state |
| 5 | ใบเสร็จรับเงิน | `Receipt.dc.html` | A4 (794×1123) ต้นฉบับ, จำนวนเงินเป็นตัวอักษรไทย, VAT 7% รวมใน |
| 6 | รายงาน | `Reports.dc.html` | 3 แท็บ: รายได้ vs ค่าใช้จ่ายรายเดือน (แกนขวา % กำไร) / รายได้รายประเภทห้อง / ค่าใช้จ่ายรายหมวด (รายเดือน ↔ รายวัน) |
| 7 | Dashboard | `Main.dc.html` | KPI 4 ตัว, กราฟรายได้ vs ค่าใช้จ่าย + แกนขวา % กำไร, donut ประเภทห้อง, การเข้าพักวันนี้, สถานะห้อง, ค่าใช้จ่ายตามหมวด |
| M | Mobile | `Mobile-Dashboard`, `Mobile-Menu`, `Mobile-Income` | bottom nav + FAB, drawer menu, ตารางแบบการ์ด |
| — | UI Kit | `Feedback.dc.html` | Swal success, Sweet confirm, Toast, Loading, Badge, validation, dropdown portal, chunk upload, pagination |
| — | Architecture | `Architecture.dc.html` | แผนภาพ Client/Server/Data + ลำดับการบันทึก |
| — | Components | `Sidebar.dc.html`, `Topbar.dc.html` | เมนูหลักและแถบบน (ใช้ซ้ำทุกหน้า) |

ยังไม่ได้ออกแบบ: หน้ารายการใบเสร็จ (อยู่ใน shell), หน้ามือถือของฟีเจอร์อื่นนอกจาก 3 หน้าด้านบน, modal เพิ่มรายจ่าย/รายได้อื่น/ลูกค้า (ใช้รูปแบบเดียวกับ `Income-Modal`)

## 3. Design tokens (สรุป — ค่าเต็มใน `design/tokens.json`)

- สี (light): bg `#f5f7f8`, surface `#ffffff`, surface-sunken `#eef2f4`, line `#e1e7ea`, control-border `#7f8c95`, ink `#14212b`, ink-muted `#55626c`, primary `#0d7068` (hover `#0a5a54`, soft `#e3f3f1`)
- สถานะ: success `#157a3a/#e5f5ea`, warning `#9a5806/#fdf1dc`, danger `#c02626/#fce9e9`, info `#2257c9/#e8effc`
- Sidebar: bg `#10232a`, ink `#b9cad1`, active `#1b3d45`, accent `#4fd1bf`
- Chart: รายได้ `#0d7068`, รายได้อื่น `#5cc2b3`, ค่าใช้จ่าย `#e0a04a`, % กำไร `#2257c9` (แกนขวา)
- Radius 6/10/14/9999 · spacing 4px grid · control-h 40px (sm 32px) · sidebar 248px · topbar 60px · bottom nav 64px
- z-index: sticky 20 < sidebar 1040 < modal 1050 < swal 1060 < **dropdown 1070** < toast 1080 < loading 1090
- Dark theme มีครบใน tokens (`prefers-color-scheme` หรือผู้ใช้เลือก)

รูปแบบข้อมูล: วันที่ `dd/MM/yyyy`, เวลา `HH:mm`, เงิน `฿1,250.00`, เลขเอกสาร monospace (`BK-202609-0001`)

## 4. โครงสร้างโปรเจกต์ที่แนะนำ (clasp)

โครงสร้างจริง (ตาม Retail Template) — ✓ = มีแล้ว

```
/
├─ CLAUDE.md / HANDOFF.md    ← ไฟล์นี้ / handoff ฉบับเดิม
├─ .clasp.json               rootDir = gas/ (ใส่ scriptId ก่อน push)
├─ appsscript.json           V8, Asia/Bangkok, web app: Execute as Me · Anyone
├─ design/                   ไฟล์ออกแบบ (.dc.html, tokens.json) ไว้อ้างอิง
├─ docs/schema.md            คอลัมน์ทุกชีต + ส่วนที่ต่างจากข้อ 5
├─ tools/                    build.js (ตรวจ + สร้าง gas/), check-htmlservice.js, smoke-test.js (fake GAS)
├─ backend/                  *.gs — Api.gs เป็นทางเข้าเดียว, Database.gs เป็นไฟล์เดียวที่แตะชีต
│  ├─ Config.gs          ✓  SCHEMA, NUM_COLS/BOOL_COLS, FEATURES, PERMS (4 บทบาท), DOC_PREFIX, dropdown ตั้งต้น
│  ├─ Tenant.gs          ✓  Command Center → SHOP (status, หมดอายุ, tier, demo), SALT_<CUS_ID>
│  ├─ Api.gs             ✓  doGet (?shop= / ?demo=1), include, api(shop, action, token, payload), ROUTES
│  ├─ Auth.gs            ✓  login/loginDemo/logout/session_, hash = SHA-256(pepper|salt|pw), ล็อก 5 ครั้ง, roles
│  ├─ Database.gs        ✓  Repository + withLock_ (LockService, ซ้อนได้) + sandbox demo + nextId_
│  ├─ MasterCache.gs     ✓  version ต่อชีต, แบ่งก้อน 30,000 ตัวอักษร (≤90KB), bundle() สำหรับ master.get
│  ├─ DocNumber.gs       ✓  nextDocNo(prefix) → PREFIX-yyyyMM-#### จากชีต Sequences
│  ├─ Validator.gs       ✓  appError_/fieldError_, RULES ต่อ entity (validation ชั้นที่ 2)
│  ├─ Audit.gs           ✓  audit(action, entity, docNo, detail)
│  ├─ Drive.gs           ✓  โฟลเดอร์ของโรงแรม (Upload.gs มาในขั้นที่ 5)
│  ├─ Setup.gs           ✓  setup(), setupShop(id), createSchema(), resetAllData()
│  ├─ Demo.gs            ✓  DemoData: master + ทุกแถวที่ดีไซน์แสดงเลขเอกสาร + ยอดรวมที่หน้าจอแสดง
│  ├─ DemoSeed.gs        ✓  seedDemoHotel(): ลูกค้า 214 ราย + ธุรกรรม เม.ย.–ก.ย. 2026 ให้ยอดตรงหน้าจอ (seed คงที่)
│  ├─ Filter.gs          ✓  filterOptions_ (ค่าที่มีข้อมูล + จำนวน), filter.options, pageOf_ (server-side paging)
│  ├─ Setting.gs         ✓  Dropdown (list พร้อมจำนวนที่ถูกใช้ / save / delete = ปิดใช้งานถ้าถูกใช้ / reorder), บริษัท, โลโก้
│  ├─ User.gs            ✓  list / save / resetPassword — ไม่ลบ (ระงับแทน), ห้ามแก้บทบาทตัวเอง, ต้องเหลือ Owner ≥ 1
│  ├─ Customer.gs        ✓  list (ค้นหา ตัวกรอง เรียง แบ่งหน้า) / get (ประวัติ) / save / delete / export / import
│  ├─ Room.gs            ✓  overview (อัตราเข้าพักเดือนนี้, ผู้เข้าพักคืนนี้) / typeSave / typeDelete / roomSave / roomDelete / roomStatus
│  ├─ RoomIncome.gs      ✓  list (KPI เดือน, เดือนที่มีข้อมูล, ตัวกรอง, แถวรวม) / get / availability / save (ห้ามจองซ้อน,
│  │                        VAT ตาม vatMode) / cancel (cxl) / delete / calendar(month) / export
│  ├─ Booking.gs         ✓  grid(from, days, typeCode) → rooms × days + bars (clip ซ้าย/ขวา) + ปิดปรับปรุง + สรุปห้องว่าง · audit.client
│  ├─ Dashboard.gs       ✓  summary(month): KPI (เทียบเดือนก่อน), 6 เดือน รายได้/ค่าใช้จ่าย/อัตรากำไร, รายได้รายหมวด,
│  │                        รายได้รายประเภทห้อง, ค่าใช้จ่ายรายหมวด
│  └─ <Service>.gs          ขั้นที่ 5+: OtherIncome, Expense, Receipt, Report, Upload
│                           — เพิ่ม route ใน ROUTES ของ Api.gs
└─ frontend/                 *.html — index.html include ส่วนอื่นตามลำดับ (ทุกไฟล์ต้องถูก include — smoke-test ตรวจ)
   ├─ index.html         ✓  BOOT จาก doGet + SweetAlert2 + include ทั้งหมด แล้วเรียก Shell.boot()
   ├─ css.html           ✓  tokens → CSS variables (light / dark ตามเครื่อง หรือ html[data-theme]) + components
   ├─ js-core.html       ✓  icons, format (fmtM/fmtD/TODAY), store, UI.* (Loading, toast, swal*, badge, openMenu portal,
   │                        combobox, openModal, pageSize, pager)
   ├─ js-validate.html   ✓  V.field / V.form / V.setErr — validation ชั้นที่ 1 (กฎเดียวกับ Validator.gs)
   ├─ js-api.html        ✓  api(action, payload, {loading, retry}) · App / Session (idle timeout) · Master (cache ตาม version)
   ├─ js-app.html        ✓  Shell: boot (app.boot), Login + Demo, sidebar ย่อได้ / drawer, topbar, bottom nav + FAB,
   │                        router go(view) + google.script.history, เปลี่ยนรหัสผ่าน, ธีม — เมนูอยู่ใน NAV
   ├─ page-stub.html     ✓  Pages._stub (เมนูที่ยังไม่ทำ)
   ├─ page-dashboard.html ✓ KPI + combo (รายได้ vs ค่าใช้จ่าย + % กำไรแกนขวา) + donut รายหมวด / ประเภทห้อง + แท่งแนวนอน
   │                        ค่าใช้จ่าย — SVG เอง, สี --viz-1..6 (ผ่าน validate_palette ทั้ง light/dark), tooltip + มุมมองตาราง
   ├─ page-settings.html ✓  แท็บ Dropdown (ลาก/ลูกศรเรียงลำดับ) · ข้อมูลบริษัท + โลโก้ · ผู้ใช้งาน
   ├─ page-customers.html ✓ ตาราง server-side + ตัวกรองจากข้อมูล + เมนูแถว (portal) + นำเข้า/ส่งออก Excel (SheetJS)
   ├─ page-roomtypes.html ✓ การ์ดประเภทห้อง + ตารางห้อง + เปลี่ยนสถานะห้อง (FrontDesk ทำได้)
   ├─ page-rooms.html    ✓  บันทึกการจองห้องพัก: view table / calendar / grid (params.view) + bookingModal_ (ค้นหาลูกค้า,
   │                        ห้องว่างตามวัน, ราคาศุกร์–เสาร์, มัดจำ, สรุป VAT) — go('rooms',{add:true | docNo})
   └─ page-*.html           ขั้นที่ 5+: Pages.<key> = {render(el, params)} ต่อเมนู + js-upload.html (ขั้นที่ 5)
```

- **Master sync:** `api()` ส่ง `_mv` (master version ของเบราว์เซอร์) ทุกครั้ง ถ้า master เปลี่ยน (จากคำขอนี้หรือผู้ใช้อื่น)
  server แนบ `master` bundle มาในคำตอบ → `Master.accept()` + `Master.onChange()` — หน้าไม่ต้องเรียก master.get เอง
- **สถานะห้อง "มีผู้เข้าพัก"** คำนวณจากการจองที่ครอบคืนนี้ (checkIn ≤ วันนี้ < checkOut, ไม่ใช่ cxl); `Rooms.status` เก็บเฉพาะ
  free / clean / off ที่คนตั้งเอง (`Room.gs` roomNow_) — Master rooms ยังเป็นค่าที่เก็บไว้ ใช้ `room.overview` เมื่อต้องการสถานะจริง
- **ตารางกว้าง:** เซลล์คอลัมน์จัดการใส่ class `act` (ติดขอบขวาเมื่อเลื่อนแนวนอน) · ตารางบนมือถือใช้ `tbl stack` + `data-label`
- **Excel:** `UI.xlsx()` โหลด SheetJS จาก CDN ตอนใช้ครั้งแรก · เขียนเบอร์โทร/เลขภาษีเป็น text cell (`xlsxSheet_`) ·
  ตอนนำเข้า เบอร์ที่ Excel ตัด 0 หน้า (8–9 หลักขึ้นต้น 6/8/9) จะเติม 0 ให้

หน้าใหม่: สร้าง `frontend/page-<key>.html` ที่ตั้ง `Pages.<key>`, include ใน index.html ก่อนบรรทัด `Shell.boot()`,
และเพิ่ม route ใน `ROUTES` ของ Api.gs — key ของหน้าคือ key ใน `NAV` (`rooms`, `other`, `expenses`, `receipts`, `reports`,
`settings`, `customers`, `roomtypes`); `go(key, {add:true})` จาก FAB หมายถึงเปิด modal เพิ่มรายการทันที

### คำสั่ง

```bash
node tools/smoke-test.js     # ทดสอบ CORE บน fake Apps Script (ต้องผ่านก่อน push)
node tools/preview-server.js # เปิดทั้งแอปในเครื่อง :8123 (?demo=1 / ?shop=HT001 owner/1234) — .claude/launch.json "hotel-preview"
node tools/build.js          # syntax + ชื่อซ้ำข้ามไฟล์ + check-htmlservice แล้วสร้าง gas/
clasp push --force           # ครั้งแรก: ใส่ scriptId ของโปรเจกต์ standalone ใน .clasp.json
```

ติดตั้งครั้งแรก: push → ตั้ง Script Property `COMMAND_SHEET_ID` (ถ้าไม่ใช้ค่าใน Tenant.gs) → รัน `setup()` ใน editor
(อนุญาตสิทธิ์) → Deploy เป็น Web app (Execute as: Me · Anyone) → รัน `setup()` อีกครั้งเพื่อเติม `APP_URL`
โรงแรมใหม่: เพิ่มแถวในแท็บ Customers ของ Command Center (`CUS_ID`, `CUS_NAME`, `PACKAGE_TYPE = HOTEL`, `PACKAGE_TIER = STANDARD`,
`STATUS`) แล้วรัน `setup()` — ได้ Spreadsheet, ชีตทั้งหมด, dropdown ตั้งต้น, owner / 1234, โฟลเดอร์ Drive และ `APP_URL`

### กติกาที่รับมาจาก Retail

- เข้าถึงชีตผ่าน `Database.gs` เท่านั้น, batch `getValues`/`setValues`, ทุกการเขียนผ่าน `withLock_` (ซ้อนกันได้: ล็อกครั้งเดียวทั้ง save)
- ทุกเซลล์เป็นข้อความ (`@`) — `NUM_COLS`/`BOOL_COLS` แปลงกลับตอนอ่าน, วันที่เก็บ `yyyy-MM-dd`, เวลา `yyyy-MM-ddTHH:mm:ss`
- เขียนตาม header จริงของชีต: เพิ่มคอลัมน์ใน `SCHEMA` แล้วรัน `setup()` คอลัมน์จะถูกต่อท้าย ไม่ลบ/ไม่สลับ
- error ที่ตั้งใจโยนต้องมี code: `appError_(code, msg, field)` / `fieldError_(field, msg)` — ข้อความบอกวิธีแก้
- **ห้ามมี `//` หรือ `/*` ในสตริงของ `frontend/*.html`** (HtmlService ตัดเป็น comment) — `build.js` ตรวจให้
- Cache key ทุกตัวผ่าน `cache_()` (ขึ้นต้นด้วยรหัสโรงแรม) · audit ทุกการสร้าง/แก้/ลบ/เข้าระบบ/พิมพ์/ส่งออก

## 5. Data model (Google Sheets — 1 sheet ต่อ 1 entity)

| Sheet | คอลัมน์หลัก |
|---|---|
| Config | key, value (sessionMin, dateFormat, timeFormat) — MODE/DEMO, package และ feature flags อยู่ใน Command Center (`STATUS`, `DEMO_MODE`, `PACKAGE_TIER`, `FEATURE_OVERRIDES`) |
| Company | companyName, hotelName, taxId*, branch, address, phone*, email, website, logoFileId, vatRate, vatMode(included/excluded), receiptPattern, checkInTime, checkOutTime, currency |
| Users | userId, username, passwordHash, salt, fullName, email, phone*, role(Admin/Owner/Accounting/FrontDesk), status(active/suspended), lastLoginAt |
| Dropdowns | group(channel/pay/expcat/othercat/custtype/unit), code, label, sort, active |
| Customers | customerId(CU-####), name, type, nationality, phone*, email, taxId*, address, note, createdAt, updatedAt |
| RoomTypes | code(SUP/DLX/FAM/STE), name, price, weekendPrice, maxGuests, bedType, amenities(csv), active |
| Rooms | roomNo*, typeCode, floor, status(free/occ/clean/off), note, offUntil (ปิดปรับปรุงถึงวันที่ — พ้นแล้วห้องกลับเป็นว่างเอง) |
| RoomIncome | docNo(BK-), customerId, guestName, phone*, typeCode, roomNo*, checkIn, checkOut, nights, guests, rate, discount, total, vatAmount, channel, payMethod, payStatus(paid/dep/due/cxl), deposit, note, createdBy, createdAt, updatedAt |
| OtherIncome | docNo(OI-), date, category, description, roomNo*, bookingNo, qty, unitPrice, amount, payMethod, createdBy, createdAt |
| Expenses | docNo(EX-), date, category, description, vendor, payMethod, amount, createdBy, createdAt |
| Receipts | docNo(RC-), date, customerId, bookingNo, subtotal, discount, netBeforeVat, vat, total, payMethod, issuedBy |
| ReceiptItems | docNo, line, description, detail, qty, unit, unitPrice, amount, refDocNo |
| Attachments | fileId, docNo, fileName, mime, size, driveUrl, uploadedBy, uploadedAt |
| Sequences | prefix, yyyymm, last |
| AuditLog | at, user, action, entity, docNo, detail(JSON) |

`*` = คอลัมน์ข้อความ ต้อง `setNumberFormat('@')` และเขียนเป็น string เสมอ (รักษาเลข 0 นำหน้า)
ตารางจองห้องพัก (`Income-Booking`) อ่านจาก RoomIncome + Rooms (สถานะ off) — ไม่ต้องมี sheet แยก

## 6. API (Router actions)

รูปแบบ response: `{ ok: boolean, data?: any, message?: string, code?: string }`

- auth: `auth.login`, `auth.logout`, `auth.me`
- master: `master.get(version)` → dropdowns, roomTypes, rooms, company (ผ่าน MasterCache)
- `filter.options(entity, field, scope)` → ค่า distinct ที่มีข้อมูลจริง + จำนวน
- `dashboard.summary(month)`
- roomIncome: `list(filters, page, pageSize)`, `get`, `save`, `delete`, `calendar(month)`
- booking: `grid(fromDate, days, typeCode?)` → rooms × days + bars (ชื่อ, เบอร์, สถานะ, clipped)
- otherIncome / expense / customer / roomType / room / user: `list`, `save`, `delete`
- receipt: `createFromBooking(bookingNo, otherIncomeNos[])`, `get(docNo)`, `list`
- report: `pl(range)`, `roomType(range)`, `expense(range, mode: 'monthly'|'daily')`
- settings: `dropdown.list/save/delete/reorder`, `company.get/save`
- upload: `init(meta)`, `append(uploadId, offset, chunkBase64)`, `finalize(uploadId, docNo)`

ทุก action ที่เขียนข้อมูล: Validator → `withLock(() => { nextDocNo(); repo.write(); audit(); })` → `MasterCache.bump()` เมื่อเป็น master

## 7. กติกาที่ต้องทำตาม (จาก requirement)

1. **Feedback**: `showLoading()` ทุกครั้งที่เรียก server · SweetAlert2 สำหรับบันทึกสำเร็จ (อ้างเลขเอกสาร) และยืนยันการลบ · Toast สำหรับผลเล็กๆ · Modal สำหรับเพิ่ม/แก้ไข · Badge แสดงสถานะ/ประเภทเอกสาร (มีข้อความเสมอ ไม่ใช้สีอย่างเดียว)
2. **Leading zero**: `input type="tel"`, ส่งเป็น string, คอลัมน์ Sheet เป็น Plain text
3. **LockService** ครอบทุกการเขียนและการออกเลขเอกสาร
4. **Resumable chunk upload**: ส่วนละ 2MB, เก็บ offset, resume ได้เมื่อหลุด, ไฟล์สูงสุด 50MB
5. **Filter เฉพาะที่มีข้อมูล**: ตัวเลือกใน dropdown/chip มาจาก `filter.options` พร้อมจำนวน
6. **Dropdown กลาง (portal)**: สร้างครั้งเดียว วางใต้ `<body>` z-index 1070 คำนวณตำแหน่งจากปุ่ม ไม่โดนตาราง/การ์ดที่ overflow ตัด
7. **Toggle menu**: desktop ย่อ sidebar เหลือไอคอน, mobile เป็น drawer
8. **MasterCache**: อ่าน master จาก cache ก่อน sheet, ล้างเมื่อแก้ไข
9. **Demo mode**: เข้าจากปุ่มหน้า Login (`auth.demo`) หรือ `?demo=1` (= โรงแรม `DEMO-HOTEL`), แสดง Banner + badge DEMO, ไม่มีอะไรถูกเขียนลงชีต — การบันทึกของผู้ทดลองเก็บใน sandbox ของ session (หายเมื่อออกจากระบบหรือครบ 6 ชม.), route ที่มี `noDemo` (Drive) ถูกปฏิเสธ, ข้อมูลตั้งต้นจาก `Demo.gs`
10. **Validation 3 ชั้น**: หน้าจอ (ใต้ช่อง) → server (Validator) → repository (unique/format)
11. **Pagination**: `pageSize = floor((cardHeight − header − footer) / rowHeight)` แล้วขอแบบ server-side
12. ข้อความ UI: ปุ่มเป็นคำกริยา (บันทึก, ยกเลิก), หัวข้อเป็นคำนาม, error บอกวิธีแก้, ไม่มี emoji/คำลงท้าย ครับ/ค่ะ

## 8. ลำดับการพัฒนาที่แนะนำ

1. Scaffold clasp + CORE (Code/Router/Auth/Lock/MasterCache/Sequence/Repository) + สร้าง Sheets อัตโนมัติ (`setup()`)
2. Client shell: index/css (tokens)/js-core/js-api + Login + Demo mode
3. ตั้งค่า: Dropdowns, Company, Users, Customers, RoomTypes/Rooms
4. รายได้ห้องพัก: list + modal + calendar + ตารางจองรายวัน
5. รายได้อื่นๆ, รายจ่าย, chunk upload
6. ใบเสร็จ (สร้างจาก booking + พิมพ์ A4)
7. รายงาน 3 แบบ + Dashboard
8. Mobile layout, dark theme, ทดสอบ LockService ด้วยการบันทึกพร้อมกัน

## 9. ข้อมูลตัวอย่าง (Demo)

โรงแรมสมมติ "โรงแรมสายธาร" 12 ห้อง (SUP 101–104 ฿1,200 · DLX 201–204 ฿1,800 · FAM 301–302 ฿2,600 · STE 401–402 ฿3,900)
ก.ย. 2026: รายได้ ฿486,250 (ห้องพัก ฿402,650 + อื่นๆ ฿83,600), ค่าใช้จ่าย ฿172,840, กำไร ฿313,410 (64.5%), occupancy 78.5%
ชุดข้อมูลเต็มอยู่ใน `renderVals()` ของไฟล์ `design/*.dc.html` — ใช้สร้าง `Demo.gs` ได้ตรงกับหน้าจอ
