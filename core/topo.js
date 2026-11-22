/* Топоповерхность участка мостового перехода по профилю (п. 17 плана генератора).

   План — квадрат со стороной L (по умолчанию длина профиля); ось дороги — центральная ось X (Y = 0),
   ось Y — вдоль реки, по течению. Сечение по оси дороги в точности совпадает с профилем задания:
   все возмущения гасятся к Y = 0 (полоса ±12 % L), смещения русла и долины в Y = 0 равны нулю.

   Радиус R — кривизна реки в плане: 0 — прямая; R > 0 — изгиб влево, R < 0 — вправо (по течению).
   Русло следует дуге радиуса R; долина (поймы и коренные берега) смещается вслед за руслом только тогда,
   когда русло подходит к краю поймы. Глубина русла на изгибе асимметрична: плёс у вогнутого берега,
   прирусловая отмель у выпуклого.

   Элементы рельефа (типичные для равнинных пойм — см. docs/TOPO_MODEL.md):
   — коренные склоны (берега) продолжаются за край профиля, прорезаны оврагами (балками);
   — пойма: параллельные русле гривы и межгривные понижения (анизотропный шум),
     прирусловые валы вдоль бровок, старицы — серповидные понижения (часть с водой);
   — «простой» рельеф (R = 0 по умолчанию): только небольшие холмы и впадины. */
(function (root) {
  'use strict';
  const BCA = root.BCA || (root.BCA = {});
  const U = BCA.util;
  const T = BCA.topo = {};
  const smooth = t => { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  T.generate = (v, opt = {}) => {
    const g = v.geodesy, t = Object.assign({}, v.topo, opt), x = BCA.profile.stationX(g), I = BCA.profile.idx(g), N = I.N;
    const Lp = x[N - 1], L = t.size || Lp, step = Math.max(1, t.gridStep || 10), n = Math.floor(L / step) + 1;
    const R = Number(t.radius) || 0, slope = v.hydro.slope.i || 0, rng = BCA.rng(t.seed | 0);
    const natural = t.natural ?? (R !== 0);
    const off = (L - Lp) / 2;
    const xL = x[I.iL], xR = x[I.iR], xc = (xL + xR) / 2, hw = (xR - xL) / 2, W = 2 * hw;
    const xBL = x[I.bl], xBR = x[I.br];

    /* профиль, продолженный за края с уклоном крайних участков берегов (не менее 1 %) */
    const sL = Math.max(0.01, (g.z[0] - g.z[1]) / (x[1] - x[0])), sR = Math.max(0.01, (g.z[N - 1] - g.z[N - 2]) / (x[N - 1] - x[N - 2]));
    const prof = q => q < 0 ? g.z[0] + sL * -q : q > Lp ? g.z[N - 1] + sR * (q - Lp) : U.interp(x, g.z, q);
    const zBl = g.z[I.iL], zBr = g.z[I.iR];
    const chord = q => zBl + (zBr - zBl) * (q - xL) / (xR - xL);
    /* поверхность поймы: профиль, в котором русло засыпано по хорде бровок */
    const fill = q => (q > xL && q < xR) ? chord(q) : prof(q);
    /* глубина русла ниже хорды бровок как функция u ∈ [−1; 1] */
    const depth = u => Math.max(0, chord(xc + u * hw) - prof(xc + u * hw));

    /* пойма = плавный тренд + микрорельеф профиля. Микрорельеф (понижения, гривы) вдоль долины извивается
       и выклинивается — понижения профиля становятся озёрами и старицами, а не бесконечными каналами. */
    const inLP = q => q > xBL && q < xL, inPP = q => q > xR && q < xBR;
    /* тренд поймы — плавный переход от подошвы коренного берега к бровке русла (с небольшим прогибом) */
    const trend = q => {
      if (inLP(q)) { const s = (q - xBL) / (xL - xBL); return g.z[I.bl] + (zBl - g.z[I.bl]) * Math.pow(s, 0.85); }
      if (inPP(q)) { const s = (xBR - q) / (xBR - xR); return g.z[I.br] + (zBr - g.z[I.br]) * Math.pow(s, 0.85); }
      return fill(q);
    };
    const resid = q => (inLP(q) || inPP(q)) ? fill(q) - trend(q) : 0;
    const ell = L * (natural ? rng.uniform(0.2, 0.3) : 0.45);                  // длина затухания микрорельефа
    const env = y => Math.exp(-(y / ell) * (y / ell));
    const wA = natural ? rng.uniform(0.08, 0.14) * Math.min(xL - xBL, xBR - xR) : 0.03 * Math.min(xL - xBL, xBR - xR), wL = L * rng.uniform(0.12, 0.2), wP = rng.uniform(0, 6.28);
    const wig = y => wA * (Math.sin(y / wL + wP) - Math.sin(wP));
    const nEdgeL = BCA.smoothNoise(rng, n + 1, Math.max(3, n / 10)), nEdgeR = BCA.smoothNoise(rng, n + 1, Math.max(3, n / 10));
    const eA = natural ? 35 : 12;                                               // извилистость бровки коренного берега, м

    /* плановое положение русла и долины */
    const arc = y => R === 0 ? 0 : Math.sign(R) * (Math.abs(R) - Math.sqrt(Math.max(0, R * R - y * y)));
    const roomL = Math.max(0, (xL - xBL) - W), roomR = Math.max(0, (xBR - xR) - W);
    const sc = y => arc(y);                                              // смещение русла
    const sv = y => { const s = sc(y); return s - U.clamp(s, -0.85 * roomL, 0.85 * roomR); };   // смещение долины
    const dRel = y => ((sc(y + 1) - sv(y + 1)) - (sc(y - 1) - sv(y - 1))) / 2;
    const fade = y => smooth(Math.abs(y) / (0.12 * L));

    /* возмущения */
    const nHill = BCA.smoothNoise2D(rng, n, n, Math.max(3, Math.round(n / 8)));
    const nGriva = BCA.smoothNoise2D(rng, n, n, [Math.max(2, Math.round(n / 40)), Math.max(6, Math.round(n / 4))]);
    const nBed = BCA.smoothNoise2D(rng, n, n, Math.max(3, Math.round(n / 12)));
    const amp = t.amp ?? 0.3;
    // старицы: серповидные понижения на поймах (в координатах долины ξ, y)
    const oxbows = [];
    if (natural) {
      const k = rng.int(2, 4);
      for (let j = 0; j < k; j++) {
        const left = rng.next() < (xL - xBL) / ((xL - xBL) + (xBR - xR) || 1);
        const a = left ? xBL + 0.3 * W : xR + 0.6 * W, b = left ? xL - 0.6 * W : xBR - 0.3 * W;
        if (b - a < 0.8 * W) continue;
        const r = rng.uniform(0.35, 0.5) * (b - a), cy = (rng.next() < 0.5 ? -1 : 1) * rng.uniform(0.2, 0.42) * L;
        oxbows.push({ cx: (a + b) / 2 + rng.uniform(-0.1, 0.1) * (b - a), cy, r, w: rng.uniform(0.2, 0.3) * r + 10, d: rng.uniform(1.5, 3.0),
          a0: rng.uniform(0, 2 * Math.PI), span: rng.uniform(2.2, 3.8) });
      }
    }
    // овраги на коренных склонах: от внешнего края к подошве берега
    const ravines = [];
    if (natural) for (const side of [-1, 1]) {
      const k = rng.int(1, 2);
      for (let j = 0; j < k; j++) ravines.push({ side, y0: (rng.next() < 0.5 ? -1 : 1) * rng.uniform(0.2, 0.45) * L, d: rng.uniform(1.5, 3.5), w: rng.uniform(18, 35), wig: rng.uniform(10, 30), ph: rng.uniform(0, 6.28) });
    }

    const pts = [], axis = [];
    for (let iy = 0; iy < n; iy++) {
      const y = -L / 2 + iy * step, f = fade(y), s_v = sv(y), rel = sc(y) - s_v, cos = Math.cos(Math.atan(dRel(y)));
      axis.push([U.r2(off + s_v + xc + rel), U.r2(y)]);
      for (let ix = 0; ix < n; ix++) {
        const X = ix * step, q = X - off - s_v;                          // абсцисса в координатах долины (профиля)
        const cq = xc + rel, u = (q - cq) * cos / hw;                    // положение поперёк русла
        // извилистая граница берега и поймы
        const qe = q - f * eA * (nEdgeL[iy] * Math.exp(-Math.pow((q - xBL) / 70, 2)) + nEdgeR[iy] * Math.exp(-Math.pow((q - xBR) / 70, 2)));
        const oldBed = qe > xL && qe < xR;                               // прежнее положение русла (если оно сместилось)
        const flood = inLP(qe) || inPP(qe) || oldBed;
        const base = oldBed ? chord(qe) + f * 0.6 : flood ? trend(qe) + resid(qe - wig(y)) * env(y) : fill(qe);
        let z;
        if (Math.abs(u) < 1) {
          let d = depth(u);
          if (R !== 0) { const outer = -Math.sign(R) * u;                 // > 0 — к вогнутому берегу
            d *= 1 + f * 0.45 * outer * (1 - u * u) * 2; }
          z = Math.min(base, fill(q)) - d * (1 + f * 0.15 * nBed(ix, iy));
        } else {
          z = base;
          let dz = amp * nHill(ix, iy);
          if (natural && flood) {
            const dist = Math.abs(q - cq) - hw;                           // от бровки
            dz += 0.6 * Math.exp(-dist / (0.8 * W));                      // прирусловой вал
            dz += 0.45 * nGriva(ix, iy);                                  // гривы и межгривья
            for (const o of oxbows) {
              const dx = qe - o.cx, dy = y - o.cy, rr = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
              const da = ((ang - o.a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
              if (da > o.span) continue;
              const taper = Math.sin(Math.PI * da / o.span), e = Math.abs(rr - o.r) / o.w;
              if (e < 1) dz -= o.d * Math.pow(Math.cos(e * Math.PI / 2), 2) * Math.pow(taper, 0.4);
            }
          }
          if (natural && !flood) {
            for (const r of ravines) {
              const inSide = r.side < 0 ? qe < xBL : qe > xBR; if (!inSide) continue;
              const far = r.side < 0 ? xBL - qe : qe - xBR;               // расстояние от подошвы берега
              const yr = r.y0 + r.wig * Math.sin(far / 60 + r.ph), e = Math.abs(y - yr) / (r.w + 0.08 * far);
              if (e < 1) dz -= r.d * Math.min(1, far / 80) * (1 - e) * (1 - e);
            }
          }
          z += dz * f;
        }
        z -= slope * y;
        pts.push([U.r2(X), U.r2(y), U.r2(z)]);
      }
    }
    return { n, step, L, off, points: pts, axis, waterLevel: g.surveyLevel ?? v.hydro.unm, oxbows: oxbows.length, ravines: ravines.length };
  };

  /* Горизонтали методом квадратов (marching squares): [{ level, segs: [[x1, y1, x2, y2], …] }]. */
  T.contours = (res, interval, base = 0) => {
    const n = res.n, P = res.points, zs = P.map(p => p[2]);
    const lo = Math.ceil((Math.min(...zs) - base) / interval) * interval + base, hi = Math.max(...zs);
    const out = [];
    for (let lev = lo; lev <= hi; lev += interval) {
      const segs = [], L = +lev.toFixed(6);
      for (let iy = 0; iy < n - 1; iy++) for (let ix = 0; ix < n - 1; ix++) {
        const a = P[iy * n + ix], b = P[iy * n + ix + 1], c = P[(iy + 1) * n + ix + 1], d = P[(iy + 1) * n + ix];
        const e = [[a, b], [b, c], [c, d], [d, a]], hits = [];
        for (const [p, q] of e) { if ((p[2] < L) !== (q[2] < L)) { const t = (L - p[2]) / (q[2] - p[2]); hits.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); } }
        if (hits.length === 2) segs.push([hits[0][0], hits[0][1], hits[1][0], hits[1][1]]);
        else if (hits.length === 4) { segs.push([hits[0][0], hits[0][1], hits[1][0], hits[1][1]]); segs.push([hits[2][0], hits[2][1], hits[3][0], hits[3][1]]); }
      }
      out.push({ level: L, segs });
    }
    return out;
  };
  /* Шаг горизонталей по перепаду высот: 0,25 / 0,5 / 1 / 2 / 5 м. */
  T.autoInterval = res => { const zs = res.points.map(p => p[2]), d = Math.max(...zs) - Math.min(...zs); return [0.25, 0.5, 1, 2, 5].find(s => d / s <= 40) || 5; };

  T.toCSV = (res, sep = ';', decimalComma = true) => {
    const f = q => decimalComma ? String(q).replace('.', ',') : String(q);
    return ['X' + sep + 'Y' + sep + 'Z'].concat(res.points.map(p => p.map(f).join(sep))).join('\r\n');
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
