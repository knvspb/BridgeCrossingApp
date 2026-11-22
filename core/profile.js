/* Поперечный профиль по оси перехода и инженерно-геологические условия (ИГУ).
   Профиль хранится одним массивом отметок z по створам; бровки — индексы iL и iR.
   Шаги: stepLP (левая пойма), stepR (промеры русла), stepPP (правая пойма).
   Число створов производное: n = ширина / шаг по каждой зоне. 30 + 10 + 30 интервалов = 71 створ (старое задание). */
(function (root) {
  'use strict';
  const BCA = root.BCA || (root.BCA = {});
  const U = BCA.util;
  const P = BCA.profile = {};

  P.count = g => g.z.length;
  P.stationX = g => {
    const x = [0];
    for (let i = 1; i < g.z.length; i++) x.push(x[i - 1] + (i <= g.iL ? g.stepLP : i <= g.iR ? g.stepR : g.stepPP));
    return x;
  };
  P.widths = g => {
    const LP = g.iL * g.stepLP, R = (g.iR - g.iL) * g.stepR, PP = (g.z.length - 1 - g.iR) * g.stepPP;
    return { LP, R, PP, total: LP + R + PP, nLP: g.iL, nR: g.iR - g.iL, nPP: g.z.length - 1 - g.iR, n: g.z.length };
  };
  P.zoneOf = (g, i) => i < g.iL ? 'ЛП' : i === g.iL ? 'ЛП/Р' : i < g.iR ? 'Р' : i === g.iR ? 'Р/ПП' : 'ПП';
  P.zoneKey = (g, i) => i < g.iL ? 'LP' : i <= g.iR ? 'R' : 'PP';

  /* Перестроить профиль на новое число интервалов по зонам, сохраняя форму
     (интерполяция по относительной координате внутри зоны). Кровли ИГУ пересчитываются так же. */
  P.reshape = (v, nLP, nR, nPP) => {
    const g = v.geodesy, old = { z: g.z.slice(), iL: g.iL, iR: g.iR, n: g.z.length };
    nLP = Math.max(1, nLP | 0); nR = Math.max(2, nR | 0); nPP = Math.max(1, nPP | 0);
    const mapSeg = (arr, a, b, m) => {          // отрезок arr[a..b] → m+1 точек
      const src = arr.slice(a, b + 1), xs = src.map((_, k) => k / (src.length - 1));
      return U.range(m + 1, k => { const vals = src; const t = k / m;
        if (vals.some(q => q == null)) { const j = Math.round(t * (vals.length - 1)); return vals[j]; }
        return U.interp(xs, vals, t); });
    };
    const resample = arr => {
      const a = mapSeg(arr, 0, old.iL, nLP), b = mapSeg(arr, old.iL, old.iR, nR), c = mapSeg(arr, old.iR, old.n - 1, nPP);
      return a.concat(b.slice(1), c.slice(1));
    };
    g.z = resample(old.z).map(U.r2);
    (v.geology.layers || []).forEach(l => { l.tops = resample(l.tops).map(t => t == null ? null : U.r2(t)); });
    g.iL = nLP; g.iR = nLP + nR;
    P.clampTops(v);
  };
  P.setWidths = (v, wLP, wR, wPP) => {
    const g = v.geodesy;
    P.reshape(v, Math.round(wLP / g.stepLP), Math.round(wR / g.stepR), Math.round(wPP / g.stepPP));
  };

  /* ---------- генератор профиля ----------
     Поймы: степенной склон от края (коренной берег) к бровке + гладкий шум + старицы.
     Русло: корыто с тальвегом в заданном месте; полнота сечения — показатель степени. */
  P.generate = (v) => {
    const g = v.geodesy, p = v.gen.profile, rng = BCA.rng(p.seed | 0), N = g.z.length, iL = g.iL, iR = g.iR;
    const z = new Array(N), nR = iR - iL;
    const nL = BCA.smoothNoise(rng, iL + 1, Math.max(2, iL / 7)), nC = BCA.smoothNoise(rng, nR + 1, Math.max(2, nR / 5)), nP = BCA.smoothNoise(rng, N - iR, Math.max(2, (N - 1 - iR) / 7));
    const side = (i0, i1, zEdge, zBank, shape, noise, ox, oxPos, nArr, fromEdge) => {
      const n = Math.abs(i1 - i0);
      for (let k = 0; k <= n; k++) {
        const i = fromEdge ? i0 + k : i0 - k;
        const t = 1 - k / n;                                     // 1 у края, 0 у бровки
        let val = zBank + (zEdge - zBank) * Math.pow(t, shape);
        if (ox > 0) val -= ox * Math.exp(-Math.pow((t - oxPos) / 0.07, 2));
        if (k > 0 && k < n) val += noise * nArr[k] * Math.min(1, t * 6);
        z[i] = U.r2(val);
      }
    };
    side(0, iL, p.zEdgeL, p.zBankL, p.shapeL, p.noiseL, p.oxL, p.oxPosL, nL, true);
    side(N - 1, iR, p.zEdgeR, p.zBankR, p.shapeR, p.noiseR, p.oxR, p.oxPosR, nP, false);
    z[iL] = U.r2(p.zBankL); z[iR] = U.r2(p.zBankR);
    const a = U.clamp(p.thalPos, 0.05, 0.95), D = Math.min(p.zBankL, p.zBankR) - p.zThal;
    for (let i = iL + 1; i < iR; i++) {
      const s = (i - iL) / nR, base = p.zBankL + (p.zBankR - p.zBankL) * s;
      const u = s < a ? (a - s) / a : (s - a) / (1 - a);
      const f = U.clamp(1 - Math.pow(u, p.shapeC), 0, 1);
      const val = base - (base - Math.min(p.zBankL, p.zBankR) + D) * f + p.noiseC * nC[i - iL] * f;
      z[i] = U.r2(Math.min(val, base));
    }
    g.z = z.map(q => U.round(q, p.precision ?? 2));
    P.clampTops(v);
  };

  /* ---------- ИГУ ---------- */
  P.clampTops = v => { const z = v.geodesy.z; (v.geology.layers || []).forEach(l => { l.tops = z.map((zi, i) => l.tops[i] == null ? null : Math.min(l.tops[i], zi)); }); };

  /* Подошва слоя = ближайшая кровля ниже по створу, иначе условный низ (как SetGroundBottomLines). */
  P.bottoms = v => {
    const L = v.geology.layers, ubv = v.geology.ubv;
    return L.map((l, k) => l.tops.map((t, i) => {
      if (t == null) return null;
      let b = -Infinity; L.forEach((o, j) => { if (j !== k && o.tops[i] != null && o.tops[i] < t && o.tops[i] > b) b = o.tops[i]; });
      return b === -Infinity ? ubv : b;
    }));
  };

  /* Поверхность «до вреза»: русло заполнено по хорде бровок и сглажено — от неё отсчитываются мощности слоёв. */
  const referenceSurface = g => {
    const R = g.z.slice(), N = R.length;
    for (let i = g.iL + 1; i < g.iR; i++) R[i] = g.z[g.iL] + (g.z[g.iR] - g.z[g.iL]) * (i - g.iL) / (g.iR - g.iL);
    const w = Math.max(1, Math.round(N / 24));
    const out = R.map((_, i) => { let s = 0, c = 0; for (let j = i - w; j <= i + w; j++) if (j >= 0 && j < N) { s += R[j]; c++; } return s / c; });
    return out.map((q, i) => Math.max(q, g.z[i]));
  };

  /* Генератор грунтов: слои укладываются по порядку залегания (gen.order, 1 — верхний),
     мощность = t·(1 + var·шум), линзы ограничены створами from…to; нижний слой доводится до условного низа. */
  P.generateSoil = v => {
    const geo = v.geology, g = v.geodesy, N = g.z.length;
    if (!geo.layers.length) return;
    const L = geo.layers.map((l, k) => [l, l.gen.order ?? k + 1, k]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(a => a[0]);
    const rng = BCA.rng((geo.seed | 0) + 1000), ubv = geo.ubv, corr = Math.max(2, geo.corr * N / 71);
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
  /* Промеры глубин русла от уровня воды на момент изысканий (= ноль измерения глубин). */
  P.depths = v => {
    const g = v.geodesy, z0 = g.surveyLevel, out = [];
    for (let i = g.iL; i <= g.iR; i++) out.push({ i, st: i + 1, z: g.z[i], h: U.r2(Math.max(0, z0 - g.z[i])) });
    return out;
  };
  /* Отметка уреза при уровне Z (линейная интерполяция между створами): крайние точки затопления. */
  P.waterSpan = (g, Z, x) => {
    x = x || P.stationX(g); const N = g.z.length; let a = null, b = null;
    for (let i = 0; i < N; i++) if (g.z[i] < Z) { if (a == null) a = i; b = i; }
    if (a == null) return null;
    const xa = a > 0 ? x[a - 1] + (x[a] - x[a - 1]) * (g.z[a - 1] - Z) / (g.z[a - 1] - g.z[a]) : x[0];
    const xb = b < N - 1 ? x[b] + (x[b + 1] - x[b]) * (Z - g.z[b]) / (g.z[b + 1] - g.z[b]) : x[N - 1];
    return [xa, xb];
  };
  /* Профиль z(x) для произвольной абсциссы. */
  P.zAt = (g, xv, x) => U.interp(x || P.stationX(g), g.z, xv);
})(typeof globalThis !== 'undefined' ? globalThis : this);
