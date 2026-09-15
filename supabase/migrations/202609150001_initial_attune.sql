create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.memory_status as enum ('pending', 'approved', 'rejected', 'archived');
create type public.record_source as enum ('manual', 'telegram', 'calendar', 'user_input', 'ai_inference');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  timezone text not null default 'UTC',
  locale text not null default 'en-US',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  partner_name text not null,
  partner_timezone text not null default 'UTC',
  relationship_name text not null default 'My relationship',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.partner_profiles (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null unique references public.relationships(id) on delete cascade,
  name text not null,
  timezone text not null default 'UTC',
  birthday date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memory_sources (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships(id) on delete cascade,
  source_type public.record_source not null,
  external_id text,
  source_file text,
  source_text text not null,
  source_timestamp timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships(id) on delete cascade,
  memory_type text not null,
  content text not null,
  classification text not null default 'fact' check (classification in ('fact', 'inference')),
  importance smallint not null default 5 check (importance between 1 and 10),
  confidence real not null default 0.5 check (confidence between 0 and 1),
  source public.record_source not null,
  source_id uuid references public.memory_sources(id) on delete set null,
  status public.memory_status not null default 'pending',
  occurred_at timestamptz,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships(id) on delete cascade,
  title text not null,
  description text,
  start_time timestamptz,
  end_time timestamptz,
  event_date date,
  timezone text not null,
  participant text not null default 'partner' check (participant in ('user', 'partner', 'both')),
  importance smallint not null default 5 check (importance between 1 and 10),
  source public.record_source not null,
  source_id uuid references public.memory_sources(id) on delete set null,
  status public.memory_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time is not null or event_date is not null)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships(id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  timezone text not null,
  priority smallint not null default 5 check (priority between 1 and 10),
  status text not null default 'pending' check (status in ('pending', 'approved', 'completed', 'dismissed')),
  source public.record_source not null,
  source_id uuid references public.memory_sources(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  remind_at timestamptz,
  timezone text not null,
  recurrence text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'sent', 'dismissed')),
  source_id uuid references public.memory_sources(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships(id) on delete cascade,
  type text not null,
  summary text not null,
  occurred_at timestamptz not null,
  timezone text not null,
  source public.record_source not null,
  source_id uuid references public.memory_sources(id) on delete set null,
  status public.memory_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index memories_relationship_status_idx on public.memories(relationship_id, status);
create index calendar_events_relationship_date_idx on public.calendar_events(relationship_id, event_date, start_time);
create index tasks_relationship_status_idx on public.tasks(relationship_id, status);
create index memory_sources_relationship_idx on public.memory_sources(relationship_id);

alter table public.profiles enable row level security;
alter table public.relationships enable row level security;
alter table public.partner_profiles enable row level security;
alter table public.memory_sources enable row level security;
alter table public.memories enable row level security;
alter table public.calendar_events enable row level security;
alter table public.tasks enable row level security;
alter table public.reminders enable row level security;
alter table public.interactions enable row level security;

create function public.owns_relationship(target_relationship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.relationships
    where id = target_relationship_id and owner_user_id = auth.uid()
  );
$$;

create policy "profiles are private" on public.profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "relationships are private" on public.relationships for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy "partner profiles follow relationship owner" on public.partner_profiles for all
  using (public.owns_relationship(relationship_id)) with check (public.owns_relationship(relationship_id));
create policy "memory sources follow relationship owner" on public.memory_sources for all
  using (public.owns_relationship(relationship_id)) with check (public.owns_relationship(relationship_id));
create policy "memories follow relationship owner" on public.memories for all
  using (public.owns_relationship(relationship_id)) with check (public.owns_relationship(relationship_id));
create policy "calendar follows relationship owner" on public.calendar_events for all
  using (public.owns_relationship(relationship_id)) with check (public.owns_relationship(relationship_id));
create policy "tasks follow relationship owner" on public.tasks for all
  using (public.owns_relationship(relationship_id)) with check (public.owns_relationship(relationship_id));
create policy "reminders follow relationship owner" on public.reminders for all
  using (public.owns_relationship(relationship_id)) with check (public.owns_relationship(relationship_id));
create policy "interactions follow relationship owner" on public.interactions for all
  using (public.owns_relationship(relationship_id)) with check (public.owns_relationship(relationship_id));

create or replace function public.match_memories(
  query_embedding extensions.vector(1536),
  target_relationship_id uuid,
  match_count int default 8
)
returns table (id uuid, content text, memory_type text, classification text, confidence real, similarity float)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.id, m.content, m.memory_type, m.classification, m.confidence,
    1 - (m.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.memories m
  where m.relationship_id = target_relationship_id
    and public.owns_relationship(m.relationship_id)
    and m.status = 'approved'
    and m.embedding is not null
  order by m.embedding operator(extensions.<=>) query_embedding
  limit least(match_count, 20);
$$;
