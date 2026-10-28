create table public.goals (
  id text not null default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.goal_versions (
  id text not null default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id text not null,
  revision integer not null check (revision > 0),
  title text not null check (length(trim(title)) between 1 and 80),
  activity_domain text not null check (activity_domain in ('focus', 'sport', 'habit')),
  metric text not null check (metric in ('minutes', 'sessions', 'days', 'completions')),
  target_value numeric not null check (target_value > 0),
  period text not null check (period in ('week', 'month')),
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  effective_from date not null,
  effective_until date,
  time_zone text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, goal_id, revision),
  foreign key (user_id, goal_id) references public.goals(user_id, id) on delete cascade,
  check (effective_until is null or effective_until >= effective_from),
  check (
    (activity_domain = 'focus' and metric in ('minutes', 'sessions', 'days')) or
    (activity_domain = 'sport' and metric in ('minutes', 'sessions', 'days')) or
    (activity_domain = 'habit' and metric in ('completions', 'days'))
  ),
  check (
    (period = 'week' and extract(isodow from effective_from) = 1) or
    (period = 'month' and extract(day from effective_from) = 1)
  )
);

create index goals_owner_status_idx on public.goals(user_id, status);
create index goal_versions_owner_goal_effective_idx on public.goal_versions(user_id, goal_id, effective_from desc);

alter table public.goals enable row level security;
alter table public.goal_versions enable row level security;

create policy "Users manage own goals" on public.goals for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own goal versions" on public.goal_versions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.goals, public.goal_versions to authenticated;
revoke all on public.goals, public.goal_versions from anon;

create function public.create_goal(goal_record jsonb)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  new_goal_id text := gen_random_uuid()::text;
  filters_value jsonb := coalesce(goal_record->'filters', '{}'::jsonb);
begin
  if owner_id is null then raise exception 'authentication_required'; end if;
  if jsonb_typeof(filters_value) <> 'object' then raise exception 'goal_filters_must_be_an_object'; end if;
  if goal_record->>'activity_domain' = 'habit' and filters_value ? 'habit_id' and not exists (
    select 1 from public.habits h where h.user_id = owner_id and h.id = filters_value->>'habit_id'
  ) then raise exception 'habit_not_owned_by_user'; end if;

  insert into public.goals (id, user_id) values (new_goal_id, owner_id);
  insert into public.goal_versions (user_id, goal_id, revision, title, activity_domain, metric,
    target_value, period, filters, effective_from, time_zone)
  values (owner_id, new_goal_id, 1, goal_record->>'title', goal_record->>'activity_domain',
    goal_record->>'metric', (goal_record->>'target_value')::numeric, goal_record->>'period',
    filters_value, (goal_record->>'effective_from')::date, goal_record->>'time_zone');
  return new_goal_id;
end;
$$;

create function public.seed_default_goals(goal_records jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  goal_record jsonb;
begin
  if owner_id is null then raise exception 'authentication_required'; end if;
  if jsonb_typeof(goal_records) <> 'array' then raise exception 'goal_records_must_be_an_array'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  if exists (select 1 from public.goals g where g.user_id = owner_id) then return; end if;
  for goal_record in select value from jsonb_array_elements(goal_records) loop
    perform public.create_goal(goal_record);
  end loop;
end;
$$;

create function public.revise_goal(goal_id text, goal_record jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  current_version public.goal_versions%rowtype;
  next_revision integer;
  effective_date date := (goal_record->>'effective_from')::date;
  filters_value jsonb := coalesce(goal_record->'filters', '{}'::jsonb);
begin
  if owner_id is null then raise exception 'authentication_required'; end if;
  if jsonb_typeof(filters_value) <> 'object' then raise exception 'goal_filters_must_be_an_object'; end if;
  select gv.* into current_version from public.goal_versions gv
  where gv.user_id = owner_id and gv.goal_id = revise_goal.goal_id
  order by gv.revision desc limit 1 for update;
  if not found then raise exception 'goal_not_found'; end if;
  if current_version.period <> goal_record->>'period' then raise exception 'goal_period_cannot_be_changed'; end if;
  if goal_record->>'activity_domain' = 'habit' and filters_value ? 'habit_id' and not exists (
    select 1 from public.habits h where h.user_id = owner_id and h.id = filters_value->>'habit_id'
  ) then raise exception 'habit_not_owned_by_user'; end if;

  if current_version.effective_from > (now() at time zone current_version.time_zone)::date then
    update public.goal_versions set title = goal_record->>'title',
      activity_domain = goal_record->>'activity_domain', metric = goal_record->>'metric',
      target_value = (goal_record->>'target_value')::numeric, filters = filters_value,
      time_zone = goal_record->>'time_zone'
    where user_id = owner_id and id = current_version.id;
    update public.goals set updated_at = now() where user_id = owner_id and id = revise_goal.goal_id;
    return;
  end if;
  if effective_date <= current_version.effective_from then raise exception 'revision_must_start_in_a_future_period'; end if;

  update public.goal_versions set effective_until = effective_date - 1
  where user_id = owner_id and id = current_version.id;
  select coalesce(max(gv.revision), 0) + 1 into next_revision
  from public.goal_versions gv where gv.user_id = owner_id and gv.goal_id = revise_goal.goal_id;
  insert into public.goal_versions (user_id, goal_id, revision, title, activity_domain, metric,
    target_value, period, filters, effective_from, time_zone)
  values (owner_id, revise_goal.goal_id, next_revision, goal_record->>'title',
    goal_record->>'activity_domain', goal_record->>'metric', (goal_record->>'target_value')::numeric,
    goal_record->>'period', filters_value, effective_date, goal_record->>'time_zone');
  update public.goals set updated_at = now() where user_id = owner_id and id = revise_goal.goal_id;
end;
$$;

revoke all on function public.create_goal(jsonb) from public, anon;
revoke all on function public.seed_default_goals(jsonb) from public, anon;
revoke all on function public.revise_goal(text, jsonb) from public, anon;
grant execute on function public.create_goal(jsonb) to authenticated;
grant execute on function public.seed_default_goals(jsonb) to authenticated;
grant execute on function public.revise_goal(text, jsonb) to authenticated;

-- Legacy targets have no creation history, so their first version starts this week.
do $$
declare
  legacy record;
  new_goal_id text;
  local_today date;
  week_start date;
begin
  local_today := (now() at time zone 'Europe/Berlin')::date;
  week_start := local_today - (extract(isodow from local_today)::integer - 1);
  for legacy in select * from public.weekly_goals where category <> 'Habits' loop
    new_goal_id := gen_random_uuid()::text;
    insert into public.goals (id, user_id) values (new_goal_id, legacy.user_id);
    insert into public.goal_versions (user_id, goal_id, revision, title, activity_domain, metric,
      target_value, period, filters, effective_from, time_zone)
    values (
      legacy.user_id, new_goal_id, 1, legacy.label,
      case when legacy.category = 'Sports' then 'sport' else 'focus' end,
      'minutes', legacy.target_minutes, 'week',
      case when legacy.category = 'Sports' then '{}'::jsonb
        else jsonb_build_object('focus_category', legacy.category) end,
      week_start, 'Europe/Berlin'
    );
  end loop;
end;
$$;
