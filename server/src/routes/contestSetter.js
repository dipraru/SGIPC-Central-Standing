import express from "express";
import jwt from "jsonwebtoken";
import { GymContest } from "../models/GymContest.js";
import {
  fetchNewerGymContests,
  fetchContestProblemStats,
} from "../services/codeforcesGym.js";

const router = express.Router();

const authRequired = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "secret");
    req.admin = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// ─── PUBLIC ENDPOINTS ────────────────────────────────────────────────────────

/**
 * GET /api/contest-setter/contests
 * Paginated list of gym contests with search and filters
 */
router.get("/contests", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const search = (req.query.search || "").trim();
    const difficulty = req.query.difficulty;
    const category = (req.query.category || "").trim().toLowerCase();
    const status = (req.query.status || "all").trim().toLowerCase();
    const sort = req.query.sort || "date_desc";

    const filter = {};

    if (search) {
      if (/^\d+$/.test(search)) {
        filter.$or = [
          { id: parseInt(search, 10) },
          { name: { $regex: search, $options: "i" } },
        ];
      } else {
        filter.name = { $regex: search, $options: "i" };
      }
    }

    if (difficulty && !isNaN(parseInt(difficulty, 10)) && parseInt(difficulty, 10) > 0) {
      filter.difficulty = parseInt(difficulty, 10);
    }

    if (category && category !== "all") {
      filter.category = category;
    }

    if (status === "done") {
      filter.isDone = true;
    } else if (status === "pending") {
      filter.isDone = false;
    }

    let sortOption = { startTimeSeconds: -1, id: -1 };
    if (sort === "date_asc") {
      sortOption = { startTimeSeconds: 1, id: 1 };
    } else if (sort === "difficulty_desc") {
      sortOption = { difficulty: -1, startTimeSeconds: -1 };
    } else if (sort === "difficulty_asc") {
      sortOption = { difficulty: 1, startTimeSeconds: -1 };
    } else if (sort === "solves_desc") {
      sortOption = { totalAllTimeSolves: -1 };
    } else if (sort === "problems_desc") {
      sortOption = { problemsCount: -1 };
    }

    const [contests, total] = await Promise.all([
      GymContest.find(filter)
        .select("-rawJson")
        .sort(sortOption)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      GymContest.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.json({
      status: "OK",
      contests,
      page,
      limit,
      total,
      totalPages,
    });
  } catch (err) {
    console.error("Error in /api/contest-setter/contests:", err);
    return res.status(500).json({ status: "ERROR", message: err.message });
  }
});

/**
 * GET /api/contest-setter/stats
 * Aggregated statistics of Gym contests and classifications
 */
router.get("/stats", async (req, res) => {
  try {
    const [totalContests, cachedContests, doneContests, categoryAgg, solvesAgg] =
      await Promise.all([
        GymContest.countDocuments(),
        GymContest.countDocuments({ hasProblemData: true }),
        GymContest.countDocuments({ isDone: true }),
        GymContest.aggregate([
          { $group: { _id: "$category", count: { $sum: 1 } } },
        ]),
        GymContest.aggregate([
          {
            $group: {
              _id: null,
              totalProblems: { $sum: "$problemsCount" },
              totalContestSolves: { $sum: "$totalContestSolves" },
              totalAllTimeSolves: { $sum: "$totalAllTimeSolves" },
            },
          },
        ]),
      ]);

    const categoryCounts = {
      standard: 0,
      spike: 0,
      equilibrium: 0,
      unclassified: 0,
    };
    categoryAgg.forEach((item) => {
      if (item._id && categoryCounts[item._id] !== undefined) {
        categoryCounts[item._id] = item.count;
      }
    });

    const solvesData = solvesAgg[0] || {
      totalProblems: 0,
      totalContestSolves: 0,
      totalAllTimeSolves: 0,
    };

    return res.json({
      status: "OK",
      totalContests,
      cachedContests,
      uncachedContests: Math.max(0, totalContests - cachedContests),
      doneContests,
      pendingContests: Math.max(0, totalContests - doneContests),
      categoryCounts,
      totalProblems: solvesData.totalProblems,
      totalContestSolves: solvesData.totalContestSolves,
      totalAllTimeSolves: solvesData.totalAllTimeSolves,
    });
  } catch (err) {
    console.error("Error in /api/contest-setter/stats:", err);
    return res.status(500).json({ status: "ERROR", message: err.message });
  }
});

/**
 * GET /api/contest-setter/contest/:id
 * Retrieve a single contest with problems details
 */
router.get("/contest/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ status: "FAILED", message: "Invalid contest ID" });
    }

    const contest = await GymContest.findOne({ id }).select("-rawJson").lean();
    if (!contest) {
      return res.status(404).json({ status: "FAILED", message: "Contest not found" });
    }

    return res.json({
      status: "OK",
      contest,
    });
  } catch (err) {
    console.error("Error in /api/contest-setter/contest/:id:", err);
    return res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// ─── ADMIN ENDPOINTS ─────────────────────────────────────────────────────────

/**
 * POST /api/contest-setter/contest/:id/toggle-done
 * Toggle isDone status for a contest
 */
router.post("/contest/:id/toggle-done", authRequired, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ status: "FAILED", message: "Invalid contest ID" });
    }

    const contest = await GymContest.findOne({ id });
    if (!contest) {
      return res.status(404).json({ status: "FAILED", message: "Contest not found" });
    }

    contest.isDone = !contest.isDone;
    await contest.save();

    return res.json({
      status: "OK",
      id: contest.id,
      isDone: contest.isDone,
      message: `Contest ${id} marked as ${contest.isDone ? "Done" : "Pending"}`,
    });
  } catch (err) {
    console.error("Error toggling done:", err);
    return res.status(500).json({ status: "ERROR", message: err.message });
  }
});

/**
 * POST /api/contest-setter/contest/:id/fetch-problems
 * Fetch/re-fetch problem solves for a specific contest
 */
router.post("/contest/:id/fetch-problems", authRequired, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ status: "FAILED", message: "Invalid contest ID" });
    }

    const result = await fetchContestProblemStats(id);
    return res.json(result);
  } catch (err) {
    console.error("Error fetching problem stats:", err);
    return res.status(500).json({ status: "ERROR", message: err.message });
  }
});

/**
 * POST /api/contest-setter/fetch-newer
 * Trigger ingestion of newer gym contests from Codeforces
 */
router.post("/fetch-newer", authRequired, async (req, res) => {
  try {
    const result = await fetchNewerGymContests();
    return res.json(result);
  } catch (err) {
    console.error("Error fetching newer contests:", err);
    return res.status(500).json({ status: "ERROR", message: err.message });
  }
});

export default router;
