-- The catalogue is browsable without an account, so its imported media must be
-- readable by the same browser client. Upload/delete remain service-role only.
create policy "public can read imported kaishi media"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id in ('kaishi-audio', 'kaishi-images', 'kaishi-media'));
