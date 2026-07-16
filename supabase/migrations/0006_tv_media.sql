-- Versioned, public TV artwork. Writes are performed only by the service-role-backed
-- /api/tv-media endpoint after it verifies the authenticated device owns the machine path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tv-media',
  'tv-media',
  true,
  768000,
  array['image/jpeg']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read TV media" on storage.objects;
create policy "Public read TV media"
on storage.objects for select
to public
using (bucket_id = 'tv-media');

drop policy if exists "Desktop inserts immutable TV media" on storage.objects;
-- Deliberately do not replace this policy: anon/authenticated clients have no direct INSERT
-- permission. The server-side service role bypasses RLS after device authorization.
