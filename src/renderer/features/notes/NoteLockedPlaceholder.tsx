import { LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NoteLockedPlaceholderProps {
    vaultUnlocked: boolean;
    error: string;
    onUnlock: () => void;
}

export function NoteLockedPlaceholder({ vaultUnlocked, error, onUnlock }: NoteLockedPlaceholderProps) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <LockKeyhole className="mb-3 size-6 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Protected note</h2>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Encrypted at rest.{' '}
                {vaultUnlocked ? 'Unlock to view contents.' : 'Unlock the vault in Settings first.'}
            </p>
            <Button className="mt-4" size="sm" disabled={!vaultUnlocked} onClick={onUnlock}>
                Unlock note
            </Button>
            {error && (
                <p role="alert" className="mt-3 text-xs text-danger">
                    {error}
                </p>
            )}
        </div>
    );
}
