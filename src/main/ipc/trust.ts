import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export interface RendererFrameIdentity { url: string; parent: unknown | null; }

export function isTrustedRendererFrame(frame: RendererFrameIdentity, devUrl: string | undefined, productionPaths: string[]): boolean {
  if (frame.parent) return false;
  try {
    const parsed = new URL(frame.url);
    if (devUrl) {
      const expected = new URL(devUrl);
      return parsed.origin === expected.origin && (parsed.pathname === '/' || parsed.pathname === '/index.html');
    }
    if (parsed.protocol !== 'file:') return false;
    const path = resolve(fileURLToPath(parsed));
    return productionPaths.some((expectedPath) => path === resolve(expectedPath));
  } catch { return false; }
}
