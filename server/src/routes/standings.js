import express from "express";
import { Handle } from "../models/Handle.js";
import { getSolvedProblems, getUserInfo } from "../services/codeforces.js";
import { calculateEloScore } from "../services/elo.js";

const router = express.Router();

router.get("/standings", async (req, res) => {
  const handles = await Handle.find().sort({ createdAt: -1 });

  const results = await Promise.all(
    handles.map(async (entry) => {
      try {
        const userInfo = await getUserInfo(entry.handle);
        const solvedProblems = await getSolvedProblems(entry.handle);
        const rating = calculateEloScore({
          maxRating: userInfo.maxRating,
          solvedProblems,
        });

        return {
          id: entry._id,
          handle: entry.handle,
          maxRating: userInfo.maxRating,
          solvedCount: solvedProblems.length,
          standingRating: rating,
        };
      } catch (error) {
        return {
          id: entry._id,
          handle: entry.handle,
          maxRating: 0,
          solvedCount: 0,
          standingRating: 0,
          error: error.message,
        };
      }
    })
  );

  const sorted = results.sort((a, b) => b.standingRating - a.standingRating);
  return res.json(sorted);
});

export default router;
