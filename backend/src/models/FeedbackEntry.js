import mongoose from "mongoose";

const feedbackEntrySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["upgrade_request", "suggestion"],
      required: true,
      index: true
    },
    wantsBetterContent: { type: Boolean, default: false },
    wantsAiGeneratedImages: { type: Boolean, default: false },
    willingToPayPerBook: { type: Number, min: 0, default: 0 },
    category: { type: String, default: "" },
    message: { type: String, default: "" }
  },
  { timestamps: true }
);

export const FeedbackEntry = mongoose.model("FeedbackEntry", feedbackEntrySchema);
