/** Drive.gs — the hotel's Drive folder tree. Chunked uploads (Upload.gs) come in step 5. */
var FOLDERS = ['Company', 'Receipts', 'Attachments', 'Attachments/RoomIncome', 'Attachments/OtherIncome',
               'Attachments/Expenses', 'Customers', 'Exports'];

/** The hotel's root folder is DRIVE_FOLDER_ID in the Command Center. A blank cell gets a new folder, written back;
 *  a folder that exists but cannot be opened is an error, never silently replaced. */
function driveRoot_() {
  if (SHOP.driveId) {
    try { return DriveApp.getFolderById(SHOP.driveId); }
    catch (e) { throw new Error('เปิดโฟลเดอร์ Drive ของโรงแรมไม่ได้ — ตรวจสิทธิ์ของ DRIVE_FOLDER_ID ใน Command Center'); }
  }
  var root = DriveApp.createFolder('Ethermorph Hotel · ' + (SHOP.name || SHOP.id));
  setShopField_(SHOP.id, 'DRIVE_FOLDER_ID', root.getId());
  SHOP.driveId = root.getId();
  FOLDERS.forEach(function (path) { folderByPath_(path); });
  return root;
}
function folderByPath_(path) {
  var cur = driveRoot_();
  path.split('/').forEach(function (part) {
    var it = cur.getFoldersByName(part);
    cur = it.hasNext() ? it.next() : cur.createFolder(part);
  });
  return cur;
}
