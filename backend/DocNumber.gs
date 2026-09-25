/** DocNumber.gs — document numbers PREFIX-yyyyMM-#### (BK-202609-0001).
 *  One row per prefix per month in the Sequences sheet: key (PREFIX-yyyyMM), prefix, yyyymm, last.
 *  The count restarts every month. nextDocNo takes the lock itself, and a save that calls it from inside its own
 *  withLock_ keeps one critical section for the number and the rows (see Database.gs).
 */
function nextDocNo(prefix) {
  checkPrefix_(prefix);
  return withLock_(function () {
    var ym = yyyymm_(), key = prefix + '-' + ym;
    var row = findById('Sequences', key);
    var n = (row ? row.last : 0) + 1;
    if (row) updateRow('Sequences', key, {last: n});
    else insertRow('Sequences', {key: key, prefix: prefix, yyyymm: ym, last: n});
    return buildDocNo_(prefix, ym, n);
  });
}

/** The number the next save would get — for display only (another user may take it first). */
function peekDocNo(prefix) {
  checkPrefix_(prefix);
  var ym = yyyymm_(), row = findById('Sequences', prefix + '-' + ym);
  return buildDocNo_(prefix, ym, (row ? row.last : 0) + 1);
}

function buildDocNo_(prefix, ym, n) { return prefix + '-' + ym + '-' + pad_(n, 4); }
function yyyymm_() { return Utilities.formatDate(new Date(), TZ, 'yyyyMM'); }
function checkPrefix_(prefix) {
  if (!/^[A-Z]{2,4}$/.test(String(prefix))) throw new Error('prefix ไม่ถูกต้อง: ' + prefix);
}
