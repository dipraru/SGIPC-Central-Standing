import mongoose from "mongoose";

const pendingProblemSchema = new mongoose.Schema(
  {
    handle: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    contestId: { type: Number },
    index: { type: String },
    name: { type: String, required: true },
    solvedAtSeconds: { type: Number, required: true },
  },
  { timestamps: true }
);

pendingProblemSchema.index({ handle: 1, contestId: 1, index: 1 }, { unique: true });

export const PendingProblem = mongoose.model(
  "PendingProblem",
  pendingProblemSchema
);
