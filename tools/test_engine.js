/* Проверка движка на всех сочетаниях параметров */
const DB = require('../js/data.js');
const E = require('../js/engine.js');

let runs = 0, fails = [], noResult = [];
const usage = {};

for (const topic of DB.TOPICS) {
  for (const size of DB.SIZES) {
    for (const level of DB.LEVELS) {
      for (const disc of DB.DISCIPLINE) {
        runs++;
        const ctx = E.makeContext({ grade: topic.grade, topicId: topic.id, sizeId: size.id, level: level.id, discipline: disc.id }, DB);
        const r = E.buildLesson(ctx, DB);
        const tag = `${topic.id}/${size.id}/${level.id}/${disc.id}`;
        if (!r.ok) { noResult.push(tag); continue; }
        const st = r.best.steps;
        const ids = st.map(s => s.tech.id);
        const en = st.map(s => s.tech.energy);

        if (new Set(ids).size !== 3) fails.push([tag, 'повтор приёма', ids]);
        if (Math.abs(en[0] - en[1]) < 1 || Math.abs(en[1] - en[2]) < 1) fails.push([tag, 'нет чередования', en]);
        E.PHASES.forEach((ph, i) => {
          const t = st[i].tech;
          if (!t.phases.includes(ph)) fails.push([tag, 'неверная фаза', t.id + '/' + ph]);
          if (!t.levels.includes(level.id)) fails.push([tag, 'уровень не подходит', t.id]);
          if (ctx.sizeMid < t.size[0] || ctx.sizeMid > t.size[1]) fails.push([tag, 'размер класса', t.id]);
        });
        if (disc.id === 'loud' && en.some(e => e === 5)) fails.push([tag, 'приём динамики 5 в шумном классе', ids]);
        ids.forEach(id => usage[id] = (usage[id] || 0) + 1);

        if (!r.alternatives || r.alternatives.length === 0) fails.push([tag, 'нет альтернатив', ids]);
      }
    }
  }
}

console.log('Сочетаний проверено:', runs);
console.log('Без результата:', noResult.length, noResult.slice(0, 5));
console.log('Ошибок:', fails.length);
fails.slice(0, 12).forEach(f => console.log('  ', f.join(' | ')));

const used = Object.keys(usage).length;
console.log(`\nЗадействовано приёмов: ${used} из ${DB.TECHNIQUES.length}`);
const unused = DB.TECHNIQUES.filter(t => !usage[t.id]).map(t => `${t.id} ${t.name}`);
if (unused.length) console.log('Не выпадали ни разу:', unused.join('; '));
const top = Object.entries(usage).sort((a, b) => b[1] - a[1]).slice(0, 6)
  .map(([id, n]) => `${DB.TECHNIQUES.find(t => t.id === id).name} (${n})`);
console.log('Чаще всего:', top.join(', '));
