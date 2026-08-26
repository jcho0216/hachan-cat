create or replace function public.duel_get_active_session()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare room public.duel_sessions;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into room from public.duel_sessions
  where status <> 'closed' and auth.uid() in (host_id, guest_id)
  order by updated_at desc limit 1;
  if not found then return null; end if;
  return public.duel_get_session(room.id);
end;
$$;

revoke execute on function public.duel_get_active_session() from public, anon;
grant execute on function public.duel_get_active_session() to authenticated;
