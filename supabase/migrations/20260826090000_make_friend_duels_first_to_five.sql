-- FIRST_TO_FIVE: every round stays unlimited; the friend series ends at five round wins.
create or replace function public.duel_session_after_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  room public.duel_sessions;
  next_chooser uuid;
  next_host_score integer;
  next_guest_score integer;
begin
  if new.session_id is null or old.status = 'finished' or new.status <> 'finished' then return new; end if;
  select * into room from public.duel_sessions where id = new.session_id for update;
  if not found or room.status <> 'playing' or room.current_match_id <> new.id then return new; end if;

  next_host_score := room.host_score + case when new.winner_id = room.host_id then 1 else 0 end;
  next_guest_score := room.guest_score + case when new.winner_id = room.guest_id then 1 else 0 end;

  if next_host_score >= 5 or next_guest_score >= 5 then
    update public.duel_sessions set
      status = 'closed',
      round_number = round_number + 1,
      host_score = next_host_score,
      guest_score = next_guest_score,
      chooser_id = null,
      choice_deadline = null,
      last_winner_id = new.winner_id,
      left_by = null,
      closed_at = now(),
      updated_at = now()
    where id = room.id;
    return new;
  end if;

  if new.winner_id = room.host_id then next_chooser := room.guest_id;
  elsif new.winner_id = room.guest_id then next_chooser := room.host_id;
  elsif room.chooser_id = room.host_id then next_chooser := room.guest_id;
  else next_chooser := room.host_id;
  end if;

  update public.duel_sessions set
    status = 'choosing',
    round_number = round_number + 1,
    host_score = next_host_score,
    guest_score = next_guest_score,
    chooser_id = next_chooser,
    choice_deadline = now() + interval '15 seconds',
    last_winner_id = new.winner_id,
    updated_at = now()
  where id = room.id;
  return new;
end;
$$;

-- Close any pre-existing endless room that had already reached the new target.
update public.duel_sessions set
  status = 'closed',
  chooser_id = null,
  choice_deadline = null,
  left_by = null,
  closed_at = coalesce(closed_at, now()),
  updated_at = now()
where status <> 'closed' and greatest(host_score, guest_score) >= 5;
