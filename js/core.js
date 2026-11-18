import { COLS } from './db.js';
import { computeFIFO } from './fifo.js';
export const D = {}; COLS.forEach(c => D[c] = []);
export const n = v => Number(v) || 0;
export const fmt = (v, d = 2) => n(v).toLocaleString('en-PK', { maximumFractionDigits: d });
export const money = v => (n(v) < 0 ? '-' : '') + fmt(Math.abs(n(v)), 0);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const today = () => ymd(new Date());
export const addDays = (s, k) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + k); return ymd(d); };
export const SHIFTS = { '1': '1st (06:00–14:00)', '2': '2nd (14:00–22:00)', '3': '3rd (22:00–06:00)' };
export const settings = () => D.settings.find(s => s.id === 'main') || {};
export const itemByName = name => D.items.find(i => i.name === name);

export function netL(r) {
  if (r.close === '' || r.close == null) return 0;
  return Math.max(0, Math.max(0, n(r.close) - n(r.open)) - n(r.testing));
}
export function creditCalc(c) { const qty = n(c.rate) ? n(c.amount) / n(c.rate) : 0; const inc = qty * n(c.incentive); return { qty, inc, net: n(c.amount) - inc }; }
export function shiftTotals(s) {
  let fuel = 0, oil = 0, fuelL = 0;
  (s.readings || []).forEach(r => { const l = netL(r); fuelL += l; fuel += l * n(r.rate); });
  (s.oil || []).forEach(o => { oil += n(o.qty) * n(o.rate); });
  let credit = 0, incentive = 0;
  (s.credit || []).forEach(c => { const x = creditCalc(c); credit += n(c.amount); incentive += x.inc; });
  const total = fuel + oil, bank = n(s.bank), wallet = n(s.wallet);
  const cash = total - credit - bank - wallet;
  return { fuel, oil, fuelL, total, credit, incentive, bank, wallet, cash, short: s.cashCounted === '' || s.cashCounted == null ? null : n(s.cashCounted) - cash };
}

export function compute() {
  const ev = [], rev = {}, shiftItem = {};
  D.purchases.forEach(p => ev.push({ item: p.item, date: p.date, ord: 0, kind: 'in', qty: n(p.qty), rate: n(p.rate), ref: 'P:' + p.id }));
  D.shifts.forEach(s => {
    const agg = {};
    (s.readings || []).forEach(r => { const l = netL(r); if (l) { const a = agg[r.item] ||= { qty: 0, rev: 0 }; a.qty += l; a.rev += l * n(r.rate); } });
    (s.oil || []).forEach(o => { if (n(o.qty)) { const a = agg[o.item] ||= { qty: 0, rev: 0 }; a.qty += n(o.qty); a.rev += n(o.qty) * n(o.rate); } });
    for (const [item, a] of Object.entries(agg)) {
      const key = s.id + '|' + item; shiftItem[key] = { shiftId: s.id, date: s.date, item, qty: a.qty, rev: a.rev };
      ev.push({ item, date: s.date, ord: n(s.shift), kind: 'out', qty: a.qty, key });
    }
  });
  D.adjustments.forEach(a => { const q = n(a.qty); if (!q) return; ev.push({ item: a.item, date: a.date, ord: q > 0 ? 0.5 : 9, kind: q > 0 ? 'in' : 'out', qty: Math.abs(q), rate: null, key: 'A:' + a.id, ref: 'A:' + a.id }); });
  const fifo = computeFIFO(ev);
  for (const [k, v] of Object.entries(shiftItem)) { const o = fifo.outs[k]; v.cogs = o ? o.cogs : 0; v.short = o ? o.short : 0; v.profit = v.rev - v.cogs; }
  // adjustment loss valuation
  const adjCost = {}; D.adjustments.forEach(a => { const o = fifo.outs['A:' + a.id]; if (o) adjCost[a.id] = o.cogs; });
  return { fifo, shiftItem, adjCost };
}

export function lastClosing(nozzle, date, shift) {
  let best = null;
  for (const s of D.shifts) {
    if (s.date > date || (s.date === date && n(s.shift) >= n(shift))) continue;
    const r = (s.readings || []).find(x => x.nozzle === nozzle && x.close !== '' && x.close != null);
    if (r && (!best || s.date > best.date || (s.date === best.date && n(s.shift) > n(best.shift)))) best = { date: s.date, shift: s.shift, close: r.close };
  }
  if (best) return best.close;
  // no earlier shift: use the opening meter entered in Settings (go-live position)
  const z = D.nozzles.find(x => x.name === nozzle), st = settings().startDate;
  return z && z.openMeter != null && z.openMeter !== '' && (!st || date >= st) ? z.openMeter : '';
}

export function customerLedger(name) {
  const c = D.customers.find(x => x.name === name); const rows = [];
  D.shifts.forEach(s => (s.credit || []).forEach(l => { if (l.customer === name) { const x = creditCalc(l); rows.push({ date: s.date, ord: n(s.shift), desc: `${l.item} ${fmt(x.qty)} L ${l.vehicleType || ''} ${l.vehicleNo || ''}`.trim(), dr: x.net, cr: 0 }); } }));
  D.receipts.forEach(r => { if (r.customer === name) rows.push({ date: r.date, ord: 5, desc: 'Receipt (' + (r.mode || 'cash') + ') ' + (r.note || ''), dr: 0, cr: n(r.amount) }); });
  return statement(rows, n(c && c.opening));
}
export function supplierLedger(name) {
  const s = D.suppliers.find(x => x.name === name); const rows = [];
  D.purchases.forEach(p => { if (p.supplier === name) rows.push({ date: p.date, ord: 0, desc: `${p.item} ${fmt(p.qty)} @ ${fmt(p.rate)}`, dr: 0, cr: n(p.qty) * n(p.rate) }); });
  D.supplierPayments.forEach(p => { if (p.supplier === name) rows.push({ date: p.date, ord: 5, desc: 'Payment (' + (p.mode || 'cash') + ') ' + (p.note || ''), dr: n(p.amount), cr: 0 }); });
  return statement(rows, n(s && s.opening), true);
}
function statement(rows, opening, payable) {
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.ord - b.ord);
  let bal = opening; const out = rows.map(r => { bal += payable ? r.cr - r.dr : r.dr - r.cr; return { ...r, bal }; });
  return { opening, rows: out, balance: bal };
}

// cash / bank / wallet book by day
export function cashBook() {
  const days = {}; const get = d => days[d] ||= { cash: { in: 0, out: 0 }, bank: { in: 0, out: 0 }, wallet: { in: 0, out: 0 }, cashSales: 0 };
  const mode = m => (m === 'bank' || m === 'wallet') ? m : 'cash';
  D.shifts.forEach(s => { const t = shiftTotals(s), d = get(s.date); d.cash.in += t.cash; d.cashSales += t.cash; d.bank.in += t.bank; d.wallet.in += t.wallet; });
  D.receipts.forEach(r => get(r.date)[mode(r.mode)].in += n(r.amount));
  D.supplierPayments.forEach(r => get(r.date)[mode(r.mode)].out += n(r.amount));
  D.expenses.forEach(r => get(r.date)[mode(r.mode)].out += n(r.amount));
  D.employeeTx.forEach(r => get(r.date)[mode(r.mode)].out += n(r.amount));
  const st = settings(); const bal = { cash: n(st.openingCash), bank: n(st.openingBank), wallet: 0 };
  for (const d of Object.keys(days).sort()) { const x = days[d]; x.open = { ...bal }; for (const k of ['cash', 'bank', 'wallet']) bal[k] += x[k].in - x[k].out; x.close = { ...bal }; }
  return { days, bal };
}

export function pnl(from, to, C) {
  const inR = d => d >= from && d <= to;
  const items = {}; let incentive = 0, short = 0;
  Object.values(C.shiftItem).filter(v => inR(v.date)).forEach(v => { const a = items[v.item] ||= { qty: 0, rev: 0, cogs: 0 }; a.qty += v.qty; a.rev += v.rev; a.cogs += v.cogs; short += v.short; });
  D.shifts.filter(s => inR(s.date)).forEach(s => incentive += shiftTotals(s).incentive);
  const adjLoss = D.adjustments.filter(a => inR(a.date) && n(a.qty) < 0).reduce((s, a) => s + n(C.adjCost[a.id]), 0);
  const exp = {}; D.expenses.filter(e => inR(e.date) && e.category !== 'OWNER DRAWINGS').forEach(e => exp[e.type || 'Other'] = (exp[e.type || 'Other'] || 0) + n(e.amount));
  const salary = D.employeeTx.filter(e => inR(e.date) && e.type === 'salary').reduce((s, e) => s + n(e.amount), 0);
  const drawings = D.expenses.filter(e => inR(e.date) && e.category === 'OWNER DRAWINGS').reduce((s, e) => s + n(e.amount), 0);
  const rev = Object.values(items).reduce((s, a) => s + a.rev, 0), cogs = Object.values(items).reduce((s, a) => s + a.cogs, 0);
  const expTotal = Object.values(exp).reduce((s, v) => s + v, 0) + salary;
  const gross = rev - incentive - cogs - adjLoss;
  return { items, rev, cogs, incentive, adjLoss, exp, salary, drawings, gross, expTotal, net: gross - expTotal, short };
}

/* ---------- period buckets (daily / weekly / monthly / yearly) ---------- */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pd = s => new Date(s + 'T00:00:00');
export function startOf(period, s) {
  const d = pd(s);
  if (period === 'weekly') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (period === 'monthly') d.setDate(1);
  if (period === 'yearly') { d.setMonth(0); d.setDate(1); }
  return ymd(d);
}
function endOf(period, s) {
  const d = pd(s);
  if (period === 'weekly') d.setDate(d.getDate() + 6);
  if (period === 'monthly') { d.setMonth(d.getMonth() + 1); d.setDate(0); }
  if (period === 'yearly') { d.setMonth(11); d.setDate(31); }
  return ymd(d);
}
function prevStart(period, s) { const d = pd(s); if (period === 'daily') d.setDate(d.getDate() - 1); if (period === 'weekly') d.setDate(d.getDate() - 7); if (period === 'monthly') d.setMonth(d.getMonth() - 1); if (period === 'yearly') d.setFullYear(d.getFullYear() - 1); return ymd(d); }
function labelOf(period, s) { const d = pd(s); return period === 'yearly' ? String(d.getFullYear()) : period === 'monthly' ? MON[d.getMonth()] + " '" + String(d.getFullYear()).slice(2) : d.getDate() + ' ' + MON[d.getMonth()]; }
export function makeBuckets(period, count, end = today()) {
  const out = []; let cur = startOf(period, end);
  for (let i = 0; i < count; i++) { out.unshift({ from: cur, to: endOf(period, cur), label: labelOf(period, cur) }); cur = prevStart(period, cur); }
  return out;
}
export function series(B, C) {
  const out = B.map(b => ({ ...b, sales: 0, fuel: 0, oil: 0, cogs: 0, incentive: 0, adjLoss: 0, exp: 0, salary: 0, cash: 0, credit: 0, bank: 0, wallet: 0, lit: {} }));
  const find = d => out.find(b => d >= b.from && d <= b.to);
  D.shifts.forEach(s => { const b = find(s.date); if (!b) return; const t = shiftTotals(s); b.sales += t.total; b.fuel += t.fuel; b.oil += t.oil; b.cash += t.cash; b.credit += t.credit; b.bank += t.bank; b.wallet += t.wallet; b.incentive += t.incentive; (s.readings || []).forEach(r => { const l = netL(r); if (l) b.lit[r.item] = (b.lit[r.item] || 0) + l; }); });
  Object.values(C.shiftItem).forEach(v => { const b = find(v.date); if (b) b.cogs += v.cogs; });
  D.adjustments.forEach(a => { if (n(a.qty) < 0) { const b = find(a.date); if (b) b.adjLoss += n(C.adjCost[a.id]); } });
  D.expenses.forEach(e => { if (e.category === 'OWNER DRAWINGS') return; const b = find(e.date); if (b) b.exp += n(e.amount); });
  D.employeeTx.forEach(e => { if (e.type !== 'salary') return; const b = find(e.date); if (b) b.salary += n(e.amount); });
  out.forEach(b => { b.gross = b.sales - b.incentive - b.cogs - b.adjLoss; b.net = b.gross - b.exp - b.salary; b.margin = b.sales ? b.gross / b.sales * 100 : 0; });
  return out;
}

/* ---------- sales based P&L per nozzle and per oil (FIFO cost) ---------- */
export function salesPL(from, to, C) {
  const noz = {}, oil = {}, emp = {}, layers = {}; let short = 0, incentive = 0;
  D.shifts.filter(s => s.date >= from && s.date <= to).forEach(s => {
    incentive += shiftTotals(s).incentive;
    (s.readings || []).forEach(r => {
      const L = netL(r); if (!L) return;
      const si = C.shiftItem[s.id + '|' + r.item], unit = si && si.qty ? si.cogs / si.qty : 0, rev = L * n(r.rate);
      const a = noz[r.nozzle] ||= { name: r.nozzle, item: r.item, qty: 0, rev: 0, cogs: 0 }; a.qty += L; a.rev += rev; a.cogs += L * unit;
      const e = emp[r.emp || '(none)'] ||= { name: r.emp || '(none)', qty: 0, rev: 0, cogs: 0 }; e.qty += L; e.rev += rev; e.cogs += L * unit;
    });
  });
  Object.entries(C.shiftItem).forEach(([k, v]) => {
    if (v.date < from || v.date > to) return; short += v.short;
    const o = C.fifo.outs[k]; (o ? o.parts : []).forEach(p => { if (p.qty <= 1e-9) return; const L = layers[v.item] ||= {}, key = p.short ? 'est' : p.rate; const x = L[key] ||= { rate: p.rate, qty: 0, est: !!p.short }; x.qty += p.qty; });
    if (itemByName(v.item)?.type === 'oil') { const a = oil[v.item] ||= { name: v.item, item: v.item, qty: 0, rev: 0, cogs: 0 }; a.qty += v.qty; a.rev += v.rev; a.cogs += v.cogs; }
  });
  const fin = o => { o.profit = o.rev - o.cogs; o.margin = o.rev ? o.profit / o.rev * 100 : 0; o.avgSale = o.qty ? o.rev / o.qty : 0; o.avgCost = o.qty ? o.cogs / o.qty : 0; return o; };
  const arr = x => Object.values(x).map(fin);
  // product view: PETROL, DIESEL and every oil item one by one, straight from the per-shift item totals (no nozzle involved)
  const prod = {};
  Object.values(C.shiftItem).forEach(v => { if (v.date < from || v.date > to) return; const a = prod[v.item] ||= { name: v.item, item: v.item, type: itemByName(v.item)?.type || 'oil', qty: 0, rev: 0, cogs: 0 }; a.qty += v.qty; a.rev += v.rev; a.cogs += v.cogs; });
  const products = arr(prod);
  return { nozzles: arr(noz), oils: arr(oil), emps: arr(emp), products, fuels: products.filter(x => x.type === 'fuel'), layers, short, incentive };
}
