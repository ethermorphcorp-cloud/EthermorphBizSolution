/** Upload.gs — resumable chunked upload to Drive, and the Attachments of a document.
 *  The browser sends 2 MB slices (base64); the server passes each to a Drive resumable-upload session
 *  (Drive API v3, uploadType=resumable), so no file is ever held whole in memory or in the cache.
 *    upload.init(meta)                      → {uploadId, chunkSize, offset: 0}     session URI kept in the cache (6 h)
 *    upload.append(uploadId, offset, data)  → {offset} while more is needed, {done, fileId} after the last slice
 *    upload.status(uploadId)                → {offset} — asks Drive how much it holds: resume after a dropped call
 *    upload.finalize(uploadIds, docNo)      → attaches finished uploads to a saved document (Attachments rows)
 *    upload.discard(uploadIds)              → bins finished uploads the user abandoned (form closed without saving)
 *  A slice is a multiple of 256 KB (Drive's rule) except the last. Max 50 MB per file. Demo hotels are refused
 *  (noDemo in Api.gs) — nothing reaches Drive from a demo session. */
var UPLOAD_CHUNK = 2 * 1024 * 1024;
var UPLOAD_MAX = 50 * 1024 * 1024;
var UPLOAD_TTL = 21600;
var UPLOAD_TYPES = /^(image\/(png|jpeg|gif|webp|heic|heif)|application\/pdf|text\/(plain|csv)|video\/(mp4|quicktime)|application\/(zip|msword|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)))$/;
var UPLOAD_FOLDERS = {RoomIncome: 'Attachments/RoomIncome', OtherIncome: 'Attachments/OtherIncome', Expenses: 'Attachments/Expenses'};
var DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,size';

function uploadState_(id, user) {
  var raw = cache_().get('upl_' + id);
  if (!raw) throw appError_('UPLOAD_EXPIRED', 'การอัปโหลดนี้หมดอายุแล้ว (เกิน 6 ชั่วโมง) กรุณาเลือกไฟล์ใหม่อีกครั้ง');
  var s = JSON.parse(raw);
  if (s.user !== user.userId) throw appError_('FORBIDDEN', 'การอัปโหลดนี้เป็นของผู้ใช้อื่น');
  return s;
}
function uploadSave_(s) { cache_().put('upl_' + s.id, JSON.stringify(s), UPLOAD_TTL); }
function header_ci_(headers, name) {
  for (var k in headers) if (k.toLowerCase() === name.toLowerCase()) return headers[k];
  return '';
}
/** Drive answers 308 + "Range: bytes=0-N" while incomplete → the next offset is N + 1 (0 when it holds nothing). */
function driveOffset_(res) {
  var m = String(header_ci_(res.getHeaders(), 'Range')).match(/bytes=0-(\d+)/);
  return m ? Number(m[1]) + 1 : 0;
}

var UploadService = {
  init: function (user, m) {
    m = m || {};
    var name = String(m.fileName || '').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 180);
    var size = Number(m.size), mime = String(m.mime || 'application/octet-stream').toLowerCase();
    if (!name) throw appError_('VALIDATION', 'ไม่พบชื่อไฟล์ กรุณาเลือกไฟล์ใหม่', 'file');
    if (!(size > 0)) throw appError_('VALIDATION', 'ไฟล์ว่างเปล่า กรุณาเลือกไฟล์อื่น', 'file');
    if (size > UPLOAD_MAX) throw appError_('VALIDATION', 'ไฟล์ ' + name + ' ใหญ่เกิน 50 MB กรุณาย่อขนาดหรือแบ่งไฟล์', 'file');
    if (!UPLOAD_TYPES.test(mime)) throw appError_('VALIDATION', 'ไม่รองรับไฟล์ประเภทนี้ — ใช้รูปภาพ, PDF, Excel, Word, CSV หรือวิดีโอ MP4', 'file');
    var entity = UPLOAD_FOLDERS[m.entity] ? m.entity : 'Expenses';
    var folder = folderByPath_(UPLOAD_FOLDERS[entity]);
    var res = UrlFetchApp.fetch(DRIVE_UPLOAD_URL, {
      method: 'post', contentType: 'application/json; charset=UTF-8', muteHttpExceptions: true,
      headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(size)},
      payload: JSON.stringify({name: name, mimeType: mime, parents: [folder.getId()]})
    });
    var uri = header_ci_(res.getHeaders(), 'Location');
    if (res.getResponseCode() !== 200 || !uri) throw new Error('Drive ไม่รับการอัปโหลด (' + res.getResponseCode() + ')');
    var s = {id: Utilities.getUuid(), uri: uri, user: user.userId, fileName: name, mime: mime, size: size, entity: entity,
             docNo: String(m.docNo || ''), offset: 0, fileId: '', started: nowISO_()};
    uploadSave_(s);
    return {uploadId: s.id, chunkSize: UPLOAD_CHUNK, offset: 0};
  },

  append: function (user, id, offset, data) {
    var s = uploadState_(id, user);
    if (s.fileId) return {done: true, fileId: s.fileId, offset: s.size};
    offset = Number(offset);
    if (offset !== s.offset) return {offset: s.offset, resync: true};   // a slice was lost or sent twice: the browser restarts from here
    var bytes = Utilities.base64Decode(String(data || ''));
    var end = offset + bytes.length;
    if (!bytes.length || end > s.size || (end < s.size && bytes.length % (256 * 1024))) {
      throw appError_('VALIDATION', 'ข้อมูลส่วนนี้ไม่ถูกต้อง กรุณาเลือกไฟล์ใหม่อีกครั้ง');
    }
    var res = UrlFetchApp.fetch(s.uri, {
      method: 'put', contentType: s.mime, payload: bytes, muteHttpExceptions: true,
      headers: {'Content-Range': 'bytes ' + offset + '-' + (end - 1) + '/' + s.size}
    });
    var code = res.getResponseCode();
    if (code === 308) { s.offset = driveOffset_(res); uploadSave_(s); return {offset: s.offset}; }
    if (code === 200 || code === 201) {
      s.fileId = JSON.parse(res.getContentText()).id;
      s.offset = s.size;
      uploadSave_(s);
      if (s.docNo) UploadService.finalize(user, [id], s.docNo);   // an existing document: attach right away
      return {done: true, fileId: s.fileId, offset: s.size};
    }
    if (code === 404 || code === 410) throw appError_('UPLOAD_EXPIRED', 'Drive ยกเลิกการอัปโหลดนี้แล้ว กรุณาเลือกไฟล์ใหม่อีกครั้ง');
    throw appError_('UPLOAD_RETRY', 'ส่งไฟล์ไม่สำเร็จ (' + code + ') กด ทำต่อ เพื่ออัปโหลดต่อจากส่วนล่าสุด');
  },

  /** Resume: how many bytes Drive already holds. */
  status: function (user, id) {
    var s = uploadState_(id, user);
    if (s.fileId) return {done: true, fileId: s.fileId, offset: s.size, fileName: s.fileName, size: s.size};
    var res = UrlFetchApp.fetch(s.uri, {method: 'put', payload: '', muteHttpExceptions: true, headers: {'Content-Range': 'bytes */' + s.size}});
    var code = res.getResponseCode();
    if (code === 200 || code === 201) { s.fileId = JSON.parse(res.getContentText()).id; s.offset = s.size; uploadSave_(s); return {done: true, fileId: s.fileId, offset: s.size}; }
    if (code !== 308) throw appError_('UPLOAD_EXPIRED', 'Drive ยกเลิกการอัปโหลดนี้แล้ว กรุณาเลือกไฟล์ใหม่อีกครั้ง');
    s.offset = driveOffset_(res);
    uploadSave_(s);
    return {offset: s.offset, fileName: s.fileName, size: s.size};
  },

  /** Attachments rows for finished uploads of this user, on a document that exists. */
  finalize: function (user, ids, docNo) {
    var table = docTable_(docNo);
    if (!table || !findById(table, docNo)) throw appError_('NOT_FOUND', 'ไม่พบเอกสาร ' + docNo + ' ที่จะแนบไฟล์');
    var have = {};
    readTable('Attachments').forEach(function (a) { have[a.fileId] = 1; });
    var rows = (ids || []).map(function (id) { return uploadState_(id, user); }).filter(function (s) { return s.fileId && !have[s.fileId]; })
      .map(function (s) {
        var url = '';
        try { url = DriveApp.getFileById(s.fileId).getUrl(); } catch (e) {}
        return {fileId: s.fileId, docNo: docNo, fileName: s.fileName, mime: s.mime, size: s.size, driveUrl: url, uploadedBy: user.username, uploadedAt: nowISO_()};
      });
    if (!rows.length) return {attached: 0};
    withLock_(function () {
      insertRows('Attachments', rows);
      audit('UPLOAD', table, docNo, rows.map(function (r) { return r.fileName; }));
    });
    return {attached: rows.length, files: rows};
  },

  /** Finished uploads that never got a document go to the Drive bin (kept 30 days there). */
  discard: function (user, ids) {
    var n = 0, linked = {};
    readTable('Attachments').forEach(function (a) { linked[a.fileId] = 1; });
    (ids || []).forEach(function (id) {
      var raw = cache_().get('upl_' + id);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s.user !== user.userId || !s.fileId || linked[s.fileId]) return;
      try { DriveApp.getFileById(s.fileId).setTrashed(true); n++; } catch (e) {}
      cache_().remove('upl_' + id);
    });
    return {discarded: n};
  }
};

var AttachmentService = {
  list: function (docNo) {
    return readTable('Attachments').filter(function (a) { return a.docNo === docNo; })
      .sort(function (a, b) { return a.uploadedAt < b.uploadedAt ? -1 : 1; });
  },
  /** Removes the row and bins the Drive file. */
  remove: function (user, fileId) {
    return withLock_(function () {
      var a = findById('Attachments', fileId);
      if (!a) throw appError_('NOT_FOUND', 'ไม่พบไฟล์แนบนี้ อาจถูกลบไปแล้ว');
      deleteRow('Attachments', fileId);
      try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) {}
      audit('DELETE', 'Attachments', a.docNo, {file: a.fileName});
      return true;
    });
  },
  /** The file itself for any signed-in user (Drive files stay private to the hotel's account). ≤ 10 MB. */
  download: function (fileId) {
    var a = findById('Attachments', fileId);
    if (!a) throw appError_('NOT_FOUND', 'ไม่พบไฟล์แนบนี้ อาจถูกลบไปแล้ว');
    if (SHOP && SHOP.demo) throw appError_('DEMO_READONLY', 'ไฟล์ในโหมดทดลองเป็นรายการตัวอย่าง ไม่มีไฟล์จริงให้ดาวน์โหลด');
    if (a.size > 10 * 1024 * 1024) throw appError_('TOO_LARGE', 'ไฟล์ใหญ่เกิน 10 MB ให้เปิดจาก Google Drive ของโรงแรม', 'file');
    var blob = DriveApp.getFileById(fileId).getBlob();
    return {fileName: a.fileName, mime: a.mime, data: Utilities.base64Encode(blob.getBytes())};
  }
};

/** Which table a document number lives in. */
function docTable_(docNo) {
  var p = String(docNo).split('-')[0];
  return {BK: 'RoomIncome', OI: 'OtherIncome', EX: 'Expenses'}[p] || '';
}
/** Attachment count per document (list screens). */
function attachmentCounts_() {
  var n = {};
  readTable('Attachments').forEach(function (a) { n[a.docNo] = (n[a.docNo] || 0) + 1; });
  return n;
}
/** A deleted document takes its attachments with it (rows removed, files to the bin). Call inside the lock. */
function dropAttachments_(docNo) {
  readTable('Attachments').filter(function (a) { return a.docNo === docNo; }).forEach(function (a) {
    deleteRow('Attachments', a.fileId);
    try { DriveApp.getFileById(a.fileId).setTrashed(true); } catch (e) {}
  });
}

/** Attachments follow their document's permissions: viewing a booking's slip needs roomIncome.view, and so on. */
function attachmentNeed_(user, docNo, verb) {
  var area = {RoomIncome: 'roomIncome', OtherIncome: 'otherIncome', Expenses: 'expense'}[docTable_(docNo)];
  if (!area) throw appError_('NOT_FOUND', 'ไม่พบไฟล์แนบนี้ อาจถูกลบไปแล้ว');
  need_(user, area + '.' + verb);
}
