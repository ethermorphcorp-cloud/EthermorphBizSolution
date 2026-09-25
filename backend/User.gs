/** User.gs — Settings ▸ ผู้ใช้งาน. Users are never deleted (the audit log names them): they are suspended.
 *  A new user and a reset password get DEFAULT_PASSWORD; they change it from the user menu.
 *  Guards: nobody changes their own role or suspends themselves, and the hotel always keeps an active Owner. */
var ROLE_ORDER = {Owner: 0, Admin: 1, Accounting: 2, FrontDesk: 3};

var UserService = {
  list: function () {
    return readTable('Users').map(publicUser_).sort(function (a, b) {
      return (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1) || ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
        String(a.fullName).localeCompare(String(b.fullName), 'th');
    });
  },

  save: function (me, d) {
    d = d || {};
    if (d.username) d.username = String(d.username).trim().toLowerCase();
    var clean = validate_('User', d), id = d.userId || '';
    return withLock_(function () {
      var users = readTable('Users');
      users.forEach(function (u) {
        if (u.userId === id) return;
        if (u.username.toLowerCase() === clean.username) throw fieldError_('username', 'ชื่อผู้ใช้ ' + clean.username + ' มีอยู่แล้ว กรุณาใช้ชื่ออื่น');
        if (clean.email && String(u.email).toLowerCase() === clean.email) throw fieldError_('email', 'อีเมลนี้ใช้กับบัญชีอื่นแล้ว');
      });
      if (id) {
        var cur = findById('Users', id);
        if (!cur) throw appError_('NOT_FOUND', 'ไม่พบผู้ใช้นี้ กรุณารีเฟรชหน้า');
        if (id === me.userId && clean.role !== cur.role) throw fieldError_('role', 'เปลี่ยนบทบาทของบัญชีตัวเองไม่ได้ ให้ผู้ใช้ Owner คนอื่นเปลี่ยนให้');
        if (id === me.userId && clean.status !== 'active') throw fieldError_('status', 'ระงับบัญชีของตัวเองไม่ได้');
        if (cur.role === 'Owner' && cur.status === 'active' && (clean.role !== 'Owner' || clean.status !== 'active')) ownerLeft_(users, id);
        clean.updatedAt = nowISO_();
        updateRow('Users', id, clean);
        audit('UPDATE', 'Users', id, {username: clean.username, role: clean.role, status: clean.status});
        return {userId: id};
      }
      var salt = newSalt_();
      clean.userId = nextId_('Users', 'USR-', 3);
      clean.salt = salt;
      clean.passwordHash = hashPassword_(DEFAULT_PASSWORD, salt);
      clean.createdAt = nowISO_();
      insertRow('Users', clean);
      audit('CREATE', 'Users', clean.userId, {username: clean.username, role: clean.role});
      return {userId: clean.userId, password: DEFAULT_PASSWORD};
    });
  },

  resetPassword: function (me, id) {
    return withLock_(function () {
      var cur = findById('Users', id);
      if (!cur) throw appError_('NOT_FOUND', 'ไม่พบผู้ใช้นี้ กรุณารีเฟรชหน้า');
      var salt = newSalt_();
      updateRow('Users', id, {salt: salt, passwordHash: hashPassword_(DEFAULT_PASSWORD, salt), updatedAt: nowISO_()});
      audit('RESET_PASSWORD', 'Users', id, {username: cur.username});
      return {password: DEFAULT_PASSWORD};
    });
  }
};

/** Throws when taking this Owner away would leave no active Owner. */
function ownerLeft_(users, exceptId) {
  if (!users.some(function (u) { return u.userId !== exceptId && u.role === 'Owner' && u.status === 'active'; })) {
    throw fieldError_('role', 'ต้องมีผู้ใช้บทบาท Owner ที่ใช้งานอยู่อย่างน้อย 1 คน — กำหนด Owner คนใหม่ก่อน');
  }
}
