import type { TaskRecord } from '@shared/contracts';

export interface OrderedTaskRow {
    task: TaskRecord;
    depth: number;
    hasChildren: boolean;
    contextOnly: boolean;
}

export function orderVisibleTasks(
    visibleTasks: TaskRecord[],
    pageTasks: TaskRecord[],
    collapsedIds: ReadonlySet<string>,
): OrderedTaskRow[] {
    const matchingIds = new Set(visibleTasks.map((task) => task.id));
    const includedIds = new Set(matchingIds);
    const taskById = new Map(pageTasks.map((task) => [task.id, task]));
    for (const task of visibleTasks) {
        let parentId = task.parentId;
        const ancestors = new Set<string>();
        while (parentId && !ancestors.has(parentId)) {
            ancestors.add(parentId);
            includedIds.add(parentId);
            parentId = taskById.get(parentId)?.parentId ?? null;
        }
    }

    const children = new Map<string | null, TaskRecord[]>();
    for (const task of pageTasks) {
        const siblings = children.get(task.parentId) ?? [];
        siblings.push(task);
        children.set(task.parentId, siblings);
    }

    const output: OrderedTaskRow[] = [];
    const visited = new Set<string>();
    const walk = (parent: string | null, depth: number): void => {
        for (const task of children.get(parent) ?? []) {
            if (visited.has(task.id) || !includedIds.has(task.id)) continue;
            visited.add(task.id);
            const taskChildren = children.get(task.id) ?? [];
            output.push({
                task,
                depth,
                hasChildren: taskChildren.length > 0,
                contextOnly: !matchingIds.has(task.id),
            });
            if (!collapsedIds.has(task.id)) walk(task.id, depth + 1);
        }
    };
    walk(null, 0);
    for (const task of visibleTasks) {
        if (visited.has(task.id)) continue;
        let parentId = task.parentId;
        let hiddenByCollapsedAncestor = false;
        const ancestors = new Set<string>();
        while (parentId && !ancestors.has(parentId)) {
            if (collapsedIds.has(parentId)) {
                hiddenByCollapsedAncestor = true;
                break;
            }
            ancestors.add(parentId);
            parentId = taskById.get(parentId)?.parentId ?? null;
        }
        if (!hiddenByCollapsedAncestor)
            output.push({
                task,
                depth: 0,
                hasChildren: (children.get(task.id) ?? []).length > 0,
                contextOnly: false,
            });
    }
    return output;
}
