import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { Handle } from "../models/Handle.js";
import { DailySolved } from "../models/DailySolved.js";
import { HandleMeta } from "../models/HandleMeta.js";
import { PendingProblem } from "../models/PendingProblem.js";
import { RatingHistory } from "../models/RatingHistory.js";
import { getUserInfo } from "../services/codeforces.js";
import { Admin } from "../models/Admin.js";
import { Passkey } from "../models/Passkey.js";
import { Request } from "../models/Request.js";
import { VjudgeTeam } from "../models/VjudgeTeam.js";
import { refreshHandleData } from "../services/scheduler.js";

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

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: "Missing credentials" });
  }

  const admin = await Admin.findOne({ username });
  if (!admin) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const match = await bcrypt.compare(password, admin.passwordHash);
  if (!match) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign({ username }, process.env.JWT_SECRET || "secret", {
    expiresIn: "12h",
  });

  return res.json({ token });
});

router.put("/profile", authRequired, async (req, res) => {
  const { currentPassword, newUsername, newPassword } = req.body;

  if (!currentPassword) {
    return res.status(400).json({ message: "Current password is required" });
  }

  const admin = await Admin.findOne({ username: req.admin.username });
  if (!admin) {
    return res.status(404).json({ message: "Admin not found" });
  }

  const match = await bcrypt.compare(currentPassword, admin.passwordHash);
  if (!match) {
    return res.status(401).json({ message: "Current password is incorrect" });
  }

  // Update username if provided and different
  if (newUsername && newUsername.trim() && newUsername.trim() !== admin.username) {
    const existing = await Admin.findOne({ username: newUsername.trim() });
    if (existing && existing._id.toString() !== admin._id.toString()) {
      return res.status(400).json({ message: "Username already taken" });
    }
    admin.username = newUsername.trim();
  }

  // Update password if provided
  if (newPassword && newPassword.trim()) {
    admin.passwordHash = await bcrypt.hash(newPassword.trim(), 10);
  }

  await admin.save();

  const token = jwt.sign({ username: admin.username }, process.env.JWT_SECRET || "secret", {
    expiresIn: "12h",
  });

  return res.json({
    message: "Credentials updated",
    token,
    username: admin.username,
  });
});

router.get("/handles", authRequired, async (req, res) => {
  const handles = await Handle.find().lean();
  const metas = await HandleMeta.find().lean();
  const metaMap = new Map(metas.map((m) => [m.handle, m]));

  const results = handles.map((h) => {
    const meta = metaMap.get(h.handle);
    return {
      _id: h._id,
      handle: h.handle,
      name: h.name || "",
      roll: h.roll || "",
      batch: h.batch || "",
      isInactive: h.isInactive || false,
      inactiveSince: h.inactiveSince || null,
      maxRating: meta?.maxRating ?? 0,
      solvedCount: meta?.totalSolved ?? 0,
      standingRating: meta?.currentRating ?? 1000,
    };
  });

  return res.json(results);
});

router.post("/handles", authRequired, async (req, res) => {
  const { handle, name, roll, batch } = req.body;
  if (!handle) {
    return res.status(400).json({ message: "Handle is required" });
  }
  const normalized = handle.trim();
  try {
    await getUserInfo(normalized);
  } catch (error) {
    return res.status(400).json({ message: "Handle does not exist" });
  }

  const created = await Handle.create({ 
    handle: normalized,
    name: name?.trim() || "",
    roll: roll?.trim() || "",
    batch: batch?.trim() || ""
  });
  
  try {
    // Ensure backfill completes in serverless (no fire-and-forget)
    await refreshHandleData(normalized, { fullHistory: true });
  } catch (error) {
    console.error(`Backfill failed for ${normalized}:`, error);
    await Promise.all([
      Handle.deleteOne({ handle: normalized }),
      DailySolved.deleteMany({ handle: normalized }),
      PendingProblem.deleteMany({ handle: normalized }),
      RatingHistory.deleteMany({ handle: normalized }),
      HandleMeta.deleteMany({ handle: normalized }),
    ]);
    return res.status(502).json({
      message: "Handle add failed due to refresh error. Nothing was saved.",
    });
  }

  return res.status(201).json(created);
});

router.put("/handles/:id", authRequired, async (req, res) => {
  const { name, roll, batch, customTotalSolved } = req.body;

  const updateData = {};
  if (name !== undefined) updateData.name = name?.trim() || "";
  if (roll !== undefined) updateData.roll = roll?.trim() || "";
  if (batch !== undefined) updateData.batch = batch?.trim() || "";
  if (customTotalSolved !== undefined) {
    updateData.customTotalSolved =
      customTotalSolved === "" || customTotalSolved === null
        ? null
        : Number(customTotalSolved);
  }

  const updated = await Handle.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
  });

  if (!updated) {
    return res.status(404).json({ message: "Handle not found" });
  }

  if (updateData.customTotalSolved !== undefined && updateData.customTotalSolved !== null) {
    await HandleMeta.updateOne(
      { handle: updated.handle },
      { totalSolved: updateData.customTotalSolved }
    );
  }

  return res.json(updated);
});

router.delete("/handles/:id", authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    let deleted = null;
    if (mongoose.isValidObjectId(id)) {
      deleted = await Handle.findByIdAndDelete(id);
    }
    if (!deleted) {
      deleted = await Handle.findOneAndDelete({
        handle: { $regex: `^${id}$`, $options: "i" },
      });
    }
    if (!deleted) {
      return res.status(404).json({ message: "Handle not found" });
    }
    await Promise.allSettled([
      DailySolved.deleteMany({ handle: deleted.handle }),
      PendingProblem.deleteMany({ handle: deleted.handle }),
      RatingHistory.deleteMany({ handle: deleted.handle }),
      HandleMeta.deleteMany({ handle: deleted.handle }),
    ]);
    return res.status(200).json({ message: "Handle deleted successfully" });
  } catch (err) {
    console.error("Delete handle error:", err);
    return res.status(500).json({ message: "Failed to delete handle", error: err.message });
  }
});

// Force-refresh a specific handle (re-activates it if it was incorrectly marked inactive)
router.post("/handles/:id/refresh", authRequired, async (req, res) => {
  const handleDoc = await Handle.findById(req.params.id).lean();
  if (!handleDoc) {
    return res.status(404).json({ message: "Handle not found" });
  }
  try {
    // forceActive:true ensures the handle is re-activated even if previously inactive
    await refreshHandleData(handleDoc.handle, { fullHistory: true, forceActive: true });
    // Clear the inactive flag so it shows up in standings immediately
    await Handle.updateOne(
      { _id: req.params.id },
      { isInactive: false, inactiveSince: null }
    );
    return res.json({ message: `Handle ${handleDoc.handle} refreshed and re-activated.` });
  } catch (error) {
    console.error(`Force-refresh failed for ${handleDoc.handle}:`, error.message);
    return res.status(502).json({ message: "Refresh failed", error: error.message });
  }
});

router.get("/requests", authRequired, async (req, res) => {
  const status = req.query.status;
  const filter = status ? { status } : {};
  const requests = await Request.find(filter).sort({ createdAt: -1 }).lean();
  return res.json(requests);
});

router.post("/requests/:id/approve", authRequired, async (req, res) => {
  const request = await Request.findById(req.params.id);
  if (!request) {
    return res.status(404).json({ message: "Request not found" });
  }
  if (request.status !== "pending") {
    return res.status(400).json({ message: "Request already processed" });
  }

  if (request.type === "handle") {
    const existingHandle = await Handle.findOne({ handle: request.handle });
    if (existingHandle) {
      return res.status(400).json({ message: "Handle already exists" });
    }
    const created = await Handle.create({
      handle: request.handle,
      name: request.name || "",
      roll: request.roll || "",
      batch: request.batch || "",
    });
    try {
      await refreshHandleData(request.handle, { fullHistory: true, forceActive: true });
    } catch (error) {
      await Promise.all([
        Handle.deleteOne({ handle: request.handle }),
        DailySolved.deleteMany({ handle: request.handle }),
        PendingProblem.deleteMany({ handle: request.handle }),
        RatingHistory.deleteMany({ handle: request.handle }),
        HandleMeta.deleteMany({ handle: request.handle }),
      ]);
      return res.status(502).json({ message: "Backfill failed. Nothing was saved." });
    }
    request.status = "approved";
    request.approvedAt = new Date();
    await request.save();
    return res.json({ message: "Request approved", handle: created });
  }

  if (request.type === "team") {
    const aliases = (request.teamHandles || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const createdTeam = await VjudgeTeam.create({
      name: request.teamName,
      aliases,
      members: request.teamMembers || [],
    });
    request.status = "approved";
    request.approvedAt = new Date();
    await request.save();
    return res.json({ message: "Request approved", team: createdTeam });
  }

  if (request.type === "reactivation") {
    const handleDoc = await Handle.findOne({ handle: request.handle });
    if (!handleDoc) {
      return res.status(404).json({ message: "Handle not found" });
    }
    // Re-activate the handle so it gets included in standings
    await Handle.updateOne(
      { handle: request.handle },
      { isInactive: false, inactiveSince: null }
    );
    // Immediately backfill data so the handle shows up in standings right away
    try {
      await refreshHandleData(request.handle, { fullHistory: true, forceActive: true });
    } catch (error) {
      console.error(`Reactivation backfill failed for ${request.handle}:`, error.message);
    }
    request.status = "approved";
    request.approvedAt = new Date();
    await request.save();
    return res.json({ message: "Reactivation approved", handle: request.handle });
  }

  return res.status(400).json({ message: "Unsupported request type" });
});

router.post("/requests/:id/reject", authRequired, async (req, res) => {
  const request = await Request.findById(req.params.id);
  if (!request) {
    return res.status(404).json({ message: "Request not found" });
  }
  if (request.status !== "pending") {
    return res.status(400).json({ message: "Request already processed" });
  }
  request.status = "rejected";
  request.rejectedAt = new Date();
  await request.save();
  return res.json({ message: "Request rejected" });
});

router.put("/passkey", authRequired, async (req, res) => {
  const { newPasskey } = req.body;
  if (!newPasskey || !newPasskey.trim()) {
    return res.status(400).json({ message: "New passkey is required" });
  }
  const keyHash = await bcrypt.hash(newPasskey.trim(), 10);
  await Passkey.findOneAndUpdate({}, { keyHash }, { upsert: true, new: true });
  return res.json({ message: "Passkey updated" });
});

export default router;
