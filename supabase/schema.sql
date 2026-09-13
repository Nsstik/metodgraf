-- ============================================================================
-- МетодГраф — схема базы данных для Supabase
-- Выполнить в Supabase → SQL Editor → New query → Run
-- Затем выполнить seed.sql (данные).
-- ============================================================================

-- ---------------------------------------------------------------- темы
create table if not exists public.topics (
  id    text primary key,
  grade smallint not null check (grade between 5 and 11),
  title text not null,
  tags  text[] not null default '{}'
);

comment on table  public.topics      is 'Темы школьного курса математики 5–11 класс';
comment on column public.topics.tags is 'Дидактические теги темы: чего она требует от ученика';

create index if not exists topics_grade_idx on public.topics (grade);

-- ------------------------------------------------------------- приёмы
create table if not exists public.techniques (
  id          text primary key,
  name        text not null,
  energy      smallint not null check (energy between 1 and 5),
  phases      text[] not null default '{}',   -- start | middle | end
  tags        text[] not null default '{}',
  size_min    smallint not null,
  size_max    smallint not null,
  levels      text[] not null default '{}',   -- low | mid | high
  goal        text,
  description text,
  how_to      text,
  check (size_min <= size_max)
);

comment on table  public.techniques        is 'Педагогические приёмы — вершины графа';
comment on column public.techniques.energy is 'Динамика приёма: 1 — тихий, 5 — шумный, с движением';

-- ------------------------------------------- рёбра графа сочетаемости
create table if not exists public.technique_links (
  a    text not null references public.techniques(id) on delete cascade,
  b    text not null references public.techniques(id) on delete cascade,
  w    smallint not null,      -- > 0 приёмы усиливают друг друга, < 0 конфликтуют
  note text,
  primary key (a, b)
);

comment on table public.technique_links is 'Экспертные связи сочетаемости приёмов';

-- --------------------------------------------------- лог запросов
create table if not exists public.lesson_requests (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  grade      smallint,
  topic_id   text,
  size_id    text,
  level      text,
  discipline text,
  picked     jsonb
);

comment on table public.lesson_requests is 'Обезличенный лог запросов учителей — материал для калибровки весов';

-- ============================================================================
-- Права доступа: справочники читает кто угодно, лог можно только пополнять.
-- ============================================================================

alter table public.topics           enable row level security;
alter table public.techniques       enable row level security;
alter table public.technique_links  enable row level security;
alter table public.lesson_requests  enable row level security;

drop policy if exists "public read topics"     on public.topics;
drop policy if exists "public read techniques" on public.techniques;
drop policy if exists "public read links"      on public.technique_links;
drop policy if exists "public insert requests" on public.lesson_requests;

create policy "public read topics"     on public.topics          for select using (true);
create policy "public read techniques" on public.techniques      for select using (true);
create policy "public read links"      on public.technique_links for select using (true);
create policy "public insert requests" on public.lesson_requests for insert with check (true);
-- Читать лог через публичный ключ нельзя: политики select для него нет.
