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
    const road = (v.tz.axisPoints || []).filter(p => p.z != null && p.st >= 1 && p.st <= N);
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
    [[0, x[g.iL], 'Левая пойма'], [x[g.iL], x[g.iR], 'Русло'], [x[g.iR], xmax, 'Правая пойма']].forEach(([a, b, t]) => add(C.el('text', { x: (sx(a) + sx(b)) / 2, y: 15, 'text-anchor': 'middle', 'font-size': 12, fill: '#5f6770' }, t)));
    [g.iL, g.iR].forEach(i => add(C.el('line', { x1: sx(x[i]), x2: sx(x[i]), y1: M.t, y2: H - M.b, stroke: '#c9c4b6', 'stroke-dasharray': '3 3' })));
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
      pts.forEach(p => { const px = sx(x[p.st - 1]), py = sy(p.z); add(C.el('circle', { cx: px, cy: py, r: 3.5, fill: '#7b3fa0' })); add(C.el('text', { x: px + (p.st - 1 < N / 2 ? 6 : -6), y: py - 6, 'font-size': 11, fill: '#7b3fa0', 'text-anchor': p.st - 1 < N / 2 ? 'start' : 'end' }, 'ПЧ ' + U.fmt(p.z))); });
      for (let k = 0; k < pts.length - 1; k++) add(C.el('line', { x1: sx(x[pts[k].st - 1]), y1: sy(pts[k].z), x2: sx(x[pts[k + 1].st - 1]), y2: sy(pts[k + 1].z), stroke: '#7b3fa0', 'stroke-width': 1, 'stroke-dasharray': '1 5', opacity: 0.6 }));
    }
    add(C.el('path', { d: g.z.map((q, i) => (i ? 'L' : 'M') + sx(x[i]) + ' ' + sy(q)).join(''), fill: 'none', stroke: '#3b2f22', 'stroke-width': (opt.mode?.kind || 'ground') === 'ground' ? 2.2 : 1.5 }));
    if (opt.showStations !== false) {
      const every = N > 120 ? 10 : 5;
      for (let i = 0; i < N; i++) {
        if (opt.dots !== false) add(C.el('circle', { cx: sx(x[i]), cy: sy(g.z[i]), r: opt.sel === i ? 4 : 1.8, fill: opt.sel === i ? '#1d5fa8' : '#3b2f22' }));
        if (i % every === 0 || i === g.iL || i === g.iR || i === N - 1) add(C.el('text', { x: sx(x[i]), y: H - M.b + 14, 'text-anchor': 'middle', 'font-size': 10.5, fill: '#5f6770' }, i + 1));
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
