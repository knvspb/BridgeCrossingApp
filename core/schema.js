/* Вариант задания — общий контракт между модулями
   (Журнал → Варианты → Расчёт уровня → Отверстие → Регуляционные сооружения → Вариантное проектирование).
   Генератор задания создаёт вариант; остальные модули его только читают.
   Хранятся ИСТИННЫЕ значения (отметки, уклон, ВИУ); то, что видит студент
   (глубины, превышения, задача на уклон), вычисляется функциями *.studentView / profile.depths.
   При изменении структуры: увеличить SCHEMA_VERSION и дописать шаг в migrate(). */
(function (root) {
  'use strict';
  const BCA = root.BCA || (root.BCA = {});
  const U = BCA.util;
  const S = BCA.schema = {};
  S.SCHEMA_VERSION = 1;

  /* Профиль по умолчанию: берега и поймы — нивелировка, русло — промеры от нуля 123,00. */
  const EX_LP = [131, 131, 130.5, 130, 129, 126.5, 126.45, 126.4, 126.35, 126.3, 122, 120.2, 119.9, 120.5, 122.05, 124, 124, 125, 126, 126, 125.4, 124.5, 124, 124, 124, 123, 123, 123, 123, 123.8, 123];
  const EX_DEPTH = [0, 1.8, 3, 3.5, 3.9, 4.3, 5.1, 3.6, 3.79, 1.8, 0];
  const EX_PP = [123, 124.2, 124, 123, 123, 120.4, 121, 121.5, 122, 123, 124, 124.3, 124.3, 125.5, 126, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 130, 130, 131, 131, 131];

  S.defaultLayers = () => [
    { no: '1', code: 2,  desc: { type: 'loam-h', variety: 'silty', il: 'stiff', e: 'e3' }, tops: [], gen: { order: 1, t: 2.5, var: 0.4, lens: false, from: 1, to: 999 } },
    { no: '2', code: 15, desc: { type: 'sand-c', density: 'medium', sr: 'sat' }, tops: [], gen: { order: 2, t: 3.0, var: 0.4, lens: false, from: 1, to: 999 } },
    { no: '3', code: 13, desc: { type: 'sand-f', density: 'loose', sr: 'sat' }, tops: [], gen: { order: 3, t: 2.0, var: 0.3, lens: true, from: 8, to: 30 } },
    { no: '4', code: 16, desc: { type: 'gravel', filler: 'sand', sr: 'sat' }, tops: [], gen: { order: 4, t: 3.0, var: 0.3, lens: false, from: 1, to: 999 } },
    { no: '5', code: 4,  desc: { type: 'clay-l', il: 'semisolid', e: 'e1' }, tops: [], gen: { order: 5, t: 4.0, var: 0.3, lens: false, from: 1, to: 999 } }
  ];

  S.defaultVariant = (seed) => {
    seed = seed ?? 1;
    const z = EX_LP.concat(EX_DEPTH.slice(1).map(h => U.r2(123 - h)), EX_PP.slice(1));
    const R = BCA.ROUGHNESS;
    const v = {
      schemaVersion: S.SCHEMA_VERSION,
      meta: {
        id: 'v-' + seed, code: '1', seed, student: '', group: '', course: 4, semester: '',
        discipline: 'Изыскания и проектирование мостовых переходов', dirCode: '08.05.01',
        department: 'Транспортных систем и дорожно-мостового строительства', teacher: '', issueDate: '', deadlines: ['', '', '', '', ''],
        goal: 'Разработка проекта мостового перехода через реку, включающего в себя общие решения по конструкции моста и решения по элементам регуляционных и защитных сооружений.',
        tasks: '1. Обработка результатов инженерных изысканий;\n2. Определение расчетного уровня высокой воды;\n3. Расчет необходимого отверстия мостового перехода;\n4. Проектирование регуляционных и защитных сооружений, в том числе расчет осей струенаправляющих дамб;\n5. Разработка эскизного проекта моста.',
        year: new Date().getFullYear(), note: ''
      },
      tz: {
        prob: 0.01, roadCategory: 'IV', lanes: 2, navClass: '6', importance: 1, region: '', addInfo: '',
        road: [{ st: 1, z: 136, label: '' }, { st: 5, z: 136, label: '' }, { st: 56, z: 136, label: '' }, { st: 71, z: 136, label: '' }]
      },
      geodesy: {
        zones: { BL: { step: 20, n: 4 }, LP: { step: 20, n: 26 }, R: { step: 15, n: 10 }, PP: { step: 20, n: 15 }, BR: { step: 20, n: 15 } },
        z, surveyLevel: 123.0, comments: {}
      },
      hydro: {
        unm: 121.2,
        post: { zero: 121.0, offsetKm: 0, nYears: 21, firstYear: new Date().getFullYear() - 21, name: '' },
        viu: { z: 127.8, year: null, refName: 'репер Рп.1 (верх фундамента часовни на левом берегу)', refZ: null, auto: false },
        slope: { i: 0.00015, studentMode: 'value', Lkm: null },
        morph: {
          LP: { id: R[0].id, m: R[0].m, text: R[0].text },
          R:  { id: R[3].id, m: R[3].m, text: R[3].text },
          PP: { id: R[0].id, m: R[0].m, text: R[0].text }
        },
        regime: { feed: 'snow', landscape: 'plain', iceJams: false, zLo: 123.5, zHi: 127.2, Cv: 0.35, CsCv: 2, navMean: 180, navSd: 9, seedOffset: 0 },
        rsuT: [1, 5, 10, 15, 20], rsuConsecutive: true,
        wind: { v: 10, fetch: 2 },
        series: []
      },
      geology: { soilDb: BCA.SOIL_DB_DEFAULT, customDb: null, ubv: 105, corr: 10, seed: seed + 7, layers: S.defaultLayers() },
      topo: { radius: 0, gridStep: 10, size: null, amp: 0.3, seed: seed + 13 },
      gen: { profile: { seed, zOutL: 131, zFootL: 129, shapeBL: 1, zBrowL: 123, shapeL: 1.6, noiseL: 0.6, oxL: 2.5, oxPosL: 0.6,
        zThal: 117.9, thalPos: 0.6, shapeC: 1.6, noiseC: 0.3, zBrowR: 123, shapeR: 1.4, noiseR: 0.6, oxR: 1.5, oxPosR: 0.2, zFootR: 129, zOutR: 131, shapeBR: 1, precision: 1 } },
      library: { roughness: U.deepClone(R) }
    };
    v.geology.layers.forEach(l => { l.tops = new Array(z.length).fill(null); });
    BCA.profile.generateSoil(v);
    BCA.hydrology.generate(v);
    return v;
  };

  /* Загрузка варианта из JSON: заполнение недостающих полей и миграции версий. */
  S.migrate = (o) => {
    if (!o || typeof o !== 'object') throw new Error('Пустой или неверный JSON');
    if (o.schemaVersion !== S.SCHEMA_VERSION) throw new Error(`Неподдерживаемая версия формата: ${o.schemaVersion ?? 'не указана'} (ожидается ${S.SCHEMA_VERSION})`);
    const zs = o.geodesy?.zones;
    if (!zs || !BCA.profile.ZONES.every(k => zs[k] && zs[k].step > 0 && zs[k].n >= 1)) throw new Error('geodesy.zones: нужны зоны BL, LP, R, PP, BR с шагом и числом интервалов');
    const N = BCA.profile.ZONES.reduce((s, k) => s + zs[k].n, 0) + 1;
    if (!Array.isArray(o.geodesy.z) || o.geodesy.z.length !== N) throw new Error(`geodesy.z: ожидается ${N} отметок (сумма интервалов зон + 1), получено ${o.geodesy.z?.length ?? 0}`);
    const d = S.defaultVariant(o.meta?.seed ?? 1);
    const fill = (dst, src) => { for (const k in src) { if (dst[k] === undefined) dst[k] = src[k]; else if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) fill(dst[k], src[k]); } };
    S.fixSoilDb(o);
    if (o.geology && Array.isArray(o.geology.layers)) o.geology.layers.forEach(l => { if (!l.desc || !l.desc.type) l.desc = BCA.SOILCAT.fromCode(l.code, BCA.soilDb(o)); });
    if (o.geology && Array.isArray(o.geology.layers)) o.geology.layers.forEach((l, k) => { l.gen = Object.assign({ order: k + 1, t: 3, var: 0.3, lens: false, from: 1, to: N }, l.gen || {}); if (!Array.isArray(l.tops) || l.tops.length !== N) l.tops = new Array(N).fill(null); });
    fill(o, d);
    return o;
  };

  /* Автозаполнение незаполненного: пустой профиль, пустые слои, нет рядов наблюдений и т. п. */
  S.autofill = (v, what = {}) => {
    const done = [];
    if (!v.geodesy.z.length || v.geodesy.z.some(q => q == null) || what.profile) { BCA.profile.generate(v); done.push('профиль'); }
    if (!v.geology.layers.length) { v.geology.layers = S.defaultLayers(); v.geology.layers.forEach(l => l.tops = new Array(v.geodesy.z.length).fill(null)); }
    if (v.geology.layers.every(l => l.tops.every(t => t == null)) || what.soil) { BCA.profile.generateSoil(v); done.push('грунты'); }
    ['LP', 'R', 'PP'].forEach(k => { if (v.hydro.morph[k].m == null) { const r = BCA.ROUGHNESS.find(q => q.zone === (k === 'R' ? 'channel' : 'floodplain') && q.verified); v.hydro.morph[k] = { id: r.id, m: r.m, text: r.text }; done.push('шероховатость ' + k); } });
    if (v.hydro.unm == null) { const I = BCA.profile.idx(v.geodesy), zt = Math.min(...v.geodesy.z.slice(I.iL, I.iR + 1)); v.hydro.unm = U.r1(zt + 0.6 * (Math.min(v.geodesy.z[I.iL], v.geodesy.z[I.iR]) - zt)); done.push('УНМ'); }
    if (v.geodesy.surveyLevel == null) { v.geodesy.surveyLevel = U.r2(v.hydro.unm + 1); done.push('уровень на дату изысканий'); }
    if (!v.hydro.series.length || what.series) { BCA.hydrology.generate(v); done.push('ряды уровней'); }
    if (v.hydro.viu.refZ == null && v.hydro.viu.z != null) { v.hydro.viu.refZ = U.r2(v.hydro.viu.z - 1.5); done.push('отметка объекта для ВИУ'); }
    if (!(v.tz.road || []).length) { v.tz.road = S.autoRoad(v); done.push('отметки дороги'); }
    return done;
  };

  /* База грунтов: файлы без geology.soilDb, но с кодами слоёв, относятся к базе методических указаний (44 позиции). */
  S.fixSoilDb = o => {
    if (!o.geology) return;
    if (!o.geology.soilDb) o.geology.soilDb = (o.geology.layers || []).some(l => l.code != null) ? 'metod44' : BCA.SOIL_DB_DEFAULT;
    if (o.geology.soilDb === 'custom' && !o.geology.customDb) o.geology.soilDb = BCA.SOIL_DB_DEFAULT;
  };
  /* Смена базы грунтов: записи слоёв подбираются заново по описаниям. */
  S.setSoilDb = (v, id) => {
    v.geology.soilDb = id; const db = BCA.soilDb(v);
    v.geology.layers.forEach(l => { const c = BCA.SOILCAT.autoCode(l.desc, db); if (c != null) l.code = c; else if (!BCA.soilEntry(db, l.code)) l.code = db.entries[0]?.code ?? null; });
  };

  /* Отметки оси дороги по умолчанию: внешний край и подошва каждого берега, на 2 м выше наивысшей точки берегов. */
  S.autoRoad = v => {
    const g = v.geodesy, I = BCA.profile.idx(g), zr = U.r1(Math.max(...g.z.slice(0, I.bl + 1), ...g.z.slice(I.br)) + 2);
    return [1, I.bl + 1, I.br + 1, I.N].map(st => ({ st, z: zr, label: '' }));
  };

  /* Разделы для шаблонов (п. «сохранение отдельных разделов» видения). */
  S.SECTIONS = {
    geodesy: { name: 'Геодезические изыскания и промеры глубин', get: v => ({ geodesy: v.geodesy, genProfile: v.gen.profile, topo: v.topo }),
      set: (v, s) => { v.geodesy = s.geodesy; if (s.genProfile) v.gen.profile = s.genProfile; if (s.topo) v.topo = s.topo; if (v.geology.layers.some(l => l.tops.length !== v.geodesy.z.length)) { v.geology.layers.forEach(l => l.tops = new Array(v.geodesy.z.length).fill(null)); BCA.profile.generateSoil(v); } } },
    hydro: { name: 'Гидрометеорологические изыскания', get: v => ({ hydro: v.hydro, roughness: v.library.roughness }), set: (v, s) => { v.hydro = s.hydro; if (s.roughness) v.library.roughness = s.roughness; } },
    geology: { name: 'Геологические изыскания', get: v => ({ geology: v.geology }),
      set: (v, s) => { v.geology = s.geology; if (v.geology.layers.some(l => l.tops.length !== v.geodesy.z.length)) { v.geology.layers.forEach(l => l.tops = new Array(v.geodesy.z.length).fill(null)); BCA.profile.generateSoil(v); } } },
    tz: { name: 'Данные технического задания', get: v => ({ tz: v.tz }), set: (v, s) => { v.tz = s.tz; } }
  };

  /* Проверка варианта: [{lvl: 'err'|'warn'|'ok', sec, t}] */
  S.validate = (v) => {
    const out = [], push = (lvl, sec, t) => out.push({ lvl, sec, t });
    const g = v.geodesy, h = v.hydro, N = g.z.length, I = BCA.profile.idx(g);
    if (N !== I.N) push('err', 'Геодезия', `Число отметок (${N}) не совпадает с зонами (${I.N}).`);
    if (g.z.some(q => q == null)) push('err', 'Геодезия', 'В профиле есть пустые отметки.');
    const zt = Math.min(...g.z.slice(I.iL, I.iR + 1)), zBrow = Math.min(g.z[I.iL], g.z[I.iR]);
    if (Math.max(...g.z.slice(I.iL + 1, I.iR)) > zBrow) push('warn', 'Геодезия', 'Внутри русла есть точки выше бровки.');
    if (h.unm != null && h.unm <= zt) push('err', 'Гидрология', `УНМ ${h.unm} не выше тальвега ${zt}: в межень русло сухое.`);
    if (h.unm != null && h.unm >= zBrow) push('warn', 'Гидрология', 'УНМ не ниже бровок: в межень вода выходит на пойму.');
    if (g.surveyLevel != null && h.unm != null && g.surveyLevel < h.unm) push('warn', 'Геодезия', 'Уровень на дату изысканий ниже УНМ.');
    if (g.surveyLevel != null && Math.max(...g.z.slice(I.iL + 1, I.iR)) > g.surveyLevel) push('warn', 'Геодезия', 'Часть дна русла выше уровня на дату изысканий — глубины там нулевые.');
    ['LP', 'R', 'PP'].forEach(k => { if (h.morph[k].m == null) push('err', 'Гидрология', `Не задан m: ${BCA.profile.ZONE_NAME[k].toLowerCase()}.`); });
    const ser = h.series || [];
    const top = Math.max(h.viu.z ?? -Infinity, ...ser.map(s => s.zMax));
    if (!ser.length) push('err', 'Гидрология', 'Нет рядов наблюдений за уровнями.');
    else {
      const mx = Math.max(...ser.map(s => s.zMax));
      if (h.viu.z != null && h.viu.z <= mx) push('warn', 'Гидрология', `ВИУ ${h.viu.z} не выше наибольшего УВВ ряда ${mx}.`);
      if (ser.some(s => s.jam)) push('warn', 'Гидрология', 'В ряду есть заторные годы.');
    }
    const flooded = [];
    for (let i = 0; i < N; i++) { const k = BCA.profile.zoneKey(g, i, I); if ((i <= I.bl || i >= I.br) && Number.isFinite(top) && g.z[i] <= top) flooded.push(i + 1); }
    if (flooded.length) push('err', 'Геодезия', `Берег затапливается при ${U.fmt(top)}: створы ${flooded.slice(0, 8).join(', ')}${flooded.length > 8 ? '…' : ''}. Сдвиньте границу берега или поднимите отметки.`);
    const road = v.tz.road || [];
    if (!road.length) push('warn', 'ТЗ', 'Не заданы отметки оси дороги на берегах.');
    road.forEach(p => {
      if (!(p.st - 1 <= I.bl || p.st - 1 >= I.br)) push('err', 'ТЗ', `Точка оси дороги на створе ${p.st} не на берегу (берега: 1–${I.bl + 1} и ${I.br + 1}–${N}).`);
      else if (p.z != null && p.z < g.z[p.st - 1]) push('warn', 'ТЗ', `Отметка ПЧ на створе ${p.st} ниже земли.`);
    });
    if (h.post.nYears < 10) push('warn', 'Гидрология', 'Ряд короче 10 лет.');
    if (v.tz.prob == null || v.tz.prob <= 0 || v.tz.prob >= 1) push('err', 'ТЗ', 'Расчётная вероятность задаётся долей (например, 0,01).');
    ['LP', 'R', 'PP'].forEach(k => { const r = v.library.roughness.find(q => q.id === h.morph[k].id); if (r && !r.verified) push('warn', 'Гидрология', `m для «${r.text.slice(0, 50)}…» не сверен.`); });
    const geo = v.geology;
    if (!geo.layers.length) push('err', 'Геология', 'Не задано ни одного ИГУ.');
    const db = BCA.soilDb(v);
    geo.layers.forEach(l => { const t = l.desc && BCA.SOILCAT.type(l.desc.type), codes = t ? BCA.soilCodesFor(db, t.id) : [];
      if (!t) push('warn', 'Геология', `ИГУ ${l.no}: нет описания грунта по справочнику.`);
      else if (!codes.length) push('warn', 'Геология', `ИГУ ${l.no}: «${t.name}» нет в базе «${db.name}» — запись vнр выбрана вручную.`);
      else if (!codes.includes(l.code)) push('warn', 'Геология', `ИГУ ${l.no}: запись vнр ${l.code} не соответствует описанию «${t.name}».`);
      if (!BCA.soilEntry(db, l.code)) push('err', 'Геология', `ИГУ ${l.no}: в базе «${db.name}» нет записи ${l.code}.`); if (l.tops.every(t => t == null)) push('warn', 'Геология', `ИГУ ${l.no} не встречается.`); });
    let bad = 0; for (let i = 0; i < N; i++) { const tops = geo.layers.map(l => l.tops[i]).filter(t => t != null); if (!tops.length || Math.abs(Math.max(...tops) - g.z[i]) > 0.05) bad++; }
    if (bad) push('warn', 'Геология', `На ${bad} створах кровля верхнего слоя не совпадает с поверхностью.`);
    if (geo.layers.some(l => l.tops.some(t => t != null && t <= geo.ubv))) push('err', 'Геология', `Есть кровли ниже условного низа ${geo.ubv} м.`);
    if (ser.length && h.seriesStamp && ser[0].daily && h.seriesStamp !== BCA.hydrology.stamp(v)) push('warn', 'Гидрология', 'Профиль или параметры изменены после генерации рядов — перегенерируйте.');
    if (!out.some(o => o.lvl === 'err')) push('ok', '', 'Критических ошибок нет.');
    return out;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
