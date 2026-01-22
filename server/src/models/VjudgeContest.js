import mongoose from "mongoose";

const vjudgeContestSchema = new mongoose.Schema(
  {
    contestId: { type: Number, required: true, unique: true },
    title: { type: String, trim: true, default: "" },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const VjudgeContest = mongoose.model(
  "VjudgeContest",
  vjudgeContestSchema
);
