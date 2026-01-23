import express from "express";
import bcrypt from "bcryptjs";
import { Request } from "../models/Request.js";
import { Passkey } from "../models/Passkey.js";
import { Handle } from "../models/Handle.js";
import { VjudgeTeam } from "../models/VjudgeTeam.js";

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

router.post("/request/handle", async (req, res) => {
  const { handle, name, roll, batch, passkey } = req.body;
  if (!handle || !name || !roll || !batch || !passkey) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const normalizedHandle = handle.trim();
  const normalizedHandleLower = normalizedHandle.toLowerCase();
  const existingHandle = await Handle.findOne({
    handle: { $regex: `^${escapeRegex(normalizedHandle)}$`, $options: "i" },
  });
  if (existingHandle) {
    return res
      .status(400)
      .json({ message: "Handle already exists in standings" });
  }

  const pendingHandle = await Request.findOne({
    type: "handle",
    status: "pending",
    handle: { $regex: `^${escapeRegex(normalizedHandleLower)}$`, $options: "i" },
  });
  if (pendingHandle) {
    return res
      .status(400)
      .json({ message: "Handle is already pending approval" });
  }

  const isValid = await verifyPasskey(passkey);
  if (!isValid) {
    return res.status(401).json({ message: "Invalid passkey" });
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

router.post("/request/team", async (req, res) => {
  const { teamName, teamHandles, passkey } = req.body;
  if (!teamName || !teamHandles || !passkey) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const aliasList = (teamHandles || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const aliasListLower = aliasList.map((v) => v.toLowerCase());

  if (aliasList.length === 0) {
    return res.status(400).json({ message: "Team handles are required" });
  }

  const teams = await VjudgeTeam.find().lean();
  const teamConflict = teams.some((team) => {
    const names = [team.name, ...(team.aliases || [])]
      .filter(Boolean)
      .map((v) => v.toLowerCase());
    return names.some((alias) => aliasListLower.includes(alias));
  });

  if (teamConflict) {
    return res
      .status(400)
      .json({ message: "One or more team handles already exist in standings" });
  }

  const pendingTeams = await Request.find({
    type: "team",
    status: "pending",
  }).lean();
  const pendingConflict = pendingTeams.some((reqItem) => {
    const pendingAliases = (reqItem.teamHandles || "")
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    return pendingAliases.some((alias) => aliasListLower.includes(alias));
  });

  if (pendingConflict) {
    return res
      .status(400)
      .json({ message: "Team handles are already pending approval" });
  }

  const isValid = await verifyPasskey(passkey);
  if (!isValid) {
    return res.status(401).json({ message: "Invalid passkey" });
  }

  const created = await Request.create({
    type: "team",
    teamName: teamName.trim(),
    teamHandles: aliasList.join(", "),
    status: "pending",
  });

  return res.status(201).json({ message: "Request submitted", id: created._id });
});

export default router;
