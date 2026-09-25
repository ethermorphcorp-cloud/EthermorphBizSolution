# Sheet schema

ที่มาจริงคือ `SCHEMA` ใน `backend/Config.gs` — เอกสารนี้อธิบายเพิ่ม ถ้าไม่ตรงกันให้เชื่อโค้ด

ทุกชีต: แถว 1 เป็น header, ทุกคอลัมน์ format เป็นข้อความ (`@`), คอลัมน์แรกเป็น primary key (ยกเว้น `AuditLog`)
ตัวเลข (`NUM_COLS`) และ `active` (`BOOL_COLS`) ถูกแปลงกลับตอนอ่าน · วันที่ `yyyy-MM-dd` · เวลาบันทึก `yyyy-MM-ddTHH:mm:ss` (Asia/Bangkok)

| Sheet | คอลัมน์ | หมายเหตุ |
|---|---|---|
| Config | key, value | sessionMin, dateFormat, timeFormat |
| Company | key, value | companyName, hotelName, taxId, branch, address, phone, email, website, logoFileId, vatRate, vatMode, receiptPattern, checkInTime, checkOutTime, currency |
| Users | userId, username, fullName, email, phone, role, status, passwordHash, salt, lastLoginAt, createdAt, updatedAt | userId `USR-###` · role Owner/Admin/Accounting/FrontDesk · status active/suspended |
| Dropdowns | key, group, code, label, sort, active | key = `group.code` · group channel/pay/expcat/othercat/custtype/unit · ถูกใช้แล้วให้ปิด (`active`) แทนลบ |
| Customers | customerId, name, type, nationality, phone, email, taxId, address, note, createdAt, updatedAt | customerId `CU-####` · type = code ของ custtype |
| RoomTypes | code, name, price, weekendPrice, maxGuests, bedType, amenities, active | amenities คั่นด้วย `,` |
| Rooms | roomNo, typeCode, floor, status, note | status free/occ/clean/off |
| RoomIncome | docNo, customerId, guestName, phone, typeCode, roomNo, checkIn, checkOut, nights, guests, rate, discount, total, vatAmount, channel, payMethod, payStatus, deposit, note, createdBy, createdAt, updatedAt | docNo `BK-yyyyMM-####` · payStatus paid/dep/due/cxl |
| OtherIncome | docNo, date, category, description, roomNo, bookingNo, qty, unitPrice, amount, payMethod, createdBy, createdAt, updatedAt | docNo `OI-…` · category = code ของ othercat |
| Expenses | docNo, date, category, description, vendor, payMethod, amount, createdBy, createdAt, updatedAt | docNo `EX-…` · category = code ของ expcat |
| Receipts | docNo, date, customerId, bookingNo, subtotal, discount, netBeforeVat, vat, total, payMethod, status, issuedBy, createdAt | docNo `RC-…` · ยกเลิกด้วย status ไม่ลบ |
| ReceiptItems | itemId, docNo, line, description, detail, qty, unit, unitPrice, amount, refDocNo | itemId = `docNo-line` |
| Attachments | fileId, docNo, fileName, mime, size, driveUrl, uploadedBy, uploadedAt | |
| Sequences | key, prefix, yyyymm, last | key = `PREFIX-yyyyMM` · แก้ด้วยมือเฉพาะเมื่อจำเป็น แล้วระวังเลขซ้ำ |
| AuditLog | at, user, action, entity, docNo, detail | detail เป็น JSON |

## ต่างจาก data model ใน CLAUDE.md ข้อ 5

- เพิ่ม primary key สังเคราะห์: `Dropdowns.key`, `Sequences.key`, `ReceiptItems.itemId` (Repository อ้างอิงแถวด้วยคอลัมน์แรก)
- เพิ่ม `createdAt`/`updatedAt` ใน Users, `updatedAt` ใน OtherIncome และ Expenses, `status`/`createdAt` ใน Receipts
- `Config` ไม่เก็บ MODE / package / feature flags — อยู่ใน Command Center
- ทุกคอลัมน์เป็นข้อความ (ไม่ใช่เฉพาะคอลัมน์ `*`) ตาม Retail Template

## Command Center (ใช้ร่วมกับ Retail)

แท็บ `Customers`: CUS_ID, CUS_NAME, PACKAGE_TYPE (`HOTEL`), PACKAGE_TIER (`STANDARD`), STATUS (ACTIVE/TRIAL/DEMO/SUSPENDED/CANCELLED),
DEMO_MODE, SHEET_ID, DRIVE_FOLDER_ID, OWNER_EMAIL, START_DATE, EXPIRES_AT, FEATURE_OVERRIDES (JSON), APP_URL, CONTACT_NAME,
CONTACT_PHONE, LAST_SEEN, REMARK, CREATED_AT, UPDATED_AT — โรงแรมสาธิตคือแถว `DEMO-HOTEL`
