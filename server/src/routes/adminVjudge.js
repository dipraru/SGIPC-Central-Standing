import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { VjudgeContest } from "../models/VjudgeContest.js";
import { VjudgeTeam } from "../models/VjudgeTeam.js";
import { VjudgeConfig } from "../models/VjudgeConfig.js";
import { fetchContestRank, syncContestRank } from "../services/vjudge.js";

const router = express.Router();

const authRequired = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    jwt.verify(token, process.env.JWT_SECRET || "secret");
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

router.get("/vjudge/teams", authRequired, async (req, res) => {
  const teams = await VjudgeTeam.find().sort({ createdAt: -1 });
  return res.json(teams);
});

router.post("/vjudge/teams", authRequired, async (req, res) => {
  const { name, aliases, members } = req.body;
  if (!name) {
    return res.status(400).json({ message: "Team name is required" });
  }
  const normalized = name.trim();
  const aliasList = Array.isArray(aliases)
    ? aliases
    : String(aliases || "").split(",").map((item) => item.trim()).filter(Boolean);
  const created = await VjudgeTeam.create({
    name: normalized,
    aliases: aliasList,
    members: Array.isArray(members) ? members : [],
  });
  return res.status(201).json(created);
});

router.patch("/vjudge/teams/:id", authRequired, async (req, res) => {
  const { name, aliases, members } = req.body;
  if (!name) {
    return res.status(400).json({ message: "Team name is required" });
  }
  const normalized = name.trim();
  const aliasList = Array.isArray(aliases)
    ? aliases
    : String(aliases || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  const updateFields = { name: normalized, aliases: aliasList };
  if (Array.isArray(members)) {
    updateFields.members = members;
  }
  const updated = await VjudgeTeam.findByIdAndUpdate(
    req.params.id,
    updateFields,
    { new: true }
  );
  if (!updated) {
    return res.status(404).json({ message: "Team not found" });
  }
  return res.json(updated);
});

router.delete("/vjudge/teams/:id", authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    let deleted = null;
    if (mongoose.isValidObjectId(id)) {
      deleted = await VjudgeTeam.findByIdAndDelete(id);
    }
    if (!deleted) {
      deleted = await VjudgeTeam.findOneAndDelete({
        name: { $regex: `^${id}$`, $options: "i" },
      });
    }
    if (!deleted) {
      return res.status(404).json({ message: "Team not found" });
    }
    return res.status(200).json({ message: "Team deleted successfully" });
  } catch (err) {
    console.error("Delete team error:", err);
    return res.status(500).json({ message: "Failed to delete team", error: err.message });
  }
});

router.get("/vjudge/contests", authRequired, async (req, res) => {
  const contests = await VjudgeContest.find().sort({ createdAt: -1 });
  return res.json(contests);
});

router.post("/vjudge/contests", authRequired, async (req, res) => {
  const { contestId, title, enabled } = req.body;
  if (!contestId) {
    return res.status(400).json({ message: "Contest ID is required" });
  }
  const numericId = Number(contestId);
  if (!Number.isFinite(numericId)) {
    return res.status(400).json({ message: "Contest ID must be a number" });
  }
  let resolvedTitle = String(title || "").trim();
  let ranklist = null;
  let participants = null;
  let fetchStatus = "idle";
  let fetchError = null;

  try {
    const data = await fetchContestRank(numericId);
    if (data && !data.error) {
      resolvedTitle = resolvedTitle || String(data.title || "").trim();
      ranklist = data.ranklist || null;
      participants = data.participants || null;
      fetchStatus = "success";
    } else if (data?.error) {
      fetchStatus = "error";
      fetchError = data.error;
    }
  } catch (e) {
    fetchStatus = "error";
    fetchError = e.message;
  }

  const created = await VjudgeContest.create({
    contestId: numericId,
    title: resolvedTitle || `Contest #${numericId}`,
    enabled: enabled !== false,
    ranklist,
    participants,
    lastFetchedAt: ranklist ? new Date() : null,
    fetchStatus,
    fetchError,
  });
  return res.status(201).json(created);
});

router.post("/vjudge/contests/sync", authRequired, async (req, res) => {
  try {
    const contests = await VjudgeContest.find({ enabled: true });
    if (!contests.length) {
      return res.json({ message: "No enabled contests to sync.", count: 0, results: [] });
    }

    const results = await Promise.all(
      contests.map(async (c) => {
        const res = await syncContestRank(VjudgeContest, c);
        return {
          contestId: c.contestId,
          success: !res.error,
          error: res.error || null,
          title: res.title || c.title,
          participantsCount: res.ranklist ? res.ranklist.length : 0,
        };
      })
    );

    const successCount = results.filter((r) => r.success).length;
    return res.json({
      message: `Synced ${successCount}/${contests.length} Vjudge contests successfully.`,
      count: successCount,
      results,
    });
  } catch (err) {
    console.error("Vjudge contests sync error:", err);
    return res.status(500).json({ message: "Failed to sync Vjudge contests", error: err.message });
  }
});

router.post("/vjudge/contests/:id/sync", authRequired, async (req, res) => {
  try {
    const contest = await VjudgeContest.findById(req.params.id);
    if (!contest) {
      return res.status(404).json({ message: "Contest not found" });
    }

    const result = await syncContestRank(VjudgeContest, contest);
    if (result.error) {
      return res.status(400).json({ message: result.error, contest });
    }

    const updated = await VjudgeContest.findById(req.params.id);
    return res.json({ message: "Contest synced successfully", contest: updated });
  } catch (err) {
    return res.status(500).json({ message: "Failed to sync contest", error: err.message });
  }
});

router.patch("/vjudge/contests/:id", authRequired, async (req, res) => {
  const { enabled, contestId, title } = req.body;
  const contest = await VjudgeContest.findById(req.params.id);
  if (!contest) {
    return res.status(404).json({ message: "Contest not found" });
  }

  const updateData = {};
  let contestIdChanged = false;
  if (enabled !== undefined) {
    updateData.enabled = Boolean(enabled);
  }
  if (contestId !== undefined) {
    const numericId = Number(contestId);
    if (!Number.isFinite(numericId)) {
      return res.status(400).json({ message: "Contest ID must be a number" });
    }
    updateData.contestId = numericId;
    contestIdChanged = true;
  }
  if (title !== undefined) {
    updateData.title = String(title || "").trim();
  }

  let updated = await VjudgeContest.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true }
  );

  if (contestIdChanged) {
    await syncContestRank(VjudgeContest, updated);
    updated = await VjudgeContest.findById(req.params.id);
  }

  return res.json(updated);
});

router.delete("/vjudge/contests/:id", authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    let deleted = null;
    if (mongoose.isValidObjectId(id)) {
      deleted = await VjudgeContest.findByIdAndDelete(id);
    }
    if (!deleted) {
      const numId = Number(id);
      if (!isNaN(numId)) {
        deleted = await VjudgeContest.findOneAndDelete({ contestId: numId });
      }
    }
    if (!deleted) {
      return res.status(404).json({ message: "Contest not found" });
    }
    return res.status(200).json({ message: "Contest deleted successfully" });
  } catch (err) {
    console.error("Delete contest error:", err);
    return res.status(500).json({ message: "Failed to delete contest", error: err.message });
  }
});

router.get("/vjudge/config", authRequired, async (req, res) => {
  const config = await VjudgeConfig.findOne().lean();
  return res.json(config || { eloMode: "normal" });
});

router.put("/vjudge/config", authRequired, async (req, res) => {
  const { eloMode } = req.body;
  const updated = await VjudgeConfig.findOneAndUpdate(
    {},
    { eloMode: eloMode || "normal" },
    { upsert: true, new: true }
  );
  return res.json(updated);
});

router.post("/vjudge/teams/:id/refresh", authRequired, async (req, res) => {
  try {
    const team = await VjudgeTeam.findById(req.params.id);
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }
    const contests = await VjudgeContest.find({ enabled: true });
    for (const contest of contests) {
      try {
        const data = await fetchContestRank(contest.contestId);
        if (data?.title && data.title !== contest.title) {
          await VjudgeContest.findByIdAndUpdate(contest._id, { title: data.title });
        }
      } catch (e) {
        // continue
      }
    }
    return res.json({ message: `Team "${team.name}" and contest rankings refreshed.` });
  } catch (err) {
    return res.status(500).json({ message: "Failed to refresh team data", error: err.message });
  }
});

router.post("/vjudge/refresh-all", authRequired, async (req, res) => {
  try {
    const contests = await VjudgeContest.find({ enabled: true });
    for (const contest of contests) {
      try {
        const data = await fetchContestRank(contest.contestId);
        if (data?.title && data.title !== contest.title) {
          await VjudgeContest.findByIdAndUpdate(contest._id, { title: data.title });
        }
      } catch (e) {
        // continue
      }
    }
    return res.json({ message: "All enabled VJudge contests and team standings refreshed." });
  } catch (err) {
    return res.status(500).json({ message: "Failed to refresh VJudge standings", error: err.message });
  }
});

export default router;
