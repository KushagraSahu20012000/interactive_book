import mongoose from "mongoose";

const samplePageProgressSchema = new mongoose.Schema(
  {
    pageNumber: { type: Number, required: true },
    dwellMs: { type: Number, default: 0 },
  },
  { _id: false }
);

const sampleReadProgressSchema = new mongoose.Schema(
  {
    identityKey: { type: String, required: true, index: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
      sparse: true,
    },
    guestKey: { type: String, default: "", index: true },
    sampleBookId: { type: String, required: true, index: true },
    rewarded: { type: Boolean, default: false },
    pages: { type: [samplePageProgressSchema], default: [] },
  },
  { timestamps: true }
);

sampleReadProgressSchema.index({ identityKey: 1, sampleBookId: 1 }, { unique: true });

export const SampleReadProgress = mongoose.model("SampleReadProgress", sampleReadProgressSchema);
