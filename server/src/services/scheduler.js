import cron from "node-cron";
import { Handle } from "../models/Handle.js";
import { HandleMeta } from "../models/HandleMeta.js";
import { RatingHistory } from "../models/RatingHistory.js";
import { DailySolved } from "../models/DailySolved.js";
import { PendingProblem } from "../models/PendingProblem.js";
import { getSolvedProblems, getUserInfo } from "./codeforces.js";
import { toLocalDateKey, computeRatingUpTo, calculateEloScore } from "./elo.js";

// Function to refresh data for a single handle
export async function refreshHandleData(handle) {
  try {
    console.log(`Refreshing data for handle: ${handle}`);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const todayKey = toLocalDateKey(nowSeconds);
    
    // Fetch user info and solved problems
    const [userInfo, solvedData] = await Promise.all([
      getUserInfo(handle),
      getSolvedProblems(handle)
    ]);

    // Update meta information
    const existingMeta = await HandleMeta.findOne({ handle }).lean();
    const lastUpdateDate = existingMeta?.lastUpdateDate || "";
    
    if (lastUpdateDate === todayKey) {
      console.log(`Handle ${handle} already updated today`);
      return;
    }

    // Calculate Elo rating
    const allHandles = await Handle.find().select("handle").lean();
    const handleList = allHandles.map((h) => h.handle);
    const ratingMap = await computeRatingUpTo(handleList, todayKey);
    const currentRating = ratingMap.get(handle) || 1000;

    // Update HandleMeta
    await HandleMeta.findOneAndUpdate(
      { handle },
      {
        handle,
        maxRating: userInfo.maxRating,
        totalSolved: solvedData.solvedCount,
        currentRating,
        lastUpdateDate: todayKey,
      },
      { upsert: true, new: true }
    );

    // Store today's solved problems
    const todayProblems = solvedData.recentByDate.get(todayKey) || [];
    if (todayProblems.length > 0) {
      await DailySolved.findOneAndUpdate(
        { handle, date: todayKey },
        { handle, date: todayKey, problems: todayProblems },
        { upsert: true }
      );
    }

    // Update rating history for last 6 days
    const lastSixDates = Array.from({ length: 6 }, (_, i) =>
      toLocalDateKey(nowSeconds - (5 - i) * 86400)
    );

    for (const dateKey of lastSixDates) {
      const dayStart = Math.floor(Date.now() / 1000) - (5 - lastSixDates.indexOf(dateKey)) * 86400;
      const ratingForDate = (await computeRatingUpTo(handleList, dateKey)).get(handle) || 1000;
      const prevDateKey = lastSixDates[lastSixDates.indexOf(dateKey) - 1];
      const prevRating = prevDateKey ? ((await computeRatingUpTo(handleList, prevDateKey)).get(handle) || 1000) : 1000;
      
      await RatingHistory.findOneAndUpdate(
        { handle, date: dateKey },
        {
          handle,
          date: dateKey,
          fromRating: prevRating,
          toRating: ratingForDate,
          delta: ratingForDate - prevRating,
        },
        { upsert: true }
      );
    }

    // Clean old data (older than 7 days)
    const sevenDaysAgo = toLocalDateKey(nowSeconds - 7 * 86400);
    await Promise.all([
      DailySolved.deleteMany({ handle, date: { $lt: sevenDaysAgo } }),
      RatingHistory.deleteMany({ handle, date: { $lt: sevenDaysAgo } }),
      PendingProblem.deleteMany({ handle, date: { $lt: sevenDaysAgo } })
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
  // Run at midnight every day
  cron.schedule("0 0 * * *", async () => {
    console.log("Running scheduled daily refresh at midnight");
    await refreshAllHandles();
  });
  
  console.log("Scheduler started: Daily refresh at 00:00");
}
