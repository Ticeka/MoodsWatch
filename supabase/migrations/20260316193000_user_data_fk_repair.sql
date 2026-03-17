do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'user_lists'
      and constraint_name = 'user_lists_user_id_fkey'
  ) then
    alter table public.user_lists
      drop constraint user_lists_user_id_fkey;
  end if;
end $$;

alter table if exists public.user_lists
  add constraint user_lists_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'user_lists'
      and constraint_name = 'user_lists_title_id_fkey'
  ) then
    alter table public.user_lists
      drop constraint user_lists_title_id_fkey;
  end if;
end $$;

alter table if exists public.user_lists
  add constraint user_lists_title_id_fkey
  foreign key (title_id) references public.canonical_titles(id) on delete cascade;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'user_favorite_titles'
      and constraint_name = 'user_favorite_titles_title_id_fkey'
  ) then
    alter table public.user_favorite_titles
      drop constraint user_favorite_titles_title_id_fkey;
  end if;
end $$;

alter table if exists public.user_favorite_titles
  add constraint user_favorite_titles_title_id_fkey
  foreign key (title_id) references public.canonical_titles(id) on delete cascade;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'user_title_history'
      and constraint_name = 'user_title_history_title_id_fkey'
  ) then
    alter table public.user_title_history
      drop constraint user_title_history_title_id_fkey;
  end if;
end $$;

alter table if exists public.user_title_history
  add constraint user_title_history_title_id_fkey
  foreign key (title_id) references public.canonical_titles(id) on delete cascade;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'user_hidden_titles'
      and constraint_name = 'user_hidden_titles_title_id_fkey'
  ) then
    alter table public.user_hidden_titles
      drop constraint user_hidden_titles_title_id_fkey;
  end if;
end $$;

alter table if exists public.user_hidden_titles
  add constraint user_hidden_titles_title_id_fkey
  foreign key (title_id) references public.canonical_titles(id) on delete cascade;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'user_consumption_sessions'
      and constraint_name = 'user_consumption_sessions_title_id_fkey'
  ) then
    alter table public.user_consumption_sessions
      drop constraint user_consumption_sessions_title_id_fkey;
  end if;
end $$;

alter table if exists public.user_consumption_sessions
  add constraint user_consumption_sessions_title_id_fkey
  foreign key (title_id) references public.canonical_titles(id) on delete cascade;
