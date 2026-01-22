import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Handle } from "../models/Handle.js";
import { DailySolved } from "../models/DailySolved.js";
import { HandleMeta } from "../models/HandleMeta.js";
import { PendingProblem } from "../models/PendingProblem.js";
import { RatingHistory } from "../models/RatingHistory.js";
import { getUserInfo } from "../services/codeforces.js";
import { Admin } from "../models/Admin.js";
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
  const handles = await Handle.find().sort({ createdAt: -1 });
  return res.json(handles);
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
  
  // Trigger immediate data refresh for new handle in background
  refreshHandleData(normalized).catch(err => 
    console.error(`Background refresh failed for ${normalized}:`, err)
  );
  
  return res.status(201).json(created);
});

router.put("/handles/:id", authRequired, async (req, res) => {
  const { name, roll, batch } = req.body;

  const updated = await Handle.findByIdAndUpdate(
    req.params.id,
    { 
      name: name?.trim() || "",
      roll: roll?.trim() || "",
      batch: batch?.trim() || ""
    },
    { new: true }
  );

  if (!updated) {
    return res.status(404).json({ message: "Handle not found" });
  }

  return res.json(updated);
});

router.delete("/handles/:id", authRequired, async (req, res) => {
  const deleted = await Handle.findByIdAndDelete(req.params.id);
  if (!deleted) {
    return res.status(404).json({ message: "Handle not found" });
  }
  await Promise.all([
    DailySolved.deleteMany({ handle: deleted.handle }),
    PendingProblem.deleteMany({ handle: deleted.handle }),
    RatingHistory.deleteMany({ handle: deleted.handle }),
    HandleMeta.deleteMany({ handle: deleted.handle }),
  ]);
  return res.status(204).send();
});

export default router;
