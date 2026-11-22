/* BridgeCrossingApp — общее ядро: пространство имён, утилиты, воспроизводимый ГСЧ.
   Все модули ядра подключаются обычными <script> (без сборки и без ES-модулей),
   чтобы страницы открывались двойным щелчком из папки (file://) и с GitHub Pages.
   В Node.js те же файлы подключаются через require() — для тестов. */
(function (root) {
  'use strict';
  const BCA = root.BCA || (root.BCA = {});

  /* ---------- числа ---------- */
  const U = BCA.util = {};
  U.round = (v, d = 2) => { if (v == null || !Number.isFinite(v)) return v; const k = Math.pow(10, d); return Math.round(v * k + (v >= 0 ? 1e-9 : -1e-9)) / k; };
  U.r1 = v => U.round(v, 1);
  U.r2 = v => U.round(v, 2);
  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.num = v => { if (v === null || v === undefined || v === '') return null; const x = Number(String(v).replace(',', '.').replace(/\s/g, '')); return Number.isFinite(x) ? x : null; };
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.sum = a => a.reduce((s, v) => s + v, 0);
  U.mean = a => a.length ? U.sum(a) / a.length : NaN;
  U.range = (n, f = i => i) => Array.from({ length: n }, (_, i) => f(i));
  U.deepClone = o => JSON.parse(JSON.stringify(o));
  U.fmt = (v, d = 2) => (v == null || !Number.isFinite(v)) ? '' : v.toFixed(d).replace('.', ',');
  /* Линейная интерполяция по таблице (xs возрастают). За пределами — прижатие к краю. */
  U.interp = (xs, ys, x) => {
    const n = xs.length; if (!n) return NaN;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
    const t = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
    return ys[lo] + (ys[hi] - ys[lo]) * t;
  };

  /* ---------- ГСЧ ----------
     mulberry32 — быстрый 32-битный генератор; одно и то же зерно всегда даёт тот же вариант.
     Это важно для модулей «Варианты» и «Журнал»: вариант можно восстановить по зерну. */
  BCA.rng = function (seed) {
    let a = (seed | 0) ^ 0x9E3779B9;
    const next = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const r = { next };
    r.uniform = (lo = 0, hi = 1) => lo + (hi - lo) * next();
    r.int = (lo, hi) => Math.floor(r.uniform(lo, hi + 1));
    r.pick = arr => arr[Math.floor(next() * arr.length)];
    let spare = null;
    r.normal = (mu = 0, sd = 1) => {          // Бокс — Мюллер
      if (spare != null) { const s = spare; spare = null; return mu + sd * s; }
      let u = 0, v = 0; while (u === 0) u = next(); v = next();
      const m = Math.sqrt(-2 * Math.log(u)); spare = m * Math.sin(2 * Math.PI * v);
      return mu + sd * m * Math.cos(2 * Math.PI * v);
    };
    r.gamma = k => {                          // Марсалья — Цанг, k > 0, масштаб 1
      if (k < 1) return r.gamma(k + 1) * Math.pow(next() || 1e-12, 1 / k);
      const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
      for (;;) {
        let x, v; do { x = r.normal(); v = 1 + c * x; } while (v <= 0);
        v = v * v * v; const u = next();
        if (u < 1 - 0.0331 * x * x * x * x) return d * v;
        if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
      }
    };
    /* Стандартизованная величина Пирсона III (среднее 0, СКО 1, асимметрия cs). */
    r.pearson3 = cs => {
      if (Math.abs(cs) < 1e-3) return r.normal();
      const k = 4 / (cs * cs), g = r.gamma(k);
      return Math.sign(cs) * (g - k) / Math.sqrt(k);
    };
    return r;
  };

  /* Гладкий шум [-1; 1] с корреляцией ~corr отсчётов (косинусная интерполяция опорных точек). */
  BCA.smoothNoise = function (rng, n, corr) {
    const k = Math.max(1, Math.round(corr)), m = Math.ceil(n / k) + 2;
    const ctrl = U.range(m, () => rng.next() * 2 - 1), out = [];
    for (let i = 0; i < n; i++) { const t = i / k, j = Math.floor(t), f = t - j, w = (1 - Math.cos(Math.PI * f)) / 2; out.push(ctrl[j] * (1 - w) + ctrl[j + 1] * w); }
    return out;
  };

  /* Двумерный гладкий шум (value noise) на сетке nx × ny с периодом corr узлов. */
  /* corr — число или [corrX, corrY] (анизотропный шум: вытянутые гряды). Аргументы функции — дробные индексы. */
  BCA.smoothNoise2D = function (rng, nx, ny, corr) {
    const kx = Math.max(1, Array.isArray(corr) ? corr[0] : corr), ky = Math.max(1, Array.isArray(corr) ? corr[1] : corr);
    const mx = Math.ceil(nx / kx) + 3, my = Math.ceil(ny / ky) + 3;
    const g = U.range(my, () => U.range(mx, () => rng.next() * 2 - 1));
    const s = f => (1 - Math.cos(Math.PI * f)) / 2;
    return (ix, iy) => {
      ix = U.clamp(ix, 0, nx); iy = U.clamp(iy, 0, ny);
      const tx = ix / kx, ty = iy / ky, jx = Math.floor(tx), jy = Math.floor(ty), fx = s(tx - jx), fy = s(ty - jy);
      const a = g[jy][jx] * (1 - fx) + g[jy][jx + 1] * fx, b = g[jy + 1][jx] * (1 - fx) + g[jy + 1][jx + 1] * fx;
      return a * (1 - fy) + b * fy;
    };
  };

  /* Гладкий шум без решётки: сумма m косинусов со случайными направлениями и длинами волн около corr
     (corr — число или [corrX, corrY] в узлах; при анизотропии формы вытянуты вдоль большей длины).
     Нет осевых артефактов «квадратного» шума. Значения примерно в [−1; 1]. */
  BCA.fourierNoise2D = function (rng, corr, m = 24) {
    const cx = Array.isArray(corr) ? corr[0] : corr, cy = Array.isArray(corr) ? corr[1] : corr, waves = [];
    for (let k = 0; k < m; k++) {
      const th = rng.uniform(0, 2 * Math.PI), lam = rng.uniform(0.7, 1.6) * 2;          // длина волны ~ 2·corr
      waves.push([Math.cos(th) / (lam * cx) * 2 * Math.PI, Math.sin(th) / (lam * cy) * 2 * Math.PI, rng.uniform(0, 2 * Math.PI), rng.uniform(0.5, 1)]);
    }
    const norm = Math.sqrt(waves.reduce((s, w) => s + w[3] * w[3], 0) / 2) * 1.6;
    return (ix, iy) => { let s = 0; for (const w of waves) s += w[3] * Math.cos(w[0] * ix + w[1] * iy + w[2]); return Math.max(-1, Math.min(1, s / norm)); };
  };

  BCA.newSeed = () => Math.floor(Math.random() * 1e6);
})(typeof globalThis !== 'undefined' ? globalThis : this);
