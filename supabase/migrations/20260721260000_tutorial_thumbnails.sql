-- Tutorial thumbnails: columns + allow image MIME on tutorials bucket

alter table public.tutorials
  add column if not exists thumbnail_path text,
  add column if not exists thumbnail_url text;

-- Reuse `tutorials` bucket for jpeg/png/webp thumbs alongside video
update storage.buckets
set allowed_mime_types = array[
  'video/mp4',
  'video/webm',
  'image/jpeg',
  'image/png',
  'image/webp'
]::text[]
where id = 'tutorials';
