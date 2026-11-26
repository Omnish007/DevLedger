import { useState } from 'react';
import { ArrowDownToLine, FolderKanban, X } from 'lucide-react';
import { friendlyError } from '@/lib/utils';
import { DevLedgerIcon } from '@/components/shared/BrandMark';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type Props = {
    onSave: (input: { title: string; content: string; projectId: string | null }) => Promise<void>;
};
export function QuickCapturePage({ onSave }: Props) {
    const [projectId, setProjectId] = useState('');
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (!content.trim()) {
            setError('Add a note before saving.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            await onSave({ title: title.trim() || 'Quick capture', content, projectId: projectId || null });
            window.close();
        } catch (e) {
            setError(friendlyError(e, 'Capture could not be saved.'));
            setBusy(false);
        }
    }
    return (
        <main className="capture-window flex h-full flex-col bg-card">
            <header className="window-drag flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
                <DevLedgerIcon className="size-6 shrink-0" />
                <div className="flex-1 text-sm font-semibold">Quick capture</div>
                <Kbd>Ctrl ⇧ Space</Kbd>
                <Button
                    variant="ghost"
                    size="icon"
                    className="window-no-drag size-8"
                    onClick={() => window.close()}
                    aria-label="Close capture"
                >
                    <X className="size-4" />
                </Button>
            </header>
            <form onSubmit={(e) => void submit(e)} className="flex min-h-0 flex-1 flex-col gap-3 p-4">
                <div className="flex items-center gap-2 border-b border-border/65 pb-2">
                    <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Title (optional)"
                        aria-label="Note title"
                        className="h-9 border-0 bg-transparent px-0 text-base font-semibold shadow-none focus-visible:ring-0"
                    />
                    <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <FolderKanban className="size-3.5" aria-hidden="true" />
                        <RemoteRecordPicker
                            entityType="project"
                            value={projectId}
                            onValueChange={setProjectId}
                            placeholder="No project"
                            className="w-44"
                        />
                    </div>
                </div>
                <Textarea
                    autoFocus
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Write a note, decision, or follow-up…"
                    aria-label="Note body"
                    className="min-h-0 flex-1 resize-none border-0 bg-transparent p-0 text-sm leading-relaxed shadow-none focus-visible:ring-0"
                />
                <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                    <div className="min-w-0 text-xs text-danger" role="alert">
                        {error}
                    </div>
                    <Button type="submit" size="sm" disabled={busy || !content.trim()}>
                        {busy ? 'Saving…' : 'Save note'}
                        <ArrowDownToLine className="size-3.5" />
                    </Button>
                </div>
            </form>
        </main>
    );
}
