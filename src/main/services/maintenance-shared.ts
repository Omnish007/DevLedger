export interface MaintenanceJobContext {
    signal: AbortSignal;
    progress(value: Record<string, unknown>): void;
}
