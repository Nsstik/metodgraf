/* ============================================================================
   МетодГраф — слой данных.

   Один интерфейс, два источника:
     • Supabase (REST) — если в js/config.js заданы URL и публичный ключ;
     • локальный js/data.js — если нет или если запрос не удался.

   Библиотека supabase-js не нужна: используется обычный REST-эндпоинт PostgREST.
   ============================================================================ */

(function (global) {
  'use strict';

  const cfg = () => (global.MG_CONFIG || {});
  const configured = () => !!(cfg().SUPABASE_URL && cfg().SUPABASE_ANON_KEY);

  /* Заголовки запроса.
     Новые публичные ключи Supabase (sb_publishable_…) не являются JWT, и слать
     их в Authorization: Bearer нельзя — проверка подписи падает. Устаревшие
     ключи anon (строка на eyJ…) — наоборот, обычные JWT, и их принято слать
     в обоих заголовках. Поэтому определяем вид ключа по его началу. */
  function authHeaders() {
    const key = cfg().SUPABASE_ANON_KEY || '';
    const h = { apikey: key };
    if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
    return h;
  }

  async function sbSelect(table, query) {
    const { SUPABASE_URL } = cfg();
    const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}?${query || 'select=*'}`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
    return res.json();
  }

  function fromRows(topics, techniques, links) {
    return {
      TAGS: global.LOCAL_DB.TAGS,
      SIZES: global.LOCAL_DB.SIZES,
      LEVELS: global.LOCAL_DB.LEVELS,
      DISCIPLINE: global.LOCAL_DB.DISCIPLINE,
      TOPICS: topics.map(r => ({ id: r.id, grade: r.grade, title: r.title, tags: r.tags || [] })),
      TECHNIQUES: techniques.map(r => ({
        id: r.id, name: r.name, energy: r.energy,
        phases: r.phases || [], tags: r.tags || [],
        size: [r.size_min, r.size_max], levels: r.levels || [],
        goal: r.goal, desc: r.description, how: r.how_to
      })),
      LINKS: links.map(r => ({ a: r.a, b: r.b, w: r.w, note: r.note }))
    };
  }

  async function load() {
    if (!configured()) {
      return { source: 'local', note: 'локальная база (Supabase не подключён)', db: global.LOCAL_DB };
    }
    try {
      const [topics, techniques, links] = await Promise.all([
        sbSelect('topics', 'select=*&order=id'),
        sbSelect('techniques', 'select=*&order=id'),
        sbSelect('technique_links', 'select=*')
      ]);
      if (!topics.length || !techniques.length) throw new Error('таблицы пустые — выполните setup.sql');
      return { source: 'supabase', note: 'данные из Supabase', db: fromRows(topics, techniques, links) };
    } catch (e) {
      console.warn('[МетодГраф] Supabase недоступен, работаем на локальных данных:', e.message);
      return { source: 'local', note: 'локальная база (Supabase не ответил)', db: global.LOCAL_DB, error: e.message };
    }
  }

  /* Обезличенный лог запроса — материал для будущего анализа: какие сочетания
     параметров учителя встречаются чаще всего и какие приёмы система выдаёт. */
  async function logRequest(ctx, picked) {
    if (!configured() || cfg().LOG_REQUESTS === false) return;
    const { SUPABASE_URL } = cfg();
    try {
      await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/lesson_requests`, {
        method: 'POST',
        headers: Object.assign(authHeaders(), {
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        }),
        body: JSON.stringify({
          grade: ctx.grade, topic_id: ctx.topic.id, size_id: ctx.sizeId,
          level: ctx.level, discipline: ctx.discipline, picked
        })
      });
    } catch (e) {
      console.warn('[МетодГраф] лог не записан:', e.message);
    }
  }

  global.MG_STORE = { load, logRequest, configured };
})(typeof globalThis !== 'undefined' ? globalThis : this);
