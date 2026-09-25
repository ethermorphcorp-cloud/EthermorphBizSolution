/** Setting.gs — Settings ▸ Dropdown (option groups), ข้อมูลบริษัท and the company logo. Master data: every write
 *  bumps MasterCache, and the next api() answer carries the new master bundle to the browser. */

/** How many records use each code of a group: {code: count}. */
function dropdownUsage_(group) {
  var used = {};
  (DROPDOWN_USAGE[group] || []).forEach(function (u) {
    readTable(u[0]).forEach(function (r) { var c = r[u[1]]; if (c) used[c] = (used[c] || 0) + 1; });
  });
  return used;
}

var SettingService = {
  /** Every group with its options (sorted) and how often each is used. */
  dropdownList: function () {
    var all = readTable('Dropdowns');
    return Object.keys(DROPDOWN_GROUPS).map(function (g) {
      var used = dropdownUsage_(g);
      var items = all.filter(function (d) { return d.group === g; })
        .sort(function (a, b) { return a.sort - b.sort; })
        .map(function (d) { d.used = used[d.code] || 0; return d; });
      return {group: g, label: DROPDOWN_GROUPS[g], hint: DROPDOWN_HINTS[g] || '', items: items};
    });
  },

  /** New option (sort = last + 10) or a new label / active flag for an existing one. The code never changes. */
  dropdownSave: function (user, d) {
    d = d || {};
    var isNew = !d.key;
    if (!isNew) {
      var cur = findById('Dropdowns', d.key);
      if (!cur) throw appError_('NOT_FOUND', 'ไม่พบตัวเลือกนี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');
      d.group = cur.group; d.code = cur.code; d.sort = cur.sort;
    }
    if (d.code) d.code = String(d.code).trim().toUpperCase();
    if (isNew && d.active === undefined) d.active = true;
    var clean = validate_('Dropdown', d), key = clean.group + '.' + clean.code;
    return withLock_(function () {
      var group = readTable('Dropdowns').filter(function (x) { return x.group === clean.group; });
      if (group.some(function (x) { return x.key !== key && x.label.trim().toLowerCase() === clean.label.toLowerCase(); })) {
        throw fieldError_('label', 'มีตัวเลือกชื่อ "' + clean.label + '" ในกลุ่มนี้แล้ว กรุณาใช้ชื่ออื่น');
      }
      if (!isNew && !clean.active && dropdownActiveLeft_(group, key) === 0) {
        throw fieldError_('active', 'ต้องมีตัวเลือกที่ใช้งานอย่างน้อย 1 รายการในกลุ่มนี้');
      }
      if (isNew) {
        if (group.some(function (x) { return x.code === clean.code; })) throw fieldError_('code', 'รหัส ' + clean.code + ' มีในกลุ่มนี้แล้ว กรุณาใช้รหัสอื่น');
        clean.sort = group.reduce(function (m, x) { return Math.max(m, x.sort); }, 0) + 10;
        clean.key = key;
        insertRow('Dropdowns', clean);
        audit('CREATE', 'Dropdowns', key, clean);
      } else {
        updateRow('Dropdowns', key, {label: clean.label, active: clean.active});
        audit('UPDATE', 'Dropdowns', key, {label: clean.label, active: clean.active});
      }
      return {key: key};
    });
  },

  /** Deletes an unused option; one that records use is deactivated instead, so old records keep their label. */
  dropdownDelete: function (user, key) {
    return withLock_(function () {
      var cur = findById('Dropdowns', key);
      if (!cur) throw appError_('NOT_FOUND', 'ไม่พบตัวเลือกนี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า');
      var group = readTable('Dropdowns').filter(function (x) { return x.group === cur.group; });
      if (cur.active && dropdownActiveLeft_(group, key) === 0) {
        throw appError_('IN_USE', 'ต้องมีตัวเลือกที่ใช้งานอย่างน้อย 1 รายการในกลุ่มนี้ — เพิ่มตัวเลือกใหม่ก่อนแล้วค่อยลบ');
      }
      var used = dropdownUsage_(cur.group)[cur.code] || 0;
      if (used) {
        updateRow('Dropdowns', key, {active: false});
        audit('DEACTIVATE', 'Dropdowns', key, {used: used});
        return {deactivated: true, used: used};
      }
      deleteRow('Dropdowns', key);
      audit('DELETE', 'Dropdowns', key, {label: cur.label});
      return {deleted: true};
    });
  },

  /** codes = the group's codes in the new order (drag and drop). */
  dropdownReorder: function (user, group, codes) {
    if (!DROPDOWN_GROUPS[group]) throw appError_('VALIDATION', 'ไม่รู้จักกลุ่มตัวเลือก ' + group);
    return withLock_(function () {
      var have = readTable('Dropdowns').filter(function (x) { return x.group === group; }).map(function (x) { return x.code; });
      codes = (codes || []).map(String);
      if (codes.length !== have.length || have.some(function (c) { return codes.indexOf(c) < 0; })) {
        throw appError_('CONFLICT', 'ตัวเลือกในกลุ่มนี้เปลี่ยนไปแล้ว กรุณารีเฟรชหน้าแล้วเรียงใหม่');
      }
      var patches = {};
      codes.forEach(function (c, i) { patches[group + '.' + c] = {sort: (i + 1) * 10}; });
      updateRows('Dropdowns', patches);
      audit('REORDER', 'Dropdowns', group, codes);
      return true;
    });
  },

  companyGet: function () { return readKV('Company'); },

  companySave: function (user, d) {
    var cur = readKV('Company');
    d = d || {};
    d.logoFileId = cur.logoFileId || '';   // the logo changes only through companyLogo
    var clean = validate_('Company', d);
    withLock_(function () {
      writeKV('Company', clean);
      audit('UPDATE', 'Company', '', clean);
    });
    return clean;
  },

  /** A small image (the browser resizes it first) → Drive/Company, shared by link so <img> shows it to every user. */
  companyLogo: function (user, f) {
    f = f || {};
    if (!/^image\/(png|jpeg|webp)$/.test(f.mime || '')) throw appError_('VALIDATION', 'โลโก้ต้องเป็นไฟล์ PNG, JPG หรือ WEBP', 'logo');
    var bytes = Utilities.base64Decode(String(f.data || ''));
    if (!bytes.length || bytes.length > 1024 * 1024) throw appError_('VALIDATION', 'ไฟล์โลโก้ต้องไม่เกิน 1 MB', 'logo');
    var file = folderByPath_('Company').createFile(Utilities.newBlob(bytes, f.mime, 'logo-' + today_() + '.' + f.mime.split('/')[1]));
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
    catch (e) { console.warn('logo sharing: ' + e.message); }   // e.g. a Workspace policy: the logo then shows only to the owner
    var old = readKV('Company').logoFileId;
    withLock_(function () {
      writeKV('Company', {logoFileId: file.getId()});
      audit('UPLOAD', 'Company', file.getId(), {name: file.getName(), replaced: old || ''});
    });
    if (old) { try { DriveApp.getFileById(old).setTrashed(true); } catch (e) {} }   // the bin keeps it for 30 days
    return {logoFileId: file.getId()};
  }
};

/** Active options of a group other than key. */
function dropdownActiveLeft_(group, key) {
  return group.filter(function (x) { return x.key !== key && x.active; }).length;
}
