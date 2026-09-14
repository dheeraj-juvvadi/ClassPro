begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.goscrape disable row level security;
alter table public.gocal disable row level security;
grant all privileges on table public.goscrape, public.gocal to anon, authenticated;
grant all privileges on sequence public.gocal_id_seq to anon, authenticated;
grant execute on function public.delete_from_gocal() to public, anon, authenticated;

commit;
