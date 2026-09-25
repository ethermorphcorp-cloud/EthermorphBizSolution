// build.js — node tools/build.js   then   clasp push --force
// 1. syntax-checks every backend/*.gs and reports a global name defined in two files (Apps Script shares one
//    global scope, so the file loaded last would silently win)
// 2. runs check-htmlservice.js on frontend/*.html
// 3. rebuilds gas/ (the clasp rootDir, git-ignored): appsscript.json + backend/*.gs + frontend/*.html
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const root = path.join(__dirname, '..');
const backend = fs.readdirSync(path.join(root, 'backend')).filter(f => f.endsWith('.gs'));
const frontend = fs.readdirSync(path.join(root, 'frontend')).filter(f => f.endsWith('.html'));
let problems = 0;

const defined = {};
for (const f of backend) {
  const src = fs.readFileSync(path.join(root, 'backend', f), 'utf8');
  try { new vm.Script(src, {filename: 'backend/' + f}); }
  catch (e) { problems++; console.log(e.stack.split('\n').slice(0, 5).join('\n')); }
  for (const m of src.matchAll(/^(?:function\s+([\w$]+)|var\s+([\w$]+))/gm)) {
    const name = m[1] || m[2];
    if (defined[name]) { problems++; console.log(`backend/${f}: ${name} is already defined in backend/${defined[name]}`); }
    else defined[name] = f;
  }
}
if (problems) { console.log(`\n${problems} problem(s) in backend/`); process.exit(1); }

cp.execFileSync(process.execPath, [path.join(__dirname, 'check-htmlservice.js')], {stdio: 'inherit'});

const gas = path.join(root, 'gas');
fs.rmSync(gas, {recursive: true, force: true});
fs.mkdirSync(path.join(gas, 'backend'), {recursive: true});
fs.mkdirSync(path.join(gas, 'frontend'), {recursive: true});
fs.copyFileSync(path.join(root, 'appsscript.json'), path.join(gas, 'appsscript.json'));
backend.forEach(f => fs.copyFileSync(path.join(root, 'backend', f), path.join(gas, 'backend', f)));
frontend.forEach(f => fs.copyFileSync(path.join(root, 'frontend', f), path.join(gas, 'frontend', f)));
console.log(`gas/ ready: ${backend.length} .gs + ${frontend.length} .html — next: clasp push --force`);
