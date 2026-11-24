/** Stored object paths use forward slashes so workspace data is portable across operating systems. */
export function normalizeObjectRelativePath(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error('A document contains an invalid object path.');
  }
  const normalized = value.replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (
    !normalized.startsWith('objects/') ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized) ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('A document contains an unsafe object path.');
  }
  return normalized;
}
