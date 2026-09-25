/** Auth.gs — username/password login, salted SHA-256 hashes, server-side sessions in CacheService, roles.
 *  hash = SHA-256(hotel pepper (Script Property SALT_<CUS_ID>) | user salt (Users.salt) | password)
 *  A session is 'sess_<token>' in the hotel's cache: sessionMin (Config) of idle time, refreshed on every call,
 *  or the cache maximum of 6 hours when "จดจำการเข้าสู่ระบบ" is ticked.
 */
var SESSION_PREFIX = 'sess_';
var SESSION_MAX_SEC = 21600;
var LOGIN_MAX_FAILS = 5;
var LOGIN_LOCK_SEC = 300;
var PASSWORD_MIN = 6;

function hashPassword_(plain, userSalt) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    shopSalt_() + '|' + userSalt + '|' + plain, Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}
function newSalt_() { return Utilities.getUuid().replace(/-/g, ''); }

function findUser_(login) {
  var key = String(login || '').trim().toLowerCase();
  return readTable('Users').filter(function (u) {
    return String(u.username).toLowerCase() === key || (u.email && String(u.email).toLowerCase() === key);
  })[0] || null;
}

function login(username, password, remember) {
  var name = String(username || '').trim().toLowerCase();
  if (!name) throw fieldError_('username', 'กรุณากรอกชื่อผู้ใช้หรืออีเมล');
  if (!password) throw fieldError_('password', 'กรุณากรอกรหัสผ่าน');
  var failKey = 'fail_' + name, fails = Number(cache_().get(failKey)) || 0;
  if (fails >= LOGIN_MAX_FAILS) throw appError_('LOCKED', 'กรอกรหัสผ่านผิดเกิน ' + LOGIN_MAX_FAILS + ' ครั้ง กรุณารอ 5 นาทีแล้วลองใหม่', 'password');
  var u = findUser_(name);
  if (!u || u.passwordHash !== hashPassword_(password, u.salt)) {
    cache_().put(failKey, String(fails + 1), LOGIN_LOCK_SEC);
    throw fieldError_('password', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่');
  }
  if (u.status !== 'active') throw fieldError_('username', 'บัญชีนี้ถูกระงับ กรุณาติดต่อผู้ดูแลระบบ');
  cache_().remove(failKey);
  return startSession_(u, remember === true, 'LOGIN');
}

/** Demo button on the login screen: signs in as the demo hotel's first active Owner, no password. */
function loginDemo() {
  if (!SHOP.demo) throw appError_('FORBIDDEN', 'โหมดสาธิตใช้ได้เฉพาะโรงแรมสาธิต กรุณาเปิดลิงก์ ?demo=1');
  var u = readTable('Users').filter(function (x) { return x.role === 'Owner' && x.status === 'active'; })[0];
  if (!u) throw new Error('โรงแรมสาธิตยังไม่มีผู้ใช้ Owner — รัน setup()');
  return startSession_(u, false, 'LOGIN_DEMO');
}

function startSession_(u, remember, action) {
  var ttl = remember ? SESSION_MAX_SEC : Math.min((Number(readKV('Config').sessionMin) || 30) * 60, SESSION_MAX_SEC);
  var token = Utilities.getUuid();
  cache_().put(SESSION_PREFIX + token, JSON.stringify({userId: u.userId, ttl: ttl, at: nowISO_()}), ttl);
  if (SHOP.demo) SANDBOX = token;   // the rows below go to this session's demo change set
  CURRENT_USER = publicUser_(u);
  updateRow('Users', u.userId, {lastLoginAt: nowISO_()});
  audit(action, 'Auth', u.userId);
  touchLastSeen_();
  var out = sessionInfo_(publicUser_(u), ttl);
  out.token = token;
  return out;
}

/** What the browser keeps about the signed-in user: permissions, package flags, demo, idle time. */
function sessionInfo_(user, ttl) {
  return {user: user, perms: permsOf_(user), features: shopFeatures_(), demo: SHOP.demo, ttl: ttl};
}

function logout(token) {
  var s = session_(token, true);
  if (s) {
    if (SHOP.demo) SANDBOX = token;
    CURRENT_USER = s.user;
    audit('LOGOUT', 'Auth', s.user.userId);
    if (SHOP.demo) sbxClear_(token);
  }
  if (token) cache_().remove(SESSION_PREFIX + token);
  return true;
}

/** {user, ttl} for a valid token, refreshing its idle time; throws SESSION_EXPIRED otherwise (silent: returns null). */
function session_(token, silent) {
  var raw = token && cache_().get(SESSION_PREFIX + token);
  var expired = function () {
    if (token) cache_().remove(SESSION_PREFIX + token);
    if (silent) return null;
    throw appError_('SESSION_EXPIRED', 'หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบอีกครั้ง');
  };
  if (!raw) return expired();
  var data = JSON.parse(raw);
  var u = findById('Users', data.userId);
  if (!u || u.status !== 'active') return expired();
  // the idle time restarts at most once a minute (one cache write less per call); the extra minute keeps the
  // server from ending a session before the browser's own idle timer does
  var now = Date.now();
  if (!(now - (data.seen || 0) < 60000)) {
    data.seen = now;
    cache_().put(SESSION_PREFIX + token, JSON.stringify(data), Math.min((data.ttl || SESSION_MAX_SEC) + 60, 21600));
  }
  return {user: publicUser_(u), ttl: data.ttl || SESSION_MAX_SEC};
}

function publicUser_(u) {
  return {userId: u.userId, username: u.username, fullName: u.fullName, email: u.email, phone: u.phone,
          role: u.role, status: u.status, lastLoginAt: u.lastLoginAt};
}

function changePassword(user, oldPassword, newPassword) {
  var u = findById('Users', user.userId);
  if (!u || u.passwordHash !== hashPassword_(String(oldPassword || ''), u.salt)) {
    throw fieldError_('oldPassword', 'รหัสผ่านเดิมไม่ถูกต้อง');
  }
  newPassword = String(newPassword || '');
  if (newPassword.length < PASSWORD_MIN) throw fieldError_('newPassword', 'รหัสผ่านใหม่ต้องมีอย่างน้อย ' + PASSWORD_MIN + ' ตัวอักษร');
  if (newPassword === oldPassword) throw fieldError_('newPassword', 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม');
  var salt = newSalt_();
  withLock_(function () {
    updateRow('Users', u.userId, {salt: salt, passwordHash: hashPassword_(newPassword, salt), updatedAt: nowISO_()});
    audit('CHANGE_PASSWORD', 'Users', u.userId);
  });
  return true;
}

/* ---------- Roles ---------- */

/** Permission check. Without the roles flag every signed-in user may do everything. */
function can_(user, perm) {
  if (!shopFeatures_().roles) return true;
  var rules = PERMS[user.role] || [];
  if (rules.indexOf('*') >= 0) return true;
  return rules.indexOf(perm) >= 0 || rules.indexOf(perm.split('.')[0] + '.*') >= 0;
}
function need_(user, perm) {
  if (!can_(user, perm)) throw appError_('FORBIDDEN', 'บัญชีของคุณไม่มีสิทธิ์ทำรายการนี้ กรุณาติดต่อผู้ดูแลระบบ');
}
/** Server-side package check: a menu hidden in the browser is not enough. */
function needFeature_(flag) {
  if (!shopFeatures_()[flag]) throw appError_('FEATURE', 'แพ็กเกจของโรงแรมนี้ยังไม่เปิดใช้เมนูนี้ กรุณาติดต่อ Ethermorph เพื่ออัปเกรด');
}
/** The permission list the browser uses to hide what the user cannot do. */
function permsOf_(user) {
  return shopFeatures_().roles ? (PERMS[user.role] || []) : ['*'];
}
