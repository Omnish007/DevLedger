import { Square } from 'lucide-react';
import type { DashboardActiveTimerDetail, WorkspaceNavigationTarget } from '@shared/contracts';
import { Button } from '@/components/ui/button';
import { formatRelative } from '@/lib/utils';

interface DashboardActiveTimerBannerProps {
    timerDetail: DashboardActiveTimerDetail;
    projectName: string;
    onNavigateTarget: (target: WorkspaceNavigationTarget) => void;
    onStopTimer?: ((taskId: string) => Promise<void>) | undefined;
}

export function DashboardActiveTimerBanner({
    timerDetail,
    projectName,
    onNavigateTarget,
    onStopTimer,
}: DashboardActiveTimerBannerProps) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3 text-xs">
            <div className="flex min-w-0 items-center gap-2.5">
                <span className="size-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0">
                    <p className="font-medium text-foreground">
                        {timerDetail.recoveryRequired ? 'Timer needs review' : 'Active focus session'} ·{' '}
                        <button
                            type="button"
                            className="inline-flex min-h-6 items-center text-left font-semibold text-primary hover:underline"
                            onClick={() =>
                                onNavigateTarget({
                                    view: 'tasks',
                                    recordId: timerDetail.taskId,
                                    projectId: timerDetail.projectId,
                                })
                            }
                        >
                            {timerDetail.taskTitle}
                        </button>
                    </p>
                    <p className="text-muted-foreground">
                        Started {formatRelative(timerDetail.startedAt)} · {projectName}
                    </p>
                </div>
            </div>
            {!timerDetail.recoveryRequired && onStopTimer && (
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => void onStopTimer(timerDetail.taskId)}
                >
                    <Square className="size-3" />
                    Stop timer
                </Button>
            )}
        </div>
    );
}
