// FIFO costing engine. Pure functions, no dependencies.
// events: {item,date:'YYYY-MM-DD',ord:number,kind:'in'|'out',qty,rate|null,key,ref}
// Every time data changes the whole ledger is replayed in date order, so back-dated
// purchases / edits automatically re-flow all FIFO costs (nothing is stored that can go stale).
export function computeFIFO(events, fallbackRates = {}) {
  const byItem = {};
  for (const e of events) (byItem[e.item] ||= []).push(e);
  const outs = {};   // key -> {qty,cogs,parts:[{date,rate,qty}],short}
  const stock = {};  // item -> {qty,value,batches:[{date,rate,qty,rem,ref}],short,lastRate}
  for (const [item, list] of Object.entries(byItem)) {
    list.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === 'in' ? -1 : 1) || a.ord - b.ord);
    const batches = []; const pending = []; let lastRate = fallbackRates[item] || 0; let shortTotal = 0;
    for (const e of list) {
      const qty = Number(e.qty) || 0;
      if (qty <= 0) continue;
      if (e.kind === 'in') {
        const rate = e.rate == null ? lastRate : Number(e.rate) || 0;
        if (e.rate != null && rate > 0) lastRate = rate;
        const nb = { date: e.date, rate, qty, rem: qty, ref: e.ref }; batches.push(nb);
        // a later purchase absorbs earlier shortfalls (sold before the stock was recorded) at its own rate
        while (pending.length && nb.rem > 1e-9) {
          const p = pending[0], take = Math.min(nb.rem, p.qty);
          p.o.cogs += take * (rate - p.est); p.o.short -= take; p.part.qty -= take; p.o.parts.push({ date: e.date, rate, qty: take }); p.qty -= take; nb.rem -= take; shortTotal -= take;
          if (p.qty <= 1e-9) pending.shift();
        }
        if (nb.rem <= 1e-9) batches.pop();
      } else {
        let need = qty, cogs = 0; const parts = [];
        while (need > 1e-9 && batches.length) {
          const b = batches[0]; const take = Math.min(b.rem, need);
          cogs += take * b.rate; parts.push({ date: b.date, rate: b.rate, qty: take });
          b.rem -= take; need -= take;
          if (b.rem <= 1e-9) batches.shift();
        }
        let short = 0, sp = null;
        if (need > 1e-9) { short = need; cogs += need * lastRate; shortTotal += need; sp = { date: null, rate: lastRate, qty: need, short: true }; parts.push(sp); }
        const o = (outs[e.key] ||= { qty: 0, cogs: 0, parts: [], short: 0 });
        if (short > 1e-9) pending.push({ o, qty: short, est: lastRate, part: sp });
        o.qty += qty; o.cogs += cogs; o.short += short; o.parts.push(...parts);
      }
    }
    const rem = batches.filter(b => b.rem > 1e-9);
    stock[item] = { qty: rem.reduce((s, b) => s + b.rem, 0) - shortTotal, value: rem.reduce((s, b) => s + b.rem * b.rate, 0), batches: rem, short: shortTotal, lastRate };
  }
  return { outs, stock };
}
