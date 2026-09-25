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

> หมายเหตุ: โครงสร้างไฟล์ด้านล่างอ้างอิงจาก README ของ Ethermorph Retail design system ยังไม่ได้เทียบกับ source code จริงของ Retail Template — ถ้ามี repo ของ Retail ให้ Claude Code อ่านและปรับชื่อไฟล์/pattern ให้ตรงก่อนเริ่ม

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

```
/
├─ CLAUDE.md                 ← สำเนาของไฟล์นี้
├─ .clasp.json / appsscript.json
├─ design/                   ← ไฟล์ออกแบบ (.dc.html, tokens.json) ไว้อ้างอิง
└─ src/
   ├─ server/
   │  ├─ Code.gs            doGet(), include()
   │  ├─ Router.gs          api(action, payload) → service; ตรวจ session/role; บล็อกการเขียนใน Demo
   │  ├─ Auth.gs            login, hash+salt, session token (CacheService), roles
   │  ├─ Lock.gs            withLock(fn) = LockService.getScriptLock().waitLock(30000)
   │  ├─ MasterCache.gs     CacheService แบ่งก้อน ≤90KB, key มี version, bump เมื่อ master เปลี่ยน
   │  ├─ Sequence.gs        nextDocNo(prefix) → PREFIX-YYYYMM-#### (เรียกภายใน withLock)
   │  ├─ Validator.gs       schema ต่อ entity (validation ชั้นที่ 2)
   │  ├─ Repository.gs      อ่าน/เขียน Sheet, คอลัมน์ข้อความตั้ง '@' (ชั้นที่ 3)
   │  ├─ Upload.gs          initUpload / appendChunk / finalize → Drive
   │  ├─ Demo.gs            DemoData.* (ข้อมูลชุดเดียวกับในงานออกแบบ)
   │  └─ services/          Dashboard, RoomIncome, Booking, OtherIncome, Expense, Receipt,
   │                        Report, Setting, Company, User, Customer, RoomType, Room, Filter
   └─ client/
      ├─ index.html         AppShell + font + SweetAlert2
      ├─ css.html           tokens → CSS variables (light/dark) + components
      ├─ js-core.html       RetailUI: Loading, Toast, Swal, Modal, Dropdown(portal), Badge, Pagination, toggleMenu
      ├─ js-api.html        api() wrapper: showLoading → google.script.run → hideLoading, retry, Demo adapter
      ├─ js-validate.html   validation ชั้นที่ 1
      ├─ js-upload.html     chunk 2MB + resume จาก offset
      └─ page-*.html        dashboard, income-rooms, income-calendar, income-other, income-booking,
                            expense, receipt, report, settings, customer, roomtype
```

## 5. Data model (Google Sheets — 1 sheet ต่อ 1 entity)

| Sheet | คอลัมน์หลัก |
|---|---|
| Config | key, value (MODE=LIVE/DEMO, feature flags, package) |
| Company | companyName, hotelName, taxId*, branch, address, phone*, email, website, logoFileId, vatRate, vatMode(included/excluded), receiptPattern, checkInTime, checkOutTime, currency |
| Users | userId, username, passwordHash, salt, fullName, email, phone*, role(Admin/Owner/Accounting/FrontDesk), status(active/suspended), lastLoginAt |
| Dropdowns | group(channel/pay/expcat/othercat/custtype/unit), code, label, sort, active |
| Customers | customerId(CU-####), name, type, nationality, phone*, email, taxId*, address, note, createdAt, updatedAt |
| RoomTypes | code(SUP/DLX/FAM/STE), name, price, weekendPrice, maxGuests, bedType, amenities(csv), active |
| Rooms | roomNo*, typeCode, floor, status(free/occ/clean/off), note |
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
9. **Demo mode**: เข้าจากปุ่มหน้า Login หรือ `?demo=1`, แสดง Banner + badge DEMO, Router ไม่อนุญาตการเขียน, ใช้ `Demo.gs`
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
