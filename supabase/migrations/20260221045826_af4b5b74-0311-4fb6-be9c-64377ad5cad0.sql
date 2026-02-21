-- Create storage bucket for audio uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('audio-uploads', 'audio-uploads', true);

-- Allow anyone to upload (no auth required for this app)
CREATE POLICY "Anyone can upload audio" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'audio-uploads');

-- Allow anyone to read audio files
CREATE POLICY "Anyone can read audio" ON storage.objects
FOR SELECT USING (bucket_id = 'audio-uploads');

-- Allow anyone to delete their uploads
CREATE POLICY "Anyone can delete audio" ON storage.objects
FOR DELETE USING (bucket_id = 'audio-uploads');