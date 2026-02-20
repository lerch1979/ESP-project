-- Add scanned_file_path column to employee_documents table
-- Backend now automatically creates a scanned (B&W, high contrast) version of uploaded images

ALTER TABLE employee_documents
  ADD COLUMN IF NOT EXISTS scanned_file_path VARCHAR(500);
