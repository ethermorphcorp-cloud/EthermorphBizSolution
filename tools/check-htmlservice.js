// check-htmlservice.js — run before `clasp push`: node tools/check-htmlservice.js
// HtmlService strips JS comments from frontend/*.html when it serves the page, and it does not understand strings:
// a "//" or "/*" inside a quoted or backtick string (https://…, image/*) is taken as a comment and the rest of the
// line — or of the file — disappears in production while the code still parses locally. This walks every <script>
// the way a JS tokenizer would and reports any "//" or "/*" that sits inside a string literal.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'frontend');
const SKIP = {};
let problems = 0;

function scan(file, code, offsetLine) {
  // stack of contexts: 'code' | 'tpl' (inside `...`) | 'expr' (inside ${ } of a template, counts braces)
  const stack = [{t: 'code'}];
  let i = 0, line = offsetLine;
  const top = () => stack[stack.length - 1];
  const report = (what) => { problems++; console.log(`${file}:${line}  "${what}" inside a string — HtmlService will treat it as a comment`); };
  while (i < code.length) {
    const c = code[i], n = code[i + 1], ctx = top();
    if (c === '\n') line++;
    if (ctx.t === 'tpl') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { stack.pop(); i++; continue; }
      if (c === '$' && n === '{') { stack.push({t: 'expr', depth: 0}); i += 2; continue; }
      if (c === '/' && (n === '/' || n === '*')) report(c + n);
      i++; continue;
    }
    // code or ${ } expression
    if (c === '/' && n === '/') { while (i < code.length && code[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const e = code.indexOf('*/', i + 2); line += (code.slice(i, e).match(/\n/g) || []).length; i = e + 2; continue; }
    if (c === '\'' || c === '"') {
      let j = i + 1;
      while (j < code.length && code[j] !== c && code[j] !== '\n') { if (code[j] === '\\') j++; else if (code[j] === '/' && (code[j + 1] === '/' || code[j + 1] === '*')) report(code[j] + code[j + 1]); j++; }
      i = j + 1; continue;
    }
    if (c === '/' ) {   // a regex literal after an operator or ( , = : [ ! & | ? { } ; or line start
      let k = i - 1; while (k >= 0 && /\s/.test(code[k])) k--;
      if (k < 0 || /[(,=:[!&|?{};+\-*%<>~^]/.test(code[k]) || /\b(return|typeof|case)$/.test(code.slice(Math.max(0, k - 6), k + 1))) {
        let j = i + 1, cls = false;
        while (j < code.length && code[j] !== '\n') { if (code[j] === '\\') { j += 2; continue; } if (code[j] === '[') cls = true; else if (code[j] === ']') cls = false; else if (code[j] === '/' && !cls) break; j++; }
        i = j + 1; continue;
      }
    }
    if (c === '`') { stack.push({t: 'tpl'}); i++; continue; }
    if (ctx.t === 'expr') {
      if (c === '{') ctx.depth++;
      else if (c === '}') { if (ctx.depth === 0) { stack.pop(); i++; continue; } ctx.depth--; }
    }
    i++;
  }
}

fs.readdirSync(dir).filter(f => f.endsWith('.html') && !SKIP[f]).forEach(f => {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(src))) scan(f, m[1], src.slice(0, m.index).split('\n').length);
});
if (problems) { console.log(`\n${problems} problem(s). Build the string with plain quotes and concatenation, or avoid the characters.`); process.exit(1); }
console.log('check-htmlservice: ok');
