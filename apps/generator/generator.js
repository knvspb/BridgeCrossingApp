/* Генератор задания — интерфейс. Данные — объект варианта (core/schema.js), вся логика — в core/. */
(function () {
  'use strict';
  const B = window.BCA, U = B.util, C = B.charts;
  const KEY = 'bca-generator-current-v1', TKEY = 'bca-templates-v1';
  const TABS = [['task', 'Задание и ТЗ'], ['geodesy', 'Геодезия'], ['geology', 'Геология'], ['hydro', 'Гидрология'], ['topo', 'Топография'], ['check', 'Проверка'], ['blank', 'Бланк и экспорт'], ['templates', 'Шаблоны']];
  let V = null, tab = 'task', mode = { kind: 'ground', layer: 0 }, hydroSel = 0, selStation = null, topoCache = null;
  const hist = [];

  /* ---------- утилиты DOM ---------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      const a = attrs[k];
      if (a == null || a === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), a);
      else if (k === 'class') e.className = a;
      else if (k === 'style') e.style.cssText = a;
      else if (k in e && k !== 'list') e[k] = a; else e.setAttribute(k, a);
    }
    kids.flat(Infinity).forEach(c => { if (c == null || c === false) return; e.appendChild(c instanceof Node ? c : document.createTextNode(String(c))); });
    return e;
  }
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2200); }
  function download(name, data, type) { const b = data instanceof Blob ? data : new Blob([data], { type }); const a = h('a', { href: URL.createObjectURL(b), download: name }); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  const fname = ext => `Задание_${String(V.meta.code || 'вариант').replace(/[\\/:*?"<>|]/g, '-')}${V.meta.student ? '_' + V.meta.student.split(' ')[0] : ''}.${ext}`;

  /* ---------- состояние ---------- */
  function save() { try { localStorage.setItem(KEY, JSON.stringify(V)); } catch (e) { console.warn(e); } }
  function load() { try { const t = localStorage.getItem(KEY); if (t) return B.schema.migrate(JSON.parse(t)); } catch (e) { console.warn(e); } return null; }
  function snapshot() { hist.push(JSON.stringify(V)); if (hist.length > 40) hist.shift(); }
  function undo() { if (!hist.length) return toast('Нечего отменять'); V = JSON.parse(hist.pop()); topoCache = null; commit(); }
  function commit(full = true) { save(); renderHeader(); renderTabs(); if (full) renderTab(); }
  /* Изменение поля: снимок для отмены → запись → перерисовка. */
  const change = (fn, full = true) => { snapshot(); fn(); commit(full); };

  /* ---------- поля ввода ---------- */
  function numF(get, set, o = {}) {
    const val = get(), inp = h('input', { type: 'number', step: o.step ?? 0.01, value: val ?? '', placeholder: o.ph ?? '', class: o.auto && o.auto() ? 'auto' : '', style: o.w ? `width:${o.w}px` : null, title: o.title });
    inp.addEventListener('change', () => change(() => set(U.num(inp.value)), o.full !== false));
    return inp;
  }
  function txtF(get, set, o = {}) { const inp = o.area ? h('textarea', { rows: o.rows, placeholder: o.ph ?? '' }) : h('input', { type: 'text', placeholder: o.ph ?? '' }); inp.value = get() ?? ''; inp.addEventListener('change', () => change(() => set(inp.value), o.full !== false)); return inp; }
  function selF(opts, get, set, o = {}) {
    const s = h('select', { style: o.w ? `width:${o.w}px` : null });
    opts.forEach(([v, t]) => s.appendChild(h('option', { value: v, selected: String(v) === String(get()) }, t)));
    s.addEventListener('change', () => change(() => set(s.value), o.full !== false)); return s;
  }
  function chkF(get, set, label) { const c = h('input', { type: 'checkbox', checked: !!get() }); c.addEventListener('change', () => change(() => set(c.checked))); return h('label', {}, c, ' ', label); }
  function kv(rows, cls = '') { return h('div', { class: 'kv ' + cls }, rows.filter(Boolean).map(([l, e, unit]) => [h('label', {}, l), h('span', {}, e, unit ? h('span', { class: 'unit' }, unit) : null)])); }
  const card = (title, ...kids) => h('div', { class: 'card' }, title ? h('h2', {}, title) : null, ...kids);
  const btn = (label, fn, cls) => h('button', { class: cls, onclick: fn }, label);

  /* ---------- шапка и вкладки ---------- */
  function renderHeader() {
    const w = B.profile.widths(V.geodesy);
    document.getElementById('hdrSub').textContent = `Вариант ${V.meta.code || '—'} · ${V.meta.student || 'студент не указан'} · ${w.n} створов, L = ${w.total} м · зерно ${V.meta.seed}`;
  }
  function renderTabs() {
    const nav = document.getElementById('tabs'); nav.innerHTML = '';
    const msgs = B.schema.validate(V), secOf = { task: 'ТЗ', geodesy: 'Геодезия', geology: 'Геология', hydro: 'Гидрология' };
    TABS.forEach(([id, name]) => {
      const sec = secOf[id], errs = msgs.filter(m => m.sec === sec && m.lvl === 'err').length, warns = msgs.filter(m => m.sec === sec && m.lvl === 'warn').length;
      const allErr = id === 'check' ? msgs.filter(m => m.lvl === 'err').length : 0;
      nav.appendChild(h('button', { class: id === tab ? 'on' : '', onclick: () => { tab = id; renderTabs(); TABS.forEach(([k]) => document.getElementById('tab-' + k).classList.toggle('hide', k !== tab)); renderTab(); } },
        name, errs || allErr ? h('span', { class: 'badge' }, errs || allErr) : warns ? h('span', { class: 'badge warn' }, warns) : null));
    });
  }
  function renderTab() { ({ task: renderTask, geodesy: renderGeodesy, geology: renderGeology, hydro: renderHydro, topo: renderTopo, check: renderCheck, blank: renderBlank, templates: renderTemplates })[tab](); }

  /* ================= 1. Задание и ТЗ ================= */
  function renderTask() {
    const box = document.getElementById('tab-task'); box.innerHTML = '';
    const m = V.meta, t = V.tz, N = V.geodesy.z.length;
    const meta = card('Сведения о задании', kv([
      ['Шифр варианта', txtF(() => m.code, x => m.code = x)], ['Номер варианта (столбец книги)', numF(() => m.variantNo, x => m.variantNo = x, { step: 1 })],
      ['ФИО студента', txtF(() => m.student, x => m.student = x)], ['Группа', txtF(() => m.group, x => m.group = x)],
      ['Курс', numF(() => m.course, x => m.course = x, { step: 1 })], ['Семестр', txtF(() => m.semester, x => m.semester = x)],
      ['Дисциплина', txtF(() => m.discipline, x => m.discipline = x)], ['Код направления подготовки', txtF(() => m.dirCode, x => m.dirCode = x)],
      ['Кафедра', txtF(() => m.department, x => m.department = x)], ['ФИО преподавателя', txtF(() => m.teacher, x => m.teacher = x)],
      ['Год (в именах файлов)', numF(() => m.year, x => m.year = x, { step: 1 })], ['Дата выдачи', h('input', { type: 'date', value: toISO(m.issueDate), onchange: e => change(() => m.issueDate = fromISO(e.target.value)) })]
    ], 'wide'),
      h('h3', {}, 'Цель проекта'), txtF(() => m.goal, x => m.goal = x, { area: true, rows: 2 }),
      h('h3', {}, 'Задачи проекта'), txtF(() => m.tasks, x => m.tasks = x, { area: true, rows: 5 }),
      h('h3', {}, 'Контрольные сроки'), h('div', {}, (m.deadlines || []).map((d, k) => h('div', { class: 'row' }, txtF(() => m.deadlines[k], x => m.deadlines[k] = x, { ph: `Срок ${k + 1}: этап — дата` })))));
    const road = card('1. Техническое задание: автомобильная дорога', kv([
      ['Категория дороги', selF(B.ROAD_CATEGORIES.map(c => [c, c]), () => t.roadCategory, x => t.roadCategory = x)],
      ['Количество полос движения', numF(() => t.lanes, x => t.lanes = x, { step: 1 })],
      ['Отметка по оси ПЧ в начале (створ 1)', numF(() => t.zRoadStart, x => t.zRoadStart = x), 'м'],
      [`Отметка по оси ПЧ в конце (створ ${N})`, numF(() => t.zRoadEnd, x => t.zRoadEnd = x), 'м'],
      ['Уровень ответственности', selF(Object.entries(B.IMPORTANCE), () => t.importance, x => t.importance = Number(x))],
      ['Район строительства / развитость района', txtF(() => t.region, x => t.region = x, { ph: 'например: Ленинградская обл., развитая дорожная сеть' })],
      ['Расчётная вероятность превышения (доля)', numF(() => t.prob, x => t.prob = x, { step: 0.0001 }), t.prob ? `= ${U.fmt(t.prob * 100, 2)} %` : ''],
      ['Дополнительная информация', txtF(() => t.addInfo, x => t.addInfo = x)]
    ], 'wide'));
    const nav = card('Судоходство', kv([['Класс реки по судоходству', selF(B.NAV_CLASSES.map(c => [c, c]), () => t.navClass, x => t.navClass = x)]], 'wide'),
      h('p', { class: 'note' }, 'Ряды уровней за навигацию и таблица для РСУ задаются во вкладке «Гидрология».'));
    const pts = t.axisPoints;
    const ptsTable = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Створ'), h('th', {}, 'Отметка ПЧ, м'), h('th', {}, 'Описание'), h('th', {}))),
      h('tbody', {}, pts.map((p, k) => h('tr', {},
        h('td', {}, numF(() => p.st, x => p.st = U.clamp(Math.round(x ?? 1), 1, N), { step: 1, w: 70 })), h('td', {}, numF(() => p.z, x => p.z = x, { w: 90 })),
        h('td', {}, txtF(() => p.label, x => p.label = x)), h('td', {}, btn('✕', () => change(() => pts.splice(k, 1))))))));
    const axis = card('Характерные точки оси дороги на подходах (п. 16)',
      h('p', { class: 'note' }, 'Точки на берегах вне пойм. На профиле они соединяются пунктиром; положение оси на поймах и в русле определяет студент.'),
      ptsTable, h('div', { class: 'row' }, btn('+ Точка', () => change(() => pts.push({ st: 1, z: t.zRoadStart, label: '' }))),
        btn('Взять отметки начала и конца из точек', () => change(() => { const s = pts.slice().sort((a, b) => a.st - b.st); if (s.length) { t.zRoadStart = s[0].z; t.zRoadEnd = s[s.length - 1].z; } }))));
    box.append(h('div', { class: 'grid-half' }, h('div', {}, meta), h('div', {}, road, nav, axis)));
  }
  const toISO = s => { const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
  const fromISO = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? `${m[3]}.${m[2]}.${m[1]}` : ''; };

  /* ================= общий разрез с рисованием ================= */
  function profileCard(modes) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'chart draw');
    const bar = h('div', { class: 'row' }, h('span', { class: 'note' }, 'Рисование:'));
    const legend = h('div', { class: 'legend' });
    let view = null;
    const draw = () => {
      view = C.profile(svg, V, { mode, sel: selStation });
      legend.innerHTML = '';
      V.geology.layers.forEach((l, k) => { const s = B.SOILS.find(q => q.code === l.code); legend.appendChild(h('span', {}, h('i', { style: `background:${C.LAYER_COLORS[k % C.LAYER_COLORS.length]}` }), `ИГУ ${l.no}: ${s ? s.name + (s.sub ? ', ' + s.sub.toLowerCase() : '') : 'код ?'}`)); });
    };
    modes.forEach(([label, kind, layer]) => bar.appendChild(h('button', { class: mode.kind === kind && (kind === 'ground' || mode.layer === layer) ? 'on' : '', onclick: () => { mode = { kind, layer }; renderTab(); } }, label)));
    bar.appendChild(h('span', { class: 'note' }, ' — зажмите кнопку мыши и ведите по разрезу'));
    let drag = null;
    const pos = ev => { const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const p = pt.matrixTransform(svg.getScreenCTM().inverse()); return { x: view.ix(p.x), z: view.iy(p.y) }; };
    const nearest = xv => { let b = 0; view.x.forEach((q, i) => { if (Math.abs(q - xv) < Math.abs(view.x[b] - xv)) b = i; }); return b; };
    const prec = V.gen.profile.precision ?? 2;
    const applyAt = (i, zv) => {
      if (mode.kind === 'ground') V.geodesy.z[i] = U.round(zv, prec);
      else if (mode.kind === 'top') { const l = V.geology.layers[mode.layer]; if (!l) return; const t = U.r2(Math.min(zv, V.geodesy.z[i])); l.tops[i] = t <= V.geology.ubv ? null : t; }
      else if (mode.kind === 'erase') { const l = V.geology.layers[mode.layer]; if (l) l.tops[i] = null; }
    };
    svg.addEventListener('pointerdown', ev => { if (!view || !modes.length) return; snapshot(); svg.setPointerCapture(ev.pointerId); const p = pos(ev), i = nearest(p.x); applyAt(i, p.z); drag = { i, z: p.z }; draw(); });
    svg.addEventListener('pointermove', ev => { if (!drag) return; const p = pos(ev), i = nearest(p.x), a = drag.i, n = Math.abs(i - a);
      for (let s = 0; s <= n; s++) { const j = a + Math.sign(i - a) * s; applyAt(j, drag.z + (p.z - drag.z) * (n ? s / n : 1)); }
      drag = { i, z: p.z }; draw(); });
    const end = () => { if (!drag) return; drag = null; if (mode.kind === 'ground') B.profile.clampTops(V); commit(); };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    draw();
    return card(null, modes.length ? bar : null, svg, legend);
  }

  /* ================= 2. Геодезия ================= */
  function renderGeodesy() {
    const box = document.getElementById('tab-geodesy'); box.innerHTML = '';
    const g = V.geodesy, w = B.profile.widths(g), p = V.gen.profile, N = g.z.length;
    const pend = { LP: w.LP, R: w.R, PP: w.PP };
    const wIn = k => { const i = h('input', { type: 'number', step: 10, value: pend[k] }); i.oninput = () => { pend[k] = U.num(i.value); upd(); }; return i; };
    const est = h('div', { class: 'note' });
    const upd = () => { const n = Math.round(pend.LP / g.stepLP) + Math.round(pend.R / g.stepR) + Math.round(pend.PP / g.stepPP) + 1; est.textContent = `После перестроения: ${n} створов (${Math.round(pend.LP / g.stepLP)} + ${Math.round(pend.R / g.stepR)} + ${Math.round(pend.PP / g.stepPP)} интервалов)${n === 71 ? ' — как в старом задании' : ''}.`; };
    upd();
    const steps = card('Шаги и створы (п. 1)',
      kv([['Шаг нивелировки левой поймы', numF(() => g.stepLP, x => { if (x > 0) g.stepLP = x; }), 'м'], ['Шаг промеров глубин в русле', numF(() => g.stepR, x => { if (x > 0) g.stepR = x; }), 'м'], ['Шаг нивелировки правой поймы', numF(() => g.stepPP, x => { if (x > 0) g.stepPP = x; }), 'м']]),
      h('p', { class: 'note' }, 'Изменение шага при том же числе створов меняет ширины. Чтобы задать ширины, введите их ниже и перестройте створы (форма профиля сохраняется).'),
      kv([['Ширина левой поймы', wIn('LP'), 'м'], ['Ширина русла', wIn('R'), 'м'], ['Ширина правой поймы', wIn('PP'), 'м']]), est,
      h('div', { class: 'row' }, btn('Перестроить створы', () => change(() => B.profile.setWidths(V, pend.LP, pend.R, pend.PP)), 'primary')),
      h('div', { class: 'ctrl' }, 'Створов', h('b', {}, w.n), 'Общая длина', h('b', {}, w.total + ' м'), 'Левая пойма', h('b', {}, `${w.LP} м (${w.nLP})`), 'Русло', h('b', {}, `${w.R} м (${w.nR})`), 'Правая пойма', h('b', {}, `${w.PP} м (${w.nPP})`), 'Бровки', h('b', {}, `ств. ${g.iL + 1} и ${g.iR + 1}`)));
    const levels = card('Уровни воды на профиле (п. 2, 6)', kv([
      ['Уровень нижней межени (УНМ)', numF(() => V.hydro.unm, x => V.hydro.unm = x == null ? null : U.r1(x), { step: 0.1 }), 'м'],
      ['Уровень воды на дату изысканий = ноль измерения глубин', numF(() => g.surveyLevel, x => g.surveyLevel = x), 'м'],
      ['Точность отметок профиля', selF([[1, '0,1 м'], [2, '0,01 м']], () => p.precision ?? 2, x => { p.precision = Number(x); g.z = g.z.map(q => U.round(q, p.precision)); })]
    ]), h('p', { class: 'note' }, 'Студент получает промеры глубин русла от этого уровня (таблица ниже, столбец «Глубина»).'));
    const gen = card('Генератор профиля', kv([
      ['Зерно', h('span', {}, numF(() => p.seed, x => p.seed = x | 0, { step: 1, w: 80 }), ' ', btn('🎲', () => change(() => { p.seed = B.newSeed(); B.profile.generate(V); })))],
      ['Левый край (коренной берег)', numF(() => p.zEdgeL, x => p.zEdgeL = x), 'м'], ['Левая бровка', numF(() => p.zBankL, x => p.zBankL = x), 'м'],
      ['Форма левого склона', numF(() => p.shapeL, x => p.shapeL = x, { step: 0.1 })], ['Неровность левой поймы', numF(() => p.noiseL, x => p.noiseL = x, { step: 0.1 }), 'м'],
      ['Старица слева: глубина / положение 0…1', h('span', {}, numF(() => p.oxL, x => p.oxL = x, { step: 0.1, w: 60 }), ' ', numF(() => p.oxPosL, x => p.oxPosL = x, { step: 0.05, w: 60 }))],
      ['Тальвег: отметка', numF(() => p.zThal, x => p.zThal = x), 'м'], ['Тальвег: положение 0…1', numF(() => p.thalPos, x => p.thalPos = x, { step: 0.05 })],
      ['Полнота сечения русла', numF(() => p.shapeC, x => p.shapeC = x, { step: 0.1 })], ['Неровность дна', numF(() => p.noiseC, x => p.noiseC = x, { step: 0.1 }), 'м'],
      ['Правая бровка', numF(() => p.zBankR, x => p.zBankR = x), 'м'], ['Правый край', numF(() => p.zEdgeR, x => p.zEdgeR = x), 'м'],
      ['Форма правого склона', numF(() => p.shapeR, x => p.shapeR = x, { step: 0.1 })], ['Неровность правой поймы', numF(() => p.noiseR, x => p.noiseR = x, { step: 0.1 }), 'м'],
      ['Старица справа: глубина / положение 0…1', h('span', {}, numF(() => p.oxR, x => p.oxR = x, { step: 0.1, w: 60 }), ' ', numF(() => p.oxPosR, x => p.oxPosR = x, { step: 0.05, w: 60 }))]
    ], ''), h('div', { class: 'row' }, btn('Сгенерировать профиль', () => change(() => B.profile.generate(V)), 'primary')),
      h('p', { class: 'note' }, 'Параметры применяются по кнопке. Отметки можно также рисовать мышью на разрезе или править в таблице.'));
    const x = B.profile.stationX(g), dep = {}; B.profile.depths(V).forEach(d => dep[d.i] = d.h);
    const tb = h('tbody', {});
    for (let i = 0; i < N; i++) {
      const tr = h('tr', { class: 'z-' + B.profile.zoneKey(g, i) + (selStation === i ? ' sel' : '') },
        h('td', {}, i + 1), h('td', {}, B.profile.zoneOf(g, i)), h('td', { class: 'num' }, Math.round(x[i])),
        h('td', {}, numF(() => g.z[i], z => { if (z != null) { g.z[i] = z; B.profile.clampTops(V); } })),
        h('td', { class: 'num' }, i >= g.iL && i <= g.iR ? U.fmt(dep[i]) : ''),
        h('td', {}, txtF(() => g.comments?.[i] ?? '', s => { g.comments = g.comments || {}; if (s) g.comments[i] = s; else delete g.comments[i]; }, { ph: i === 0 ? 'Левый берег' : i === g.iL || i === g.iR ? 'Русло' : i === N - 1 ? 'Правый берег' : '' })));
      tr.addEventListener('mouseenter', () => { selStation = i; }); tb.appendChild(tr);
    }
    const table = card('Отметки по створам', h('p', { class: 'note' }, 'Комментарии попадают в бланк (пустые — по умолчанию: берега и бровки).'),
      h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, ['Створ', 'Зона', 'x, м', 'Отметка, м', 'Глубина, м', 'Комментарий'].map(t => h('th', {}, t)))), tb)));
    box.append(h('div', { class: 'grid2' }, h('div', {}, steps, levels, gen), h('div', {}, profileCard([['Поверхность', 'ground', 0]]), table)));
  }

  /* ================= 3. Геология ================= */
  function renderGeology() {
    const box = document.getElementById('tab-geology'); box.innerHTML = '';
    const geo = V.geology, L = geo.layers, N = V.geodesy.z.length;
    const params = card('Генератор грунтов (п. 4)', kv([
      ['Условный низ нижнего ИГУ', numF(() => geo.ubv, x => geo.ubv = x, { step: 0.5 }), 'м'],
      ['Плавность слоёв (створов на «волну»)', numF(() => geo.corr, x => geo.corr = U.clamp(x ?? 10, 2, 40), { step: 1 })],
      ['Зерно', h('span', {}, numF(() => geo.seed, x => geo.seed = x | 0, { step: 1, w: 80 }), ' ', btn('🎲', () => change(() => { geo.seed = B.newSeed(); B.profile.generateSoil(V); })))]
    ]), h('div', { class: 'row' }, btn('Сгенерировать грунты', () => change(() => B.profile.generateSoil(V)), 'primary')),
      h('p', { class: 'note' }, 'Слои укладываются по столбцу «Залег.» (1 — верхний), мощность = «Мощн.» × (1 ± «Изменч.»), линзы ограничены створами. Нижний слой доводится до условного низа. Кровли можно рисовать на разрезе.'));
    const soilSel = l => { const s = h('select', { style: 'width:260px' }); B.SOILS.forEach(o => s.appendChild(h('option', { value: o.code, selected: o.code === l.code }, `${o.code}. ${o.name}${o.sub ? ' — ' + o.sub : ''}${o.ch1 ? ' (' + o.ch1 + ')' : ''}`))); s.onchange = () => change(() => l.code = Number(s.value)); return s; };
    const rows = L.map((l, k) => { const s = B.SOILS.find(q => q.code === l.code);
      return h('tr', {}, h('td', {}, h('span', { class: 'sw', style: `background:${C.LAYER_COLORS[k % C.LAYER_COLORS.length]}` })),
        h('td', {}, txtF(() => l.no, x => l.no = x)), h('td', {}, soilSel(l)), h('td', {}, s ? s.type : ''), h('td', { class: 'note' }, s ? s.v.map(q => U.fmt(q)).join(' / ') : ''),
        h('td', {}, numF(() => l.gen.order ?? k + 1, x => l.gen.order = x ?? k + 1, { step: 1, w: 50 })), h('td', {}, numF(() => l.gen.t, x => l.gen.t = x ?? 0, { step: 0.5, w: 60 })),
        h('td', {}, numF(() => l.gen.var, x => l.gen.var = U.clamp(x ?? 0, 0, 1.5), { step: 0.1, w: 55 })),
        h('td', {}, h('span', {}, chkF(() => l.gen.lens, x => l.gen.lens = x, ''), numF(() => l.gen.from, x => l.gen.from = U.clamp(x ?? 1, 1, N), { step: 1, w: 55 }), '–', numF(() => l.gen.to, x => l.gen.to = U.clamp(x ?? N, 1, N), { step: 1, w: 55 }))),
        h('td', {}, btn('↑', () => change(() => { [L[k - 1], L[k]] = [L[k], L[k - 1]]; }), null), btn('↓', () => change(() => { [L[k + 1], L[k]] = [L[k], L[k + 1]]; })), btn('✕', () => change(() => { L.splice(k, 1); mode = { kind: 'ground', layer: 0 }; }))));
    });
    rows.forEach((r, k) => { const [up, dn] = r.lastChild.querySelectorAll('button'); up.disabled = k === 0; dn.disabled = k === L.length - 1; });
    const layers = card('ИГУ — библиотека грунтов (44 позиции)', h('div', { style: 'overflow:auto' }, h('table', {}, h('thead', {}, h('tr', {}, ['', '№ ИГУ', 'Грунт', 'Тип', 'vнр при h = 0,4/1/2/3/5/10 м', 'Залег.', 'Мощн., м', 'Изменч.', 'Линза: створы', ''].map(t => h('th', {}, t)))), h('tbody', {}, rows))),
      h('div', { class: 'row' }, btn('+ Добавить ИГУ', () => change(() => L.push({ no: String(L.length + 1), code: 20, tops: new Array(N).fill(null), gen: { t: 3, var: 0.3, lens: false, from: 1, to: N, order: Math.max(0, ...L.map(l => l.gen.order || 0)) + 1 } }))),
        h('span', { class: 'note' }, `Слоёв: ${L.length}. Для выгрузки в столбец старой книги — не более 9.`)));
    const modes = [['Поверхность', 'ground', 0]].concat(L.map((l, k) => ['Кровля ИГУ ' + l.no, 'top', k]));
    if (L.length) { const sel = mode.kind !== 'ground' && L[mode.layer] ? mode.layer : 0; modes.push(['Ластик ИГУ ' + L[sel].no, 'erase', sel]); }
    const tb = h('tbody', {});
    for (let i = 0; i < N; i++) tb.appendChild(h('tr', { class: 'z-' + B.profile.zoneKey(V.geodesy, i) }, h('td', {}, i + 1), h('td', { class: 'num' }, U.fmt(V.geodesy.z[i])),
      L.map(l => h('td', {}, numF(() => l.tops[i], x => { l.tops[i] = x == null || x === 0 ? null : U.r2(Math.min(x, V.geodesy.z[i])); }, { w: 76 })))));
    const tops = card('Отметки кровли ИГУ по створам', h('p', { class: 'note' }, 'Пустая ячейка — слоя на створе нет.'),
      h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Створ'), h('th', {}, 'Поверхность'), L.map(l => h('th', {}, 'ИГУ ' + l.no)))), tb)));
    box.append(h('div', { class: 'grid2' }, h('div', {}, params), h('div', {}, profileCard(modes), layers, tops)));
  }

  /* ================= 4. Гидрология ================= */
  function renderHydro() {
    const box = document.getElementById('tab-hydro'); box.innerHTML = '';
    const hy = V.hydro, r = hy.regime, post = hy.post, lib = V.library.roughness, auto = B.hydrology.autoLevels(V), sv = B.hydrology.studentView(V);
    const stale = hy.series.length && hy.seriesStamp && hy.seriesStamp !== B.hydrology.stamp(V);
    const regen = () => change(() => B.hydrology.generate(V));
    const posts = card('Водомерный пост и уровни (п. 7, 8)', kv([
      ['УНМ', numF(() => hy.unm, x => hy.unm = x == null ? null : U.r1(x), { step: 0.1 }), 'м'],
      ['Название поста', txtF(() => post.name, x => post.name = x)],
      ['Удаление поста от оси перехода (+ ниже по течению)', numF(() => post.offsetKm, x => post.offsetKm = x ?? 0, { step: 0.1 }), 'км'],
      ['Отметка нуля поста', numF(() => post.zero, x => post.zero = x, { auto: () => post.zero == null, ph: 'авто: ' + U.fmt(B.hydrology.postZero(V)) }), post.zero == null ? 'м (УНМ − 2 м)' : 'м'],
      ['Первый год наблюдений', numF(() => post.firstYear, x => post.firstYear = x | 0, { step: 1 })],
      ['Продолжительность наблюдений (число лет)', numF(() => post.nYears, x => post.nYears = U.clamp(x | 0, 3, 100), { step: 1 })],
      ['min УВВ за историю наблюдений', numF(() => r.zLo, x => r.zLo = x, { auto: () => r.zLo == null, ph: 'авто ' + U.fmt(auto.zLo) }), r.zLo != null ? `м (П = ${U.fmt(B.hydrology.toPost(V, r.zLo) - B.hydrology.postZero(V))})` : 'м'],
      ['max УВВ за историю наблюдений', numF(() => r.zHi, x => r.zHi = x, { auto: () => r.zHi == null, ph: 'авто ' + U.fmt(auto.zHi) }), r.zHi != null ? `м (П = ${U.fmt(B.hydrology.toPost(V, r.zHi) - B.hydrology.postZero(V))})` : 'м']
    ], 'wide'), post.offsetKm ? h('p', { class: 'note' }, `Уровни на посту отличаются от уровней на оси на i·L = ${U.fmt(hy.slope.i * post.offsetKm * 1000)} м — студент выполняет перенос (параллельный перенос по уклону).`) : null,
      h('h3', {}, 'Высокий исторический уровень (ВИУ)'),
      kv([['Отметка ВИУ (на оси перехода)', numF(() => hy.viu.z, x => { hy.viu.z = x; hy.viu.auto = x == null; }, { auto: () => hy.viu.auto }), 'м'], ['Год наблюдения ВИУ', numF(() => hy.viu.year, x => hy.viu.year = x | 0, { step: 1 })],
        ['Известный объект (для студента)', txtF(() => hy.viu.refName, x => hy.viu.refName = x)], ['Отметка объекта', numF(() => hy.viu.refZ, x => hy.viu.refZ = x), 'м'],
        ['Студент получит: ВИУ выше объекта на', h('b', {}, sv.viuExcess != null ? U.fmt(sv.viuExcess) + ' м' : '—')]], 'wide'));
    const slope = card('Уклон реки (п. 5)', kv([
      ['Продольный уклон i', numF(() => hy.slope.i, x => hy.slope.i = x, { step: 0.00001 })],
      ['Как выдать студенту', selF([['value', 'числом'], ['twoLevels', 'задачей: два уреза на известном расстоянии']], () => hy.slope.studentMode, x => hy.slope.studentMode = x)],
      hy.slope.studentMode === 'twoLevels' ? ['Расстояние между урезами', numF(() => hy.slope.Lkm, x => hy.slope.Lkm = x, { auto: () => hy.slope.Lkm == null, ph: 'авто ' + (sv.slopeTask?.Lkm ?? '') }), 'км'] : null,
      sv.slopeTask ? ['Урезы (выше / ниже по течению)', h('b', {}, `${U.fmt(sv.slopeTask.zUp)} / ${U.fmt(sv.slopeTask.zDown)} м → i = ${sv.slopeCheck}`)] : null
    ], 'wide'), sv.slopeTask && Math.abs(sv.slopeCheck - hy.slope.i) / hy.slope.i > 0.05 ? h('p', { class: 'warnnote' }, 'Округление отметок до 0,01 м искажает уклон более чем на 5 % — увеличьте расстояние.') : null);
    const morphRow = (k, label) => {
      const zone = k === 'R' ? 'channel' : 'floodplain', cur = hy.morph[k];
      const s = h('select', { style: 'width:100%' }); lib.filter(q => q.zone === zone).forEach(q => s.appendChild(h('option', { value: q.id, selected: q.id === cur.id }, `${q.m ?? '?'} — ${q.text}`)));
      s.onchange = () => change(() => { const q = lib.find(o => o.id === s.value); hy.morph[k] = { id: q.id, m: q.m, text: q.text }; });
      const q = lib.find(o => o.id === cur.id);
      return [label, h('div', {}, s, h('div', { class: 'row' }, 'm = ', numF(() => cur.m, x => cur.m = x, { step: 1, w: 70 }), q && !q.verified ? h('span', { class: 'pill unv', title: q.src }, 'не сверено') : h('span', { class: 'pill' }, 'проверено')))];
    };
    const libRows = lib.map((q, k) => h('tr', {}, h('td', {}, selF([['floodplain', 'пойма'], ['channel', 'русло']], () => q.zone, x => q.zone = x, { w: 90 })), h('td', {}, numF(() => q.m, x => q.m = x, { step: 1, w: 60 })),
      h('td', {}, txtF(() => q.text, x => q.text = x)), h('td', {}, chkF(() => q.verified, x => q.verified = x, '')), h('td', {}, btn('✕', () => change(() => lib.splice(k, 1))))));
    const morph = card('Морфометрия: ландшафт и шероховатость m = 1/n (п. 5)', kv([morphRow('LP', 'Левая пойма'), morphRow('R', 'Русло'), morphRow('PP', 'Правая пойма')], 'wide'),
      h('details', {}, h('summary', {}, 'Справочник ландшафтных характеристик'),
        h('p', { class: 'warnnote' }, 'Проверены только строки из расчётной книги. Внесите таблицу методички (Срибный) — справочник сохраняется в варианте и в шаблоне раздела «Гидрометеорология».'),
        h('table', {}, h('thead', {}, h('tr', {}, ['Участок', 'm', 'Характеристика', 'Сверено', ''].map(t => h('th', {}, t)))), h('tbody', {}, libRows)),
        btn('+ Строка', () => change(() => lib.push({ id: 'u' + Date.now(), zone: 'floodplain', m: null, verified: false, src: 'добавлено пользователем', text: '' })))));
    const feedOpts = Object.entries(B.RIVER_FEED).map(([k, q]) => [k, q.name]), landOpts = Object.entries(B.RIVER_LANDSCAPE).map(([k, q]) => [k, `${q.name} (i ${q.slope[0]}…${q.slope[1]})`]);
    const land = B.RIVER_LANDSCAPE[r.landscape];
    const regime = card('Тип реки и генерация годовых графиков (п. 9–10)', kv([
      ['Тип питания', selF(feedOpts, () => r.feed, x => r.feed = x)], ['Ландшафт', selF(landOpts, () => r.landscape, x => r.landscape = x)],
      ['Заторы льда при вскрытии', chkF(() => r.iceJams, x => r.iceJams = x, 'добавлять (≈40 % лет)')],
      ['Cv годовых максимумов расхода', numF(() => r.Cv, x => r.Cv = U.clamp(x ?? 0.3, 0.05, 1.5), { step: 0.05 })], ['Cs/Cv', numF(() => r.CsCv, x => r.CsCv = x ?? 2, { step: 0.5 })],
      ['Навигация: средняя длительность / разброс', h('span', {}, numF(() => r.navMean, x => r.navMean = x ?? 180, { step: 1, w: 60 }), ' / ', numF(() => r.navSd, x => r.navSd = x ?? 9, { step: 1, w: 50 }), h('span', { class: 'unit' }, 'сут'))],
      ['Вариация ряда (смещение зерна)', h('span', {}, numF(() => r.seedOffset, x => r.seedOffset = x | 0, { step: 1, w: 60 }), ' ', btn('🎲', () => change(() => { r.seedOffset = B.newSeed(); B.hydrology.generate(V); })))]
    ], 'wide'), land && (hy.slope.i < land.slope[0] || hy.slope.i > land.slope[1]) ? h('p', { class: 'warnnote' }, `Уклон ${hy.slope.i} вне диапазона для ландшафта «${land.name}» (${land.slope[0]}…${land.slope[1]}).`) : null,
      h('div', { class: 'row' }, btn('Сгенерировать ряды уровней', regen, 'primary'), stale ? h('span', { class: 'warnnote' }, 'Профиль или параметры изменились после генерации — перегенерируйте ряды.') : null),
      h('details', {}, h('summary', {}, 'Как устроена модель'), h('p', { class: 'note' },
        'Годовые максимумы расхода — выборка Пирсона III (Cv, Cs), растянутая так, чтобы min и max годовых УВВ совпали с заданными. Внутригодовой ход — межень + волны формы Г.А. Алексеева y = 10^(−a(1−x)²/x); состав волн — по типу питания (пособие, рис. 2.2–2.3), длительность — по ландшафту. Уровни — из расходов по кривой Q(Z) створа (Маннинг, m по участкам, уклон i), поэтому ряды согласованы с профилем. Подробнее — docs/HYDROLOGY_MODEL.md.')));
    const rsuIn = h('input', { type: 'text', value: hy.rsuT.join(', '), style: 'width:160px' });
    rsuIn.onchange = () => change(() => { const t = rsuIn.value.split(/[;,\s]+/).map(Number).filter(q => Number.isFinite(q) && q >= 0).map(q => Math.round(q)); if (t.length) hy.rsuT = [...new Set(t)].sort((a, b) => a - b); });
    const rsuCard = card('Навигация и РСУ (п. 12, 14)', kv([['t, суток (через запятую)', h('span', {}, rsuIn, ' ', btn('2,3,5,10,15', () => change(() => hy.rsuT = [2, 3, 5, 10, 15])), ' ', btn('1,5,10,15,20', () => change(() => hy.rsuT = [1, 5, 10, 15, 20])))],
      ['Исключаемые сутки', selF([['1', 'идут подряд (одно окно)'], ['0', 'любые t суток в сумме']], () => hy.rsuConsecutive ? '1' : '0', x => hy.rsuConsecutive = x === '1')]], 'wide'),
      h('p', { class: 'note' }, 'В таблицу идёт наибольший уровень за навигацию, если навигацию допускается прекратить на t суток с наивысшими уровнями.'));
    const meteo = card('Метеорология (п. 13)', kv([['Расчётная скорость ветра', numF(() => hy.wind.v, x => hy.wind.v = x), 'м/с'], ['Длина разгона ветровой волны', numF(() => hy.wind.fetch, x => hy.wind.fetch = x), 'км']]));

    // правая колонка — графики и таблицы
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'chart');
    const ser = hy.series; hydroSel = U.clamp(hydroSel, 0, Math.max(0, ser.length - 1));
    const ysel = h('select', {}); ser.forEach((s, j) => ysel.appendChild(h('option', { value: j, selected: j === hydroSel }, `${s.year}${s.jam ? ' (затор)' : ''}`)));
    ysel.onchange = () => { hydroSel = Number(ysel.value); C.hydrograph(svg, V, hydroSel, { W: 720, H: 300 }); };
    const ann = B.hydrology.annualTable(V), rsu = B.hydrology.rsuTable(V);
    const annT = h('table', {}, h('thead', {}, h('tr', {}, ['Год', 'УВВ на оси, м', 'УВВ на посту, м', 'Превышение П, м', 'Дата max', ''].map(t => h('th', {}, t)))),
      h('tbody', {}, ann.map((a, j) => h('tr', { class: j === hydroSel ? 'sel' : '', onclick: () => { hydroSel = j; renderHydro(); } }, h('td', {}, a.year), h('td', { class: 'num' }, U.fmt(a.zMax)), h('td', { class: 'num' }, U.fmt(a.zPost)), h('td', { class: 'num' }, U.fmt(a.P)), h('td', {}, dayStr(a.dMax)), h('td', { class: 'note' }, a.jam ? 'затор' : '')))));
    const rsuT = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Год'), h('th', {}, 'Навигация, сут'), h('th', {}, 'Период'), hy.rsuT.map(t => h('th', { class: 'num' }, 't = ' + t)))),
      h('tbody', {}, rsu.map(rw => h('tr', {}, h('td', {}, rw.year), h('td', { class: 'num' }, rw.navDays), h('td', { class: 'note' }, dayStr(rw.navStart) + '–' + dayStr(rw.navStart + rw.navDays - 1)), hy.rsuT.map(t => h('td', { class: 'num' }, U.fmt(rw.values[t])))))));
    const zs = ann.map(a => a.zMax);
    const stats = ser.length ? h('div', { class: 'ctrl' }, 'Лет', h('b', {}, ser.length), 'Ноль поста', h('b', {}, U.fmt(B.hydrology.postZero(V))), 'min / max УВВ', h('b', {}, `${U.fmt(Math.min(...zs))} / ${U.fmt(Math.max(...zs))}`), 'ВИУ', h('b', {}, U.fmt(hy.viu.z))) : null;
    const right = h('div', {}, card('Годовые графики уровней (п. 10)', h('div', { class: 'row' }, 'Год: ', ysel, h('span', { class: 'note' }, 'зелёным — период навигации; тонкие линии — остальные годы')), svg, stats),
      card('Таблица превышений годовых максимумов (п. 11)', h('div', { class: 'scroll' }, annT), h('div', { class: 'row' }, btn('CSV', () => download('Превышения.csv', B.exporter.toCSV(['Год', 'УВВ на оси', 'УВВ на посту', 'Превышение П'], ann.map(a => [a.year, a.zMax, a.zPost, a.P])), 'text/csv')))),
      card('Таблица для РСУ: max уровень при прекращении навигации на t суток (п. 12)', h('div', { class: 'scroll' }, rsuT),
        h('div', { class: 'row' }, btn('CSV', () => download('РСУ.csv', B.exporter.toCSV(['Год', 'Навигация, сут'].concat(hy.rsuT.map(t => 't=' + t)), rsu.map(rw => [rw.year, rw.navDays].concat(hy.rsuT.map(t => rw.values[t])))), 'text/csv')))));
    box.append(h('div', { class: 'grid-half' }, h('div', {}, posts, slope, morph, regime, rsuCard, meteo), right));
    C.hydrograph(svg, V, hydroSel, { W: 720, H: 300 });
  }
  const dayStr = d => { const dt = new Date(Date.UTC(2001, 0, 1 + d)); return String(dt.getUTCDate()).padStart(2, '0') + '.' + String(dt.getUTCMonth() + 1).padStart(2, '0'); };

  /* ================= 5. Топография ================= */
  function renderTopo() {
    const box = document.getElementById('tab-topo'); box.innerHTML = '';
    const t = V.topo, w = B.profile.widths(V.geodesy);
    const cv = h('canvas', { class: 'topo', width: 640, height: 640 });
    const info = h('div', { class: 'note' });
    const build = () => { topoCache = B.topo.generate(V); paintTopo(cv, topoCache); info.textContent = `Сетка ${topoCache.n} × ${topoCache.n} = ${topoCache.points.length} точек, шаг ${topoCache.step} м, сторона ${Math.round(topoCache.L)} м.`; };
    const params = card('Топоповерхность по профилю (п. 17)', kv([
      ['Радиус кривизны реки в плане', numF(() => t.radius, x => { t.radius = x ?? 0; topoCache = null; }, { step: 500 }), 'м'],
      ['Сторона квадрата', numF(() => t.size, x => { t.size = x; topoCache = null; }, { auto: () => t.size == null, ph: 'авто ' + w.total, step: 50 }), 'м'],
      ['Шаг сетки точек', numF(() => t.gridStep, x => { t.gridStep = U.clamp(x ?? 10, 1, 200); topoCache = null; }, { step: 1 }), 'м'],
      ['Амплитуда неровностей пойм', numF(() => t.amp, x => { t.amp = x ?? 0; topoCache = null; }, { step: 0.1 }), 'м'],
      ['Зерно', h('span', {}, numF(() => t.seed, x => { t.seed = x | 0; topoCache = null; }, { step: 1, w: 80 }), ' ', btn('🎲', () => change(() => { t.seed = B.newSeed(); topoCache = null; })))]
    ], 'wide'),
      h('p', { class: 'note' }, '0 — река прямая, рельеф получает только небольшие случайные холмы и впадины. R > 0 — изгиб влево с радиусом R, R < 0 — вправо; у вогнутого берега русло глубже. Ось дороги — центральная ось квадрата (Y = 0), сечение по ней совпадает с профилем задания. Ось Y направлена по течению, уклон долины учитывается.'),
      h('div', { class: 'row' }, btn('Построить', build, 'primary'), btn('Скачать облако точек (CSV)', () => { if (!topoCache) build(); download(`Топоповерхность_${V.meta.code.replace(/\//g, '-')}.csv`, '﻿' + B.topo.toCSV(topoCache), 'text/csv'); }),
        btn('CSV с точкой', () => { if (!topoCache) build(); download(`Топоповерхность_${V.meta.code.replace(/\//g, '-')}_dot.csv`, B.topo.toCSV(topoCache, ',', false), 'text/csv'); })), info);
    box.append(h('div', { class: 'grid2' }, params, card('План (отмывка по высоте)', cv, h('p', { class: 'note' }, 'Коричневый — высокие отметки, синий — ниже УНМ; пунктир — ось дороги.'))));
    build();
  }
  function paintTopo(cv, res) {
    const ctx = cv.getContext('2d'), n = res.n, W = cv.width, cell = W / n, zs = res.points.map(p => p[2]);
    const lo = Math.min(...zs), hi = Math.max(...zs), unm = V.hydro.unm;
    const col = z => { if (z < unm) { const t = U.clamp((unm - z) / Math.max(0.5, unm - lo), 0, 1); return `rgb(${Math.round(140 - 90 * t)},${Math.round(185 - 80 * t)},${Math.round(230 - 40 * t)})`; }
      const t = U.clamp((z - unm) / (hi - unm || 1), 0, 1); return `rgb(${Math.round(196 + 40 * t - 60 * t * t)},${Math.round(214 - 40 * t)},${Math.round(160 - 60 * t)})`; };
    ctx.clearRect(0, 0, W, W);
    for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) {
      const z = res.points[iy * n + ix][2], zx = ix < n - 1 ? res.points[iy * n + ix + 1][2] : z, zy = iy < n - 1 ? res.points[(iy + 1) * n + ix][2] : z;
      ctx.fillStyle = col(z); ctx.fillRect(ix * cell, iy * cell, cell + 0.6, cell + 0.6);   // строка iy = 0 — верх (выше по течению)
      const shade = U.clamp(((zx - z) + (zy - z)) * 0.6, -0.35, 0.35);
      if (shade) { ctx.fillStyle = shade > 0 ? `rgba(255,255,255,${shade})` : `rgba(0,0,0,${-shade})`; ctx.fillRect(ix * cell, iy * cell, cell + 0.6, cell + 0.6); }
    }
    ctx.setLineDash([6, 5]); ctx.strokeStyle = '#7b3fa0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, W / 2); ctx.lineTo(W, W / 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#1f2328'; ctx.font = '12px sans-serif'; ctx.fillText('ось дороги (Y = 0)', 6, W / 2 - 6); ctx.fillText('↓ течение (+Y)', W - 96, 16);
  }

  /* ================= 6. Проверка ================= */
  function renderCheck() {
    const box = document.getElementById('tab-check'); box.innerHTML = '';
    const msgs = B.schema.validate(V), stale = V.hydro.series.length && V.hydro.seriesStamp !== B.hydrology.stamp(V);
    if (stale) msgs.unshift({ lvl: 'warn', sec: 'Гидрология', t: 'Ряды уровней сгенерированы для другого профиля или других параметров — перегенерируйте.' });
    box.append(card('Проверка варианта', h('ul', { class: 'msgs' }, msgs.map(m => h('li', { class: m.lvl }, m.sec ? h('b', {}, m.sec + ': ') : null, m.t)))),
      card('Что видит студент и что остаётся у преподавателя', h('p', { class: 'note' }, 'В бланк попадают: отметки пойм (нивелировка), глубины русла от уровня на дату изысканий, превышения годовых максимумов над нулём поста, ВИУ как превышение над известным объектом, уклон (числом или задачей), таблица навигационных уровней. Истинные отметки русла, УВВ, ВИУ и параметры генерации — на листе «Ключ преподавателя» Excel-файла (с формулами для сверки).')));
  }

  /* ================= 7. Бланк и экспорт ================= */
  const exportOpts = { key: true, daily: true, legacy: true };
  function renderBlank() {
    const box = document.getElementById('tab-blank'); box.innerHTML = '';
    const tools = card('Экспорт (п. 18)', h('div', { class: 'row' },
      chkF(() => exportOpts.key, x => exportOpts.key = x, 'лист «Ключ преподавателя»'), chkF(() => exportOpts.daily, x => exportOpts.daily = x, 'суточные уровни'),
      chkF(() => exportOpts.legacy, x => exportOpts.legacy = x, 'столбец старой книги (только 71 створ)')),
      h('div', { class: 'row' }, btn('Скачать Excel (.xlsx)', exportXlsx, 'primary'), btn('Вариант JSON', () => download(fname('json'), JSON.stringify(V, null, 1), 'application/json')),
        btn('Профиль CSV', () => { const x = B.profile.stationX(V.geodesy); download('Профиль.csv', B.exporter.toCSV(['Створ', 'x, м', 'Отметка, м', 'Зона'], V.geodesy.z.map((z, i) => [i + 1, x[i], z, B.profile.zoneOf(V.geodesy, i)])), 'text/csv'); }),
        btn('Печать бланка / PDF', () => { document.body.classList.add('printing'); window.print(); setTimeout(() => document.body.classList.remove('printing'), 500); })),
      h('p', { class: 'note' }, 'Excel-файл редактируемый: бланк задания (3 листа), ключ преподавателя с живыми формулами, суточные уровни. Для PDF — «Печать», затем «Сохранить как PDF».'));
    const pages = h('div', {}); pages.innerHTML = blankHTML();
    box.append(h('div', { class: 'noprint' }, tools), pages);
  }
  async function schemePng() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); C.profile(svg, V, { W: 1000, H: 400, showSoil: false, dots: false, mode: { kind: 'ground' } });
    svg.setAttribute('width', 2000); svg.setAttribute('height', 800);
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<?xml version="1.0"?>' + new XMLSerializer().serializeToString(svg).replace('<svg', '<svg style="background:#fff;font-family:Arial,sans-serif"'));
    const img = new Image(); await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
    const cv = h('canvas', { width: 2000, height: 800 }), ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 2000, 800); ctx.drawImage(img, 0, 0);
    return cv.toDataURL('image/png');
  }
  async function exportXlsx() {
    if (!window.ExcelJS) return toast('Не загружена библиотека ExcelJS (vendor/exceljs.min.js)');
    try {
      let png = null; try { png = await schemePng(); } catch (e) { console.warn('схема', e); }
      const wb = B.exporter.buildWorkbook(window.ExcelJS, V, Object.assign({ schemePng: png }, exportOpts));
      const buf = await wb.xlsx.writeBuffer();
      download(fname('xlsx'), new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      toast('Excel сформирован');
    } catch (e) { console.error(e); toast('Ошибка выгрузки: ' + e.message); }
  }
  function blankHTML() {
    const m = V.meta, t = V.tz, g = V.geodesy, hy = V.hydro, N = g.z.length, sv = B.hydrology.studentView(V), f = U.fmt;
    const comment = i => g.comments?.[i] || (i === 0 ? 'Левый берег' : i === g.iL || i === g.iR ? 'Русло' : i === N - 1 ? 'Правый берег' : '');
    const tbl = (head, rows) => `<table><tr>${head.map(x => `<th>${esc(x)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td class="center">${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
    const svgS = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); C.profile(svgS, V, { W: 1000, H: 330, showSoil: false, dots: false, mode: { kind: 'ground' } });
    const svgG = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); C.profile(svgG, V, { W: 1000, H: 430, showWater: false, showRoad: false, mode: { kind: 'none' } });
    const p1 = `<div class="sheet"><div class="code">${esc(m.code)}</div><p class="center">Задание для выполнения курсового проекта</p><h1>"Проект мостового перехода"</h1><p class="center">Вариант №${esc(m.code)}</p>
      <div class="line center" style="font-style:italic;font-size:13pt">${esc(m.student)}</div><div class="small">ФИО студента</div>
      <table class="noborder" style="margin-top:10px"><tr><td>Название дисциплины</td><td><b>${esc(m.discipline)}</b></td></tr><tr><td>Код направления подготовки</td><td>${esc(m.dirCode)}</td></tr>
      <tr><td>Курс ${esc(m.course)}</td><td>Группа ${esc(m.group)} &nbsp;&nbsp; Семестр ${esc(m.semester)}</td></tr><tr><td>Кафедра</td><td>${esc(m.department)}</td></tr><tr><td>ФИО преподавателя</td><td><b>${esc(m.teacher)}</b></td></tr></table>
      <h4>Общие сведения</h4><table class="noborder"><tr><td style="width:150px;vertical-align:top">Цель проекта:</td><td>${esc(m.goal)}</td></tr><tr><td style="vertical-align:top">Задачи проекта:</td><td style="white-space:pre-line">${esc(m.tasks)}</td></tr></table>
      <h4>Контрольные сроки выполнения курсового проекта</h4>${(m.deadlines || []).map(d => `<div class="line">${esc(d)}</div>`).join('')}
      <table class="noborder" style="margin-top:24px;width:100%"><tr><td><b>Задание выдал</b><br><br>______________ / ${esc(m.teacher)} /<br><span class="small">подпись</span><br><br>${esc(m.issueDate || '__________')}<br><span class="small">дата</span></td>
      <td><b>Задание получил</b><br><br>______________ / &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; /<br><span class="small">подпись</span><br><br>__________<br><span class="small">дата</span></td></tr></table><div class="foot">Страница 1 из 4</div></div>`;
    const lp = U.range(g.iL + 1, i => [i + 1, f(g.z[i]), comment(i)]), pp = U.range(N - g.iR, k => [g.iR + k + 1, f(g.z[g.iR + k]), comment(g.iR + k)]);
    const p2 = `<div class="sheet"><p>Приложение №1 к заданию на курсовое проектирование</p><h1 style="text-align:left">Исходные данные</h1>
      <h2>1. Техническое задание на проектирование мостового перехода</h2><div class="cols"><table class="noborder"><tr><td colspan=2><b>Данные о проектируемой автомобильной дороге</b></td></tr>
      <tr><td>Категория автомобильной дороги</td><td>${esc(t.roadCategory)}</td></tr><tr><td>Количество полос движения</td><td>${esc(t.lanes)}</td></tr>
      <tr><td>Отметка по оси ПЧ в начале мостового перехода (створ 1)</td><td>${f(t.zRoadStart)}</td></tr><tr><td>Отметка по оси ПЧ в конце мостового перехода (створ ${N})</td><td>${f(t.zRoadEnd)}</td></tr>
      <tr><td>Уровень ответственности</td><td>${esc(B.IMPORTANCE[t.importance] || '')}</td></tr>${t.region ? `<tr><td>Район</td><td>${esc(t.region)}</td></tr>` : ''}<tr><td>Доп. инф.:</td><td>${esc(t.addInfo)}</td></tr></table>
      <table class="noborder"><tr><td colspan=2><b>Требования по судоходству</b></td></tr><tr><td>Класс реки по судоходству</td><td>${esc(t.navClass)}</td></tr></table></div>
      <h2>2. Результаты геодезических изысканий</h2><div class="cols"><table class="noborder"><tr><td>Шаг нивелировки на левой пойме, м</td><td>${g.stepLP}</td></tr><tr><td>на правой пойме, м</td><td>${g.stepPP}</td></tr></table>
      <div><b>Левая пойма</b>${tbl(['Створ', 'Отметка', 'Комментарий'], lp)}</div><div><b>Правая пойма</b>${tbl(['Створ', 'Отметка', 'Комментарий'], pp)}</div></div>
      <p><b>Схема мостового перехода</b></p>${svgS.outerHTML}<div class="foot">Страница 2 из 4</div></div>`;
    const ann = B.hydrology.annualTable(V), half = Math.ceil(ann.length / 2), rsu = B.hydrology.rsuTable(V);
    const dep = B.profile.depths(V).map(d => [d.st, f(d.h), d.i === g.iL ? 'Левая пойма' : d.i === g.iR ? 'Правая пойма' : '']);
    const slopeTxt = hy.slope.studentMode === 'twoLevels' && sv.slopeTask ? `Отметки уреза воды на дату изысканий: выше по течению ${f(sv.slopeTask.zUp)} м, ниже по течению ${f(sv.slopeTask.zDown)} м; расстояние между точками ${sv.slopeTask.Lkm} км (ось перехода посередине).` : `Продольный уклон реки ${String(hy.slope.i).replace('.', ',')}`;
    const p3 = `<div class="sheet"><h2>3. Результаты гидрологических и метеорологических изысканий</h2><div class="cols">
      <div><b>Результаты промера глубин русла</b><table class="noborder"><tr><td>Шаг промера глубин, м</td><td>${g.stepR}</td></tr><tr><td>Отметка нуля измерения глубин, м</td><td>${f(g.surveyLevel)}</td></tr></table>${tbl(['Створ', 'Глубина', 'Комментарий'], dep)}</div>
      <div><b>Записи из истории наблюдений за высоким уровнем воды</b><table class="noborder"><tr><td>Отметка уровня нижней межени (УНМ), м</td><td>${f(hy.unm)}</td></tr>
      <tr><td>ВИУ выше отметки «${esc(hy.viu.refName)}» (${f(hy.viu.refZ)} м) на, м</td><td>${f(sv.viuExcess)}</td></tr><tr><td>Год наблюдения ВИУ</td><td>${esc(hy.viu.year)}</td></tr></table>
      ${tbl(['Год', 'Превышение', 'Год', 'Превышение'], U.range(half, k => [ann[k].year, f(ann[k].P), ann[k + half]?.year ?? '', ann[k + half] ? f(ann[k + half].P) : '']))}
      <p>Отметка нуля водомерного поста, м &nbsp; <b>${f(B.hydrology.postZero(V))}</b>${hy.post.offsetKm ? `<br>Пост расположен в ${Math.abs(hy.post.offsetKm)} км ${hy.post.offsetKm > 0 ? 'ниже' : 'выше'} по течению от оси перехода` : ''}</p></div></div>
      <h4>Записи из истории наблюдений за уровнем воды в период навигации</h4>
      ${tbl(['Год', 'Длительность навигации, сут'].concat(hy.rsuT.map(q => 't = ' + q)), rsu.map(r => [r.year, r.navDays].concat(hy.rsuT.map(q => f(r.values[q])))))}
      <p class="small" style="text-align:left">Максимальная отметка уровня воды при условии возможности прекращения навигации на t суток${hy.rsuConsecutive ? ' подряд' : ''}.</p>
      <h4>Дополнительные гидрологические сведения</h4><p>${esc(slopeTxt)}</p>
      <table><tr><th>Участок</th><th>Ландшафтная характеристика</th></tr><tr><td>Левая пойма</td><td>${esc(hy.morph.LP.text)}</td></tr><tr><td>Русло</td><td>${esc(hy.morph.R.text)}</td></tr><tr><td>Правая пойма</td><td>${esc(hy.morph.PP.text)}</td></tr></table>
      <h4>Метеорологические сведения</h4><table class="noborder"><tr><td>Расчетная скорость ветра, м/с</td><td>${f(hy.wind.v)}</td></tr><tr><td>Длина разгона ветровой волны, км</td><td>${f(hy.wind.fetch)}</td></tr></table><div class="foot">Страница 3 из 4</div></div>`;
    const L = V.geology.layers;
    const p4 = `<div class="sheet"><h2>4. Результаты инженерно-геологических изысканий</h2>
      ${tbl(['ИГУ', 'Описание грунта'], L.map(l => { const s = B.SOILS.find(q => q.code === l.code); return [l.no, s ? [s.name, s.sub, s.ch1, s.ch2].filter(Boolean).join(', ') : '?']; }))}
      <p><b>Инженерно-геологический разрез по оси перехода</b></p>${svgG.outerHTML}
      <p class="small" style="text-align:left">Отметки кровли ИГУ по створам — в Excel-файле (лист «Геология»).</p><div class="foot">Страница 4 из 4</div></div>`;
    return p1 + p2 + p3 + p4;
  }

  /* ================= 8. Шаблоны ================= */
  const tplLoad = () => { try { return JSON.parse(localStorage.getItem(TKEY) || '[]'); } catch (e) { return []; } };
  const tplSave = list => { try { localStorage.setItem(TKEY, JSON.stringify(list)); return true; } catch (e) { toast('Не удалось сохранить: ' + e.message); return false; } };
  const KINDS = Object.assign({ full: { name: 'Всё задание' } }, B.schema.SECTIONS);
  function renderTemplates() {
    const box = document.getElementById('tab-templates'); box.innerHTML = '';
    const list = tplLoad();
    const name = h('input', { type: 'text', placeholder: 'Уникальное имя шаблона', style: 'width:280px' });
    const kind = h('select', {}); Object.entries(KINDS).forEach(([k, q]) => kind.appendChild(h('option', { value: k }, q.name)));
    const saveT = () => {
      const nm = name.value.trim(); if (!nm) return toast('Введите имя шаблона');
      const k = kind.value, ex = list.findIndex(q => q.name === nm && q.kind === k);
      if (ex >= 0 && !confirm(`Шаблон «${nm}» уже есть. Заменить?`)) return;
      const data = U.deepClone(k === 'full' ? V : KINDS[k].get(V));
      if (k === 'full') data.hydro.series = [];   // ряды пересоздаются по зерну — шаблон компактнее
      const item = { name: nm, kind: k, created: new Date().toISOString(), data };
      if (ex >= 0) list[ex] = item; else list.push(item);
      if (tplSave(list)) { toast('Шаблон сохранён'); renderTemplates(); }
    };
    const apply = q => change(() => {
      const d = U.deepClone(q.data);
      if (q.kind === 'full') { V = B.schema.migrate(d); if (!V.hydro.series.length) B.hydrology.generate(V); }
      else { KINDS[q.kind].set(V, d); if (q.kind !== 'tz') B.hydrology.generate(V); }
      topoCache = null; toast('Шаблон применён: ' + q.name);
    });
    const rows = list.map((q, k) => h('tr', {}, h('td', {}, q.name), h('td', {}, KINDS[q.kind]?.name || q.kind), h('td', { class: 'note' }, new Date(q.created).toLocaleString('ru-RU')),
      h('td', {}, btn('Применить', () => apply(q)), ' ', btn('Файл', () => download(`Шаблон_${q.name}.json`, JSON.stringify({ bcaTemplate: 1, ...q }, null, 1), 'application/json')), ' ',
        btn('✕', () => { if (confirm(`Удалить шаблон «${q.name}»?`)) { list.splice(k, 1); tplSave(list); renderTemplates(); } }))));
    const imp = h('input', { type: 'file', accept: '.json', class: 'hide' });
    imp.onchange = async () => { const fl = imp.files[0]; if (!fl) return; try { const o = JSON.parse(await fl.text()); const arr = Array.isArray(o) ? o : [o];
      arr.forEach(q => { if (!q.bcaTemplate && !q.kind) throw new Error('это не шаблон'); const it = { name: q.name, kind: q.kind, created: q.created || new Date().toISOString(), data: q.data }; const ex = list.findIndex(z => z.name === it.name && z.kind === it.kind); if (ex >= 0) list[ex] = it; else list.push(it); });
      tplSave(list); renderTemplates(); toast('Импортировано: ' + arr.length); } catch (e) { toast('Ошибка импорта: ' + e.message); } };
    box.append(card('Сохранить текущее как шаблон', h('div', { class: 'row' }, name, kind, btn('Сохранить', saveT, 'primary')),
      h('p', { class: 'note' }, 'Шаблон раздела применяется к текущему варианту, остальные разделы не меняются. После применения шаблона профиля, гидрологии или геологии ряды уровней пересчитываются. Шаблоны хранятся в этом браузере; для переноса — кнопка «Файл» и импорт.')),
      card('Библиотека шаблонов', list.length ? h('table', {}, h('thead', {}, h('tr', {}, ['Имя', 'Раздел', 'Создан', ''].map(t => h('th', {}, t)))), h('tbody', {}, rows)) : h('p', { class: 'note' }, 'Шаблонов пока нет.'),
        h('div', { class: 'row' }, imp, btn('Импорт из файла…', () => imp.click()), list.length ? btn('Экспорт всех', () => download('Шаблоны_BridgeCrossingApp.json', JSON.stringify(list.map(q => ({ bcaTemplate: 1, ...q })), null, 1), 'application/json')) : null)));
  }

  /* ---------- кнопки шапки ---------- */
  document.getElementById('btnUndo').onclick = undo;
  document.getElementById('btnAutofill').onclick = () => { snapshot(); const d = B.schema.autofill(V); commit(); toast(d.length ? 'Заполнено: ' + d.join(', ') : 'Всё уже заполнено'); };
  document.getElementById('btnRegen').onclick = () => {
    if (!confirm('Сгенерировать новый вариант по новому зерну? Профиль, грунты и ряды уровней будут заменены (сведения о задании и ТЗ сохранятся). Отменить можно кнопкой «Отменить».')) return;
    change(() => { const s = B.newSeed(); V.meta.seed = s; V.gen.profile.seed = s; V.geology.seed = s + 7; V.topo.seed = s + 13; V.hydro.regime.seedOffset = 0;
      B.profile.generate(V); B.profile.generateSoil(V); if (V.hydro.viu.auto) V.hydro.viu.z = null; V.hydro.viu.refZ = null; B.hydrology.generate(V); topoCache = null; });
    toast('Новый вариант, зерно ' + V.meta.seed);
  };
  document.getElementById('btnSave').onclick = () => download(fname('json'), JSON.stringify(V, null, 1), 'application/json');
  document.getElementById('btnXlsx').onclick = exportXlsx;
  const fo = document.getElementById('fileOpen');
  document.getElementById('btnOpen').onclick = () => fo.click();
  fo.onchange = async () => { const fl = fo.files[0]; if (!fl) return; try { const o = B.schema.migrate(JSON.parse(await fl.text())); snapshot(); V = o; if (!V.hydro.series.length) B.hydrology.generate(V); topoCache = null; commit(); toast('Открыт вариант ' + V.meta.code); } catch (e) { toast('Ошибка: ' + e.message); } fo.value = ''; };
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); undo(); } });

  V = load() || B.schema.defaultVariant(1);
  commit();
  window.__bca = { get V() { return V; }, renderTab };   // для отладки и автотестов
})();
