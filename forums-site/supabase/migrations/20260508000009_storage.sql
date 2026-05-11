insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'avatars', 'avatars', true,
    2097152,  -- 2 MB
    array['image/jpeg','image/png','image/webp','image/gif']
  )
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'post-images', 'post-images', true,
    2097152,  -- 2 MB
    array['image/jpeg','image/png','image/webp','image/gif']
  )
  on conflict (id) do nothing;

-- Avatars: users upload to a folder named with their uid
create policy "avatars_select_public" on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_insert_self" on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_active()
  );

create policy "avatars_update_self" on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_active()
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_active()
  );

create policy "avatars_delete_self" on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_active()
  );

-- Post images: same pattern
create policy "post_images_select_public" on storage.objects for select
  using (bucket_id = 'post-images');

create policy "post_images_insert_self" on storage.objects for insert
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_active()
  );

create policy "post_images_delete_self" on storage.objects for delete
  using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_active()
  );
