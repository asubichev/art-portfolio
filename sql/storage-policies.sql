-- Art Portfolio MVP — Supabase Storage Policies
-- Run this in the Supabase SQL editor AFTER creating the storage bucket.
--
-- 1. In Supabase Dashboard → Storage → New bucket
--    Name: artworks
--    Public: true  (so images are served publicly by CDN URL)
--
-- 2. Then run this file to restrict who can upload/delete.

-- Allow anyone to read/download files in the artworks bucket
create policy "storage: anon can read artworks"
  on storage.objects for select
  to anon
  using (bucket_id = 'artworks');

-- Allow authenticated users to upload to their own folder
create policy "storage: auth can insert artworks"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'artworks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to update/delete their own files
create policy "storage: auth can update artworks"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'artworks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage: auth can delete artworks"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'artworks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
