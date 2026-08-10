import mongoose from "mongoose";

const handleSchema = new mongoose.Schema(
  {
    handle: { type: String, required: true, unique: true, trim: true },
    name: { type: String, default: "" },
    roll: { type: String, default: "" },
    batch: { type: String, default: "" },
    ratings: [
      {
        date: { type: String, required: true },
        fromRating: { type: Number, required: true },
        toRating: { type: Number, required: true },
        delta: { type: Number, required: true },
      },
    ],
    isInactive: { type: Boolean, default: false },
    inactiveSince: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Handle = mongoose.model("Handle", handleSchema);
