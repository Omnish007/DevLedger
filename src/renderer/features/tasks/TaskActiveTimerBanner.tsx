import { Square } from 'lucide-react';
import type { ActiveTimerRecord } from '@shared/contracts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toDateTimeLocalInput } from '@/lib/utils';

interface TaskActiveTimerBannerProps {
    activeTimer: ActiveTimerRecord;
    timerTitle: string;
    elapsedLabel: string;
    elapsedHours: number;
    crossedLocalDay: boolean;
    recoveryEndAt: string;
    onRecoveryEndAtChange: (next: string) => void;
    onInspectTask: (taskId: string) => void;
    onStopTimer: (taskId: string) => Promise<void>;
    onRecoverTimer: (action: 'resume' | 'stop' | 'discard') => Promise<void>;
}

export function TaskActiveTimerBanner({
    activeTimer,
    timerTitle,
    elapsedLabel,
    elapsedHours,
    crossedLocalDay,
    recoveryEndAt,
    onRecoveryEndAtChange,
    onInspectTask,
    onStopTimer,
    onRecoverTimer,
}: TaskActiveTimerBannerProps) {
    return (
        <>
            <div
                className={`task-timer flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5 ${activeTimer.recoveryRequired || elapsedHours >= 8 || crossedLocalDay ? 'border-warning/25 bg-warning/5' : 'border-border'}`}
            >
                <span className="size-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1 text-xs">
                    <button
                        type="button"
                        onClick={() => onInspectTask(activeTimer.taskId)}
                        className="inline-flex min-h-6 items-center text-left font-medium hover:underline"
                    >
                        {activeTimer.recoveryRequired ? 'Interrupted timer needs review' : 'Timer running'} ·{' '}
                        {timerTitle}
                    </button>
                    <p className="font-mono text-sm font-semibold tabular-nums">{elapsedLabel}</p>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    disabled={activeTimer.recoveryRequired}
                    onClick={() => void onStopTimer(activeTimer.taskId)}
                >
                    <Square className="size-3.5" />
                    Stop timer
                </Button>
            </div>
            {activeTimer.recoveryRequired && (
                <Alert className="border-warning/25 bg-warning/5">
                    <AlertDescription className="space-y-3 text-xs">
                        <p className="font-semibold">Confirm interrupted work session</p>
                        <Input
                            type="datetime-local"
                            value={recoveryEndAt}
                            onChange={(e) => onRecoveryEndAtChange(e.target.value)}
                            max={toDateTimeLocalInput(new Date())}
                            min={toDateTimeLocalInput(new Date(activeTimer.startedAt))}
                            className="max-w-xs"
                        />
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                onClick={() => void onRecoverTimer('stop')}
                                disabled={!recoveryEndAt}
                            >
                                Save confirmed time
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void onRecoverTimer('resume')}>
                                Continue from now
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="text-danger"
                                onClick={() => void onRecoverTimer('discard')}
                            >
                                Discard
                            </Button>
                        </div>
                    </AlertDescription>
                </Alert>
            )}
        </>
    );
}
