import mongoose from "mongoose";

const rewardProfileSchema = new mongoose.Schema(
  {
    identityKey: { type: String, required: true, unique: true, index: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
      sparse: true,
    },
    guestKey: { type: String, default: "", index: true },
    points: { type: Number, default: 0 },
    sampleBooksCompletedCount: { type: Number, default: 0 },
    completedSampleBookIds: { type: [String], default: [] },
    createAwardedBookIds: { type: [String], default: [] },
    completionAwardedBookIds: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const RewardProfile = mongoose.model("RewardProfile", rewardProfileSchema);
