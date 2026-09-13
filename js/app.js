/* ============================================================================
   МетодГраф — интерфейс
   ============================================================================ */

(function () {
  'use strict';

  const E = window.MG_ENGINE;
  const $ = id => document.getElementById(id);

  /* Короткие формы названий — для строки контекста и подписи к графику. */
  const LEVEL_WORD = { low: 'низкий', mid: 'средний', high: 'высокий' };
  const DISC_WORD = { calm: 'спокойный', work: 'рабочий', loud: 'шумный' };
  const DISC_GEN = { calm: 'спокойного, пассивного класса', work: 'рабочего класса', loud: 'шумного класса' };

  let DB = null;
  let lastCtx = null;
  let lastResult = null;
  let variantIndex = 0;

  /* ---------- инициализация ---------- */
  async function init() {
    const loaded = await window.MG_STORE.load();
    DB = loaded.db;

    $('src-note').textContent = 'Источник данных: ' + loaded.note;
    $('stat-line').textContent =
      `${DB.TECHNIQUES.length} приёмов · ${DB.TOPICS.length} тем · ${DB.LINKS.length} экспертных связей`;

    fillGrades();
    fillSelect($('f-size'), DB.SIZES.map(s => [s.id, s.label]));
    fillSelect($('f-level'), DB.LEVELS.map(s => [s.id, s.label]));
    fillSelect($('f-discipline'), DB.DISCIPLINE.map(s => [s.id, s.label]));

    $('f-grade').addEventListener('change', onGradeChange);
    $('survey').addEventListener('submit', onSubmit);
    $('btn-alt').addEventListener('click', onAlternative);
    $('btn-print').addEventListener('click', () => window.print());
    $('btn-random').addEventListener('click', onRandom);

    // Страница открывается в рабочем состоянии: показан живой пример подбора.
    preset(7, 't702', 's3', 'mid', 'loud');
    compute(false);
  }

  function fillSelect(sel, pairs, placeholder) {
    sel.innerHTML = '';
    if (placeholder) sel.append(new Option(placeholder, '', true, true));
    pairs.forEach(([v, t]) => sel.append(new Option(t, v)));
  }

  function fillGrades() {
    const grades = [...new Set(DB.TOPICS.map(t => t.grade))].sort((a, b) => a - b);
    fillSelect($('f-grade'), grades.map(g => [g, g + ' класс']), '— выберите класс —');
  }

  function preset(grade, topicId, sizeId, level, disc) {
    $('f-grade').value = String(grade);
    onGradeChange();
    if (topicId) $('f-topic').value = topicId;
    $('f-size').value = sizeId;
    $('f-level').value = level;
    $('f-discipline').value = disc;
  }

  /* ---------- каскадный фильтр тем по классу ---------- */
  function onGradeChange() {
    const grade = Number($('f-grade').value);
    const topicSel = $('f-topic');
    if (!grade) {
      topicSel.disabled = true;
      fillSelect(topicSel, [], '— выберите класс —');
      $('topic-hint').textContent = 'Сначала выберите класс';
      return;
    }
    const topics = DB.TOPICS.filter(t => t.grade === grade);
    fillSelect(topicSel, topics.map(t => [t.id, t.title]));
    topicSel.disabled = false;
    $('topic-hint').textContent = `${topics.length} тем программы ${grade} класса`;
  }

  function onRandom() {
    const grades = [...new Set(DB.TOPICS.map(t => t.grade))];
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const g = pick(grades);
    preset(g, null, pick(DB.SIZES).id, pick(DB.LEVELS).id, pick(DB.DISCIPLINE).id);
    $('f-topic').value = pick(DB.TOPICS.filter(t => t.grade === g)).id;
    compute(true);
  }

  /* ---------- подбор ---------- */
  function onSubmit(ev) {
    ev.preventDefault();
    compute(true);
  }

  function compute(scroll) {
    if (!$('f-topic').value) return;

    lastCtx = E.makeContext({
      grade: Number($('f-grade').value),
      topicId: $('f-topic').value,
      sizeId: $('f-size').value,
      level: $('f-level').value,
      discipline: $('f-discipline').value
    }, DB);

    lastResult = E.buildLesson(lastCtx, DB);
    variantIndex = 0;

    if (!lastResult.ok) {
      $('cards').innerHTML =
        '<li class="card"><p class="desc">Для такого сочетания параметров подходящей тройки приёмов ' +
        'не нашлось. В прототипе это возможно при очень узких фильтрах — попробуйте изменить ' +
        'размер класса или уровень подготовки.</p></li>';
      $('rhythm').innerHTML = '';
      $('rhythm-note').textContent = '';
      $('graph-panel').classList.add('hidden');
      return;
    }

    $('graph-panel').classList.remove('hidden');
    render();
    window.MG_STORE.logRequest(lastCtx, currentVariant().steps.map(s => s.tech.id));
    if (scroll) $('result-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function variants() { return [lastResult.best, ...(lastResult.alternatives || [])]; }
  function currentVariant() { const v = variants(); return v[variantIndex % v.length]; }

  function onAlternative() {
    if (!lastResult || !lastResult.ok) return;
    variantIndex = (variantIndex + 1) % variants().length;
    render();
  }

  /* ---------- отрисовка ---------- */
  function render() {
    const ctx = lastCtx;
    const v = currentVariant();

    $('context-line').innerHTML =
      `<b>${ctx.grade} класс</b> · <b>${esc(ctx.topic.title)}</b> · ${ctx.sizeLabel} · ` +
      `уровень ${LEVEL_WORD[ctx.level] || ctx.level} · класс ${DISC_WORD[ctx.discipline] || ctx.discipline}<br>` +
      ctx.topic.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('');

    drawRhythm(v, ctx);

    $('cards').innerHTML = E.PHASES.map((ph, i) => {
      const step = v.steps[i];
      const t = step.tech;
      const why = E.explain(step, ph, ctx).map(w => `<li>${esc(w)}</li>`);

      const link = i > 0 ? v.links[i - 1] : null;
      if (link && link.note && link.w > 0) why.push(`<li class="link-note">${esc(link.note)}</li>`);
      step.score.warnings.forEach(w => why.push(`<li class="warn">${esc(w)}</li>`));

      return `<li><article class="card">
        <div class="card-head">
          <span class="phase">${E.PHASE_RU[ph]}</span>
          <span class="energy-chip">динамика
            <span class="dots">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= t.energy ? 'on' : ''}"></i>`).join('')}</span>
            ${t.energy} из 5</span>
        </div>
        <h3>${esc(t.name)}</h3>
        <p class="goal">${esc(t.goal)}</p>
        <p class="desc">${esc(t.desc)}</p>
        <p class="how"><b>Как применить на этом уроке</b>${esc(t.how)}</p>
        <ul class="why">${why.join('')}</ul>
      </article></li>`;
    }).join('');

    const total = variants().length;
    $('btn-alt').textContent = total > 1
      ? `Другой вариант (${(variantIndex % total) + 1} из ${total})`
      : 'Других вариантов нет';
    $('btn-alt').disabled = total < 2;

    drawGraph(v);
  }

  /* ---------- ритм урока: выбранная динамика против целевой ---------- */
  function drawRhythm(variant, ctx) {
    const xs = [130, 320, 510];
    const y = e => 106 - (e - 1) * 20;
    const parts = [];

    for (let e = 1; e <= 5; e++) {
      parts.push(`<line class="rh-grid" x1="70" y1="${y(e)}" x2="540" y2="${y(e)}" opacity="${e === 1 ? .9 : .5}"/>`);
      parts.push(`<text class="rh-ax" x="58" y="${y(e) + 4}" text-anchor="end">${e}</text>`);
    }
    // Подписи у краёв шкалы объясняют, что означают цифры.
    parts.push(`<text class="rh-ax" x="552" y="${y(5) + 4}">шумно</text>`);
    parts.push(`<text class="rh-ax" x="552" y="${y(1) + 4}">тихо</text>`);

    const tgt = E.PHASES.map((ph, i) => `${xs[i]},${y(ctx.target[ph])}`).join(' ');
    parts.push(`<polyline class="rh-target" points="${tgt}"/>`);
    // Кольца отмечают целевую динамику: если кольцо надето на точку — попали точно.
    E.PHASES.forEach((ph, i) => {
      parts.push(`<circle class="rh-ring" cx="${xs[i]}" cy="${y(ctx.target[ph])}" r="17.5"/>`);
    });

    const act = variant.steps.map((s, i) => `${xs[i]},${y(s.tech.energy)}`).join(' ');
    parts.push(`<polyline class="rh-line" points="${act}"/>`);

    variant.steps.forEach((s, i) => {
      const yy = y(s.tech.energy);
      parts.push(`<circle class="rh-dot" cx="${xs[i]}" cy="${yy}" r="13"/>`);
      parts.push(`<text class="rh-val" x="${xs[i]}" y="${yy + 4}" text-anchor="middle">${s.tech.energy}</text>`);
      parts.push(`<text class="rh-ph" x="${xs[i]}" y="136" text-anchor="middle">${E.PHASE_RU[E.PHASES[i]].replace(' урока', '')}</text>`);
    });

    $('rhythm').innerHTML = parts.join('');

    const tArr = E.PHASES.map(ph => ctx.target[ph]);
    const aArr = variant.steps.map(s => s.tech.energy);
    const hit = tArr.every((v, i) => v === aArr[i]);
    const gen = DISC_GEN[ctx.discipline] || 'этого класса';

    $('rhythm-note').innerHTML =
      `Шкала слева — насколько приём поднимает класс: 1 — тихая работа за партой, ` +
      `5 — движение и соревнование. Кольца показывают цель для ${esc(gen)} — ` +
      `<b>${tArr.join(' → ')}</b>: спокойный вход, активная середина, тихая концовка. ` +
      `Сплошная линия — что подобралось: <b>${aArr.join(' → ')}</b>. ` +
      (hit
        ? 'Кольца надеты на точки — алгоритм попал в цель точно.'
        : 'Расхождение значит, что приёма нужной динамики под эту тему не нашлось.');
  }

  /* ---------- граф ---------- */
  function drawGraph(variant) {
    const svg = $('graph');
    const cols = { start: 178, middle: 400, end: 600 };
    const titles = { start: 'Начало', middle: 'Середина', end: 'Конец' };
    const N = 6, y0 = 62, dy = 66;

    const nodes = {};
    E.PHASES.forEach(ph => {
      const list = lastResult.candidates[ph].slice(0, N);
      const sel = variant.steps[E.PHASES.indexOf(ph)];
      if (!list.some(c => c.tech.id === sel.tech.id)) list[list.length - 1] = sel;
      nodes[ph] = list.map((c, i) => ({
        id: c.tech.id, name: c.tech.name, energy: c.tech.energy, tags: c.tech.tags,
        x: cols[ph], y: y0 + i * dy, phase: ph,
        selected: c.tech.id === sel.tech.id
      }));
    });

    const find = (ph, id) => nodes[ph].find(n => n.id === id);
    const parts = [];

    E.PHASES.forEach(ph => {
      parts.push(`<text class="g-col" x="${cols[ph]}" y="26" text-anchor="middle">${titles[ph]}</text>`);
    });

    [['start', 'middle'], ['middle', 'end']].forEach(([p1, p2]) => {
      nodes[p1].forEach(a => nodes[p2].forEach(b => {
        const link = E.linkWeight(DB, a.id, b.id);
        const common = a.tags.filter(t => b.tags.includes(t)).length;
        if (link.w === 0 && common < 2) return;
        const cls = link.w < 0 ? ' neg' : '';
        const op = link.w !== 0 ? 0.75 : 0.28;
        parts.push(`<line class="g-edge${cls}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" opacity="${op}"/>`);
      }));
    });

    const [s1, s2, s3] = variant.steps.map((s, i) => find(E.PHASES[i], s.tech.id));
    parts.push(`<path class="g-path" d="M${s1.x},${s1.y} L${s2.x},${s2.y} L${s3.x},${s3.y}"/>`);

    E.PHASES.forEach(ph => nodes[ph].forEach(n => {
      const r = 3.5 + n.energy * 1.2;
      parts.push(`<circle class="g-node${n.selected ? ' sel' : ''}" cx="${n.x}" cy="${n.y}" r="${r}"><title>${esc(n.name)} · динамика ${n.energy}</title></circle>`);
      const label = esc(cut(n.name, 20));
      if (ph === 'start') parts.push(`<text class="g-label${n.selected ? ' sel' : ''}" x="${n.x - r - 8}" y="${n.y + 4}" text-anchor="end">${label}</text>`);
      else if (ph === 'end') parts.push(`<text class="g-label${n.selected ? ' sel' : ''}" x="${n.x + r + 8}" y="${n.y + 4}" text-anchor="start">${label}</text>`);
      else parts.push(`<text class="g-label${n.selected ? ' sel' : ''}" x="${n.x}" y="${n.y - r - 7}" text-anchor="middle">${label}</text>`);
    }));

    svg.innerHTML = parts.join('');
  }

  /* ---------- утилиты ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function cut(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  document.addEventListener('DOMContentLoaded', init);
})();
