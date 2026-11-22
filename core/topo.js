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
  T.MIN_RADIUS = 25;                                                            // минимальный радиус горизонталей по умолчанию, м
  const smooth = t => { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  T.generate = (v, opt = {}) => {
    const g = v.geodesy, t = Object.assign({}, v.topo, opt), x = BCA.profile.stationX(g), I = BCA.profile.idx(g), N = I.N;
    const Lp = x[N - 1], L = t.size || Lp, step = Math.max(1, t.gridStep || 10), n = Math.floor(L / step) + 1;
    const R = Number(t.radius) || 0, slope = v.hydro.slope.i || 0, rng = BCA.rng(t.seed | 0);
    const natural = t.natural ?? (R !== 0);
    const Rmin = t.minR ?? T.MIN_RADIUS ?? 25;                                   // формы рельефа генератора не уже 2·Rmin
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
    /* то же сечение, сглаженное окном шириной в шаг сетки: острый тальвег (уже шага сетки) иначе «мерцает»
       от ряда к ряду и даёт ложные ямы; на оси дороги используется точное сечение */
    const depthAA = (() => { const K = 400, tab = new Float64Array(K + 1), hU = (step * 1.5) / hw;
      for (let k = 0; k <= K; k++) { const u = -1 + 2 * k / K; let s = 0, c = 0; for (let j = -8; j <= 8; j++) { const uu = U.clamp(u + hU * j / 8, -1, 1); s += depth(uu); c++; } tab[k] = s / c; }
      // наибольшая глубина — как в узлах сетки на оси дороги (там точное сечение): иначе ось мельче соседних рядов → ложная яма
      let m0 = 0, m1 = 0; for (let k = 0; k <= K; k++) m1 = Math.max(m1, tab[k]);
      for (let ix = 0; ix < n; ix++) { const u = (ix * step - off - xc) / hw; if (Math.abs(u) < 1) m0 = Math.max(m0, depth(u)); }
      if (!(m0 > 0)) for (let k = 0; k <= K; k++) m0 = Math.max(m0, depth(-1 + 2 * k / K));
      const sc = m1 > 0 ? m0 / m1 : 1;
      return u => { const f = (U.clamp(u, -1, 1) + 1) / 2 * K, k = Math.min(K - 1, Math.floor(f)); return sc * (tab[k] + (tab[k + 1] - tab[k]) * (f - k)); }; })();

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
    const aMax = natural ? 0.24 : 0.16;
    const warpFn = () => { const A = rng.uniform(0.6, 1) * aMax, lam = L * rng.uniform(0.18, 0.3), ph = rng.uniform(0, 6.28), A2 = rng.uniform(0, 0.35) * A, lam2 = lam * rng.uniform(0.35, 0.55), ph2 = rng.uniform(0, 6.28);
      return y => U.clamp(A * (Math.sin(y / lam + ph) - Math.sin(ph)) + A2 * (Math.sin(y / lam2 + ph2) - Math.sin(ph2)), -0.3, 0.3); };
    const aL = warpFn(), aR = warpFn();
    const depthMod = (() => { const ph = rng.uniform(0, 6.28), lam = L * rng.uniform(0.2, 0.35); return y => 1 + 0.075 * (Math.sin(y / lam + ph) - Math.sin(ph)) * (natural ? 1 : 0.4); })();   // ±15 %
    let lastResid = 0;                                                       // микрорельеф в последней точке (для гашения добавок в понижениях)
    const floodplainZ = (q, y) => {
      if (inLP(q)) { const s = (q - xBL) / (xL - xBL), s0 = s - aL(y) * Math.sin(Math.PI * s); lastResid = resid(xBL + s0 * (xL - xBL)) * depthMod(y); return trend(q) + lastResid; }
      if (inPP(q)) { const s = (xBR - q) / (xBR - xR), s0 = s - aR(y) * Math.sin(Math.PI * s); lastResid = resid(xBR - s0 * (xBR - xR)) * depthMod(y); return trend(q) + lastResid; }
      lastResid = 0; return fill(q);
    };
    const nEdgeL = BCA.smoothNoise(rng, n + 1, Math.max(3, n / 10)), nEdgeR = BCA.smoothNoise(rng, n + 1, Math.max(3, n / 10));
    /* плавное поперечное смещение долины вне русла (большие радиусы вместо прямых): D(q, y) = A(q)·s(y)·g(q),
       s(0) = 0; A — своё для левой и правой стороны; g = 0 в русле (при R = 0 река остаётся прямой).
       |∂D/∂q| < 0,5 — смещение монотонно, формы рельефа не перехлёстываются. */
    const dA = (natural ? 1 : 0.8) * Math.min(40, 0.06 * L), dL = rng.uniform(0.5, 1) * dA * (rng.next() < 0.5 ? -1 : 1), dR = rng.uniform(0.5, 1) * dA * (rng.next() < 0.5 ? -1 : 1);
    const dLam = L * rng.uniform(0.09, 0.15), dPh = rng.uniform(0, 6.28), dLam2 = L * rng.uniform(0.05, 0.07), dPh2 = rng.uniform(0, 6.28);   // длины волн 0,6–0,9 L и 0,3–0,45 L
    const dS = y => (Math.sin(y / dLam + dPh) - Math.sin(dPh)) + 0.35 * (Math.sin(y / dLam2 + dPh2) - Math.sin(dPh2));
    const drift = (q, y, cq) => { const w = smooth((q - cq + 300) / 600), A = dL * (1 - w) + dR * w, gch = smooth((Math.abs(q - cq) - hw) / (1.5 * W)); return A * gch * dS(y); };
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
    const nHill = BCA.fourierNoise2D(rng, Math.max(3, n / 10));
    const nGriva = BCA.fourierNoise2D(rng, [Math.max(2, n / 45, 2.5 * Rmin / step), Math.max(6, n / 5)]);   // гривы не уже 2,5·Rmin
    const amp = t.amp ?? 0.3;
    // серповидные озёра-старицы — только вдали от оси дороги (не пересекают её)
    const lakes = [];
    if (natural) {
      const k = rng.int(1, 3);
      for (let j = 0; j < k; j++) {
        const left = rng.next() < (xL - xBL) / ((xL - xBL) + (xBR - xR) || 1);
        const a = left ? xBL + 0.3 * W : xR + 0.6 * W, b = left ? xL - 0.6 * W : xBR - 0.3 * W;
        if (b - a < 0.8 * W) continue;
        const cyAbs = rng.uniform(0.3, 0.45) * L, r0 = rng.uniform(0.3, 0.45) * (b - a), w = Math.max(Rmin * 1.3, rng.uniform(0.2, 0.3) * r0 + 8);
        const r = Math.min(r0, cyAbs - 0.15 * L - w); if (r < 20) continue;
        lakes.push({ cx: (a + b) / 2 + rng.uniform(-0.1, 0.1) * (b - a), cy: (rng.next() < 0.5 ? -1 : 1) * cyAbs, r, w, d: rng.uniform(1.2, 2.5), a0: rng.uniform(0, 2 * Math.PI), span: rng.uniform(2.2, 3.6) });
      }
    }
    // овраги на коренных склонах: от внешнего края к подошве берега
    const ravines = [];
    if (natural) for (const side of [-1, 1]) {
      const k = rng.int(1, 2);
      for (let j = 0; j < k; j++) ravines.push({ side, y0: (rng.next() < 0.5 ? -1 : 1) * rng.uniform(0.2, 0.45) * L, d: rng.uniform(1.5, 3.5), w: Math.max(Rmin * 1.3, rng.uniform(14, 26)), wig: rng.uniform(25, 50), lam: rng.uniform(70, 130), ph: rng.uniform(0, 6.28), head: rng.uniform(120, 260) });
    }

    /* ширина русла плавно меняется вдоль течения (±6 %): русло прямое при R = 0, но горизонтали в нём — не линейки */
    /* тальвег слегка извивается внутри русла (побочни у берегов поочерёдно) — и в прямом русле */
    const twL = W * rng.uniform(4, 5) / (2 * Math.PI), twP = rng.uniform(0, 6.28), tw = y => 0.25 * (Math.sin(y / twL + twP) - Math.sin(twP)) / 2;
    const bwL = L * rng.uniform(0.065, 0.1), bwP = rng.uniform(0, 6.28), bw = y => 1 + 0.06 * (Math.sin(y / bwL + bwP) - Math.sin(bwP));
    const pts = [], axis = [], wl = [], wl0 = g.surveyLevel ?? v.hydro.unm;
    for (let iy = 0; iy < n; iy++) {
      const y = -L / 2 + iy * step, f = fade(y), s_v = sv(y), rel = sc(y) - s_v, cos = Math.cos(Math.atan(dRel(y))), s = sArc(y), hwy = hw * (1 + f * (bw(y) - 1));
      axis.push([U.r2(off + s_v + xc + rel), U.r2(y)]);
      wl.push(U.r2(wl0 - slope * s));
      for (let ix = 0; ix < n; ix++) {
        const X = ix * step, q0 = X - off - s_v;                               // абсцисса в координатах долины (профиля)
        const cq = xc + rel;                                                   // текущая ось русла
        const q = q0 - f * drift(q0, y, cq);                                   // плавное смещение долины вне русла
        const u = (q - cq) * cos / hwy;                                        // положение поперёк русла
        const qe = q - f * eA * (nEdgeL[iy] * Math.exp(-Math.pow((q - xBL) / 70, 2)) + nEdgeR[iy] * Math.exp(-Math.pow((q - xBR) / 70, 2)));
        /* поймы отсчитываются от ТЕКУЩИХ бровок русла: при смещении русла одна пойма сжимается, другая
           расширяется, формы поймы (старицы) сдвигаются вместе с ней и не прерываются */
        const bank = qe <= xBL || qe >= xBR;
        let qs = qe;
        if (!bank && Math.abs(u) >= 1) {
          if (q < cq) { const sg = U.clamp((qe - xBL) / Math.max(1, (cq - hwy) - xBL), 0, 1); qs = xBL + sg * (xL - xBL); }
          else { const sg = U.clamp((xBR - qe) / Math.max(1, xBR - (cq + hwy)), 0, 1); qs = xBR - sg * (xBR - xR); }
        }
        const flood = !bank && Math.abs(u) >= 1;
        let z;
        if (Math.abs(u) < 1) {
          /* дно: сечение из профиля; на изгибе тальвег смещается к вогнутому берегу (глубина не растёт),
             вниз по течению — только уклон i по длине русла: без ям */
          const dlt = U.clamp((R !== 0 ? -Math.sign(R) * 0.3 * f : 0) + f * tw(y), -0.45, 0.45), uu = U.clamp(u - dlt * (1 - u * u), -1, 1);
          const zb = zBl + (zBr - zBl) * (u + 1) / 2;
          z = zb - ((1 - f) * depth(uu) + f * depthAA(uu)) - slope * s;
        } else {
          lastResid = 0; const base = flood ? floodplainZ(qs, y) : fill(qs);
          const inHollow = 1 - smooth(-lastResid / 1.2);                     // 0 в понижениях профиля (старицах), 1 вне их
          let dz = amp * nHill(ix, iy) * inHollow;
          if (natural && flood) {
            const dist = Math.abs(q - cq) - hwy;
            dz += 0.6 * Math.exp(-dist / (0.8 * W)) * inHollow;               // прирусловой вал (не засыпает старицы)
            dz += 0.45 * nGriva(ix, iy) * inHollow;                           // гривы и межгривья
            for (const o of lakes) {
              const dx = qs - o.cx, dy = y - o.cy, rr = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
              const da = ((ang - o.a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
              if (da > o.span) continue;
              const taper = Math.sin(Math.PI * da / o.span), e = Math.abs(rr - o.r) / o.w;
              if (e < 1) dz -= o.d * Math.pow(Math.cos(e * Math.PI / 2), 2) * Math.pow(taper, 0.4);
            }
          }
          if (natural && bank) {
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
    return { n, step, L, off, narrow: t.narrow || 'generalize', sharpTips: t.sharpTips ?? true, keepAxis: t.keepAxis ?? true, axisWin: t.axisWin ?? 10, prof: { x: x.map(q => q + off), z: g.z.slice() }, points: pts, axis, wl, chanHalf: hw, waterLevel: wl0, slope, valleySlope: iv, sinuosity: K, lakes: lakes.length, ravines: ravines.length };
  };

  /* ---------- изолинии ---------- */
  /* Изолиния уровня 0 поля val (массив по узлам сетки) методом квадратов; отрезки собираются в полилинии. */
  T.isolines = (res, val) => {
    const n = res.n, P = res.points, segs = [], neg = new Uint8Array(val.length);
    for (let k = 0; k < val.length; k++) neg[k] = val[k] < 0 ? 1 : 0;
    const cut = (i, j) => { const t = val[i] / (val[i] - val[j]); return [P[i][0] + t * (P[j][0] - P[i][0]), P[i][1] + t * (P[j][1] - P[i][1])]; };
    for (let iy = 0; iy < n - 1; iy++) for (let ix = 0; ix < n - 1; ix++) {
      const a = iy * n + ix, b = a + 1, c = a + n + 1, d = a + n, s = neg[a] + neg[b] + neg[c] + neg[d];
      if (s === 0 || s === 4) continue;                                             // ячейка целиком по одну сторону
      const hits = [];
      if (neg[a] !== neg[b]) hits.push(cut(a, b));
      if (neg[b] !== neg[c]) hits.push(cut(b, c));
      if (neg[c] !== neg[d]) hits.push(cut(c, d));
      if (neg[d] !== neg[a]) hits.push(cut(d, a));
      if (hits.length === 2) segs.push([hits[0], hits[1]]);
      else if (hits.length === 4) {                                                 // седло: по значению в центре ячейки
        const mid = (val[a] + val[b] + val[c] + val[d]) / 4;
        if ((mid < 0) === (neg[a] === 1)) { segs.push([hits[0], hits[3]]); segs.push([hits[1], hits[2]]); }
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
  /* Упрощение полилинии (Дуглас — Пёккер) с допуском tol, м — для выгрузки. */
  T.simplify = (line, tol = 0.05) => {
    const p = line.pts; if (p.length < 4) return line;
    const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1; const st = [[0, p.length - 1]];
    while (st.length) { const [a, b] = st.pop(); let md = 0, mi = -1; const ax = p[a][0], ay = p[a][1], dx = p[b][0] - ax, dy = p[b][1] - ay, L2 = dx * dx + dy * dy || 1e-12;
      for (let k = a + 1; k < b; k++) { const tt = U.clamp(((p[k][0] - ax) * dx + (p[k][1] - ay) * dy) / L2, 0, 1), ex = ax + tt * dx - p[k][0], ey = ay + tt * dy - p[k][1], d = ex * ex + ey * ey; if (d > md) { md = d; mi = k; } }
      if (mi > 0 && md > tol * tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
    return { pts: p.filter((_, k) => keep[k]), closed: line.closed };
  };
  T.radius3 = (a, b, c) => { const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
    const cr = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])); return cr < 1e-12 ? Infinity : ab * bc * ca / (2 * cr); };
  T.lineLength = l => { let s = 0; for (let k = 1; k < l.pts.length; k++) s += Math.hypot(l.pts[k][0] - l.pts[k - 1][0], l.pts[k][1] - l.pts[k - 1][1]); return s; };
  /* Равномерная перенарезка полилинии с шагом ds (концы сохраняются; замкнутая — k точек ровно через периметр/k). */
  T.resample = (line, ds) => {
    const p = line.pts; if (p.length < 2) return line;
    if (line.closed) {
      const cum = [0]; for (let k = 1; k < p.length; k++) cum.push(cum[k - 1] + Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]));
      const per = cum[cum.length - 1], k = Math.max(4, Math.round(per / ds)), d = per / k, r = []; let j = 0;
      for (let i = 0; i < k; i++) { const s = i * d; while (j < cum.length - 2 && cum[j + 1] < s) j++; const seg = cum[j + 1] - cum[j] || 1, tt = (s - cum[j]) / seg;
        r.push([p[j][0] + tt * (p[j + 1][0] - p[j][0]), p[j][1] + tt * (p[j + 1][1] - p[j][1])]); }
      r.push(r[0].slice()); return { pts: r, closed: true };
    }
    const q = [p[0]]; let carry = 0;
    for (let k = 1; k < p.length; k++) { const a = p[k - 1], b = p[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]); let s = ds - carry;
      while (s <= L) { const tt = s / L; q.push([a[0] + tt * (b[0] - a[0]), a[1] + tt * (b[1] - a[1])]); s += ds; } carry = L - (s - ds); }
    const last = p[p.length - 1], ql = q[q.length - 1];
    if (Math.hypot(last[0] - ql[0], last[1] - ql[1]) > ds * 0.3) q.push(last.slice()); else q[q.length - 1] = last.slice();
    return { pts: q, closed: false };
  };

  /* ---------- поверхность для изображения горизонталей ----------
     Горизонтали строятся как изолинии ОДНОЙ сглаженной поверхности, поэтому никогда не пересекаются
     (ни между собой, ни сами с собой). Облако точек (CSV) не меняется — сглаживается только изображение.
     1) сетка сглаживается гауссом σ = SMOOTH_SIGMA·шаг (сила: нет / среднее / сильное / очень сильное);
     2) минимальный радиус Rmin: где у горизонталей радиус меньше Rmin, сглаживание поверхности
        локально усиливается (карта сглаживания: 4 ступени σ), горизонтали строятся заново — до 4 проходов;
     3) поверхность уплотняется в 3 раза кубическим B-сплайном (C²) — линии плавные без доводки. */
  T.SMOOTH_SIGMA = [0, 0.7, 1.5, 2.5];
  T.NARROW_MODES = { generalize: 'генерализовать (снимать формы уже 2·Rmin)', keep: 'сохранять (скруглять до предела)', soft: 'сохранять, радиус Rmin/2' };
  T.FINE = 3;
  const blur = (src, n, sg) => {
    if (!(sg > 0)) return Float64Array.from(src);
    const r = Math.ceil(3 * sg), w = []; for (let j = -r; j <= r; j++) w.push(Math.exp(-0.5 * (j / sg) ** 2));
    const pass = (a, dx, dy) => { const out = new Float64Array(a.length);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let s = 0, ws = 0;
        for (let j = -r; j <= r; j++) { const xx = x + j * dx, yy = y + j * dy; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue; s += w[j + r] * a[yy * n + xx]; ws += w[j + r]; }
        out[y * n + x] = s / ws; } return out; };
    return pass(pass(src, 1, 0), 0, 1);
  };
  /* уплотнение кубическим B-сплайном: узлы мелкой сетки через шаг/F */
  const upsample = (z, n, F) => {
    const nf = (n - 1) * F + 1, out = new Float64Array(nf * nf), B = t => [(1 - t) ** 3 / 6, (3 * t ** 3 - 6 * t * t + 4) / 6, (-3 * t ** 3 + 3 * t * t + 3 * t + 1) / 6, t ** 3 / 6];
    const at = (i, j) => z[U.clamp(j, 0, n - 1) * n + U.clamp(i, 0, n - 1)];
    const W = []; for (let k = 0; k < F; k++) W.push(B(k / F));
    for (let fy = 0; fy < nf; fy++) { const jy = Math.min(n - 2, Math.floor(fy / F)), wy = fy === nf - 1 ? B(1) : W[fy - jy * F] || B((fy - jy * F) / F);
      for (let fx = 0; fx < nf; fx++) { const ix = Math.min(n - 2, Math.floor(fx / F)), wx = fx === nf - 1 ? B(1) : W[fx - ix * F] || B((fx - ix * F) / F);
        let s = 0; for (let b = 0; b < 4; b++) { let r = 0; for (let a = 0; a < 4; a++) r += wx[a] * at(ix - 1 + a, jy - 1 + b); s += wy[b] * r; }
        out[fy * nf + fx] = s; } }
    return { nf, z: out };
  };
  const fineGrid = (res, nf) => { const st = res.step / T.FINE, pts = new Array(nf * nf);
    for (let j = 0; j < nf; j++) for (let i = 0; i < nf; i++) pts[j * nf + i] = [i * st, -res.L / 2 + j * st]; return { n: nf, points: pts }; };
  const levelsOf = (zs, interval) => { let lo = Infinity, hi = -Infinity; for (const z of zs) { if (z < lo) lo = z; if (z > hi) hi = z; }
    const out = []; for (let l = Math.ceil(lo / interval) * interval; l <= hi + 1e-9; l += interval) out.push(+l.toFixed(6)); return out; };
  const isoOn = (grid, zf, L) => T.isolines(grid, Array.from(zf, z => (z === L ? z + 1e-7 : z) - L));
  /* проверка радиуса: точки с радиусом < Rmin (по трём точкам на ≈ Rmin/4 вдоль линии) */
  const tightPoints = (lines, Rmin, ds) => {
    const out = [], sp = Math.max(1, Math.round(Rmin / 4 / ds));
    lines.forEach(l0 => { const l = T.resample(l0, ds); let p = l.pts; if (l.closed) p = p.slice(0, -1); const m = p.length; if (m < 2 * sp + 1) return;
      const id = k => l.closed ? ((k % m) + m) % m : k;
      const M = Math.max(2, Math.round(2 * Rmin / ds)), at = k => p[l.closed ? id(k) : U.clamp(k, 0, m - 1)];
      for (let k = l.closed ? 0 : sp; k < (l.closed ? m : m - sp); k++) if (T.radius3(p[id(k - sp)], p[k], p[id(k + sp)]) < Rmin) {
        /* сход горизонталей (конец «языка» на склоне): в ±2·Rmin по линии ветви идут обратно почти параллельно и рядом */
        const a0 = at(k - M), a1 = at(k - M + 2), b0 = at(k + M - 2), b1 = at(k + M);
        const ta = [a1[0] - a0[0], a1[1] - a0[1]], tb = [b1[0] - b0[0], b1[1] - b0[1]], cs = (ta[0] * tb[0] + ta[1] * tb[1]) / (Math.hypot(...ta) * Math.hypot(...tb) || 1);
        const q = p[k].slice(); q.tip = cs < -0.85 && Math.hypot(a0[0] - b1[0], a0[1] - b1[1]) < 2.5 * Rmin; out.push(q); } });
    return out;
  };
  /* Поверхность для горизонталей (кэшируется в res по силе сглаживания, Rmin и шагу горизонталей). */
  T.displaySurface = (res, opt = {}) => {
    const level = U.clamp(Math.round(opt.smooth ?? 2), 0, 3), Rmin = opt.minR ?? T.MIN_RADIUS, interval = opt.interval || T.autoInterval(res);
    /* узкие формы (уже 2·Rmin), у которых горизонталь не может повернуть с радиусом Rmin:
       keep — сохранять (скругляются до предела, мелкие замкнутые горизонтали остаются);
       generalize — генерализация: мелкие замкнутые горизонтали (периметр < 2πRmin) снимаются, сглаживание усиливается сильнее;
       soft — сохранять формы, допуская для них радиус Rmin/2 (не меньше 10 м). */
    const mode = T.NARROW_MODES[opt.narrow ?? res.narrow] ? (opt.narrow ?? res.narrow) : 'generalize';
    const sharp = opt.sharpTips ?? res.sharpTips ?? true, Rt = mode === 'soft' ? Math.max(10, Rmin / 2) : Rmin;
    const loopMin = mode === 'keep' || !(Rmin > 0) ? 0 : 2 * Math.PI * Rt, passes = 7;
    /* сохранение профиля у оси дороги: в окне |y| ≤ win сглаженная поверхность заменяется исходной, причём сечение
       по оси — точно профиль задания (по створам), далее плавный переход к сглаженной на ширине max(20 м, 2 шага) */
    const keepAxis = opt.keepAxis ?? res.keepAxis ?? true, win = U.clamp(opt.axisWin ?? res.axisWin ?? 10, 2, 20);
    const key = [level, Rmin, interval, mode, sharp, keepAxis, win].join('|'); res._disp = res._disp || {}; if (res._disp[key]) return res._disp[key];
    const n = res.n, z0 = Float64Array.from(res.points, p => p[2]), s0 = T.SMOOTH_SIGMA[level];
    const sig = [s0, Math.max(s0 * 1.7, 2.5), Math.max(s0 * 2.6, 4), Math.max(s0 * 4, 6)];          // ступени σ (в узлах сетки)
    /* в русле — дополнительное сглаживание ВДОЛЬ ОСИ РУСЛА (окно σ ≈ 80 м, на том же смещении от оси):
       дно почти горизонтально (уклон ~10⁻⁴), и колебания выборки узкого тальвега сеткой иначе рисуются ложными «ямами»;
       сглаживание по оси y сетки на изгибе смешивало бы дно с берегом — поэтому именно вдоль кривой оси */
    if (res.axis && res.chanHalf) {
      const sy = Math.max(2, 80 / res.step), r = Math.ceil(2.5 * sy), w = []; for (let j = -r; j <= r; j++) w.push(Math.exp(-0.5 * (j / sy) ** 2));
      const src = Float64Array.from(z0), zAtRow = (y, X) => { const fx = U.clamp(X / res.step, 0, n - 1), i = Math.min(n - 2, Math.floor(fx)), tt = fx - i; return src[y * n + i] * (1 - tt) + src[y * n + i + 1] * tt; };
      for (let y = 0; y < n; y++) { const cx = res.axis[y][0];
        for (let x = 0; x < n; x++) { const off = x * res.step - cx, d = Math.abs(off) / res.chanHalf, m = 1 - smooth((d - 0.85) / 0.3); if (!(m > 0)) continue;
          let s = 0, ws = 0; for (let j = -r; j <= r; j++) { const yy = y + j; if (yy < 0 || yy >= n) continue; s += w[j + r] * zAtRow(yy, res.axis[yy][0] + off); ws += w[j + r]; }
          z0[y * n + x] = src[y * n + x] * (1 - m) + (s / ws) * m; } }
    }
    const wmap = new Float64Array(n * n), F = T.FINE, nf = (n - 1) * F + 1, grid = fineGrid(res, nf), ds = res.step / 3;
    /* защищённые зоны: русло (полоса 1,3 полуширины вдоль оси русла) и полоса у оси дороги — только базовое сглаживание */
    const guard = new Float64Array(n * n), hwG = (res.chanHalf || 0) * 1.3 + res.step, yBand = Math.max(2 * res.step, 0.04 * res.L);
    for (let j = 0; j < n; j++) { const y = -res.L / 2 + j * res.step, cx = res.axis ? res.axis[j][0] : -1e9;
      for (let i = 0; i < n; i++) { const X = i * res.step, dch = Math.abs(X - cx) - hwG, dy = Math.abs(y) - yBand;
        guard[j * n + i] = Math.min(1, Math.max(0, Math.min(dch / 30, dy / 30))); } }      // 0 — защищено, 1 — свободно (переход 30 м)
    /* водоёмы (старицы, озёра: дно ниже уреза > 0,2 м) тоже защищены — иначе усиленное сглаживание «замывает» узкую старицу и она рвётся */
    if (res.wl) { const wet = new Float64Array(n * n); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) wet[j * n + i] = z0[j * n + i] < res.wl[j] - 0.2 ? 1 : 0;
      const wb = blur(wet, n, 1); for (let k = 0; k < n * n; k++) guard[k] = Math.min(guard[k], U.clamp(2 - wb[k] / 0.25, 0, 1)); }
    /* генерализация узких форм: морфологическое открытие (снимает гряды и бугры уже 2·Rmin) и закрытие (ямы, озерки,
       понижения уже 2·Rmin) по кругу радиуса Rmin; только вне защищённых зон (русло, ось дороги, водоёмы) */
    if (mode === 'generalize' && Rmin > 0) {
      const rr = Rmin / res.step, ri = Math.floor(rr), disk = [];
      for (let dy = -ri; dy <= ri; dy++) for (let dx = -ri; dx <= ri; dx++) if (dx * dx + dy * dy <= rr * rr + 1e-9) disk.push([dx, dy]);
      const morph = (a, mx) => { const o = new Float64Array(n * n);
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let v = mx ? -Infinity : Infinity;
          for (const [dx, dy] of disk) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue; const q = a[yy * n + xx]; v = mx ? Math.max(v, q) : Math.min(v, q); }
          o[y * n + x] = v; } return o; };
      const zo = morph(morph(z0, false), true), zm = blur(morph(morph(zo, true), false), n, Math.max(1, 0.5 * rr));   // открытие, затем закрытие; края площадок скругляются
      const gB = blur(guard, n, 1);
      for (let k = 0; k < n * n; k++) { const wlk = res.wl ? res.wl[Math.floor(k / n)] : -Infinity, w = gB[k] * smooth((z0[k] - wlk - 0.2) / 0.3);   // вода и полоса 0,2–0,5 м над урезом не трогаются
        z0[k] = z0[k] * (1 - w) + zm[k] * w; }
    }
    const lv = sig.map(s => blur(z0, n, s));
    /* в русле поперёк не сглаживаем: узкий тальвег иначе мелеет на 0,3–0,4 м (дно у оси дороги с точным сечением
       выглядит бугром или ямой); вдоль русла дно уже сглажено. Узлы предфильтруются (≈ обратный фильтр B-сплайна
       [1 4 1]/6), чтобы уплотнённая поверхность проходила через отметки узлов. */
    const chM = new Float64Array(n * n);
    const pre = (() => { const a1 = new Float64Array(n * n), a2 = new Float64Array(n * n), at = (a, x, y) => a[U.clamp(y, 0, n - 1) * n + U.clamp(x, 0, n - 1)];
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) a1[y * n + x] = 1.5 * at(z0, x, y) - 0.25 * (at(z0, x - 1, y) + at(z0, x + 1, y));
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) a2[y * n + x] = 1.5 * at(a1, x, y) - 0.25 * (at(a1, x, y - 1) + at(a1, x, y + 1));
      return a2; })();
    if (res.axis && res.chanHalf) for (let y = 0; y < n; y++) { const cx = res.axis[y][0];
      for (let x = 0; x < n; x++) chM[y * n + x] = 1 - smooth((Math.abs(x * res.step - cx) / res.chanHalf - 0.5) / 0.3); }   // ядро русла, бровки сглаживаются как обычно
    const free = (x, y) => { const i = Math.round(x / res.step), j = Math.round((y + res.L / 2) / res.step); return i >= 0 && j >= 0 && i < n && j < n && guard[j * n + i] > 0.5; };
    let zc, fine, levels, lines, tight = [];
    const tr = Math.max(60, 5 * res.step), wAx = y => { const a = Math.abs(y); return a <= win ? 1 : 1 - smooth((a - win) / tr); };
    const rawAt = (X, y) => { const fx = U.clamp(X / res.step, 0, n - 1), fy = U.clamp((y + res.L / 2) / res.step, 0, n - 1), i = Math.min(n - 2, Math.floor(fx)), j = Math.min(n - 2, Math.floor(fy)), a = fx - i, b = fy - j, Z = (ii, jj) => res.points[jj * n + ii][2];
      return (Z(i, j) * (1 - a) + Z(i + 1, j) * a) * (1 - b) + (Z(i, j + 1) * (1 - a) + Z(i + 1, j + 1) * a) * b; };
    const profAt = X => res.prof && X >= res.prof.x[0] && X <= res.prof.x[res.prof.x.length - 1] ? U.interp(res.prof.x, res.prof.z, X) : rawAt(X, 0);
    /* поправка d(X) = профиль − сглаженное сечение по оси; добавляется с весом w(y): на оси — точно профиль,
       по сторонам — тот же сглаженный рельеф, сдвинутый по высоте (без «площадок» на уровне горизонтали) */
    /* цель на оси: на поймах и берегах — профиль по створам; в русле — исходная поверхность по узлам сетки (острая
       вершина тальвега между узлами сеткой не передаётся и на оси выглядела бы ямой, которой нет вдоль русла) */
    const cx0 = res.axis ? U.interp(res.axis.map(q => q[1]), res.axis.map(q => q[0]), 0) : 0, hw = res.chanHalf || 0;
    const targetAt = X => { const m = hw ? 1 - smooth((Math.abs(X - cx0) / hw - 1) / 0.3) : 0; return profAt(X) * (1 - m) + rawAt(X, 0) * m; };
    const axisBlend = (fn, zcc) => {
      const fix = (z, m, h) => { const fy = (res.L / 2) / h, j0 = Math.min(m - 2, Math.floor(fy)), ty = fy - j0, d = new Float64Array(m);
        for (let i = 0; i < m; i++) d[i] = targetAt(i * h) - (z[j0 * m + i] * (1 - ty) + z[(j0 + 1) * m + i] * ty);
        for (let j = 0; j < m; j++) { const w = wAx(-res.L / 2 + j * h); if (!(w > 0)) continue; for (let i = 0; i < m; i++) z[j * m + i] += w * d[i]; } };
      fix(fn.z, fn.nf, res.step / F); fix(zcc, n, res.step); };
    /* сходы горизонталей: на конце вытянутой формы на склоне (гряда, ложбина) горизонталь разворачивается «языком»;
       при sharp такие развороты не добиваются до Rmin усиленным сглаживанием — остаются естественно острыми */
    const steep = q => sharp && q.tip;
    for (let pass = 0; pass < passes; pass++) {
      zc = new Float64Array(n * n);
      for (let k = 0; k < n * n; k++) { const w = U.clamp(wmap[k], 0, 3), a = Math.floor(w), b = Math.min(3, a + 1), t = w - a; zc[k] = lv[a][k] * (1 - t) + lv[b][k] * t; zc[k] += chM[k] * (pre[k] - zc[k]); }
      fine = upsample(zc, n, F); if (keepAxis) axisBlend(fine, zc);
      levels = levelsOf(fine.z, interval);
      /* генерализация: замкнутые горизонтали с периметром < loopMin (бугорки и западины уже 2·Rt) снимаются */
      lines = levels.map(L => ({ level: L, lines: isoOn(grid, fine.z, L).filter(l => !(loopMin > 0 && l.closed && T.lineLength(l) < loopMin)) }));
      if (!(Rmin > 0) || pass === passes - 1) break;
      tight = tightPoints(lines.flatMap(c => c.lines), Rt, ds).filter(q => free(q[0], q[1]) && !steep(q));
      if (!tight.length) break;
      const add = new Float64Array(n * n);
      tight.forEach(p => { const ix = Math.round(p[0] / res.step), iy = Math.round((p[1] + res.L / 2) / res.step);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = ix + dx, y = iy + dy; if (x >= 0 && y >= 0 && x < n && y < n) add[y * n + x] = 1; } });
      const addB = blur(add, n, 2.5); let mx = 0; for (const a of addB) mx = Math.max(mx, a);
      for (let k = 0; k < n * n; k++) wmap[k] = Math.min(3, wmap[k] + (mx > 0 ? addB[k] / mx : 0) * guard[k]);
    }
    const allTight = Rmin > 0 ? tightPoints(lines.flatMap(c => c.lines), Rt, ds) : [], freeTight = allTight.filter(q => free(q[0], q[1]));
    const steepN = freeTight.filter(steep).length, remaining = freeTight.length - steepN, inGuard = allTight.length - freeTight.length;
    const dropped = loopMin > 0 ? levels.reduce((s, L) => s + isoOn(grid, fine.z, L).filter(l => l.closed && T.lineLength(l) < loopMin).length, 0) : 0;
    const out = { n, zc, fine, grid, contours: lines, interval, mode, Rt, keepAxis, axisWin: win, remaining, tips: steepN, inGuard, dropped, smoothedNodes: wmap.reduce((s, w) => s + (w > 0.05 ? 1 : 0), 0) };
    res._disp[key] = out; return out;
  };
  /* Горизонтали: [{ level, lines: [{ pts, closed }] }] — изолинии сглаженной поверхности (не пересекаются). */
  T.contours = (res, interval, opt = {}) => T.displaySurface(res, Object.assign({}, opt, { interval })).contours;
  /* Допуск «сухо/вода»: поверхность, совпадающая с уровнем воды в пределах 2 см, считается сухой. */
  T.WET_TOL = 0.02;
  /* Урез воды — изолиния той же сглаженной поверхности относительно наклонного уровня воды wl(y). */
  T.waterEdge = (res, opt = {}) => {
    const d = T.displaySurface(res, opt), nf = d.fine.nf, F = T.FINE, n = res.n;
    const val = Array.from(d.fine.z, (z, k) => { const fy = Math.floor(k / nf) / F, j = Math.min(n - 2, Math.floor(fy)), t = fy - j, wl = res.wl[j] * (1 - t) + res.wl[j + 1] * t, v = z - wl + T.WET_TOL; return v === 0 ? 1e-7 : v; });
    return T.isolines(d.grid, val);
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

  /* Облако точек. opt.surface: 'raw' — исходная поверхность (по умолчанию); 'smooth' — сглаженная поверхность горизонталей
     в узлах сетки; 'fine' — она же на уплотнённой сетке (шаг/3). Сглаженная — значения B-сплайна, по которому
     строятся горизонтали плана и DXF (opt.smooth, opt.minR, opt.interval — как для горизонталей). */
  T.surfacePoints = (res, opt = {}) => {
    const s = opt.surface || 'raw'; if (s === 'raw') return res.points;
    const d = T.displaySurface(res, opt), nf = d.fine.nf, F = T.FINE, st = res.step / F, k = s === 'fine' ? 1 : F, out = [];
    for (let j = 0; j < nf; j += k) for (let i = 0; i < nf; i += k) out.push([U.r2(i * st), U.r2(-res.L / 2 + j * st), Math.round(d.fine.z[j * nf + i] * 1000) / 1000]);
    return out;
  };
  T.toCSV = (res, sep = ';', decimalComma = true, opt = {}) => {
    const f = q => decimalComma ? String(q).replace('.', ',') : String(q);
    return ['X' + sep + 'Y' + sep + 'Z'].concat(T.surfacePoints(res, opt).map(p => p.map(f).join(sep))).join('\r\n');
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
    const tol = opt.tol ?? 0.02;
    T.contours(res, interval, { smooth: opt.smooth, minR: opt.minR }).forEach(c => c.lines.map(l => T.simplify(l, tol)).forEach(l => {
      poly3d(isIdx(c.level) ? 'HOR_UTOLSH' : 'HOR_OSN', l.pts, () => c.level, l.closed);
      if (isIdx(c.level) && l.pts.length > 6) {                                     // подпись в середине линии
        const k = Math.floor(l.pts.length / 2), a = l.pts[k - 1], b = l.pts[k + 1], ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * 180 / Math.PI;
        w(0, 'TEXT'); w(8, 'HOR_PODPIS'); w(10, f(l.pts[k][0])); w(20, f(-l.pts[k][1])); w(30, f(c.level)); w(40, f(Math.max(2, res.L / 300)));
        w(1, String(+c.level.toFixed(2)).replace('.', ',')); w(50, f(((ang + 90) % 180) - 90)); w(72, 1); w(11, f(l.pts[k][0])); w(21, f(-l.pts[k][1])); w(31, f(c.level));
      }
    }));
    T.waterEdge(res, { smooth: opt.smooth, minR: opt.minR, interval }).map(l => T.simplify(l, tol)).forEach(l => poly3d('UREZ', l.pts, p => T.wlAt(res, p[1]), l.closed));
    const road = []; for (let X = 0; X <= res.L + 1e-9; X += res.step / 2) road.push([X, 0]);
    poly3d('OS_DOROGI', road, p => T.zAt(res, p[0], 0), false);
    poly3d('OS_RUSLA', res.axis, p => T.wlAt(res, p[1]), false);
    const Lh = res.L / 2; poly3d('RAMKA', [[0, -Lh], [res.L, -Lh], [res.L, Lh], [0, Lh], [0, -Lh]], () => 0, true);
    w(0, 'ENDSEC'); w(0, 'EOF');
    return out.join('\r\n') + '\r\n';
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
