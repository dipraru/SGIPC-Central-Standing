import cron from "node-cron";
import { Handle } from "../models/Handle.js";
import { HandleMeta } from "../models/HandleMeta.js";
import { RatingHistory } from "../models/RatingHistory.js";
import { DailySolved } from "../models/DailySolved.js";
import { PendingProblem } from "../models/PendingProblem.js";
import { getSolvedProblems, getUserInfo } from "./codeforces.js";
import { toLocalDateKey, computeRatingUpTo } from "./elo.js";

// Function to refresh data for a single handle
export async function refreshHandleData(handle) {
  try {
    console.log(`Refreshing data for handle: ${handle}`);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const todayKey = toLocalDateKey(nowSeconds);
    
    // Fetch user info and solved problems
    const [userInfo, solvedProblems] = await Promise.all([
      getUserInfo(handle),
      getSolvedProblems(handle)
    ]);

    // Update meta information
    const existingMeta = await HandleMeta.findOne({ handle }).lean();
    const lastUpdateDate = existingMeta?.lastUpdateDate || "";
    if (lastUpdateDate === todayKey) {
      console.log(`Handle ${handle} already updated today; refreshing today's rating`);
    }

    const totalSolved = solvedProblems.length;

    // Update rating history for last 6 days
    const lastSixDates = Array.from({ length: 6 }, (_, i) =>
      toLocalDateKey(nowSeconds - (5 - i) * 86400)
    );
    const lastFiveDates = lastSixDates.slice(1);

    const dailySolvedMap = new Map(lastFiveDates.map((dateKey) => [dateKey, []]));
    const pendingMap = new Map();

    for (const problem of solvedProblems) {
      if (!problem.solvedAtSeconds || problem.isGym) {
        continue;
      }
      const dateKey = toLocalDateKey(problem.solvedAtSeconds);
      const daysAgo = Math.floor((nowSeconds - problem.solvedAtSeconds) / 86400);

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

    // Only compute today's rating; keep previous days as-is
    const todayRating = computeRatingUpTo({
      maxRating: userInfo.maxRating,
      solvedProblems,
      dayEndSeconds: nowSeconds,
    });

    await RatingHistory.findOneAndUpdate(
      { handle, date: todayKey },
      { handle, date: todayKey, rating: todayRating },
      { upsert: true, new: true }
    );

    const currentRating = todayRating ?? 1000;

    await HandleMeta.findOneAndUpdate(
      { handle },
      {
        handle,
        maxRating: userInfo.maxRating,
        totalSolved,
        currentRating,
        lastUpdateDate: todayKey,
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

    console.log(`Successfully refreshed data for handle: ${handle}`);
  } catch (error) {
    console.error(`Error refreshing handle ${handle}:`, error.message);
  }
}

// Function to refresh all handles
export async function refreshAllHandles() {
  console.log("Starting daily refresh for all handles...");
  const handles = await Handle.find().select("handle").lean();
  
  for (const { handle } of handles) {
    await refreshHandleData(handle);
  }
  
  console.log("Daily refresh completed for all handles");
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
