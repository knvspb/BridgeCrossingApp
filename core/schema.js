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

  /* Профиль примера задания 1/26-c (стр. 2–3): поймы — нивелировка, русло — промеры от нуля 123,00. */
  const EX_LP = [131, 131, 130.5, 130, 129, 126.5, 126.45, 126.4, 126.35, 126.3, 122, 120.2, 119.9, 120.5, 122.05, 124, 124, 125, 126, 126, 125.4, 124.5, 124, 124, 124, 123, 123, 123, 123, 123.8, 123];
  const EX_DEPTH = [0, 1.8, 3, 3.5, 3.9, 4.3, 5.1, 3.6, 3.79, 1.8, 0];
  const EX_PP = [123, 124.2, 124, 123, 123, 120.4, 121, 121.5, 122, 123, 124, 124.3, 124.3, 125.5, 126, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 129, 130, 130, 131, 131, 131];

  S.defaultLayers = () => [
    { no: '1', code: 2,  tops: [], gen: { order: 1, t: 2.5, var: 0.4, lens: false, from: 1, to: 71 } },
    { no: '2', code: 19, tops: [], gen: { order: 2, t: 3.0, var: 0.4, lens: false, from: 1, to: 71 } },
    { no: '3', code: 14, tops: [], gen: { order: 3, t: 2.0, var: 0.3, lens: true, from: 8, to: 30 } },
    { no: '4', code: 23, tops: [], gen: { order: 4, t: 3.0, var: 0.3, lens: false, from: 1, to: 71 } },
    { no: '5', code: 4,  tops: [], gen: { order: 5, t: 4.0, var: 0.3, lens: false, from: 1, to: 71 } }
  ];

  S.defaultVariant = (seed) => {
    seed = seed ?? 1;
    const z = EX_LP.concat(EX_DEPTH.slice(1).map(h => U.r2(123 - h)), EX_PP.slice(1));
    const R = BCA.ROUGHNESS;
    const v = {
      schemaVersion: S.SCHEMA_VERSION,
      meta: {
        id: 'v-' + seed, code: '1/26-c', variantNo: 1, seed, student: '', group: 'СУЗСс(М)-4', course: 1, semester: 'Седьмой',
        discipline: 'Изыскания и проектирование мостовых переходов', dirCode: '08.05.01',
        department: 'Транспортных систем и дорожно-мостового строительства', teacher: '', issueDate: '', deadlines: ['', '', '', '', ''],
        goal: 'Разработка проекта мостового перехода через реку, включающего в себя общие решения по конструкции моста и решения по элементам регуляционных и защитных сооружений.',
        tasks: '1. Обработка результатов инженерных изысканий;\n2. Определение расчетного уровня высокой воды;\n3. Расчет необходимого отверстия мостового перехода;\n4. Проектирование регуляционных и защитных сооружений, в том числе расчет осей струенаправляющих дамб;\n5. Разработка эскизного проекта моста.',
        year: 2026, created: '', note: ''
      },
      tz: {
        prob: 0.01, roadCategory: 'IV', lanes: 2, zRoadStart: 136, zRoadEnd: 136, navClass: '6',
        importance: 1, region: '', addInfo: '-',
        axisPoints: [{ st: 1, z: 136, label: 'Левый берег, вне поймы' }, { st: 71, z: 136, label: 'Правый берег, вне поймы' }]
      },
      geodesy: { stepLP: 20, stepR: 15, stepPP: 20, z, iL: 30, iR: 40, surveyLevel: 123.0, comments: {} },
      hydro: {
        unm: 121.2,
        post: { zero: 121.0, offsetKm: 0, nYears: 21, firstYear: 2005, name: 'Водомерный пост в створе перехода' },
        viu: { z: 127.8, year: 1966, refName: 'репер Рп.1 (верх фундамента часовни на левом берегу)', refZ: null, auto: false },
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
      geology: { ubv: 105, corr: 10, seed: seed + 7, layers: S.defaultLayers() },
      topo: { radius: 0, gridStep: 10, size: null, amp: 0.3, seed: seed + 13 },
      gen: { profile: { seed, zEdgeL: 131, zBankL: 123, shapeL: 1.6, noiseL: 0.6, oxL: 2.5, oxPosL: 0.6,
        zThal: 117.9, thalPos: 0.6, shapeC: 1.6, noiseC: 0.3, zBankR: 123, zEdgeR: 131, shapeR: 1.4, noiseR: 0.6, oxR: 1.5, oxPosR: 0.15, precision: 2 } },
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
    if (!o.schemaVersion) throw new Error('В файле нет schemaVersion — это не вариант BridgeCrossingApp');
    if (o.schemaVersion > S.SCHEMA_VERSION) throw new Error(`Вариант создан более новой версией программы (схема ${o.schemaVersion})`);
    const d = S.defaultVariant(o.meta?.seed ?? 1);
    const fill = (dst, src) => { for (const k in src) { if (dst[k] === undefined) dst[k] = src[k]; else if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object') fill(dst[k], src[k]); } };
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
    if (v.hydro.unm == null) { const zt = Math.min(...v.geodesy.z.slice(v.geodesy.iL, v.geodesy.iR + 1)); v.hydro.unm = U.r1(zt + 0.6 * (v.geodesy.z[v.geodesy.iL] - zt)); done.push('УНМ'); }
    if (v.geodesy.surveyLevel == null) { v.geodesy.surveyLevel = U.r2(v.hydro.unm + 1); done.push('уровень на дату изысканий'); }
    if (!v.hydro.series.length || what.series) { BCA.hydrology.generate(v); done.push('ряды уровней'); }
    if (v.hydro.viu.refZ == null && v.hydro.viu.z != null) { v.hydro.viu.refZ = U.r2(v.hydro.viu.z - 1.5); done.push('отметка объекта для ВИУ'); }
    return done;
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
    const g = v.geodesy, h = v.hydro, N = g.z.length, w = BCA.profile.widths(g);
    if (g.z.some(q => q == null)) push('err', 'Геодезия', 'В профиле есть пустые отметки.');
    if (!(g.iL > 0 && g.iR > g.iL + 1 && g.iR < N - 1)) push('err', 'Геодезия', 'Бровки русла заданы неверно.');
    if (N !== 71) push('warn', 'Геодезия', `Створов ${N} (не 71): выгрузка в столбец старой Excel-книги недоступна, остальной экспорт работает.`);
    const zt = Math.min(...g.z.slice(g.iL, g.iR + 1)), zTop = Math.min(g.z[0], g.z[N - 1]);
    if (g.z[g.iL] < Math.max(...g.z.slice(g.iL + 1, g.iR))) push('warn', 'Геодезия', 'Внутри русла есть точки выше левой бровки.');
    if (h.unm != null && h.unm <= zt) push('err', 'Гидрология', `УНМ ${h.unm} не выше тальвега ${zt}: в межень русло сухое.`);
    if (h.unm != null && h.unm >= Math.min(g.z[g.iL], g.z[g.iR])) push('warn', 'Гидрология', 'УНМ не ниже бровок: в межень вода выходит на пойму.');
    if (g.surveyLevel != null && g.surveyLevel < h.unm) push('warn', 'Геодезия', 'Уровень на дату изысканий ниже УНМ.');
    if (g.surveyLevel != null && Math.max(...g.z.slice(g.iL + 1, g.iR)) > g.surveyLevel) push('warn', 'Геодезия', 'Часть дна русла выше уровня на дату изысканий — глубины там будут нулевыми.');
    ['LP', 'R', 'PP'].forEach(k => { if (h.morph[k].m == null) push('err', 'Гидрология', `Не задан показатель шероховатости m для участка ${k === 'LP' ? 'левая пойма' : k === 'R' ? 'русло' : 'правая пойма'}.`); });
    const ser = h.series || [];
    if (!ser.length) push('err', 'Гидрология', 'Не сгенерированы ряды наблюдений за уровнями.');
    else {
      const mx = Math.max(...ser.map(s => s.zMax));
      if (h.viu.z != null && h.viu.z <= mx) push('warn', 'Гидрология', `ВИУ ${h.viu.z} не выше наибольшего УВВ ряда ${mx}.`);
      if (Math.max(mx, h.viu.z ?? 0) >= zTop) push('err', 'Гидрология', `Уровни (${Math.max(mx, h.viu.z ?? 0)}) выходят за края профиля (${zTop}): разлив не помещается в створ.`);
      if (ser.some(s => s.jam)) push('warn', 'Гидрология', 'В ряду есть заторные годы: годовые максимумы уровня в них не соответствуют максимальному расходу.');
    }
    if (h.post.nYears < 10) push('warn', 'Гидрология', 'Ряд короче 10 лет (пособие, гл. 3: для прогноза нужно не менее 20 лет наблюдений).');
    if (v.tz.prob == null || v.tz.prob <= 0 || v.tz.prob >= 1) push('err', 'ТЗ', 'Расчётная вероятность задаётся долей (например, 0,01).');
    const lib = v.library.roughness;
    ['LP', 'R', 'PP'].forEach(k => { const r = lib.find(q => q.id === h.morph[k].id); if (r && !r.verified) push('warn', 'Гидрология', `Характеристика «${r.text.slice(0, 60)}…» не сверена с таблицей шероховатости.`); });
    const geo = v.geology;
    if (!geo.layers.length) push('err', 'Геология', 'Не задано ни одного ИГУ.');
    geo.layers.forEach(l => { if (!BCA.SOILS.find(s => s.code === l.code)) push('err', 'Геология', `ИГУ ${l.no}: код грунта ${l.code} отсутствует в справочнике.`); if (l.tops.every(t => t == null)) push('warn', 'Геология', `ИГУ ${l.no} не встречается ни на одном створе.`); });
    let bad = 0; for (let i = 0; i < N; i++) { const tops = geo.layers.map(l => l.tops[i]).filter(t => t != null); if (!tops.length || Math.abs(Math.max(...tops) - g.z[i]) > 0.05) bad++; }
    if (bad) push('warn', 'Геология', `На ${bad} створах кровля верхнего слоя не совпадает с поверхностью (или слоёв нет).`);
    if (geo.layers.some(l => l.tops.some(t => t != null && t <= geo.ubv))) push('err', 'Геология', `Есть кровли ниже условного низа ${geo.ubv} м.`);
    if (w.total <= 0) push('err', 'Геодезия', 'Нулевая длина профиля.');
    if (!out.some(o => o.lvl === 'err')) push('ok', '', 'Критических ошибок нет.');
    return out;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
