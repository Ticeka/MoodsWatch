create table if not exists public.tierlist_templates (
  id text primary key,
  owner_user_id uuid references auth.users (id) on delete cascade,
  title text not null,
  description text not null default '',
  category text not null default 'general',
  title_ids bigint[] not null default '{}',
  default_rows text[] not null default '{S,A,B,C,D}',
  is_public boolean not null default true,
  is_system boolean not null default false,
  plays integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.tierlist_lists (
  id text primary key,
  owner_user_id uuid references auth.users (id) on delete cascade,
  template_id text references public.tierlist_templates (id) on delete set null,
  title text not null,
  description text not null default '',
  is_public boolean not null default false,
  play_count integer not null default 0,
  owner_name text not null default 'You',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.tierlist_list_rows (
  id text primary key,
  list_id text not null references public.tierlist_lists (id) on delete cascade,
  position integer not null default 0,
  label text not null,
  color text not null default '',
  title_ids bigint[] not null default '{}'
);

create table if not exists public.tierlist_list_pool_items (
  list_id text not null references public.tierlist_lists (id) on delete cascade,
  title_id bigint not null,
  position integer not null default 0,
  primary key (list_id, title_id)
);

create index if not exists tierlist_templates_owner_idx on public.tierlist_templates (owner_user_id);
create index if not exists tierlist_templates_public_idx on public.tierlist_templates (is_public);
create index if not exists tierlist_lists_owner_idx on public.tierlist_lists (owner_user_id);
create index if not exists tierlist_lists_public_idx on public.tierlist_lists (is_public);
create index if not exists tierlist_list_rows_list_idx on public.tierlist_list_rows (list_id, position);
create index if not exists tierlist_list_pool_items_list_idx on public.tierlist_list_pool_items (list_id, position);

alter table if exists public.tierlist_templates enable row level security;
alter table if exists public.tierlist_lists enable row level security;
alter table if exists public.tierlist_list_rows enable row level security;
alter table if exists public.tierlist_list_pool_items enable row level security;

drop policy if exists "Public can read public tierlist templates" on public.tierlist_templates;
create policy "Public can read public tierlist templates"
on public.tierlist_templates
for select
using (
  is_public = true
  or owner_user_id = auth.uid()
);

drop policy if exists "Users can manage own tierlist templates" on public.tierlist_templates;
create policy "Users can manage own tierlist templates"
on public.tierlist_templates
for all
using (
  owner_user_id = auth.uid()
)
with check (
  owner_user_id = auth.uid()
);

drop policy if exists "Public can read public tierlist lists" on public.tierlist_lists;
create policy "Public can read public tierlist lists"
on public.tierlist_lists
for select
using (
  is_public = true
  or owner_user_id = auth.uid()
);

drop policy if exists "Users can manage own tierlist lists" on public.tierlist_lists;
create policy "Users can manage own tierlist lists"
on public.tierlist_lists
for all
using (
  owner_user_id = auth.uid()
)
with check (
  owner_user_id = auth.uid()
);

drop policy if exists "Public can read visible tierlist rows" on public.tierlist_list_rows;
create policy "Public can read visible tierlist rows"
on public.tierlist_list_rows
for select
using (
  exists (
    select 1
    from public.tierlist_lists lists
    where lists.id = tierlist_list_rows.list_id
      and (lists.is_public = true or lists.owner_user_id = auth.uid())
  )
);

drop policy if exists "Users can manage own tierlist rows" on public.tierlist_list_rows;
create policy "Users can manage own tierlist rows"
on public.tierlist_list_rows
for all
using (
  exists (
    select 1
    from public.tierlist_lists lists
    where lists.id = tierlist_list_rows.list_id
      and lists.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.tierlist_lists lists
    where lists.id = tierlist_list_rows.list_id
      and lists.owner_user_id = auth.uid()
  )
);

drop policy if exists "Public can read visible tierlist pool items" on public.tierlist_list_pool_items;
create policy "Public can read visible tierlist pool items"
on public.tierlist_list_pool_items
for select
using (
  exists (
    select 1
    from public.tierlist_lists lists
    where lists.id = tierlist_list_pool_items.list_id
      and (lists.is_public = true or lists.owner_user_id = auth.uid())
  )
);

drop policy if exists "Users can manage own tierlist pool items" on public.tierlist_list_pool_items;
create policy "Users can manage own tierlist pool items"
on public.tierlist_list_pool_items
for all
using (
  exists (
    select 1
    from public.tierlist_lists lists
    where lists.id = tierlist_list_pool_items.list_id
      and lists.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.tierlist_lists lists
    where lists.id = tierlist_list_pool_items.list_id
      and lists.owner_user_id = auth.uid()
  )
);
