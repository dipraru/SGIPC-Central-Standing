import cron from "node-cron";
import { Handle } from "../models/Handle.js";
import { HandleMeta } from "../models/HandleMeta.js";
import { RatingHistory } from "../models/RatingHistory.js";
import { DailySolved } from "../models/DailySolved.js";
import { PendingProblem } from "../models/PendingProblem.js";
import { getSolvedProblems, getUserInfo } from "./codeforces.js";
import { toLocalDateKey, computeRatingUpTo, startOfLocalDayFromDateKey } from "./elo.js";

// 90 days in seconds — threshold for marking an account inactive
const INACTIVE_THRESHOLD_SECONDS = 90 * 24 * 3600;

// 3-day grace period before purging historical data after marking inactive
const INACTIVE_GRACE_DAYS = 3;

// Delay between handle refreshes to avoid CF rate-limiting (ms)
const HANDLE_REFRESH_DELAY_MS = 600;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Check if a handle has solved any problem in the last 90 days
const hasRecentActivity = (solvedProblems) => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const cutoff = nowSeconds - INACTIVE_THRESHOLD_SECONDS;
  return solvedProblems.some(
    (p) => p.solvedAtSeconds && p.solvedAtSeconds >= cutoff
  );
};

// Function to refresh data for a single handle
export async function refreshHandleData(handle, options = {}) {
  const { fullHistory = false, forceActive = false } = options;
  try {
    console.log(`Refreshing data for handle: ${handle}`);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const localTodayKey = toLocalDateKey(nowSeconds);
    const localTodayStart = startOfLocalDayFromDateKey(localTodayKey);
    const targetEndSeconds = localTodayStart - 1;
    const targetDateKey = toLocalDateKey(targetEndSeconds);

    // Fetch user info and solved problems
    const [userInfo, solvedProblems] = await Promise.all([
      getUserInfo(handle),
      getSolvedProblems(handle),
    ]);

    // Deduplicate problems; treat Div1/Div2 mirrored problems as the same
    const areSameProblem = (a, b) => {
      const nameMatch = (a.name || "").toLowerCase() === (b.name || "").toLowerCase();
      const contestClose =
        Number.isFinite(a.contestId) &&
        Number.isFinite(b.contestId) &&
        Math.abs(a.contestId - b.contestId) <= 1;
      const sameIndex = a.index === b.index && a.contestId === b.contestId;
      return sameIndex || (nameMatch && contestClose);
    };

    const uniqueSolved = [];
    for (const problem of solvedProblems) {
      const existing = uniqueSolved.find((p) => areSameProblem(p, problem));
      if (!existing) {
        uniqueSolved.push(problem);
      } else if (
        problem.solvedAtSeconds &&
        (!existing.solvedAtSeconds || problem.solvedAtSeconds < existing.solvedAtSeconds)
      ) {
        Object.assign(existing, problem);
      }
    }

    // ── Inactive detection ────────────────────────────────────────────────────
    const active = forceActive || hasRecentActivity(uniqueSolved);

    if (!active) {
      // No activity in 90 days — mark as inactive
      const handleDoc = await Handle.findOne({ handle });
      if (handleDoc) {
        if (!handleDoc.isInactive) {
          // First time becoming inactive — set timestamp, don't purge yet
          await Handle.updateOne(
            { handle },
            { isInactive: true, inactiveSince: new Date() }
          );
          console.log(`Handle ${handle} marked as inactive (no solves in 90 days).`);
        } else {
          // Already inactive — check if grace period has passed
          const inactiveSince = handleDoc.inactiveSince
            ? new Date(handleDoc.inactiveSince)
            : new Date();
          const daysSinceInactive = Math.floor(
            (Date.now() - inactiveSince.getTime()) / (1000 * 3600 * 24)
          );

          if (daysSinceInactive >= INACTIVE_GRACE_DAYS) {
            // Grace period over — purge historical data to save storage
            await Promise.all([
              DailySolved.deleteMany({ handle }),
              RatingHistory.deleteMany({ handle }),
              PendingProblem.deleteMany({ handle }),
            ]);
            // Keep HandleMeta updated with latest maxRating & totalSolved
            await HandleMeta.findOneAndUpdate(
              { handle },
              {
                handle,
                maxRating: userInfo.maxRating,
                totalSolved: uniqueSolved.length,
                currentRating: 1000,
                lastUpdateDate: targetDateKey,
              },
              { upsert: true, new: true }
            );
            console.log(
              `Handle ${handle} historical data purged (inactive ${daysSinceInactive} days).`
            );
          } else {
            console.log(
              `Handle ${handle} is inactive but still within grace period (${daysSinceInactive}/${INACTIVE_GRACE_DAYS} days).`
            );
          }
        }
      }
      return; // Stop here — no rating/daily data to refresh for inactive handle
    }

    // ── Active handle — re-activate if previously inactive or forceActive ──────
    const handleDoc = await Handle.findOne({ handle });
    if (handleDoc?.isInactive || forceActive) {
      await Handle.updateOne(
        { handle },
        { isInactive: false, inactiveSince: null }
      );
      console.log(`Handle ${handle} re-activated.`);
    }

    // ── Continue with normal data refresh ─────────────────────────────────────
    const existingMeta = await HandleMeta.findOne({ handle }).lean();
    const totalSolved = uniqueSolved.length;

    const targetDayStart = startOfLocalDayFromDateKey(targetDateKey);
    const lastSixDates = Array.from({ length: 6 }, (_, i) =>
      toLocalDateKey(targetDayStart - (5 - i) * 86400)
    );
    const lastFiveDates = lastSixDates.slice(1);

    if (fullHistory) {
      await Promise.all([
        DailySolved.deleteMany({ handle }),
        RatingHistory.deleteMany({ handle }),
        PendingProblem.deleteMany({ handle }),
      ]);
    }

    const dailySolvedMap = new Map(lastFiveDates.map((dateKey) => [dateKey, []]));
    const pendingMap = new Map();

    for (const problem of uniqueSolved) {
      if (!problem.solvedAtSeconds || problem.isGym) {
        continue;
      }
      const dateKey = toLocalDateKey(problem.solvedAtSeconds);
      const daysAgo = Math.floor((targetEndSeconds - problem.solvedAtSeconds) / 86400);

      if (!problem.rating) {
        if (daysAgo <= 30) {
          pendingMap.set(`${problem.contestId}-${problem.index}`, {
            handle,
            date: dateKey,
            contestId: problem.contestId,
            index: problem.index,
            name: problem.name,
            solvedAtSeconds: problem.solvedAtSeconds,
          });
        }
        continue;
      }

      if (dailySolvedMap.has(dateKey)) {
        dailySolvedMap.get(dateKey).push({
          contestId: problem.contestId,
          index: problem.index,
          name: problem.name,
          rating: problem.rating,
        });
      }
    }

    await DailySolved.deleteMany({ handle, date: { $nin: lastFiveDates } });
    await Promise.all(
      lastFiveDates.map((dateKey) =>
        DailySolved.findOneAndUpdate(
          { handle, date: dateKey },
          { handle, date: dateKey, problems: dailySolvedMap.get(dateKey) || [] },
          { upsert: true, new: true }
        )
      )
    );

    await PendingProblem.deleteMany({ handle, date: { $lt: lastSixDates[0] } });
    await PendingProblem.deleteMany({ handle });
    if (pendingMap.size > 0) {
      await PendingProblem.insertMany(Array.from(pendingMap.values()));
    }

    let currentRating = 1000;
    const historyMap = new Map();
    for (const dateKey of lastSixDates) {
      const endSeconds = startOfLocalDayFromDateKey(dateKey) + 86400 - 1;
      const ratingForDate = computeRatingUpTo({
        maxRating: userInfo.maxRating,
        solvedProblems: uniqueSolved,
        dayEndSeconds: endSeconds,
      });
      const created = await RatingHistory.findOneAndUpdate(
        { handle, date: dateKey },
        { handle, date: dateKey, rating: ratingForDate },
        { upsert: true, new: true }
      ).lean();
      historyMap.set(dateKey, created);
    }
    currentRating = historyMap.get(targetDateKey)?.rating ?? 1000;

    // Save maxRating along with other meta — this is the critical fix
    await HandleMeta.findOneAndUpdate(
      { handle },
      {
        handle,
        maxRating: userInfo.maxRating,
        totalSolved,
        currentRating,
        lastUpdateDate: targetDateKey,
      },
      { upsert: true, new: true }
    );

    // Clean old data (keep last 6 days)
    const oldestKeptDate = lastSixDates[0];
    await Promise.all([
      DailySolved.deleteMany({ handle, date: { $lt: oldestKeptDate } }),
      RatingHistory.deleteMany({ handle, date: { $lt: oldestKeptDate } }),
      PendingProblem.deleteMany({ handle, date: { $lt: oldestKeptDate } }),
    ]);

    console.log(`Successfully refreshed data for handle: ${handle} (up to ${targetDateKey})`);
  } catch (error) {
    console.error(`Error refreshing handle ${handle}:`, error.message);
  }
}

// Refresh all active handles with delay between each to avoid CF rate-limits
export async function refreshAllHandles(options = {}) {
  const { fullHistory = false, forceHandles = [] } = options;
  console.log(
    `Starting refresh for all handles (fullHistory=${fullHistory ? "yes" : "no"})...`
  );

  // Fetch all handles; skip inactive unless they are in forceHandles list
  const allHandles = await Handle.find().select("handle isInactive").lean();
  const handlesToRefresh = allHandles.filter(
    (h) => !h.isInactive || forceHandles.includes(h.handle)
  );

  console.log(
    `Refreshing ${handlesToRefresh.length} active handles (${allHandles.length - handlesToRefresh.length} inactive skipped)`
  );

  for (const { handle } of handlesToRefresh) {
    await refreshHandleData(handle, { fullHistory });
    // Throttle to avoid hitting Codeforces rate limits
    await delay(HANDLE_REFRESH_DELAY_MS);
  }

  console.log("Refresh completed for all handles");
}

// Schedule daily refresh at midnight Bangladesh time (UTC+6 = 18:00 UTC)
export function startScheduler() {
  // Run once at server start to ensure data is fresh
  console.log("Running one-time refresh at server start...");
  refreshAllHandles().catch((error) =>
    console.error("One-time refresh failed:", error)
  );

  // Schedule cron job: midnight every day in Bangladesh time (UTC+6)
  // "0 18 * * *" = 18:00 UTC = 00:00 UTC+6
  cron.schedule("0 18 * * *", () => {
    console.log("[Cron] Midnight Bangladesh time — starting scheduled refresh...");
    refreshAllHandles().catch((error) =>
      console.error("[Cron] Scheduled refresh failed:", error)
    );
  }, {
    timezone: "UTC",
  });

  console.log(
    "Scheduler started: Daily refresh cron active at midnight Bangladesh time (18:00 UTC)"
  );
}
