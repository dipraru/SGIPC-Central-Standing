import mongoose from "mongoose";

const handleSchema = new mongoose.Schema(
  {
    handle: { type: String, required: true, unique: true, trim: true },
  },
  { timestamps: true }
);

export const Handle = mongoose.model("Handle", handleSchema);
