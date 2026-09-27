// gas-fakes.js — in-memory fakes of the Apps Script services the backend uses (SpreadsheetApp, CacheService,
// LockService, PropertiesService, DriveApp, Utilities, ScriptApp, HtmlService), with backend/*.gs loaded into one
// vm context the way Apps Script loads a project. Used by smoke-test.js and preview-server.js.
// The fakes are only as faithful as this file; the real test is running the code in Apps Script.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');

function createGas(root, opts = {}) {
  const appUrl = opts.url || 'https://script.google.com/macros/s/FAKE/exec';
  let idSeq = 0;
  const newId = p => p + (++idSeq).toString().padStart(6, '0');
  const books = {};

  let clock = Date.now();
  const touch = sh => { if (sh.book) sh.book.updated = ++clock; };
  function Range(sh, r, c, nr, nc) {
    const cell = (i, j) => { const row = sh.rows[r - 1 + i]; return row && row[c - 1 + j] !== undefined ? row[c - 1 + j] : ''; };
    const grid = f => Array.from({length: nr}, (_, i) => Array.from({length: nc}, (_, j) => f(i, j)));
    const self = {
      getValues: () => { if (sh.book) sh.book.reads++; return grid(cell); },
      getDisplayValues: () => grid((i, j) => String(cell(i, j))),
      setValues(v) {
        if (v.length !== nr || v.some(x => x.length !== nc)) throw new Error(`setValues: ${v.length}x${v[0] && v[0].length} into ${nr}x${nc}`);
        if (c - 1 + nc > sh.maxCols) throw new Error(`setValues past max columns (${c - 1 + nc} > ${sh.maxCols}) on ${sh.name}`);
        touch(sh);
        v.forEach((row, i) => row.forEach((x, j) => {
          while (sh.rows.length < r + i) sh.rows.push([]);
          // a text-formatted cell keeps strings; non-strings would be coerced by Sheets, so the fake flags them
          if (typeof x !== 'string' && !sh.commandCenter) sh.nonText.push([sh.name, r + i, c + j, x]);
          sh.rows[r - 1 + i][c - 1 + j] = x;
        }));
        return self;
      },
      setValue(x) { return self.setValues([[x]]); },
      clearContent() { touch(sh); for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (sh.rows[r - 1 + i]) sh.rows[r - 1 + i][c - 1 + j] = ''; return self; },
      setNumberFormat() { return self; }, setFontWeight() { return self; }, setBackground() { return self; },
      setFontColor() { return self; }, insertCheckboxes() { return self; }
    };
    return self;
  }
  function Sheet(name) {
    const sh = {name, rows: [], maxCols: 26, maxRows: 1000, nonText: []};
    const lastRow = () => { for (let i = sh.rows.length; i > 0; i--) if ((sh.rows[i - 1] || []).some(x => x !== '' && x != null)) return i; return 0; };
    const lastCol = () => sh.rows.reduce((m, row) => { for (let j = (row || []).length; j > m; j--) if (row[j - 1] !== '' && row[j - 1] != null) return j; return m; }, 0);
    Object.assign(sh, {
      getName: () => name, getLastRow: lastRow, getLastColumn: lastCol,
      getMaxRows: () => sh.maxRows, getMaxColumns: () => sh.maxCols,
      getRange: (r, c, nr = 1, nc = 1) => {
        if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error(`bad range ${r},${c},${nr},${nc} on ${name}`);
        return Range(sh, r, c, nr, nc);
      },
      getDataRange: () => Range(sh, 1, 1, Math.max(lastRow(), 1), Math.max(lastCol(), 1)),
      insertColumnsAfter: (after, n) => { sh.maxCols += n; },
      deleteColumns: (from, n) => { sh.maxCols -= n; sh.rows.forEach(row => row.splice(from - 1, n)); },
      deleteColumn: c => sh.deleteColumns(c, 1),
      deleteRow: r => { touch(sh); sh.rows.splice(r - 1, 1); },
      appendRow: v => { touch(sh); sh.rows.splice(lastRow(), 0, v.slice()); },
      setFrozenRows() {}
    });
    return sh;
  }
  function Book(name) {
    // reads: getValues calls (the cache tests count them); updated: Drive's last-updated time, moved by every write
    const id = newId('SS'), b = {id, name, sheets: [Sheet('Sheet1')], reads: 0, updated: ++clock};
    b.sheets[0].book = b;
    Object.assign(b, {
      getId: () => id, getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id,
      getSheetByName: n => b.sheets.find(s => s.name === n) || null,
      insertSheet: (n, i) => { const s = Sheet(n); s.book = b; b.sheets.splice(i === undefined ? b.sheets.length : i, 0, s); return s; },
      getSheets: () => b.sheets.slice(),
      deleteSheet: s => { b.sheets = b.sheets.filter(x => x !== s); },
      setSpreadsheetTimeZone() {}
    });
    books[id] = b;
    return b;
  }
  const cacheStore = {};
  const cache = {
    get: k => (k in cacheStore ? cacheStore[k] : null),
    put: (k, v, ttl) => {
      if (typeof v !== 'string') throw new Error('cache value must be a string: ' + k);
      if (Buffer.byteLength(v, 'utf8') > 100 * 1024) throw new Error('cache value over 100 KB: ' + k);
      if (k.length > 250) throw new Error('cache key over 250 chars: ' + k);
      cacheStore[k] = v;
    },
    remove: k => { delete cacheStore[k]; },
    removeAll: ks => ks.forEach(k => delete cacheStore[k]),
    getAll: ks => { const o = {}; ks.forEach(k => { if (k in cacheStore) o[k] = cacheStore[k]; }); return o; },
    putAll: (o, ttl) => Object.keys(o).forEach(k => cache.put(k, o[k], ttl))
  };
  const props = {};
  let lockHeld = 0, lockAcquired = 0;
  const folders = {}, files = {}, uploads = {sessions: {}, dropNext: false};
  function Folder(name) {
    const f = {id: newId('F'), name, kids: []};
    Object.assign(f, {
      getId: () => f.id,
      getFoldersByName: n => { const m = f.kids.filter(k => k.name === n); let i = 0; return {hasNext: () => i < m.length, next: () => m[i++]}; },
      createFolder: n => { const k = Folder(n); f.kids.push(k); return k; },
      createFile: blob => { const id = newId('FILE'), file = {id, blob, trashed: false, sharing: null, getId: () => id, getName: () => blob.name, getBlob: () => ({getBytes: () => blob.bytes}),
        getUrl: () => 'https://drive.google.com/file/d/' + id, setSharing(a, p) { file.sharing = a; }, setTrashed(t) { file.trashed = t; }}; files[id] = file; return file; }
    });
    folders[f.id] = f;
    return f;
  }
  function fmtDate(d, tz, fmt) {
    const t = new Date(d.getTime() + 7 * 3600e3);
    const p = (n, l = 2) => String(n).padStart(l, '0');
    const parts = fmt.split("'");
    return parts.map((s, i) => i % 2 ? s : s.replace('yyyy', t.getUTCFullYear()).replace('MM', p(t.getUTCMonth() + 1))
      .replace('dd', p(t.getUTCDate())).replace('HH', p(t.getUTCHours())).replace('mm', p(t.getUTCMinutes()))
      .replace('ss', p(t.getUTCSeconds()))).join('');
  }
  const ctx = {
    console: {log() {}, warn() {}, error: (...a) => { if (process.env.VERBOSE) console.error(...a); }},
    Date, Math, JSON, Number, String, Object, Array, Error, RegExp, isFinite, Buffer,
    SpreadsheetApp: {openById: id => { if (!books[id]) throw new Error('no spreadsheet ' + id); return books[id]; }, create: n => Book(n), flush() {}},
    CacheService: {getScriptCache: () => cache},
    LockService: {getScriptLock: () => ({
      tryLock() { if (lockHeld) throw new Error('fake: lock taken twice in one execution'); lockHeld = 1; lockAcquired++; return true; },
      releaseLock() { lockHeld = 0; }
    })},
    PropertiesService: {getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; }
    })},
    Utilities: {
      formatDate: fmtDate,
      getUuid: () => crypto.randomUUID(),
      sleep: () => {},
      DigestAlgorithm: {SHA_256: 'sha256'}, Charset: {UTF_8: 'utf8'},
      base64Decode: b64 => Array.from(Buffer.from(b64, 'base64')).map(b => (b > 127 ? b - 256 : b)),
      newBlob: (bytes, mime, name) => ({bytes, mime, name, getName: () => name}),
      base64Encode: bytes => Buffer.from(bytes.map(b => b & 255)).toString('base64'),
      computeDigest: (alg, s) => Array.from(crypto.createHash(alg).update(s, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b))
    },
    ScriptApp: {getService: () => ({getUrl: () => appUrl}), getOAuthToken: () => 'fake-token'},
    // Drive resumable upload (the parts Upload.gs uses): init → session URI, PUT slices with Content-Range,
    // 308 + Range while incomplete, 200 + {id} when the last byte lands; "bytes */size" asks for the offset.
    // uploads.dropNext = true stores the next slice but loses the answer (a dropped connection).
    UrlFetchApp: {fetch: (url, p) => {
      const R = (code, headers = {}, body = '') => ({getResponseCode: () => code, getHeaders: () => headers, getContentText: () => body});
      if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable')) {
        if (p.method !== 'post' || !/^Bearer /.test(p.headers.Authorization)) return R(401);
        const meta = JSON.parse(p.payload), sid = newId('SESS');
        uploads.sessions[sid] = {meta, size: Number(p.headers['X-Upload-Content-Length']), bytes: [], fileId: ''};
        return R(200, {Location: 'https://fake-upload.local/' + sid});
      }
      if (url.startsWith('https://fake-upload.local/')) {
        const u = uploads.sessions[url.split('/').pop()], cr = String(p.headers['Content-Range'] || '');
        if (!u) return R(404);
        if (/^bytes \*\//.test(cr)) return u.fileId ? R(200, {}, JSON.stringify({id: u.fileId})) : R(308, u.bytes.length ? {Range: 'bytes=0-' + (u.bytes.length - 1)} : {});
        const m = cr.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
        if (!m || Number(m[1]) !== u.bytes.length || Number(m[2]) - Number(m[1]) + 1 !== p.payload.length) return R(400);
        for (const b of p.payload) u.bytes.push(b);
        if (u.bytes.length >= u.size) {
          const f = folders[u.meta.parents[0]].createFile({bytes: u.bytes, name: u.meta.name, mime: u.meta.mimeType});
          u.fileId = f.getId();
        }
        if (uploads.dropNext) { uploads.dropNext = false; return R(503); }
        return u.fileId ? R(200, {}, JSON.stringify({id: u.fileId})) : R(308, {Range: 'bytes=0-' + (u.bytes.length - 1)});
      }
      return R(404);
    }},
    DriveApp: {getFolderById: id => { if (!folders[id]) throw new Error('no folder'); return folders[id]; }, createFolder: n => Folder(n),
      getFileById: id => {
        if (files[id]) return files[id];
        if (books[id]) return {getLastUpdated: () => new Date(books[id].updated)};   // a spreadsheet, for the cache stamp
        throw new Error('no file');
      },
      Access: {ANYONE_WITH_LINK: 'ANYONE_WITH_LINK'}, Permission: {VIEW: 'VIEW'}},
    // templates are evaluated for real: <?!= expr ?> runs in the project's scope with the template's variables
    HtmlService: {
      createTemplateFromFile: f => {
        const t = {evaluate: () => {
          const vars = Object.keys(t).filter(k => k !== 'evaluate');
          const html = readHtml(f).replace(/<\?!=([\s\S]*?)\?>/g, (m, expr) =>
            String(vm.runInContext('(function (' + vars.join(',') + ') { return (' + expr.trim().replace(/;$/, '') + '); })', ctx)(...vars.map(k => t[k]))));
          return output(html, t);
        }};
        return t;
      },
      createHtmlOutputFromFile: f => output(readHtml(f)),
      createHtmlOutput: html => output(html),
      XFrameOptionsMode: {ALLOWALL: 1}
    }
  };
  function readHtml(f) { return fs.readFileSync(path.join(root, f + '.html'), 'utf8'); }
  function output(html, t) {
    const o = {html, boot: t && t.boot, title: '', getContent: () => html};
    o.setTitle = x => { o.title = x; return o; };
    o.addMetaTag = o.setXFrameOptionsMode = () => o;
    return o;
  }
  vm.createContext(ctx);
  const order = ['Config.gs', 'Database.gs'].concat(fs.readdirSync(path.join(root, 'backend')).filter(f => f.endsWith('.gs') && f !== 'Config.gs' && f !== 'Database.gs').sort());
  order.forEach(f => vm.runInContext(fs.readFileSync(path.join(root, 'backend', f), 'utf8'), ctx, {filename: f}));
  const G = code => vm.runInContext(code, ctx);
  return {ctx, G, books, props, cacheStore, folders, files, uploads, Book, fmtDate,
    lock: {get held() { return lockHeld; }, get acquired() { return lockAcquired; }, reset() { lockAcquired = 0; }}};
}

module.exports = {createGas};
