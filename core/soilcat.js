/* Описание грунтов ИГУ выбором из справочника — по классификации ГОСТ 25100-2020 «Грунты. Классификация»
   (дисперсные несвязные: крупнообломочные и пески; дисперсные связные: глинистые; особые; скальные).
   ВНИМАНИЕ: наименования и границы приведены по классификации ГОСТ 25100 (ред. 2011/2020) без сверки
   с текстом стандарта в этой версии программы — сверить (docs/SOILS.md).

   Связь описания с записью базы неразмывающих скоростей задаёт сама база (soildb.js, db.map):
   первая запись — по умолчанию; для глинистых и лёссовых грунтов запись выбирается по коэффициенту пористости e. */
(function (root) {
  'use strict';
  const BCA = root.BCA || (root.BCA = {});

  /* Прилагательные в мужском и женском роде: [м, ж]. */
  const G = (m, f) => [m, f];
  const S = BCA.SOILCAT = {};

  S.GROUPS = {
    coarse: { name: 'Крупнообломочные (несвязные)', props: ['filler', 'sr'] },
    sand:   { name: 'Пески (несвязные)', props: ['density', 'sr'] },
    clay:   { name: 'Глинистые (связные)', props: ['variety', 'il', 'e'] },
    special:{ name: 'Особые', props: ['e'] },
    rock:   { name: 'Скальные и полускальные', props: ['strength'] }
  };

  /* Типы грунтов. g — род (0 — м, 1 — ж) для согласования прилагательных. */
  S.TYPES = [
    { id: 'boulder', group: 'coarse', name: 'Валунный грунт', note: 'частиц крупнее 200 мм более 50 % (при неокатанных — глыбовый)', g: 0 },
    { id: 'pebble',  group: 'coarse', name: 'Галечниковый грунт', note: 'крупнее 10 мм более 50 % (при неокатанных — щебенистый)', g: 0 },
    { id: 'gravel',  group: 'coarse', name: 'Гравийный грунт', note: 'крупнее 2 мм более 50 % (при неокатанных — дресвяный)', g: 0 },
    { id: 'sand-g',  group: 'sand', name: 'Песок гравелистый', note: 'крупнее 2 мм более 25 %', g: 0 },
    { id: 'sand-c',  group: 'sand', name: 'Песок крупный', note: 'крупнее 0,5 мм более 50 %', g: 0 },
    { id: 'sand-m',  group: 'sand', name: 'Песок средней крупности', note: 'крупнее 0,25 мм более 50 %', g: 0 },
    { id: 'sand-f',  group: 'sand', name: 'Песок мелкий', note: 'крупнее 0,1 мм 75 % и более', g: 0 },
    { id: 'sand-s',  group: 'sand', name: 'Песок пылеватый', note: 'крупнее 0,1 мм менее 75 %', g: 0 },
    { id: 'sandy-loam', group: 'clay', name: 'Супесь', note: 'число пластичности 1–7', g: 1, consist: 'supes' },
    { id: 'loam-l',  group: 'clay', name: 'Суглинок лёгкий', note: 'число пластичности 7–12', g: 0 },
    { id: 'loam-h',  group: 'clay', name: 'Суглинок тяжёлый', note: 'число пластичности 12–17', g: 0 },
    { id: 'clay-l',  group: 'clay', name: 'Глина лёгкая', note: 'число пластичности 17–27', g: 1 },
    { id: 'clay-h',  group: 'clay', name: 'Глина тяжёлая', note: 'число пластичности более 27', g: 1 },
    { id: 'loess',   group: 'special', name: 'Лёссовый грунт (суглинок)', note: 'просадочный', g: 0 },
    { id: 'silt',    group: 'special', name: 'Ил', note: 'современный осадок водоёмов', g: 0 },
    { id: 'peat',    group: 'special', name: 'Торф', note: 'органический грунт', g: 0 },
    { id: 'topsoil', group: 'special', name: 'Почвенно-растительный слой', note: '', g: 0 },
    { id: 'marl',    group: 'rock', name: 'Мергель', note: '', g: 0 },
    { id: 'shale',   group: 'rock', name: 'Сланец', note: '', g: 0 },
    { id: 'limest',  group: 'rock', name: 'Известняк', note: '', g: 0 },
    { id: 'sandst',  group: 'rock', name: 'Песчаник', note: '', g: 0 },
    { id: 'congl',   group: 'rock', name: 'Конгломерат', note: '', g: 0 }
  ];

  /* Характеристики: варианты [id, подпись (м), подпись (ж)]. */
  S.PROPS = {
    filler:   { name: 'Заполнитель', opts: [['', '—'], ['sand', 'с песчаным заполнителем'], ['sandyloam', 'с супесчаным заполнителем'], ['loam', 'с суглинистым заполнителем'], ['clay', 'с глинистым заполнителем']] },
    density:  { name: 'Плотность сложения', opts: [['', '—'], ['dense', G('плотный', 'плотная')], ['medium', G('средней плотности', 'средней плотности')], ['loose', G('рыхлый', 'рыхлая')]] },
    sr:       { name: 'Водонасыщение', opts: [['', '—'], ['low', G('малой степени водонасыщения', 'малой степени водонасыщения')], ['mid', G('средней степени водонасыщения', 'средней степени водонасыщения')], ['sat', G('насыщенный водой', 'насыщенная водой')]] },
    variety:  { name: 'Разновидность', opts: [['', '—'], ['sandy', G('песчанистый', 'песчанистая')], ['silty', G('пылеватый', 'пылеватая')]] },
    il:       { name: 'Консистенция', opts: [['', '—'], ['solid', G('твёрдый', 'твёрдая')], ['semisolid', G('полутвёрдый', 'полутвёрдая')], ['stiff', G('тугопластичный', 'тугопластичная')], ['soft', G('мягкопластичный', 'мягкопластичная')], ['vsoft', G('текучепластичный', 'текучепластичная')], ['plastic', G('пластичный', 'пластичная')], ['fluid', G('текучий', 'текучая')]] },
    e:        { name: 'Коэффициент пористости e', opts: [['', '—'], ['e4', 'e = 1,2–0,9'], ['e3', 'e = 0,9–0,6'], ['e2', 'e = 0,6–0,3'], ['e1', 'e = 0,3–0,2']] },
    strength: { name: 'Прочность', opts: [['', '—'], ['vstrong', G('очень прочный', 'очень прочная')], ['strong', G('прочный', 'прочная')], ['mstrong', G('средней прочности', 'средней прочности')], ['weak', G('малопрочный', 'малопрочная')]] }
  };
  /* Консистенция супеси по ГОСТ 25100: твёрдая, пластичная, текучая; суглинков и глин — шесть классов. */
  S.IL_SUPES = ['', 'solid', 'plastic', 'fluid'];
  S.IL_CLAY = ['', 'solid', 'semisolid', 'stiff', 'soft', 'vsoft', 'fluid'];
  S.propOptions = (prop, type) => {
    let o = S.PROPS[prop].opts;
    if (prop === 'il') { const allow = type && type.consist === 'supes' ? S.IL_SUPES : S.IL_CLAY; o = o.filter(q => allow.includes(q[0])); }
    if (prop === 'e' && type && type.id === 'loess') o = o.filter(q => q[0] !== 'e4');
    return o;
  };

  S.type = id => S.TYPES.find(t => t.id === id) || null;
  const word = (prop, val, g) => { const o = S.PROPS[prop].opts.find(q => q[0] === val); if (!o || !val) return ''; return Array.isArray(o[1]) ? o[1][g] : o[1]; };

  /* Описание по справочнику: «Суглинок тяжёлый пылеватый, тугопластичный, e = 0,9–0,6». */
  S.describe = d => {
    const t = d && S.type(d.type); if (!t) return '';
    let name = t.name; const parts = [];
    if (d.variety) name += ' ' + word('variety', d.variety, t.g);
    if (d.filler && S.GROUPS[t.group].props.includes('filler')) name += ' ' + word('filler', d.filler, t.g);
    ['density', 'il', 'sr', 'strength', 'e'].forEach(p => { if (d[p] && S.GROUPS[t.group].props.includes(p)) parts.push(word(p, d[p], t.g)); });
    if (d.extra) parts.push(d.extra);
    return [name].concat(parts).join(', ');
  };

  /* Расчётная запись базы по описанию. Для глинистых и лёссовых — по коэффициенту пористости e. */
  const E_IDX = { e4: 0, e3: 1, e2: 2, e1: 3 };
  S.autoCode = (d, db) => {
    db = db || BCA.SOIL_DBS[BCA.SOIL_DB_DEFAULT];
    const t = d && S.type(d.type); if (!t) return null;
    const codes = BCA.soilCodesFor(db, t.id); if (!codes.length) return null;
    if (d.e && (db.eOrdered || []).includes(t.id)) { const k = E_IDX[d.e] - (t.id === 'loess' ? 1 : 0); if (k >= 0 && k < codes.length) return codes[k]; }
    return codes[0];
  };
  /* Описание по записи базы (для данных без описания). */
  S.fromCode = (code, db) => {
    db = db || BCA.SOIL_DBS[BCA.SOIL_DB_DEFAULT];
    const t = S.TYPES.find(q => BCA.soilCodesFor(db, q.id).includes(code)) || S.TYPES.find(q => q.id === 'sand-m');
    const d = { type: t.id }, k = BCA.soilCodesFor(db, t.id).indexOf(code);
    if ((db.eOrdered || []).includes(t.id) && k >= 0) d.e = ['e4', 'e3', 'e2', 'e1'][k + (t.id === 'loess' ? 1 : 0)] || '';
    return d;
  };
  /* Описание слоя для бланка; если описания нет — наименование записи базы. */
  S.layerText = (l, db) => {
    if (l.desc && l.desc.type) return S.describe(l.desc);
    return BCA.soilEntryText(BCA.soilEntry(db || BCA.SOIL_DBS[BCA.SOIL_DB_DEFAULT], l.code));
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
