insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tierlist-images',
  'tierlist-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'tierlist_images_public_read'
  ) then
    create policy "tierlist_images_public_read"
      on storage.objects for select
      using (bucket_id = 'tierlist-images');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'tierlist_images_insert_own'
  ) then
    create policy "tierlist_images_insert_own"
      on storage.objects for insert
      with check (
        bucket_id = 'tierlist-images'
        and auth.uid() is not null
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'tierlist_images_delete_own'
  ) then
    create policy "tierlist_images_delete_own"
      on storage.objects for delete
      using (
        bucket_id = 'tierlist-images'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
