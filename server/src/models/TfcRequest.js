import mongoose from "mongoose";

const otherOjSchema = new mongoose.Schema(
  {
    ojName: { type: String, trim: true, default: "" },
    handle: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const tfcRequestSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    name: { type: String, required: true, trim: true },
    roll: { type: String, required: true, trim: true },
    batch: { type: String, required: true, trim: true },
    vjudgeHandles: { type: [String], default: [] },
    codeforcesHandle: { type: String, trim: true, default: "" },
    otherOjs: { type: [otherOjSchema], default: [] },
    playlistUrl: { type: String, trim: true, default: "" },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
  },
  { timestamps: true }
);

export const TfcRequest = mongoose.model("TfcRequest", tfcRequestSchema);
