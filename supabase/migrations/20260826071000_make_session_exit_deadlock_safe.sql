create or replace function public.duel_leave_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  room public.duel_sessions;
  locked_match public.duel_matches;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;

  -- 경기 판정은 match -> session 순서로 잠근다. 나가기도 같은 순서를 지켜
  -- 한쪽의 포획 요청과 동시에 눌러도 교착하지 않게 한다.
  select * into room from public.duel_sessions
  where id = p_session_id and me in (host_id, guest_id);
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if room.current_match_id is not null then
    select * into locked_match from public.duel_matches where id = room.current_match_id for update;
  end if;

  select * into room from public.duel_sessions
  where id = p_session_id and me in (host_id, guest_id) for update;
  if room.status = 'closed' then return public.duel_session_json(room); end if;
  update public.duel_sessions set status = 'closed', left_by = me,
    closed_at = now(), choice_deadline = null, updated_at = now()
  where id = room.id returning * into room;

  if locked_match.id is not null and locked_match.id = room.current_match_id and locked_match.status = 'ready' then
    update public.duel_matches set status = 'expired', finished_at = now()
    where id = locked_match.id and status = 'ready';
  end if;
  return public.duel_session_json(room);
end;
$$;

revoke execute on function public.duel_leave_session(uuid) from public, anon;
grant execute on function public.duel_leave_session(uuid) to authenticated;
