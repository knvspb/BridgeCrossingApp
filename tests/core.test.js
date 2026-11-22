// Тесты ядра: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('./load.js');
const U = B.util;

test('вариант по умолчанию: пять зон, 71 створ, без ошибок', () => {
  const v = B.schema.defaultVariant(1), I = B.profile.idx(v.geodesy), w = B.profile.widths(v.geodesy);
  assert.deepEqual([I.bl, I.iL, I.iR, I.br, I.N], [4, 30, 40, 55, 71]);
  assert.equal(w.total, 1350);
  assert.equal(v.geodesy.z[0], 131); assert.equal(v.geodesy.z[36], U.r2(123 - 5.1));
  assert.deepEqual(B.schema.validate(v).filter(m => m.lvl === 'err'), []);
});

test('берега не затапливаются: иначе ошибка', () => {
  const v = B.schema.defaultVariant(1);
  v.geodesy.zones.BL.n = 4; v.geodesy.z[3] = 127.0;                   // точка левого берега ниже ВИУ
  assert.ok(B.schema.validate(v).some(m => m.lvl === 'err' && /Берег затапливается/.test(m.t)));
});

test('точки дороги только на берегах', () => {
  const v = B.schema.defaultVariant(1); v.tz.road.push({ st: 20, z: 136 });
  assert.ok(B.schema.validate(v).some(m => m.lvl === 'err' && /не на берегу/.test(m.t)));
});

test('одно и то же зерно — один и тот же вариант', () => {
  const a = B.schema.defaultVariant(5), b = B.schema.defaultVariant(5);
  assert.deepEqual(a.hydro.series.map(s => s.zMax), b.hydro.series.map(s => s.zMax));
  B.profile.generate(a); B.profile.generate(b); assert.deepEqual(a.geodesy.z, b.geodesy.z);
});

test('число створов производное: ширина и шаг зоны', () => {
  const v = B.schema.defaultVariant(1);
  B.profile.setZone(v, 'R', 120, 10);                                   // русло 120 м с шагом 10 → 12 интервалов
  B.profile.setZone(v, 'LP', 500, 25);                                  // пойма 500 м с шагом 25 → 20
  const I = B.profile.idx(v.geodesy), w = B.profile.widths(v.geodesy);
  assert.equal(v.geodesy.zones.R.n, 12); assert.equal(v.geodesy.zones.LP.n, 20);
  assert.equal(I.N, 4 + 20 + 12 + 15 + 15 + 1); assert.equal(v.geodesy.z.length, I.N);
  assert.equal(w.R, 120); assert.equal(w.LP, 500);
  assert.equal(v.geodesy.z[0], 131); assert.equal(v.geodesy.z[I.N - 1], 131);
  v.geology.layers.forEach(l => assert.equal(l.tops.length, I.N));
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

test('генератор профиля: берега выше пойм, бровки и тальвег на месте', () => {
  const v = B.schema.defaultVariant(2); B.profile.generate(v);
  const g = v.geodesy, I = B.profile.idx(g), p = v.gen.profile;
  assert.equal(g.z[I.bl], p.zFootL); assert.equal(g.z[I.iL], p.zBrowL); assert.equal(g.z[I.iR], p.zBrowR); assert.equal(g.z[I.br], p.zFootR);
  assert.ok(Math.abs(Math.min(...g.z.slice(I.iL, I.iR + 1)) - p.zThal) < 0.5);
  for (let i = 0; i <= I.bl; i++) assert.ok(g.z[i] >= p.zFootL - 0.3);
});

test('формат: проверка обязательных полей', () => {
  const v = B.schema.defaultVariant(1);
  assert.ok(B.schema.migrate(JSON.parse(JSON.stringify(v))));
  assert.throws(() => B.schema.migrate({ foo: 1 }), /версия/);
  const bad = JSON.parse(JSON.stringify(v)); bad.geodesy.z.pop();
  assert.throws(() => B.schema.migrate(bad), /отметок/);
});

test('частичный вариант: только зоны — остальное генерируется', () => {
  const r = B.dataio.fromPartial({ schemaVersion: 1, meta: { seed: 42 }, geodesy: { zones: { BL: { step: 25, n: 3 }, LP: { step: 25, n: 20 }, R: { step: 10, n: 12 }, PP: { step: 25, n: 10 }, BR: { step: 25, n: 4 } } } });
  assert.equal(r.v.geodesy.z.length, 50);
  assert.ok(r.notes.includes('профиль') && r.notes.includes('грунты') && r.notes.includes('ряды уровней'));
  assert.deepEqual(B.schema.validate(r.v).filter(m => m.lvl === 'err'), []);
});

test('частичный вариант: ряд таблицей без суточных уровней', () => {
  const v = B.schema.defaultVariant(1), z0 = B.hydrology.postZero(v);
  const r = B.dataio.fromPartial({ schemaVersion: 1, geodesy: { zones: v.geodesy.zones, z: v.geodesy.z }, hydro: { post: { zero: z0 }, rsuT: [2, 5],
    series: [{ year: 2001, zMax: 126.1, navDays: 170, rsuPost: { 2: 125.9, 5: 125.5 } }, { year: 2002, zMax: 125.3, navDays: 182, rsuPost: { 2: 125.0, 5: 124.8 } }] } });
  assert.equal(r.v.hydro.series.length, 2);
  assert.equal(B.hydrology.annualTable(r.v)[0].P, U.r2(126.1 - z0));
  assert.equal(B.hydrology.rsuTable(r.v)[1].values[5], 124.8);
});

test('книга данных Excel: выгрузка и загрузка без потерь', async t => {
  let ExcelJS; try { ExcelJS = require('exceljs'); } catch (e) { return t.skip('нет пакета exceljs (npm i exceljs)'); }
  const v = B.schema.defaultVariant(7);
  const buf = await B.dataio.buildDataWorkbook(ExcelJS, v).xlsx.writeBuffer();
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
  const r = B.dataio.parseDataWorkbook(wb);
  assert.deepEqual(r.v.geodesy.z, v.geodesy.z); assert.deepEqual(r.v.geodesy.zones, v.geodesy.zones);
  assert.deepEqual(r.v.geology.layers.map(l => l.tops), v.geology.layers.map(l => l.tops));
  assert.deepEqual(B.hydrology.annualTable(r.v).map(a => a.P), B.hydrology.annualTable(v).map(a => a.P));
  assert.deepEqual(B.hydrology.rsuTable(r.v).map(a => a.values), B.hydrology.rsuTable(v).map(a => a.values));
  assert.equal(r.v.hydro.viu.z, v.hydro.viu.z); assert.equal(r.v.tz.roadCategory, v.tz.roadCategory);
});

test('справочник грунтов: описание и расчётная категория', () => {
  const SC = B.SOILCAT;
  assert.equal(SC.describe({ type: 'loam-h', variety: 'silty', il: 'stiff', e: 'e3' }), 'Суглинок тяжёлый пылеватый, тугопластичный, e = 0,9–0,6');
  assert.equal(SC.describe({ type: 'clay-l', il: 'soft' }), 'Глина лёгкая, мягкопластичная');
  assert.equal(SC.describe({ type: 'pebble', filler: 'sand', sr: 'sat' }), 'Галечниковый грунт с песчаным заполнителем, насыщенный водой');
  assert.equal(SC.autoCode({ type: 'clay-h', e: 'e2' }), 3);              // плотные (Кп 0,6–0,3)
  assert.equal(SC.autoCode({ type: 'loess', e: 'e1' }), 11);
  assert.equal(SC.autoCode({ type: 'sand-m' }), 16);
  SC.TYPES.forEach(t => t.codes.forEach(c => assert.ok(B.SOILS.find(s => s.code === c), `${t.id}: нет кода ${c}`)));
  for (let c = 1; c <= 44; c++) assert.ok(SC.TYPES.some(t => t.codes.includes(c)), `код ${c} не покрыт справочником`);
  const il = SC.propOptions('il', SC.type('sandy-loam')).map(o => o[0]);
  assert.deepEqual(il, ['', 'solid', 'plastic', 'fluid']);                // консистенция супеси — три класса
});

test('топоповерхность: естественный рельеф добавляет формы, но не трогает ось', () => {
  const v = B.schema.defaultVariant(1);
  const a = B.topo.generate(v, { radius: 2500 }), b = B.topo.generate(v, { radius: 2500, natural: false });
  assert.ok(a.oxbows + a.ravines > 0);
  let diff = 0; a.points.forEach((p, k) => { diff = Math.max(diff, Math.abs(p[2] - b.points[k][2])); });
  assert.ok(diff > 1);
  const c = B.topo.contours(a, 0.5); assert.ok(c.length > 10 && c.every(q => q.segs.length > 0));
});
