/* Генератор задания — интерфейс. Данные — объект варианта (core/schema.js), логика — в core/. */
(function () {
  'use strict';
  const B = window.BCA, U = B.util, C = B.charts, P = B.profile;
  const KEY = 'bca-generator-v1', TKEY = 'bca-templates-v1';
  /* Вкладки идут в порядке пунктов плана генератора (п. 1–18); третий элемент — раздел проверки для значков. */
  const TABS = [['geo', '1–3 Профиль', 'Геодезия'], ['soil', '4 Грунты', 'Геология'], ['survey', '5–8 Изыскания', 'Гидрология'], ['series', '9–12 Ряды', 'Гидрология'],
    ['meteo', '13–14 Ветер, судоходство'], ['road', '15–16 Дорога', 'ТЗ'], ['topo', '17 Топография'], ['out', '18 Бланк'], ['tpl', 'Шаблоны']];
  let V = null, tab = 'geo', mode = { kind: 'ground', layer: 0 }, ySel = 0, topoCache = null, topoSurf = 'raw';
  const hist = [];

  /* ---------- DOM ---------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) { const a = attrs[k]; if (a == null || a === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), a); else if (k === 'class') e.className = a; else if (k === 'style') e.style.cssText = a;
      else if (k in e && k !== 'list') e[k] = a; else e.setAttribute(k, a); }
    kids.flat(Infinity).forEach(c => { if (c != null && c !== false) e.appendChild(c instanceof Node ? c : document.createTextNode(String(c))); });
    return e;
  }
  const svgEl = cls => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); if (cls) s.setAttribute('class', cls); return s; };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2400); }
  function download(name, data, type) { const b = data instanceof Blob ? data : new Blob([data], { type }); const a = h('a', { href: URL.createObjectURL(b), download: name }); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  const fname = (suffix, ext) => `${suffix}_${String(V.meta.code || 'вариант').replace(/[\\/:*?"<>|]/g, '-')}${V.meta.student ? '_' + V.meta.student.split(' ')[0] : ''}.${ext}`;

  /* ---------- состояние ---------- */
  function save() { try { localStorage.setItem(KEY, JSON.stringify(V)); } catch (e) { console.warn(e); } }
  function load() { try { const t = localStorage.getItem(KEY); if (t) return B.schema.migrate(JSON.parse(t)); } catch (e) { console.warn('сохранённый вариант не загружен:', e.message); } return null; }
  function snapshot() { hist.push(JSON.stringify(V)); if (hist.length > 40) hist.shift(); }
  function undo() { if (!hist.length) return toast('Нечего отменять'); V = JSON.parse(hist.pop()); topoCache = null; commit(); }
  function commit(full = true) { save(); renderHeader(); renderTabs(); if (full) renderTab(); }
  const change = (fn, full = true) => { snapshot(); fn(); commit(full); };

  /* ---------- поля ---------- */
  function num(get, set, o = {}) {
    const auto = o.auto && o.auto();
    const i = h('input', { type: 'number', step: o.step ?? 0.01, value: auto ? '' : (get() ?? ''), placeholder: o.ph ?? '', title: o.title, style: o.w ? `width:${o.w}px` : null });
    i.addEventListener('change', () => change(() => set(U.num(i.value))));
    return i;
  }
  function txt(get, set, o = {}) { const i = o.area ? h('textarea', { rows: o.rows }) : h('input', { type: 'text', placeholder: o.ph ?? '' }); i.value = get() ?? ''; i.addEventListener('change', () => change(() => set(i.value))); return i; }
  function sel(opts, get, set, o = {}) { const s = h('select', { title: o.title }); opts.forEach(([v, t]) => s.appendChild(h('option', { value: v, selected: String(v) === String(get()) }, t))); s.addEventListener('change', () => change(() => set(s.value))); return s; }
  function chk(get, set, label, title) { const c = h('input', { type: 'checkbox', checked: !!get() }); c.addEventListener('change', () => change(() => set(c.checked))); return h('label', { title }, c, label ? ' ' + label : ''); }
  const kv = rows => h('div', { class: 'kv' }, rows.filter(Boolean).map(([l, e, u, title]) => [h('label', { title }, l), h('span', {}, e, u ? h('span', { class: 'unit' }, u) : null)]));
  const card = (title, ...kids) => h('div', { class: 'card' }, title ? h('h2', {}, title) : null, ...kids);
  const sub = t => h('h3', {}, t);
  const btn = (label, fn, cls, title) => h('button', { class: cls, onclick: fn, title }, label);
  const more = (label, ...kids) => h('details', {}, h('summary', {}, label), ...kids);
  const tbl = (head, rows) => h('table', {}, h('thead', {}, h('tr', {}, head.map(t => h('th', {}, t)))), h('tbody', {}, rows));

  /* ---------- шапка и вкладки ---------- */
  function renderHeader() {
    const w = P.widths(V.geodesy);
    document.getElementById('hdrSub').textContent = `Вариант ${V.meta.code || '—'}${V.meta.student ? ' · ' + V.meta.student : ''} · ${w.n} створов · ${w.total} м`;
  }
  function renderTabs() {
    const nav = document.getElementById('tabs'); nav.innerHTML = '';
    const msgs = B.schema.validate(V);
    TABS.forEach(([id, name, sec]) => {
      const errs = msgs.filter(m => m.lvl === 'err' && (id === 'out' || m.sec === sec)).length, warns = sec ? msgs.filter(m => m.lvl === 'warn' && m.sec === sec).length : 0;
      nav.appendChild(h('button', { class: id === tab ? 'on' : '', onclick: () => { tab = id; renderTabs(); TABS.forEach(([k]) => document.getElementById('tab-' + k).classList.toggle('hide', k !== tab)); renderTab(); } },
        name, errs ? h('span', { class: 'badge' }, errs) : warns ? h('span', { class: 'badge warn' }, warns) : null));
    });
  }
  function renderTab() { ({ geo: renderGeo, soil: renderSoil, survey: renderSurvey, series: renderSeries, meteo: renderMeteo, road: renderRoad, topo: renderTopo, out: renderOut, tpl: renderTpl })[tab](); }
  const pane = id => { const b = document.getElementById('tab-' + id); b.innerHTML = ''; return b; };

  /* ================= разрез с рисованием ================= */
  function profileCard(modes) {
    const svg = svgEl(modes.length ? 'chart draw' : 'chart'), legend = h('div', { class: 'legend' });
    let view = null;
    const draw = () => {
      view = C.profile(svg, V, { mode });
      legend.innerHTML = '';
      V.geology.layers.forEach((l, k) => legend.appendChild(h('span', {}, h('i', { style: `background:${C.LAYER_COLORS[k % C.LAYER_COLORS.length]}` }), `ИГУ ${l.no}: ${B.SOILCAT.layerText(l, B.soilDb(V))}`)));
    };
    const bar = !modes.length ? null : h('div', { class: 'row' }, modes.map(([label, kind, layer]) => h('button', { class: mode.kind === kind && (kind === 'ground' || mode.layer === layer) ? 'on' : '', title: 'Зажмите кнопку мыши и ведите по разрезу', onclick: () => { mode = { kind, layer }; renderTab(); } }, label)));
    let drag = null;
    const pos = ev => { const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const p = pt.matrixTransform(svg.getScreenCTM().inverse()); return { x: view.ix(p.x), z: view.iy(p.y) }; };
    const nearest = xv => { let b = 0; view.x.forEach((q, i) => { if (Math.abs(q - xv) < Math.abs(view.x[b] - xv)) b = i; }); return b; };
    const applyAt = (i, zv) => {
      if (mode.kind === 'ground') V.geodesy.z[i] = U.round(zv, V.gen.profile.precision ?? 2);
      else if (mode.kind === 'top') { const l = V.geology.layers[mode.layer]; if (!l) return; const t = U.r2(Math.min(zv, V.geodesy.z[i])); l.tops[i] = t <= V.geology.ubv ? null : t; }
      else if (mode.kind === 'erase') { const l = V.geology.layers[mode.layer]; if (l) l.tops[i] = null; }
    };
    svg.addEventListener('pointerdown', ev => { if (!view || !modes.length) return; snapshot(); svg.setPointerCapture(ev.pointerId); const p = pos(ev), i = nearest(p.x); applyAt(i, p.z); drag = { i, z: p.z }; draw(); });
    svg.addEventListener('pointermove', ev => { if (!drag) return; const p = pos(ev), i = nearest(p.x), a = drag.i, n = Math.abs(i - a);
      for (let s = 0; s <= n; s++) applyAt(a + Math.sign(i - a) * s, drag.z + (p.z - drag.z) * (n ? s / n : 1));
      drag = { i, z: p.z }; draw(); });
    const end = () => { if (!drag) return; drag = null; if (mode.kind === 'ground') P.clampTops(V); commit(); };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    draw();
    return card(null, bar, svg, legend);
  }

  /* ================= Шаги по плану генератора (п. 1–18) ================= */
  const step = (n, title, ...kids) => card(`${n}. ${title}`, ...kids);
  const pairNum = (getA, setA, getB, setB, oA = {}, oB = {}) => h('span', { class: 'pair' }, num(getA, setA, Object.assign({ w: 80 }, oA)), num(getB, setB, Object.assign({ w: 80 }, oB)));

  /* ---------- 1–3. Профиль ---------- */
  function renderGeo() {
    const box = pane('geo'), g = V.geodesy, p = V.gen.profile, w = P.widths(g), I = P.idx(g), N = I.N;
    mode = { kind: 'ground', layer: 0 };
    // п. 1: три шага (берега, поймы, промеры) и ширины пяти зон
    const setStep = (keys, s) => { if (!(s > 0)) return; const n = {}; keys.forEach(k => { const wk = g.zones[k].step * g.zones[k].n; g.zones[k].step = s; n[k] = Math.max(1, Math.round(wk / s)); }); P.reshape(V, n); };
    const stepIn = (keys, title) => num(() => g.zones[keys[0]].step, x => setStep(keys, x), { step: 1, w: 70, title });
    const wRow = k => h('tr', { class: 'z-' + k }, h('td', {}, P.ZONE_NAME[k]), h('td', {}, num(() => w[k], x => P.setZone(V, k, x, null), { step: 10, w: 80 })), h('td', { class: 'num' }, g.zones[k].n));
    const s1 = step(1, 'Шаги и створы',
      kv([['Шаг нивелировки на берегах', stepIn(['BL', 'BR']), 'м'], ['Шаг нивелировки на поймах', stepIn(['LP', 'PP']), 'м'], ['Шаг промеров глубин', stepIn(['R']), 'м']]),
      tbl(['Участок', 'Ширина, м', 'Интервалов'], P.ZONES.map(wRow)),
      h('div', { class: 'ctrl' }, 'Створов', h('b', {}, w.n), 'Общая длина', h('b', {}, w.total + ' м'), 'Поймы', h('b', {}, `${w.LP} + ${w.PP} м`), 'Русло', h('b', {}, w.R + ' м')),
      h('p', { class: 'note' }, 'Берега — незатопляемые участки; на них задаются отметки дороги (п. 16).'));
    const s2 = step(2, 'Уровень нижней межени', kv([['УНМ', num(() => V.hydro.unm, x => V.hydro.unm = x == null ? null : U.r1(x), { step: 0.1 }), 'м']]));
    const G = (l, key, st, u) => [l, num(() => p[key], x => p[key] = x, { step: st ?? 0.1 }), u];
    const pr2 = (a, b) => h('span', { class: 'pair' }, num(() => p[a], x => p[a] = x, { step: 0.1, w: 70 }), num(() => p[b], x => p[b] = x, { step: 0.1, w: 70 }));
    const pr = (a, b) => h('span', { class: 'pair' }, num(() => p[a], x => p[a] = x, { step: 0.1, w: 70 }), num(() => p[b], x => p[b] = x, { step: 0.05, w: 70 }));
    const x = P.stationX(g);
    const rows = []; for (let i = 0; i < N; i++) rows.push(h('tr', { class: 'z-' + P.zoneKey(g, i, I) }, h('td', {}, i + 1), h('td', {}, P.zoneOf(g, i, I)), h('td', { class: 'num' }, Math.round(x[i])),
      h('td', {}, num(() => g.z[i], z => { if (z != null) { g.z[i] = z; P.clampTops(V); } }, { w: 84 })),
      h('td', {}, txt(() => g.comments?.[i] ?? '', s => { g.comments = g.comments || {}; if (s) g.comments[i] = s; else delete g.comments[i]; }, { ph: P.comment({ zones: g.zones }, i, I) }))));
    const s3 = step(3, 'Профиль дна реки', Array.from(profileCard([['Рисовать', 'ground', 0]]).childNodes),
      kv([['Точность по вертикали', sel([[1, '0,1 м'], [2, '0,01 м']], () => p.precision ?? 1, q => { p.precision = Number(q); g.z = g.z.map(z => U.round(z, p.precision)); })]]),
      more('Генератор профиля',
        kv([['Зерно', h('span', { class: 'pair' }, num(() => p.seed, q => p.seed = q | 0, { step: 1, w: 90 }), btn('🎲', () => change(() => { p.seed = B.newSeed(); P.generate(V); })))],
          ['Левый берег: край, подошва', pr2('zOutL', 'zFootL'), 'м'], G('Левая бровка', 'zBrowL', 0.1, 'м'),
          ['Левая пойма: форма, неровность', pr2('shapeL', 'noiseL'), ''], ['Старица слева: глубина, место', pr('oxL', 'oxPosL')],
          G('Тальвег', 'zThal', 0.1, 'м'), G('Место тальвега 0…1', 'thalPos', 0.05), ['Русло: полнота, неровность', pr2('shapeC', 'noiseC'), ''],
          G('Правая бровка', 'zBrowR', 0.1, 'м'), ['Правая пойма: форма, неровность', pr2('shapeR', 'noiseR'), ''], ['Старица справа: глубина, место', pr('oxR', 'oxPosR')],
          ['Правый берег: подошва, край', pr2('zFootR', 'zOutR'), 'м']]),
        h('div', { class: 'row' }, btn('Сгенерировать профиль', () => change(() => P.generate(V)), 'primary'))),
      more('Отметки по створам', h('div', { class: 'scroll' }, tbl(['Створ', 'Зона', 'x, м', 'Отметка', 'Комментарий'], rows))));
    box.append(h('div', { class: 'grid2' }, h('div', {}, s1, s2), s3));
  }

  /* ---------- 4. Грунты ---------- */
  function renderSoil() {
    const box = pane('soil'), geo = V.geology, L = geo.layers, N = V.geodesy.z.length, SC = B.SOILCAT, db = B.soilDb(V);
    if (!(mode.kind !== 'ground' && L[mode.layer])) mode = L.length ? { kind: 'top', layer: 0 } : { kind: 'ground', layer: 0 };
    /* тип грунта: список с группами (несвязные, связные, особые, скальные) */
    const typeSel = l => {
      const s = h('select', { title: 'Тип грунта по классификации ГОСТ 25100' });
      Object.entries(SC.GROUPS).forEach(([gk, gq]) => s.appendChild(h('optgroup', { label: gq.name }, SC.TYPES.filter(t => t.group === gk).map(t => h('option', { value: t.id, selected: l.desc?.type === t.id, title: t.note }, t.name)))));
      s.onchange = () => change(() => { const keep = l.desc?.extra; l.desc = { type: s.value }; if (keep) l.desc.extra = keep; l.code = SC.autoCode(l.desc, db) ?? l.code; });
      return s;
    };
    const propSel = (l, p, t) => { const s = h('select', { title: SC.PROPS[p].name });
      SC.propOptions(p, t).forEach(([v, w]) => s.appendChild(h('option', { value: v, selected: (l.desc[p] || '') === v }, v ? (Array.isArray(w) ? w[t.g] : w) : SC.PROPS[p].name + ': —')));
      s.onchange = () => change(() => { l.desc[p] = s.value; if (p === 'e') l.code = SC.autoCode(l.desc, db) ?? l.code; }); return s; };
    const codeSel = (l, t) => { const s = h('select', { title: 'Запись базы неразмывающих скоростей' }), cs = t ? B.soilCodesFor(db, t.id) : [];
      (cs.length ? cs : db.entries.map(e => e.code)).forEach(c => { const q = B.soilEntry(db, c); if (q) s.appendChild(h('option', { value: c, selected: c === l.code }, `${c}. ${q.name}${q.sub ? ' — ' + q.sub : ''}${q.ch1 ? ' (' + q.ch1 + ')' : ''}`)); });
      s.onchange = () => change(() => l.code = Number(s.value)); return s; };
    /* база грунтов: встроенные + своя (из Excel) */
    const dbSel = h('select', { title: 'База неразмывающих скоростей' });
    Object.values(B.SOIL_DBS).forEach(d => dbSel.appendChild(h('option', { value: d.id, selected: db.id === d.id }, d.name + (d.priority ? ' (основная)' : ''))));
    if (geo.customDb) dbSel.appendChild(h('option', { value: 'custom', selected: db.id === 'custom' }, 'Своя: ' + geo.customDb.name));
    dbSel.onchange = () => change(() => B.schema.setSoilDb(V, dbSel.value));
    const dbFile = h('input', { type: 'file', accept: '.xlsx', class: 'hide' });
    dbFile.onchange = async () => { const fl = dbFile.files[0]; if (!fl) return;
      try { const wb = new window.ExcelJS.Workbook(); await wb.xlsx.load(await fl.arrayBuffer()); const cdb = B.dataio.parseSoilDbWorkbook(wb, fl.name.replace(/\.xlsx$/i, ''));
        change(() => { geo.customDb = cdb; B.schema.setSoilDb(V, 'custom'); }); toast(`База загружена: ${cdb.entries.length} записей`); } catch (e) { toast('Ошибка: ' + e.message); } dbFile.value = ''; };
    const dbBar = h('div', {}, h('div', { class: 'row' }, h('b', {}, 'База грунтов:'), dbSel, dbFile,
        btn('Своя из Excel…', () => dbFile.click(), null, 'Лист «База грунтов»: код, наименование, типы описаний, vнр по глубинам'),
        btn('Скачать базу', async () => download(`База грунтов — ${db.name}.xlsx`, await xlsxBlob(B.dataio.buildSoilDbWorkbook(window.ExcelJS, db))), null, 'Выгрузить выбранную базу в Excel (шаблон для своей)')),
      h('p', { class: 'note' }, db.source || ''));
    const blocks = L.map((l, k) => {
      if (!l.desc || !l.desc.type) l.desc = SC.fromCode(l.code, db);
      const t = SC.type(l.desc.type), q = B.soilEntry(db, l.code), cs = t ? B.soilCodesFor(db, t.id) : [];
      const ok = !cs.length || cs.includes(l.code);
      const head = h('div', { class: 'row' },
        h('span', { class: 'sw', style: `background:${C.LAYER_COLORS[k % C.LAYER_COLORS.length]}` }), h('b', {}, 'ИГУ'), h('span', { style: 'width:52px;display:inline-block' }, txt(() => l.no, x => l.no = x)),
        typeSel(l), h('span', { class: 'sp' }),
        btn('↑', () => change(() => { [L[k - 1], L[k]] = [L[k], L[k - 1]]; }), null, 'Выше в списке'), btn('↓', () => change(() => { [L[k + 1], L[k]] = [L[k], L[k + 1]]; })), btn('✕', () => change(() => L.splice(k, 1))));
      head.querySelectorAll('button')[0].disabled = k === 0; head.querySelectorAll('button')[1].disabled = k === L.length - 1;
      const props = h('div', { class: 'row' }, t ? SC.GROUPS[t.group].props.map(p => propSel(l, p, t)) : null,
        h('input', { type: 'text', value: l.desc.extra || '', placeholder: 'дополнение: включения, прослои…', style: 'flex:1;min-width:160px', onchange: e => change(() => { l.desc.extra = e.target.value.trim(); }) }));
      const calc = h('div', { class: 'row' }, h('span', { class: 'note' }, 'vнр:'), codeSel(l, t), q ? h('span', { class: 'note', title: 'Средняя глубина потока h, м → vнр, м/с' }, q.depths.map((d, k) => `${U.fmt(d, 1)}${k === q.depths.length - 1 ? '+' : ''}: ${q.v[k] == null ? '—' : U.fmt(q.v[k], 2)}`).join(' · ')) : h('span', { class: 'pill unv' }, 'нет в базе'),
        ok ? null : h('span', { class: 'pill unv' }, 'не по описанию'), t && !cs.length ? h('span', { class: 'pill unv', title: 'Тип грунта отсутствует в выбранной базе' }, 'тип вне базы') : null);
      const gen = h('div', { class: 'row note' }, 'Генератор: залегание', num(() => l.gen.order ?? k + 1, x => l.gen.order = x ?? k + 1, { step: 1, w: 48, title: '1 — верхний' }),
        'мощн.', num(() => l.gen.t, x => l.gen.t = x ?? 0, { step: 0.5, w: 58 }), 'м ± ', num(() => l.gen.var, x => l.gen.var = U.clamp(x ?? 0, 0, 1.5), { step: 0.1, w: 52 }),
        chk(() => l.gen.lens, x => l.gen.lens = x, 'линза', 'Слой только между створами'), num(() => l.gen.from, x => l.gen.from = U.clamp(x ?? 1, 1, N), { step: 1, w: 52 }), '–', num(() => Math.min(l.gen.to, N), x => l.gen.to = U.clamp(x ?? N, 1, N), { step: 1, w: 52 }));
      return h('div', { class: 'layer' }, head, props, h('div', { class: 'desc' }, SC.layerText(l, db)), calc, gen);
    });
    const modes = L.map((l, k) => ['Кровля ' + l.no, 'top', k]);
    if (L.length) modes.push(['Ластик ' + L[mode.layer].no, 'erase', mode.layer]);
    const tr = []; for (let i = 0; i < N; i++) tr.push(h('tr', { class: 'z-' + P.zoneKey(V.geodesy, i) }, h('td', {}, i + 1), h('td', { class: 'num' }, U.fmt(V.geodesy.z[i])),
      L.map(l => h('td', {}, num(() => l.tops[i], x => { l.tops[i] = x == null || x === 0 ? null : U.r2(Math.min(x, V.geodesy.z[i])); }, { w: 76 })))));
    box.append(h('div', { class: 'grid-half' },
      step(4, 'Грунты: описание по справочнику и границы слоёв', dbBar, blocks,
        h('div', { class: 'row' }, btn('+ ИГУ', () => change(() => L.push({ no: String(L.length + 1), code: SC.autoCode({ type: 'sand-m' }, db) ?? db.entries[0].code, desc: { type: 'sand-m' }, tops: new Array(N).fill(null), gen: { t: 3, var: 0.3, lens: false, from: 1, to: N, order: Math.max(0, ...L.map(l => l.gen.order || 0)) + 1 } }))),
          btn('Сгенерировать границы', () => change(() => P.generateSoil(V)), 'primary')),
        kv([['Условный низ', num(() => geo.ubv, x => geo.ubv = x, { step: 0.5 }), 'м'], ['Плавность слоёв', num(() => geo.corr, x => geo.corr = U.clamp(x ?? 10, 2, 40), { step: 1, title: 'Створов на «волну» кровли' })],
          ['Зерно', h('span', { class: 'pair' }, num(() => geo.seed, x => geo.seed = x | 0, { step: 1, w: 90 }), btn('🎲', () => change(() => { geo.seed = B.newSeed(); P.generateSoil(V); })))]])),
      h('div', {}, profileCard(modes), card(null, more('Отметки кровли по створам', h('div', { class: 'scroll' }, tbl(['Створ', 'Земля'].concat(L.map(l => 'ИГУ ' + l.no)), tr)))))));
  }

  /* ---------- 5–8. Гидрометрические изыскания ---------- */
  function renderSurvey() {
    const box = pane('survey'), hy = V.hydro, g = V.geodesy, r = hy.regime, post = hy.post, lib = V.library.roughness, Hy = B.hydrology, auto = Hy.autoLevels(V), sv = Hy.studentView(V), I = P.idx(g);
    const z0 = Hy.postZero(V), Pof = z => z == null ? '' : `→ П = ${U.fmt(Hy.toPost(V, z) - z0)} м`;
    const morphRow = k => {
      const zone = k === 'R' ? 'channel' : 'floodplain', cur = hy.morph[k], q = lib.find(o => o.id === cur.id);
      const s = h('select', { title: cur.text, style: 'max-width:300px' }); lib.filter(o => o.zone === zone).forEach(o => s.appendChild(h('option', { value: o.id, selected: o.id === cur.id }, o.text)));
      s.onchange = () => change(() => { const o = lib.find(z => z.id === s.value); hy.morph[k] = { id: o.id, m: o.m, text: o.text }; });
      return [P.ZONE_NAME[k], h('span', { class: 'pair' }, s, num(() => cur.m, x => cur.m = x, { step: 1, w: 56, title: 'm = 1/n' }), q && !q.verified ? h('span', { class: 'pill unv', title: 'm не сверен с таблицей методических указаний' }, '?') : null)];
    };
    const s5 = step(5, 'Морфометрия и уклон', kv([morphRow('LP'), morphRow('R'), morphRow('PP'),
      ['Уклон i', h('span', { class: 'pair' }, num(() => hy.slope.i, x => hy.slope.i = x, { step: 0.00001, w: 100 }),
        sel([['value', 'студенту числом'], ['twoLevels', 'студенту задачей']], () => hy.slope.studentMode, x => hy.slope.studentMode = x, { title: 'Задачей: два уреза на известном расстоянии' }))],
      sv.slopeTask ? ['Урезы через ' + sv.slopeTask.Lkm + ' км', h('span', {}, `${U.fmt(sv.slopeTask.zUp)} / ${U.fmt(sv.slopeTask.zDown)}`), `i = ${sv.slopeCheck}`] : null]),
      more('Справочник ландшафтов', tbl(['Участок', 'm', 'Характеристика', '✓', ''], lib.map((q, k) => h('tr', {},
        h('td', {}, sel([['floodplain', 'пойма'], ['channel', 'русло']], () => q.zone, x => q.zone = x)), h('td', {}, num(() => q.m, x => q.m = x, { step: 1, w: 52 })),
        h('td', {}, txt(() => q.text, x => q.text = x)), h('td', {}, chk(() => q.verified, x => q.verified = x, '', 'Сверено с методическими указаниями')), h('td', {}, btn('✕', () => change(() => lib.splice(k, 1))))))),
        btn('+ строка', () => change(() => lib.push({ id: 'u' + Date.now(), zone: 'floodplain', m: null, verified: false, src: '', text: '' })))));
    const dep = P.depths(V);
    const s6 = step(6, 'Промеры глубин для студентов', kv([['Уровень воды на дату изысканий', num(() => g.surveyLevel, x => g.surveyLevel = x), 'м', 'Ноль измерения глубин']]),
      h('div', { class: 'scroll', style: 'max-height:260px' }, tbl(['Створ', 'Глубина, м', ''], dep.map(d => h('tr', {}, h('td', {}, d.st), h('td', { class: 'num' }, U.fmt(d.h)), h('td', { class: 'note' }, d.i === I.iL ? 'левая бровка' : d.i === I.iR ? 'правая бровка' : ''))))));
    const s7 = step(7, 'Высокий исторический уровень', kv([
      ['Отметка ВИУ, год', pairNum(() => hy.viu.z, x => { hy.viu.z = x; hy.viu.auto = x == null; }, () => hy.viu.year, x => hy.viu.year = x | 0, { w: 90 }, { step: 1, w: 70 })],
      ['Известный объект', txt(() => hy.viu.refName, x => hy.viu.refName = x)], ['Отметка объекта', num(() => hy.viu.refZ, x => hy.viu.refZ = x), sv.viuExcess != null ? `→ студенту: выше на ${U.fmt(sv.viuExcess)} м` : '']]));
    const s8 = step(8, 'Наблюдения на водомерном посту', kv([
      ['Наблюдения: с года, число лет', pairNum(() => post.firstYear, x => post.firstYear = x | 0, () => post.nYears, x => post.nYears = U.clamp(x | 0, 3, 100), { step: 1 }, { step: 1, w: 60 })],
      ['Пост от оси перехода', num(() => post.offsetKm, x => post.offsetKm = x ?? 0, { step: 0.1, title: '0 — в створе; > 0 — ниже по течению: студент переносит уровни на ось (морфоствор) по уклону' }), post.offsetKm ? `км → перенос ${U.fmt(hy.slope.i * post.offsetKm * 1000)} м` : 'км (0 — в створе)'],
      ['Нуль поста', num(() => post.zero, x => post.zero = x, { auto: () => post.zero == null, ph: 'УНМ−2: ' + U.fmt(z0) }), 'м'],
      ['min УВВ за историю', num(() => r.zLo, x => r.zLo = x, { auto: () => r.zLo == null, ph: 'авто ' + U.fmt(auto.zLo) }), Pof(r.zLo ?? auto.zLo)],
      ['max УВВ за историю', num(() => r.zHi, x => r.zHi = x, { auto: () => r.zHi == null, ph: 'авто ' + U.fmt(auto.zHi) }), Pof(r.zHi ?? auto.zHi)]]));
    box.append(h('div', { class: 'grid-half' }, h('div', {}, s5, s7, s8), h('div', {}, s6)));
  }

  /* ---------- 9–12. Ряды наблюдений ---------- */
  function renderSeries() {
    const box = pane('series'), hy = V.hydro, r = hy.regime, Hy = B.hydrology, z0 = Hy.postZero(V);
    const synthetic = !!(hy.series.length && hy.series[0].daily), stale = synthetic && hy.seriesStamp !== Hy.stamp(V);
    const s9 = step(9, 'Тип реки', kv([['Питание', sel(Object.entries(B.RIVER_FEED).map(([k, q]) => [k, q.name]), () => r.feed, x => r.feed = x)],
      ['Ландшафт', sel(Object.entries(B.RIVER_LANDSCAPE).map(([k, q]) => [k, `${q.name}, i ${q.slope[0]}…${q.slope[1]}`]), () => r.landscape, x => r.landscape = x)],
      ['Cv, Cs/Cv', pairNum(() => r.Cv, x => r.Cv = U.clamp(x ?? 0.3, 0.05, 1.5), () => r.CsCv, x => r.CsCv = x ?? 2, { step: 0.05, w: 70 }, { step: 0.5, w: 60 })],
      ['Заторы при вскрытии', chk(() => r.iceJams, x => r.iceJams = x)]]));
    const svg = svgEl('chart'), ser = hy.series; ySel = U.clamp(ySel, 0, Math.max(0, ser.length - 1));
    const s10 = step(10, 'Годовые графики уровней',
      h('div', { class: 'row' }, btn('Сгенерировать', () => change(() => Hy.generate(V)), 'primary'), btn('🎲', () => change(() => { r.seedOffset = B.newSeed(); Hy.generate(V); }), null, 'Другая реализация ряда'),
        stale ? h('span', { class: 'warnnote' }, 'исходные данные изменены — перегенерируйте') : null, !synthetic && ser.length ? h('span', { class: 'note' }, 'ряд загружен таблицей, графиков нет') : null),
      synthetic ? svg : null);
    const ann = Hy.annualTable(V), half = Math.ceil(ann.length / 2);
    const s11 = step(11, 'Таблица превышений годовых максимумов', h('p', { class: 'note' }, `Над нулём поста ${U.fmt(z0)} м. Строка — выбор года на графике.`),
      tbl(['Год', 'П, м', 'Год', 'П, м'], U.range(half, k => h('tr', {}, [ann[k], ann[k + half]].map((a, j) => a ? [h('td', { class: k + j * half === ySel ? 'sel' : '', onclick: () => { ySel = k + j * half; renderSeries(); } }, a.year + (a.jam ? '*' : '')), h('td', { class: 'num' }, U.fmt(a.P))] : [h('td', {}), h('td', {})])))));
    const rsu = Hy.rsuTable(V), rsuIn = h('input', { type: 'text', value: hy.rsuT.join(', '), style: 'width:130px', title: 'N, сут через запятую' });
    rsuIn.onchange = () => change(() => { const t = rsuIn.value.split(/[;,\s]+/).map(Number).filter(q => Number.isFinite(q) && q >= 0).map(Math.round); if (t.length) hy.rsuT = [...new Set(t)].sort((a, b) => a - b); });
    const s12 = step(12, 'Таблица для РСУ', kv([['N, сут', h('span', { class: 'pair' }, rsuIn, sel([['1', 'подряд'], ['0', 'в сумме']], () => hy.rsuConsecutive ? '1' : '0', x => hy.rsuConsecutive = x === '1'))],
      ['Навигация: средняя, разброс', pairNum(() => r.navMean, x => r.navMean = x ?? 180, () => r.navSd, x => r.navSd = x ?? 9, { step: 1, w: 70 }, { step: 1, w: 56 }), 'сут']]),
      h('div', { class: 'scroll' }, tbl(['Год', 'Навиг., сут', ...hy.rsuT.map(t => 'N=' + t)], rsu.map(rw => h('tr', {}, h('td', {}, rw.year), h('td', { class: 'num' }, rw.navDays ?? ''), hy.rsuT.map(t => h('td', { class: 'num' }, U.fmt(rw.values[t]))))))),
      h('p', { class: 'note' }, 'Максимальный уровень за навигацию, если не учитывать N суток с наивысшими уровнями (отметки на посту).'));
    box.append(h('div', { class: 'grid-half' }, h('div', {}, s9, s10, s11), s12));
    if (synthetic) C.hydrograph(svg, V, ySel, { W: 720, H: 260 });
  }

  /* ---------- 13–14. Ветер и судоходство ---------- */
  function renderMeteo() {
    const box = pane('meteo'), hy = V.hydro, t = V.tz;
    box.append(h('div', { class: 'grid-half' },
      step(13, 'Ветер', kv([['Расчётная скорость ветра', num(() => hy.wind.v, x => hy.wind.v = x), 'м/с'], ['Длина разгона волны', num(() => hy.wind.fetch, x => hy.wind.fetch = x), 'км']])),
      step(14, 'Судоходство', kv([['Класс реки по судоходству', sel(B.NAV_CLASSES.map(c => [c, c]), () => t.navClass, x => t.navClass = x)]]),
        h('p', { class: 'note' }, 'Навигационные уровни — п. 12.'))));
  }

  /* ---------- 15–16. Дорога ---------- */
  function renderRoad() {
    const box = pane('road'), t = V.tz, g = V.geodesy, I = P.idx(g), N = I.N;
    const s15 = step(15, 'Проектируемая дорога', kv([
      ['Категория', sel(B.ROAD_CATEGORIES.map(c => [c, c]), () => t.roadCategory, x => t.roadCategory = x)],
      ['Состав: полос движения', num(() => t.lanes, x => t.lanes = x, { step: 1 })],
      ['Расположение, развитость района', txt(() => t.region, x => t.region = x)],
      ['Уровень ответственности', sel(Object.entries(B.IMPORTANCE), () => t.importance, x => t.importance = Number(x))],
      ['Вероятность превышения', num(() => t.prob, x => t.prob = x, { step: 0.0001 }), t.prob ? `доля (${U.fmt(t.prob * 100, 2)} %)` : 'доля'],
      ['Доп. информация', txt(() => t.addInfo, x => t.addInfo = x)]]));
    const rows = t.road.map((q, k) => h('tr', {}, h('td', {}, num(() => q.st, x => q.st = U.clamp(Math.round(x ?? 1), 1, N), { step: 1, w: 64 })),
      h('td', { class: 'num' }, U.fmt(g.z[q.st - 1])), h('td', {}, num(() => q.z, x => q.z = x, { w: 84 })), h('td', {}, btn('✕', () => change(() => t.road.splice(k, 1))))));
    const s16 = step(16, 'Характерные точки оси дороги на подходах', Array.from(profileCard([]).childNodes),
      tbl(['Створ', 'Земля, м', 'ПЧ, м', ''], rows),
      h('div', { class: 'row' }, btn('+ точка', () => change(() => t.road.push({ st: 1, z: t.road[0]?.z ?? null, label: '' }))), btn('По умолчанию', () => change(() => t.road = B.schema.autoRoad(V)), null, 'Края и подошвы берегов')),
      h('p', { class: 'note' }, `Только на берегах: створы 1–${I.bl + 1} и ${I.br + 1}–${N}. На поймах и в русле ось определяет студент.`));
    box.append(h('div', { class: 'grid2' }, s15, s16));
  }

  /* ---------- 17. Топоповерхность ---------- */
  function renderTopo() {
    const box = pane('topo'), t = V.topo, w = P.widths(V.geodesy);
    const cv = h('canvas', { class: 'topo', width: 1000, height: 1000 }), info = h('span', { class: 'note' });
    const nat = () => t.natural ?? ((Number(t.radius) || 0) !== 0);
    const build = () => { topoCache = B.topo.generate(V); const r = C.topoPlan(cv, topoCache, { interval: t.contour || null, smooth: t.smooth ?? 2, minR: t.minR ?? B.topo.MIN_RADIUS });
      const st = r.stat, mr = st.Rt ?? (t.minR ?? B.topo.MIN_RADIUS); info.textContent = `${topoCache.points.length} точек · горизонтали ${U.fmt(r.interval, 2)} м, ${st.lines} линий, без пересечений${mr > 0 ? ` · R ≥ ${String(mr).replace(".", ",")} м на поймах и берегах${st.remaining ? ` (кроме ${st.remaining} точек узких форм)` : ''}${st.tips ? `; на сходах горизонталей оставлено острыми ${st.tips} точек` : ''}; в русле и у оси дороги — без усиления сглаживания; усилено на ${Math.round(100 * st.smoothedNodes / st.nodes)} % площади${st.dropped ? `; снято мелких замкнутых горизонталей (< ${2 * mr} м): ${st.dropped}` : ''}` : ''} · уклон долины ${U.fmt(topoCache.valleySlope * 1e5, 2)}·10⁻⁵ (извилистость ${U.fmt(topoCache.sinuosity, 3)})${topoCache.lakes ? ' · озёр-стариц ' + topoCache.lakes : ''}${topoCache.ravines ? ' · оврагов ' + topoCache.ravines : ''}`; };
    const dOpt = () => ({ interval: t.contour || null, smooth: t.smooth ?? 2, minR: t.minR ?? B.topo.MIN_RADIUS });
    const csv = (sep, comma, sfx) => () => { if (!topoCache) build(); const s = topoSurf, nm = 'Топоповерхность' + (s === 'raw' ? '' : s === 'smooth' ? '_сглаж' : '_сглаж_уплотн') + sfx;
      download(fname(nm, 'csv'), (comma ? '﻿' : '') + B.topo.toCSV(topoCache, sep, comma, Object.assign({ surface: s }, dOpt())), 'text/csv'); };
    const png = () => cv.toBlob(bl => download(fname('Топоплан', 'png'), bl));
    const dxf = () => { if (!topoCache) build(); download(fname('Топоплан', 'dxf'), B.topo.toDXF(topoCache, { interval: t.contour || null, smooth: t.smooth ?? 2, minR: t.minR ?? B.topo.MIN_RADIUS }), 'application/dxf'); };
    const reset = () => { topoCache = null; };
    box.append(h('div', { class: 'grid2' }, step(17, 'Топоповерхность', kv([
      ['Радиус реки в плане', num(() => t.radius, x => { t.radius = x ?? 0; reset(); }, { step: 500, title: '0 — прямая; +R — изгиб влево, −R — вправо (по течению)' }), 'м'],
      ['Естественный рельеф', chk(nat, x => { t.natural = x; reset(); }, 'гривы, валы, старицы, овраги', 'По умолчанию включён при R ≠ 0; при R = 0 — только небольшие холмы и впадины')],
      ['Неровности', num(() => t.amp, x => { t.amp = x ?? 0; reset(); }, { step: 0.1 }), 'м'],
      ['Сторона квадрата', num(() => t.size, x => { t.size = x; reset(); }, { auto: () => t.size == null, ph: String(w.total), step: 50 }), 'м'],
      ['Шаг сетки точек', num(() => t.gridStep, x => { t.gridStep = U.clamp(x ?? 10, 1, 200); reset(); }, { step: 1 }), 'м'],
      ['Горизонтали через', sel([['', 'авто'], ['0.25', '0,25 м'], ['0.5', '0,5 м'], ['1', '1 м'], ['2', '2 м']], () => t.contour ?? '', x => { t.contour = x ? Number(x) : null; })],
      ['Сглаживание горизонталей', sel([['0', 'нет'], ['1', 'среднее'], ['2', 'сильное'], ['3', 'очень сильное']], () => t.smooth ?? 2, x => { t.smooth = Number(x); }, { title: 'Действует на план и на выгрузку DXF' })],
      ['Минимальный радиус горизонталей', num(() => t.minR ?? B.topo.MIN_RADIUS, x => { t.minR = x == null ? null : U.clamp(x, 0, 500); }, { step: 5, title: 'Изгибы с меньшим радиусом сглаживаются; 0 — без ограничения. Действует на план и DXF' }), 'м'],
      ['Узкие формы', sel(Object.entries(B.topo.NARROW_MODES), () => t.narrow || 'generalize', x => { t.narrow = x; reset(); }, { title: 'Формы уже 2·Rmin (озерки, ямы, концы понижений): горизонталь вокруг них не может повернуть с радиусом Rmin' })],
      ['Профиль на оси дороги', h('span', { class: 'pair' }, chk(() => t.keepAxis ?? true, x => { t.keepAxis = x; reset(); }, 'сохранять ±', 'Горизонтали в полосе у оси дороги строятся по исходной поверхности, сечение по оси — точно по отметкам профиля; далее плавный переход к сглаженным'),
        num(() => t.axisWin ?? 10, x => { t.axisWin = U.clamp(x ?? 10, 2, 20); reset(); }, { step: 1, w: 60, title: 'Полуширина окна, м (2–20)' }), ' м')],
      ['Сходы горизонталей', chk(() => t.sharpTips ?? true, x => { t.sharpTips = x; reset(); }, 'допускать острые развороты', 'На концах вытянутых форм на склоне (гряды, ложбины) горизонталь разворачивается «языком»; такие развороты не сглаживаются до Rmin')],
      ['Выгружать поверхность', (() => { const s = h('select', { title: 'Для CSV. Сглаженная — та, по которой построены горизонтали плана и DXF' });
        [['raw', 'исходную (точки сетки)'], ['smooth', 'сглаженную (узлы сетки)'], ['fine', 'сглаженную, шаг/3']].forEach(([v, l]) => s.appendChild(h('option', { value: v, selected: v === topoSurf }, l)));
        s.addEventListener('change', () => { topoSurf = s.value; }); return s; })()],
      ['Зерно', h('span', { class: 'pair' }, num(() => t.seed, x => { t.seed = x | 0; reset(); }, { step: 1, w: 90 }), btn('🎲', () => change(() => { t.seed = B.newSeed(); reset(); })))]]),
      h('div', { class: 'row' }, btn('CSV (X;Y;Z)', csv(';', true, ''), 'primary', 'Облако точек: разделитель «;», десятичная запятая'), btn('CSV (x,y,z)', csv(',', false, '_dot'), null, 'Разделитель «,», десятичная точка'), btn('PNG', png, null, 'Изображение плана'), btn('DXF', dxf, null, 'AutoCAD: горизонтали — 3D-полилинии с отметками; урез, ось дороги и русла — 3D; подписи')),
      info,
      h('p', { class: 'note' }, 'Квадрат в плане, ось дороги — его центральная ось; сечение по ней совпадает с профилем задания. Дно русла и урез понижаются по течению с уклоном i по длине русла, пойма — с уклоном долины. Голубым — вода при уровне на дату изысканий.')),
      card(null, cv)));
    build();
  }

  const toISO = s => { const q = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s || ''); return q ? `${q[3]}-${q[2]}-${q[1]}` : ''; };
  const fromISO = s => { const q = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return q ? `${q[3]}.${q[2]}.${q[1]}` : ''; };

  /* ================= Выдача ================= */
  const exportOpts = { key: true, daily: true };
  function renderOut() {
    const box = pane('out'), msgs = B.schema.validate(V), m = V.meta;
    const head = step(18, 'Бланк задания', h('div', { class: 'grid-half' },
      kv([['Шифр варианта', txt(() => m.code, x => m.code = x)], ['Студент', txt(() => m.student, x => m.student = x)], ['Группа', txt(() => m.group, x => m.group = x)],
        ['Курс, семестр', h('span', { class: 'pair' }, num(() => m.course, x => m.course = x, { step: 1, w: 60 }), txt(() => m.semester, x => m.semester = x))]]),
      kv([['Преподаватель', txt(() => m.teacher, x => m.teacher = x)], ['Дата выдачи', h('input', { type: 'date', value: toISO(m.issueDate), onchange: e => change(() => m.issueDate = fromISO(e.target.value)) })]])),
      more('Шапка, цель, задачи, сроки',
        kv([['Дисциплина', txt(() => m.discipline, x => m.discipline = x)], ['Код направления', txt(() => m.dirCode, x => m.dirCode = x)], ['Кафедра', txt(() => m.department, x => m.department = x)], ['Год в именах файлов', num(() => m.year, x => m.year = x, { step: 1 })]]),
        sub('Цель'), txt(() => m.goal, x => m.goal = x, { area: true, rows: 2 }), sub('Задачи'), txt(() => m.tasks, x => m.tasks = x, { area: true, rows: 5 }),
        sub('Контрольные сроки'), (m.deadlines || []).map((_, k) => h('div', { class: 'row' }, txt(() => m.deadlines[k], x => m.deadlines[k] = x, { ph: `Этап ${k + 1} — дата` })))),
      h('div', { class: 'row' },
        btn('Бланк Excel', exportXlsx, 'primary', 'Бланк задания и, по выбору, ключ преподавателя с формулами и суточные уровни'),
        chk(() => exportOpts.key, x => exportOpts.key = x, 'ключ'), chk(() => exportOpts.daily, x => exportOpts.daily = x, 'суточные уровни'),
        btn('Печать / PDF', () => { document.body.classList.add('printing'); window.print(); setTimeout(() => document.body.classList.remove('printing'), 500); }),
        h('span', { class: 'sep' }),
        btn('Книга данных', exportData, null, 'Машиночитаемая книга Excel: заполняется вне программы и загружается кнопкой «Открыть»'),
        btn('JSON', () => download(fname('Вариант', 'json'), JSON.stringify(V, null, 1), 'application/json'))),
      h('ul', { class: 'msgs' }, msgs.map(q => h('li', { class: q.lvl }, q.sec ? h('b', {}, q.sec + ': ') : null, q.t))));
    const pages = h('div', {}); pages.innerHTML = blankHTML();
    box.append(h('div', { class: 'noprint' }, head), pages);
  }
  async function schemePng() {
    const svg = svgEl(); svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    C.profile(svg, V, { W: 1000, H: 400, showSoil: false, dots: false, mode: { kind: 'ground' } }); svg.setAttribute('width', 2000); svg.setAttribute('height', 800);
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg).replace('<svg', '<svg style="background:#fff;font-family:Arial,sans-serif"'));
    const img = new Image(); await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
    const cv = h('canvas', { width: 2000, height: 800 }), ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 2000, 800); ctx.drawImage(img, 0, 0);
    return cv.toDataURL('image/png');
  }
  const xlsxBlob = async wb => new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  async function exportXlsx() {
    if (!window.ExcelJS) return toast('Нет библиотеки ExcelJS (vendor/exceljs.min.js)');
    try { let png = null; try { png = await schemePng(); } catch (e) { console.warn(e); }
      download(fname('Задание', 'xlsx'), await xlsxBlob(B.exporter.buildWorkbook(window.ExcelJS, V, Object.assign({ schemePng: png }, exportOpts)))); toast('Бланк сформирован');
    } catch (e) { console.error(e); toast('Ошибка: ' + e.message); }
  }
  async function exportData() {
    try { download(fname('Данные', 'xlsx'), await xlsxBlob(B.dataio.buildDataWorkbook(window.ExcelJS, V))); toast('Книга данных сформирована'); } catch (e) { console.error(e); toast('Ошибка: ' + e.message); }
  }
  function blankHTML() {
    const m = V.meta, t = V.tz, g = V.geodesy, hy = V.hydro, I = P.idx(g), N = I.N, sv = B.hydrology.studentView(V), f = U.fmt;
    const T = (head, rows) => `<table><tr>${head.map(x => `<th>${esc(x)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td class="center">${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
    const svgS = svgEl(); C.profile(svgS, V, { W: 1000, H: 330, showSoil: false, dots: false, mode: { kind: 'ground' } });
    const svgG = svgEl(); C.profile(svgG, V, { W: 1000, H: 430, showWater: false, showRoad: false, mode: { kind: 'none' } });
    const p1 = `<div class="sheet"><div class="code">${esc(m.code)}</div><p class="center">Задание для выполнения курсового проекта</p><h1>"Проект мостового перехода"</h1><p class="center">Вариант №${esc(m.code)}</p>
      <div class="line center" style="font-style:italic;font-size:13pt">${esc(m.student)}</div><div class="small">ФИО студента</div>
      <table class="noborder" style="margin-top:10px"><tr><td>Название дисциплины</td><td><b>${esc(m.discipline)}</b></td></tr><tr><td>Код направления подготовки</td><td>${esc(m.dirCode)}</td></tr>
      <tr><td>Курс ${esc(m.course)}</td><td>Группа ${esc(m.group)} &nbsp;&nbsp; Семестр ${esc(m.semester)}</td></tr><tr><td>Кафедра</td><td>${esc(m.department)}</td></tr><tr><td>ФИО преподавателя</td><td><b>${esc(m.teacher)}</b></td></tr></table>
      <h4>Общие сведения</h4><table class="noborder"><tr><td style="width:150px;vertical-align:top">Цель проекта:</td><td>${esc(m.goal)}</td></tr><tr><td style="vertical-align:top">Задачи проекта:</td><td style="white-space:pre-line">${esc(m.tasks)}</td></tr></table>
      <h4>Контрольные сроки выполнения курсового проекта</h4>${(m.deadlines || []).map(d => `<div class="line">${esc(d)}</div>`).join('')}
      <table class="noborder" style="margin-top:24px;width:100%"><tr><td><b>Задание выдал</b><br><br>______________ / ${esc(m.teacher)} /<br><span class="small">подпись</span><br><br>${esc(m.issueDate || '__________')}<br><span class="small">дата</span></td>
      <td><b>Задание получил</b><br><br>______________ / &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; /<br><span class="small">подпись</span><br><br>__________<br><span class="small">дата</span></td></tr></table><div class="foot">Страница 1 из 4</div></div>`;
    const row = i => { const rz = (i <= I.bl || i >= I.br) ? (t.road || []).find(p => p.st === i + 1) : null; return [i + 1, f(g.z[i]), rz ? f(rz.z) : '', P.comment(g, i, I)]; };
    const head = ['Створ', 'Отметка', 'ПЧ', 'Комментарий'];
    const p2 = `<div class="sheet"><p>Приложение №1 к заданию на курсовое проектирование</p><h1 style="text-align:left">Исходные данные</h1>
      <h2>1. Техническое задание на проектирование мостового перехода</h2><div class="cols"><table class="noborder"><tr><td colspan=2><b>Данные о проектируемой автомобильной дороге</b></td></tr>
      <tr><td>Категория автомобильной дороги</td><td>${esc(t.roadCategory)}</td></tr><tr><td>Количество полос движения</td><td>${esc(t.lanes)}</td></tr>
      <tr><td>Уровень ответственности</td><td>${esc(B.IMPORTANCE[t.importance] || '')}</td></tr>${t.region ? `<tr><td>Район</td><td>${esc(t.region)}</td></tr>` : ''}<tr><td>Расчётная вероятность превышения</td><td>${f(t.prob * 100, 2)} %</td></tr>${t.addInfo ? `<tr><td>Доп. инф.:</td><td>${esc(t.addInfo)}</td></tr>` : ''}</table>
      <table class="noborder"><tr><td colspan=2><b>Требования по судоходству</b></td></tr><tr><td>Класс реки по судоходству</td><td>${esc(t.navClass)}</td></tr></table></div>
      <h2>2. Результаты геодезических изысканий</h2>${T(['Участок', 'Шаг нивелировки, м', 'Ширина, м'], P.ZONES.filter(k => k !== 'R').map(k => [P.ZONE_NAME[k], g.zones[k].step, g.zones[k].step * g.zones[k].n]))}
      <div class="cols" style="margin-top:6px">${T(head, U.range(I.iL + 1, row))}${T(head, U.range(N - I.iR, k => row(I.iR + k)))}</div>
      <p><b>Схема мостового перехода</b></p>${svgS.outerHTML}<div class="foot">Страница 2 из 4</div></div>`;
    const ann = B.hydrology.annualTable(V), half = Math.ceil(ann.length / 2), rsu = B.hydrology.rsuTable(V);
    const dep = P.depths(V).map(d => [d.st, f(d.h), d.i === I.iL ? 'Левая бровка' : d.i === I.iR ? 'Правая бровка' : '']);
    const slopeTxt = hy.slope.studentMode === 'twoLevels' && sv.slopeTask ? `Отметки уреза воды на дату изысканий: выше по течению ${f(sv.slopeTask.zUp)} м, ниже по течению ${f(sv.slopeTask.zDown)} м; расстояние между точками ${sv.slopeTask.Lkm} км (ось перехода посередине).` : `Продольный уклон реки ${String(hy.slope.i).replace('.', ',')}`;
    const p3 = `<div class="sheet"><h2>3. Результаты гидрологических и метеорологических изысканий</h2><div class="cols">
      <div><b>Результаты промера глубин русла</b><table class="noborder"><tr><td>Шаг промера глубин, м</td><td>${g.zones.R.step}</td></tr><tr><td>Отметка нуля измерения глубин, м</td><td>${f(g.surveyLevel)}</td></tr></table>${T(['Створ', 'Глубина', 'Комментарий'], dep)}</div>
      <div><b>Записи из истории наблюдений за высоким уровнем воды</b><table class="noborder"><tr><td>Отметка уровня нижней межени (УНМ), м</td><td>${f(hy.unm)}</td></tr>
      <tr><td>ВИУ выше отметки «${esc(hy.viu.refName)}» (${f(hy.viu.refZ)} м) на, м</td><td>${f(sv.viuExcess)}</td></tr><tr><td>Год наблюдения ВИУ</td><td>${esc(hy.viu.year)}</td></tr></table>
      ${T(['Год', 'Превышение', 'Год', 'Превышение'], U.range(half, k => [ann[k].year, f(ann[k].P), ann[k + half]?.year ?? '', ann[k + half] ? f(ann[k + half].P) : '']))}
      <p>Отметка нуля водомерного поста, м &nbsp; <b>${f(B.hydrology.postZero(V))}</b>${hy.post.offsetKm ? `<br>Пост расположен в ${Math.abs(hy.post.offsetKm)} км ${hy.post.offsetKm > 0 ? 'ниже' : 'выше'} по течению от оси перехода` : ''}</p></div></div>
      <h4>Записи из истории наблюдений за уровнем воды в период навигации</h4>
      ${T(['Год', 'Длительность навигации, сут'].concat(hy.rsuT.map(q => 't = ' + q)), rsu.map(r => [r.year, r.navDays ?? ''].concat(hy.rsuT.map(q => f(r.values[q])))))}
      <p class="small" style="text-align:left">Максимальная отметка уровня воды при условии возможности прекращения навигации на t суток${hy.rsuConsecutive ? ' подряд' : ''}.</p>
      <h4>Дополнительные гидрологические сведения</h4><p>${esc(slopeTxt)}</p>
      <table><tr><th>Участок</th><th>Ландшафтная характеристика</th></tr><tr><td>Левая пойма</td><td>${esc(hy.morph.LP.text)}</td></tr><tr><td>Русло</td><td>${esc(hy.morph.R.text)}</td></tr><tr><td>Правая пойма</td><td>${esc(hy.morph.PP.text)}</td></tr></table>
      <h4>Метеорологические сведения</h4><table class="noborder"><tr><td>Расчетная скорость ветра, м/с</td><td>${f(hy.wind.v)}</td></tr><tr><td>Длина разгона ветровой волны, км</td><td>${f(hy.wind.fetch)}</td></tr></table><div class="foot">Страница 3 из 4</div></div>`;
    const L = V.geology.layers;
    const p4 = `<div class="sheet"><h2>4. Результаты инженерно-геологических изысканий</h2>
      ${T(['ИГУ', 'Описание грунта'], L.map(l => [l.no, B.SOILCAT.layerText(l, B.soilDb(V))]))}
      <p><b>Инженерно-геологический разрез по оси перехода</b></p>${svgG.outerHTML}<div class="foot">Страница 4 из 4</div></div>`;
    return p1 + p2 + p3 + p4;
  }

  /* ================= Шаблоны ================= */
  const tplLoad = () => { try { return JSON.parse(localStorage.getItem(TKEY) || '[]'); } catch (e) { return []; } };
  const tplSave = list => { try { localStorage.setItem(TKEY, JSON.stringify(list)); return true; } catch (e) { toast('Не сохранено: ' + e.message); return false; } };
  const KINDS = Object.assign({ full: { name: 'Всё задание' } }, B.schema.SECTIONS);
  function renderTpl() {
    const box = pane('tpl'), list = tplLoad();
    const name = h('input', { type: 'text', placeholder: 'Имя шаблона' }), kind = h('select', {});
    Object.entries(KINDS).forEach(([k, q]) => kind.appendChild(h('option', { value: k }, q.name)));
    const saveT = () => {
      const nm = name.value.trim(); if (!nm) return toast('Введите имя');
      const k = kind.value, ex = list.findIndex(q => q.name === nm && q.kind === k);
      if (ex >= 0 && !confirm(`Заменить шаблон «${nm}»?`)) return;
      const data = U.deepClone(k === 'full' ? V : KINDS[k].get(V)); if (k === 'full') data.hydro.series = [];
      const item = { name: nm, kind: k, created: new Date().toISOString(), data };
      if (ex >= 0) list[ex] = item; else list.push(item);
      if (tplSave(list)) { toast('Сохранено'); renderTpl(); }
    };
    const apply = q => change(() => { const d = U.deepClone(q.data);
      if (q.kind === 'full') V = B.dataio.fromPartial(d).v; else { KINDS[q.kind].set(V, d); if (q.kind !== 'tz') B.hydrology.generate(V); }
      topoCache = null; toast('Применён: ' + q.name); });
    const imp = h('input', { type: 'file', accept: '.json', class: 'hide' });
    imp.onchange = async () => { const fl = imp.files[0]; if (!fl) return; try { const o = JSON.parse(await fl.text()); const arr = Array.isArray(o) ? o : [o];
      arr.forEach(q => { if (!q.kind || !q.data) throw new Error('это не шаблон'); const it = { name: q.name, kind: q.kind, created: q.created || new Date().toISOString(), data: q.data }; const ex = list.findIndex(z => z.name === it.name && z.kind === it.kind); if (ex >= 0) list[ex] = it; else list.push(it); });
      tplSave(list); renderTpl(); toast('Импортировано: ' + arr.length); } catch (e) { toast('Ошибка: ' + e.message); } imp.value = ''; };
    box.append(card(null, h('div', { class: 'row' }, name, kind, btn('Сохранить', saveT, 'primary'), h('span', { class: 'sep' }), imp, btn('Импорт…', () => imp.click()),
      list.length ? btn('Экспорт всех', () => download('Шаблоны.json', JSON.stringify(list, null, 1), 'application/json')) : null),
      list.length ? tbl(['Имя', 'Раздел', 'Создан', ''], list.map((q, k) => h('tr', {}, h('td', {}, q.name), h('td', {}, KINDS[q.kind]?.name || q.kind), h('td', { class: 'note' }, new Date(q.created).toLocaleDateString('ru-RU')),
        h('td', { class: 'nowrap' }, btn('Применить', () => apply(q)), btn('⤓', () => download(`Шаблон_${q.name}.json`, JSON.stringify(q, null, 1), 'application/json'), null, 'Скачать файл'),
          btn('✕', () => { if (confirm(`Удалить «${q.name}»?`)) { list.splice(k, 1); tplSave(list); renderTpl(); } })))))
        : h('p', { class: 'note' }, 'Шаблонов нет. Сохраняется всё задание или раздел: геодезия, гидрометеорология, геология, ТЗ.')));
  }

  /* ---------- шапка ---------- */
  document.getElementById('btnUndo').onclick = undo;
  document.getElementById('btnRegen').onclick = () => {
    if (!confirm('Новый вариант по новому зерну: профиль, грунты и ряды будут заменены. Сведения о задании и ТЗ сохранятся.')) return;
    change(() => { const s = B.newSeed(); V.meta.seed = s; V.gen.profile.seed = s; V.geology.seed = s + 7; V.topo.seed = s + 13; V.hydro.regime.seedOffset = 0;
      P.generate(V); P.generateSoil(V); if (V.hydro.viu.auto) V.hydro.viu.z = null; V.hydro.viu.refZ = null; B.hydrology.generate(V); topoCache = null; });
    toast('Зерно ' + V.meta.seed);
  };
  document.getElementById('btnSave').onclick = () => download(fname('Вариант', 'json'), JSON.stringify(V, null, 1), 'application/json');
  document.getElementById('btnXlsx').onclick = exportXlsx;
  const fo = document.getElementById('fileOpen');
  document.getElementById('btnOpen').onclick = () => fo.click();
  fo.onchange = async () => {
    const fl = fo.files[0]; if (!fl) return;
    try {
      let res;
      if (/\.xlsx$/i.test(fl.name)) { const wb = new window.ExcelJS.Workbook(); await wb.xlsx.load(await fl.arrayBuffer()); res = B.dataio.parseDataWorkbook(wb); }
      else res = B.dataio.fromPartial(JSON.parse(await fl.text()));
      snapshot(); V = res.v; topoCache = null; commit();
      toast('Загружено' + (res.notes.length ? '; сгенерировано: ' + res.notes.join(', ') : ''));
    } catch (e) { console.error(e); toast('Ошибка: ' + e.message); }
    fo.value = '';
  };
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); undo(); } });

  V = load() || B.schema.defaultVariant(1);
  commit();
  window.__bca = { get V() { return V; }, renderTab };
})();
