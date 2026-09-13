/* ============================================================================
   МетодГраф — движок подбора.

   Модель: приёмы — вершины графа, помеченные тегами, динамикой и фазой урока.
   Рёбра двух видов:
     1) неявные — «тематические»: приём связан с темой, если их теги пересекаются;
     2) явные   — «сценарные»: пара приёмов усиливает или подавляет друг друга (LINKS).

   Задача подбора = поиск пути длины 3 (начало → середина → конец) с максимальным
   весом при жёстком ограничении на чередование динамики.
   ============================================================================ */

(function (global) {
  'use strict';

  const PHASES = ['start', 'middle', 'end'];
  const PHASE_RU = { start: 'Начало урока', middle: 'Середина урока', end: 'Конец урока' };

  const W = {
    tag: 4.0,      // соответствие содержанию темы
    energy: 3.0,   // соответствие целевой динамике
    size: 1.0,     // комфорт по числу учеников
    link: 1.0,     // вес явного ребра графа
    contrast: 0.8  // премия за контраст динамики между соседями
  };

  /* --- Целевой профиль динамики урока --------------------------------------
     Базовый уровень задаёт дисциплина класса:
       шумный  — 2, рабочий — 3, спокойный — 4.
     Профиль урока: [база, база+1, база−1] — приём в середине самый активный,
     концовка всегда тише начала. Класс не «разгоняется» к звонку.
  --------------------------------------------------------------------------- */
  function targetProfile(disciplineId, db) {
    const d = db.DISCIPLINE.find(x => x.id === disciplineId) || db.DISCIPLINE[1];
    const clamp = v => Math.max(1, Math.min(5, v));
    return { start: clamp(d.base), middle: clamp(d.base + 1), end: clamp(d.base - 1) };
  }

  function linkWeight(db, aId, bId) {
    const l = db.LINKS.find(x => (x.a === aId && x.b === bId) || (x.a === bId && x.b === aId));
    return l ? { w: l.w, note: l.note } : { w: 0, note: null };
  }

  /* --- Оценка одного приёма в одной фазе ------------------------------------ */
  function scoreTechnique(tech, ctx, phase, db) {
    /* Соответствие содержанию считается как F-мера: учитывается и то, какую долю
       требований темы приём покрывает (полнота), и то, насколько он сам «про эту
       тему», а не универсальный (точность). Иначе приёмы с длинным списком тегов
       вытесняли бы более специализированные. */
    const topicTags = ctx.topic.tags;
    const shared = topicTags.filter(t => tech.tags.includes(t));
    const recall = topicTags.length ? shared.length / topicTags.length : 0;
    const precision = tech.tags.length ? shared.length / tech.tags.length : 0;
    const tagScore = shared.length ? (2 * recall * precision) / (recall + precision) : 0;

    const target = ctx.target[phase];
    const energyScore = 1 - Math.abs(tech.energy - target) / 4;

    const inRange = ctx.sizeMid >= tech.size[0] && ctx.sizeMid <= tech.size[1];
    const sizeScore = inRange ? 1 : 0;

    let risk = 0;
    const reasons = [];

    if (ctx.discipline === 'calm' && tech.energy <= 1 && phase !== 'end') {
      risk -= 1.5;
      reasons.push('слишком тихий приём для пассивного класса в этой части урока');
    }

    const total = W.tag * tagScore + W.energy * energyScore + W.size * sizeScore + risk;

    return {
      total,
      shared,
      tagScore,
      energyScore,
      target,
      warnings: reasons
    };
  }

  /* --- Кандидаты для фазы ---------------------------------------------------
     Жёсткие фильтры: фаза урока, численность класса, уровень подготовки и
     запрет самых шумных приёмов (динамика 5) для класса с трудной дисциплиной.
  --------------------------------------------------------------------------- */
  function candidates(ctx, phase, db) {
    return db.TECHNIQUES
      .filter(t => t.phases.includes(phase))
      .filter(t => ctx.sizeMid >= t.size[0] && ctx.sizeMid <= t.size[1])
      .filter(t => t.levels.includes(ctx.level))
      .filter(t => !(ctx.discipline === 'loud' && t.energy >= 5))
      .map(t => ({ tech: t, score: scoreTechnique(t, ctx, phase, db) }))
      .sort((a, b) => b.score.total - a.score.total)
      .slice(0, 14);
  }

  /* --- Поиск лучшего пути по графу ------------------------------------------
     Жёсткие ограничения:
       • приёмы не повторяются;
       • |динамика(i) − динамика(i+1)| ≥ 1 — соседние приёмы обязаны различаться
         по динамике (то самое чередование).
  --------------------------------------------------------------------------- */
  function buildLesson(ctx, db) {
    const cand = { start: candidates(ctx, 'start', db), middle: candidates(ctx, 'middle', db), end: candidates(ctx, 'end', db) };
    const paths = [];

    for (const a of cand.start) {
      for (const b of cand.middle) {
        if (b.tech.id === a.tech.id) continue;
        if (Math.abs(a.tech.energy - b.tech.energy) < 1) continue;
        for (const c of cand.end) {
          if (c.tech.id === a.tech.id || c.tech.id === b.tech.id) continue;
          if (Math.abs(b.tech.energy - c.tech.energy) < 1) continue;

          const lab = linkWeight(db, a.tech.id, b.tech.id);
          const lbc = linkWeight(db, b.tech.id, c.tech.id);

          const contrast = W.contrast *
            (Math.min(Math.abs(a.tech.energy - b.tech.energy), 2) +
             Math.min(Math.abs(b.tech.energy - c.tech.energy), 2)) / 4;

          const total = a.score.total + b.score.total + c.score.total +
                        W.link * (lab.w + lbc.w) + contrast;

          paths.push({ steps: [a, b, c], links: [lab, lbc], contrast, total });
        }
      }
    }

    paths.sort((x, y) => y.total - x.total);
    if (!paths.length) return { ok: false, candidates: cand };

    // Альтернативы — пути, отличающиеся хотя бы двумя приёмами из трёх.
    const best = paths[0];
    const alternatives = [];
    for (const p of paths.slice(1)) {
      const overlap = p.steps.filter((s, i) => s.tech.id === best.steps[i].tech.id).length;
      if (overlap <= 1 && !alternatives.some(a => a.steps.every((s, i) => s.tech.id === p.steps[i].tech.id))) {
        alternatives.push(p);
      }
      if (alternatives.length === 2) break;
    }

    return { ok: true, best, alternatives, candidates: cand };
  }

  /* --- Человекочитаемое обоснование ----------------------------------------- */
  function explain(step, phase, ctx) {
    const s = step.score, t = step.tech, out = [];
    if (s.shared.length) {
      out.push('содержание темы: ' + s.shared.join(', '));
    } else {
      out.push('универсальный приём, не привязан к типу содержания');
    }
    const diff = Math.abs(t.energy - s.target);
    out.push(diff === 0
      ? `динамика ${t.energy} — ровно целевая для этой части урока`
      : `динамика ${t.energy} при целевой ${s.target} (отклонение ${diff})`);
    out.push(`рассчитан на ${t.size[0]}–${t.size[1]} учеников`);
    return out;
  }

  function makeContext(input, db) {
    const topic = db.TOPICS.find(t => t.id === input.topicId);
    const size = db.SIZES.find(s => s.id === input.sizeId);
    return {
      grade: input.grade,
      topic,
      sizeId: input.sizeId,
      sizeMid: size ? size.mid : 20,
      sizeLabel: size ? size.label : '',
      level: input.level,
      discipline: input.discipline,
      target: targetProfile(input.discipline, db)
    };
  }

  const API = { PHASES, PHASE_RU, W, targetProfile, candidates, buildLesson, explain, makeContext, linkWeight, scoreTechnique };
  if (typeof window !== 'undefined') window.MG_ENGINE = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
