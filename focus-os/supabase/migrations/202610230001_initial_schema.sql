create table public.projects (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  color text not null,
  status text not null check (status in ('Active', 'Paused', 'Completed')),
  created_at date not null,
  primary key (user_id, id)
);

create table public.habits (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  archived boolean not null default false,
  created_at date not null,
  primary key (user_id, id)
);

create table public.focus_sessions (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null check (category in ('Learning', 'Project', 'Deep Work')),
  project_id text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_minutes numeric not null check (duration_minutes >= 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  rating integer not null check (rating between 0 and 5),
  notes text not null default '',
  primary key (user_id, id),
  constraint focus_sessions_project_owner_fk
    foreign key (user_id, project_id) references public.projects(user_id, id)
);

create table public.sports (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  sport text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  date date not null,
  intensity integer not null check (intensity between 1 and 5),
  notes text not null default '',
  primary key (user_id, id)
);

create table public.habit_completions (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id text not null,
  date date not null,
  primary key (user_id, id),
  constraint habit_completions_habit_owner_fk
    foreign key (user_id, habit_id) references public.habits(user_id, id) on delete cascade,
  constraint habit_completions_once_per_day unique (user_id, habit_id, date)
);

create table public.weekly_goals (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  target_minutes integer not null check (target_minutes > 0),
  category text not null check (category in ('Learning', 'Project', 'Deep Work', 'Sports', 'Habits')),
  primary key (user_id, id)
);

create table public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timer_status text not null check (timer_status in ('idle', 'running', 'paused')),
  title text not null default '',
  category text not null check (category in ('Learning', 'Project', 'Deep Work')),
  project_id text,
  began_at bigint,
  started_at bigint,
  elapsed_ms bigint not null default 0 check (elapsed_ms >= 0)
);

create index focus_sessions_owner_started_idx on public.focus_sessions(user_id, start_at desc);
create index sports_owner_date_idx on public.sports(user_id, date desc);
create index completions_owner_date_idx on public.habit_completions(user_id, date desc);
create unique index one_pending_focus_review_per_user on public.focus_sessions(user_id) where rating = 0;

alter table public.projects enable row level security;
alter table public.habits enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.sports enable row level security;
alter table public.habit_completions enable row level security;
alter table public.weekly_goals enable row level security;
alter table public.user_state enable row level security;

create policy "Users manage own projects" on public.projects for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own habits" on public.habits for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own focus sessions" on public.focus_sessions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own sports" on public.sports for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own habit completions" on public.habit_completions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own weekly goals" on public.weekly_goals for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own state" on public.user_state for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.projects, public.habits,
  public.focus_sessions, public.sports, public.habit_completions,
  public.weekly_goals, public.user_state to authenticated;
revoke all on public.projects, public.habits, public.focus_sessions,
  public.sports, public.habit_completions, public.weekly_goals,
  public.user_state from anon;

create function public.create_sports_habit_for_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.habits (id, user_id, name, color, archived, created_at)
  values ('habit-sports-auto', new.user_id, 'Sports', 'orange', false, current_date)
  on conflict (user_id, id) do nothing;
  return new;
end;
$$;

create trigger create_sports_habit_after_insert
after insert on public.sports
for each row execute function public.create_sports_habit_for_owner();

create function public.import_focusos_data(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null then
    raise exception 'authentication_required';
  end if;

  if exists (select 1 from public.projects where user_id = owner_id)
    or exists (select 1 from public.habits where user_id = owner_id)
    or exists (select 1 from public.focus_sessions where user_id = owner_id)
    or exists (select 1 from public.sports where user_id = owner_id)
    or exists (select 1 from public.habit_completions where user_id = owner_id) then
    raise exception 'account_not_empty';
  end if;

  delete from public.weekly_goals where user_id = owner_id;
  delete from public.user_state where user_id = owner_id;

  insert into public.projects (user_id, id, name, description, color, status, created_at)
  select owner_id, item.id, item.name, item.description, item.color, item.status, item.created_at
  from jsonb_to_recordset(coalesce(payload->'projects', '[]'::jsonb))
    as item(id text, name text, description text, color text, status text, created_at date);

  insert into public.habits (user_id, id, name, color, archived, created_at)
  select owner_id, item.id, item.name, item.color, item.archived, item.created_at
  from jsonb_to_recordset(coalesce(payload->'habits', '[]'::jsonb))
    as item(id text, name text, color text, archived boolean, created_at date);

  insert into public.weekly_goals (user_id, id, label, target_minutes, category)
  select owner_id, item.id, item.label, item.target_minutes, item.category
  from jsonb_to_recordset(coalesce(payload->'goals', '[]'::jsonb))
    as item(id text, label text, target_minutes integer, category text);

  insert into public.sports (user_id, id, sport, duration_minutes, date, intensity, notes)
  select owner_id, item.id, item.sport, item.duration_minutes, item.date, item.intensity, item.notes
  from jsonb_to_recordset(coalesce(payload->'sports', '[]'::jsonb))
    as item(id text, sport text, duration_minutes integer, date date, intensity integer, notes text);

  insert into public.focus_sessions (user_id, id, title, category, project_id, start_at, end_at, duration_minutes, duration_seconds, rating, notes)
  select owner_id, item.id, item.title, item.category, item.project_id, item.start_at, item.end_at, item.duration_minutes, item.duration_seconds, item.rating, item.notes
  from jsonb_to_recordset(coalesce(payload->'sessions', '[]'::jsonb))
    as item(id text, title text, category text, project_id text, start_at timestamptz, end_at timestamptz, duration_minutes numeric, duration_seconds integer, rating integer, notes text);

  insert into public.habit_completions (user_id, id, habit_id, date)
  select owner_id, item.id, item.habit_id, item.date
  from jsonb_to_recordset(coalesce(payload->'completions', '[]'::jsonb))
    as item(id text, habit_id text, date date);

  insert into public.user_state (user_id, timer_status, title, category, project_id, began_at, started_at, elapsed_ms)
  select owner_id, item.timer_status, item.title, item.category, item.project_id, item.began_at, item.started_at, item.elapsed_ms
  from jsonb_to_recordset(jsonb_build_array(payload->'timer'))
    as item(timer_status text, title text, category text, project_id text, began_at bigint, started_at bigint, elapsed_ms bigint);
end;
$$;

revoke execute on function public.import_focusos_data(jsonb) from public, anon;
grant execute on function public.import_focusos_data(jsonb) to authenticated;
revoke execute on function public.create_sports_habit_for_owner() from public, anon;
grant execute on function public.create_sports_habit_for_owner() to authenticated;

create function public.finish_focus_session(session_record jsonb, timer_record jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null then
    raise exception 'authentication_required';
  end if;

  insert into public.focus_sessions (user_id, id, title, category, project_id, start_at, end_at, duration_minutes, duration_seconds, rating, notes)
  select owner_id, item.id, item.title, item.category, item.project_id, item.start_at, item.end_at, item.duration_minutes, item.duration_seconds, item.rating, item.notes
  from jsonb_to_record(session_record)
    as item(id text, title text, category text, project_id text, start_at timestamptz, end_at timestamptz, duration_minutes numeric, duration_seconds integer, rating integer, notes text);

  insert into public.user_state (user_id, timer_status, title, category, project_id, began_at, started_at, elapsed_ms)
  select owner_id, item.timer_status, item.title, item.category, item.project_id, item.began_at, item.started_at, item.elapsed_ms
  from jsonb_to_record(timer_record)
    as item(timer_status text, title text, category text, project_id text, began_at bigint, started_at bigint, elapsed_ms bigint)
  on conflict (user_id) do update set
    timer_status = excluded.timer_status,
    title = excluded.title,
    category = excluded.category,
    project_id = excluded.project_id,
    began_at = excluded.began_at,
    started_at = excluded.started_at,
    elapsed_ms = excluded.elapsed_ms;
end;
$$;

revoke execute on function public.finish_focus_session(jsonb, jsonb) from public, anon;
grant execute on function public.finish_focus_session(jsonb, jsonb) to authenticated;
