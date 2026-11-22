/* Выгрузка в редактируемые форматы: .xlsx (ExcelJS), CSV, JSON.
   Общий сервис для всех модулей: модуль описывает, что выгружать, а оформление и запись — здесь.
   Листы генератора задания:
     «Задание»            — титульная страница (как стр. 1 бланка 1/26-c);
     «Исходные данные»     — разделы 1–3 бланка (ТЗ, геодезия, гидрометеорология);
     «Геология»            — раздел 4 (ИГУ и кровли по створам);
     «Ключ преподавателя»  — истинные значения с живыми формулами (проверка студенческих расчётов);
     «Суточные уровни»     — сгенерированные ежесуточные уровни;
     «Столбец книги (71)»  — столбец варианта для листа «Исходные данные по вариантам» старой книги. */
(function (root) {
  'use strict';
  const BCA = root.BCA || (root.BCA = {});
  const U = BCA.util;
  const X = BCA.exporter = {};

  const THIN = { style: 'thin' };
  const BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN };
  const F2 = '0.00', F1 = '0.0';

  /* Мини-«построитель» листа: курсор строк, заголовки, таблицы с рамками. */
  function Sheet(ws) {
    this.ws = ws; this.r = 1;
  }
  Sheet.prototype.cell = function (r, c) { return this.ws.getCell(r, c); };
  Sheet.prototype.put = function (r, c, v, o = {}) {
    const cell = this.cell(r, c);
    cell.value = v;
    if (o.fmt) cell.numFmt = o.fmt;
    if (o.bold || o.size || o.italic) cell.font = { bold: !!o.bold, italic: !!o.italic, size: o.size || 11, name: 'Times New Roman' };
    else cell.font = { name: 'Times New Roman', size: 11 };
    if (o.box) cell.border = BOX;
    cell.alignment = { vertical: 'middle', horizontal: o.align || (typeof v === 'number' || (v && v.formula) ? 'center' : 'left'), wrapText: !!o.wrap };
    if (o.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } };
    return cell;
  };
  Sheet.prototype.title = function (text, size = 13) { this.put(this.r, 1, text, { bold: true, size }); this.r++; return this; };
  Sheet.prototype.gap = function (n = 1) { this.r += n; return this; };
  Sheet.prototype.kv = function (label, val, o = {}) {
    this.put(this.r, o.col || 1, label, { wrap: false });
    if (o.merge) this.ws.mergeCells(this.r, o.col || 1, this.r, (o.col || 1) + o.merge - 1);
    this.put(this.r, o.vcol || 5, val, { fmt: o.fmt, align: 'center' }); this.r++; return this;
  };
  /* Таблица: head — массив заголовков, rows — массивы значений; fmts — форматы по столбцам. */
  Sheet.prototype.table = function (r, c, head, rows, fmts = [], o = {}) {
    head.forEach((h, j) => this.put(r, c + j, h, { bold: true, box: true, align: 'center', wrap: true, fill: 'FFF2F2F2' }));
    rows.forEach((row, i) => row.forEach((v, j) => this.put(r + 1 + i, c + j, v, { box: true, fmt: fmts[j], align: j === (o.textCol ?? -1) ? 'left' : 'center', wrap: j === (o.textCol ?? -1) })));
    return r + 1 + rows.length;
  };

  const colName = c => { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
  const addr = (r, c) => colName(c) + r;

  X.buildWorkbook = function (ExcelJS, v, opts = {}) {
    const o = Object.assign({ key: true, daily: true, legacy: true, schemePng: null }, opts);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'BridgeCrossingApp — генератор задания'; wb.created = new Date();
    const m = v.meta, tz = v.tz, g = v.geodesy, h = v.hydro, N = g.z.length;
    const sv = BCA.hydrology.studentView(v);
    const pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.6, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };

    /* ---------- 1. Задание ---------- */
    {
      const ws = wb.addWorksheet('Задание', { pageSetup });
      ws.columns = [{ width: 24 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];
      const s = new Sheet(ws);
      s.put(1, 2, 'Задание для выполнения курсового проекта', { size: 12, align: 'center' }); ws.mergeCells(1, 2, 1, 6);
      s.put(2, 2, '"Проект мостового перехода"', { bold: true, size: 15, align: 'center' }); ws.mergeCells(2, 2, 2, 6);
      s.put(1, 7, m.code, { box: true, size: 12, align: 'center' }); ws.mergeCells(1, 7, 2, 7);
      s.put(3, 2, 'Вариант №' + m.code, { size: 12, align: 'center' }); ws.mergeCells(3, 2, 3, 6);
      s.put(5, 1, m.student || '', { italic: true, size: 13, align: 'center' }); ws.mergeCells(5, 1, 5, 7);
      s.put(6, 1, 'ФИО студента', { italic: true, size: 8, align: 'center' }); ws.mergeCells(6, 1, 6, 7);
      s.r = 8;
      const row = (l, val, bold) => { s.put(s.r, 1, l); s.put(s.r, 2, val, { bold }); ws.mergeCells(s.r, 2, s.r, 7); s.r++; };
      row('Название дисциплины', m.discipline, true);
      row('Код направления подготовки', m.dirCode);
      s.put(s.r, 1, 'Курс'); s.put(s.r, 2, m.course, { align: 'center' }); s.put(s.r, 3, 'Группа'); s.put(s.r, 4, m.group); s.put(s.r, 5, 'Семестр'); s.put(s.r, 6, m.semester); s.r++;
      row('Кафедра', m.department);
      row('ФИО преподавателя', m.teacher, true);
      s.gap();
      s.put(s.r, 1, 'Общие сведения', { bold: true, size: 12 }); s.r++;
      const para = (l, text, h) => { s.put(s.r, 1, l); s.put(s.r, 2, text, { wrap: true }); ws.mergeCells(s.r, 2, s.r, 7); ws.getRow(s.r).height = h; s.r++; };
      para('Цель проекта:', m.goal, 32);
      para('Задачи проекта:', m.tasks, 78);
      s.gap();
      s.put(s.r, 1, 'Отчетный материал:'); s.r++;
      const yr = m.year || '', nm = (m.student || 'ИвановИИ').replace(/\s+/g, '');
      s.r = s.table(s.r, 2, ['№', 'Элемент документации', '', 'Формат', 'Пример наименования', ''],
        [[1, 'Том курсового проекта (титульный лист с подписями, задание, пояснительная записка и чертёж)', '', '*.pdf', `${yr}_${m.group}_ИиПММ_${nm}_КП.pdf`, ''],
         [2, 'Расчетная книга', '', '*.xlsx', `${yr}_${m.group}_ИиПММ_${nm}_РК.xlsx`, '']], [], { textCol: 1 });
      [s.r - 3, s.r - 2, s.r - 1].forEach(r => { ws.mergeCells(r, 3, r, 4); ws.mergeCells(r, 6, r, 7); ws.getRow(r).height = r === s.r - 2 ? 44 : 18; });
      s.gap();
      s.put(s.r, 1, 'Контрольные сроки выполнения курсового проекта:', { wrap: true }); ws.getRow(s.r).height = 30;
      (m.deadlines || []).forEach((d, k) => { s.put(s.r + k, 2, d || ''); ws.mergeCells(s.r + k, 2, s.r + k, 7); ws.getCell(s.r + k, 2).border = { bottom: THIN }; });
      s.r += Math.max(1, (m.deadlines || []).length) + 1;
      s.put(s.r, 1, 'Задание выдал', { bold: true }); s.put(s.r, 5, 'Задание получил', { bold: true }); s.r += 2;
      s.put(s.r, 1, '______________ / ' + (m.teacher ? m.teacher.replace(/^(\S+)\s+(\S)\S*\s+(\S)\S*$/, '$1 $2.$3.') : '') + ' /'); s.put(s.r, 5, '______________ /                /'); s.r++;
      s.put(s.r, 1, 'подпись', { size: 8 }); s.put(s.r, 5, 'подпись', { size: 8 }); s.r += 2;
      s.put(s.r, 1, m.issueDate || '__________'); s.put(s.r, 5, '__________'); s.r++;
      s.put(s.r, 1, 'дата', { size: 8 }); s.put(s.r, 5, 'дата', { size: 8 });
    }

    /* ---------- 2. Исходные данные (разделы 1–3) ---------- */
    {
      const ws = wb.addWorksheet('Исходные данные', { pageSetup });
      ws.columns = [{ width: 30 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 10 }];
      const s = new Sheet(ws);
      s.put(1, 1, 'Приложение №1 к заданию на курсовое проектирование', { size: 10 }); s.put(2, 1, 'Исходные данные', { bold: true, size: 13 }); s.r = 4;
      s.title('1. Техническое задание на проектирование мостового перехода', 12);
      s.put(s.r, 1, 'Данные о проектируемой автомобильной дороге', { bold: true }); s.put(s.r, 6, 'Требования по судоходству', { bold: true }); s.r++;
      const r0 = s.r;
      [['Категория автомобильной дороги', tz.roadCategory], ['Количество полос движения', tz.lanes],
       ['Отметка по оси ПЧ в начале мостового перехода (створ 1), м', tz.zRoadStart], [`Отметка по оси ПЧ в конце мостового перехода (створ ${N}), м`, tz.zRoadEnd],
       ['Уровень ответственности', BCA.IMPORTANCE[tz.importance] || tz.importance], ['Район строительства', tz.region || '-'], ['Расчётная вероятность превышения', tz.prob], ['Доп. инф.:', tz.addInfo || '-']]
        .forEach(([l, val], k) => { s.put(r0 + k, 1, l, { wrap: true }); ws.mergeCells(r0 + k, 1, r0 + k, 3); s.put(r0 + k, 4, val, { fmt: typeof val === 'number' && val < 1 ? '0.00%' : (typeof val === 'number' && val > 50 ? F2 : undefined), align: 'center' }); });
      s.put(r0, 6, 'Класс реки по судоходству'); ws.mergeCells(r0, 6, r0, 8); s.put(r0, 9, tz.navClass, { align: 'center' });
      if ((tz.axisPoints || []).length) {
        s.put(r0 + 2, 6, 'Характерные точки оси дороги на подходах:', { italic: true }); ws.mergeCells(r0 + 2, 6, r0 + 2, 10);
        s.table(r0 + 3, 6, ['Створ', 'Отметка, м', 'Примечание'], tz.axisPoints.map(p => [p.st, p.z, p.label || '']), [undefined, F2], { textCol: 2 });
      }
      s.r = Math.max(r0 + 8, r0 + 4 + (tz.axisPoints || []).length) + 1;

      s.title('2. Результаты геодезических изысканий', 12);
      s.kv('Шаг нивелировки на левой пойме, м', g.stepLP, { vcol: 2 }); s.kv('Шаг нивелировки на правой пойме, м', g.stepPP, { vcol: 2 });
      const comment = i => g.comments?.[i] || (i === 0 ? 'Левый берег' : i === g.iL ? 'Русло' : i === g.iR ? 'Русло' : i === N - 1 ? 'Правый берег' : '');
      s.put(s.r, 4, 'Левая пойма', { bold: true, align: 'center', box: true }); ws.mergeCells(s.r, 4, s.r, 6);
      s.put(s.r, 7, 'Правая пойма', { bold: true, align: 'center', box: true }); ws.mergeCells(s.r, 7, s.r, 9); s.r++;
      const lp = U.range(g.iL + 1, i => [i + 1, g.z[i], comment(i)]), pp = U.range(N - g.iR, k => [g.iR + k + 1, g.z[g.iR + k], comment(g.iR + k)]);
      const e1 = s.table(s.r, 4, ['Створ', 'Отметка', 'Комментарий'], lp, [undefined, F2]);
      const e2 = s.table(s.r, 7, ['Створ', 'Отметка', 'Комментарий'], pp, [undefined, F2]);
      s.r = Math.max(e1, e2) + 1;
      if (o.schemePng) {
        const id = wb.addImage({ base64: o.schemePng, extension: 'png' });
        s.put(s.r, 1, 'Схема мостового перехода', { bold: true }); s.r++;
        ws.addImage(id, { tl: { col: 0, row: s.r - 1 }, ext: { width: 760, height: 300 } });
        s.r += 17;
      }

      s.title('3. Результаты гидрологических и метеорологических изысканий', 12);
      const r3 = s.r;
      s.put(r3, 1, 'Результаты промера глубин русла', { bold: true });
      s.put(r3 + 1, 1, 'Шаг промера глубин, м'); s.put(r3 + 1, 2, g.stepR, { align: 'center' });
      s.put(r3 + 2, 1, 'Отметка нуля измерения глубин, м'); s.put(r3 + 2, 2, g.surveyLevel, { fmt: F2, align: 'center' });
      const dep = BCA.profile.depths(v).map(d => [d.st, d.h, d.i === g.iL ? 'Левая пойма' : d.i === g.iR ? 'Правая пойма' : '']);
      const eD = s.table(r3 + 4, 1, ['Створ', 'Глубина', 'Комментарий'], dep.map(r => [r[0], r[1], r[2]]), [undefined, F2]);
      s.put(r3, 5, 'Записи из истории наблюдений за высоким уровнем воды', { bold: true }); ws.mergeCells(r3, 5, r3, 10);
      s.put(r3 + 1, 5, 'Отметка уровня нижней межени (УНМ), м'); ws.mergeCells(r3 + 1, 5, r3 + 1, 9); s.put(r3 + 1, 10, h.unm, { fmt: F2 });
      if (sv.viuExcess != null) {
        s.put(r3 + 2, 5, `Высокий исторический уровень (ВИУ) — выше отметки «${h.viu.refName}» на, м`, { wrap: true }); ws.mergeCells(r3 + 2, 5, r3 + 2, 9); ws.getRow(r3 + 2).height = 30; s.put(r3 + 2, 10, sv.viuExcess, { fmt: F2 });
        s.put(r3 + 3, 5, `Отметка «${h.viu.refName}», м`, { wrap: true }); ws.mergeCells(r3 + 3, 5, r3 + 3, 9); ws.getRow(r3 + 3).height = 30; s.put(r3 + 3, 10, h.viu.refZ, { fmt: F2 });
      }
      s.put(r3 + 4, 5, 'Год наблюдения ВИУ'); ws.mergeCells(r3 + 4, 5, r3 + 4, 9); s.put(r3 + 4, 10, h.viu.year);
      const ann = BCA.hydrology.annualTable(v), half = Math.ceil(ann.length / 2);
      s.put(r3 + 6, 5, 'История наблюдений за последние годы', { bold: true, box: true, align: 'center' }); ws.mergeCells(r3 + 6, 5, r3 + 6, 8);
      const annRows = U.range(half, k => [ann[k].year, ann[k].P, ann[k + half]?.year ?? '', ann[k + half]?.P ?? '']);
      const eA = s.table(r3 + 7, 5, ['Год', 'Превышение', 'Год', 'Превышение'], annRows, [undefined, F2, undefined, F2]);
      s.put(eA, 5, 'Отметка нуля водомерного поста, м'); ws.mergeCells(eA, 5, eA, 7); s.put(eA, 8, BCA.hydrology.postZero(v), { fmt: F2 });
      let rr = eA + 1;
      if (h.post.offsetKm) { s.put(rr, 5, `Водомерный пост расположен на ${Math.abs(h.post.offsetKm)} км ${h.post.offsetKm > 0 ? 'ниже' : 'выше'} по течению от оси перехода`, { italic: true }); rr++; }
      s.r = Math.max(eD, rr) + 1;

      s.put(s.r, 1, 'Записи из истории наблюдений за уровнем воды в период навигации', { bold: true }); s.r++;
      const rsu = BCA.hydrology.rsuTable(v);
      s.put(s.r, 3, `Максимальная отметка уровня воды при условии возможности прекращения навигации на t суток${h.rsuConsecutive ? ' подряд' : ''}`, { align: 'center', wrap: true });
      ws.mergeCells(s.r, 3, s.r, 2 + h.rsuT.length); ws.getRow(s.r).height = 30;
      s.r = s.table(s.r + 1, 1, ['Год', 'Длительность навигации за год (суток)'].concat(h.rsuT.map(t => 't = ' + t)),
        rsu.map(r => [r.year, r.navDays].concat(h.rsuT.map(t => r.values[t]))), [undefined, undefined].concat(h.rsuT.map(() => F2))) + 1;

      s.put(s.r, 1, 'Дополнительные гидрологические сведения', { bold: true }); s.r++;
      if (h.slope.studentMode === 'twoLevels' && sv.slopeTask) {
        s.put(s.r, 1, `Отметки уреза воды на дату изысканий: выше по течению — ${U.fmt(sv.slopeTask.zUp)} м, ниже по течению — ${U.fmt(sv.slopeTask.zDown)} м; расстояние между точками ${sv.slopeTask.Lkm} км (ось перехода посередине).`, { wrap: true });
        ws.mergeCells(s.r, 1, s.r, 10); ws.getRow(s.r).height = 30; s.r++;
      } else { s.put(s.r, 1, 'Продольный уклон реки'); s.put(s.r, 2, h.slope.i, { fmt: '0.00000' }); s.r++; }
      s.put(s.r, 1, 'Ландшафтные характеристики'); s.r++;
      s.r = s.table(s.r, 1, ['Участок', 'Характеристика'], [['Левая пойма', h.morph.LP.text], ['Русло', h.morph.R.text], ['Правая пойма', h.morph.PP.text]], [], { textCol: 1 });
      for (let k = 1; k <= 3; k++) { ws.mergeCells(s.r - k, 2, s.r - k, 10); ws.getRow(s.r - k).height = 32; }
      ws.mergeCells(s.r - 4, 2, s.r - 4, 10);
      s.gap();
      s.put(s.r, 1, 'Метеорологические сведения', { bold: true }); s.r++;
      s.kv('Расчетная скорость ветра, м/с', h.wind.v, { vcol: 4, fmt: F2 }); s.kv('Длина разгона ветровой волны, км', h.wind.fetch, { vcol: 4, fmt: F2 });
    }

    /* ---------- 3. Геология ---------- */
    {
      const ws = wb.addWorksheet('Геология', { pageSetup: Object.assign({}, pageSetup, { orientation: 'landscape' }) });
      const s = new Sheet(ws), L = v.geology.layers;
      ws.columns = [{ width: 8 }, { width: 10 }].concat(L.map(() => ({ width: 10 })));
      s.title('4. Результаты инженерно-геологических изысканий', 12);
      s.r = s.table(s.r, 1, ['ИГУ', 'Код', 'Описание грунта'], L.map(l => { const so = BCA.SOILS.find(q => q.code === l.code); return [l.no, l.code, so ? [so.name, so.sub, so.ch1, so.ch2].filter(Boolean).join(', ') : '?']; }), [], { textCol: 2 });
      for (let k = 1; k <= L.length; k++) ws.mergeCells(s.r - k, 3, s.r - k, Math.max(8, 2 + L.length));
      ws.mergeCells(s.r - L.length - 1, 3, s.r - L.length - 1, Math.max(8, 2 + L.length));
      s.gap();
      s.put(s.r, 1, 'Отметки кровли ИГУ по створам, м (пустая ячейка — слой на створе отсутствует)', { italic: true }); s.r++;
      s.table(s.r, 1, ['Створ', 'Поверхность'].concat(L.map(l => 'ИГУ ' + l.no)), U.range(N, i => [i + 1, g.z[i]].concat(L.map(l => l.tops[i] ?? ''))), [undefined, F2].concat(L.map(() => F2)));
    }

    /* ---------- 4. Ключ преподавателя (живые формулы) ---------- */
    if (o.key) {
      const ws = wb.addWorksheet('Ключ преподавателя');
      ws.columns = [{ width: 44 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];
      const s = new Sheet(ws);
      s.title('Ключ преподавателя — истинные значения варианта ' + m.code, 13);
      s.put(s.r, 1, 'Синие ячейки — исходные данные, остальные считаются формулами Excel (можно менять и сверять).', { italic: true }); s.r += 2;
      const inp = (label, val, fmt) => { s.put(s.r, 1, label); const c = s.put(s.r, 2, val, { fmt, box: true, fill: 'FFDDEBF7' }); s.r++; return c.address; };
      const frm = (label, f, res, fmt) => { s.put(s.r, 1, label); const c = s.put(s.r, 2, { formula: f, result: res }, { fmt, box: true }); s.r++; return c.address; };
      s.put(s.r, 1, 'Геометрия профиля', { bold: true }); s.r++;
      const w = BCA.profile.widths(g);
      const aSL = inp('Шаг нивелировки левой поймы, м', g.stepLP), aNL = inp('Интервалов на левой пойме', w.nLP);
      const aSR = inp('Шаг промера русла, м', g.stepR), aNR = inp('Интервалов в русле', w.nR);
      const aSP = inp('Шаг нивелировки правой поймы, м', g.stepPP), aNP = inp('Интервалов на правой пойме', w.nPP);
      const aWL = frm('Ширина левой поймы, м', `${aSL}*${aNL}`, w.LP), aWR = frm('Ширина русла, м', `${aSR}*${aNR}`, w.R), aWP = frm('Ширина правой поймы, м', `${aSP}*${aNP}`, w.PP);
      frm('Общая длина профиля, м', `${aWL}+${aWR}+${aWP}`, w.total); frm('Число створов', `${aNL}+${aNR}+${aNP}+1`, N);
      s.gap(); s.put(s.r, 1, 'Уровни', { bold: true }); s.r++;
      const z0 = BCA.hydrology.postZero(v), aZ0 = inp('Отметка нуля водомерного поста, м', z0, F2);
      if (sv.viuExcess != null) { const aRef = inp('Отметка объекта для ВИУ, м', h.viu.refZ, F2), aEx = inp('Превышение ВИУ над объектом, м', sv.viuExcess, F2); frm('ВИУ, м', `${aRef}+${aEx}`, h.viu.z, F2); }
      if (sv.slopeTask) { const a1 = inp('Урез выше по течению, м', sv.slopeTask.zUp, F2), a2 = inp('Урез ниже по течению, м', sv.slopeTask.zDown, F2), aL = inp('Расстояние, км', sv.slopeTask.Lkm); frm('Уклон по урезам (студент)', `(${a1}-${a2})/(${aL}*1000)`, sv.slopeCheck, '0.000000'); }
      inp('Уклон, заданный преподавателем', h.slope.i, '0.000000');
      if (h.post.offsetKm) { const aOff = inp('Удаление поста от оси, км (+ ниже)', h.post.offsetKm, F2); s.put(s.r, 1, 'Поправка переноса уровня на ось, м'); s.put(s.r, 2, { formula: `B${s.r - 2}*${aOff}*1000`, result: U.r2(h.slope.i * h.post.offsetKm * 1000) }, { fmt: F2, box: true }); s.r++; }
      s.gap();
      const ann = BCA.hydrology.annualTable(v), r1 = s.r + 1;
      s.r = s.table(s.r, 1, ['Год', 'Превышение П, м', 'УВВ на посту = нуль + П', 'УВВ в створе (истина)', 'Сутки максимума', 'Затор'],
        ann.map(a => [a.year, a.P, null, a.zMax, a.dMax + 1, a.jam ? 'да' : '']), [undefined, F2, F2, F2]);
      ann.forEach((a, k) => { const c = ws.getCell(r1 + k, 3); c.value = { formula: `${aZ0}+B${r1 + k}`, result: a.zPost }; c.numFmt = F2; });
      s.gap();
      s.put(s.r, 1, 'Глубины → отметки дна (проверка студенческого профиля)', { bold: true }); s.r++;
      const aS = inp('Нуль измерения глубин, м', g.surveyLevel, F2), d0 = s.r + 1;
      const dep = BCA.profile.depths(v);
      s.r = s.table(s.r, 1, ['Створ', 'Глубина, м', 'Отметка дна = нуль − глубина', 'Отметка в варианте'], dep.map(d => [d.st, d.h, null, d.z]), [undefined, F2, F2, F2]);
      dep.forEach((d, k) => { const c = ws.getCell(d0 + k, 3); c.value = { formula: `${aS}-B${d0 + k}`, result: U.r2(g.surveyLevel - d.h) }; c.numFmt = F2; });
      s.gap();
      s.put(s.r, 1, 'Параметры генерации', { bold: true }); s.r++;
      [['Зерно варианта', m.seed], ['Тип питания', BCA.RIVER_FEED[h.regime.feed]?.name], ['Ландшафт', BCA.RIVER_LANDSCAPE[h.regime.landscape]?.name], ['Cv', h.regime.Cv], ['Cs/Cv', h.regime.CsCv],
       ['m: ЛП / Р / ПП', `${h.morph.LP.m} / ${h.morph.R.m} / ${h.morph.PP.m}`], ['РСУ: t суток подряд', h.rsuConsecutive ? 'да' : 'нет (в сумме)']].forEach(([l, val]) => { s.put(s.r, 1, l); s.put(s.r, 2, val); s.r++; });
    }

    /* ---------- 5. Суточные уровни ---------- */
    if (o.daily && h.series.length) {
      const ws = wb.addWorksheet('Суточные уровни');
      const s = new Sheet(ws);
      ws.columns = [{ width: 8 }].concat(h.series.map(() => ({ width: 9 })));
      s.put(1, 1, 'Сутки', { bold: true, box: true });
      h.series.forEach((y, j) => s.put(1, 2 + j, y.year, { bold: true, box: true }));
      for (let d = 0; d < BCA.hydrology.DAYS; d++) {
        ws.getCell(2 + d, 1).value = d + 1;
        h.series.forEach((y, j) => { const c = ws.getCell(2 + d, 2 + j); c.value = y.daily[d]; c.numFmt = F2;
          if (d >= y.navStart && d < y.navStart + y.navDays) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F3E8' } }; });
      }
      ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
      ws.getCell(1, h.series.length + 3).value = 'Зелёным — период навигации. Уровни в створе перехода, м.';
    }

    /* ---------- 6. Столбец старой книги ---------- */
    if (o.legacy && N === 71) {
      const ws = wb.addWorksheet('Столбец книги (71)');
      ws.columns = [{ width: 10 }, { width: 70 }, { width: 16 }];
      const R = X.legacyRows(v);
      ws.getCell(1, 1).value = 'Строка'; ws.getCell(1, 2).value = 'Содержание'; ws.getCell(1, 3).value = 'Значение';
      ws.getCell(2, 2).value = `Вставлять в столбец ${colName(6 + (m.variantNo || 0))} листа «Исходные данные по вариантам» (столбец = 6 + № варианта). Строки без значений не трогать.`;
      let r = 3; Object.keys(R).map(Number).sort((a, b) => a - b).forEach(k => { ws.getCell(r, 1).value = k; ws.getCell(r, 2).value = R[k][0]; ws.getCell(r, 3).value = R[k][1]; r++; });
    }
    return wb;
  };

  /* Строки столбца варианта старой книги (см. спецификацию: D5…D138, блоки ИГУ по 75 строк с D140). */
  X.legacyRows = v => {
    const m = v.meta, g = v.geodesy, h = v.hydro, R = {};
    const set = (r, label, val) => { R[r] = [label, val]; };
    set(5, 'Номер варианта', m.variantNo); set(6, 'Студент', m.student); set(7, 'Расчётная вероятность', v.tz.prob);
    set(9, 'Шаг нивелировки пойм lп, м', g.stepLP); set(10, 'Шаг промера русла lр, м', g.stepR); set(11, 'Ноль измерения глубин, м', g.surveyLevel);
    for (let i = 0; i <= 30; i++) set(13 + i, `Левая пойма, створ ${i + 1}`, g.z[i]);
    for (let i = 30; i <= 40; i++) set(45 + i - 30, `Русло, створ ${i + 1}`, g.z[i]);
    for (let i = 40; i <= 70; i++) set(57 + i - 40, `Правая пойма, створ ${i + 1}`, g.z[i]);
    set(90, 'УНМ', h.unm); set(91, 'ВИУ', h.viu.z); set(92, 'Год ВИУ', h.viu.year); set(93, 'Нуль водомерного поста', BCA.hydrology.postZero(v));
    BCA.hydrology.annualTable(v).slice(0, 21).forEach((a, j) => set(95 + j, `Превышение ${a.year}`, a.P));
    set(118, 'Уклон', h.slope.i); set(119, 'Ландшафт ЛП', h.morph.LP.text); set(120, 'm ЛП', h.morph.LP.m); set(121, 'Ландшафт Р', h.morph.R.text); set(122, 'm Р', h.morph.R.m);
    set(123, 'Ландшафт ПП', h.morph.PP.text); set(124, 'm ПП', h.morph.PP.m); set(125, 'Уклон (повтор)', h.slope.i);
    set(127, 'Скорость ветра', h.wind.v); set(128, 'Длина разгона', h.wind.fetch); set(131, 'Класс судоходства', v.tz.navClass);
    set(134, 'Категория дороги', v.tz.roadCategory); set(135, 'Полосы', v.tz.lanes); set(136, 'Отметка ПЧ, створ 1', v.tz.zRoadStart); set(137, 'Отметка ПЧ, конец', v.tz.zRoadEnd); set(138, 'Ответственность', v.tz.importance);
    for (let b = 0; b < 9; b++) {
      const base = 140 + 75 * b, l = v.geology.layers[b], so = l && BCA.SOILS.find(q => q.code === l.code);
      set(base, `ИГУ блок ${b + 1}: код грунта`, l ? l.code : ''); set(base + 1, `ИГУ блок ${b + 1}: №`, l ? l.no : '');
      set(base + 2, `ИГУ блок ${b + 1}: описание`, so ? [so.name, so.sub, so.ch1, so.ch2].filter(Boolean).join('. ') : '');
      set(base + 3, `ИГУ блок ${b + 1}: vmax`, so ? Math.max(...so.v) : '');
      for (let k = 0; k < 71; k++) set(base + 4 + k, `ИГУ блок ${b + 1}: кровля, створ ${k + 1}`, l && l.tops[k] != null ? l.tops[k] : 0);
    }
    return R;
  };

  X.toCSV = (head, rows, sep = ';') => {
    const f = v => v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : /[;"\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    return '﻿' + [head].concat(rows).map(r => r.map(f).join(sep)).join('\r\n');
  };
  X.addr = addr; X.colName = colName;
})(typeof globalThis !== 'undefined' ? globalThis : this);
