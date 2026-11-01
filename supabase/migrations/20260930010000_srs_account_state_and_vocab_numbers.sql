-- Account SRS needs these two FSRS/contrast fields; browser-local state had
-- them already, but the original foundation schema did not.
alter table public.user_fsrs_state
  add column if not exists learning_steps integer not null default 0 check (learning_steps >= 0),
  add column if not exists confusions integer not null default 0 check (confusions >= 0);

-- Public numeric routing key. UUID remains the internal primary key used for
-- ownership and learning state; this is only the stable, readable URL key.
create sequence if not exists public.vocabulary_id_number_seq;
alter table public.vocabulary add column if not exists id_number bigint;
alter table public.vocabulary alter column id_number set default nextval('public.vocabulary_id_number_seq');

with numbered as (
  select id, row_number() over (order by source, source_version, source_note_id)::bigint as number
  from public.vocabulary
  where id_number is null
)
update public.vocabulary as vocabulary
set id_number = numbered.number
from numbered
where vocabulary.id = numbered.id;

select setval('public.vocabulary_id_number_seq', coalesce((select max(id_number) from public.vocabulary), 0) + 1, false);
alter table public.vocabulary alter column id_number set not null;
create unique index if not exists vocabulary_id_number_key on public.vocabulary(id_number);
