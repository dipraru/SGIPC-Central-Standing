import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { TfcParticipant } from "../models/TfcParticipant.js";
import { TfcContest } from "../models/TfcContest.js";
import { TfcRequest } from "../models/TfcRequest.js";
import { TfcReport } from "../models/TfcReport.js";
import { TfcConfig } from "../models/TfcConfig.js";
import { fetchContestRank, findBestGroupMatch, syncContestRank } from "../services/vjudge.js";

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

router.post("/tfc/requests/approve-all", authRequired, async (req, res) => {
  try {
    const pendingRequests = await TfcRequest.find({ status: "pending" });
    if (!pendingRequests.length) {
      return res.json({ message: "No pending requests to approve.", count: 0 });
    }

    let count = 0;
    for (const request of pendingRequests) {
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
        await TfcParticipant.create({
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
      count++;
    }

    return res.json({ message: `Successfully approved all ${count} requests.`, count });
  } catch (err) {
    console.error("Approve all TFC requests error:", err);
    return res.status(500).json({ message: "Failed to approve all requests" });
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

// ── TFC Participation Matrix ────────────────────────────────────────────────
router.get("/tfc/participation-matrix", authRequired, async (req, res) => {
  try {
    const contests = await TfcContest.find().sort({ contestId: 1 }).lean();
    const participants = await TfcParticipant.find().sort({ batch: -1, roll: 1 }).lean();

    // Fetch ranks for all contests (using cached data from MongoDB if available)
    const contestRankData = await Promise.all(
      contests.map(async (contest) => {
        try {
          if (contest.ranklist && Array.isArray(contest.ranklist) && contest.ranklist.length > 0) {
            return {
              contestId: contest.contestId,
              ranklist: contest.ranklist,
              participants: contest.participants || {},
            };
          }
          const data = await syncContestRank(TfcContest, contest);
          if (data.error) return { contestId: contest.contestId, ranklist: contest.ranklist || null, error: data.error };
          return {
            contestId: contest.contestId,
            ranklist: data.ranklist,
            participants: data.participants,
          };
        } catch (e) {
          return { contestId: contest.contestId, ranklist: contest.ranklist || null, error: e.message };
        }
      })
    );

    const rankDataMap = new Map(contestRankData.map((c) => [c.contestId, c]));

    const matrix = participants.map((p) => {
      const group = {
        id: p._id.toString(),
        displayName: p.name,
        aliases: (p.vjudgeHandles || []).filter(Boolean),
      };

      const participationMap = {};
      for (const contest of contests) {
        const cRank = rankDataMap.get(contest.contestId);
        if (!cRank || !cRank.ranklist) {
          participationMap[contest.contestId] = {
            participated: false,
            rank: null,
            solved: null,
            penalty: null,
          };
          continue;
        }

        const match = findBestGroupMatch(group, cRank.ranklist, cRank.participants);
        if (match?.entry) {
          participationMap[contest.contestId] = {
            participated: true,
            rank: match.entry.rank,
            solved: match.entry.solved,
            penalty: match.entry.penalty,
            handle: match.alias || match.entry.team_name,
          };
        } else {
          participationMap[contest.contestId] = {
            participated: false,
            rank: null,
            solved: null,
            penalty: null,
          };
        }
      }

      return {
        id: p._id,
        name: p.name,
        roll: p.roll,
        batch: p.batch,
        vjudgeHandles: p.vjudgeHandles || [],
        playlistUrl: p.playlistUrl || "",
        excludedContests: p.excludedContests || [],
        participation: participationMap,
      };
    });

    return res.json({ contests, matrix });
  } catch (err) {
    console.error("Participation matrix error:", err);
    return res.status(500).json({ message: "Failed to load participation matrix" });
  }
});

router.post("/tfc/participation-matrix/toggle", authRequired, async (req, res) => {
  try {
    const { participantId, contestId, excluded } = req.body;
    if (!participantId || contestId === undefined) {
      return res.status(400).json({ message: "participantId and contestId are required." });
    }

    const numContestId = Number(contestId);
    let updateQuery;
    if (excluded) {
      updateQuery = { $addToSet: { excludedContests: numContestId } };
    } else {
      updateQuery = { $pull: { excludedContests: numContestId } };
    }

    const participant = await TfcParticipant.findByIdAndUpdate(participantId, updateQuery, { new: true });
    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    return res.json({
      message: `Contest ${numContestId} ${excluded ? "excluded" : "included"} for ${participant.name}`,
      participant,
    });
  } catch (err) {
    console.error("Toggle participation error:", err);
    return res.status(500).json({ message: "Failed to update participation setting" });
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
    let ranklist = null;
    let participants = null;
    let fetchStatus = "idle";
    let fetchError = null;

    try {
      const data = await fetchContestRank(numericId);
      if (data && !data.error) {
        if (data.title) finalTitle = finalTitle || data.title;
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

    const contest = await TfcContest.create({
      contestId: numericId,
      title: finalTitle || `TFC Contest #${numericId}`,
      enabled: true,
      ranklist,
      participants,
      lastFetchedAt: ranklist ? new Date() : null,
      fetchStatus,
      fetchError,
    });
    return res.status(201).json(contest);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Contest ID already exists." });
    }
    return res.status(500).json({ message: "Failed to add TFC contest" });
  }
});

router.post("/tfc/contests/sync", authRequired, async (req, res) => {
  try {
    const contests = await TfcContest.find({ enabled: true });
    if (!contests.length) {
      return res.json({ message: "No enabled contests to sync.", count: 0, results: [] });
    }

    const results = await Promise.all(
      contests.map(async (c) => {
        const res = await syncContestRank(TfcContest, c);
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
      message: `Synced ${successCount}/${contests.length} TFC contests successfully.`,
      count: successCount,
      results,
    });
  } catch (err) {
    console.error("TFC contests sync error:", err);
    return res.status(500).json({ message: "Failed to sync TFC contests", error: err.message });
  }
});

router.post("/tfc/contests/:id/sync", authRequired, async (req, res) => {
  try {
    const contest = await TfcContest.findById(req.params.id);
    if (!contest) {
      return res.status(404).json({ message: "Contest not found" });
    }

    const result = await syncContestRank(TfcContest, contest);
    if (result.error) {
      return res.status(400).json({ message: result.error, contest });
    }

    const updated = await TfcContest.findById(req.params.id);
    return res.json({ message: "Contest synced successfully", contest: updated });
  } catch (err) {
    return res.status(500).json({ message: "Failed to sync contest", error: err.message });
  }
});

router.patch("/tfc/contests/:id", authRequired, async (req, res) => {
  try {
    const { contestId, title, enabled } = req.body;
    const updateData = {};
    let contestIdChanged = false;
    if (contestId !== undefined) {
      updateData.contestId = Number(contestId);
      contestIdChanged = true;
    }
    if (title !== undefined) updateData.title = title.trim();
    if (enabled !== undefined) updateData.enabled = Boolean(enabled);

    let updated = await TfcContest.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updated) {
      return res.status(404).json({ message: "Contest not found" });
    }

    if (contestIdChanged) {
      await syncContestRank(TfcContest, updated);
      updated = await TfcContest.findById(req.params.id);
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

// ── TFC Config ───────────────────────────────────────────────────────────────
router.get("/tfc/config", authRequired, async (req, res) => {
  try {
    let config = await TfcConfig.findOne().lean();
    if (!config) {
      config = await TfcConfig.create({ topNLimit: 10 });
    }
    return res.json({ topNLimit: config.topNLimit || 10 });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch TFC config" });
  }
});

router.patch("/tfc/config", authRequired, async (req, res) => {
  try {
    const { topNLimit } = req.body;
    const limit = Math.max(0, parseInt(topNLimit, 10) || 10);
    let config = await TfcConfig.findOne();
    if (!config) {
      config = await TfcConfig.create({ topNLimit: limit });
    } else {
      config.topNLimit = limit;
      await config.save();
    }
    return res.json({ message: "TFC configuration updated successfully", topNLimit: config.topNLimit });
  } catch (err) {
    return res.status(500).json({ message: "Failed to update TFC config" });
  }
});

export default router;
