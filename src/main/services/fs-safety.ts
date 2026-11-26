import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/** Return true if candidate resolves to parent itself or a descendant path within parent. */
export function isPathInside(parent: string, candidate: string): boolean {
    const rel = relative(resolve(parent), resolve(candidate));
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Stream a file to compute its lowercase hex SHA-256 digest with optional AbortSignal support. */
export function sha256File(filePath: string, signal?: AbortSignal): Promise<string> {
    return new Promise((resolveHash, reject) => {
        if (signal?.aborted) {
            reject(signal.reason instanceof Error ? signal.reason : new Error('File hashing cancelled.'));
            return;
        }
        const hash = createHash('sha256');
        const stream = createReadStream(filePath);
        const onAbort = () => {
            stream.destroy(
                signal?.reason instanceof Error ? signal.reason : new Error('File hashing cancelled.'),
            );
        };
        const cleanup = () => signal?.removeEventListener('abort', onAbort);
        signal?.addEventListener('abort', onAbort, { once: true });
        stream.on('data', (chunk: string | Buffer) => hash.update(chunk));
        stream.once('error', (error) => {
            cleanup();
            reject(error);
        });
        stream.once('end', () => {
            cleanup();
            resolveHash(hash.digest('hex'));
        });
    });
}

/** Return true when targetPath is accessible to the current process. */
export async function pathExists(targetPath: string): Promise<boolean> {
    try {
        await access(targetPath);
        return true;
    } catch {
        return false;
    }
}
