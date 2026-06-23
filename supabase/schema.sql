-- 테이블
create table if not exists boards (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null default '제목 없는 보드',
  created_at timestamptz not null default now()
);

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  type text not null check (type in ('text','image')),
  content text,
  image_url text,
  x double precision not null default 0,
  y double precision not null default 0,
  width double precision not null default 160,
  height double precision not null default 160,
  color text not null default '#fff3a0',
  owner_id text not null,
  z_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cards_board_id_idx on cards(board_id);

-- updated_at 자동 갱신
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists cards_set_updated_at on cards;
create trigger cards_set_updated_at before update on cards
  for each row execute function set_updated_at();

-- RLS: anon 허용(신뢰 환경, spec §5). 소유권은 클라이언트 강제.
alter table boards enable row level security;
alter table cards  enable row level security;
drop policy if exists "boards anon all" on boards;
drop policy if exists "cards anon all"  on cards;
create policy "boards anon all" on boards for all to anon using (true) with check (true);
create policy "cards anon all"  on cards  for all to anon using (true) with check (true);

-- realtime 발행
-- REPLICA IDENTITY FULL: DELETE 이벤트의 old 레코드에 board_id가 담기도록 해야
-- postgres_changes의 board_id=eq.<id> 서버 필터가 DELETE를 통과시킨다(기본 PK만이면
-- old에 id만 있어 필터에 걸려 DELETE 이벤트가 구독자에게 전달되지 않음, spec §7).
alter table cards replica identity full;
alter publication supabase_realtime add table cards;

-- 스토리지: 공개 읽기 버킷
insert into storage.buckets (id, name, public)
values ('card-images', 'card-images', true)
on conflict (id) do nothing;
drop policy if exists "card-images anon read"   on storage.objects;
drop policy if exists "card-images anon insert" on storage.objects;
create policy "card-images anon read"   on storage.objects for select to anon using (bucket_id = 'card-images');
create policy "card-images anon insert" on storage.objects for insert to anon with check (bucket_id = 'card-images');
