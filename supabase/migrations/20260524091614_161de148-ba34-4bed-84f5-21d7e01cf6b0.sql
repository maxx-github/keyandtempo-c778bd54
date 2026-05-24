-- Restrict DELETE on audio-uploads bucket: deny all client deletes.
-- The service role bypasses RLS, so backend functions can still clean up.
DROP POLICY IF EXISTS "Deny client deletes on audio-uploads" ON storage.objects;
CREATE POLICY "Deny client deletes on audio-uploads"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'audio-uploads' AND false);