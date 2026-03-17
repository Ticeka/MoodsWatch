-- --- STORAGE POLICIES FOR AVATARS ---

-- 1. Create the bucket (Skip this if you already created it)
insert into storage.buckets (id, name, public) 
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 2. Enable Row Level Security (RLS) if not already enabled
alter table storage.objects enable row level security;

-- 3. Policy: Anyone can view avatars (Select)
drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
on storage.objects for select
using ( bucket_id = 'avatars' );

-- 4. Policy: Users can upload to their own folder (Insert)
drop policy if exists "Users can upload to their own folder" on storage.objects;
create policy "Users can upload to their own folder"
on storage.objects for insert
with check (
    bucket_id = 'avatars'
    and (select auth.uid()::text) = (storage.foldername(name))[1]
);

-- 5. Policy: Users can update their own avatar (Update)
drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
on storage.objects for update
using (
    bucket_id = 'avatars'
    and (select auth.uid()::text) = (storage.foldername(name))[1]
);

-- 6. Policy: Users can delete their own avatar (Delete)
drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
on storage.objects for delete
using (
    bucket_id = 'avatars'
    and (select auth.uid()::text) = (storage.foldername(name))[1]
);
