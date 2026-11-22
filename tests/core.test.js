// Тесты ядра: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('./load.js');
const U = B.util;

test('вариант по умолчанию: 71 створ, профиль примера 1/26-c, без ошибок', () => {
  const v = B.schema.defaultVariant(1);
  const w = B.profile.widths(v.geodesy);
  assert.equal(w.n, 71); assert.equal(w.LP, 600); assert.equal(w.R, 150); assert.equal(w.PP, 600); assert.equal(w.total, 1350);
  assert.equal(v.geodesy.z[0], 131); assert.equal(v.geodesy.z[36], U.r2(123 - 5.1));    // створ 37: глубина 5,10 от нуля 123,00
  assert.deepEqual(B.schema.validate(v).filter(m => m.lvl === 'err'), []);
});

test('одно и то же зерно — один и тот же вариант', () => {
  const a = B.schema.defaultVariant(5), b = B.schema.defaultVariant(5);
  assert.deepEqual(a.hydro.series.map(s => s.zMax), b.hydro.series.map(s => s.zMax));
  B.profile.generate(a); B.profile.generate(b); assert.deepEqual(a.geodesy.z, b.geodesy.z);
});

test('число створов производное: перестроение по ширинам и шагам', () => {
  const v = B.schema.defaultVariant(1);
  v.geodesy.stepLP = 25; v.geodesy.stepR = 10; v.geodesy.stepPP = 25;
  B.profile.setWidths(v, 500, 120, 750);
  const w = B.profile.widths(v.geodesy);
  assert.equal(w.n, 20 + 12 + 30 + 1); assert.equal(w.total, 500 + 120 + 750);
  assert.equal(v.geodesy.z[0], 131); assert.equal(v.geodesy.z[w.n - 1], 131);         // края сохраняются
  v.geology.layers.forEach(l => assert.equal(l.tops.length, w.n));
});

test('Q(Z) монотонно растёт, Z(Q(Z)) = Z', () => {
  const v = B.schema.defaultVariant(1), rc = B.hydrology.rating(v);
  for (let k = 1; k < rc.Qs.length; k++) assert.ok(rc.Qs[k] > rc.Qs[k - 1]);
  [121.5, 123.4, 126.1, 128.9].forEach(Z => assert.ok(Math.abs(rc.Z(rc.Q(Z)) - Z) < 1e-6));
});

test('ряд годовых максимумов: min и max совпадают с заданными, ВИУ выше', () => {
  const v = B.schema.defaultVariant(3);
  const z = v.hydro.series.map(s => s.zMax);
  assert.ok(Math.abs(Math.min(...z) - 123.5) <= 0.02, 'min ' + Math.min(...z));
  assert.ok(Math.abs(Math.max(...z) - 127.2) <= 0.02, 'max ' + Math.max(...z));
  assert.ok(v.hydro.viu.z > Math.max(...z));
  assert.equal(v.hydro.series.length, 21);
  v.hydro.series.forEach(s => { assert.equal(s.daily.length, 365); assert.ok(Math.min(...s.daily) >= 121.2 - 0.01); });
});

test('превышения над нулём поста и перенос с поста на ось', () => {
  const v = B.schema.defaultVariant(1);
  B.hydrology.annualTable(v).forEach(a => assert.equal(a.P, U.r2(a.zMax - 121)));
  v.hydro.post.offsetKm = 4; v.hydro.post.zero = null;                // пост на 4 км ниже: уровни ниже на i·L = 0,6 м
  const a = B.hydrology.annualTable(v)[0];
  assert.equal(a.zPost, U.r2(a.zMax - 0.6));
  assert.equal(B.hydrology.postZero(v), U.r2(121.2 - 0.6 - 2));          // по умолчанию — УНМ − 2 м (в месте поста)
});

test('РСУ: исключение t суток подряд и в сумме', () => {
  const lev = [1, 5, 2, 9, 8, 3, 7, 1];
  assert.equal(B.hydrology.rsuValue(lev, 0, true), 9);
  assert.equal(B.hydrology.rsuValue(lev, 1, false), 8);                 // убрали 9
  assert.equal(B.hydrology.rsuValue(lev, 2, false), 7);                 // убрали 9 и 8
  assert.equal(B.hydrology.rsuValue(lev, 2, true), 7);                  // окно [9, 8]
  assert.equal(B.hydrology.rsuValue(lev, 3, true), 7);                  // любое окно из 3 суток оставляет 7 или 9
  assert.equal(B.hydrology.rsuValue(lev, 3, false), 5);                 // в сумме: убрали 9, 8, 7
});

test('РСУ подряд совпадает с перебором окон', () => {
  const rng = B.rng(9);
  for (let rep = 0; rep < 50; rep++) {
    const lev = U.range(40, () => U.r2(rng.uniform(120, 126))), t = rng.int(1, 10);
    let best = Infinity;
    for (let s = 0; s + t <= lev.length; s++) best = Math.min(best, Math.max(...lev.filter((_, i) => i < s || i >= s + t)));
    assert.equal(B.hydrology.rsuValue(lev, t, true), best);
  }
});

test('гидрограф Алексеева: y(1) = 1, y → 0 у начала, максимум при x = 1', () => {
  assert.equal(B.hydrology.alekseev(1, 0.8), 1);
  assert.ok(B.hydrology.alekseev(0.05, 0.8) < 1e-3);
  assert.ok(B.hydrology.alekseev(0.9, 0.8) < 1 && B.hydrology.alekseev(1.1, 0.8) < 1);
});

test('топоповерхность: сечение по оси дороги совпадает с профилем', () => {
  const v = B.schema.defaultVariant(1);
  [0, 3000, -3000].forEach(R => {
    const t = B.topo.generate(v, { radius: R, gridStep: 15 }), n = t.n, mid = Math.round((n - 1) / 2);
    const row = t.points.slice(mid * n, mid * n + n);
    assert.ok(Math.abs(row[0][1]) < 1e-9, 'строка y = 0');
    row.forEach(p => assert.ok(Math.abs(p[2] - U.r2(B.profile.zAt(v.geodesy, p[0]))) <= 0.011, `R=${R}, x=${p[0]}: ${p[2]}`));
  });
});

test('задача на уклон по двум урезам восстанавливает уклон', () => {
  const v = B.schema.defaultVariant(1); v.hydro.slope.studentMode = 'twoLevels';
  const sv = B.hydrology.studentView(v);
  assert.ok(Math.abs(sv.slopeCheck - v.hydro.slope.i) / v.hydro.slope.i < 0.05);
});

test('столбец старой книги: строки как в спецификации', () => {
  const v = B.schema.defaultVariant(1), R = B.exporter.legacyRows(v);
  assert.equal(R[13][1], 131); assert.equal(R[43][1], v.geodesy.z[30]); assert.equal(R[45][1], v.geodesy.z[30]);   // D43 = D45
  assert.equal(R[55][1], v.geodesy.z[40]); assert.equal(R[57][1], v.geodesy.z[40]);                                  // D55 = D57
  assert.equal(R[87][1], 131); assert.equal(R[140][1], v.geology.layers[0].code); assert.equal(R[140 + 75 * 8 + 4 + 70] !== undefined, true);
});

test('миграция: старый JSON без новых полей открывается', () => {
  const v = B.schema.defaultVariant(1); delete v.topo; delete v.hydro.rsuT; delete v.library;
  const m = B.schema.migrate(JSON.parse(JSON.stringify(v)));
  assert.ok(m.topo && m.hydro.rsuT.length && m.library.roughness.length);
  assert.throws(() => B.schema.migrate({ foo: 1 }));
});
