-- 과거 경기 조회 호환을 위해 컬럼과 함수 정의는 유지하지만,
-- 새 고스트 경기 생성과 판정은 어떤 클라이언트도 호출할 수 없다.
revoke execute on function public.duel_start_ghost(text) from authenticated;
revoke execute on function public.duel_finish_ghost(uuid) from authenticated;
