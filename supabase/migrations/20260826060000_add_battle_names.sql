create or replace function public.duel_clean_nickname(p_nickname text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  clean_name text := left(regexp_replace(trim(coalesce(p_nickname, '')), '[^0-9A-Za-z가-힣 _-]', '', 'g'), 10);
begin
  clean_name := regexp_replace(clean_name, '\s+', ' ', 'g');
  if char_length(clean_name) < 2 then raise exception 'INVALID_NICKNAME'; end if;
  if lower(regexp_replace(clean_name, '\s', '', 'g')) in ('관리자', '운영자', 'admin', 'toss', '토스') then
    raise exception 'RESERVED_NICKNAME';
  end if;
  return clean_name;
end;
$$;

create or replace function public.duel_validate_nickname_row()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name in ('duel_queue', 'duel_profiles', 'duel_runs') then
    new.nickname := public.duel_clean_nickname(new.nickname);
  elsif tg_table_name = 'duel_matches' then
    new.player_one_name := public.duel_clean_nickname(new.player_one_name);
    new.player_two_name := public.duel_clean_nickname(new.player_two_name);
  elsif tg_table_name = 'duel_invites' then
    new.host_name := public.duel_clean_nickname(new.host_name);
    if new.guest_name is not null then new.guest_name := public.duel_clean_nickname(new.guest_name); end if;
  end if;
  return new;
end;
$$;

drop trigger if exists duel_queue_validate_nickname on public.duel_queue;
create trigger duel_queue_validate_nickname before insert or update of nickname on public.duel_queue
for each row execute function public.duel_validate_nickname_row();

drop trigger if exists duel_profiles_validate_nickname on public.duel_profiles;
create trigger duel_profiles_validate_nickname before insert or update of nickname on public.duel_profiles
for each row execute function public.duel_validate_nickname_row();

drop trigger if exists duel_runs_validate_nickname on public.duel_runs;
create trigger duel_runs_validate_nickname before insert or update of nickname on public.duel_runs
for each row execute function public.duel_validate_nickname_row();

drop trigger if exists duel_matches_validate_nickname on public.duel_matches;
create trigger duel_matches_validate_nickname before insert or update of player_one_name, player_two_name on public.duel_matches
for each row execute function public.duel_validate_nickname_row();

drop trigger if exists duel_invites_validate_nickname on public.duel_invites;
create trigger duel_invites_validate_nickname before insert or update of host_name, guest_name on public.duel_invites
for each row execute function public.duel_validate_nickname_row();

create or replace function public.duel_set_nickname(p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  clean_name text := public.duel_clean_nickname(p_nickname);
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;

  insert into public.duel_profiles (user_id, nickname)
  values (me, clean_name)
  on conflict (user_id) do update set nickname = excluded.nickname, updated_at = now();

  update public.duel_queue set nickname = clean_name where user_id = me;
  return public.duel_get_profile();
end;
$$;

create or replace function public.duel_weekly_league()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with weekly_wins as (
    select
      winner_id as user_id,
      max(case when winner_id = player_one then player_one_name else player_two_name end) as snapshot_name,
      count(*)::integer as wins,
      sum(case when opponent_kind = 'live' then 3 else 1 end)::integer as points,
      min(winner_elapsed_ms)::integer as fastest_win_ms
    from public.duel_matches
    where status = 'finished'
      and winner_id is not null
      and match_source <> 'invite'
      and finished_at >= (date_trunc('week', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
    group by winner_id
  ), named as (
    select weekly_wins.user_id, coalesce(profile.nickname, weekly_wins.snapshot_name) as nickname,
      weekly_wins.wins, weekly_wins.points, weekly_wins.fastest_win_ms
    from weekly_wins
    left join public.duel_profiles profile on profile.user_id = weekly_wins.user_id
  ), ranked as (
    select user_id, nickname, wins, points, fastest_win_ms,
      row_number() over (order by points desc, fastest_win_ms asc nulls last, user_id)::integer as rank
    from named
  )
  select jsonb_build_object(
    'weekStartsAt', extract(epoch from (date_trunc('week', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')) * 1000,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', rank, 'nickname', nickname, 'wins', wins, 'points', points, 'fastestWinMs', fastest_win_ms,
        'isMe', user_id = auth.uid()
      ) order by rank) from ranked where rank <= 20
    ), '[]'::jsonb),
    'myRank', (select rank from ranked where user_id = auth.uid())
  );
$$;

revoke execute on function public.duel_clean_nickname(text) from public, anon, authenticated;
revoke execute on function public.duel_validate_nickname_row() from public, anon, authenticated;
revoke execute on function public.duel_set_nickname(text) from public, anon;
grant execute on function public.duel_set_nickname(text) to authenticated;
