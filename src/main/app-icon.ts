import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function resolveAppIconPath(): string | undefined {
    const candidates = [
        typeof process.resourcesPath === 'string' ? join(process.resourcesPath, 'resources', 'icon.png') : '',
        resolve(__dirname, '../../resources/icon.png'),
        resolve(process.cwd(), 'resources/icon.png'),
    ].filter(Boolean);

    return candidates.find((candidate) => existsSync(candidate));
}
