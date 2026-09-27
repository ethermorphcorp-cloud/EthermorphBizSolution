/** Diag.gs — diag.lockTest: proof on the real Apps Script that LockService serialises the writes.
 *  The browser (ตั้งค่าทั่วไป ▸ ข้อมูลบริษัท ▸ เครื่องมือผู้ดูแลระบบ) fires several calls at once. Each takes the write lock,
 *  draws the next number of a test sequence (TS-yyyyMM-####, used by nothing else) and holds the lock a moment so the
 *  calls really overlap. Unique consecutive numbers mean the lock works. Nothing but that Sequences row is written.
 *  Refused in a demo hotel (its sandbox never takes the lock). */
var DIAG_HOLD_MS = 250;

var DiagService = {
  lockTest: function () {
    var t0 = Date.now(), waited = 0;
    return withLock_(function () {
      waited = Date.now() - t0;
      var no = nextDocNo('TS');
      Utilities.sleep(DIAG_HOLD_MS);
      return {no: no, waitedMs: waited};
    });
  }
};
