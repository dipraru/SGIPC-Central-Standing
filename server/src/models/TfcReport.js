import mongoose from "mongoose";

const tfcReportSchema = new mongoose.Schema(
  {
    participantId: { type: mongoose.Schema.Types.ObjectId, ref: "TfcParticipant" },
    participantName: { type: String, required: true },
    participantRoll: { type: String, required: true },
    participantBatch: { type: String, default: "" },
    videoTitle: { type: String, default: "" },
    videoUrl: { type: String, default: "" },
    category: { type: String, default: "General Irregularity" },
    explanation: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "reviewed", "resolved", "dismissed"],
      default: "pending",
    },
  },
  { timestamps: true }
);

export const TfcReport = mongoose.model("TfcReport", tfcReportSchema);
