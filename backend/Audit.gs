/** Audit.gs — every create, update, delete, sign-in, print and export is appended to AuditLog. */
var CURRENT_USER = null;   // set by Api.gs for the duration of one request

/** detail: anything JSON-able (old/new values, amounts); stored as JSON text. Never throws. */
function audit(action, entity, docNo, detail) {
  try {
    insertRow('AuditLog', {
      at: nowISO_(),
      user: CURRENT_USER ? CURRENT_USER.username : 'system',
      action: action, entity: entity, docNo: docNo || '',
      detail: detail === undefined || detail === null ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail)
    });
  } catch (e) { console.error('audit failed: ' + e.message); }
}
