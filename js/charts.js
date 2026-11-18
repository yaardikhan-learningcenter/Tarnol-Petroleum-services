// Dependency-free SVG charts (work offline). Colours come from CSS vars --c1..--c6 (light/dark aware).
const W = 640;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const short = v => { const a = Math.abs(v), s = v < 0 ? '-' : ''; return a >= 1e7 ? s + (a / 1e6).toFixed(0) + 'M' : a >= 1e6 ? s + (a / 1e6).toFixed(1) + 'M' : a >= 1e4 ? s + (a / 1e3).toFixed(0) + 'k' : a >= 1e3 ? s + (a / 1e3).toFixed(1) + 'k' : s + Math.round(a * 10) / 10; };
const full = v => Number(v || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 });
function scale(min, max) {
  min = Math.min(0, min); max = Math.max(0, max); if (max === min) max = 1;
  const raw = (max - min) / 4, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag, step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step, ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { lo, hi, ticks };
}
const empty = '<p class="muted" style="padding:20px 0;text-align:center">No data for this period</p>';
export const legend = series => `<div class="legend">${series.map((s, i) => `<span><i class="d s${s.c ?? i}"></i>${esc(s.name)}</span>`).join('')}</div>`;
function axes(sc, L, R, T, ph, y, fmtY) {
  return sc.ticks.map(t => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${L - 6}" y="${y(t) + 3.5}" text-anchor="end">${fmtY(t)}</text>`).join('');
}
function xlabels(labels, L, band, y0) {
  const k = Math.ceil(labels.length / 12);
  return labels.map((l, i) => i % k ? '' : `<text class="ax" x="${L + band * (i + .5)}" y="${y0}" text-anchor="middle">${esc(l)}</text>`).join('');
}
export function barChart({ labels, series, stacked = false, h = 240, fmtY = short }) {
  if (!labels.length || !series.some(s => s.values.some(v => v))) return empty;
  const L = 44, R = 8, T = 10, B = 24, pw = W - L - R, ph = h - T - B;
  let mn = 0, mx = 0;
  labels.forEach((_, i) => { if (stacked) { let p = 0, q = 0; series.forEach(s => { const v = s.values[i] || 0; v >= 0 ? p += v : q += v; }); mx = Math.max(mx, p); mn = Math.min(mn, q); } else series.forEach(s => { const v = s.values[i] || 0; mx = Math.max(mx, v); mn = Math.min(mn, v); }); });
  const sc = scale(mn, mx), y = v => T + ph * (1 - (v - sc.lo) / (sc.hi - sc.lo)), band = pw / labels.length, y0 = y(0);
  let bars = '';
  labels.forEach((lab, i) => {
    let pos = 0, neg = 0; const bw = stacked ? band * .62 : band * .8 / series.length;
    series.forEach((s, j) => {
      const v = s.values[i] || 0; if (!v) return;
      let a, b; if (stacked) { if (v >= 0) { a = pos; b = pos + v; pos = b; } else { a = neg; b = neg + v; neg = b; } } else { a = 0; b = v; }
      const x = stacked ? L + band * i + (band - bw) / 2 : L + band * i + band * .1 + bw * j, yt = Math.min(y(a), y(b)), hh = Math.max(1, Math.abs(y(a) - y(b)));
      bars += `<rect class="s${s.c ?? j}" x="${x.toFixed(1)}" y="${yt.toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${hh.toFixed(1)}" rx="2"><title>${esc(lab)} – ${esc(s.name)}: ${full(v)}</title></rect>`;
    });
  });
  return `<svg class="ch" viewBox="0 0 ${W} ${h}" role="img">${axes(sc, L, R, T, ph, y, fmtY)}<line class="zero" x1="${L}" x2="${W - R}" y1="${y0}" y2="${y0}"/>${bars}${xlabels(labels, L, band, h - 7)}</svg>`;
}
export function lineChart({ labels, series, h = 220, fmtY = short }) {
  if (!labels.length || !series.some(s => s.values.some(v => v))) return empty;
  const L = 44, R = 12, T = 10, B = 24, pw = W - L - R, ph = h - T - B, all = series.flatMap(s => s.values.map(v => v || 0));
  const sc = scale(Math.min(...all), Math.max(...all)), y = v => T + ph * (1 - (v - sc.lo) / (sc.hi - sc.lo)), band = pw / labels.length, X = i => L + band * (i + .5);
  const lines = series.map((s, j) => `<polyline class="ln s${s.c ?? j}" fill="none" points="${s.values.map((v, i) => `${X(i).toFixed(1)},${y(v || 0).toFixed(1)}`).join(' ')}"/>` + s.values.map((v, i) => `<circle class="s${s.c ?? j}" cx="${X(i).toFixed(1)}" cy="${y(v || 0).toFixed(1)}" r="3.5"><title>${esc(labels[i])} – ${esc(s.name)}: ${full(v)}${s.suffix || ''}</title></circle>`).join('')).join('');
  return `<svg class="ch" viewBox="0 0 ${W} ${h}" role="img">${axes(sc, L, R, T, ph, y, fmtY)}<line class="zero" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>${lines}${xlabels(labels, L, band, h - 7)}</svg>`;
}
export function donut({ items, unit = '' }) {
  items = items.filter(i => i.value > 0); const tot = items.reduce((s, i) => s + i.value, 0);
  if (!tot) return empty;
  const R = 70, r = 44, cx = 90, cy = 90; let a0 = -Math.PI / 2;
  const arcs = items.map((it, i) => {
    const f = it.value / tot, a1 = a0 + f * 2 * Math.PI - (f > .999 ? .001 : 0), big = a1 - a0 > Math.PI ? 1 : 0, P = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
    const d = `M${P(R, a0)} A${R} ${R} 0 ${big} 1 ${P(R, a1)} L${P(r, a1)} A${r} ${r} 0 ${big} 0 ${P(r, a0)}Z`; a0 += f * 2 * Math.PI;
    return `<path class="s${it.c ?? i}" d="${d}"><title>${esc(it.label)}: ${full(it.value)} (${(f * 100).toFixed(1)}%)</title></path>`;
  }).join('');
  return `<div class="donut"><svg viewBox="0 0 180 180" role="img">${arcs}<text class="ctr" x="${cx}" y="${cy - 2}" text-anchor="middle">${short(tot)}</text><text class="ax" x="${cx}" y="${cy + 12}" text-anchor="middle">total</text></svg><ul>${items.map((it, i) => `<li><i class="d s${it.c ?? i}"></i>${esc(it.label)}<b>${short(it.value)}</b><small>${(it.value / tot * 100).toFixed(1)}%</small></li>`).join('')}</ul></div>`;
}
export function hbar({ items, fmtV = short, max = 10 }) {
  items = items.filter(i => i.value).sort((a, b) => b.value - a.value).slice(0, max);
  if (!items.length) return empty;
  const rowH = 24, h = items.length * rowH + 6, LBL = 130, VAL = 60, pw = W - LBL - VAL, mx = Math.max(...items.map(i => Math.abs(i.value))), mn = Math.min(0, ...items.map(i => i.value));
  const span = mx - mn || 1, x0 = LBL + pw * (-mn) / span;
  return `<svg class="ch" viewBox="0 0 ${W} ${h}" role="img">${items.map((it, i) => {
    const w = pw * Math.abs(it.value) / span, x = it.value >= 0 ? x0 : x0 - w, y = i * rowH + 3;
    return `<text class="ax" x="${LBL - 8}" y="${y + 14}" text-anchor="end">${esc(it.label.length > 20 ? it.label.slice(0, 19) + '…' : it.label)}</text><rect class="s${it.c ?? 0}" x="${x.toFixed(1)}" y="${y + 3}" width="${Math.max(1, w).toFixed(1)}" height="14" rx="3"><title>${esc(it.label)}: ${full(it.value)}</title></rect><text class="ax" x="${(it.value >= 0 ? x + w + 5 : x - 5).toFixed(1)}" y="${y + 14}" text-anchor="${it.value >= 0 ? 'start' : 'end'}">${fmtV(it.value)}</text>`;
  }).join('')}</svg>`;
}
export const card = (title, body, lg = '', sub = '') => `<div class="card chart"><h3>${esc(title)}${sub ? `<small class="muted"> ${esc(sub)}</small>` : ''}</h3>${lg}${body}</div>`;
