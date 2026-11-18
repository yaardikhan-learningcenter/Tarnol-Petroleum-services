import DB, { COLS, demo } from './db.js';
import { D, n, fmt, money, esc, today, addDays, SHIFTS, settings, itemByName, netL, creditCalc, shiftTotals, compute, lastClosing, customerLedger, supplierLedger, cashBook, pnl } from './core.js';
import { SEED } from './seed.js';
import { barChart, lineChart, donut, hbar, legend, card, short } from './charts.js';
import { makeBuckets, series, salesPL, startOf } from './core.js';

const $ = (s, r = document) => r.querySelector(s);
const view = () => $('#view');
let C = { fifo: { outs: {}, stock: {} }, shiftItem: {}, adjCost: {} };
let page = 'dashboard', dirty = false;

/* ---------- small helpers ---------- */
function toast(msg) { const d = document.createElement('div'); d.textContent = msg; $('#toast').append(d); setTimeout(() => d.remove(), 3200); }
const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
const names = col => () => D[col].slice().sort(byName).map(x => x.name);
const itemNames = type => () => D.items.filter(i => !type || i.type === type).sort(byName).map(i => i.name);
const opts = (list, sel, blank) => (blank ? `<option value="">${esc(blank)}</option>` : '') + list.map(o => `<option${o === sel ? ' selected' : ''}>${esc(o)}</option>`).join('');
const sortDate = (a, b) => (b.date || '').localeCompare(a.date || '') || n(b.createdAt) - n(a.createdAt);
function table(heads, rows, foot) {
  const H = heads.map(h => typeof h === 'string' ? { h } : h);
  const cell = (c, i) => `<td class="${H[i]?.n ? 'num' : ''}">${c ?? ''}</td>`;
  return `<div class="tbl"><table><thead><tr>${H.map(h => `<th class="${h.n ? 'num' : ''}">${h.h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(cell).join('')}</tr>`).join('') || `<tr><td colspan="${H.length}" class="muted">No records</td></tr>`}</tbody>${foot ? `<tfoot><tr class="tot">${foot.map(cell).join('')}</tr></tfoot>` : ''}</table></div>`;
}
const sign = v => `<span class="${n(v) < 0 ? 'neg' : n(v) > 0 ? 'pos' : ''}">${money(v)}</span>`;
function csv(name, rows) {
  const t = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/csv' })); a.download = name + '.csv'; a.click();
}
const monthStart = () => today().slice(0, 8) + '01';

/* ---------- generic CRUD page ---------- */
function crudPage(cfg) {
  let editId = null, month = cfg.noMonth ? '' : (window.__m?.[cfg.col] ?? today().slice(0, 7));
  const root = view();
  const draw = () => {
    const rows = D[cfg.col].filter(r => !month || (r.date || '').startsWith(month)).sort(cfg.noMonth ? byName : sortDate);
    const e = (editId && D[cfg.col].find(r => r.id === editId)) || {};
    const fld = f => {
      const val = e[f.k] ?? (typeof f.def === 'function' ? f.def() : f.def) ?? '';
      const inp = f.t === 'select' ? `<select name="${f.k}">${opts(f.opts(), val, f.blank ?? '')}</select>`
        : f.t === 'textarea' ? `<textarea name="${f.k}" rows="1">${esc(val)}</textarea>`
        : `<input name="${f.k}" type="${f.t || 'text'}" value="${esc(val)}" ${f.t === 'number' ? 'step="any"' : ''} ${f.list ? `list="dl_${f.k}"` : ''} ${f.req ? 'required' : ''}>${f.list ? `<datalist id="dl_${f.k}">${f.list().map(o => `<option>${esc(o)}</option>`).join('')}</datalist>` : ''}`;
      return `<label>${f.l}${f.req ? ' *' : ''}${inp}</label>`;
    };
    root.innerHTML = `<h2>${cfg.title}</h2>${cfg.note ? `<p class="muted">${cfg.note}</p>` : ''}
    <form class="card form" id="cf">${cfg.fields.map(fld).join('')}<div class="row" style="margin:0"><button class="btn primary">${editId ? 'Update' : 'Add'}</button>${editId ? '<button type="button" class="btn" id="cx">Cancel</button>' : ''}</div></form>
    ${cfg.noMonth ? '' : `<div class="row noprint"><label style="flex-direction:row;align-items:center;gap:8px">Month <input type="month" id="mf" value="${month}"></label><button class="btn" id="mall">All</button><button class="btn" id="csv">Export CSV</button><span class="grow"></span><b>${cfg.total ? cfg.total(rows) : ''}</b></div>`}
    ${table([...cfg.cols.map(c => ({ h: c.h, n: c.n })), ''], rows.map(r => [...cfg.cols.map(c => c.f(r)), `<button class="btn sm" data-e="${r.id}">Edit</button> <button class="btn sm danger" data-d="${r.id}">Del</button>`]))}`;
    const f = $('#cf', root);
    f.onsubmit = async ev => {
      ev.preventDefault(); const data = {};
      cfg.fields.forEach(x => { let v = f.querySelector(`[name="${x.k}"]`).value; data[x.k] = x.t === 'number' ? (v === '' ? '' : Number(v)) : v.trim(); });
      if (cfg.validate) { const m = cfg.validate(data, editId); if (m) return toast(m); }
      if (!editId) data.createdAt = Date.now();
      try { await DB.save(cfg.col, editId, data); toast('Saved'); editId = null; dirty = false; draw(); } catch (er) { toast('Save failed: ' + er.message); }
    };
    $('#cx', root) && ($('#cx', root).onclick = () => { editId = null; draw(); });
    root.querySelectorAll('[data-e]').forEach(b => b.onclick = () => { editId = b.dataset.e; draw(); scrollTo(0, 0); });
    root.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { if (confirm('Delete this record?')) { await DB.remove(cfg.col, b.dataset.d); toast('Deleted'); } });
    if ($('#mf', root)) {
      $('#mf', root).onchange = ev => { month = ev.target.value; (window.__m ||= {})[cfg.col] = month; draw(); };
      $('#mall', root).onclick = () => { month = ''; (window.__m ||= {})[cfg.col] = ''; draw(); };
      $('#csv', root).onclick = () => csv(cfg.col, [cfg.cols.map(c => c.h), ...rows.map(r => cfg.cols.map(c => String(c.f(r)).replace(/<[^>]+>/g, '')))]);
    }
  };
  draw();
}
const dateF = { k: 'date', l: 'Date', t: 'date', def: today, req: true };
const modeF = { k: 'mode', l: 'Mode', t: 'select', opts: () => ['cash', 'bank', 'wallet'], def: 'cash' };
const pAmt = r => fmt(n(r.qty) * n(r.rate));

/* ---------- pages ---------- */
const PAGES = {};
let dashP = 'daily';
const PERIODS = { daily: { n: 14, l: 'Daily', cur: 'Today', win: 'last 14 days' }, weekly: { n: 12, l: 'Weekly', cur: 'This week', win: 'last 12 weeks' }, monthly: { n: 12, l: 'Monthly', cur: 'This month', win: 'last 12 months' }, yearly: { n: 5, l: 'Yearly', cur: 'This year', win: 'last 5 years' } };
const fuelNames = () => D.items.filter(i => i.type === 'fuel').sort(byName).map(i => i.name);
const delta = (a, b) => { if (!b) return ''; const p = (a - b) / Math.abs(b) * 100; return `<span class="delta ${p >= 0 ? 'up' : 'dn'}">${p >= 0 ? '▲' : '▼'} ${fmt(Math.abs(p), 1)}% vs previous</span>`; };
const sum = a => a.reduce((q, x) => q + x, 0);
// top 6 slices + "Other" (grey); palette index 5 is reserved for Other
function topN(obj, k = 6) {
  const e = Object.entries(obj).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]), top = e.slice(0, k), rest = sum(e.slice(k).map(x => x[1])), cs = [0, 1, 2, 3, 4, 5];
  return [...top.map(([label, value], i) => ({ label, value, c: cs[i] })), ...(rest > 0 ? [{ label: 'Other', value: rest, c: 6 }] : [])];
}
// chart card with a Chart / Table switch
const tcard = (title, sub, chart, lg, head, rows) => `<div class="card chart"><h3><span>${esc(title)}<small class="muted block">${esc(sub)}</small></span><button class="btn mini noprint" data-tg>▦ Table</button></h3><div class="vc">${lg}${chart}</div><div class="vt">${table(head.map((h, i) => i ? { h, n: 1 } : h), rows)}</div></div>`;
PAGES.dashboard = () => {
  const P = PERIODS[dashP], B = makeBuckets(dashP, P.n), S = series(B, C), cur = S[S.length - 1], prv = S[S.length - 2] || {};
  const from = B[0].from, to = B[B.length - 1].to, labels = S.map(x => x.label), W = pnl(from, to, C), cb = cashBook();
  const stockVal = Object.values(C.fifo.stock).reduce((q, x) => q + x.value, 0);
  const recv = D.customers.reduce((q, c) => q + customerLedger(c.name).balance, 0), pay = D.suppliers.reduce((q, c) => q + supplierLedger(c.name).balance, 0);
  const k = (l, v, sub = '') => `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`;
  const fuels = fuelNames(), tot = (key) => S.reduce((q, x) => q + x[key], 0);
  const mix = Object.entries(W.items).reduce((m, [i, a]) => { const key = itemByName(i)?.type === 'oil' ? 'Lube / oil' : i; m[key] = (m[key] || 0) + a.rev; return m; }, {});
  const noz = salesPL(from, to, C), exp = { ...W.exp, ...(W.salary ? { Salaries: W.salary } : {}) };
  const warn = Object.entries(C.fifo.stock).filter(([, x]) => x.short > 0 || x.qty < 0);
  const rc = D.customers.map(c => ({ name: c.name, b: customerLedger(c.name).balance })).filter(x => Math.abs(x.b) > 0.5).sort((x, y) => y.b - x.b).slice(0, 8);
  const sSales = { name: 'Sales', values: S.map(x => x.sales), c: 0 }, sGross = { name: 'Gross profit (FIFO)', values: S.map(x => x.gross), c: 1 }, sNet = { name: 'Net profit', values: S.map(x => x.net), c: 2 };
  const fl = fuels.map((f, i) => ({ name: f + ' (L)', values: S.map(x => x.lit[f] || 0), c: i }));
  const cs = [{ name: 'FIFO cost', values: S.map(x => x.cogs), c: 3 }, { name: 'Expenses + salaries', values: S.map(x => x.exp + x.salary), c: 5 }];
  // ---- money-flow & voucher charts (same window as the tabs) ----
  const bi = d => B.findIndex(b => d >= b.from && d <= b.to), inW = d => d >= from && d <= to;
  const cashIn = S.map(x => x.cash + x.bank + x.wallet), cashOut = S.map(() => 0), purch = S.map(() => 0);
  D.receipts.forEach(r => { const i = bi(r.date); if (i >= 0) cashIn[i] += n(r.amount); });
  [...D.supplierPayments, ...D.expenses, ...D.employeeTx].forEach(r => { const i = bi(r.date); if (i >= 0) cashOut[i] += n(r.amount); });
  D.purchases.forEach(p => { if (p.supplier === 'OPENING') return; const i = bi(p.date); if (i >= 0) purch[i] += n(p.qty) * n(p.rate); });
  const expTot = S.map(x => x.exp + x.salary);
  const cIn = { name: 'Cash In (Receipts)', values: cashIn.map(Math.round), c: 7 }, cOut = { name: 'Cash Out (Payments + Expenses)', values: cashOut.map(Math.round), c: 8 };
  const vS = { name: 'Sales', values: S.map(x => Math.round(x.sales)), c: 0 }, vP = { name: 'Purchases', values: purch.map(Math.round), c: 1 }, vE = { name: 'Expenses', values: expTot.map(Math.round), c: 2 };
  const byCust = {}; D.shifts.filter(s => inW(s.date)).forEach(s => { const t = shiftTotals(s); byCust.CASH = (byCust.CASH || 0) + (t.total - t.credit); (s.credit || []).forEach(c => { const k = c.customer || '(blank)'; byCust[k] = (byCust[k] || 0) + n(c.amount); }); });
  const expPurpose = {}; D.expenses.filter(e => inW(e.date) && e.category !== 'OWNER DRAWINGS').forEach(e => { const k = e.type || '(blank)'; expPurpose[k] = (expPurpose[k] || 0) + n(e.amount); });
  if (W.salary) expPurpose.SALARIES = (expPurpose.SALARIES || 0) + W.salary;
  const vSum = (list, f) => list.filter(r => inW(r.date)).reduce((q, r) => q + f(r), 0);
  const mixItems = [{ label: 'Sales', value: tot('sales'), c: 0 }, { label: 'Purchases', value: sum(purch), c: 1 }, { label: 'Expenses', value: sum(expTot), c: 2 }, { label: 'Receipts', value: vSum(D.receipts, r => n(r.amount)), c: 3 }, { label: 'Payments', value: vSum(D.supplierPayments, r => n(r.amount)), c: 4 }];
  const gtbl = (title, sub, chart, lg, head, rows) => tcard(title, sub, chart, lg, head, rows);
  view().innerHTML = `<h2>Dashboard <small class="muted">${today()}</small></h2>
  <div class="tabs noprint">${Object.entries(PERIODS).map(([k2, v]) => `<button class="btn ${k2 === dashP ? 'on' : ''}" data-p="${k2}">${v.l}</button>`).join('')}</div>
  ${warn.length ? `<div class="card" style="border-color:var(--bad)"><b class="neg">⚠ Stock shortage detected</b> – sales exceed recorded purchases for: ${warn.map(([i, x]) => `${esc(i)} (${fmt(x.short)})`).join(', ')}. Enter the missing purchase or opening stock so FIFO profit is correct.</div>` : ''}
  <div class="grid g4">
    ${k(P.cur + ' sales', money(cur.sales), delta(cur.sales, prv.sales))}
    ${k(P.cur + ' gross profit (FIFO)', sign(cur.gross), `Margin ${fmt(cur.margin, 1)}% · ` + delta(cur.gross, prv.gross))}
    ${k(P.cur + ' net profit', sign(cur.net), `Expenses ${money(cur.exp + cur.salary)} · ` + delta(cur.net, prv.net))}
    ${k(P.cur + ' fuel litres', fmt(Object.values(cur.lit).reduce((q, x) => q + x, 0), 0), fuels.map(f => `${esc(f)} ${fmt(cur.lit[f] || 0, 0)}`).join(' · '))}
    ${k('Stock value (FIFO)', money(stockVal), 'at purchase cost')}
    ${k('Customers owe you', money(recv), 'receivable')}
    ${k('You owe suppliers', money(pay), 'payable')}
    ${k('Cash in hand', money(cb.bal.cash), `Bank ${money(cb.bal.bank)} · Wallet ${money(cb.bal.wallet)}`)}
  </div>
  <h3>Cash flow &amp; vouchers <small class="muted">(${P.win})</small></h3>
  <div class="charts">
    ${gtbl('Cash In vs Cash Out', 'Money received vs money paid out', barChart({ labels, series: [cIn, cOut] }), legend([cIn, cOut]), ['Period', 'Cash In', 'Cash Out'], labels.map((l, i) => [l, money(cashIn[i]), money(cashOut[i])]))}
    ${gtbl('Sales / Purchases / Expenses', 'Voucher values', barChart({ labels, series: [vS, vP, vE] }), legend([vS, vP, vE]), ['Period', 'Sales', 'Purchases', 'Expenses'], labels.map((l, i) => [l, money(vS.values[i]), money(vP.values[i]), money(vE.values[i])]))}
  </div>
  <div class="charts g3" style="margin-top:12px">
    ${gtbl('Sales by Customer', P.win, donut({ items: topN(byCust) }), '', ['Customer', 'Sales'], Object.entries(byCust).sort((a, b) => b[1] - a[1]).map(([k2, v]) => [esc(k2), money(v)]))}
    ${gtbl('Expenses by Purpose', P.win, donut({ items: topN(expPurpose) }), '', ['Purpose', 'Amount'], Object.entries(expPurpose).sort((a, b) => b[1] - a[1]).map(([k2, v]) => [esc(k2), money(v)]))}
    ${gtbl('Voucher Mix (value)', P.win, donut({ items: mixItems }), '', ['Voucher', 'Value'], mixItems.map(m => [m.label, money(m.value)]))}
  </div>
  <h3>${P.l} analysis <small class="muted">(${P.win}: ${from} → ${to})</small></h3>
  <div class="charts">
    ${card('Sales vs profit', barChart({ labels, series: [sSales, sGross, sNet] }), legend([sSales, sGross, sNet]))}
    ${card('Fuel litres sold', barChart({ labels, series: fl, stacked: true }), legend(fl))}
    ${card('Cost structure', barChart({ labels, series: cs, stacked: true }), legend(cs), '(FIFO cost + expenses)')}
    ${card('Gross margin %', lineChart({ labels, series: [{ name: 'Gross margin %', values: S.map(x => +x.margin.toFixed(2)), c: 4, suffix: '%' }], fmtY: v => v + '%' }))}
    ${card('Sales mix by product', donut({ items: Object.entries(mix).map(([label, value], i) => ({ label, value, c: i })) }))}
    ${card('How customers paid', donut({ items: [{ label: 'Cash', value: tot('cash'), c: 0 }, { label: 'Credit', value: tot('credit'), c: 1 }, { label: 'Bank / card', value: tot('bank'), c: 2 }, { label: 'EasyPaisa / Jazz', value: tot('wallet'), c: 3 }] }))}
    ${card('Profit by fuel', hbar({ items: noz.fuels.map(x => ({ label: x.name, value: Math.round(x.profit), c: x.profit < 0 ? 3 : 0 })) }), '', '(FIFO)')}
    ${card('Profit by oil / lube item', hbar({ items: noz.products.filter(x => x.type !== 'fuel').map(x => ({ label: x.name, value: Math.round(x.profit), c: x.profit < 0 ? 3 : 1 })), max: 12 }), '', '(FIFO)')}
    ${card('Expenses by type', hbar({ items: Object.entries(exp).map(([label, value]) => ({ label, value: Math.round(value), c: 3 })) }))}
    ${card('Top customer balances', hbar({ items: rc.map(x => ({ label: x.name, value: Math.round(x.b), c: 2 })) }))}
  </div>`;
  view().onclick = e => { const g = e.target.closest('[data-tg]'); if (g) { const c = g.closest('.card'); const on = c.classList.toggle('tview'); g.textContent = on ? '📊 Chart' : '▦ Table'; return; } const t = e.target.closest('[data-p]'); if (t) { dashP = t.dataset.p; PAGES.dashboard(); } };
};

/* ----- Daily entry ----- */
let E = null;
function newEntry(date, shift) {
  const id = date + '_' + shift, ex = D.shifts.find(s => s.id === id);
  if (ex) return JSON.parse(JSON.stringify(ex));
  return { id, date, shift, readings: D.nozzles.slice().sort((a, b) => (a.item || '').localeCompare(b.item || '') || byName(a, b)).map(z => ({ nozzle: z.name, item: z.item, emp: '', open: lastClosing(z.name, date, shift), close: '', testing: '', rate: n(itemByName(z.item)?.rate) || '' })), oil: [], credit: [], bank: '', wallet: '', cashCounted: '', note: '' };
}
PAGES.entry = () => { if (!E) E = newEntry(today(), '1'); drawEntry(); };
function drawEntry() {
  const v = view(), emps = names('employees')();
  const inp = (s, i, k, val, cls = '', ex = '') => `<input class="${cls}" data-s="${s}" data-i="${i}" data-k="${k}" value="${esc(val)}" ${ex}>`;
  const sel = (s, i, k, list, val, blank) => `<select data-s="${s}" data-i="${i}" data-k="${k}">${opts(list, val, blank)}</select>`;
  const recent = D.shifts.slice().sort((a, b) => (b.date + b.shift).localeCompare(a.date + a.shift)).slice(0, 12);
  v.innerHTML = `<h2>Daily Entry <small class="muted">(shift meter readings → everything else is automatic)</small></h2>
  <div class="card form">
    <label>Date<input type="date" data-s="h" data-k="date" value="${E.date}"></label>
    <label>Shift<select data-s="h" data-k="shift">${Object.entries(SHIFTS).map(([k, l]) => `<option value="${k}"${k === E.shift ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <label>Employee for all nozzles<select id="allEmp">${opts(emps, '', '— choose —')}</select></label>
    <span>${D.shifts.some(s => s.id === E.id) ? '<span class="tag good">saved shift – editing</span>' : '<span class="tag warn">new shift</span>'}</span>
  </div>
  <h3>Pump nozzles</h3>
  <div class="tbl"><table><thead><tr><th>Nozzle</th><th>Employee</th><th class="num">Opening</th><th class="num">Closing</th><th class="num">Sale L</th><th class="num">Testing L</th><th class="num">Net L</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>
  ${E.readings.map((r, i) => `<tr><td>${esc(r.nozzle)}</td><td>${sel('r', i, 'emp', emps, r.emp, '—')}</td><td>${inp('r', i, 'open', r.open, 'n', 'type="number" step="any"')}</td><td>${inp('r', i, 'close', r.close, 'n', 'type="number" step="any"')}</td><td class="num" id="rs${i}"></td><td>${inp('r', i, 'testing', r.testing, 'n', 'type="number" step="any"')}</td><td class="num" id="rn${i}"></td><td>${inp('r', i, 'rate', r.rate, 'n', 'type="number" step="any"')}</td><td class="num" id="ra${i}"></td></tr>`).join('') || '<tr><td colspan="9" class="muted">No nozzles – add them in Masters → Nozzles (or load starter data in Settings).</td></tr>'}
  </tbody></table></div>
  <h3>Lube / oil sales <button class="btn sm" data-act="addOil">+ row</button></h3>
  ${E.oil.length ? `<div class="tbl"><table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Total</th><th></th></tr></thead><tbody>${E.oil.map((o, i) => `<tr><td>${sel('o', i, 'item', itemNames('oil')(), o.item, '— item —')}</td><td>${inp('o', i, 'qty', o.qty, 'n', 'type="number" step="any"')}</td><td>${inp('o', i, 'rate', o.rate, 'n', 'type="number" step="any"')}</td><td class="num" id="ot${i}"></td><td><button class="btn sm danger" data-act="delOil" data-i="${i}">✕</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No oil sales this shift.</p>'}
  <h3>Credit sales (part of the sales above) <button class="btn sm" data-act="addCr">+ row</button></h3>
  ${E.credit.length ? `<div class="tbl"><table><thead><tr><th>Customer</th><th>Item</th><th>Vehicle</th><th>No.</th><th class="num">Amount</th><th class="num">Rate</th><th class="num">Qty</th><th class="num">Incentive/L</th><th class="num">Net due</th><th></th></tr></thead><tbody>${E.credit.map((c, i) => `<tr><td>${sel('c', i, 'customer', names('customers')(), c.customer, '— customer —')}</td><td>${sel('c', i, 'item', itemNames()(), c.item)}</td><td>${sel('c', i, 'vehicleType', ['LONG VEHICLE', 'SHORT VEHICLE', 'Dumper', 'Boser', 'Other'], c.vehicleType, '—')}</td><td>${inp('c', i, 'vehicleNo', c.vehicleNo)}</td><td>${inp('c', i, 'amount', c.amount, 'n', 'type="number" step="any"')}</td><td>${inp('c', i, 'rate', c.rate, 'n', 'type="number" step="any"')}</td><td class="num" id="cq${i}"></td><td>${inp('c', i, 'incentive', c.incentive, 'n', 'type="number" step="any"')}</td><td class="num" id="cn${i}"></td><td><button class="btn sm danger" data-act="delCr" data-i="${i}">✕</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No credit sales this shift.</p>'}
  <h3>Settlement</h3>
  <div class="card"><div class="form"><label>Bank / card received<input type="number" step="any" data-s="h" data-k="bank" value="${esc(E.bank)}"></label><label>EasyPaisa / Jazz received<input type="number" step="any" data-s="h" data-k="wallet" value="${esc(E.wallet)}"></label><label>Cash actually handed over (optional)<input type="number" step="any" data-s="h" data-k="cashCounted" value="${esc(E.cashCounted)}"></label><label>Note<input data-s="h" data-k="note" value="${esc(E.note)}"></label></div>
  <div class="sum" id="esum" style="margin-top:12px"></div></div>
  <div class="row"><button class="btn primary" data-act="save">💾 Save shift</button>${D.shifts.some(s => s.id === E.id) ? '<button class="btn danger" data-act="delShift">Delete shift</button>' : ''}</div>
  <h3>Recent shifts</h3>${table(['Date', 'Shift', { h: 'Total sale', n: 1 }, { h: 'Credit', n: 1 }, { h: 'Cash', n: 1 }, { h: 'Gross profit (FIFO)', n: 1 }, ''], recent.map(s => { const t = shiftTotals(s); const gp = Object.values(C.shiftItem).filter(x => x.shiftId === s.id).reduce((a, x) => a + x.profit, 0) - t.incentive; return [s.date, s.shift, money(t.total), money(t.credit), money(t.cash), sign(gp), `<button class="btn sm" data-act="load" data-id="${s.id}">Open</button>`]; }))}`;
  refreshEntry();
}
function refreshEntry() {
  const set = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
  E.readings.forEach((r, i) => { const has = r.close !== '' && r.close != null; set('rs' + i, has ? fmt(Math.max(0, n(r.close) - n(r.open))) : ''); set('rn' + i, has ? fmt(netL(r)) : ''); set('ra' + i, has ? money(netL(r) * n(r.rate)) : ''); });
  E.oil.forEach((o, i) => set('ot' + i, money(n(o.qty) * n(o.rate))));
  E.credit.forEach((c, i) => { const x = creditCalc(c); set('cq' + i, fmt(x.qty)); set('cn' + i, money(x.net)); });
  const t = shiftTotals(E), e = document.getElementById('esum'); if (!e) return;
  const b = (l, v) => `<div><small>${l}</small>${v}</div>`;
  e.innerHTML = b('Fuel litres', fmt(t.fuelL)) + b('Fuel sale', money(t.fuel)) + b('Oil sale', money(t.oil)) + b('TOTAL SALE', money(t.total)) + b('Credit', money(t.credit)) + b('Bank + Wallet', money(t.bank + t.wallet)) + b('CASH (auto)', money(t.cash)) + (t.short == null ? '' : b('Short / excess', sign(t.short)));
}
async function saveEntry() {
  const s = JSON.parse(JSON.stringify(E));
  s.oil = s.oil.filter(o => o.item && n(o.qty)); s.credit = s.credit.filter(c => c.customer && n(c.amount));
  for (const r of s.readings) if (r.close !== '' && n(r.close) < n(r.open) && !confirm(`${r.nozzle}: closing is less than opening. Save anyway?`)) return;
  if (!s.readings.some(r => r.close !== '') && !s.oil.length) return toast('Enter at least one closing reading or oil sale');
  const { id, ...data } = s; data.updatedAt = Date.now();
  try { await DB.save('shifts', id, data); toast('Shift saved – stock, FIFO cost, ledgers & P&L updated'); E = newEntry(E.date, E.shift); drawEntry(); } catch (e) { toast('Save failed: ' + e.message); }
}
function bindEntryEvents() {
  const v = view();
  v.addEventListener('input', e => {
    const t = e.target, s = t.dataset.s; if (!s || page !== 'entry') return;
    if (s === 'h') { if (t.dataset.k === 'date' || t.dataset.k === 'shift') return; E[t.dataset.k] = t.value; }
    else {
      const row = E[{ r: 'readings', o: 'oil', c: 'credit' }[s]][t.dataset.i]; row[t.dataset.k] = t.value;
      if (t.dataset.k === 'item' && (s === 'o' || s === 'c')) { row.rate = n(itemByName(t.value)?.rate) || ''; return drawEntry(); }
    }
    refreshEntry();
  });
  v.addEventListener('change', e => {
    if (page !== 'entry') return; const t = e.target;
    if (t.dataset.s === 'h' && (t.dataset.k === 'date' || t.dataset.k === 'shift')) { E[t.dataset.k] = t.value; E = newEntry(E.date, E.shift); drawEntry(); }
    if (t.id === 'allEmp' && t.value) { E.readings.forEach(r => r.emp = t.value); drawEntry(); }
  });
  v.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b || page !== 'entry') return; const a = b.dataset.act, i = +b.dataset.i;
    if (a === 'addOil') { E.oil.push({ item: '', qty: '', rate: '' }); drawEntry(); }
    if (a === 'delOil') { E.oil.splice(i, 1); drawEntry(); }
    if (a === 'addCr') { const f = D.items.find(x => x.type === 'fuel'); E.credit.push({ customer: '', item: f?.name || '', vehicleType: '', vehicleNo: '', amount: '', rate: n(f?.rate) || '', incentive: '' }); drawEntry(); }
    if (a === 'delCr') { E.credit.splice(i, 1); drawEntry(); }
    if (a === 'save') saveEntry();
    if (a === 'load') { const s = D.shifts.find(x => x.id === b.dataset.id); E = newEntry(s.date, s.shift); drawEntry(); scrollTo(0, 0); }
    if (a === 'delShift' && confirm('Delete this whole shift?')) { await DB.remove('shifts', E.id); E = newEntry(E.date, E.shift); drawEntry(); toast('Shift deleted'); }
  });
}

/* ----- Purchases, expenses, etc ----- */
PAGES.purchases = () => crudPage({
  col: 'purchases', title: 'Purchases (stock in – FIFO batches)', note: 'Every purchase becomes a FIFO batch. Sales automatically consume the oldest batch first. Use supplier “OPENING” for opening stock.',
  fields: [dateF, { k: 'supplier', l: 'Supplier', t: 'text', req: true, list: () => ['OPENING', ...names('suppliers')()], def: () => D.suppliers[0]?.name }, { k: 'item', l: 'Item', t: 'select', opts: itemNames(), req: true }, { k: 'qty', l: 'Qty (L / units)', t: 'number', req: true }, { k: 'rate', l: 'Cost rate', t: 'number', req: true }, { k: 'invoice', l: 'Invoice / note' }],
  cols: [{ h: 'Date', f: r => r.date }, { h: 'Supplier', f: r => esc(r.supplier) }, { h: 'Item', f: r => esc(r.item) }, { h: 'Qty', n: 1, f: r => fmt(r.qty) }, { h: 'Rate', n: 1, f: r => fmt(r.rate) }, { h: 'Amount', n: 1, f: r => money(n(r.qty) * n(r.rate)) }, { h: 'Left (FIFO)', n: 1, f: r => { const b = C.fifo.stock[r.item]?.batches.find(x => x.ref === 'P:' + r.id); return b ? fmt(b.rem) : '<span class="muted">sold</span>'; } }, { h: 'Note', f: r => esc(r.invoice) }],
  total: rows => 'Total ' + money(rows.reduce((s, r) => s + n(r.qty) * n(r.rate), 0)), validate: d => (n(d.qty) <= 0 || n(d.rate) < 0) ? 'Qty must be > 0' : ''
});
PAGES.expenses = () => crudPage({
  col: 'expenses', title: 'Expenses', fields: [dateF, { k: 'type', l: 'Expense type', req: true, list: () => ['FUEL', 'FOOD', 'GUEST', 'TRAVEL', 'BILL', 'REPAIR', 'RENT', 'OTHER', ...new Set(D.expenses.map(e => e.type))] }, { k: 'amount', l: 'Amount', t: 'number', req: true }, { k: 'category', l: 'Category', t: 'select', opts: () => ['OFFICE EXP', 'OWNER DRAWINGS'], def: 'OFFICE EXP' }, modeF, { k: 'desc', l: 'Description' }],
  cols: [{ h: 'Date', f: r => r.date }, { h: 'Type', f: r => esc(r.type) }, { h: 'Amount', n: 1, f: r => money(r.amount) }, { h: 'Category', f: r => esc(r.category) }, { h: 'Mode', f: r => r.mode || 'cash' }, { h: 'Description', f: r => esc(r.desc) }],
  total: rows => 'Total ' + money(rows.reduce((s, r) => s + n(r.amount), 0))
});
PAGES.receipts = () => crudPage({
  col: 'receipts', title: 'Customer Receipts (money received from credit customers)', fields: [dateF, { k: 'customer', l: 'Customer', t: 'select', opts: names('customers'), req: true }, { k: 'amount', l: 'Amount received', t: 'number', req: true }, modeF, { k: 'note', l: 'Note' }],
  cols: [{ h: 'Date', f: r => r.date }, { h: 'Customer', f: r => esc(r.customer) }, { h: 'Amount', n: 1, f: r => money(r.amount) }, { h: 'Mode', f: r => r.mode || 'cash' }, { h: 'Note', f: r => esc(r.note) }],
  total: rows => 'Total ' + money(rows.reduce((s, r) => s + n(r.amount), 0))
});
PAGES.supplierPayments = () => crudPage({
  col: 'supplierPayments', title: 'Supplier Payments', fields: [dateF, { k: 'supplier', l: 'Supplier', t: 'select', opts: names('suppliers'), req: true }, { k: 'amount', l: 'Amount paid', t: 'number', req: true }, modeF, { k: 'note', l: 'Note' }],
  cols: [{ h: 'Date', f: r => r.date }, { h: 'Supplier', f: r => esc(r.supplier) }, { h: 'Amount', n: 1, f: r => money(r.amount) }, { h: 'Mode', f: r => r.mode || 'cash' }, { h: 'Note', f: r => esc(r.note) }],
  total: rows => 'Total ' + money(rows.reduce((s, r) => s + n(r.amount), 0))
});
PAGES.employees = () => {
  const mo = today().slice(0, 7);
  crudPage({
    col: 'employeeTx', title: 'Employee Salary & Advances', fields: [dateF, { k: 'employee', l: 'Employee', t: 'select', opts: names('employees'), req: true }, { k: 'type', l: 'Type', t: 'select', opts: () => ['advance', 'salary'], def: 'salary' }, { k: 'amount', l: 'Amount', t: 'number', req: true }, { k: 'forMonth', l: 'For month', t: 'month', def: mo }, modeF],
    cols: [{ h: 'Date', f: r => r.date }, { h: 'Employee', f: r => esc(r.employee) }, { h: 'Type', f: r => r.type }, { h: 'For month', f: r => r.forMonth || '' }, { h: 'Amount', n: 1, f: r => money(r.amount) }, { h: 'Mode', f: r => r.mode || 'cash' }], total: rows => 'Total ' + money(rows.reduce((s, r) => s + n(r.amount), 0))
  });
  const sum = D.employees.slice().sort(byName).map(e => { const tx = D.employeeTx.filter(t => t.employee === e.name), adv = tx.filter(t => t.type === 'advance').reduce((s, t) => s + n(t.amount), 0), sal = tx.filter(t => t.type === 'salary').reduce((s, t) => s + n(t.amount), 0), thisM = tx.filter(t => t.type === 'salary' && t.forMonth === mo).reduce((s, t) => s + n(t.amount), 0); return [esc(e.name), esc(e.designation), money(e.salary), money(thisM), money(n(e.salary) - thisM), money(adv), money(sal)]; });
  view().insertAdjacentHTML('beforeend', `<h3>Summary (${mo})</h3>` + table(['Employee', 'Designation', { h: 'Monthly salary', n: 1 }, { h: 'Paid this month', n: 1 }, { h: 'Due this month', n: 1 }, { h: 'Advances (all)', n: 1 }, { h: 'Salary paid (all)', n: 1 }], sum));
};
PAGES.adjust = () => {
  crudPage({
    col: 'adjustments', title: 'Stock Gain / Loss adjustments', note: 'Use negative qty for loss (evaporation, short), positive for gain. Loss consumes the oldest FIFO batch and is charged to profit.',
    fields: [dateF, { k: 'item', l: 'Item', t: 'select', opts: itemNames(), req: true }, { k: 'qty', l: 'Qty (+gain / −loss)', t: 'number', req: true }, { k: 'note', l: 'Note' }],
    cols: [{ h: 'Date', f: r => r.date }, { h: 'Item', f: r => esc(r.item) }, { h: 'Qty', n: 1, f: r => sign(r.qty) }, { h: 'FIFO value of loss', n: 1, f: r => C.adjCost[r.id] ? money(C.adjCost[r.id]) : '' }, { h: 'Note', f: r => esc(r.note) }]
  });
};

/* ----- Stock ----- */
PAGES.stock = () => {
  const rows = D.items.slice().sort((a, b) => (a.type === b.type ? byName(a, b) : a.type === 'fuel' ? -1 : 1)).map(i => {
    const s = C.fifo.stock[i.name] || { qty: 0, value: 0, batches: [], short: 0 };
    const oldest = s.batches[0]?.rate ?? s.lastRate ?? 0, avg = s.qty > 0 ? s.value / s.qty : 0, mar = n(i.rate) - oldest;
    const zero = s.batches.some(b => b.rate === 0);
    const dip = i.type === 'fuel' ? `<input class="n" style="width:90px" type="number" step="any" id="dip_${esc(i.name)}" placeholder="dip L"> <button class="btn sm" data-dip="${esc(i.name)}">Post diff</button>` : '';
    return [esc(i.name) + (zero ? ' <span class="tag bad">0-cost batch</span>' : ''), i.type, `<span class="${s.qty < 0 ? 'neg' : ''}">${fmt(s.qty)}</span>`, money(s.value), fmt(avg), fmt(oldest), fmt(i.rate), sign(mar * 1), `<details><summary>${s.batches.length} batch(es)</summary>${s.batches.map(b => `${b.date}: ${fmt(b.rem)} @ ${fmt(b.rate)}`).join('<br>')}</details>`, dip];
  });
  const tv = Object.values(C.fifo.stock).reduce((s, x) => s + x.value, 0);
  view().innerHTML = `<h2>Stock &amp; FIFO valuation</h2><p class="muted">Book stock = purchases − sales ± adjustments. Cost is taken from the oldest purchase batch first. “Margin/unit” = current sale rate − oldest remaining cost. For tanks, enter the physical dip reading and post the difference as a gain/loss.</p>
  <div class="card kpi"><div class="l">Total stock value (FIFO)</div><div class="v">${money(tv)}</div></div>
  ${table(['Item', 'Type', { h: 'Book qty', n: 1 }, { h: 'Value', n: 1 }, { h: 'Avg cost', n: 1 }, { h: 'Next-out cost (FIFO)', n: 1 }, { h: 'Sale rate', n: 1 }, { h: 'Margin/unit', n: 1 }, 'Batches', 'Dip check'], rows)}`;
  view().onclick = async e => {
    const b = e.target.closest('[data-dip]'); if (!b) return; const item = b.dataset.dip, el = document.getElementById('dip_' + item); if (el.value === '') return toast('Enter dip quantity');
    const diff = n(el.value) - n(C.fifo.stock[item]?.qty); if (Math.abs(diff) < 0.001) return toast('No difference');
    if (confirm(`${item}: book ${fmt(C.fifo.stock[item]?.qty)} L, dip ${fmt(el.value)} L → post ${diff > 0 ? 'GAIN' : 'LOSS'} of ${fmt(diff)} L?`)) { await DB.save('adjustments', null, { date: today(), item, qty: diff, note: 'Dip reading', createdAt: Date.now() }); toast('Adjustment posted'); }
  };
};

/* ----- Day book ----- */
let dbDate = null;
PAGES.daybook = () => {
  dbDate ||= today(); const d = dbDate, v = view();
  const sh = D.shifts.filter(s => s.date === d), T = sh.map(shiftTotals), S = k => T.reduce((a, t) => a + t[k], 0);
  const items = Object.values(Object.values(C.shiftItem).filter(x => x.date === d).reduce((m, x) => { const a = m[x.item] ||= { item: x.item, qty: 0, rev: 0, cogs: 0, profit: 0 }; a.qty += x.qty; a.rev += x.rev; a.cogs += x.cogs; a.profit += x.profit; return m; }, {})).sort((a, b) => (itemByName(a.item)?.type === 'oil') - (itemByName(b.item)?.type === 'oil') || a.item.localeCompare(b.item));
  const cb = cashBook(); let cd = cb.days[d]; const zero = { cash: { in: 0, out: 0 }, bank: { in: 0, out: 0 }, wallet: { in: 0, out: 0 } };
  const prev = Object.keys(cb.days).filter(x => x < d).sort().pop(); const open = cd?.open || (prev ? cb.days[prev].close : { cash: n(settings().openingCash), bank: n(settings().openingBank), wallet: 0 });
  cd ||= { ...zero, close: open };
  const rc = D.receipts.filter(r => r.date === d), ex = D.expenses.filter(r => r.date === d), pu = D.purchases.filter(r => r.date === d), sp = D.supplierPayments.filter(r => r.date === d), et = D.employeeTx.filter(r => r.date === d);
  v.innerHTML = `<div class="row noprint"><h2 style="margin:0">Day Book</h2><input type="date" id="dbd" value="${d}"><button class="btn" id="prev">◀</button><button class="btn" id="next">▶</button><button class="btn" onclick="print()">🖨 Print</button></div>
  <div class="grid g4"><div class="card kpi"><div class="l">Total sales</div><div class="v">${money(S('total'))}</div></div><div class="card kpi"><div class="l">Cash sale</div><div class="v">${money(S('cash'))}</div></div><div class="card kpi"><div class="l">Credit sale</div><div class="v">${money(S('credit'))}</div></div><div class="card kpi"><div class="l">Gross profit (FIFO)</div><div class="v">${sign(items.reduce((a, x) => a + x.profit, 0) - S('incentive'))}</div></div></div>
  <div class="charts">${(() => {
    const prod = items.map(x => x.item), sr = [{ name: 'Sales', values: items.map(x => Math.round(x.rev)), c: 0 }, { name: 'FIFO cost', values: items.map(x => Math.round(x.cogs)), c: 3 }, { name: 'Profit', values: items.map(x => Math.round(x.profit)), c: 1 }];
    const shs = sh.slice().sort((a, b) => a.shift - b.shift), ss = [{ name: 'Fuel', values: shs.map(x => Math.round(shiftTotals(x).fuel)), c: 0 }, { name: 'Oil', values: shs.map(x => Math.round(shiftTotals(x).oil)), c: 1 }];
    const tr = series(makeBuckets('daily', 7, d), C), ts = [{ name: 'Sales', values: tr.map(x => Math.round(x.sales)), c: 0 }, { name: 'Gross profit', values: tr.map(x => Math.round(x.gross)), c: 1 }];
    const nz = salesPL(d, d, C).nozzles;
    return card('Sales, FIFO cost & profit by product', barChart({ labels: prod, series: sr, h: 220 }), legend(sr)) + card('Sales by shift', barChart({ labels: shs.map(x => 'Shift ' + x.shift), series: ss, stacked: true, h: 220 }), legend(ss)) + card('Payment split', donut({ items: [{ label: 'Cash', value: S('cash'), c: 0 }, { label: 'Credit', value: S('credit'), c: 1 }, { label: 'Bank / card', value: S('bank'), c: 2 }, { label: 'EasyPaisa / Jazz', value: S('wallet'), c: 3 }] })) + card('Litres by nozzle', hbar({ items: nz.map(x => ({ label: x.name, value: Math.round(x.qty), c: x.item === 'PETROL' ? 0 : 2 })), max: 12 })) + card('Last 7 days to ' + d, lineChart({ labels: tr.map(x => x.label), series: ts, h: 200 }), legend(ts));
  })()}</div>
  <h3>Sales by product</h3>${table(['Product', { h: 'Qty', n: 1 }, { h: 'Sale amount', n: 1 }, { h: 'FIFO cost', n: 1 }, { h: 'Profit', n: 1 }], items.map(x => [esc(x.item), fmt(x.qty), money(x.rev), money(x.cogs), sign(x.profit)]), ['Total', '', money(items.reduce((a, x) => a + x.rev, 0)), money(items.reduce((a, x) => a + x.cogs, 0)), money(items.reduce((a, x) => a + x.profit, 0))])}
  <h3>Shifts</h3>${table(['Shift', { h: 'Sale', n: 1 }, { h: 'Credit', n: 1 }, { h: 'Bank', n: 1 }, { h: 'Wallet', n: 1 }, { h: 'Cash', n: 1 }, { h: 'Short/excess', n: 1 }], sh.sort((a, b) => a.shift - b.shift).map(s => { const t = shiftTotals(s); return [SHIFTS[s.shift], money(t.total), money(t.credit), money(t.bank), money(t.wallet), money(t.cash), t.short == null ? '' : sign(t.short)]; }))}
  <h3>Cash flow summary</h3>${table(['', { h: 'Opening', n: 1 }, { h: 'In', n: 1 }, { h: 'Out', n: 1 }, { h: 'Closing', n: 1 }], ['cash', 'bank', 'wallet'].map(k => [k.toUpperCase(), money(open[k]), money(cd[k].in), money(cd[k].out), `<b>${money(cd.close[k])}</b>`]))}
  <div class="grid g2"><div>${'<h3>Customer receipts</h3>' + table(['Customer', { h: 'Amount', n: 1 }, 'Mode'], rc.map(r => [esc(r.customer), money(r.amount), r.mode || 'cash']))}</div><div>${'<h3>Expenses / salaries / supplier payments</h3>' + table(['What', { h: 'Amount', n: 1 }, 'Mode'], [...ex.map(r => [esc(r.type + ' ' + (r.desc || '')), money(r.amount), r.mode || 'cash']), ...et.map(r => [esc(r.employee + ' ' + r.type), money(r.amount), r.mode || 'cash']), ...sp.map(r => [esc('Paid ' + r.supplier), money(r.amount), r.mode || 'cash'])])}</div></div>
  <h3>Purchases today</h3>${table(['Supplier', 'Item', { h: 'Qty', n: 1 }, { h: 'Rate', n: 1 }, { h: 'Amount', n: 1 }], pu.map(r => [esc(r.supplier), esc(r.item), fmt(r.qty), fmt(r.rate), money(n(r.qty) * n(r.rate))]))}`;
  $('#dbd').onchange = e => { dbDate = e.target.value; PAGES.daybook(); }; $('#prev').onclick = () => { dbDate = addDays(d, -1); PAGES.daybook(); }; $('#next').onclick = () => { dbDate = addDays(d, 1); PAGES.daybook(); };
};

/* ----- Ledgers ----- */
let ledType = 'customer', ledParty = '';
PAGES.ledgers = () => {
  const cust = ledType === 'customer', list = cust ? D.customers : D.suppliers, f = cust ? customerLedger : supplierLedger;
  const all = list.slice().sort(byName).map(p => ({ name: p.name, b: f(p.name).balance }));
  const st = ledParty && list.some(p => p.name === ledParty) ? f(ledParty) : null;
  view().innerHTML = `<h2>Ledgers</h2><div class="row noprint"><button class="btn ${cust ? 'primary' : ''}" data-t="customer">Customers (receivable)</button><button class="btn ${!cust ? 'primary' : ''}" data-t="supplier">Suppliers (payable)</button></div>
  ${table(['Party', { h: cust ? 'Owes us' : 'We owe', n: 1 }, ''], all.map(x => [esc(x.name), sign(x.b), `<button class="btn sm" data-p="${esc(x.name)}">Statement</button>`]), ['Total', money(all.reduce((s, x) => s + x.b, 0)), ''])}
  ${st ? `<h3>${esc(ledParty)} – statement <button class="btn sm noprint" onclick="print()">Print</button></h3>${table(['Date', 'Description', { h: cust ? 'Credit sale' : 'Paid', n: 1 }, { h: cust ? 'Received' : 'Purchase', n: 1 }, { h: 'Balance', n: 1 }], [['', 'Opening balance', '', '', money(st.opening)], ...st.rows.map(r => [r.date, esc(r.desc), r.dr ? money(r.dr) : '', r.cr ? money(r.cr) : '', money(r.bal)])], ['', 'Closing', '', '', money(st.balance)])}` : ''}`;
  view().onclick = e => { const t = e.target.closest('[data-t]'), p = e.target.closest('[data-p]'); if (t) { ledType = t.dataset.t; ledParty = ''; PAGES.ledgers(); } if (p) { ledParty = p.dataset.p; PAGES.ledgers(); scrollTo(0, document.body.scrollHeight); } };
};

/* ----- Sales P&L by product (PETROL, DIESEL, each oil item) ----- */
let spFrom = null, spTo = null;
PAGES.salespl = () => {
  spFrom ||= monthStart(); spTo ||= today(); const R = salesPL(spFrom, spTo, C), t = today();
  const sum = a => ({ qty: a.reduce((q, x) => q + x.qty, 0), rev: a.reduce((q, x) => q + x.rev, 0), cogs: a.reduce((q, x) => q + x.cogs, 0) });
  const row = x => [esc(x.name), fmt(x.qty), fmt(x.avgSale), fmt(x.avgCost), money(x.rev), money(x.cogs), sign(x.profit), fmt(x.margin, 1) + '%', x.qty ? fmt(x.profit / x.qty) : ''];
  const foot = (l, a) => { const q = sum(a), p = q.rev - q.cogs; return [`<b>${l}</b>`, fmt(q.qty), q.qty ? fmt(q.rev / q.qty) : '', q.qty ? fmt(q.cogs / q.qty) : '', money(q.rev), money(q.cogs), sign(p), q.rev ? fmt(p / q.rev * 100, 1) + '%' : '', q.qty ? fmt(p / q.qty) : '']; };
  const H = u => ['', { h: u, n: 1 }, { h: 'Avg sale rate', n: 1 }, { h: 'Avg FIFO cost', n: 1 }, { h: 'Sales', n: 1 }, { h: 'FIFO cost', n: 1 }, { h: 'Profit', n: 1 }, { h: 'Margin', n: 1 }, { h: 'Profit / unit', n: 1 }];
  const fuelsL = R.fuels.slice().sort(byName), oils = R.products.filter(x => x.type !== 'fuel').sort(byName), all = R.products;
  const layers = Object.entries(R.layers).sort().map(([item, L]) => `<tr><td>${esc(item)}</td><td>${Object.values(L).sort((x, y) => x.est - y.est || x.rate - y.rate).map(x => `${fmt(x.qty)} @ ${fmt(x.rate)}${x.est ? ' <span class="tag warn">est.</span>' : ''}`).join(' &nbsp;|&nbsp; ')}</td></tr>`).join('');
  const bar = (list, c) => barChart({ labels: list.map(x => x.name), series: [{ name: 'Sales', values: list.map(x => Math.round(x.rev)), c: 0 }, { name: 'FIFO cost', values: list.map(x => Math.round(x.cogs)), c: 3 }, { name: 'Profit', values: list.map(x => Math.round(x.profit)), c: 1 }], h: 230 });
  const lg = legend([{ name: 'Sales', c: 0 }, { name: 'FIFO cost', c: 3 }, { name: 'Profit', c: 1 }]);
  const ws = startOf('weekly', t), ms = startOf('monthly', t), ys = startOf('yearly', t);
  view().innerHTML = `<div class="row noprint"><h2 style="margin:0">Sales Profit &amp; Loss – by product (FIFO cost)</h2></div>
  <div class="row noprint"><button class="btn" data-r="${t}|${t}">Today</button><button class="btn" data-r="${ws}|${t}">This week</button><button class="btn" data-r="${ms}|${t}">This month</button><button class="btn" data-r="${ys}|${t}">This year</button>
  <label style="flex-direction:row;align-items:center;gap:6px">From<input type="date" id="sf1" value="${spFrom}"></label><label style="flex-direction:row;align-items:center;gap:6px">To<input type="date" id="sf2" value="${spTo}"></label><button class="btn" onclick="print()">🖨 Print</button><button class="btn" id="spcsv">CSV</button></div>
  <p class="muted">Cost = oldest purchase batches first (FIFO). Every product is costed on its own: PETROL, DIESEL and each oil / lube item have their own FIFO stock. Nozzles are not used here.</p>
  ${R.short ? `<p class="neg">⚠ ${fmt(R.short)} units were sold without recorded stock – their cost is an estimate (last known rate) until the purchase is entered.</p>` : ''}
  <div class="grid g4">${[['Total sales', money(sum(all).rev)], ['Total FIFO cost', money(sum(all).cogs)], ['Gross profit', sign(sum(all).rev - sum(all).cogs)], ['Customer incentives', money(R.incentive)], ['Profit after incentives', sign(sum(all).rev - sum(all).cogs - R.incentive)]].map(([l, v]) => `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('')}</div>
  <div class="charts">${card('Petrol & diesel: sales, cost, profit', bar(fuelsL), lg)}${card('Oil / lube items: sales, cost, profit', bar(oils), lg)}${card('Profit per litre – fuels', hbar({ items: fuelsL.map(x => ({ label: x.name, value: +(x.qty ? x.profit / x.qty : 0).toFixed(2), c: 0 })), fmtV: v => fmt(v) }))}${card('Profit by oil / lube item', hbar({ items: oils.map(x => ({ label: x.name, value: Math.round(x.profit), c: x.profit < 0 ? 3 : 1 })), max: 12 }))}</div>
  <h3>Fuel (petrol &amp; diesel)</h3>${table(['Product', ...H('Litres').slice(1)], fuelsL.map(row), foot('Fuel total', fuelsL))}
  <h3>Oil / lube items (one by one)</h3>${table(['Item', ...H('Qty').slice(1)], oils.map(row), foot('Oil total', oils))}
  <h3>FIFO cost layers used in this period</h3><div class="tbl"><table><thead><tr><th>Item</th><th>Quantity @ purchase rate (oldest first)</th></tr></thead><tbody>${layers || '<tr><td colspan="2" class="muted">None</td></tr>'}</tbody></table></div>
  <h3>All products</h3>${table(['Product', ...H('Qty').slice(1)], [...fuelsL, ...oils].map(row), foot('Grand total', all))}`;
  const go = (f, tt) => { spFrom = f; spTo = tt; PAGES.salespl(); };
  view().onclick = e => { const r = e.target.closest('[data-r]'); if (r) go(...r.dataset.r.split('|')); };
  $('#sf1').onchange = e => go(e.target.value, spTo); $('#sf2').onchange = e => go(spFrom, e.target.value);
  $('#spcsv').onclick = () => csv('sales-pl', [['Type', 'Product', 'Qty', 'Sales', 'FIFO cost', 'Profit', 'Margin %'], ...[...fuelsL, ...oils].map(x => [x.type === 'fuel' ? 'Fuel' : 'Oil', x.name, x.qty, x.rev, x.cogs, x.profit, x.margin])]);
};

/* ----- P&L ----- */
let plFrom = null, plTo = null;
PAGES.pnl = () => {
  plFrom ||= monthStart(); plTo ||= today(); const P = pnl(plFrom, plTo, C);
  const rows = Object.entries(P.items).sort().map(([i, a]) => [esc(i), fmt(a.qty), money(a.rev), money(a.cogs), sign(a.rev - a.cogs), a.rev ? fmt((a.rev - a.cogs) / a.rev * 100, 1) + '%' : '']);
  view().innerHTML = `<div class="row noprint"><h2 style="margin:0">Profit &amp; Loss (FIFO)</h2><label style="flex-direction:row;align-items:center;gap:6px">From<input type="date" id="pf" value="${plFrom}"></label><label style="flex-direction:row;align-items:center;gap:6px">To<input type="date" id="pt" value="${plTo}"></label><button class="btn" onclick="print()">🖨 Print</button></div>
  ${P.short ? `<p class="neg">⚠ ${fmt(P.short)} units were sold without recorded stock; their cost used the last known rate.</p>` : ''}
  ${table(['Item', { h: 'Qty sold', n: 1 }, { h: 'Sales', n: 1 }, { h: 'FIFO cost', n: 1 }, { h: 'Gross profit', n: 1 }, { h: 'Margin', n: 1 }], rows, ['Total', '', money(P.rev), money(P.cogs), money(P.rev - P.cogs), ''])}
  <h3>Summary</h3>${table(['', { h: 'Amount', n: 1 }], [['Sales', money(P.rev)], ['− Customer incentives', money(P.incentive)], ['− FIFO cost of goods sold', money(P.cogs)], ['− Stock loss (FIFO)', money(P.adjLoss)], ['<b>Gross profit</b>', `<b>${sign(P.gross)}</b>`], ...Object.entries(P.exp).map(([k, v]) => ['− ' + esc(k), money(v)]), ['− Salaries', money(P.salary)], ['<b>NET PROFIT</b>', `<b>${sign(P.net)}</b>`], ['<span class="muted">Owner drawings (not an expense)</span>', money(P.drawings)]])}`;
  $('#pf').onchange = e => { plFrom = e.target.value; PAGES.pnl(); }; $('#pt').onchange = e => { plTo = e.target.value; PAGES.pnl(); };
};

/* ----- Masters & settings ----- */
const MASTER = {
  items: () => crudPage({ col: 'items', noMonth: 1, title: 'Items (fuel & oil)', note: 'Name is used as key in all records – avoid renaming items that already have transactions.', fields: [{ k: 'name', l: 'Name', req: true }, { k: 'type', l: 'Type', t: 'select', opts: () => ['fuel', 'oil'], def: 'oil' }, { k: 'unit', l: 'Unit', def: 'Liter' }, { k: 'rate', l: 'Sale rate', t: 'number' }], cols: [{ h: 'Name', f: r => esc(r.name) }, { h: 'Type', f: r => r.type }, { h: 'Unit', f: r => esc(r.unit) }, { h: 'Sale rate', n: 1, f: r => fmt(r.rate) }] }),
  nozzles: () => crudPage({ col: 'nozzles', noMonth: 1, title: 'Pump nozzles', fields: [{ k: 'name', l: 'Nozzle name', req: true }, { k: 'item', l: 'Fuel', t: 'select', opts: itemNames('fuel'), req: true }], cols: [{ h: 'Nozzle', f: r => esc(r.name) }, { h: 'Fuel', f: r => esc(r.item) }] }),
  customers: () => crudPage({ col: 'customers', noMonth: 1, title: 'Credit customers', fields: [{ k: 'name', l: 'Name', req: true }, { k: 'phone', l: 'Phone' }, { k: 'opening', l: 'Opening balance (owes us)', t: 'number', def: 0 }], cols: [{ h: 'Name', f: r => esc(r.name) }, { h: 'Phone', f: r => esc(r.phone) }, { h: 'Opening', n: 1, f: r => money(r.opening) }] }),
  suppliers: () => crudPage({ col: 'suppliers', noMonth: 1, title: 'Suppliers', fields: [{ k: 'name', l: 'Name', req: true }, { k: 'phone', l: 'Phone' }, { k: 'opening', l: 'Opening balance (we owe)', t: 'number', def: 0 }], cols: [{ h: 'Name', f: r => esc(r.name) }, { h: 'Phone', f: r => esc(r.phone) }, { h: 'Opening', n: 1, f: r => money(r.opening) }] }),
  staff: () => crudPage({ col: 'employees', noMonth: 1, title: 'Employees', fields: [{ k: 'name', l: 'Name', req: true }, { k: 'designation', l: 'Designation' }, { k: 'salary', l: 'Monthly salary', t: 'number', def: 0 }], cols: [{ h: 'Name', f: r => esc(r.name) }, { h: 'Designation', f: r => esc(r.designation) }, { h: 'Salary', n: 1, f: r => money(r.salary) }] }),
};
Object.keys(MASTER).forEach(k => PAGES['m_' + k] = MASTER[k]);
PAGES.settings = () => {
  const s = settings();
  view().innerHTML = `<h2>Settings</h2><form class="card form" id="sf"><label>Station name<input name="name" value="${esc(s.name || 'Tarnol Filling Station')}"></label><label>Opening cash in hand<input name="openingCash" type="number" step="any" value="${esc(s.openingCash ?? 0)}"></label><label>Opening bank balance<input name="openingBank" type="number" step="any" value="${esc(s.openingBank ?? 0)}"></label><button class="btn primary">Save</button></form>
  ${(() => {
    const st = s.startDate || today(), noz = D.nozzles.slice().sort((a, b) => (a.item || '').localeCompare(b.item || '') || byName(a, b)), openP = (it) => D.purchases.find(p => p.supplier === 'OPENING' && p.item === it);
    const itms = [...D.items.filter(i => i.type === 'fuel').sort(byName), ...D.items.filter(i => i.type === 'oil').sort(byName)];
    return `<div class="card"><h3 style="margin-top:0">Opening position <small class="muted">(the day you start entering in the software)</small></h3>
    <p class="muted">Enter the meter reading of every nozzle and the stock in the tanks / shelves as they were <b>at the start of the first shift you will enter</b>. The first Daily Entry then opens with these meters, and every later shift takes its opening from the previous closing automatically.</p>
    <div class="form"><label>Start date<input type="date" id="opd" value="${esc(st)}"></label></div>
    <h4>Nozzle opening meter readings</h4>
    <div class="tbl"><table><thead><tr><th>Nozzle</th><th>Fuel</th><th class="num">Opening meter</th></tr></thead><tbody>${noz.map(z => `<tr><td>${esc(z.name)}</td><td>${esc(z.item)}</td><td><input class="n" type="number" step="any" data-nz="${z.id}" value="${esc(z.openMeter ?? '')}"></td></tr>`).join('') || '<tr><td colspan="3" class="muted">No nozzles yet – add them in Setup → Nozzles.</td></tr>'}</tbody></table></div>
    <h4>Opening stock <small class="muted">(cost per litre / unit sets the FIFO cost of this stock)</small></h4>
    <div class="tbl"><table><thead><tr><th>Item</th><th>Type</th><th class="num">Opening qty</th><th class="num">Cost per unit</th></tr></thead><tbody>${itms.map(i => { const o = openP(i.name); return `<tr><td>${esc(i.name)}</td><td>${esc(i.type)}</td><td><input class="n" type="number" step="any" data-sq="${esc(i.name)}" value="${esc(o ? o.qty : '')}"></td><td><input class="n" type="number" step="any" data-sr="${esc(i.name)}" value="${esc(o ? o.rate : '')}"></td></tr>`; }).join('')}</tbody></table></div>
    <div class="row" style="margin-top:10px"><button class="btn primary" id="opsave">💾 Save opening position</button></div></div>`;
  })()}
  <div class="card"><h3 style="margin-top:0">Starter data</h3><p class="muted">Loads the nozzles, 2 fuels, 27 oil items, customers, employees and opening oil stock from your Excel file. Opening oil batches have cost 0 – edit them on the Purchases page. Safe to run on an empty database only.</p><button class="btn" id="seed">Load Tarnol starter data</button></div>
  <div class="card"><h3 style="margin-top:0">Backup</h3><div class="row"><button class="btn" id="bk">Download full backup (JSON)</button><label class="btn" style="flex-direction:row">Restore backup<input type="file" id="rs" accept=".json" hidden></label></div></div>`;
  $('#sf').onsubmit = async e => { e.preventDefault(); const q = k => e.target.querySelector(`[name="${k}"]`).value; await DB.save('settings', 'main', { name: q('name'), openingCash: n(q('openingCash')), openingBank: n(q('openingBank')) }); toast('Saved'); };
  $('#opsave').onclick = async () => {
    const st = $('#opd').value; if (!st) return toast('Choose the start date');
    await DB.save('settings', 'main', { startDate: st });
    for (const el of document.querySelectorAll('[data-nz]')) await DB.save('nozzles', el.dataset.nz, { openMeter: el.value === '' ? '' : n(el.value) });
    for (const el of document.querySelectorAll('[data-sq]')) {
      const item = el.dataset.sq, qty = n(el.value), rate = n(document.querySelector(`[data-sr="${CSS.escape(item)}"]`).value), ex = D.purchases.find(p => p.supplier === 'OPENING' && p.item === item);
      if (qty > 0) await DB.save('purchases', ex ? ex.id : null, { date: st, supplier: 'OPENING', item, qty, rate, invoice: 'Opening stock', ...(ex ? {} : { createdAt: Date.now() }) });
      else if (ex) await DB.remove('purchases', ex.id);
    }
    E = null; toast('Opening position saved – the first Daily Entry will start from these meters');
  };
  $('#seed').onclick = async () => {
    if (D.items.length && !confirm('Items already exist. Load starter data anyway (may create duplicates)?')) return;
    const od = prompt('Opening stock date (YYYY-MM-DD)', today()); if (!od) return;
    toast('Loading…'); const t = Date.now();
    for (const c of ['items', 'nozzles', 'customers', 'suppliers', 'employees']) for (const r of SEED[c]) await DB.save(c, null, { ...r, createdAt: t });
    for (const o of SEED.openingOil) await DB.save('purchases', null, { date: od, supplier: 'OPENING', item: o.item, qty: o.qty, rate: 0, invoice: 'Opening stock – set cost', createdAt: t });
    toast('Starter data loaded');
  };
  $('#bk').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(DB.exportAll())], { type: 'application/json' })); a.download = `tarnol-backup-${today()}.json`; a.click(); };
  $('#rs').onchange = async e => { const f = e.target.files[0]; if (f && confirm('Restore this backup? Existing records with the same ids are overwritten.')) { await DB.replaceAll(JSON.parse(await f.text())); toast('Restored'); } };
};

/* ---------- shell ---------- */
const NAV = [['Overview'], ['dashboard', '📊 Dashboard'], ['entry', '⛽ Daily Entry'], ['daybook', '📒 Day Book'], ['Transactions'], ['purchases', '🛒 Purchases'], ['expenses', '💸 Expenses'], ['receipts', '💰 Customer Receipts'], ['supplierPayments', '🏦 Supplier Payments'], ['employees', '👷 Salary & Advances'], ['adjust', '⚖ Gain / Loss'], ['Reports'], ['stock', '📦 Stock (FIFO)'], ['ledgers', '📑 Ledgers'], ['salespl', '⛽ Sales P&L (by product)'], ['pnl', '📈 Profit & Loss'], ['Setup'], ['m_items', 'Items'], ['m_nozzles', 'Nozzles'], ['m_customers', 'Customers'], ['m_suppliers', 'Suppliers'], ['m_staff', 'Employees'], ['settings', '⚙ Settings']];
function drawNav() { $('#nav').innerHTML = NAV.map(x => x.length === 1 ? `<h6>${x[0]}</h6>` : `<a href="#/${x[0]}" class="${x[0] === page ? 'on' : ''}">${x[1]}</a>`).join(''); }
function route() {
  page = (location.hash.replace('#/', '') || 'dashboard'); if (!PAGES[page]) page = 'dashboard'; document.body.classList.toggle('dbk', page === 'dashboard');
  drawNav(); $('#nav').classList.remove('open'); dirty = false; view().onclick = null; PAGES[page](); scrollTo(0, 0);
}
let rt;
function onData() {
  C = compute(); clearTimeout(rt);
  rt = setTimeout(() => {
    const a = document.activeElement;
    if (a && view().contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) { dirty = true; return; }
    $('#stationName').textContent = settings().name || 'Tarnol Filling Station';
    const keep = scrollY; PAGES[page](); scrollTo(0, keep);
  }, 80);
}
let started = false;
function netTag() { const t = $('#syncTag'); t.textContent = navigator.onLine ? '● live' : '○ offline – saved on this device, will sync'; t.className = 'tag' + (navigator.onLine ? '' : ' warn'); }
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
async function start() {
  if (started) return; started = true; $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); if (demo) $('#demoTag').classList.remove('hidden');
  let ready = 0; COLS.forEach(c => DB.subscribe(c, docs => { D[c] = docs; if (++ready >= COLS.length) netTag(); onData(); }));
  addEventListener('online', netTag); addEventListener('offline', netTag);
  bindEntryEvents(); window.addEventListener('hashchange', route); route();
}
window.addEventListener('db-error', e => {  toast('Database error: ' + e.detail.message + (e.detail.code === 'permission-denied' ? ' (check firestore.rules / sign-in)' : '')); });
$('#menuBtn').onclick = () => $('#nav').classList.toggle('open');
$('#logoutBtn').onclick = () => DB.logout();
$('#loginForm').onsubmit = async e => { e.preventDefault(); $('#lErr').textContent = ''; try { await DB.login($('#lEmail').value, $('#lPass').value); } catch (er) { $('#lErr').textContent = 'Sign-in failed: ' + (er.code || er.message); } };
(async () => {
  try { await DB.init(); } catch (e) { document.body.innerHTML = '<p style="padding:20px">Could not load Firebase: ' + esc(e.message) + '</p>'; return; }
  DB.onAuth(u => { if (u) start(); else if (started) location.reload(); else $('#login').classList.remove('hidden'); });
})();
