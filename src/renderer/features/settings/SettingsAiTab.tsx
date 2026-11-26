import { useState } from 'react';
import type { OllamaStatus, SemanticIndexReport } from '@shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { friendlyError } from '@/lib/utils';

const EMBED_MODEL_RE = /(embed|minilm|bge[-_:]|e5[-_:]|embeddinggemma|mxbai)/i;

interface OllamaModelSelectorCardProps {
    title: string;
    description: string;
    inputAriaLabel: string;
    value: string;
    buttonLabel: string;
    suggestions: string[];
    saving: boolean;
    onValueChange: (next: string) => void;
    onSave: () => void;
}

function OllamaModelSelectorCard({
    title,
    description,
    inputAriaLabel,
    value,
    buttonLabel,
    suggestions,
    saving,
    onValueChange,
    onSave,
}: OllamaModelSelectorCardProps) {
    return (
        <section className="workspace-surface flex flex-col justify-between space-y-4 p-5">
            <div className="space-y-1">
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="text-muted-foreground">{description}</p>
            </div>
            <div className="space-y-3">
                <div className="flex gap-2">
                    <Input
                        aria-label={inputAriaLabel}
                        value={value}
                        onChange={(e) => onValueChange(e.target.value)}
                        maxLength={128}
                        className="font-mono"
                    />
                    <Button size="sm" variant="outline" disabled={saving || !value.trim()} onClick={onSave}>
                        {buttonLabel}
                    </Button>
                </div>
                {suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {suggestions.map((modelName) => (
                            <button
                                key={modelName}
                                type="button"
                                onClick={() => onValueChange(modelName)}
                                className={`inline-flex min-h-7 items-center rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors ${value === modelName ? 'border-primary/30 bg-primary/10 text-primary font-semibold' : 'border-border bg-surface-subtle/50 text-foreground hover:bg-surface-hover'}`}
                            >
                                {modelName}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}

interface SettingsAiTabProps {
    settings: Record<string, unknown>;
    ollamaStatus: OllamaStatus | null;
    saving: boolean;
    onOllamaStatusChange: (status: OllamaStatus) => void;
    onCheckOllama: () => Promise<OllamaStatus>;
    onIndexSemantic: () => Promise<SemanticIndexReport>;
    onUpdateSetting: (key: string, value: unknown) => Promise<void>;
    onSavingChange: (saving: boolean) => void;
    onMessage: (message: string) => void;
    onError: (message: string) => void;
}

export function SettingsAiTab({
    settings,
    ollamaStatus,
    saving,
    onOllamaStatusChange,
    onCheckOllama,
    onIndexSemantic,
    onUpdateSetting,
    onSavingChange,
    onMessage,
    onError,
}: SettingsAiTabProps) {
    const [chatModel, setChatModel] = useState(
        typeof settings['ai.chatModel'] === 'string' ? settings['ai.chatModel'] : 'qwen3.5:2b-q4_K_M',
    );
    const [embeddingModel, setEmbeddingModel] = useState(
        typeof settings['ai.embeddingModel'] === 'string'
            ? settings['ai.embeddingModel']
            : 'nomic-embed-text:latest',
    );
    const [semanticReport, setSemanticReport] = useState<SemanticIndexReport | null>(null);

    const installedModels = ollamaStatus?.available ? ollamaStatus.models : [];
    const chatSuggestions = installedModels.filter((m) => !EMBED_MODEL_RE.test(m));
    const embeddingSuggestions = installedModels.filter((m) => EMBED_MODEL_RE.test(m));

    return (
        <div className="space-y-5 text-xs">
            <section className="workspace-surface flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold">Local AI (Ollama)</h2>
                        <Badge variant="outline" className="font-mono text-[10px]">
                            127.0.0.1
                        </Badge>
                        {ollamaStatus && (
                            <Badge variant={ollamaStatus.available ? 'success' : 'warning'}>
                                {ollamaStatus.available ? 'Connected' : 'Unavailable'}
                            </Badge>
                        )}
                    </div>
                    <p className="text-muted-foreground">
                        {ollamaStatus && !ollamaStatus.available
                            ? ollamaStatus.error || 'Start Ollama locally to enable AI summaries.'
                            : 'Optional local inference for semantic ranking and workspace summaries.'}
                    </p>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() =>
                        void onCheckOllama()
                            .then(onOllamaStatusChange)
                            .catch((e) =>
                                onOllamaStatusChange({
                                    available: false,
                                    baseUrl: 'http://127.0.0.1:11434',
                                    models: [],
                                    error: friendlyError(e, 'Ollama unavailable.'),
                                }),
                            )
                    }
                >
                    Check Ollama
                </Button>
            </section>

            <div className="grid gap-5 lg:grid-cols-2">
                <OllamaModelSelectorCard
                    title="Answer synthesis model"
                    description="Generates concise cited summaries for workspace search queries."
                    inputAriaLabel="Text generation model"
                    value={chatModel}
                    buttonLabel="Save chat model"
                    suggestions={chatSuggestions}
                    saving={saving}
                    onValueChange={setChatModel}
                    onSave={() => void onUpdateSetting('ai.chatModel', chatModel.trim())}
                />

                <OllamaModelSelectorCard
                    title="Semantic embedding model"
                    description="Indexes unlocked workspace notes, tasks, and documents locally."
                    inputAriaLabel="Embedding model"
                    value={embeddingModel}
                    buttonLabel="Save embedding"
                    suggestions={embeddingSuggestions}
                    saving={saving}
                    onValueChange={setEmbeddingModel}
                    onSave={() => void onUpdateSetting('ai.embeddingModel', embeddingModel.trim())}
                />
            </div>

            <section className="workspace-surface flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="space-y-0.5">
                    <h3 className="text-sm font-semibold">Semantic vector index</h3>
                    <p className="text-muted-foreground">
                        {semanticReport
                            ? `Last built: ${semanticReport.sources} records · ${semanticReport.chunks} chunks · ${new Date(semanticReport.completedAt).toLocaleString()}`
                            : ollamaStatus?.available && ollamaStatus.models.length === 0
                              ? 'Pull an Ollama embedding model locally, then build the vector index.'
                              : 'Rebuild semantic vectors across your unlocked workspace records.'}
                    </p>
                </div>
                <Button
                    size="sm"
                    disabled={saving || !ollamaStatus?.available}
                    onClick={() => {
                        onSavingChange(true);
                        void onIndexSemantic()
                            .then((r) => {
                                setSemanticReport(r);
                                onMessage(`Indexed ${r.sources} records (${r.chunks} chunks).`);
                            })
                            .catch((e) => onError(friendlyError(e, 'Indexing failed.')))
                            .finally(() => onSavingChange(false));
                    }}
                >
                    Build index
                </Button>
            </section>
        </div>
    );
}
