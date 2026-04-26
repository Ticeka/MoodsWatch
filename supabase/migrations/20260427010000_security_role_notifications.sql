-- Harden role management and notification creation.
-- Regular authenticated clients may update their own profile fields, but not role.
-- Notifications are created through validated RPCs tied to real comment rows.

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_user_roles_updated_at on public.user_roles;
create trigger trg_user_roles_updated_at
before update on public.user_roles
for each row
execute function public.set_updated_at();

alter table public.user_roles enable row level security;

insert into public.user_roles (user_id, role)
select id, role
from public.user_profiles
where role in ('admin', 'editor')
on conflict (user_id) do update
set role = excluded.role;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.is_staff_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role in ('admin', 'editor')
  );
$$;

drop policy if exists "Users can read own role" on public.user_roles;
create policy "Users can read own role"
on public.user_roles for select
using ((select auth.uid()) = user_id);

drop policy if exists "Admins can read roles" on public.user_roles;
create policy "Admins can read roles"
on public.user_roles for select
using ((select public.is_admin_user()));

drop policy if exists "Admins can insert roles" on public.user_roles;
create policy "Admins can insert roles"
on public.user_roles for insert
with check ((select public.is_admin_user()));

drop policy if exists "Admins can update roles" on public.user_roles;
create policy "Admins can update roles"
on public.user_roles for update
using ((select public.is_admin_user()))
with check ((select public.is_admin_user()));

drop policy if exists "Admins can delete roles" on public.user_roles;
create policy "Admins can delete roles"
on public.user_roles for delete
using ((select public.is_admin_user()));

create or replace function public.prevent_user_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.role, 'user') <> 'user'
       and current_setting('moodswatch.allow_role_update', true) <> 'on' then
      raise exception 'Changing user role is not allowed from this path'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if coalesce(new.role, 'user') is distinct from coalesce(old.role, 'user')
     and current_setting('moodswatch.allow_role_update', true) <> 'on' then
    raise exception 'Changing user role is not allowed from this path'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_user_profile_role_change on public.user_profiles;
create trigger trg_prevent_user_profile_role_change
before insert or update on public.user_profiles
for each row
execute function public.prevent_user_profile_role_change();

create or replace function public.update_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  next_role text := coalesce(nullif(trim(p_role), ''), 'user');
begin
  if not public.is_admin_user() then
    raise exception 'Only admins can update user roles'
      using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'User id is required'
      using errcode = '22023';
  end if;

  if next_role not in ('user', 'editor', 'admin') then
    raise exception 'Invalid role: %', next_role
      using errcode = '22023';
  end if;

  if next_role = 'user' then
    delete from public.user_roles where user_id = p_user_id;
  else
    insert into public.user_roles (user_id, role)
    values (p_user_id, next_role)
    on conflict (user_id) do update
      set role = excluded.role;
  end if;

  perform set_config('moodswatch.allow_role_update', 'on', true);

  update public.user_profiles
  set role = next_role
  where id = p_user_id;
end;
$$;

revoke all on function public.update_user_role(uuid, text) from public;
grant execute on function public.update_user_role(uuid, text) to authenticated;

drop policy if exists "Authenticated can insert notifications" on public.notifications;

create or replace function public.notify_profile_comment(p_comment_id uuid, p_language text default 'en')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  comment_row public.profile_comments%rowtype;
  parent_author_id uuid;
  actor_name text;
  lang text := case when p_language = 'th' then 'th' else 'en' end;
  profile_message text;
  reply_owner_message text;
  reply_author_message text;
begin
  select *
  into comment_row
  from public.profile_comments
  where id = p_comment_id;

  if not found then
    raise exception 'Profile comment not found'
      using errcode = 'P0002';
  end if;

  if comment_row.author_user_id <> auth.uid() then
    raise exception 'Only the comment author can create notifications'
      using errcode = '42501';
  end if;

  select coalesce(nullif(name, ''), nullif(username, ''), 'Someone')
  into actor_name
  from public.user_profiles
  where id = comment_row.author_user_id;

  if comment_row.parent_comment_id is not null then
    select author_user_id
    into parent_author_id
    from public.profile_comments
    where id = comment_row.parent_comment_id;
  end if;

  profile_message := actor_name || case
    when lang = 'th' then ' แสดงความคิดเห็นบนโปรไฟล์ของคุณ'
    else ' commented on your profile'
  end;
  reply_owner_message := actor_name || case
    when lang = 'th' then ' ตอบกลับคอมเมนต์บนโปรไฟล์ของคุณ'
    else ' replied to a comment on your profile'
  end;
  reply_author_message := actor_name || case
    when lang = 'th' then ' ตอบกลับคอมเมนต์ของคุณ'
    else ' replied to your comment'
  end;

  if comment_row.profile_user_id <> comment_row.author_user_id then
    insert into public.notifications (user_id, type, reference_id, actor_user_id, message)
    values (
      comment_row.profile_user_id,
      case when comment_row.parent_comment_id is null then 'profile_comment' else 'comment_reply' end,
      comment_row.profile_user_id::text,
      comment_row.author_user_id,
      case when comment_row.parent_comment_id is null then profile_message else reply_owner_message end
    );
  end if;

  if parent_author_id is not null
     and parent_author_id <> comment_row.author_user_id
     and parent_author_id <> comment_row.profile_user_id then
    insert into public.notifications (user_id, type, reference_id, actor_user_id, message)
    values (
      parent_author_id,
      'comment_reply',
      comment_row.profile_user_id::text,
      comment_row.author_user_id,
      reply_author_message
    );
  end if;
end;
$$;

create or replace function public.notify_tierlist_comment(p_comment_id uuid, p_language text default 'en')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  comment_row public.tierlist_comments%rowtype;
  list_owner_id uuid;
  parent_author_id uuid;
  actor_name text;
  lang text := case when p_language = 'th' then 'th' else 'en' end;
  list_message text;
  reply_owner_message text;
  reply_author_message text;
begin
  select *
  into comment_row
  from public.tierlist_comments
  where id = p_comment_id;

  if not found then
    raise exception 'Tierlist comment not found'
      using errcode = 'P0002';
  end if;

  if comment_row.author_user_id <> auth.uid() then
    raise exception 'Only the comment author can create notifications'
      using errcode = '42501';
  end if;

  select owner_user_id
  into list_owner_id
  from public.tierlist_lists
  where id = comment_row.list_id;

  if list_owner_id is null then
    raise exception 'Tierlist owner not found'
      using errcode = 'P0002';
  end if;

  if comment_row.parent_comment_id is not null then
    select author_user_id
    into parent_author_id
    from public.tierlist_comments
    where id = comment_row.parent_comment_id;
  end if;

  select coalesce(nullif(name, ''), nullif(username, ''), 'Someone')
  into actor_name
  from public.user_profiles
  where id = comment_row.author_user_id;

  list_message := actor_name || case
    when lang = 'th' then ' แสดงความคิดเห็นบน tierlist ของคุณ'
    else ' commented on your tierlist'
  end;
  reply_owner_message := actor_name || case
    when lang = 'th' then ' ตอบกลับคอมเมนต์บน tierlist ของคุณ'
    else ' replied to a comment on your tierlist'
  end;
  reply_author_message := actor_name || case
    when lang = 'th' then ' ตอบกลับคอมเมนต์ของคุณ'
    else ' replied to your comment'
  end;

  if list_owner_id <> comment_row.author_user_id then
    insert into public.notifications (user_id, type, reference_id, actor_user_id, message)
    values (
      list_owner_id,
      case when comment_row.parent_comment_id is null then 'tierlist_comment' else 'comment_reply' end,
      comment_row.list_id,
      comment_row.author_user_id,
      case when comment_row.parent_comment_id is null then list_message else reply_owner_message end
    );
  end if;

  if parent_author_id is not null
     and parent_author_id <> comment_row.author_user_id
     and parent_author_id <> list_owner_id then
    insert into public.notifications (user_id, type, reference_id, actor_user_id, message)
    values (
      parent_author_id,
      'comment_reply',
      comment_row.list_id,
      comment_row.author_user_id,
      reply_author_message
    );
  end if;
end;
$$;

revoke all on function public.notify_profile_comment(uuid, text) from public;
revoke all on function public.notify_tierlist_comment(uuid, text) from public;
grant execute on function public.notify_profile_comment(uuid, text) to authenticated;
grant execute on function public.notify_tierlist_comment(uuid, text) to authenticated;
