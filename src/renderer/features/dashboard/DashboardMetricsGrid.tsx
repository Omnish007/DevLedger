import { ArrowUpRight, type LucideIcon } from 'lucide-react';

export interface DashboardMetricCardItem {
    label: string;
    hint: string;
    value: number | string;
    onClick: () => void;
    tone: 'neutral' | 'warning' | 'danger';
    icon: LucideIcon;
}

export function DashboardMetricsGrid({ metrics }: { metrics: DashboardMetricCardItem[] }) {
    return (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Workspace summary">
            {metrics.map((item) => {
                const Icon = item.icon;
                const valueColor =
                    item.tone === 'danger'
                        ? 'text-danger'
                        : item.tone === 'warning'
                          ? 'text-warning'
                          : 'text-foreground';
                const iconBg =
                    item.tone === 'danger'
                        ? 'bg-danger-subtle text-danger-foreground'
                        : item.tone === 'warning'
                          ? 'bg-warning-subtle text-warning-foreground'
                          : 'bg-surface-subtle text-muted-foreground';
                return (
                    <button
                        key={item.label}
                        type="button"
                        onClick={item.onClick}
                        className="group rounded-[var(--workspace-radius)] border border-border bg-card px-4 py-3.5 text-left shadow-[var(--shadow-xs)] transition-colors hover:border-border hover:bg-surface-subtle/50"
                    >
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                            <span className={`grid size-7 place-items-center rounded-md ${iconBg}`}>
                                <Icon className="size-3.5" aria-hidden="true" />
                            </span>
                        </div>
                        <div
                            className={`mt-1.5 text-2xl font-semibold leading-none tabular-nums tracking-tight ${valueColor}`}
                        >
                            {item.value}
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                            <span className="truncate">{item.hint}</span>
                            <ArrowUpRight
                                className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-80"
                                aria-hidden="true"
                            />
                        </div>
                    </button>
                );
            })}
        </section>
    );
}
