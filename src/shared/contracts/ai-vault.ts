import type { SearchResult } from './workspace.ts';

export interface VaultStatus {
    configured: boolean;
    unlocked: boolean;
}

export interface BackupCreationResult {
    path: string;
    recoveryKey: string;
}

export interface OllamaStatus {
    available: boolean;
    baseUrl: string;
    models: string[];
    error: string | null;
}

export interface AiSummary {
    summary: string;
    model: string;
    citations: SearchResult[];
    cached: boolean;
}

export interface SemanticIndexReport {
    model: string;
    sources: number;
    chunks: number;
    completedAt: string;
}
