import express from "express";
import jwt from "jsonwebtoken";
import { VjudgeContest } from "../models/VjudgeContest.js";
import { VjudgeTeam } from "../models/VjudgeTeam.js";
import { VjudgeConfig } from "../models/VjudgeConfig.js";

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
  const { name, aliases } = req.body;
  if (!name) {
    return res.status(400).json({ message: "Team name is required" });
  }
  const normalized = name.trim();
  const aliasList = Array.isArray(aliases)
    ? aliases
    : String(aliases || "").split(",").map((item) => item.trim()).filter(Boolean);
  const created = await VjudgeTeam.create({ name: normalized, aliases: aliasList });
  return res.status(201).json(created);
});

router.delete("/vjudge/teams/:id", authRequired, async (req, res) => {
  const deleted = await VjudgeTeam.findByIdAndDelete(req.params.id);
  if (!deleted) {
    return res.status(404).json({ message: "Team not found" });
  }
  return res.status(204).send();
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
  const created = await VjudgeContest.create({
    contestId: numericId,
    title: title || "",
    enabled: enabled !== false,
  });
  return res.status(201).json(created);
});

router.patch("/vjudge/contests/:id", authRequired, async (req, res) => {
  const { enabled } = req.body;
  const updated = await VjudgeContest.findByIdAndUpdate(
    req.params.id,
    { enabled: Boolean(enabled) },
    { new: true }
  );
  if (!updated) {
    return res.status(404).json({ message: "Contest not found" });
  }
  return res.json(updated);
});

router.delete("/vjudge/contests/:id", authRequired, async (req, res) => {
  const deleted = await VjudgeContest.findByIdAndDelete(req.params.id);
  if (!deleted) {
    return res.status(404).json({ message: "Contest not found" });
  }
  return res.status(204).send();
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

export default router;
