import mongoose from "mongoose";

const teamMemberSchema = new mongoose.Schema(
  {
    handle: { type: String, trim: true },
    name:   { type: String, trim: true },
    roll:   { type: String, trim: true },
    batch:  { type: String, trim: true },
  },
  { _id: false }
);

const requestSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["handle", "team", "reactivation"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    // Individual handle fields
    handle: { type: String, trim: true },
    name:   { type: String, trim: true },
    roll:   { type: String, trim: true },
    batch:  { type: String, trim: true },
    // Team fields
    teamName:    { type: String, trim: true },
    teamHandles: { type: String, trim: true },
    teamMembers: { type: [teamMemberSchema], default: [] },
    // Timestamps
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
  },
  { timestamps: true }
);

export const Request = mongoose.model("Request", requestSchema);
