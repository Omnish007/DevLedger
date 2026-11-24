import type { DocumentRecord } from '../../shared/contracts.js';

export function mapDocumentRecord(row: Record<string, unknown>): DocumentRecord {
  return {
    id: String(row.id),
    projectId: row.project_id ? String(row.project_id) : null,
    title: String(row.title),
    originalName: String(row.original_name),
    mediaType: String(row.media_type),
    sizeBytes: Number(row.size_bytes),
    extension: String(row.extension),
    status: row.status as DocumentRecord['status'],
    createdAt: String(row.created_at),
    extractedText: String(row.extracted_text ?? ''),
    extractionError: row.extraction_error ? String(row.extraction_error) : null,
    encrypted: Number(row.is_encrypted ?? 0) === 1,
  };
}
