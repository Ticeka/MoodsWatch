alter table if exists public.title_tags
  add column if not exists weight numeric(5,2),
  add column if not exists source_provider text,
  add column if not exists canonical_title_id bigint;

alter table if exists public.title_genres
  add column if not exists canonical_title_id bigint;

alter table if exists public.title_moods
  add column if not exists canonical_title_id bigint;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'title_tags' and column_name = 'canonical_title_id'
  ) then
    begin
      alter table public.title_tags
        add constraint title_tags_canonical_title_id_fkey
        foreign key (canonical_title_id) references public.canonical_titles(id) on delete cascade;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'title_genres' and column_name = 'canonical_title_id'
  ) then
    begin
      alter table public.title_genres
        add constraint title_genres_canonical_title_id_fkey
        foreign key (canonical_title_id) references public.canonical_titles(id) on delete cascade;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'title_moods' and column_name = 'canonical_title_id'
  ) then
    begin
      alter table public.title_moods
        add constraint title_moods_canonical_title_id_fkey
        foreign key (canonical_title_id) references public.canonical_titles(id) on delete cascade;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
