import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

export class DocumentWorkerSupervisor {
    private worker: Worker | null = null;
    private restartTimer: NodeJS.Timeout | null = null;
    private restartAttempt = 0;
    private stopping = false;

    start(databasePath: string): void {
        this.stopping = false;
        this.startWorker(databasePath);
    }

    async stop(): Promise<void> {
        this.stopping = true;
        if (this.restartTimer) clearTimeout(this.restartTimer);
        this.restartTimer = null;
        const worker = this.worker;
        this.worker = null;
        if (worker) {
            worker.postMessage('stop');
            await worker.terminate().catch(() => undefined);
        }
    }

    private startWorker(databasePath: string): void {
        if (this.stopping || this.worker) return;
        if (this.restartTimer) clearTimeout(this.restartTimer);
        this.restartTimer = null;
        const worker = new Worker(join(__dirname, '../workers/document-worker.js'), {
            workerData: { databasePath },
        });
        this.worker = worker;
        worker.on('error', (error) => console.error('[DevLedger] Document worker error:', error.message));
        worker.on('message', (message: unknown) => {
            if (!message || typeof message !== 'object' || !('type' in message)) return;
            if (message.type === 'ready') this.restartAttempt = 0;
            if (message.type === 'fatal')
                console.error(
                    '[DevLedger] Document worker stopped:',
                    'message' in message ? message.message : 'Unknown error',
                );
        });
        worker.on('exit', (code) => {
            if (this.worker === worker) this.worker = null;
            if (this.stopping) return;
            console.error('[DevLedger] Document worker exited with code', code, 'and will be restarted.');
            const delay = Math.min(60_000, 1_000 * 2 ** Math.min(this.restartAttempt, 6));
            this.restartAttempt += 1;
            this.restartTimer = setTimeout(() => this.startWorker(databasePath), delay);
            this.restartTimer.unref();
        });
        worker.unref();
    }
}
