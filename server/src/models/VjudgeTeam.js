import mongoose from "mongoose";

const vjudgeTeamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    aliases: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const VjudgeTeam = mongoose.model("VjudgeTeam", vjudgeTeamSchema);
