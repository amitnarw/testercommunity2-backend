import { prismaClient } from "@/lib/prisma";

export const MAX_HANDSHAKE_LEVEL = 9;
export const BASE_HANDSHAKE_SLOTS = 12;

/**
 * Slots available at a given level.
 * Level 1 => 12 slots, each level adds 1, capped at MAX level.
 */
export function getAvailableSlots(level: number): number {
  const lvl = Math.min(Math.max(level, 1), MAX_HANDSHAKE_LEVEL);
  return lvl + (BASE_HANDSHAKE_SLOTS - 1); // level 1 => 12
}

/**
 * Count of currently active handshake agreements a user participates in.
 */
export async function getActiveHandshakeCount(userId: string): Promise<number> {
  return await prismaClient.handshakeLink.count({
    where: {
      status: "ACTIVE",
      OR: [
        { relationA: { testerId: userId } },
        { relationB: { testerId: userId } },
      ],
    },
  });
}

/**
 * Compute current day number from testing start date (1-indexed).
 */
export function computeCurrentDay(testingStartDate: Date | null): number {
  if (!testingStartDate) return 0;
  const start = new Date(testingStartDate).getTime();
  const now = Date.now();
  const diffDays = Math.floor((now - start) / (24 * 60 * 60 * 1000));
  return diffDays + 1;
}

/**
 * Returns true if the user has submitted verification for the given day number
 * on the provided relation.
 */
export async function hasVerificationForDay(
  relationId: number,
  dayNumber: number,
): Promise<boolean> {
  const count = await prismaClient.dailyTesterVerification.count({
    where: {
      testerRelationId: relationId,
      dayNumber,
    },
  });
  return count > 0;
}

/**
 * Extend (or create) a block on a given side of a handshake link.
 * Accumulates: if already blocked, the block is extended by one day.
 */
function extendBlock(
  current: Date | null,
  now: Date,
): Date {
  const base = current && current > now ? current : now;
  const result = new Date(base);
  result.setDate(result.getDate() + 1);
  return result;
}

/**
 * Lazy evaluation of skip penalties for a handshake link.
 * Processes all days between lastProcessedDay and current day, incrementing
 * the partner's block each time a side fails to submit its verification.
 *
 * The two relations:
 *   relationA => tester (user X) testing appOwner (user Y)'s app
 *   relationB => tester (user Y) testing appOwner (user X)'s app
 * If relationA's tester skips a day, relationB's tester is blocked.
 * If relationB's tester skips a day, relationA's tester is blocked.
 */
export async function processSkipPenalty(
  linkId: number,
): Promise<void> {
  const link = await prismaClient.handshakeLink.findUnique({
    where: { id: linkId },
    include: {
      relationA: { include: { dashboardAndHub: true } },
      relationB: { include: { dashboardAndHub: true } },
    },
  });

  if (!link || link.status !== "ACTIVE") return;

  const appA = link.relationA.dashboardAndHub; // relationA's tester tests this app
  const appB = link.relationB.dashboardAndHub; // relationB's tester tests this app

  // Only apply penalties once both apps are in testing phase.
  if (!appA || !appB) return;
  if (appA.status !== "IN_TESTING" || appB.status !== "IN_TESTING") {
    return;
  }

  const dayA = computeCurrentDay(appA.testingStartDate);
  const dayB = computeCurrentDay(appB.testingStartDate);

  // Process each day that has fully elapsed and not yet been processed.
  let aBlockedUntil = link.aBlockedUntil;
  let bBlockedUntil = link.bBlockedUntil;
  const now = new Date();

  for (let day = link.lastProcessedDay + 1; day < Math.min(dayA, dayB); day++) {
    const aSubmitted = await hasVerificationForDay(link.relationAId, day);
    if (!aSubmitted) {
      bBlockedUntil = extendBlock(bBlockedUntil, now);
    }
    const bSubmitted = await hasVerificationForDay(link.relationBId, day);
    if (!bSubmitted) {
      aBlockedUntil = extendBlock(aBlockedUntil, now);
    }
  }

  const maxProcessed = Math.max(dayA, dayB) - 1;
  if (
    maxProcessed > link.lastProcessedDay ||
    aBlockedUntil !== link.aBlockedUntil ||
    bBlockedUntil !== link.bBlockedUntil
  ) {
    await prismaClient.handshakeLink.update({
      where: { id: linkId },
      data: {
        aBlockedUntil,
        bBlockedUntil,
        lastProcessedDay: Math.max(maxProcessed, link.lastProcessedDay),
      },
    });
  }
}

/**
 * Determine if a tester (relationId) is currently blocked from submitting,
 * and return the relevant block info.
 */
export async function getBlockStatus(
  link: { aBlockedUntil: Date | null; bBlockedUntil: Date | null },
  side: "A" | "B",
): Promise<{ isBlocked: boolean; blockedUntil: Date | null }> {
  const blockedUntil = side === "A" ? link.aBlockedUntil : link.bBlockedUntil;
  const isBlocked = !!blockedUntil && blockedUntil > new Date();
  return { isBlocked, blockedUntil: isBlocked ? blockedUntil : null };
}

/**
 * Increment handshake completed count for a user and level them up if
 * they've crossed a 2-test threshold (capped at MAX level).
 */
export async function incrementHandshakeCompletion(
  userId: string,
): Promise<void> {
  const user = await prismaClient.user.findUnique({
    where: { id: userId },
    select: { handshakeLevel: true, handshakeCompletedCount: true },
  });
  if (!user) return;

  let { handshakeLevel, handshakeCompletedCount } = user;
  handshakeCompletedCount += 1;

  // Level up every 2 successful handshakes
  const newLevel = Math.min(
    MAX_HANDSHAKE_LEVEL,
    1 + Math.floor(handshakeCompletedCount / 2),
  );
  if (newLevel !== handshakeLevel) {
    handshakeLevel = newLevel;
  }

  await prismaClient.user.update({
    where: { id: userId },
    data: { handshakeLevel, handshakeCompletedCount },
  });
}

/**
 * If both sides of a handshake have COMPLETED, mark the link COMPLETED and
 * increment both users' successful-handshake counters (which may level them up).
 */
export async function checkAndFinalizeHandshake(
  linkId: number,
): Promise<void> {
  const link = await prismaClient.handshakeLink.findUnique({
    where: { id: linkId },
    include: { relationA: true, relationB: true },
  });
  if (!link || link.status === "COMPLETED") return;

  if (
    link.relationA?.status === "COMPLETED" &&
    link.relationB?.status === "COMPLETED"
  ) {
    await prismaClient.handshakeLink.update({
      where: { id: linkId },
      data: { status: "COMPLETED" },
    });
    await incrementHandshakeCompletion(link.relationA.testerId);
    await incrementHandshakeCompletion(link.relationB.testerId);
  }
}
