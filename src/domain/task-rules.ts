export interface TaskEdge {
  fromTaskId: string;
  toTaskId: string;
}

export function wouldCreateDependencyCycle(edges: readonly TaskEdge[], fromTaskId: string, toTaskId: string): boolean {
  if (fromTaskId === toTaskId) return true;
  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = graph.get(edge.fromTaskId) ?? [];
    targets.push(edge.toTaskId);
    graph.set(edge.fromTaskId, targets);
  }
  const stack = [toTaskId];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    if (current === fromTaskId) return true;
    visited.add(current);
    stack.push(...(graph.get(current) ?? []));
  }
  return false;
}

export function wouldCreateParentCycle(
  parentByTaskId: ReadonlyMap<string, string | null>,
  taskId: string,
  proposedParentId: string | null,
): boolean {
  if (proposedParentId === null) return false;
  if (taskId === proposedParentId) return true;
  const visited = new Set<string>();
  let current: string | null | undefined = proposedParentId;
  while (current) {
    if (current === taskId || visited.has(current)) return true;
    visited.add(current);
    current = parentByTaskId.get(current);
  }
  return false;
}

export function elapsedMinutes(startedAt: string, stoppedAt: string): number {
  const start = Date.parse(startedAt);
  const stop = Date.parse(stoppedAt);
  if (!Number.isFinite(start) || !Number.isFinite(stop) || stop < start) {
    throw new RangeError('A time entry must have valid timestamps with stop at or after start.');
  }
  return Math.floor((stop - start) / 60_000);
}
