import { prismaClient } from "@/lib/prisma";

export const MAX_HANDSHAKE_LEVEL = 9;

interface LevelConfigCache {
  loadedAt: number;
  byLevel: Map<number, number>;
  byThreshold: Map<number, number>;
}

let cache: LevelConfigCache | null = null;
const CACHE_TTL_MS = 60_000;

async function loadCache(): Promise<LevelConfigCache> {
  const rows = await prismaClient.levelConfig.findMany({
    orderBy: { level: "asc" },
  });
  const byLevel = new Map<number, number>();
  const byThreshold = new Map<number, number>();
  for (const row of rows) {
    byLevel.set(row.level, row.threshold);
    byThreshold.set(row.threshold, row.level);
  }
  return { loadedAt: Date.now(), byLevel, byThreshold };
}

async function getCache(): Promise<LevelConfigCache> {
  if (!cache || Date.now() - cache.loadedAt > CACHE_TTL_MS) {
    cache = await loadCache();
  }
  return cache;
}

export function invalidateLevelConfigCache(): void {
  cache = null;
}

/**
 * Map a successfully-completed-app count to a level per spec §33.
 * Returns 1 for new users (count < 10). Max 9.
 */
export async function getLevelFromCompletedCount(
  completedCount: number,
): Promise<number> {
  const c = await getCache();
  const thresholds = Array.from(c.byThreshold.keys()).sort((a, b) => a - b);
  let level = 1;
  for (const threshold of thresholds) {
    if (completedCount >= threshold) {
      level = c.byThreshold.get(threshold) ?? level;
    } else {
      break;
    }
  }
  return Math.min(MAX_HANDSHAKE_LEVEL, Math.max(1, level));
}

/**
 * Returns the threshold (min completedCount) needed to reach `level`.
 */
export async function getLevelThreshold(level: number): Promise<number | null> {
  const c = await getCache();
  return c.byLevel.get(level) ?? null;
}

/**
 * Returns the next threshold above the given level, or null if at max.
 */
export async function getNextThreshold(level: number): Promise<number | null> {
  const c = await getCache();
  const nextLevel = level + 1;
  if (nextLevel > MAX_HANDSHAKE_LEVEL) return null;
  return c.byLevel.get(nextLevel) ?? null;
}

export async function getLevelProgress(completedCount: number): Promise<{
  level: number;
  completedCount: number;
  currentThreshold: number;
  nextThreshold: number | null;
  percent: number;
  remaining: number;
}> {
  const c = await getCache();
  const level = await getLevelFromCompletedCount(completedCount);
  const currentThreshold = c.byLevel.get(level) ?? 0;
  const nextThreshold = await getNextThreshold(level);

  let percent = 100;
  let remaining = 0;
  if (nextThreshold !== null) {
    const span = (nextThreshold as number) - currentThreshold;
    const into = completedCount - currentThreshold;
    percent = span > 0 ? Math.max(0, Math.min(100, Math.round((into / span) * 100))) : 100;
    remaining = Math.max(0, (nextThreshold as number) - completedCount);
  }

  return {
    level,
    completedCount,
    currentThreshold,
    nextThreshold,
    percent,
    remaining,
  };
}

export async function getAllLevels(): Promise<
  Array<{ level: number; threshold: number }>
> {
  const c = await getCache();
  return Array.from(c.byLevel.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([level, threshold]) => ({ level, threshold }));
}
