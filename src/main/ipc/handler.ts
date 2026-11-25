import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { isTrustedRendererFrame } from './trust.ts';
import type { IpcRegistrar } from './contracts.ts';

function assertTrustedSender(event: IpcMainInvokeEvent): void {
    const frame = event.senderFrame;
    if (!frame) throw new Error('IPC is only available to the top-level application document.');
    const trusted = isTrustedRendererFrame(frame, process.env['ELECTRON_RENDERER_URL'], [
        join(process.cwd(), 'out/renderer/index.html'),
        join(__dirname, '../renderer/index.html'),
    ]);
    if (!trusted) throw new Error('Untrusted renderer origin.');
}

const SLOW_IPC_THRESHOLD_MS = 100;

export const createIpcRegistrar =
    (): IpcRegistrar =>
    <T>(
        channel: string,
        schema: import('zod').ZodType<T>,
        action: (input: T, event: IpcMainInvokeEvent) => unknown | Promise<unknown>,
    ): void => {
        ipcMain.handle(channel, async (event, rawInput: unknown) => {
            assertTrustedSender(event);
            const parsed = schema.safeParse(rawInput);
            if (!parsed.success)
                throw new Error(
                    `Invalid ${channel} request: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
                );
            const startedAt = performance.now();
            try {
                return await action(parsed.data, event);
            } finally {
                const elapsedMs = performance.now() - startedAt;
                if (elapsedMs >= SLOW_IPC_THRESHOLD_MS)
                    console.warn(`[DevLedger] Slow IPC handler: ${channel} (${elapsedMs.toFixed(1)} ms)`);
            }
        });
    };
