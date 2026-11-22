/* Гидравлика живого сечения по оси перехода.
   На интервале створов i…i+1 длиной l при уровне Z (h = Z − z):
     оба створа под водой — b = l, ω = l(hᵢ + hᵢ₊₁)/2;
     один под водой — урез линейной интерполяцией, b = l·hмокр/|Δz|, ω = b·hмокр/2;
     оба сухие — 0.
   По участкам ЛП / Р / ПП суммируются B и ω, hср = ω/B (R ≈ hср);
   Q(Z) = Σ ω·m·hср^(2/3)·√i  (формула Шези — Маннинга, m = 1/n).
   Берега относятся к соседним поймам (в норме они сухие). */
(function (root) {
  'use strict';
  const BCA = root.BCA || (root.BCA = {});
  const H = BCA.hydraulics = {};
  const GROUP = { BL: 'LP', LP: 'LP', R: 'R', PP: 'PP', BR: 'PP' };

  H.wetGeometry = (g, Z, x) => {
    x = x || BCA.profile.stationX(g);
    const I = BCA.profile.idx(g), zones = { LP: { B: 0, w: 0 }, R: { B: 0, w: 0 }, PP: { B: 0, w: 0 } };
    for (let i = 0; i < g.z.length - 1; i++) {
      const l = x[i + 1] - x[i], h0 = Z - g.z[i], h1 = Z - g.z[i + 1];
      let b = 0, w = 0;
      if (h0 > 0 && h1 > 0) { b = l; w = l * (h0 + h1) / 2; }
      else if (h0 > 0 || h1 > 0) { const hw = Math.max(h0, h1); b = l * hw / Math.abs(g.z[i] - g.z[i + 1]); w = b * hw / 2; }
      const k = GROUP[BCA.profile.intervalZone(g, i, I)];
      zones[k].B += b; zones[k].w += w;
    }
    for (const k in zones) zones[k].h = zones[k].B > 0 ? zones[k].w / zones[k].B : 0;
    return zones;
  };

  /* m по участкам { LP, R, PP }, i — продольный уклон. */
  H.discharge = (g, Z, m, i, x) => {
    const zs = H.wetGeometry(g, Z, x), si = Math.sqrt(i);
    let Q = 0; for (const k of ['LP', 'R', 'PP']) if (zs[k].w > 0) Q += zs[k].w * m[k] * Math.pow(zs[k].h, 2 / 3) * si;
    return Q;
  };

  /* Кривая Q(Z) таблицей с шагом dz от тальвега до верха профиля; обратная Z(Q) — интерполяцией. */
  H.ratingCurve = (g, m, i, dz = 0.02) => {
    const x = BCA.profile.stationX(g), zMin = Math.min(...g.z), zTop = Math.min(g.z[0], g.z[g.z.length - 1]);
    const Zs = [], Qs = [];
    for (let Z = zMin; Z <= zTop + 1e-9; Z += dz) { Zs.push(Z); Qs.push(H.discharge(g, Z, m, i, x)); }
    for (let k = 1; k < Qs.length; k++) if (Qs[k] <= Qs[k - 1]) Qs[k] = Qs[k - 1] + 1e-9;
    return { zMin, zTop, Zs, Qs, Q: Z => BCA.util.interp(Zs, Qs, Z), Z: Q => BCA.util.interp(Qs, Zs, Q), Qtop: Qs[Qs.length - 1] };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
