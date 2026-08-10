import express from "express";
import bcrypt from "bcryptjs";
import { Request } from "../models/Request.js";
import { Passkey } from "../models/Passkey.js";
import { Handle } from "../models/Handle.js";
import { VjudgeTeam } from "../models/VjudgeTeam.js";
import { getUserInfo } from "../services/codeforces.js";

const router = express.Router();

const ensurePasskey = async () => {
  let record = await Passkey.findOne().lean();
  if (!record) {
    const keyHash = await bcrypt.hash("sgipc", 10);
    record = await Passkey.create({ keyHash });
  }
  return record;
};

const verifyPasskey = async (input) => {
  if (!input) return false;
  const record = await ensurePasskey();
  return bcrypt.compare(input, record.keyHash);
};

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ─── Individual Handle Request ───────────────────────────────────────────────
router.post("/request/handle", async (req, res) => {
  const { handle, name, roll, batch, passkey } = req.body;
  if (!handle || !name || !roll || !batch || !passkey) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const normalizedHandle = handle.trim();
  const existingHandle = await Handle.findOne({
    handle: { $regex: `^${escapeRegex(normalizedHandle)}$`, $options: "i" },
  });
  if (existingHandle) {
    return res.status(400).json({ message: "Handle already exists in standings" });
  }

  const pendingHandle = await Request.findOne({
    type: "handle",
    status: "pending",
    handle: { $regex: `^${escapeRegex(normalizedHandle)}$`, $options: "i" },
  });
  if (pendingHandle) {
    return res.status(400).json({ message: "Handle is already pending approval" });
  }

  const isValid = await verifyPasskey(passkey);
  if (!isValid) {
    return res.status(401).json({ message: "Invalid passkey" });
  }

  try {
    await getUserInfo(normalizedHandle);
  } catch (error) {
    return res.status(400).json({ message: "Invalid Codeforces handle" });
  }

  const created = await Request.create({
    type: "handle",
    handle: normalizedHandle,
    name: name.trim(),
    roll: roll.trim(),
    batch: batch.trim(),
    status: "pending",
  });

  return res.status(201).json({ message: "Request submitted", id: created._id });
});

// ─── Team Request (3 members required) ──────────────────────────────────────
router.post("/request/team", async (req, res) => {
  const { teamName, teamVjudgeHandle, members, passkey } = req.body;

  const vjHandle = (teamVjudgeHandle || "").trim();
  if (!teamName || !vjHandle || !passkey) {
    return res.status(400).json({ message: "Team name, VJudge handle, and passkey are required" });
  }

  // Validate 3 members
  if (!Array.isArray(members) || members.length !== 3) {
    return res.status(400).json({ message: "Exactly 3 team members are required" });
  }
  for (let i = 0; i < 3; i++) {
    const m = members[i];
    if (!m?.name?.trim() || !m?.roll?.trim() || !m?.batch?.trim()) {
      return res.status(400).json({
        message: `All fields for member ${i + 1} are required (name, roll, batch)`,
      });
    }
  }

  const isValid = await verifyPasskey(passkey);
  if (!isValid) {
    return res.status(401).json({ message: "Invalid passkey" });
  }

  const created = await Request.create({
    type: "team",
    teamName: teamName.trim(),
    teamHandles: vjHandle,
    teamMembers: members.map((m) => ({
      handle: (m.handle || "").trim(),
      name:   m.name.trim(),
      roll:   m.roll.trim(),
      batch:  m.batch.trim(),
    })),
    status: "pending",
  });

  return res.status(201).json({ message: "Request submitted", id: created._id });
});

// ─── Reactivation Request ────────────────────────────────────────────────────
router.post("/request/reactivate", async (req, res) => {
  const { handle } = req.body;
  if (!handle) {
    return res.status(400).json({ message: "Handle is required" });
  }

  const normalizedHandle = handle.trim();

  const handleDoc = await Handle.findOne({
    handle: { $regex: `^${escapeRegex(normalizedHandle)}$`, $options: "i" },
  });

  if (!handleDoc) {
    return res.status(404).json({ message: "Handle not found" });
  }

  if (!handleDoc.isInactive) {
    return res.status(400).json({ message: "Handle is already active" });
  }

  const existing = await Request.findOne({
    type: "reactivation",
    status: "pending",
    handle: { $regex: `^${escapeRegex(normalizedHandle)}$`, $options: "i" },
  });

  if (existing) {
    return res.status(400).json({ message: "A reactivation request is already pending for this handle" });
  }

  const created = await Request.create({
    type: "reactivation",
    handle:  handleDoc.handle,
    name:    handleDoc.name || "",
    batch:   handleDoc.batch || "",
    status:  "pending",
  });

  return res.status(201).json({ message: "Reactivation request submitted", id: created._id });
});

export default router;
