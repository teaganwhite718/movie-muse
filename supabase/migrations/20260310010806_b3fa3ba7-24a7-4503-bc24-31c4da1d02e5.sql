
-- Check and drop insert policies if they still exist
DROP POLICY IF EXISTS "Service role insert for movie_documents" ON public.movie_documents;
DROP POLICY IF EXISTS "Service role insert for movie_chunks" ON public.movie_chunks;
