-- Migration: Add photos, video_links, and documents columns to cattle table
-- Date: 2026-01-06
-- Description: Adds support for photo gallery, YouTube video links, and document uploads per cattle

-- Add photos column (stores array of photo objects with base64 data)
ALTER TABLE cattle 
ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]';

-- Add video_links column (stores array of YouTube video URLs)
ALTER TABLE cattle 
ADD COLUMN IF NOT EXISTS video_links JSONB DEFAULT '[]';

-- Add documents column (stores array of document objects with base64 data)
ALTER TABLE cattle 
ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '[]';

-- Verify the columns were added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'cattle' 
AND column_name IN ('photos', 'video_links', 'documents');
