import express from "express";
import { Handle } from "../models/Handle.js";
import { DailySolved } from "../models/DailySolved.js";
import { HandleMeta } from "../models/HandleMeta.js";
import { PendingProblem } from "../models/PendingProblem.js";
import { RatingHistory } from "../models/RatingHistory.js";
import { getSolvedProblems, getUserInfo } from "../services/codeforces.js";
import {
  calculateEloScore,
  computeRatingUpTo,
  startOfLocalDayFromDateKey,
  toLocalDateKey,
} from "../services/elo.js";

const router = express.Router();

router.get("/standings", async (req, res) => {
  const handles = await Handle.find().sort({ createdAt: -1 });
  if (handles.length === 0) {
    return res.json([]);
  }

  try {
    const results = await Promise.all(
      handles.map(async (entry) => {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const todayKey = toLocalDateKey(nowSeconds);
        const todayEndSeconds = nowSeconds;
        const lastSixDates = Array.from({ length: 6 }, (_, i) =>
          toLocalDateKey(nowSeconds - (5 - i) * 86400)
        );
        const lastFiveDates = lastSixDates.slice(1);
        const forceRefresh = req.query.refresh === "1";

        try {
          let historyEntries = await RatingHistory.find({
            handle: entry.handle,
            date: { $in: lastSixDates },
          }).lean();
          const historyMapFromDb = new Map(
            historyEntries.map((item) => [item.date, item])
          );
          const historyComplete = lastSixDates.every((dateKey) =>
            historyMapFromDb.has(dateKey)
          );

          const meta = await HandleMeta.findOne({ handle: entry.handle }).lean();
          const needsRefresh =
            forceRefresh || !meta || meta.lastUpdateDate !== todayKey || !historyComplete;

          let maxRating = 0;
          let solvedProblems = [];
          let totalSolved = meta?.totalSolved ?? 0;

          if (needsRefresh) {
            const userInfo = await getUserInfo(entry.handle);
            solvedProblems = await getSolvedProblems(entry.handle);
            maxRating = userInfo.maxRating;
            totalSolved = solvedProblems.length;

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
                    handle: entry.handle,
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

            await DailySolved.deleteMany({
              handle: entry.handle,
              date: { $nin: lastFiveDates },
            });

            await Promise.all(
              lastFiveDates.map((dateKey) =>
                DailySolved.findOneAndUpdate(
                  { handle: entry.handle, date: dateKey },
                  { handle: entry.handle, date: dateKey, problems: dailySolvedMap.get(dateKey) || [] },
                  { upsert: true, new: true }
                )
              )
            );

            await PendingProblem.deleteMany({
              handle: entry.handle,
              date: { $lt: lastSixDates[0] },
            });
            await PendingProblem.deleteMany({ handle: entry.handle });
            if (pendingMap.size > 0) {
              await PendingProblem.insertMany(Array.from(pendingMap.values()));
            }

            await RatingHistory.deleteMany({ handle: entry.handle });
            const historyMap = new Map();
            for (const dateKey of lastSixDates) {
              const endSeconds =
                dateKey === todayKey
                  ? todayEndSeconds
                  : startOfLocalDayFromDateKey(dateKey) + 86400 - 1;
              const computed = computeRatingUpTo({
                maxRating,
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

            const currentRating = historyMap.get(todayKey)?.rating ?? 1000;
            await HandleMeta.findOneAndUpdate(
              { handle: entry.handle },
              {
                handle: entry.handle,
                lastUpdateDate: todayKey,
                currentRating,
                totalSolved,
              },
              { upsert: true, new: true }
            );

            historyEntries = Array.from(historyMap.values());
          }

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

          const historyStats = lastFiveDates
            .map((dateKey, index) => {
              const todayItem = historyMap.get(dateKey);
              const prevDate = lastSixDates[index];
              const prevItem = historyMap.get(prevDate);
              const fromRating = prevItem ? prevItem.rating : todayItem?.rating ?? 1000;
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

          let metaLatest = await HandleMeta.findOne({ handle: entry.handle }).lean();
          const currentRating = metaLatest?.currentRating ?? 1000;
          let solvedCount = metaLatest?.totalSolved ?? totalSolved;
          let resolvedMaxRating = maxRating;

          if (!metaLatest || solvedCount === 0) {
            const userInfo = await getUserInfo(entry.handle);
            const solvedAll = await getSolvedProblems(entry.handle);
            solvedCount = solvedAll.length;
            resolvedMaxRating = userInfo.maxRating;
            metaLatest = await HandleMeta.findOneAndUpdate(
              { handle: entry.handle },
              {
                handle: entry.handle,
                lastUpdateDate: metaLatest?.lastUpdateDate ?? todayKey,
                currentRating,
                totalSolved: solvedCount,
              },
              { upsert: true, new: true }
            ).lean();
          }
          return {
            id: entry._id,
            handle: entry.handle,
            name: entry.name || "",
            roll: entry.roll || "",
            batch: entry.batch || "",
            maxRating: resolvedMaxRating || (await getUserInfo(entry.handle)).maxRating,
            solvedCount,
            standingRating: currentRating,
            recentStats: historyStats,
          };
        } catch (error) {
          const historyEntries = await RatingHistory.find({
            handle: entry.handle,
            date: { $in: lastSixDates },
          }).lean();
          if (historyEntries.length === 0) {
            throw error;
          }
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
          const historyStats = lastFiveDates
            .map((dateKey, index) => {
              const todayItem = historyMap.get(dateKey);
              const prevDate = lastSixDates[index];
              const prevItem = historyMap.get(prevDate);
              const fromRating = prevItem ? prevItem.rating : todayItem?.rating ?? 1000;
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
          const metaLatest = await HandleMeta.findOne({ handle: entry.handle }).lean();
          return {
            id: entry._id,
            handle: entry.handle,
            name: entry.name || "",
            roll: entry.roll || "",
            batch: entry.batch || "",
            maxRating: metaLatest?.maxRating ?? 0,
            solvedCount: metaLatest?.totalSolved ?? 0,
            standingRating: metaLatest?.currentRating ?? 1000,
            recentStats: historyStats,
          };
        }
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
