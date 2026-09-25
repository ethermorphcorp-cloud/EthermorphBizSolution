// preview-server.js — node tools/preview-server.js [port]   (default 8123)
// Runs the whole web app locally: backend/*.gs on the fakes of gas-fakes.js, doGet() renders frontend/index.html
// with its includes, and a small shim stands in for google.script.run / history / url, sending each call to this
// server, which runs api() and answers. setup() runs first, so there are two hotels:
//   /?demo=1        the demo hotel (โรงแรมสายธาร, full seed data)   — also the login screen's Demo button
//   /?shop=HT001    an empty hotel, sign in with owner / 1234
// Nothing is persisted: restart the server for fresh data. For looking at the UI only, never for real data.
const http = require('http'), path = require('path');
const {createGas} = require('./gas-fakes');

const port = Number(process.argv[2]) || 8123;
const root = path.join(__dirname, '..');
const gas = createGas(root, {url: 'http://localhost:' + port + '/'});
const {ctx, G, Book, props} = gas;
const LATENCY_MS = 250;   // google.script.run is never instant; keeps the loading overlay honest

// a Command Center with one hotel (the demo row is added by setup)
const cc = Book('Command Center');
cc.getSheetByName('Sheet1').name = 'Customers';
const head = G('CC_TABS.Customers');
cc.getSheetByName('Customers').rows.push(head.slice(),
  head.map(h => ({CUS_ID: 'HT001', CUS_NAME: 'โรงแรมทดสอบ', PACKAGE_TYPE: 'HOTEL', PACKAGE_TIER: 'STANDARD', STATUS: 'ACTIVE'})[h] || ''));
props.COMMAND_SHEET_ID = cc.getId();
console.log(ctx.setup());

const SHIM = `<script>
/* preview shim: google.script.* → this local server */
(function () {
  function runner(ok, fail) {
    return new Proxy({}, {get: function (t, name) {
      if (name === 'withSuccessHandler') return function (f) { return runner(f, fail); };
      if (name === 'withFailureHandler') return function (f) { return runner(ok, f); };
      return function () {
        var args = Array.prototype.slice.call(arguments);
        fetch('/rpc', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({fn: name, args: args})})
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (d) { ok && ok(d.result); }, function (e) { fail && fail(e); });
      };
    }});
  }
  var handler = null;
  window.addEventListener('popstate', function (e) { handler && handler({state: e.state, location: {hash: location.hash.slice(1)}}); });
  window.google = {script: {
    get run() { return runner(null, null); },
    history: {
      push: function (state, params, hash) { history.pushState(state, '', location.search + (hash ? '#' + hash : '')); },
      replace: function (state, params, hash) { history.replaceState(state, '', location.search + (hash ? '#' + hash : '')); },
      setChangeHandler: function (f) { handler = f; }
    },
    url: {getLocation: function (cb) { cb({hash: location.hash.slice(1), parameter: Object.fromEntries(new URLSearchParams(location.search))}); }}
  }};
})();
</script>`;

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/rpc') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => setTimeout(() => {
      try {
        const {fn, args} = JSON.parse(body);
        if (fn !== 'api') throw new Error('only api() is exposed');
        const result = ctx.api.apply(null, args);
        if (!result.ok) console.log('api', args[1], '→', result.code, result.message);
        res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
        res.end(JSON.stringify({result}));
      } catch (e) {
        console.error(e);
        res.writeHead(500); res.end(String(e.message));
      }
    }, LATENCY_MS));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/') {
    const page = ctx.doGet({parameter: Object.fromEntries(url.searchParams)});
    const html = page.getContent().replace('<head>', '<head>\n' + SHIM);
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    res.end(html);
    return;
  }
  res.writeHead(404); res.end('not found');
}).listen(port, () => console.log('preview: http://localhost:' + port + '/?demo=1  ·  http://localhost:' + port + '/?shop=HT001'));
