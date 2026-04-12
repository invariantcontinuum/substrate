-- Fix vector dimension: embeddinggemma-300M model outputs 768-dim vectors, not 384.
ALTER TABLE file_embeddings ALTER COLUMN embedding TYPE vector(768);
ALTER TABLE content_chunks ALTER COLUMN embedding TYPE vector(768);
