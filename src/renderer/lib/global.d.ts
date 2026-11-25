import type { DevLedgerApi } from '@shared/contracts';

declare global {
    interface Window {
        devLedger: DevLedgerApi;
    }
}

export {};
