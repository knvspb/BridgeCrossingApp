/* Поперечный профиль по оси перехода и инженерно-геологические условия (ИГУ).
   Профиль делится на пять зон (слева направо):
     BL — левый берег (не затапливается; здесь известны отметки дороги),
     LP — левая пойма, R — русло (промеры глубин), PP — правая пойма, BR — правый берег.
   Каждая зона задаётся шагом и числом интервалов; число створов производное: Σn + 1.
   Отметки хранятся одним массивом z по всем створам; граничный створ принадлежит обеим соседним зонам. */
(function (root) {
  'use strict';
  const BCA = root.BCA || (root.BCA = {});
  const U = BCA.util;
  const P = BCA.profile = {};

  P.ZONES = ['BL', 'LP', 'R', 'PP', 'BR'];
  P.ZONE_NAME = { BL: 'Левый берег', LP: 'Левая пойма', R: 'Русло', PP: 'Правая пойма', BR: 'Правый берег' };
  P.ZONE_SHORT = { BL: 'ЛБ', LP: 'ЛП', R: 'Р', PP: 'ПП', BR: 'ПБ' };

  /* Индексы границ: bl — берег/пойма слева, iL и iR — бровки русла, br — пойма/берег справа. */
  P.idx = g => {
    const Z = g.zones, bl = Z.BL.n, iL = bl + Z.LP.n, iR = iL + Z.R.n, br = iR + Z.PP.n;
    return { bl, iL, iR, br, N: br + Z.BR.n + 1 };
  };
  P.count = g => g.z.length;
  /* Зона интервала между створами i и i+1. */
  P.intervalZone = (g, i, I = P.idx(g)) => i < I.bl ? 'BL' : i < I.iL ? 'LP' : i < I.iR ? 'R' : i < I.br ? 'PP' : 'BR';
  /* Зона створа (для граничных — зона, которая в нём начинается; у последнего — BR). */
  P.zoneKey = (g, i, I = P.idx(g)) => P.intervalZone(g, Math.min(i, I.N - 2), I);
  P.zoneOf = (g, i, I = P.idx(g)) => {
    const b = [[I.bl, 'BL', 'LP'], [I.iL, 'LP', 'R'], [I.iR, 'R', 'PP'], [I.br, 'PP', 'BR']].find(q => q[0] === i);
    return b ? P.ZONE_SHORT[b[1]] + '/' + P.ZONE_SHORT[b[2]] : P.ZONE_SHORT[P.zoneKey(g, i, I)];
  };
  P.stationX = g => {
    const I = P.idx(g), x = [0];
    for (let i = 0; i < g.z.length - 1; i++) x.push(x[i] + g.zones[P.intervalZone(g, i, I)].step);
    return x;
  };
  P.widths = g => {
    const w = {}; let total = 0;
    P.ZONES.forEach(k => { w[k] = g.zones[k].step * g.zones[k].n; total += w[k]; });
    return Object.assign(w, { total, n: P.idx(g).N });
  };

  /* Перестроить профиль на новое число интервалов по зонам, сохраняя форму внутри зон
     (интерполяция по относительной координате). Кровли ИГУ пересчитываются так же. */
  P.reshape = (v, nNew) => {
    const g = v.geodesy, I0 = P.idx(g), b0 = [0, I0.bl, I0.iL, I0.iR, I0.br, I0.N - 1];
    const n = {}; P.ZONES.forEach(k => { n[k] = Math.max(k === 'R' ? 2 : 1, Math.round(nNew[k] ?? g.zones[k].n)); });
    const seg = (arr, a, b, m) => {
      const src = arr.slice(a, b + 1), xs = src.map((_, k) => k / (src.length - 1));
      return U.range(m + 1, k => { const t = k / m;
        if (src.some(q => q == null)) return src[Math.round(t * (src.length - 1))];
        return U.interp(xs, src, t); });
    };
    const resample = arr => { let out = [];
      P.ZONES.forEach((k, j) => { const s = seg(arr, b0[j], b0[j + 1], n[k]); out = out.concat(j ? s.slice(1) : s); });
      return out; };
    g.z = resample(g.z).map(U.r2);
    (v.geology.layers || []).forEach(l => { l.tops = resample(l.tops).map(t => t == null ? null : U.r2(t)); });
    const N1 = g.z.length;
    (v.tz.road || []).forEach(p => { p.st = U.clamp(Math.round((p.st - 1) / (I0.N - 1) * (N1 - 1)) + 1, 1, N1); });
    P.ZONES.forEach(k => { g.zones[k].n = n[k]; });
    g.comments = {};
    P.clampTops(v);
  };
  /* Задать ширину и шаг зоны: число интервалов = ширина / шаг. */
  P.setZone = (v, key, width, step) => {
    const z = v.geodesy.zones[key];
    if (step > 0) z.step = step;
    if (width > 0) { const n = {}; n[key] = Math.max(1, Math.round(width / z.step)); P.reshape(v, n); }
  };

  /* ---------- генератор профиля ----------
     Берег: подъём от подошвы (граница с поймой) к внешнему краю.
     Пойма: склон от подошвы берега к бровке русла + гладкий шум + старица.
     Русло: корыто с тальвегом в заданном месте; полнота — показатель степени. */
  P.generate = (v) => {
    const g = v.geodesy, p = v.gen.profile, rng = BCA.rng(p.seed | 0), I = P.idx(g), N = I.N, z = new Array(N);
    const nz = (n, c) => BCA.smoothNoise(rng, n + 1, Math.max(2, n / c));
    const nBL = nz(I.bl, 3), nLP = nz(I.iL - I.bl, 6), nR = nz(I.iR - I.iL, 5), nPP = nz(I.br - I.iR, 6), nBR = nz(N - 1 - I.br, 3);
    const run = (a, b, f) => { const n = Math.abs(b - a); for (let k = 0; k <= n; k++) z[a + Math.sign(b - a) * k] = f(n ? k / n : 0, k, n); };
    // берега: t = 0 у подошвы, 1 у внешнего края
    run(I.bl, 0, (t, k, n) => p.zFootL + (p.zOutL - p.zFootL) * Math.pow(t, p.shapeBL) + (k > 0 && k < n ? 0.15 * nBL[k] : 0));
    run(I.br, N - 1, (t, k, n) => p.zFootR + (p.zOutR - p.zFootR) * Math.pow(t, p.shapeBR) + (k > 0 && k < n ? 0.15 * nBR[k] : 0));
    // поймы: t = 1 у подошвы берега, 0 у бровки
    const fp = (zFoot, zBrow, shape, noise, ox, oxPos, arr) => (t, k, n) => {
      const s = 1 - t; let val = zBrow + (zFoot - zBrow) * Math.pow(s, shape);
      if (ox > 0) val -= ox * Math.exp(-Math.pow((s - oxPos) / 0.08, 2));
      if (k > 0 && k < n) val += noise * arr[k] * Math.min(1, s * 6, (1 - s) * 6);
      return val;
    };
    run(I.bl, I.iL, fp(p.zFootL, p.zBrowL, p.shapeL, p.noiseL, p.oxL, p.oxPosL, nLP));
    run(I.br, I.iR, fp(p.zFootR, p.zBrowR, p.shapeR, p.noiseR, p.oxR, p.oxPosR, nPP));
    z[I.bl] = p.zFootL; z[I.br] = p.zFootR; z[I.iL] = p.zBrowL; z[I.iR] = p.zBrowR;
    const a = U.clamp(p.thalPos, 0.05, 0.95), nCh = I.iR - I.iL, low = Math.min(p.zBrowL, p.zBrowR);
    for (let i = I.iL + 1; i < I.iR; i++) {
      const s = (i - I.iL) / nCh, base = p.zBrowL + (p.zBrowR - p.zBrowL) * s;
      const u = s < a ? (a - s) / a : (s - a) / (1 - a), f = U.clamp(1 - Math.pow(u, p.shapeC), 0, 1);
      z[i] = Math.min(base, base - (base - low + (low - p.zThal)) * f + p.noiseC * nR[i - I.iL] * f);
    }
    g.z = z.map(q => U.round(q, p.precision ?? 2));
    P.clampTops(v);
  };

  /* ---------- ИГУ ---------- */
  P.clampTops = v => { const z = v.geodesy.z; (v.geology.layers || []).forEach(l => { l.tops = z.map((zi, i) => l.tops[i] == null ? null : Math.min(l.tops[i], zi)); }); };
  /* Подошва слоя = ближайшая кровля ниже по створу, иначе условный низ. */
  P.bottoms = v => {
    const L = v.geology.layers, ubv = v.geology.ubv;
    return L.map((l, k) => l.tops.map((t, i) => {
      if (t == null) return null;
      let b = -Infinity; L.forEach((o, j) => { if (j !== k && o.tops[i] != null && o.tops[i] < t && o.tops[i] > b) b = o.tops[i]; });
      return b === -Infinity ? ubv : b;
    }));
  };
  /* Поверхность «до вреза»: русло заполнено по хорде бровок и сглажено. */
  const referenceSurface = g => {
    const I = P.idx(g), R = g.z.slice(), N = R.length;
    for (let i = I.iL + 1; i < I.iR; i++) R[i] = g.z[I.iL] + (g.z[I.iR] - g.z[I.iL]) * (i - I.iL) / (I.iR - I.iL);
    const w = Math.max(1, Math.round(N / 24));
    return R.map((_, i) => { let s = 0, c = 0; for (let j = i - w; j <= i + w; j++) if (j >= 0 && j < N) { s += R[j]; c++; } return Math.max(s / c, g.z[i]); });
  };
  /* Генератор грунтов: слои по порядку залегания (gen.order, 1 — верхний), мощность t·(1 + var·шум),
     линзы — между створами from…to; нижний слой доводится до условного низа. */
  P.generateSoil = v => {
    const geo = v.geology, g = v.geodesy, N = g.z.length;
    if (!geo.layers.length) return;
    const L = geo.layers.map((l, k) => [l, l.gen.order ?? k + 1, k]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(a => a[0]);
    const rng = BCA.rng((geo.seed | 0) + 1000), ubv = geo.ubv, corr = Math.max(2, geo.corr * N / 70);
    let Hprev = referenceSurface(g);
    L.forEach((lay, k) => {
      const q = lay.gen, noise = BCA.smoothNoise(rng, N, corr), last = k === L.length - 1;
      const H = Hprev.map((hp, i) => {
        if (last) return ubv;
        let t = Math.max(0, q.t * (1 + q.var * noise[i]));
        if (q.lens) { const a = U.clamp(q.from, 1, N) - 1, b = U.clamp(q.to, 1, N) - 1, c = (a + b) / 2, w = Math.max(1, (b - a) / 2);
          const u = Math.abs(i - c) / w; t *= u >= 1 ? 0 : Math.pow(Math.cos(u * Math.PI / 2), 0.6); }
        return Math.max(ubv + 0.1, hp - t);
      });
      lay.tops = Hprev.map((hp, i) => { const top = Math.min(g.z[i], hp); return top - H[i] > 0.05 ? U.r2(top) : null; });
      Hprev = H;
    });
  };

  /* ---------- данные для студента ---------- */
  /* Промеры глубин русла от уровня воды на дату изысканий (= ноль измерения глубин). */
  P.depths = v => {
    const g = v.geodesy, I = P.idx(g), z0 = g.surveyLevel, out = [];
    for (let i = I.iL; i <= I.iR; i++) out.push({ i, st: i + 1, z: g.z[i], h: U.r2(Math.max(0, z0 - g.z[i])) });
    return out;
  };
  /* Отметки оси дороги (ПЧ) по створам берегов: линейно между характерными точками, за крайними — постоянно. */
  P.roadAt = (v, i) => {
    const pts = (v.tz.road || []).filter(p => p.z != null).slice().sort((a, b) => a.st - b.st);
    if (!pts.length) return null;
    const x = P.stationX(v.geodesy);
    return U.interp(pts.map(p => x[p.st - 1]), pts.map(p => p.z), x[i]);
  };
  /* Комментарий створа: начало каждой зоны. */
  P.comment = (g, i, I = P.idx(g)) => {
    if (g.comments && g.comments[i]) return g.comments[i];
    if (i === 0) return 'Левый берег';
    if (i === I.bl) return 'Левая пойма';
    if (i === I.iL) return 'Русло';
    if (i === I.iR) return 'Правая пойма';
    if (i === I.br) return 'Правый берег';
    return '';
  };
  P.waterSpan = (g, Z, x) => {
    x = x || P.stationX(g); const N = g.z.length; let a = null, b = null;
    for (let i = 0; i < N; i++) if (g.z[i] < Z) { if (a == null) a = i; b = i; }
    if (a == null) return null;
    const xa = a > 0 ? x[a - 1] + (x[a] - x[a - 1]) * (g.z[a - 1] - Z) / (g.z[a - 1] - g.z[a]) : x[0];
    const xb = b < N - 1 ? x[b] + (x[b + 1] - x[b]) * (Z - g.z[b]) / (g.z[b + 1] - g.z[b]) : x[N - 1];
    return [xa, xb];
  };
  P.zAt = (g, xv, x) => U.interp(x || P.stationX(g), g.z, xv);
})(typeof globalThis !== 'undefined' ? globalThis : this);
