/* Пространственная топоповерхность по профилю (п. 17 видения).
   План — квадрат со стороной L (по умолчанию длина профиля). Ось дороги — центральная ось X квадрата
   (y = 0), вдоль неё лежит профиль; ось Y направлена вдоль реки (по течению — к +y).
   Радиус R задаёт кривизну реки в плане: 0 — прямая; R > 0 — изгиб влево, R < 0 — вправо
   (смещение оси долины dx(y) = R − sign(R)·√(R² − y²), окружность, касательная к оси дороги в y = 0).
   Добавляются: продольный уклон долины (i·y), гладкие неровности пойм, а при R ≠ 0 —
   асимметрия русла на изгибе (у вогнутого берега глубже, у выпуклого — отмель).
   Все возмущения гасятся к y = 0, чтобы сечение по оси перехода точно совпадало с профилем задания. */
(function (root) {
  'use strict';
  const BCA = root.BCA || (root.BCA = {});
  const U = BCA.util;
  const T = BCA.topo = {};

  T.generate = (v, opt = {}) => {
    const g = v.geodesy, t = Object.assign({}, v.topo, opt), x = BCA.profile.stationX(g);
    const L = t.size || x[x.length - 1], step = Math.max(1, t.gridStep || 10), n = Math.floor(L / step) + 1;
    const R = Number(t.radius) || 0, i = v.hydro.slope.i || 0, rng = BCA.rng(t.seed | 0);
    const noise = BCA.smoothNoise2D(rng, n, n, Math.max(3, Math.round(n / 8)));
    const noiseFine = BCA.smoothNoise2D(rng, n, n, Math.max(2, Math.round(n / 25)));
    const I = BCA.profile.idx(g), xL = x[I.iL], xR = x[I.iR], xc = (xL + xR) / 2, half = (xR - xL) / 2;
    const zEdge = Math.min(g.z[0], g.z[g.z.length - 1]);
    const shift = y => R === 0 ? 0 : (Math.abs(y) >= Math.abs(R) ? Math.sign(R) * Math.abs(R) : R - Math.sign(R) * Math.sqrt(R * R - y * y));
    const curv = R === 0 ? 0 : U.clamp(L / Math.abs(R), 0, 1) * Math.sign(R);   // 0…1 — «сила» изгиба
    const pts = [];
    for (let iy = 0; iy < n; iy++) {
      const y = -L / 2 + iy * step, fade = U.clamp(Math.abs(y) / (0.15 * L), 0, 1);
      for (let ix = 0; ix < n; ix++) {
        const xp = ix * step, xs = xp - (L - x[x.length - 1]) / 2 - shift(y);        // абсцисса в системе профиля (профиль по центру квадрата)
        let z = BCA.profile.zAt(g, U.clamp(xs, 0, x[x.length - 1]), x);
        if (xs < 0) z += (0 - xs) * 0.01; else if (xs > x[x.length - 1]) z += (xs - x[x.length - 1]) * 0.01;   // за краем профиля — пологий подъём
        const inCh = xs > xL && xs < xR, u = inCh ? (xs - xc) / half : 0;          // −1…1 поперёк русла
        let dz = 0;
        if (!inCh) dz += t.amp * (noise(ix, iy) + 0.4 * noiseFine(ix, iy)) * (1 + Math.abs(curv));
        else if (curv !== 0) dz += -Math.abs(curv) * 1.5 * (Math.sign(curv) * u) * (1 - u * u) * 2;  // вогнутый берег глубже
        z += dz * fade - i * y;
        if (z > zEdge + 20) z = zEdge + 20;
        pts.push([U.r2(xp), U.r2(y), U.r2(z)]);
      }
    }
    return { n, step, L, points: pts };
  };

  T.toCSV = (res, sep = ';', decimalComma = true) => {
    const f = v => decimalComma ? String(v).replace('.', ',') : String(v);
    return ['X' + sep + 'Y' + sep + 'Z'].concat(res.points.map(p => p.map(f).join(sep))).join('\r\n');
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
