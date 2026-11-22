/* Обмен данными варианта с внешними источниками (Excel, другие программы, нейросети).

   Два пути:
   1. JSON по схеме schema/variant.schema.json. Через fromPartial() можно передать неполный объект —
      всё отсутствующее заполняется значениями по умолчанию или генерируется
      (профиль по зонам, грунты, ряды уровней).
   2. Книга данных Excel (buildDataWorkbook / parseDataWorkbook): по одной таблице на лист,
      заголовки в первой строке. Её можно выгрузить, заполнить или исправить вне программы
      и загрузить обратно. Пустые ячейки и пустые листы — «сгенерировать». */
(function (root) {
  'use strict';
  const BCA = root.BCA || (root.BCA = {});
  const U = BCA.util;
  const D = BCA.dataio = {};

  /* Скалярные параметры: путь в варианте, подпись, единицы, тип (n — число, s — строка, b — да/нет, l — список чисел). */
  D.PARAMS = [
    ['meta.code', 'Шифр варианта', '', 's'], ['meta.student', 'ФИО студента', '', 's'], ['meta.group', 'Группа', '', 's'], ['meta.course', 'Курс', '', 'n'],
    ['meta.semester', 'Семестр', '', 's'], ['meta.discipline', 'Дисциплина', '', 's'], ['meta.dirCode', 'Код направления', '', 's'], ['meta.department', 'Кафедра', '', 's'],
    ['meta.teacher', 'Преподаватель', '', 's'], ['meta.issueDate', 'Дата выдачи', 'ДД.ММ.ГГГГ', 's'], ['meta.year', 'Год', '', 'n'], ['meta.seed', 'Зерно генераторов', '', 'n'],
    ['meta.goal', 'Цель проекта', '', 's'], ['meta.tasks', 'Задачи проекта', '', 's'],
    ['tz.prob', 'Расчётная вероятность превышения', 'доля', 'n'], ['tz.roadCategory', 'Категория дороги', '', 's'], ['tz.lanes', 'Полос движения', '', 'n'],
    ['tz.navClass', 'Класс реки по судоходству', '', 's'], ['tz.importance', 'Уровень ответственности (1 — нормальный, 2 — повышенный)', '', 'n'],
    ['tz.region', 'Район строительства', '', 's'], ['tz.addInfo', 'Дополнительная информация', '', 's'],
    ['geodesy.surveyLevel', 'Уровень воды на дату изысканий (ноль измерения глубин)', 'м', 'n'],
    ['hydro.unm', 'УНМ', 'м', 'n'], ['hydro.post.name', 'Водомерный пост', '', 's'], ['hydro.post.zero', 'Отметка нуля поста (пусто — УНМ − 2 м)', 'м', 'n'],
    ['hydro.post.offsetKm', 'Удаление поста от оси (+ ниже по течению)', 'км', 'n'], ['hydro.post.nYears', 'Продолжительность наблюдений', 'лет', 'n'], ['hydro.post.firstYear', 'Первый год наблюдений', '', 'n'],
    ['hydro.viu.z', 'Отметка ВИУ на оси (пусто — сгенерировать)', 'м', 'n'], ['hydro.viu.year', 'Год ВИУ', '', 'n'], ['hydro.viu.refName', 'Объект для привязки ВИУ', '', 's'], ['hydro.viu.refZ', 'Отметка объекта', 'м', 'n'],
    ['hydro.slope.i', 'Продольный уклон', '', 'n'], ['hydro.slope.studentMode', 'Уклон студенту: value — числом, twoLevels — задачей', '', 's'], ['hydro.slope.Lkm', 'Расстояние между урезами (задача)', 'км', 'n'],
    ['hydro.morph.LP.text', 'Ландшафт левой поймы', '', 's'], ['hydro.morph.LP.m', 'm левой поймы', '', 'n'],
    ['hydro.morph.R.text', 'Ландшафт русла', '', 's'], ['hydro.morph.R.m', 'm русла', '', 'n'],
    ['hydro.morph.PP.text', 'Ландшафт правой поймы', '', 's'], ['hydro.morph.PP.m', 'm правой поймы', '', 'n'],
    ['hydro.regime.feed', 'Тип питания: snow, rain, glacier, mixed', '', 's'], ['hydro.regime.landscape', 'Ландшафт: plain, foothill, mountain', '', 's'],
    ['hydro.regime.iceJams', 'Заторы при вскрытии', 'да/нет', 'b'], ['hydro.regime.zLo', 'min УВВ за историю (пусто — авто)', 'м', 'n'], ['hydro.regime.zHi', 'max УВВ за историю (пусто — авто)', 'м', 'n'],
    ['hydro.regime.Cv', 'Cv годовых максимумов расхода', '', 'n'], ['hydro.regime.CsCv', 'Cs/Cv', '', 'n'], ['hydro.regime.navMean', 'Средняя длительность навигации', 'сут', 'n'], ['hydro.regime.navSd', 'Разброс длительности навигации', 'сут', 'n'],
    ['hydro.rsuT', 't для таблицы РСУ', 'сут, через запятую', 'l'], ['hydro.rsuConsecutive', 't суток подряд', 'да/нет', 'b'],
    ['hydro.wind.v', 'Расчётная скорость ветра', 'м/с', 'n'], ['hydro.wind.fetch', 'Длина разгона волны', 'км', 'n'],
    ['geology.soilDb', 'База грунтов: sudomoin (пособие), metod44 (методические указания), custom', '', 's'], ['geology.ubv', 'Условный низ нижнего ИГУ', 'м', 'n'], ['topo.radius', 'Радиус кривизны реки в плане (+ влево)', 'м', 'n'], ['topo.gridStep', 'Шаг сетки топоповерхности', 'м', 'n']
  ];
  /* Пустое значение этих параметров означает «вычислить/сгенерировать»; для остальных — «по умолчанию». */
  D.NULLABLE = ['hydro.post.zero', 'hydro.viu.z', 'hydro.viu.year', 'hydro.viu.refZ', 'hydro.regime.zLo', 'hydro.regime.zHi', 'hydro.slope.Lkm'];
  D.DESC_KEYS = ['type', 'variety', 'filler', 'density', 'il', 'sr', 'e', 'strength', 'extra'];
  const getP = (o, path) => path.split('.').reduce((a, k) => a == null ? a : a[k], o);
  const setP = (o, path, val) => { const ks = path.split('.'), last = ks.pop(); const t = ks.reduce((a, k) => (a[k] = a[k] ?? {}), o); t[last] = val; };
  const fmtVal = (v, type) => v == null ? '' : type === 'b' ? (v ? 'да' : 'нет') : type === 'l' ? v.join(', ') : v;
  const parseVal = (raw, type) => {
    if (raw == null || raw === '') return null;
    if (type === 'n') return U.num(raw);
    if (type === 'b') return /^(да|yes|true|1|\+)$/i.test(String(raw).trim());
    if (type === 'l') return String(raw).split(/[;,\s]+/).map(Number).filter(Number.isFinite);
    return String(raw);
  };
  const cellVal = c => { const x = c && c.value; if (x == null) return null; if (typeof x === 'object') { if ('result' in x) return x.result; if (x.richText) return x.richText.map(r => r.text).join(''); if (x instanceof Date) return x.toISOString().slice(0, 10); if ('text' in x) return x.text; } return x; };
  const sheetRows = ws => { const out = []; if (!ws) return out; ws.eachRow({ includeEmpty: false }, (row, r) => { if (r === 1) return; const a = []; for (let c = 1; c <= ws.columnCount; c++) a.push(cellVal(row.getCell(c))); if (a.some(q => q != null && q !== '')) out.push(a); }); return out; };

  /* ---------- книга данных ---------- */
  D.SHEETS = {
    params: 'Параметры', zones: 'Зоны', profile: 'Профиль', road: 'Дорога', years: 'Годы', layers: 'ИГУ', tops: 'Кровли', soilref: 'Справочник грунтов', readme: 'Описание'
  };
  D.buildDataWorkbook = (ExcelJS, v) => {
    const wb = new ExcelJS.Workbook(), S = D.SHEETS, g = v.geodesy, I = BCA.profile.idx(g);
    const sheet = (name, head, rows, widths) => {
      const ws = wb.addWorksheet(name); ws.addRow(head); ws.getRow(1).font = { bold: true }; rows.forEach(r => ws.addRow(r));
      ws.columns.forEach((c, k) => { c.width = widths?.[k] ?? 14; }); ws.views = [{ state: 'frozen', ySplit: 1 }]; return ws;
    };
    sheet(S.readme, ['Книга данных варианта задания'], [
      ['Каждый лист — одна таблица, первая строка — заголовки. Пустая ячейка или пустой лист — значение будет сгенерировано или взято по умолчанию.'],
      ['Зоны — шаг и число интервалов для левого берега (BL), левой поймы (LP), русла (R), правой поймы (PP), правого берега (BR). Створов = сумма интервалов + 1.'],
      ['Профиль — отметки по всем створам подряд (длина = число створов). Пусто — профиль генерируется.'],
      ['Дорога — отметки оси проезжей части в характерных точках; только створы берегов.'],
      ['Годы — годовые максимумы: превышение П над нулём водомерного поста; навигация и уровни при прекращении навигации на t суток (отметки на посту, столбцы «t=…»). Пусто — ряды генерируются.'],
      ['ИГУ — слои: описание по справочнику (столбцы desc.*, значения — на листе «Справочник грунтов»), код категории неразмывающих скоростей (1…44; пусто — по описанию) и параметры генератора. Кровли — отметки кровли по створам (пусто — слоя нет; лист пуст — генерировать).'],
      ['Формат JSON того же варианта описан в schema/variant.schema.json и docs/VARIANT_FORMAT.md.']
    ], [140]);
    sheet(S.params, ['Параметр', 'Значение', 'Ед.', 'Ключ'], D.PARAMS.map(([path, label, unit, type]) => [label, fmtVal(getP(v, path), type), unit, path]), [52, 40, 16, 26]);
    sheet(S.zones, ['Ключ', 'Зона', 'Шаг, м', 'Интервалов', 'Ширина, м'], BCA.profile.ZONES.map(k => [k, BCA.profile.ZONE_NAME[k], g.zones[k].step, g.zones[k].n, g.zones[k].step * g.zones[k].n]), [8, 16, 10, 12, 12]);
    sheet(S.profile, ['Створ', 'Отметка, м', 'Комментарий', 'Зона (справочно)'], g.z.map((z, i) => [i + 1, z, g.comments?.[i] || '', BCA.profile.zoneOf(g, i, I)]), [8, 12, 24, 16]);
    sheet(S.road, ['Створ', 'Отметка ПЧ, м', 'Описание'], (v.tz.road || []).map(p => [p.st, p.z, p.label || '']), [8, 14, 30]);
    const ann = BCA.hydrology.annualTable(v), rsu = BCA.hydrology.rsuTable(v), h = v.hydro;
    sheet(S.years, ['Год', 'Превышение П, м', 'Навигация, сут'].concat(h.rsuT.map(t => 't=' + t)),
      ann.map((a, j) => [a.year, a.P, rsu[j]?.navDays ?? ''].concat(h.rsuT.map(t => rsu[j]?.values[t] ?? ''))), [8, 14, 14]);
    const DK = D.DESC_KEYS;
    sheet(S.layers, ['№ ИГУ', 'Запись базы vнр (код)', 'Описание (справочно)', 'Залегание (1 — верхний)', 'Мощность, м', 'Изменчивость', 'Линза: от створа', 'Линза: до створа'].concat(DK.map(k => 'desc.' + k)),
      v.geology.layers.map((l, k) => [l.no, l.code, BCA.SOILCAT.layerText(l, BCA.soilDb(v)), l.gen.order ?? k + 1, l.gen.t, l.gen.var, l.gen.lens ? l.gen.from : '', l.gen.lens ? l.gen.to : ''].concat(DK.map(q => l.desc?.[q] ?? ''))), [8, 10, 50, 12, 12, 12, 12, 12]);
    sheet(S.soilref, ['Поле', 'Значение', 'Наименование'], [].concat(
      BCA.SOILCAT.TYPES.map(t => ['desc.type', t.id, `${t.name} (${BCA.SOILCAT.GROUPS[t.group].name}); записи базы «${BCA.soilDb(v).name}»: ${BCA.soilCodesFor(BCA.soilDb(v), t.id).join(', ') || '—'}`]),
      ...Object.entries(BCA.SOILCAT.PROPS).map(([p, q]) => q.opts.filter(o => o[0]).map(o => ['desc.' + p, o[0], Array.isArray(o[1]) ? o[1][0] : o[1]]))), [14, 14, 80]);
    sheet(S.tops, ['Створ'].concat(v.geology.layers.map(l => 'ИГУ ' + l.no)), g.z.map((_, i) => [i + 1].concat(v.geology.layers.map(l => l.tops[i] ?? ''))), [8]);
    return wb;
  };

  /* Разбор книги данных → вариант. Возвращает { v, notes } — что было сгенерировано. */
  D.parseDataWorkbook = (wb) => {
    const S = D.SHEETS, ws = n => wb.getWorksheet(n), notes = [];
    const partial = { schemaVersion: BCA.schema.SCHEMA_VERSION };
    sheetRows(ws(S.params)).forEach(r => { const path = r[3], def = D.PARAMS.find(p => p[0] === path); if (def) { const val = parseVal(r[1], def[3]); if (val != null) setP(partial, path, val); else if (D.NULLABLE.includes(path)) setP(partial, path, null); } });
    const zr = sheetRows(ws(S.zones));
    if (zr.length) { partial.geodesy = partial.geodesy || {}; partial.geodesy.zones = {}; zr.forEach(r => { const k = String(r[0] || '').trim().toUpperCase(); if (BCA.profile.ZONES.includes(k)) partial.geodesy.zones[k] = { step: U.num(r[2]), n: Math.round(U.num(r[3])) }; }); }
    const pr = sheetRows(ws(S.profile));
    if (pr.length && pr.every(r => U.num(r[1]) != null)) { partial.geodesy.z = pr.map(r => U.num(r[1])); partial.geodesy.comments = {}; pr.forEach((r, i) => { if (r[2]) partial.geodesy.comments[i] = String(r[2]); }); }
    const rr = sheetRows(ws(S.road)); if (rr.length) { partial.tz = partial.tz || {}; partial.tz.road = rr.map(r => ({ st: Math.round(U.num(r[0])), z: U.num(r[1]), label: r[2] ? String(r[2]) : '' })); }
    const yws = ws(S.years), yr = sheetRows(yws);
    if (yr.length) {
      const head = []; yws.getRow(1).eachCell((c, k) => { head[k - 1] = String(cellVal(c) || ''); });
      const tCols = head.map((hd, k) => [k, /^t\s*=\s*(\d+)/i.exec(hd)]).filter(q => q[1]).map(q => [q[0], Number(q[1][1])]);
      partial.hydro = partial.hydro || {};
      partial.hydro.importedYears = yr.map(r => ({ year: Math.round(U.num(r[0])), P: U.num(r[1]), navDays: U.num(r[2]), rsuPost: Object.fromEntries(tCols.map(([k, t]) => [t, U.num(r[k])])) }));
      if (tCols.length) partial.hydro.rsuT = tCols.map(q => q[1]);
    }
    const lr = sheetRows(ws(S.layers));
    if (lr.length) { partial.geology = partial.geology || {}; partial.geology.layers = lr.map((r, k) => ({ no: String(r[0] ?? k + 1), code: U.num(r[1]) != null ? Math.round(U.num(r[1])) : null,
      desc: Object.fromEntries(D.DESC_KEYS.map((q, j) => [q, r[8 + j] == null ? '' : String(r[8 + j])]).filter(q => q[1] !== '')), tops: [],
      gen: { order: U.num(r[3]) ?? k + 1, t: U.num(r[4]) ?? 3, var: U.num(r[5]) ?? 0.3, lens: U.num(r[6]) != null, from: U.num(r[6]) ?? 1, to: U.num(r[7]) ?? 999 } })); }
    const tr = sheetRows(ws(S.tops));
    if (tr.length && partial.geology?.layers && tr.some(r => r.slice(1).some(q => U.num(q) != null))) partial.geology.layers.forEach((l, k) => { l.tops = tr.map(r => U.num(r[k + 1])); });
    return D.fromPartial(partial, notes);
  };

  /* ---------- база грунтов в Excel (выгрузка любой базы как шаблона и загрузка своей) ---------- */
  D.SOILDB_SHEET = 'База грунтов';
  D.buildSoilDbWorkbook = (ExcelJS, db) => {
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet(D.SOILDB_SHEET);
    const depths = [...new Set(db.entries.flatMap(e => e.depths))].sort((a, b) => a - b);
    const typesOf = code => Object.entries(db.map || {}).filter(([, cs]) => cs.includes(code)).map(([k]) => k).join(', ');
    ws.addRow(['Код', 'Связный', 'Наименование', 'Разновидность', 'Характеристика', 'Типы описаний (soilcat)'].concat(depths.map(d => 'h=' + d)));
    ws.getRow(1).font = { bold: true };
    db.entries.forEach(e => ws.addRow([e.code, e.cohesive ? 'да' : 'нет', e.name, e.sub || '', [e.ch1, e.ch2].filter(Boolean).join(', '), typesOf(e.code)].concat(depths.map(d => { const k = e.depths.indexOf(d); return k >= 0 ? e.v[k] : null; }))));
    ws.columns.forEach((c, k) => { c.width = [7, 9, 28, 40, 22, 30][k] ?? 8; });
    const info = wb.addWorksheet('Описание');
    [['База грунтов: ' + db.name], ['Источник: ' + (db.source || '')], [''],
     ['Строка — запись базы: код (целое, уникальное), связный (да/нет), наименование, разновидность, характеристика,'],
     ['типы описаний — через запятую идентификаторы справочника описаний (лист «Справочник грунтов» книги данных); по ним запись подбирается автоматически;'],
     ['столбцы h=… — неразмывающая средняя скорость, м/с, при средней глубине потока h, м (пустая ячейка — нет значения). Последняя глубина — «и более».']].forEach(r => info.addRow(r));
    info.getColumn(1).width = 140;
    return wb;
  };
  D.parseSoilDbWorkbook = (wb, name) => {
    const ws = wb.getWorksheet(D.SOILDB_SHEET) || wb.worksheets[0]; if (!ws) throw new Error('В файле нет листов');
    const head = []; ws.getRow(1).eachCell((c, k) => { head[k - 1] = String(cellVal(c) ?? ''); });
    const dcols = head.map((h, k) => [k, /^h\s*=\s*([\d.,]+)/i.exec(h)]).filter(q => q[1]).map(q => [q[0], U.num(q[1][1])]);
    if (!dcols.length) throw new Error('Нет столбцов глубин «h=…»');
    const entries = [], map = {};
    sheetRows(ws).forEach(r => {
      const code = U.num(r[0]); if (code == null) return;
      const ds = [], vs = []; dcols.forEach(([k, d]) => { const val = U.num(r[k]); if (val != null) { ds.push(d); vs.push(val); } });
      entries.push({ code: Math.round(code), cohesive: /^(да|yes|1|true|\+)/i.test(String(r[1] ?? '')), name: String(r[2] ?? ''), sub: String(r[3] ?? ''), ch1: String(r[4] ?? ''), depths: ds, depthsLast: 'и более', v: vs });
      String(r[5] ?? '').split(/[;,\s]+/).filter(Boolean).forEach(tid => { (map[tid] = map[tid] || []).push(Math.round(code)); });
    });
    if (!entries.length) throw new Error('В базе нет записей');
    if (new Set(entries.map(e => e.code)).size !== entries.length) throw new Error('Коды записей повторяются');
    return { id: 'custom', name: name || 'Своя база', source: 'загружена из Excel', entries, map, eOrdered: ['clay-h', 'clay-l', 'loam-h', 'loam-l', 'loess'] };
  };

  /* Неполный вариант → полный. Отсутствующее берётся по умолчанию или генерируется. */
  D.fromPartial = (o, notes = []) => {
    const seed = o.meta?.seed ?? 1, v = BCA.schema.defaultVariant(seed);
    if (o.geology && o.geology.layers && !o.geology.soilDb) BCA.schema.fixSoilDb(o);
    const merge = (dst, src) => { for (const k in src) { const s = src[k];
      if (s === undefined) continue;
      if (s && typeof s === 'object' && !Array.isArray(s) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) merge(dst[k], s);
      else dst[k] = s; } };
    const imported = o.hydro?.importedYears; if (o.hydro) delete o.hydro.importedYears;
    const hasZ = Array.isArray(o.geodesy?.z), hasTops = o.geology?.layers?.some(l => Array.isArray(l.tops) && l.tops.some(t => t != null)), hasSeries = Array.isArray(o.hydro?.series) && o.hydro.series.length;
    const zonesGiven = !!o.geodesy?.zones;
    merge(v, U.deepClone(o));
    BCA.profile.ZONES.forEach(k => { const z = v.geodesy.zones[k]; if (!(z && z.step > 0 && z.n >= 1)) throw new Error(`Зона ${k}: нужны шаг > 0 и число интервалов ≥ 1`); });
    const N = BCA.profile.idx(v.geodesy).N;
    if (!hasZ) { if (zonesGiven || v.geodesy.z.length !== N) { v.geodesy.z = new Array(N).fill(0); BCA.profile.generate(v); notes.push('профиль'); } }
    else if (v.geodesy.z.length !== N) throw new Error(`Профиль: ${v.geodesy.z.length} отметок, а по зонам нужно ${N}`);
    const sdb = BCA.soilDb(v);
    v.geology.layers.forEach(l => { if (!l.desc || !l.desc.type) l.desc = BCA.SOILCAT.fromCode(l.code ?? 2, sdb); if (l.code == null) { l.code = BCA.SOILCAT.autoCode(l.desc, sdb); notes.push('записи vнр грунтов'); } });
    v.geology.layers.forEach((l, k) => { l.gen = Object.assign({ order: k + 1, t: 3, var: 0.3, lens: false, from: 1, to: 999 }, l.gen || {}); if (!Array.isArray(l.tops) || l.tops.length !== N) l.tops = new Array(N).fill(null); });
    if (!hasTops) { BCA.profile.generateSoil(v); notes.push('грунты'); }
    if (zonesGiven && !o.tz?.road) v.tz.road = [];                                     // точки по умолчанию не подходят к другим зонам
    v.tz.road = (v.tz.road || []).filter(p => p.st >= 1 && p.st <= N);
    if (v.hydro.viu.z == null) v.hydro.viu.auto = true;
    if (imported && imported.length) {
      const z0 = BCA.hydrology.postZero(v), shift = v.hydro.slope.i * (v.hydro.post.offsetKm || 0) * 1000;
      v.hydro.series = imported.map(y => ({ year: y.year, zMax: U.r2(z0 + y.P + shift), navDays: y.navDays, rsuPost: y.rsuPost, jam: false }));
      v.hydro.post.nYears = imported.length; v.hydro.post.firstYear = imported[0].year;
      if (v.hydro.viu.z == null) { v.hydro.viu.z = U.r2(Math.max(...v.hydro.series.map(s => s.zMax)) + 0.5); notes.push('ВИУ'); }
      if (v.hydro.viu.year == null) v.hydro.viu.year = v.hydro.post.firstYear - 30;
      if (v.hydro.viu.refZ == null) v.hydro.viu.refZ = U.r2(v.hydro.viu.z - 1.5);
    } else if (!hasSeries || !hasZ) { v.hydro.series = []; BCA.hydrology.generate(v); notes.push('ряды уровней'); }
    notes.push(...BCA.schema.autofill(v));
    return { v, notes: [...new Set(notes)] };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
