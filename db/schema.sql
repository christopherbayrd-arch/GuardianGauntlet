-- ============================================================
--  Guardian Gauntlet — database schema (Postgres / Neon)
--  How to run: Neon Console → your project → SQL Editor →
--  paste this whole file → Run. Safe to run more than once.
-- ============================================================

create table if not exists games (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  title         text not null default 'Untitled game',
  status        text not null default 'draft'
                check (status in ('draft', 'open', 'locked', 'results')),
  current_index int  not null default 0,   -- which question the results walkthrough is on
  reveal        boolean not null default false, -- whether the correct answer is highlighted
  created_at    timestamptz not null default now()
);

create table if not exists questions (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references games (id) on delete cascade,
  position      int  not null default 0,
  prompt        text not null,
  options       jsonb not null default '[]'::jsonb, -- array of option strings
  correct_index int  not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists questions_game_idx on questions (game_id, position);

create table if not exists participants (
  id         uuid primary key,
  game_id    uuid not null references games (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists participants_game_idx on participants (game_id);

create table if not exists answers (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references games (id) on delete cascade,
  question_id    uuid not null references questions (id) on delete cascade,
  participant_id uuid not null references participants (id) on delete cascade,
  choice_index   int  not null,
  created_at     timestamptz not null default now(),
  unique (question_id, participant_id)     -- one answer per person per question
);
create index if not exists answers_game_idx on answers (game_id);
create index if not exists answers_question_idx on answers (question_id);

-- ── Sample game so you can test right away (safe to delete) ─

insert into games (code, title, status)
values ('DEMO1', 'Demo — Guardian Gauntlet test drive', 'draft')
on conflict (code) do nothing;

insert into questions (game_id, position, prompt, options, correct_index)
select g.id, v.position, v.prompt, v.options::jsonb, v.correct_index
from games g,
     (values
       (0, 'Where is Guardian Pharmacy''s home office?',
           '["Atlanta, GA","Portland, ME","Dallas, TX","Columbus, OH"]', 0),
       (1, 'What does NDC stand for?',
           '["National Drug Code","New Dispensing Category","Nightly Dose Check","National Distribution Chain"]', 0),
       (2, 'Which of these is NOT a real drug name?',
           '["Farxiga","Xigduo","Zolpivex","Jardiance"]', 2)
     ) as v(position, prompt, options, correct_index)
where g.code = 'DEMO1'
  and not exists (select 1 from questions q where q.game_id = g.id);
