export function normalizeSearchTerms(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[\u0000-\u001f]/g, '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function safeFtsQuery(query: string): string {
  return normalizeSearchTerms(query)
    .map((term) => `"${term.replaceAll('"', '""')}"*`)
    .join(' AND ');
}

export function safeDisplayName(value: string, maxLength = 180): string {
  const name = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return name.slice(0, maxLength);
}
