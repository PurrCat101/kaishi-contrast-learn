create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_version text not null,
  package_sha256 text not null,
  importer_version text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  notes_count integer not null default 0 check (notes_count >= 0),
  cards_count integer not null default 0 check (cards_count >= 0),
  media_count integer not null default 0 check (media_count >= 0),
  error_summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_version, package_sha256)
);

create table public.decks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  source text not null,
  source_version text not null,
  source_deck_id text,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_version, source_deck_id)
);

create table public.source_models (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  source_model_id text not null,
  name text not null,
  fields jsonb not null default '[]'::jsonb,
  templates jsonb not null default '[]'::jsonb,
  raw_model jsonb not null default '{}'::jsonb,
  unique (import_batch_id, source_model_id)
);

create table public.source_field_mappings (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_version text not null,
  model_name text not null,
  mapping_version text not null,
  mapping jsonb not null,
  created_at timestamptz not null default now(),
  unique (source, source_version, model_name, mapping_version)
);

create table public.source_notes_raw (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  source_note_id text not null,
  source_guid text,
  source_model_id text,
  source_deck_id text,
  fields jsonb not null,
  tags jsonb not null default '[]'::jsonb,
  raw_hash text not null,
  created_at timestamptz not null default now(),
  unique (import_batch_id, source_note_id)
);

create table public.vocabulary (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid references public.decks(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete cascade,
  source text not null check (source in ('kaishi', 'user', 'imported', 'system')),
  source_id text,
  source_note_id text,
  source_version text,
  word text not null,
  meaning text not null,
  part_of_speech text,
  notes text,
  pitch_accent_raw text,
  pitch_accent_notes text,
  frequency integer check (frequency is null or frequency >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source = 'user') = (owner_user_id is not null)),
  unique (source, source_version, source_note_id)
);

create table public.vocabulary_readings (
  id uuid primary key default gen_random_uuid(),
  vocabulary_id uuid not null references public.vocabulary(id) on delete cascade,
  reading text not null,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vocabulary_id, reading)
);

create unique index vocabulary_one_primary_reading_idx
  on public.vocabulary_readings(vocabulary_id)
  where is_primary;

create table public.vocabulary_examples (
  id uuid primary key default gen_random_uuid(),
  vocabulary_id uuid not null references public.vocabulary(id) on delete cascade,
  sentence text not null,
  translation text,
  furigana text,
  source_html jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vocabulary_relations (
  id uuid primary key default gen_random_uuid(),
  vocabulary_id uuid not null references public.vocabulary(id) on delete cascade,
  related_vocabulary_id uuid not null references public.vocabulary(id) on delete cascade,
  relation_type text not null check (relation_type in ('HOMOPHONE', 'SAME_KANJI', 'SIMILAR_MEANING', 'SYNONYM', 'ANTONYM', 'RELATED', 'EASILY_CONFUSED')),
  is_directional boolean not null default false,
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  source text not null,
  source_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (vocabulary_id <> related_vocabulary_id),
  unique (vocabulary_id, related_vocabulary_id, relation_type, source)
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid references public.import_batches(id) on delete set null,
  original_filename text not null,
  checksum_sha256 text not null,
  mime_type text not null,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  storage_bucket text not null,
  storage_path text not null,
  status text not null default 'pending' check (status in ('pending', 'uploaded', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (checksum_sha256),
  unique (storage_bucket, storage_path)
);

create table public.vocabulary_media (
  vocabulary_id uuid not null references public.vocabulary(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  role text not null check (role in ('WORD_AUDIO', 'SENTENCE_AUDIO', 'PICTURE', 'OTHER')),
  source_field text,
  sort_order integer not null default 0,
  primary key (vocabulary_id, media_asset_id, role)
);

create table public.source_cards (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  source_card_id text not null,
  source_note_id text not null,
  source_deck_id text,
  ordinal integer,
  raw_card jsonb not null,
  unique (import_batch_id, source_card_id)
);

create table public.source_revlog (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  source_review_id text not null,
  source_card_id text,
  reviewed_at timestamptz,
  raw_review jsonb not null,
  unique (import_batch_id, source_review_id)
);

create table public.vocabulary_enrichment (
  id uuid primary key default gen_random_uuid(),
  vocabulary_id uuid not null references public.vocabulary(id) on delete cascade,
  type text not null check (type in ('USAGE', 'NUANCE', 'DISCRIMINATION', 'COMMON_MISTAKE', 'MEMORY_HINT', 'CONTEXT')),
  content jsonb not null,
  source text not null,
  model text,
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'GENERATED', 'VALIDATED', 'REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_vocabulary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vocabulary_id uuid not null references public.vocabulary(id) on delete cascade,
  is_active boolean not null default true,
  is_suspended boolean not null default false,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, vocabulary_id)
);

create table public.user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vocabulary_id uuid not null references public.vocabulary(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  auto_play_audio boolean not null default true,
  show_reading boolean not null default true,
  show_image boolean not null default true,
  show_example boolean not null default true,
  show_pitch_accent boolean not null default true,
  auto_play_after_reveal boolean not null default true,
  daily_new_limit integer not null default 10 check (daily_new_limit >= 0),
  daily_review_limit integer not null default 100 check (daily_review_limit >= 0),
  session_size integer not null default 20 check (session_size > 0),
  recall_cards_enabled boolean not null default true,
  contrast_cards_enabled boolean not null default true,
  context_cards_enabled boolean not null default true,
  confusion_reinforcement_enabled boolean not null default true,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  font_size text not null default 'comfortable' check (font_size in ('compact', 'comfortable')),
  japanese_font_size integer not null default 100 check (japanese_font_size between 75 and 200),
  keyboard_shortcuts_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_vocabulary_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vocabulary_id uuid not null references public.vocabulary(id) on delete cascade,
  status text not null default 'NEW' check (status in ('NEW', 'LEARNING', 'REVIEW', 'SUSPENDED')),
  recall_state text not null default 'NEW',
  discrimination_state text not null default 'NEW',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, vocabulary_id)
);

create table public.user_fsrs_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vocabulary_id uuid not null references public.vocabulary(id) on delete cascade,
  dimension text not null check (dimension in ('RECALL', 'DISCRIMINATION')),
  due timestamptz,
  stability numeric,
  difficulty numeric,
  elapsed_days integer not null default 0 check (elapsed_days >= 0),
  scheduled_days integer not null default 0 check (scheduled_days >= 0),
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  state integer not null default 0,
  last_review timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, vocabulary_id, dimension)
);

create table public.review_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vocabulary_id uuid not null references public.vocabulary(id) on delete cascade,
  card_type text not null check (card_type in ('RECALL', 'READING', 'MEANING', 'DISCRIMINATION', 'CONTEXT')),
  rating integer not null check (rating between 1 and 4),
  reviewed_at timestamptz not null default now(),
  previous_state jsonb,
  new_state jsonb,
  response_time_ms integer check (response_time_ms is null or response_time_ms >= 0),
  related_vocabulary_id uuid references public.vocabulary(id) on delete set null
);

create index vocabulary_search_idx on public.vocabulary using gin (
  to_tsvector('simple', concat_ws(' ', word, meaning, part_of_speech, notes))
);
create index vocabulary_source_idx on public.vocabulary(source, source_version, source_note_id);
create index vocabulary_readings_reading_idx on public.vocabulary_readings(reading);
create index relations_lookup_idx on public.vocabulary_relations(vocabulary_id, relation_type);
create index relations_reverse_lookup_idx on public.vocabulary_relations(related_vocabulary_id, relation_type);
create index media_assets_status_idx on public.media_assets(status);
create index user_vocabulary_user_idx on public.user_vocabulary(user_id, is_active);
create index user_notes_user_idx on public.user_notes(user_id, updated_at desc);
create index user_state_due_idx on public.user_fsrs_state(user_id, due);
create index review_history_user_time_idx on public.review_history(user_id, reviewed_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'import_batches', 'decks', 'vocabulary', 'vocabulary_readings',
    'vocabulary_examples', 'vocabulary_relations', 'media_assets',
    'vocabulary_enrichment', 'user_vocabulary', 'user_notes',
    'user_settings', 'user_vocabulary_state', 'user_fsrs_state'
  ] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end;
$$;

alter table public.user_vocabulary enable row level security;
alter table public.user_notes enable row level security;
alter table public.user_settings enable row level security;
alter table public.user_vocabulary_state enable row level security;
alter table public.user_fsrs_state enable row level security;
alter table public.review_history enable row level security;

create policy user_vocabulary_owner_policy on public.user_vocabulary
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy user_notes_owner_policy on public.user_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy user_settings_owner_policy on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy user_vocabulary_state_owner_policy on public.user_vocabulary_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy user_fsrs_state_owner_policy on public.user_fsrs_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy review_history_owner_policy on public.review_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);