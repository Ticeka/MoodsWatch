alter table if exists public.user_profiles
  add column if not exists username text,
  add column if not exists is_profile_public boolean not null default false;

alter table if exists public.user_profiles
  drop constraint if exists user_profiles_username_format_chk;

alter table if exists public.user_profiles
  add constraint user_profiles_username_format_chk
  check (username is null or username ~ '^[a-z0-9_]{3,20}$');

create or replace function public.normalize_profile_username()
returns trigger
language plpgsql
as $$
begin
  if new.username is not null then
    new.username := lower(trim(new.username));
    if new.username = '' then
      new.username := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_normalize_username on public.user_profiles;
create trigger trg_user_profiles_normalize_username
before insert or update on public.user_profiles
for each row
execute function public.normalize_profile_username();

create unique index if not exists idx_user_profiles_username_unique
on public.user_profiles (lower(username))
where username is not null;

drop policy if exists "Public can read shared profiles" on public.user_profiles;
create policy "Public can read shared profiles"
on public.user_profiles for select
using (is_profile_public = true);
