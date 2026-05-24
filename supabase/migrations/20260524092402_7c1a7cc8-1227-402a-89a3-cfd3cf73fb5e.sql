CREATE POLICY "Block client updates on audio-uploads"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'audio-uploads' AND false)
WITH CHECK (bucket_id = 'audio-uploads' AND false);