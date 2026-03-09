alter table public.documents
  add column if not exists file_url text;

-- Optional: backfill URL from existing storage path values.
-- Requires your bucket to be public.
-- update public.documents
-- set file_url = concat('<SUPABASE_PUBLIC_STORAGE_BASE_URL>/object/public/documents/', storage_path)
-- where file_url is null
--   and storage_path is not null;
