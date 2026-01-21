import express from "express";
import { Handle } from "../models/Handle.js";
import { getSolvedProblems, getUserInfo } from "../services/codeforces.js";
import { buildRecentStats, calculateEloScore } from "../services/elo.js";

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

        return {
          id: entry._id,
          handle: entry.handle,
          maxRating: userInfo.maxRating,
          solvedCount: solvedProblems.length,
          standingRating: rating,
          recentStats,
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
