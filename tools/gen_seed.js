/* Генерация supabase/seed.sql из js/data.js.
   Запуск:  node tools/gen_seed.js                                            */
const fs = require('fs');
const path = require('path');
const DB = require('../js/data.js');

const q = s => s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`;
const arr = a => `array[${a.map(q).join(',')}]::text[]`;

const out = [];
out.push('-- ============================================================================');
out.push('-- МетодГраф — данные прототипа. Файл сгенерирован из js/data.js');
out.push('-- Выполнять ПОСЛЕ schema.sql');
out.push('-- ============================================================================\n');
out.push('truncate table public.technique_links, public.techniques, public.topics cascade;\n');

out.push('-- ------------------------------------------------------------------ темы');
out.push('insert into public.topics (id, grade, title, tags) values');
out.push(DB.TOPICS.map(t => `  (${q(t.id)}, ${t.grade}, ${q(t.title)}, ${arr(t.tags)})`).join(',\n') + ';\n');

out.push('-- ---------------------------------------------------------------- приёмы');
out.push('insert into public.techniques (id, name, energy, phases, tags, size_min, size_max, levels, goal, description, how_to) values');
out.push(DB.TECHNIQUES.map(t =>
  `  (${q(t.id)}, ${q(t.name)}, ${t.energy}, ${arr(t.phases)}, ${arr(t.tags)}, ${t.size[0]}, ${t.size[1]}, ${arr(t.levels)},\n` +
  `   ${q(t.goal)},\n   ${q(t.desc)},\n   ${q(t.how)})`).join(',\n') + ';\n');

out.push('-- -------------------------------------------------- рёбра графа приёмов');
out.push('insert into public.technique_links (a, b, w, note) values');
out.push(DB.LINKS.map(l => `  (${q(l.a)}, ${q(l.b)}, ${l.w}, ${q(l.note)})`).join(',\n') + ';\n');

const file = path.join(__dirname, '..', 'supabase', 'seed.sql');
fs.writeFileSync(file, out.join('\n'), 'utf8');
console.log('Записано:', file,
  `(${DB.TOPICS.length} тем, ${DB.TECHNIQUES.length} приёмов, ${DB.LINKS.length} связей)`);
