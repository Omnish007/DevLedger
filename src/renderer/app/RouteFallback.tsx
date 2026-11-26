import { Button } from '@/components/ui/button';

export function RouteFallback() {
    return <div className="grid h-48 place-items-center text-xs text-muted-foreground">Loading view…</div>;
}

export function FatalStartupError({ message }: { message: string }) {
    return (
        <main className="grid h-full place-items-center bg-background p-8">
            <div className="max-w-lg rounded-lg border border-border bg-surface p-6">
                <h1 className="text-base font-semibold">Workspace could not start</h1>
                <p className="mt-2 text-sm text-muted-foreground">{message}</p>
                <Button className="mt-4" size="sm" onClick={() => window.location.reload()}>
                    Try again
                </Button>
            </div>
        </main>
    );
}
