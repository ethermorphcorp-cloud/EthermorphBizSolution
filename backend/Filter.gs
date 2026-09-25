/** Filter.gs — filter choices that exist in the data (rule 5): each option carries its count, and a value no
 *  record has is never offered. List services embed these in their answer; filter.options serves the rest. */

/** [{value, label, count}] of rows[field], most used first. label(value) names the value (default: itself). */
function filterOptions_(rows, field, label) {
  var n = {};
  rows.forEach(function (r) {
    var v = r[field];
    if (v === '' || v === null || v === undefined) return;
    n[v] = (n[v] || 0) + 1;
  });
  return Object.keys(n).map(function (v) { return {value: v, label: label ? label(v) : v, count: n[v]}; })
    .sort(function (a, b) { return b.count - a.count || String(a.label).localeCompare(String(b.label), 'th'); });
}

/** Label of a dropdown code, for option lists. */
function dropdownLabel_(group) {
  var map = {};
  readTable('Dropdowns').forEach(function (d) { if (d.group === group) map[d.code] = d.label; });
  return function (code) { return map[code] || code; };
}

/** entity → [permission, date column for a month scope, {field: dropdown group}] */
var FILTER_ENTITIES = {
  Customers:   ['customer.view', '', {type: 'custtype'}],
  RoomIncome:  ['roomIncome.view', 'checkIn', {channel: 'channel', payMethod: 'pay'}],
  OtherIncome: ['otherIncome.view', 'date', {category: 'othercat', payMethod: 'pay'}],
  Expenses:    ['expense.view', 'date', {category: 'expcat', payMethod: 'pay'}]
};

/** filter.options(entity, field, scope {month: 'yyyy-MM'}) */
function filterOptions(user, entity, field, scope) {
  var def = FILTER_ENTITIES[entity];
  if (!def || SCHEMA[entity].indexOf(field) < 0) throw appError_('VALIDATION', 'ไม่รองรับตัวกรอง ' + entity + '.' + field);
  need_(user, def[0]);
  var rows = readTable(entity), month = scope && scope.month;
  if (month && def[1]) rows = rows.filter(function (r) { return String(r[def[1]]).slice(0, 7) === month; });
  return filterOptions_(rows, field, def[2][field] ? dropdownLabel_(def[2][field]) : null);
}

/** One page of rows: {rows, total, page, pageSize}. pageSize 'all' = every row (exports). */
function pageOf_(rows, page, pageSize) {
  if (pageSize === 'all') return {rows: rows, total: rows.length, page: 1, pageSize: Math.max(1, rows.length)};
  pageSize = Math.max(1, Math.min(200, Number(pageSize) || 20));
  var pages = Math.max(1, Math.ceil(rows.length / pageSize));
  page = Math.max(1, Math.min(pages, Number(page) || 1));
  return {rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page: page, pageSize: pageSize};
}
