import express from "express";
import { Handle } from "../models/Handle.js";
import { getSolvedProblems, getUserInfo } from "../services/codeforces.js";
import { buildRecentStats, calculateEloScore, computeRatingUpTo } from "../services/elo.js";
import { RatingHistory } from "../models/RatingHistory.js";

const router = express.Router();

router.get("/standings", async (req, res) => {
  const handles = await Handle.find().sort({ createdAt: -1 });
  if (handles.length === 0) {
    return res.json([]);
  }

  try {
    const results = await Promise.all(
      handles.map(async (entry) => {
        const userInfo = await getUserInfo(entry.handle);
        const solvedProblems = await getSolvedProblems(entry.handle);
        const rating = calculateEloScore({
          maxRating: userInfo.maxRating,
          solvedProblems,
        });
        const recentStats = buildRecentStats({
          maxRating: userInfo.maxRating,
          solvedProblems,
        });

        const now = new Date();
        const todayKey = now.toISOString().slice(0, 10);
        const todayEndSeconds = Math.floor(Date.now() / 1000);
        const lastSixDates = Array.from({ length: 6 }, (_, i) => {
          const d = new Date(now);
          d.setUTCDate(d.getUTCDate() - (5 - i));
          return d.toISOString().slice(0, 10);
        });
        const lastFiveDates = lastSixDates.slice(1);

        const existingHistory = await RatingHistory.find({
          handle: entry.handle,
          date: { $in: lastSixDates },
        }).lean();

        const historyMap = new Map(
          existingHistory.map((item) => [item.date, item])
        );

        for (const dateKey of lastSixDates) {
          if (historyMap.has(dateKey)) {
            continue;
          }
          const endSeconds =
            dateKey === todayKey
              ? todayEndSeconds
              : Math.floor(new Date(`${dateKey}T23:59:59Z`).getTime() / 1000);
          const computed = computeRatingUpTo({
            maxRating: userInfo.maxRating,
            solvedProblems,
            dayEndSeconds: endSeconds,
          });
          const created = await RatingHistory.findOneAndUpdate(
            { handle: entry.handle, date: dateKey },
            { handle: entry.handle, date: dateKey, rating: computed },
            { upsert: true, new: true }
          ).lean();
          historyMap.set(dateKey, created);
        }

        await RatingHistory.deleteMany({
          handle: entry.handle,
          date: { $nin: lastSixDates },
        });

        const history = lastSixDates
          .map((dateKey) => historyMap.get(dateKey))
          .filter(Boolean);

        const historyStats = lastFiveDates
          .map((dateKey, index) => {
            const todayItem = historyMap.get(dateKey);
            const prevDate = lastSixDates[index];
            const prevItem = historyMap.get(prevDate);
            const fromRating = prevItem ? prevItem.rating : todayItem?.rating ?? 1000;
            const toRating = todayItem ? todayItem.rating : fromRating;
            const dayStats = recentStats.days.find((d) => d.date === dateKey);
            return {
              date: dateKey,
              fromRating,
              toRating,
              delta: toRating - fromRating,
              problems: dayStats?.problems ?? [],
              pendingCount: dayStats?.pendingCount ?? 0,
            };
          })
          .reverse();

        return {
          id: entry._id,
          handle: entry.handle,
          maxRating: userInfo.maxRating,
          solvedCount: solvedProblems.length,
          standingRating: rating,
          recentStats: historyStats,
        };
      })
    );

    const sorted = results.sort(
      (a, b) => b.standingRating - a.standingRating
    );
    return res.json(sorted);
  } catch (error) {
    return res.status(502).json({
      message: "Unable to fetch all standings. Please retry.",
    });
  }
});

export default router;
