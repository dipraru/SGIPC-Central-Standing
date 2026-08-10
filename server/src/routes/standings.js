import express from "express";
import { Handle } from "../models/Handle.js";
import { DailySolved } from "../models/DailySolved.js";
import { HandleMeta } from "../models/HandleMeta.js";
import { PendingProblem } from "../models/PendingProblem.js";
import { RatingHistory } from "../models/RatingHistory.js";
import {
  startOfLocalDayFromDateKey,
  toLocalDateKey,
} from "../services/elo.js";

const router = express.Router();

// ─── Active Standings ──────────────────────────────────────────────────────
router.get("/standings", async (req, res) => {
  // Only fetch active handles
  const handles = await Handle.find({ isInactive: { $ne: true } }).sort({ createdAt: -1 });
  if (handles.length === 0) {
    return res.json([]);
  }

  try {
    const results = await Promise.all(
      handles.map(async (entry) => {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const localTodayKey = toLocalDateKey(nowSeconds);
        const localTodayStart = startOfLocalDayFromDateKey(localTodayKey);
        const targetEndSeconds = localTodayStart - 1;
        const todayKey = toLocalDateKey(targetEndSeconds);
        const todayEndSeconds = startOfLocalDayFromDateKey(todayKey) + 86400 - 1;
        const lastSixDates = Array.from({ length: 6 }, (_, i) =>
          toLocalDateKey(targetEndSeconds - (5 - i) * 86400)
        );
        const lastFiveDates = lastSixDates.slice(1);

        try {
          const meta = await HandleMeta.findOne({ handle: entry.handle }).lean();

          let historyEntries = await RatingHistory.find({
            handle: entry.handle,
            date: { $in: lastSixDates },
          }).lean();

          const historyMap = new Map(
            historyEntries.map((item) => [item.date, item])
          );
          const solvedEntries = await DailySolved.find({
            handle: entry.handle,
            date: { $in: lastFiveDates },
          }).lean();
          const solvedMap = new Map(
            solvedEntries.map((item) => [item.date, item.problems])
          );
          const pendingEntries = await PendingProblem.find({
            handle: entry.handle,
            date: { $in: lastFiveDates },
          }).lean();
          const pendingCountMap = pendingEntries.reduce((acc, item) => {
            acc.set(item.date, (acc.get(item.date) || 0) + 1);
            return acc;
          }, new Map());

          const currentRating =
            historyMap.get(todayKey)?.rating ?? meta?.currentRating ?? 1000;

          const historyStats = lastFiveDates
            .map((dateKey, index) => {
              const todayItem = historyMap.get(dateKey);
              const prevDate = lastSixDates[index];
              const prevItem = historyMap.get(prevDate);
              const fromRating =
                prevItem?.rating ?? todayItem?.rating ?? currentRating;
              const toRating = todayItem ? todayItem.rating : fromRating;
              return {
                date: dateKey,
                fromRating,
                toRating,
                delta: toRating - fromRating,
                problems: solvedMap.get(dateKey) || [],
                pendingCount: pendingCountMap.get(dateKey) || 0,
              };
            })
            .reverse();

          const maxRating = meta?.maxRating ?? 0;
          const solvedCount = meta?.totalSolved ?? 0;

          return {
            id: entry._id,
            handle: entry.handle,
            name: entry.name || "",
            roll: entry.roll || "",
            batch: entry.batch || "",
            maxRating,
            solvedCount,
            standingRating: currentRating,
            recentStats: historyStats,
          };
        } catch (error) {
          console.error(`Error loading data for ${entry.handle}:`, error.message);
          return {
            id: entry._id,
            handle: entry.handle,
            name: entry.name || "",
            roll: entry.roll || "",
            batch: entry.batch || "",
            maxRating: 0,
            solvedCount: 0,
            standingRating: 1000,
            recentStats: [],
          };
        }
      })
    );

    const sorted = results.sort((a, b) => {
      if (b.standingRating !== a.standingRating) {
        return b.standingRating - a.standingRating;
      }
      if (b.maxRating !== a.maxRating) {
        return b.maxRating - a.maxRating;
      }
      return (a.roll || "").localeCompare(b.roll || "", undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
    return res.json(sorted);
  } catch (error) {
    return res.status(502).json({
      message: "Unable to fetch all standings. Please retry.",
    });
  }
});

// ─── Inactive Accounts ─────────────────────────────────────────────────────
router.get("/standings/inactive", async (req, res) => {
  try {
    const inactiveHandles = await Handle.find({ isInactive: true }).lean();

    if (inactiveHandles.length === 0) {
      return res.json([]);
    }

    const results = await Promise.all(
      inactiveHandles.map(async (entry) => {
        const meta = await HandleMeta.findOne({ handle: entry.handle }).lean();
        return {
          id: entry._id,
          handle: entry.handle,
          name: entry.name || "",
          roll: entry.roll || "",
          batch: entry.batch || "",
          maxRating: meta?.maxRating ?? 0,
          totalSolved: meta?.totalSolved ?? 0,
          inactiveSince: entry.inactiveSince || null,
        };
      })
    );

    // Sort by maxRating descending
    results.sort((a, b) => b.maxRating - a.maxRating);
    return res.json(results);
  } catch (error) {
    return res.status(502).json({
      message: "Unable to fetch inactive accounts.",
    });
  }
});

export default router;
