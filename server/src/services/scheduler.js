import cron from "node-cron";
import { Handle } from "../models/Handle.js";
import { HandleMeta } from "../models/HandleMeta.js";
import { RatingHistory } from "../models/RatingHistory.js";
import { DailySolved } from "../models/DailySolved.js";
import { PendingProblem } from "../models/PendingProblem.js";
import { getSolvedProblems, getUserInfo } from "./codeforces.js";
import { toLocalDateKey, computeRatingUpTo, startOfLocalDayFromDateKey } from "./elo.js";

// Function to refresh data for a single handle
export async function refreshHandleData(handle, options = {}) {
  const { fullHistory = false } = options;
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
      getSolvedProblems(handle)
    ]);

    // Deduplicate problems; treat Div1/Div2 mirrored problems (contestId diff 1 and same name) as the same
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
        // Keep earliest solve time
        Object.assign(existing, problem);
      }
    }

    // Update meta information
    const existingMeta = await HandleMeta.findOne({ handle }).lean();
    const totalSolved = uniqueSolved.length;

    // Update rating history for last 6 days
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
    // Always recalculate all 6 days to ensure fresh data
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
      PendingProblem.deleteMany({ handle, date: { $lt: oldestKeptDate } })
    ]);

    console.log(`Successfully refreshed data for handle: ${handle} (up to ${targetDateKey})`);
  } catch (error) {
    console.error(`Error refreshing handle ${handle}:`, error.message);
  }
}

// Function to refresh all handles. Defaults to incremental refresh to stay within
// serverless time limits; use fullHistory=true only when bootstrapping new data.
export async function refreshAllHandles(options = {}) {
  const { fullHistory = false } = options;
  console.log(
    `Starting refresh for all handles (fullHistory=${fullHistory ? "yes" : "no"})...`
  );
  const handles = await Handle.find().select("handle").lean();

  for (const { handle } of handles) {
    await refreshHandleData(handle, { fullHistory });
  }

  console.log("Refresh completed for all handles");
}

// Schedule daily refresh at midnight (00:00)
export function startScheduler() {
  // Run once at server start
  console.log("Running one-time refresh at server start");
  refreshAllHandles().catch((error) =>
    console.error("One-time refresh failed:", error)
  );
  console.log("Scheduler started: One-time refresh");
}
