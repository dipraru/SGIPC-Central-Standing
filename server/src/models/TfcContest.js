import mongoose from "mongoose";

const tfcContestSchema = new mongoose.Schema(
  {
    contestId: { type: Number, required: true, unique: true },
    title: { type: String, default: "" },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const TfcContest = mongoose.model("TfcContest", tfcContestSchema);
