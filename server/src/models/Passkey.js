import mongoose from "mongoose";

const passkeySchema = new mongoose.Schema(
  {
    keyHash: { type: String, required: true },
  },
  { timestamps: true }
);

export const Passkey = mongoose.model("Passkey", passkeySchema);
