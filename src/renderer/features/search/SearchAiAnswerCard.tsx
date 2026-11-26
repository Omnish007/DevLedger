import { Sparkles } from 'lucide-react';
import type { AiSummary, SearchResult } from '@shared/contracts';
import { Badge } from '@/components/ui/badge';

interface SearchAiAnswerCardProps {
    aiSummary: AiSummary;
    onOpenResult: (result: SearchResult) => void;
}

export function SearchAiAnswerCard({ aiSummary, onOpenResult }: SearchAiAnswerCardProps) {
    return (
        <section className="rounded-[var(--workspace-radius)] border border-border bg-surface-subtle/55 p-4 shadow-[var(--shadow-xs)]">
            <div className="mb-2 flex items-center gap-2">
                <Sparkles className="size-3.5 text-primary" />
                <h2 className="text-xs font-semibold">AI Answer</h2>
                <Badge variant="secondary">{aiSummary.model}</Badge>
                {aiSummary.cached && <Badge variant="outline">Cached</Badge>}
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{aiSummary.summary}</p>
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-2.5">
                {aiSummary.citations.map((source, index) => (
                    <button
                        key={`${source.type}:${source.id}`}
                        type="button"
                        onClick={() => onOpenResult(source)}
                        className="inline-flex min-h-7 items-center gap-1.5 rounded-lg border border-border/80 bg-card px-2.5 py-1 text-xs font-medium transition-colors hover:border-border hover:bg-surface-hover"
                    >
                        <span className="font-mono text-xs text-primary">[{index + 1}]</span>
                        <span className="truncate">{source.title}</span>
                    </button>
                ))}
            </div>
        </section>
    );
}
