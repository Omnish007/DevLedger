import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';

export type ProjectImportRow = Record<string, unknown>;

export function asProjectImportRow(value: unknown): ProjectImportRow {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ProjectImportRow : {};
}
export function asProjectImportRows(value: unknown): ProjectImportRow[] {
  return Array.isArray(value) ? value.map(asProjectImportRow) : [];
}
export function importText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
export function importNumber(value: unknown, fallback = 0): number {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}
export function safeArchivePath(value: string): boolean {
  if (!value || value.includes('\\') || value.includes('\0') || value.startsWith('/') || isAbsolute(value)) return false;
  return value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}
export function isInside(parent: string, candidate: string): boolean {
  const rel = relative(resolve(parent), resolve(candidate));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
export async function sha256File(path: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const input = createReadStream(path, signal ? { signal } : {});
    input.on('data', (chunk: string | Buffer) => hash.update(chunk));
    input.once('error', reject);
    input.once('end', () => resolveHash(hash.digest('hex')));
  });
}
export async function pathExists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}
export function readSafeJsonFile(path: string, sizeLimit = 250 * 1024 * 1024): Promise<unknown> {
  return stat(path).then(async (info) => {
    if (!info.isFile() || info.size > sizeLimit) throw new Error(`${basename(path)} is too large to import safely.`);
    try { return JSON.parse(await readFile(path, 'utf8')) as unknown; }
    catch { throw new Error(`${basename(path)} is not valid JSON.`); }
  });
}
export function assertAcyclicImportEdges(edges: Map<string, string[]>, label: string): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): void => {
    if (visiting.has(node)) throw new Error(`The project archive contains a ${label} cycle.`);
    if (visited.has(node)) return;
    visiting.add(node);
    for (const next of edges.get(node) ?? []) visit(next);
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of edges.keys()) visit(node);
}
