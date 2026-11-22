/* Топоповерхность участка мостового перехода по профилю (п. 17 плана генератора).

   План — квадрат со стороной L (по умолчанию длина профиля); ось дороги — центральная ось X (Y = 0),
   ось Y — вдоль реки, по течению. Сечение по оси дороги в точности совпадает с профилем задания.

   Радиус R — кривизна реки в плане: 0 — прямая; R > 0 — изгиб влево, R < 0 — вправо (по течению).
   Русло следует дуге радиуса R; долина смещается вслед за руслом, только когда русло подходит к краю поймы.
   На изгибе плёс у вогнутого берега, прирусловая отмель у выпуклого.

   Уклон реки i:
   — дно русла (всё сечение) понижается вниз по течению на i·s, где s — длина по оси русла от оси дороги
     (на изгибе s больше расстояния по долине);
   — пойма и коренные берега — с уклоном долины iд = i·K, где K — извилистость русла в пределах плана;
   — урез воды наклонный: Z = Zизыск − i·s.

   Старицы и другие понижения пойм из профиля непрерывны вдоль всей долины: их положение поперёк поймы
   плавно смещается (монотонная деформация координаты поймы: края поймы закреплены, середина «гуляет»),
   поэтому старица то приближается к руслу, то отдаляется, но не прерывается до и после моста.
   В оси дороги смещение равно нулю.

   Дополнительно (естественный рельеф, по умолчанию при R ≠ 0): гривы вдоль русла, прирусловые валы,
   извилистая бровка коренного берега, овраги на склонах, серповидные озёра-старицы вдали от оси. */
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
    const fill = q => (q > xL && q < xR) ? chord(q) : prof(q);                    // русло засыпано по хорде бровок
    const depth = u => Math.max(0, chord(xc + u * hw) - prof(xc + u * hw));        // глубина русла, u ∈ [−1; 1]

    /* пойма = плавный тренд + микрорельеф профиля (старицы, гривы, западины) */
    const inLP = q => q > xBL && q < xL, inPP = q => q > xR && q < xBR;
    const trend = q => {
      if (inLP(q)) { const s = (q - xBL) / (xL - xBL); return g.z[I.bl] + (zBl - g.z[I.bl]) * Math.pow(s, 0.85); }
      if (inPP(q)) { const s = (xBR - q) / (xBR - xR); return g.z[I.br] + (zBr - g.z[I.br]) * Math.pow(s, 0.85); }
      return fill(q);
    };
    const resid = q => (inLP(q) || inPP(q)) ? fill(q) - trend(q) : 0;
    /* деформация координаты поймы σ ∈ [0; 1] (от подошвы берега к бровке): σисх = σ − a(y)·sin(πσ).
       |a| < 1/π — отображение монотонно, края поймы неподвижны; a(0) = 0. */
    const aMax = natural ? 0.24 : 0.1;
    const warpFn = () => { const A = rng.uniform(0.6, 1) * aMax, lam = L * rng.uniform(0.18, 0.3), ph = rng.uniform(0, 6.28), A2 = rng.uniform(0, 0.35) * A, lam2 = lam * rng.uniform(0.35, 0.55), ph2 = rng.uniform(0, 6.28);
      return y => U.clamp(A * (Math.sin(y / lam + ph) - Math.sin(ph)) + A2 * (Math.sin(y / lam2 + ph2) - Math.sin(ph2)), -0.3, 0.3); };
    const aL = warpFn(), aR = warpFn();
    const depthMod = (() => { const ph = rng.uniform(0, 6.28), lam = L * rng.uniform(0.2, 0.35); return y => 1 + 0.2 * (Math.sin(y / lam + ph) - Math.sin(ph)) * (natural ? 1 : 0.4); })();
    const floodplainZ = (q, y) => {
      if (inLP(q)) { const s = (q - xBL) / (xL - xBL), s0 = s - aL(y) * Math.sin(Math.PI * s); return trend(q) + resid(xBL + s0 * (xL - xBL)) * depthMod(y); }
      if (inPP(q)) { const s = (xBR - q) / (xBR - xR), s0 = s - aR(y) * Math.sin(Math.PI * s); return trend(q) + resid(xBR - s0 * (xBR - xR)) * depthMod(y); }
      return fill(q);
    };
    const nEdgeL = BCA.smoothNoise(rng, n + 1, Math.max(3, n / 10)), nEdgeR = BCA.smoothNoise(rng, n + 1, Math.max(3, n / 10));
    const eA = natural ? 35 : 12;                                               // извилистость бровки коренного берега, м

    /* плановое положение русла и долины */
    const arc = y => R === 0 ? 0 : Math.sign(R) * (Math.abs(R) - Math.sqrt(Math.max(0, R * R - y * y)));
    const roomL = Math.max(0, (xL - xBL) - W), roomR = Math.max(0, (xBR - xR) - W);
    const sc = y => arc(y);                                                      // смещение оси русла
    const sv = y => { const s = sc(y); return s - U.clamp(s, -0.85 * roomL, 0.85 * roomR); };   // смещение долины
    const dRel = y => ((sc(y + 1) - sv(y + 1)) - (sc(y - 1) - sv(y - 1))) / 2;
    const fade = y => smooth(Math.abs(y) / (0.12 * L));

    /* длина по оси русла s(y) от оси дороги — численно, и извилистость K */
    const sArc = (() => { const h = Math.max(0.5, step / 4), tab = new Map();
      const f = y => { let s = 0; const sg = Math.sign(y); for (let u = 0; u < Math.abs(y) - 1e-9; u += h) { const d = Math.min(h, Math.abs(y) - u), y0 = sg * u, y1 = sg * (u + d); s += Math.hypot(d, sc(y1) - sc(y0)); } return sg * s; };
      return y => { const k = Math.round(y * 1000); if (!tab.has(k)) tab.set(k, f(y)); return tab.get(k); }; })();
    const K = (sArc(L / 2) - sArc(-L / 2)) / L, iv = slope * K;

    /* возмущения */
    const nHill = BCA.smoothNoise2D(rng, n, n, Math.max(3, Math.round(n / 8)));
    const nGriva = BCA.smoothNoise2D(rng, n, n, [Math.max(2, Math.round(n / 40)), Math.max(6, Math.round(n / 4))]);
    const nBed = BCA.smoothNoise2D(rng, n, n, Math.max(3, Math.round(n / 12)));
    const amp = t.amp ?? 0.3;
    // серповидные озёра-старицы — только вдали от оси дороги (не пересекают её)
    const lakes = [];
    if (natural) {
      const k = rng.int(1, 3);
      for (let j = 0; j < k; j++) {
        const left = rng.next() < (xL - xBL) / ((xL - xBL) + (xBR - xR) || 1);
        const a = left ? xBL + 0.3 * W : xR + 0.6 * W, b = left ? xL - 0.6 * W : xBR - 0.3 * W;
        if (b - a < 0.8 * W) continue;
        const cyAbs = rng.uniform(0.3, 0.45) * L, r0 = rng.uniform(0.3, 0.45) * (b - a), w = rng.uniform(0.2, 0.3) * r0 + 8;
        const r = Math.min(r0, cyAbs - 0.15 * L - w); if (r < 20) continue;
        lakes.push({ cx: (a + b) / 2 + rng.uniform(-0.1, 0.1) * (b - a), cy: (rng.next() < 0.5 ? -1 : 1) * cyAbs, r, w, d: rng.uniform(1.2, 2.5), a0: rng.uniform(0, 2 * Math.PI), span: rng.uniform(2.2, 3.6) });
      }
    }
    // овраги на коренных склонах: от внешнего края к подошве берега
    const ravines = [];
    if (natural) for (const side of [-1, 1]) {
      const k = rng.int(1, 2);
      for (let j = 0; j < k; j++) ravines.push({ side, y0: (rng.next() < 0.5 ? -1 : 1) * rng.uniform(0.2, 0.45) * L, d: rng.uniform(1.5, 3.5), w: rng.uniform(14, 26), wig: rng.uniform(25, 50), lam: rng.uniform(70, 130), ph: rng.uniform(0, 6.28), head: rng.uniform(120, 260) });
    }

    const pts = [], axis = [], wl = [], wl0 = g.surveyLevel ?? v.hydro.unm;
    for (let iy = 0; iy < n; iy++) {
      const y = -L / 2 + iy * step, f = fade(y), s_v = sv(y), rel = sc(y) - s_v, cos = Math.cos(Math.atan(dRel(y))), s = sArc(y);
      axis.push([U.r2(off + s_v + xc + rel), U.r2(y)]);
      wl.push(U.r2(wl0 - slope * s));
      for (let ix = 0; ix < n; ix++) {
        const X = ix * step, q = X - off - s_v;                                // абсцисса в координатах долины (профиля)
        const cq = xc + rel, u = (q - cq) * cos / hw;                          // положение поперёк русла
        const qe = q - f * eA * (nEdgeL[iy] * Math.exp(-Math.pow((q - xBL) / 70, 2)) + nEdgeR[iy] * Math.exp(-Math.pow((q - xBR) / 70, 2)));
        const oldBed = qe > xL && qe < xR;                                     // прежнее положение русла (если оно сместилось)
        const flood = inLP(qe) || inPP(qe) || oldBed;
        // прежнее положение русла (при смещении русла на изгибе) засыпано: приподнято вместе с полосой у прежних бровок
        const away = R !== 0 && Math.abs(q - cq) > hw ? f * (1 - smooth(Math.max(0, xL - qe, qe - xR) / 45)) * U.clamp((Math.abs(q - cq) - hw) / 30, 0, 1) : 0;
        const base = (oldBed ? chord(qe) : flood ? floodplainZ(qe, y) : fill(qe)) + 0.9 * away;
        let z;
        if (Math.abs(u) < 1) {
          let d = depth(u);
          if (R !== 0) { const outer = -Math.sign(R) * u; d *= 1 + f * 0.45 * outer * (1 - u * u) * 2; }   // плёс у вогнутого берега
          z = Math.min(base, fill(q)) - d * (1 + f * 0.15 * nBed(ix, iy)) - slope * s;                     // дно — с уклоном по длине русла
          z = Math.min(z, base - iv * y);                                                                   // не выше поймы рядом
        } else {
          let dz = amp * nHill(ix, iy);
          if (natural && flood) {
            const dist = Math.abs(q - cq) - hw;
            dz += 0.6 * Math.exp(-dist / (0.8 * W));                           // прирусловой вал
            dz += 0.45 * nGriva(ix, iy);                                       // гривы и межгривья
            for (const o of lakes) {
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
              const far = r.side < 0 ? xBL - qe : qe - xBR;
              if (far > r.head + 200) continue;                              // вершина оврага на склоне
              const yr = r.y0 + r.wig * Math.sin(far / r.lam + r.ph), e = Math.abs(y - yr) / (r.w + 0.12 * Math.min(far, r.head));
              const along = Math.min(1, far / 80) * (1 - smooth((far - r.head) / 200));    // устье у подошвы → вершина
              if (e < 1) dz -= r.d * along * Math.pow(Math.cos(e * Math.PI / 2), 2);
            }
          }
          z = base + dz * f - iv * y;                                          // пойма и берега — с уклоном долины
        }
        pts.push([U.r2(X), U.r2(y), U.r2(z)]);
      }
    }
    return { n, step, L, off, points: pts, axis, wl, waterLevel: wl0, slope, valleySlope: iv, sinuosity: K, lakes: lakes.length, ravines: ravines.length };
  };

  /* ---------- изолинии ---------- */
  /* Изолиния уровня 0 поля val (массив по узлам сетки) методом квадратов; отрезки собираются в полилинии. */
  T.isolines = (res, val) => {
    const n = res.n, P = res.points, segs = [];
    const cut = (i, j) => { const t = val[i] / (val[i] - val[j]); return [P[i][0] + t * (P[j][0] - P[i][0]), P[i][1] + t * (P[j][1] - P[i][1])]; };
    for (let iy = 0; iy < n - 1; iy++) for (let ix = 0; ix < n - 1; ix++) {
      const a = iy * n + ix, b = a + 1, c = a + n + 1, d = a + n, e = [[a, b], [b, c], [c, d], [d, a]], hits = [];
      for (const [p, q] of e) if ((val[p] < 0) !== (val[q] < 0)) hits.push(cut(p, q));
      if (hits.length === 2) segs.push([hits[0], hits[1]]);
      else if (hits.length === 4) {                                                 // седло: по среднему значению
        const mid = (val[a] + val[b] + val[c] + val[d]) / 4;
        if ((mid < 0) === (val[a] < 0)) { segs.push([hits[0], hits[3]]); segs.push([hits[1], hits[2]]); }
        else { segs.push([hits[0], hits[1]]); segs.push([hits[2], hits[3]]); }
      }
    }
    return T.joinSegments(segs);
  };
  /* Сборка отрезков в полилинии по совпадающим концам. */
  T.joinSegments = segs => {
    const key = p => Math.round(p[0] * 1e4) + ':' + Math.round(p[1] * 1e4), ends = new Map(), used = new Uint8Array(segs.length), lines = [];
    segs.forEach((s, k) => { for (const e of [0, 1]) { const kk = key(s[e]); if (!ends.has(kk)) ends.set(kk, []); ends.get(kk).push(k); } });
    const next = (p, from) => { const l = ends.get(key(p)) || []; return l.find(k => k !== from && !used[k]); };
    for (let k0 = 0; k0 < segs.length; k0++) {
      if (used[k0]) continue;
      used[k0] = 1; const line = [segs[k0][0], segs[k0][1]];
      for (const dir of [1, -1]) {                                                  // наращиваем в обе стороны
        let cur = k0;
        for (;;) {
          const tip = dir > 0 ? line[line.length - 1] : line[0], k = next(tip, cur); if (k == null) break;
          used[k] = 1; const s = segs[k], other = key(s[0]) === key(tip) ? s[1] : s[0];
          if (dir > 0) line.push(other); else line.unshift(other); cur = k;
        }
      }
      const closed = line.length > 3 && key(line[0]) === key(line[line.length - 1]);
      lines.push({ pts: line, closed });
    }
    return lines;
  };
  /* Сглаживание Чайкина: iters итераций; концы незамкнутых линий сохраняются. */
  T.chaikin = (line, iters = 3) => {
    let p = line.pts, closed = line.closed;
    if (closed) p = p.slice(0, -1);
    for (let it = 0; it < iters && p.length > 2; it++) {
      const q = []; const m = p.length;
      if (!closed) q.push(p[0]);
      for (let k = 0; k < (closed ? m : m - 1); k++) {
        const a = p[k], b = p[(k + 1) % m];
        q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
      }
      if (!closed) q.push(p[m - 1]);
      p = q;
    }
    if (closed) p = p.concat([p[0]]);
    return { pts: p, closed };
  };
  /* Горизонтали: [{ level, lines: [{ pts, closed }] }] — собранные и сглаженные. */
  T.contours = (res, interval, opt = {}) => {
    const zs = res.points.map(p => p[2]), lo = Math.ceil(Math.min(...zs) / interval) * interval, hi = Math.max(...zs), iters = opt.smooth ?? 3, out = [];
    for (let lev = lo; lev <= hi + 1e-9; lev += interval) {
      const L = +lev.toFixed(6), val = zs.map(z => (z === L ? z + 1e-7 : z) - L);
      out.push({ level: L, lines: T.isolines(res, val).map(l => T.chaikin(l, iters)) });
    }
    return out;
  };
  /* Допуск «сухо/вода»: поверхность, совпадающая с уровнем воды в пределах 2 см, считается сухой
     (иначе ровные площадки на отметке уровня дают «мерцающие» пятна воды). */
  T.WET_TOL = 0.02;
  /* Урез воды: изолиния поверхности относительно наклонного уровня воды wl(y). */
  T.waterEdge = (res, opt = {}) => {
    const n = res.n, val = res.points.map((p, k) => { const d = p[2] - res.wl[Math.floor(k / n)] + T.WET_TOL; return d === 0 ? 1e-7 : d; });
    return T.isolines(res, val).map(l => T.chaikin(l, opt.smooth ?? 3));
  };
  /* Шаг горизонталей по перепаду высот: 0,25 / 0,5 / 1 / 2 / 5 м. */
  T.autoInterval = res => { const zs = res.points.map(p => p[2]), d = Math.max(...zs) - Math.min(...zs); return [0.25, 0.5, 1, 2, 5].find(s => d / s <= 40) || 5; };
  /* Отметка поверхности в точке плана (билинейно) и уровень воды на широте y. */
  T.zAt = (res, X, Y) => {
    const n = res.n, fx = U.clamp(X / res.step, 0, n - 1), fy = U.clamp((Y + res.L / 2) / res.step, 0, n - 1);
    const ix = Math.min(n - 2, Math.floor(fx)), iy = Math.min(n - 2, Math.floor(fy)), tx = fx - ix, ty = fy - iy, P = res.points, z = (a, b) => P[b * n + a][2];
    return (z(ix, iy) * (1 - tx) + z(ix + 1, iy) * tx) * (1 - ty) + (z(ix, iy + 1) * (1 - tx) + z(ix + 1, iy + 1) * tx) * ty;
  };
  T.wlAt = (res, Y) => U.interp(res.wl.map((_, k) => -res.L / 2 + k * res.step), res.wl, Y);

  T.toCSV = (res, sep = ';', decimalComma = true) => {
    const f = q => decimalComma ? String(q).replace('.', ',') : String(q);
    return ['X' + sep + 'Y' + sep + 'Z'].concat(res.points.map(p => p.map(f).join(sep))).join('\r\n');
  };

  /* ---------- DXF (AutoCAD R12, ASCII) ----------
     Горизонтали — 3D-полилинии (POLYLINE, флаг 8; VERTEX, флаг 32) с Z = отметке горизонтали.
     Слои: HOR_OSN — основные, HOR_UTOLSH — утолщённые (каждая 5-я), HOR_PODPIS — подписи,
     UREZ — урез воды (3D, по наклонному уровню), OS_DOROGI — ось дороги (3D по поверхности),
     OS_RUSLA — ось русла (3D по уровню воды), RAMKA — граница плана.
     Система координат: X — вдоль оси дороги, Y = −y (в чертеже вверх — против течения, как на экране). */
  T.toDXF = (res, opt = {}) => {
    const interval = opt.interval || T.autoInterval(res), index = interval * 5, out = [], f = v => (Math.round(v * 1000) / 1000).toString();
    const w = (c, v) => out.push(String(c), String(v));
    const layers = [['HOR_OSN', 33], ['HOR_UTOLSH', 34], ['HOR_PODPIS', 34], ['UREZ', 5], ['OS_DOROGI', 6], ['OS_RUSLA', 150], ['RAMKA', 7]];
    w(0, 'SECTION'); w(2, 'HEADER'); w(9, '$ACADVER'); w(1, 'AC1009'); w(9, '$INSUNITS'); w(70, 6); w(0, 'ENDSEC');
    w(0, 'SECTION'); w(2, 'TABLES'); w(0, 'TABLE'); w(2, 'LAYER'); w(70, layers.length);
    layers.forEach(([name, col]) => { w(0, 'LAYER'); w(2, name); w(70, 0); w(62, col); w(6, 'CONTINUOUS'); });
    w(0, 'ENDTAB'); w(0, 'ENDSEC');
    w(0, 'SECTION'); w(2, 'ENTITIES');
    const poly3d = (layer, pts, zFn, closed) => {
      if (pts.length < 2) return;
      w(0, 'POLYLINE'); w(8, layer); w(66, 1); w(10, 0); w(20, 0); w(30, 0); w(70, 8 | (closed ? 1 : 0));
      const P = closed && pts.length > 2 ? pts.slice(0, -1) : pts;
      P.forEach((p, k) => { w(0, 'VERTEX'); w(8, layer); w(10, f(p[0])); w(20, f(-p[1])); w(30, f(zFn(p, k))); w(70, 32); });
      w(0, 'SEQEND'); w(8, layer);
    };
    const isIdx = l => Math.abs(l / index - Math.round(l / index)) < 1e-6;
    T.contours(res, interval, { smooth: opt.smooth ?? 3 }).forEach(c => c.lines.forEach(l => {
      poly3d(isIdx(c.level) ? 'HOR_UTOLSH' : 'HOR_OSN', l.pts, () => c.level, l.closed);
      if (isIdx(c.level) && l.pts.length > 12) {                                     // подпись в середине линии
        const k = Math.floor(l.pts.length / 2), a = l.pts[k - 1], b = l.pts[k + 1], ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * 180 / Math.PI;
        w(0, 'TEXT'); w(8, 'HOR_PODPIS'); w(10, f(l.pts[k][0])); w(20, f(-l.pts[k][1])); w(30, f(c.level)); w(40, f(Math.max(2, res.L / 300)));
        w(1, String(+c.level.toFixed(2)).replace('.', ',')); w(50, f(((ang + 90) % 180) - 90)); w(72, 1); w(11, f(l.pts[k][0])); w(21, f(-l.pts[k][1])); w(31, f(c.level));
      }
    }));
    T.waterEdge(res).forEach(l => poly3d('UREZ', l.pts, p => T.wlAt(res, p[1]), l.closed));
    const road = []; for (let X = 0; X <= res.L + 1e-9; X += res.step / 2) road.push([X, 0]);
    poly3d('OS_DOROGI', road, p => T.zAt(res, p[0], 0), false);
    poly3d('OS_RUSLA', res.axis, p => T.wlAt(res, p[1]), false);
    const Lh = res.L / 2; poly3d('RAMKA', [[0, -Lh], [res.L, -Lh], [res.L, Lh], [0, Lh], [0, -Lh]], () => 0, true);
    w(0, 'ENDSEC'); w(0, 'EOF');
    return out.join('\r\n') + '\r\n';
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
