-- Separate a session's activity area from its Deep Work flag.
alter table public.focus_sessions
  drop constraint if exists focus_sessions_category_check;
alter table public.user_state
  drop constraint if exists user_state_category_check;

alter table public.focus_sessions
  add column if not exists is_deep_work boolean not null default false;
alter table public.user_state
  add column if not exists timer_is_deep_work boolean not null default false;

update public.focus_sessions
set is_deep_work = coalesce(is_deep_work, false) or category = 'Deep Work',
    category = case when category = 'Deep Work'
      then case when project_id is null then 'Other' else 'Project' end
      else category end;
update public.user_state
set timer_is_deep_work = coalesce(timer_is_deep_work, false) or category = 'Deep Work',
    category = case when category = 'Deep Work'
      then case when project_id is null then 'Other' else 'Project' end
      else category end;

alter table public.focus_sessions alter column is_deep_work set default false;
alter table public.focus_sessions alter column is_deep_work set not null;
alter table public.user_state alter column timer_is_deep_work set default false;
alter table public.user_state alter column timer_is_deep_work set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.focus_sessions'::regclass
    and conname = 'focus_sessions_category_check') then
    alter table public.focus_sessions add constraint focus_sessions_category_check
      check (category in ('Learning', 'Project', 'Other'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.user_state'::regclass
    and conname = 'user_state_category_check') then
    alter table public.user_state add constraint user_state_category_check
      check (category in ('Learning', 'Project', 'Other'));
  end if;
end;
$$;

-- Preserve historical Deep Work goal meaning with the new independent filter.
update public.goal_versions
set filters = (filters - 'focus_category') || jsonb_build_object('is_deep_work', true)
where activity_domain = 'focus' and filters->>'focus_category' = 'Deep Work';

create or replace function public.import_focusos_data(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'authentication_required'; end if;
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
  insert into public.focus_sessions (user_id, id, title, category, is_deep_work, project_id,
    start_at, end_at, duration_minutes, duration_seconds, rating, notes)
  select owner_id, item.id, item.title,
    case when item.category = 'Deep Work' then case when item.project_id is null then 'Other' else 'Project' end else item.category end,
    coalesce(item.is_deep_work, item.category = 'Deep Work'), item.project_id,
    item.start_at, item.end_at, item.duration_minutes, item.duration_seconds, item.rating, item.notes
  from jsonb_to_recordset(coalesce(payload->'sessions', '[]'::jsonb))
    as item(id text, title text, category text, is_deep_work boolean, project_id text,
      start_at timestamptz, end_at timestamptz, duration_minutes numeric,
      duration_seconds integer, rating integer, notes text);
  insert into public.habit_completions (user_id, id, habit_id, date)
  select owner_id, item.id, item.habit_id, item.date
  from jsonb_to_recordset(coalesce(payload->'completions', '[]'::jsonb))
    as item(id text, habit_id text, date date);
  insert into public.user_state (user_id, timer_status, title, category, timer_is_deep_work,
    project_id, began_at, started_at, elapsed_ms)
  select owner_id, item.timer_status, item.title,
    case when item.category = 'Deep Work' then case when item.project_id is null then 'Other' else 'Project' end else item.category end,
    coalesce(item.timer_is_deep_work, item.category = 'Deep Work'),
    item.project_id, item.began_at, item.started_at, item.elapsed_ms
  from jsonb_to_recordset(jsonb_build_array(payload->'timer'))
    as item(timer_status text, title text, category text, timer_is_deep_work boolean,
      project_id text, began_at bigint, started_at bigint, elapsed_ms bigint);
end;
$$;

create or replace function public.finish_focus_session(session_record jsonb, timer_record jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'authentication_required'; end if;
  insert into public.focus_sessions (user_id, id, title, category, is_deep_work, project_id,
    start_at, end_at, duration_minutes, duration_seconds, rating, notes)
  select owner_id, item.id, item.title,
    case when item.category = 'Deep Work' then case when item.project_id is null then 'Other' else 'Project' end else item.category end,
    coalesce(item.is_deep_work, item.category = 'Deep Work'), item.project_id,
    item.start_at, item.end_at, item.duration_minutes, item.duration_seconds, item.rating, item.notes
  from jsonb_to_record(session_record)
    as item(id text, title text, category text, is_deep_work boolean, project_id text,
      start_at timestamptz, end_at timestamptz, duration_minutes numeric,
      duration_seconds integer, rating integer, notes text);
  insert into public.user_state (user_id, timer_status, title, category, timer_is_deep_work,
    project_id, began_at, started_at, elapsed_ms)
  select owner_id, item.timer_status, item.title,
    case when item.category = 'Deep Work' then case when item.project_id is null then 'Other' else 'Project' end else item.category end,
    coalesce(item.timer_is_deep_work, item.category = 'Deep Work'),
    item.project_id, item.began_at, item.started_at, item.elapsed_ms
  from jsonb_to_record(timer_record)
    as item(timer_status text, title text, category text, timer_is_deep_work boolean,
      project_id text, began_at bigint, started_at bigint, elapsed_ms bigint)
  on conflict (user_id) do update set
    timer_status = excluded.timer_status,
    title = excluded.title,
    category = excluded.category,
    timer_is_deep_work = excluded.timer_is_deep_work,
    project_id = excluded.project_id,
    began_at = excluded.began_at,
    started_at = excluded.started_at,
    elapsed_ms = excluded.elapsed_ms;
end;
$$;
