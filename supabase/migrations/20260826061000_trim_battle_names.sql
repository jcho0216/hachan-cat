create or replace function public.duel_clean_nickname(p_nickname text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  clean_name text := left(regexp_replace(trim(coalesce(p_nickname, '')), '[^0-9A-Za-z가-힣 _-]', '', 'g'), 10);
begin
  clean_name := trim(regexp_replace(clean_name, '\s+', ' ', 'g'));
  if char_length(clean_name) < 2 then raise exception 'INVALID_NICKNAME'; end if;
  if lower(regexp_replace(clean_name, '\s', '', 'g')) in ('관리자', '운영자', 'admin', 'toss', '토스') then
    raise exception 'RESERVED_NICKNAME';
  end if;
  return clean_name;
end;
$$;

revoke execute on function public.duel_clean_nickname(text) from public, anon, authenticated;
