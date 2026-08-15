import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { TfcParticipant } from "../models/TfcParticipant.js";
import { TfcContest } from "../models/TfcContest.js";
import { TfcRequest } from "../models/TfcRequest.js";
import { TfcReport } from "../models/TfcReport.js";
import { fetchContestRank } from "../services/vjudge.js";

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

// ── TFC Requests ─────────────────────────────────────────────────────────────
router.get("/tfc/requests", authRequired, async (req, res) => {
  try {
    const requests = await TfcRequest.find().sort({ createdAt: -1 }).lean();
    return res.json(requests);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch TFC requests" });
  }
});

router.post("/tfc/requests/:id/approve", authRequired, async (req, res) => {
  try {
    const request = await TfcRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    // Check if participant with roll already exists, update or create
    let participant = await TfcParticipant.findOne({ roll: request.roll });
    if (participant) {
      participant.name = request.name;
      participant.batch = request.batch;
      participant.vjudgeHandles = request.vjudgeHandles;
      participant.codeforcesHandle = request.codeforcesHandle;
      participant.otherOjs = request.otherOjs;
      participant.playlistUrl = request.playlistUrl;
      await participant.save();
    } else {
      participant = await TfcParticipant.create({
        name: request.name,
        roll: request.roll,
        batch: request.batch,
        vjudgeHandles: request.vjudgeHandles,
        codeforcesHandle: request.codeforcesHandle,
        otherOjs: request.otherOjs,
        playlistUrl: request.playlistUrl,
      });
    }

    request.status = "approved";
    request.approvedAt = new Date();
    await request.save();

    return res.json({ message: `Contestant ${request.name} approved successfully.`, participant });
  } catch (err) {
    console.error("Approve TFC request error:", err);
    return res.status(500).json({ message: "Failed to approve request" });
  }
});

router.post("/tfc/requests/:id/reject", authRequired, async (req, res) => {
  try {
    const request = await TfcRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }
    request.status = "rejected";
    request.rejectedAt = new Date();
    await request.save();
    return res.json({ message: "TFC request rejected" });
  } catch (err) {
    return res.status(500).json({ message: "Failed to reject request" });
  }
});

// ── TFC Participants ─────────────────────────────────────────────────────────
router.get("/tfc/participants", authRequired, async (req, res) => {
  try {
    const participants = await TfcParticipant.find().sort({ batch: -1, roll: 1 }).lean();
    return res.json(participants);
  } catch (err) {
    return res.status(500).json({ message: "Failed to load participants" });
  }
});

router.post("/tfc/participants", authRequired, async (req, res) => {
  try {
    const { name, roll, batch, vjudgeHandles, codeforcesHandle, otherOjs, playlistUrl } = req.body;
    if (!name || !roll || !batch) {
      return res.status(400).json({ message: "Name, roll, and batch are required." });
    }
    const cleanHandles = Array.isArray(vjudgeHandles)
      ? vjudgeHandles.map((h) => h.trim()).filter(Boolean)
      : typeof vjudgeHandles === "string"
      ? vjudgeHandles.split(",").map((h) => h.trim()).filter(Boolean)
      : [];

    const participant = await TfcParticipant.create({
      name: name.trim(),
      roll: roll.trim(),
      batch: batch.trim().toUpperCase(),
      vjudgeHandles: cleanHandles,
      codeforcesHandle: (codeforcesHandle || "").trim(),
      otherOjs: Array.isArray(otherOjs) ? otherOjs : [],
      playlistUrl: (playlistUrl || "").trim(),
    });
    return res.status(201).json(participant);
  } catch (err) {
    return res.status(500).json({ message: "Failed to create participant", error: err.message });
  }
});

router.patch("/tfc/participants/:id", authRequired, async (req, res) => {
  try {
    const { name, roll, batch, vjudgeHandles, codeforcesHandle, otherOjs, playlistUrl } = req.body;
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (roll !== undefined) updateData.roll = roll.trim();
    if (batch !== undefined) updateData.batch = batch.trim().toUpperCase();
    if (vjudgeHandles !== undefined) {
      updateData.vjudgeHandles = Array.isArray(vjudgeHandles)
        ? vjudgeHandles.map((h) => h.trim()).filter(Boolean)
        : String(vjudgeHandles).split(",").map((h) => h.trim()).filter(Boolean);
    }
    if (codeforcesHandle !== undefined) updateData.codeforcesHandle = codeforcesHandle.trim();
    if (otherOjs !== undefined) updateData.otherOjs = Array.isArray(otherOjs) ? otherOjs : [];
    if (playlistUrl !== undefined) updateData.playlistUrl = playlistUrl.trim();

    const updated = await TfcParticipant.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updated) {
      return res.status(404).json({ message: "Participant not found" });
    }
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: "Failed to update participant" });
  }
});

router.delete("/tfc/participants/:id", authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    let deleted = null;
    if (mongoose.isValidObjectId(id)) {
      deleted = await TfcParticipant.findByIdAndDelete(id);
    }
    if (!deleted) {
      deleted = await TfcParticipant.findOneAndDelete({ roll: id });
    }
    if (!deleted) {
      return res.status(404).json({ message: "Participant not found" });
    }
    return res.json({ message: "Participant deleted successfully" });
  } catch (err) {
    return res.status(500).json({ message: "Failed to delete participant" });
  }
});

// ── TFC Contests ─────────────────────────────────────────────────────────────
router.get("/tfc/contests", authRequired, async (req, res) => {
  try {
    const contests = await TfcContest.find().sort({ contestId: 1 }).lean();
    return res.json(contests);
  } catch (err) {
    return res.status(500).json({ message: "Failed to load TFC contests" });
  }
});

router.post("/tfc/contests", authRequired, async (req, res) => {
  try {
    const { contestId, title } = req.body;
    const numericId = Number(contestId);
    if (!numericId) {
      return res.status(400).json({ message: "Valid numeric Contest ID is required." });
    }

    let finalTitle = title ? title.trim() : "";
    try {
      const data = await fetchContestRank(numericId);
      if (data?.title) finalTitle = finalTitle || data.title;
    } catch (e) {}

    const contest = await TfcContest.create({
      contestId: numericId,
      title: finalTitle || `TFC Contest #${numericId}`,
      enabled: true,
    });
    return res.status(201).json(contest);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Contest ID already exists." });
    }
    return res.status(500).json({ message: "Failed to add TFC contest" });
  }
});

router.patch("/tfc/contests/:id", authRequired, async (req, res) => {
  try {
    const { contestId, title, enabled } = req.body;
    const updateData = {};
    if (contestId !== undefined) updateData.contestId = Number(contestId);
    if (title !== undefined) updateData.title = title.trim();
    if (enabled !== undefined) updateData.enabled = Boolean(enabled);

    const updated = await TfcContest.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updated) {
      return res.status(404).json({ message: "Contest not found" });
    }
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: "Failed to update contest" });
  }
});

router.delete("/tfc/contests/:id", authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    let deleted = null;
    if (mongoose.isValidObjectId(id)) {
      deleted = await TfcContest.findByIdAndDelete(id);
    }
    if (!deleted) {
      const num = Number(id);
      if (!isNaN(num)) {
        deleted = await TfcContest.findOneAndDelete({ contestId: num });
      }
    }
    if (!deleted) {
      return res.status(404).json({ message: "Contest not found" });
    }
    return res.json({ message: "Contest deleted successfully" });
  } catch (err) {
    return res.status(500).json({ message: "Failed to delete contest" });
  }
});

// ── TFC Reports ──────────────────────────────────────────────────────────────
router.get("/tfc/reports", authRequired, async (req, res) => {
  try {
    const reports = await TfcReport.find().sort({ createdAt: -1 }).lean();
    return res.json(reports);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch reports" });
  }
});

router.patch("/tfc/reports/:id", authRequired, async (req, res) => {
  try {
    const { status } = req.body;
    const updated = await TfcReport.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!updated) {
      return res.status(404).json({ message: "Report not found" });
    }
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: "Failed to update report status" });
  }
});

router.delete("/tfc/reports/:id", authRequired, async (req, res) => {
  try {
    const deleted = await TfcReport.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Report not found" });
    }
    return res.json({ message: "Report deleted successfully" });
  } catch (err) {
    return res.status(500).json({ message: "Failed to delete report" });
  }
});

export default router;
