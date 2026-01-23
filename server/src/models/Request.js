import mongoose from "mongoose";

const requestSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["handle", "team"], required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    handle: { type: String, trim: true },
    name: { type: String, trim: true },
    roll: { type: String, trim: true },
    batch: { type: String, trim: true },
    teamName: { type: String, trim: true },
    teamHandles: { type: String, trim: true },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
  },
  { timestamps: true }
);

export const Request = mongoose.model("Request", requestSchema);
