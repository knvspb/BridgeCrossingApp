/* Синтетические ряды наблюдений за уровнями воды (п. 8–12 видения генератора).

   Модель (учебная, не нормативная — см. docs/HYDROLOGY_MODEL.md):
   1. Годовые максимумы расходов Qⱼ — выборка из распределения Пирсона III (Cv, Cs = k·Cv).
      Затем выборка аффинно растягивается так, чтобы наименьший и наибольший годовые максимумы
      уровня совпали с заданными преподавателем (min/max УВВ за историю наблюдений).
      Аффинное преобразование сохраняет асимметрию Cs выборки.
   2. Внутригодовой ход Q(t) строится как межень + сумма волн; форма волны — по Г.А. Алексееву:
        y = 10^(−a·(1 − x)²/x),  x = t/tп
      (tп — время подъёма, a — коэффициент формы; при x → 0 y → 0, y(1) = 1).
      Состав волн задаётся типом питания (снеговое / дождевое / ледниковое / смешанное),
      длительности — ландшафтом (равнинная / предгорная / горная) — по пособию, гл. 2.1, 2.3.
   3. Уровни Z(t) получаются из Q(t) по кривой Q(Z) расчётного створа (hydraulics.js),
      поэтому ряды согласованы с профилем, шероховатостью и уклоном варианта.
   4. Опционально — заторные подъёмы уровня при вскрытии (гл. 2.4 пособия).
   Ряд можно задать и извне таблицей (годовые максимумы и навигационные уровни без суточных значений):
   тогда series[j].daily отсутствует, а уровни для РСУ берутся из series[j].rsuPost.
   Таблица для РСУ: максимальный уровень за навигацию при условии, что навигация может быть
   прекращена на t суток (наивысшие t суток исключаются; подряд или в сумме — настраивается). */
(function (root) {
  'use strict';
  const BCA = root.BCA || (root.BCA = {});
  const U = BCA.util;
  const Hy = BCA.hydrology = {};
  const DAYS = 365;

  Hy.alekseev = (x, a) => x <= 0 ? 0 : Math.pow(10, -a * (1 - x) * (1 - x) / x);
  const pulse = (S, d0, tp, a, amp) => { for (let d = Math.max(0, Math.floor(d0)); d < DAYS; d++) S[d] += amp * Hy.alekseev((d - d0) / tp, a); };

  Hy.mByZone = v => { const m = v.hydro.morph; return { LP: m.LP.m, R: m.R.m, PP: m.PP.m }; };
  Hy.rating = v => BCA.hydraulics.ratingCurve(v.geodesy, Hy.mByZone(v), v.hydro.slope.i);

  /* Перенос уровня с водпоста на ось перехода: offsetKm > 0 — пост ниже по течению. */
  Hy.toPost = (v, Z) => U.r2(Z - v.hydro.slope.i * (v.hydro.post.offsetKm || 0) * 1000);
  Hy.postZero = v => v.hydro.post.zero != null ? v.hydro.post.zero : U.r2(Hy.toPost(v, v.hydro.unm) - 2);

  /* Значения по умолчанию, зависящие от профиля. */
  /* Уровни по умолчанию: между бровками русла и подошвами берегов (берега не затапливаются). */
  Hy.autoLevels = v => {
    const g = v.geodesy, I = BCA.profile.idx(g), zBrow = Math.min(g.z[I.iL], g.z[I.iR]), zFoot = Math.min(g.z[I.bl], g.z[I.br]), d = zFoot - zBrow;
    return { zBrow, zFoot, zLo: U.r2(zBrow + 0.08 * d), zHi: U.r2(zBrow + 0.6 * d), viu: U.r2(zBrow + 0.75 * d) };
  };

  /* Форма внутригодового хода расхода (максимум = 1) + сутки вскрытия. */
  Hy.yearShape = (rng, regime) => {
    const L = BCA.RIVER_LANDSCAPE[regime.landscape] || BCA.RIVER_LANDSCAPE.plain;
    const S = new Array(DAYS).fill(0), uni = (r) => rng.uniform(r[0], r[1]);
    let dIce = Math.round(rng.normal(100, 6));
    const rains = (k, from, to, ampLo, ampHi) => { for (let j = 0; j < k; j++) pulse(S, rng.uniform(from, to), uni(L.rainRise), rng.uniform(0.8, 1.4), rng.uniform(ampLo, ampHi)); };
    switch (regime.feed) {
      case 'rain':
        pulse(S, dIce, uni(L.rise), uni(L.a), rng.uniform(0.15, 0.35));
        rains(rng.int(4, 8), 150, 280, 0.3, 1);
        break;
      case 'glacier': {
        const dc = rng.normal(200, 10), sd = rng.uniform(22, 35), nz = BCA.smoothNoise(rng, DAYS, 3);
        for (let d = 0; d < DAYS; d++) S[d] += Math.exp(-0.5 * Math.pow((d - dc) / sd, 2)) * (1 + 0.06 * nz[d]);
        rains(rng.int(1, 2), 170, 260, 0.05, 0.2);
        dIce = Math.round(rng.normal(110, 6));
        break;
      }
      case 'mixed': {
        const dc = rng.normal(195, 10), sd = rng.uniform(22, 32), amp = rng.uniform(0.6, 0.8);
        for (let d = 0; d < DAYS; d++) S[d] += amp * Math.exp(-0.5 * Math.pow((d - dc) / sd, 2));
        rains(rng.int(2, 4), 150, 260, 0.3, 1);
        break;
      }
      default: // snow
        pulse(S, dIce, uni(L.rise), uni(L.a), 1);
        rains(rng.int(1, 3), 165, 290, 0.08, 0.45);
    }
    const mx = Math.max(...S); for (let d = 0; d < DAYS; d++) S[d] /= mx;
    return { S, dIce };
  };

  /* Уровень при допускаемом перерыве навигации t суток. */
  Hy.rsuValue = (levels, t, consecutive) => {
    const n = levels.length; if (!n) return null;
    if (t <= 0) return Math.max(...levels);
    if (t >= n) return null;
    if (!consecutive) return levels.slice().sort((a, b) => b - a)[t];
    const pre = new Array(n), suf = new Array(n);
    for (let i = 0; i < n; i++) pre[i] = Math.max(levels[i], i ? pre[i - 1] : -Infinity);
    for (let i = n - 1; i >= 0; i--) suf[i] = Math.max(levels[i], i < n - 1 ? suf[i + 1] : -Infinity);
    let best = Infinity;
    for (let s = 0; s + t <= n; s++) best = Math.min(best, Math.max(s ? pre[s - 1] : -Infinity, s + t < n ? suf[s + t] : -Infinity));
    return best;
  };

  /* Главная функция: заполняет v.hydro.series. */
  Hy.generate = v => {
    const h = v.hydro, r = h.regime, rng = BCA.rng((v.meta.seed | 0) + 7919 + (r.seedOffset | 0));
    const rc = Hy.rating(v), auto = Hy.autoLevels(v);
    const zLo = r.zLo ?? auto.zLo, zHi = r.zHi ?? auto.zHi;
    const n = Math.max(3, h.post.nYears | 0), Cs = r.Cv * r.CsCv;
    let X = U.range(n, () => 1 + r.Cv * rng.pearson3(Cs));
    const xmin = Math.min(...X), xmax = Math.max(...X), Qlo = rc.Q(zLo), Qhi = rc.Q(zHi);
    const Qpk = X.map(x => Qlo + (x - xmin) / (xmax - xmin || 1) * (Qhi - Qlo));
    const Qlow = rc.Q(h.unm);
    const series = [];
    for (let j = 0; j < n; j++) {
      const { S, dIce } = Hy.yearShape(rng, r);
      const nb = BCA.smoothNoise(rng, DAYS, 25);
      const daily = new Array(DAYS);
      for (let d = 0; d < DAYS; d++) {
        const Qb = Qlow * (1 + 0.25 * Math.max(0, nb[d]));
        daily[d] = rc.Z(Qb + (Qpk[j] - Qlow) * S[d]);
      }
      let jam = false;
      if (r.iceJams && (r.feed === 'snow' || r.feed === 'mixed') && rng.next() < 0.4) {
        jam = true; const dj = dIce + rng.int(0, 4), dz = rng.uniform(0.3, 1.0);
        for (let k = -2; k <= 3; k++) { const d = dj + k; if (d >= 0 && d < DAYS) daily[d] += dz * Math.max(0, 1 - Math.abs(k) / 3); }
      }
      const z2 = daily.map(U.r2);
      let dMax = 0; z2.forEach((zz, d) => { if (zz > z2[dMax]) dMax = d; });
      const navStart = U.clamp((r.feed === 'snow' || r.feed === 'mixed') ? dIce + rng.int(3, 10) : Math.round(rng.normal(110, 6)), 60, 200);
      const navDays = Math.round(U.clamp(rng.normal(r.navMean, r.navSd), 90, DAYS - navStart));
      series.push({ year: h.post.firstYear + j, zMax: z2[dMax], dMax, navStart, navDays, jam, daily: z2 });
    }
    h.series = series;
    h.seriesStamp = Hy.stamp(v);
    if (h.viu.z == null || h.viu.auto) { h.viu.auto = true; h.viu.z = U.r2(Math.min(auto.zFoot - 0.1, Math.max(auto.viu, Math.max(...series.map(s => s.zMax)) + rng.uniform(0.3, 0.8)))); }
    if (h.viu.year == null) h.viu.year = h.post.firstYear - rng.int(20, 60);
    if (h.viu.refZ == null) h.viu.refZ = U.r2(h.viu.z - rng.uniform(0.8, 2.5));
    return series;
  };

  /* ---------- производные таблицы ---------- */
  Hy.annualTable = v => {
    const z0 = Hy.postZero(v);
    return (v.hydro.series || []).map(s => ({ year: s.year, zMax: s.zMax, zPost: Hy.toPost(v, s.zMax), P: U.r2(Hy.toPost(v, s.zMax) - z0), jam: s.jam, dMax: s.dMax }));
  };
  Hy.rsuTable = v => {
    const h = v.hydro;
    return (h.series || []).map(s => {
      const row = { year: s.year, navDays: s.navDays, navStart: s.navStart, values: {} };
      if (s.daily) {
        const lev = s.daily.slice(s.navStart, s.navStart + s.navDays);
        h.rsuT.forEach(t => { const val = Hy.rsuValue(lev, t, h.rsuConsecutive); row.values[t] = val == null ? null : Hy.toPost(v, val); });
      } else h.rsuT.forEach(t => { row.values[t] = s.rsuPost?.[t] ?? null; });   // ряд задан таблицей извне, без суточных уровней
      return row;
    });
  };
  /* Что видит студент (истинные значения остаются в варианте для проверки). */
  Hy.studentView = v => {
    const h = v.hydro, s = h.slope, out = { postZero: Hy.postZero(v) };
    out.viuExcess = h.viu.z != null && h.viu.refZ != null ? U.r2(h.viu.z - h.viu.refZ) : null;
    if (s.studentMode === 'twoLevels') {
      const Lkm = s.Lkm || Math.max(1, Math.ceil(0.5 / (s.i * 1000)));
      const dz = s.i * Lkm * 1000, z0 = v.geodesy.surveyLevel;
      out.slopeTask = { Lkm, zUp: U.r2(z0 + dz / 2), zDown: U.r2(z0 - dz / 2) };
      out.slopeCheck = U.round((out.slopeTask.zUp - out.slopeTask.zDown) / (Lkm * 1000), 6);
    }
    return out;
  };
  /* «Отпечаток» исходных данных рядов: если профиль, шероховатость, уклон или режим изменились
     после генерации, ряды устарели (интерфейс предлагает перегенерировать). */
  Hy.stamp = v => {
    const h = v.hydro, s = JSON.stringify([v.geodesy.z, v.geodesy.zones, Hy.mByZone(v), h.slope.i, h.unm, h.regime, h.post.nYears, h.post.firstYear, v.meta.seed]);
    let x = 2166136261; for (let k = 0; k < s.length; k++) { x ^= s.charCodeAt(k); x = Math.imul(x, 16777619); }
    return (x >>> 0).toString(36);
  };
  Hy.DAYS = DAYS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
