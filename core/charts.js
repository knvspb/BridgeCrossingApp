/* SVG-графики, общие для модулей: поперечный профиль с ИГУ и уровнями, годовые гидрографы. Только браузер. */
(function (root) {
  'use strict';
  const BCA = root.BCA || (root.BCA = {});
  const U = BCA.util;
  const C = BCA.charts = {};
  const NS = 'http://www.w3.org/2000/svg';
  C.LAYER_COLORS = ['#d9bf94', '#b59a8a', '#ecd9a0', '#c9bfb0', '#e6cfa8', '#bcbb92', '#c4c4c0', '#dcc3b2', '#a9b494', '#d4b8a0', '#b8c4a8', '#e0d0b0'];
  C.el = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };
  const niceStep = span => { const raw = span / 8, p = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 2.5, 5, 10].map(k => k * p).find(s => s >= raw); };

  /* Поперечный профиль. Возвращает объект масштабов (для рисования мышью). */
  C.profile = (svg, v, opt = {}) => {
    const W = opt.W || 1000, H = opt.H || 430, M = { l: 54, r: 14, t: 24, b: 40 };
    const g = v.geodesy, h = v.hydro, N = g.z.length, x = BCA.profile.stationX(g), xmax = x[N - 1];
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = '';
    const levels = [];
    if (opt.showWater !== false) {
      if (h.unm != null) levels.push(h.unm);
      if (g.surveyLevel != null) levels.push(g.surveyLevel);
      if (h.viu.z != null) levels.push(h.viu.z);
      if (h.series.length) levels.push(Math.max(...h.series.map(s => s.zMax)));
    }
    const road = (v.tz.road || []).filter(p => p.z != null && p.st >= 1 && p.st <= N);
    const hi = Math.max(...g.z, ...levels, ...(opt.showRoad !== false ? road.map(p => p.z) : [])) + 1;
    const lo = Math.min(opt.showSoil !== false ? v.geology.ubv : Infinity, ...g.z) - 1;
    const sx = q => M.l + q / xmax * (W - M.l - M.r), sy = q => M.t + (hi - q) / (hi - lo) * (H - M.t - M.b);
    const view = { x, xmax, hi, lo, sx, sy, ix: px => (px - M.l) / (W - M.l - M.r) * xmax, iy: py => hi - (py - M.t) / (H - M.t - M.b) * (hi - lo) };
    const add = e => (svg.appendChild(e), e);
    const step = niceStep(hi - lo);
    for (let q = Math.ceil(lo / step) * step; q <= hi; q += step) {
      add(C.el('line', { x1: M.l, x2: W - M.r, y1: sy(q), y2: sy(q), stroke: '#ece9e1' }));
      add(C.el('text', { x: M.l - 6, y: sy(q) + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#5f6770' }, String(+q.toFixed(2)).replace('.', ',')));
    }
    const I = BCA.profile.idx(g), bnd = [0, I.bl, I.iL, I.iR, I.br, N - 1];
    BCA.profile.ZONES.forEach((k, j) => { const a = x[bnd[j]], b = x[bnd[j + 1]], wide = sx(b) - sx(a) > 70;
      if (k === 'BL' || k === 'BR') add(C.el('rect', { x: sx(a), y: M.t, width: sx(b) - sx(a), height: H - M.t - M.b, fill: '#efece4', opacity: 0.6 }));
      add(C.el('text', { x: (sx(a) + sx(b)) / 2, y: 15, 'text-anchor': 'middle', 'font-size': 12, fill: '#5f6770' }, wide ? BCA.profile.ZONE_NAME[k] : BCA.profile.ZONE_SHORT[k])); });
    bnd.slice(1, 5).forEach(i => add(C.el('line', { x1: sx(x[i]), x2: sx(x[i]), y1: M.t, y2: H - M.b, stroke: '#c9c4b6', 'stroke-dasharray': '3 3' })));
    if (opt.showSoil !== false) {
      const B = BCA.profile.bottoms(v), mode = opt.mode || {};
      v.geology.layers.forEach((l, k) => {
        const col = C.LAYER_COLORS[k % C.LAYER_COLORS.length], grp = C.el('g', {});
        for (let i = 0; i < N - 1; i++) {
          const t0 = l.tops[i], t1 = l.tops[i + 1], b0 = B[k][i], b1 = B[k][i + 1]; let pts = null;
          if (t0 != null && t1 != null) pts = [[x[i], t0], [x[i + 1], t1], [x[i + 1], b1], [x[i], b0]];
          else if (t0 != null) pts = [[x[i], t0], [(x[i] + x[i + 1]) / 2, (t0 + b0) / 2], [x[i], b0]];
          else if (t1 != null) pts = [[x[i + 1], t1], [(x[i] + x[i + 1]) / 2, (t1 + b1) / 2], [x[i + 1], b1]];
          if (pts) grp.appendChild(C.el('polygon', { points: pts.map(p => sx(p[0]) + ',' + sy(p[1])).join(' '), fill: col, stroke: col, 'stroke-width': 0.9, 'stroke-linejoin': 'round' }));
        }
        add(grp);
      });
      v.geology.layers.forEach((l, k) => {
        let d = '', pen = false; const on = mode.kind && mode.kind !== 'ground' && mode.layer === k;
        l.tops.forEach((t, i) => { if (t == null) { pen = false; return; } d += (pen ? 'L' : 'M') + sx(x[i]) + ' ' + sy(t); pen = true; });
        if (d) add(C.el('path', { d, fill: 'none', stroke: '#5b4a38', 'stroke-width': on ? 1.8 : 0.7, 'stroke-dasharray': on ? '' : '2 2' }));
      });
    }
    if (opt.showWater !== false) {
      const lvl = (q, c, t, dash, left) => { if (q == null) return; const xs = BCA.profile.waterSpan(g, q, x); if (!xs) return;
        add(C.el('line', { x1: sx(xs[0]), x2: sx(xs[1]), y1: sy(q), y2: sy(q), stroke: c, 'stroke-width': 1.4, 'stroke-dasharray': dash }));
        add(C.el('text', { x: left ? sx(xs[0]) + 4 : sx(xs[1]) - 4, y: sy(q) - 4, 'font-size': 11, fill: c, 'text-anchor': left ? 'start' : 'end', 'paint-order': 'stroke', stroke: '#fbfaf7', 'stroke-width': 3 }, t + ' ' + U.fmt(q))); };
      lvl(h.unm, '#2f7fd1', 'УНМ', '5 3', false);
      if (g.surveyLevel != null && g.surveyLevel !== h.unm) lvl(g.surveyLevel, '#5aa0e0', 'УВ изысканий', '2 3', true);
      if (h.series.length) lvl(Math.max(...h.series.map(s => s.zMax)), '#1b5aa0', 'max УВВ', '', true);
      lvl(h.viu.z, '#c0392b', 'ВИУ', '6 3', false);
    }
    if (opt.showRoad !== false && road.length) {
      const pts = road.slice().sort((a, b) => a.st - b.st);
      pts.forEach((p, k) => { const px = sx(x[p.st - 1]), py = sy(p.z); add(C.el('circle', { cx: px, cy: py, r: 3.5, fill: '#7b3fa0' })); if (k === 0 || k === pts.length - 1) add(C.el('text', { x: px + (p.st - 1 < N / 2 ? 6 : -6), y: py - 6, 'font-size': 11, fill: '#7b3fa0', 'text-anchor': p.st - 1 < N / 2 ? 'start' : 'end' }, 'ПЧ ' + U.fmt(p.z))); });
      for (let k = 0; k < pts.length - 1; k++) add(C.el('line', { x1: sx(x[pts[k].st - 1]), y1: sy(pts[k].z), x2: sx(x[pts[k + 1].st - 1]), y2: sy(pts[k + 1].z), stroke: '#7b3fa0', 'stroke-width': 1, 'stroke-dasharray': '1 5', opacity: 0.6 }));
    }
    add(C.el('path', { d: g.z.map((q, i) => (i ? 'L' : 'M') + sx(x[i]) + ' ' + sy(q)).join(''), fill: 'none', stroke: '#3b2f22', 'stroke-width': (opt.mode?.kind || 'ground') === 'ground' ? 2.2 : 1.5 }));
    if (opt.showStations !== false) {
      const every = N > 120 ? 10 : 5;
      for (let i = 0; i < N; i++) {
        if (opt.dots !== false) add(C.el('circle', { cx: sx(x[i]), cy: sy(g.z[i]), r: opt.sel === i ? 4 : 1.8, fill: opt.sel === i ? '#1d5fa8' : '#3b2f22' }));
        if (i % every === 0 || bnd.includes(i)) add(C.el('text', { x: sx(x[i]), y: H - M.b + 14, 'text-anchor': 'middle', 'font-size': 10.5, fill: '#5f6770' }, i + 1));
      }
    }
    add(C.el('text', { x: (W + M.l) / 2, y: H - 6, 'text-anchor': 'middle', 'font-size': 11, fill: '#5f6770' }, `№ створа · длина профиля ${Math.round(xmax)} м · отметки, м`));
    return view;
  };

  /* Годовые гидрографы уровней: все годы тонко, выбранный — жирно, навигация подсвечена. */
  C.hydrograph = (svg, v, sel, opt = {}) => {
    const W = opt.W || 1000, H = opt.H || 320, M = { l: 54, r: 14, t: 14, b: 34 };
    const ser = v.hydro.series; svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = '';
    if (!ser.length) return;
    const all = ser.flatMap(s => s.daily), hi = Math.max(...all, v.hydro.viu.z ?? -Infinity) + 0.3, lo = Math.min(...all) - 0.3, D = BCA.hydrology.DAYS;
    const sx = d => M.l + d / (D - 1) * (W - M.l - M.r), sy = q => M.t + (hi - q) / (hi - lo) * (H - M.t - M.b);
    const add = e => (svg.appendChild(e), e), s = ser[sel] || ser[0];
    add(C.el('rect', { x: sx(s.navStart), y: M.t, width: sx(s.navStart + s.navDays - 1) - sx(s.navStart), height: H - M.t - M.b, fill: '#e8f3e8' }));
    const step = niceStep(hi - lo);
    for (let q = Math.ceil(lo / step) * step; q <= hi; q += step) { add(C.el('line', { x1: M.l, x2: W - M.r, y1: sy(q), y2: sy(q), stroke: '#ece9e1' })); add(C.el('text', { x: M.l - 6, y: sy(q) + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#5f6770' }, String(+q.toFixed(2)).replace('.', ','))); }
    ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'].forEach((mn, k) => { const d = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][k]; add(C.el('line', { x1: sx(d), x2: sx(d), y1: M.t, y2: H - M.b, stroke: '#f0ede6' })); add(C.el('text', { x: sx(d + 15), y: H - M.b + 14, 'text-anchor': 'middle', 'font-size': 10.5, fill: '#5f6770' }, mn)); });
    ser.forEach((y, j) => { if (j !== sel) add(C.el('path', { d: y.daily.map((q, d) => (d ? 'L' : 'M') + sx(d).toFixed(1) + ' ' + sy(q).toFixed(1)).join(''), fill: 'none', stroke: '#9bb7d6', 'stroke-width': 0.6, opacity: 0.6 })); });
    add(C.el('path', { d: s.daily.map((q, d) => (d ? 'L' : 'M') + sx(d).toFixed(1) + ' ' + sy(q).toFixed(1)).join(''), fill: 'none', stroke: '#1d5fa8', 'stroke-width': 1.8 }));
    const hl = (q, c, t) => { if (q == null) return; add(C.el('line', { x1: M.l, x2: W - M.r, y1: sy(q), y2: sy(q), stroke: c, 'stroke-dasharray': '5 3' })); add(C.el('text', { x: W - M.r - 4, y: sy(q) - 4, 'text-anchor': 'end', 'font-size': 11, fill: c }, t + ' ' + U.fmt(q))); };
    hl(v.hydro.unm, '#2f7fd1', 'УНМ'); hl(v.hydro.viu.z, '#c0392b', 'ВИУ');
    add(C.el('circle', { cx: sx(s.dMax), cy: sy(s.zMax), r: 4, fill: '#c0392b' }));
    add(C.el('text', { x: sx(s.dMax) + 6, y: sy(s.zMax) - 6, 'font-size': 11, fill: '#1f2328' }, `${s.year}: max ${U.fmt(s.zMax)}${s.jam ? ' (затор)' : ''}`));
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* План топоповерхности: полутоновая заливка по высоте с лёгкой отмывкой, вода по наклонному уровню,
   сглаженные горизонтали с подписями, урез, ось дороги, стрелка течения, масштаб. */
(function (root) {
  'use strict';
  const BCA = root.BCA, U = BCA.util, C = BCA.charts;
  C.topoPlan = (cv, res, opt = {}) => {
    const S = cv.width, M = 34, A = S - 2 * M, n = res.n, L = res.L, P = res.points, ctx = cv.getContext('2d');
    const px = X => M + X / L * A, py = Y => M + (Y + L / 2) / L * A;          // верх — выше по течению
    const zs = P.map(p => p[2]), hi = Math.max(...zs), wl0 = res.waterLevel;
    const interval = opt.interval || BCA.topo.autoInterval(res), index = interval * 5, iters = opt.smooth ?? 2;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S);
    /* заливка: билинейная интерполяция z; вода — ниже наклонного уровня wl(y) */
    const img = ctx.createImageData(A, A), D = img.data, zAt = (gx, gy) => P[gy * n + gx][2];
    for (let j = 0; j < A; j++) {
      const fy = j / (A - 1) * (n - 1), gy = Math.min(n - 2, Math.floor(fy)), ty = fy - gy, wl = res.wl[gy] * (1 - ty) + res.wl[gy + 1] * ty;
      for (let i = 0; i < A; i++) {
        const fx = i / (A - 1) * (n - 1), gx = Math.min(n - 2, Math.floor(fx)), tx = fx - gx;
        const z00 = zAt(gx, gy), z10 = zAt(gx + 1, gy), z01 = zAt(gx, gy + 1), z11 = zAt(gx + 1, gy + 1);
        const z = (z00 * (1 - tx) + z10 * tx) * (1 - ty) + (z01 * (1 - tx) + z11 * tx) * ty;
        const sx = (z10 - z00) * (1 - ty) + (z11 - z01) * ty, sy = (z01 - z00) * (1 - tx) + (z11 - z10) * tx;
        const shade = U.clamp(-(sx + sy) * 9, -14, 14);
        let r, g, b;
        if (z < wl - BCA.topo.WET_TOL) { const d = U.clamp((wl - z) / 4, 0, 1); r = 214 - 40 * d; g = 232 - 30 * d; b = 246 - 12 * d; }
        else { const k = (z - wl) / Math.max(1, hi - wl0); const v = 247 - 48 * Math.pow(U.clamp(k, 0, 1), 0.8); r = g = b = v; r += 2; b -= 3; }
        const o = (j * A + i) * 4; D[o] = r + shade; D[o + 1] = g + shade; D[o + 2] = b + shade; D[o + 3] = 255;
      }
    }
    ctx.putImageData(img, M, M);
    ctx.save(); ctx.beginPath(); ctx.rect(M, M, A, A); ctx.clip();
    const path = l => { ctx.moveTo(px(l.pts[0][0]), py(l.pts[0][1])); for (let k = 1; k < l.pts.length; k++) ctx.lineTo(px(l.pts[k][0]), py(l.pts[k][1])); };
    /* горизонтали */
    const cs = BCA.topo.contours(res, interval, { smooth: iters });
    const isIdx = l => Math.abs(l / index - Math.round(l / index)) < 1e-6;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    cs.forEach(c => { const idx = isIdx(c.level);
      ctx.strokeStyle = idx ? 'rgba(120,78,40,0.85)' : 'rgba(140,96,58,0.55)'; ctx.lineWidth = idx ? 1.4 : 0.7;
      ctx.beginPath(); c.lines.forEach(path); ctx.stroke(); });
    /* урез воды по наклонному уровню */
    ctx.strokeStyle = '#3a7fc0'; ctx.lineWidth = 1.2; ctx.beginPath(); BCA.topo.waterEdge(res, { smooth: iters }).forEach(path); ctx.stroke();
    /* подписи утолщённых горизонталей вдоль линий */
    const placed = [];
    ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    cs.filter(c => isIdx(c.level)).forEach(c => c.lines.forEach(l => {
      for (let k = 6; k < l.pts.length - 6; k += 40) {
        const a = l.pts[k - 3], b = l.pts[k + 3], mx = px(l.pts[k][0]), my = py(l.pts[k][1]);
        if (mx < M + 20 || mx > S - M - 20 || my < M + 12 || my > S - M - 12 || Math.abs(my - py(0)) < 14) continue;
        if (placed.some(q => Math.hypot(q[0] - mx, q[1] - my) < 140)) continue;
        placed.push([mx, my]);
        let ang = Math.atan2(py(b[1]) - py(a[1]), px(b[0]) - px(a[0])); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
        ctx.save(); ctx.translate(mx, my); ctx.rotate(ang); const txt = String(+c.level.toFixed(2)).replace('.', ',');
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeText(txt, 0, 0); ctx.fillStyle = '#6b4423'; ctx.fillText(txt, 0, 0); ctx.restore();
      }
    }));
    /* ось дороги */
    ctx.setLineDash([10, 4, 2, 4]); ctx.strokeStyle = '#7b3fa0'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(M, py(0)); ctx.lineTo(S - M, py(0)); ctx.stroke(); ctx.setLineDash([]);
    ctx.textAlign = 'left'; ctx.fillStyle = '#7b3fa0'; ctx.font = '12px sans-serif'; ctx.fillText('ось дороги', M + 6, py(0) - 9);
    /* стрелка течения по оси русла */
    if (res.axis && res.axis.length > 4) {
      const a = res.axis[Math.round(res.axis.length * 0.16)], b = res.axis[Math.round(res.axis.length * 0.26)];
      const x1 = px(a[0]), y1 = py(a[1]), x2 = px(b[0]), y2 = py(b[1]), an = Math.atan2(y2 - y1, x2 - x1);
      ctx.strokeStyle = '#1d4f86'; ctx.fillStyle = '#1d4f86'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 10 * Math.cos(an - 0.4), y2 - 10 * Math.sin(an - 0.4)); ctx.lineTo(x2 - 10 * Math.cos(an + 0.4), y2 - 10 * Math.sin(an + 0.4)); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    /* рамка, масштаб, легенда */
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.strokeRect(M, M, A, A);
    const nice = [50, 100, 200, 250, 500, 1000].find(q => q / L * A > 90) || 1000, bx = M, by = S - 12, bw = nice / L * A;
    ctx.fillStyle = '#333'; ctx.fillRect(bx, by - 4, bw / 2, 4); ctx.strokeRect(bx, by - 4, bw, 4);
    ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`${nice} м`, bx + bw + 6, by - 1);
    ctx.textAlign = 'right'; ctx.fillText(`Горизонтали через ${String(interval).replace('.', ',')} м, утолщённые — через ${String(index).replace('.', ',')} м`, S - M, by - 1);
    ctx.textAlign = 'left'; ctx.fillText('↓ течение', S - M - 70, M - 12);
    return { interval };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
