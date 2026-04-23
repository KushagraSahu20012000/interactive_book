import mongoose from "mongoose";

const sampleBookSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    topic: { type: String, required: true },
    description: { type: String, default: "" },
    ageGroup: {
      type: String,
      enum: ["5-10", "10-15", "15-20", "20+"],
      default: "15-20"
    },
    neurotype: {
      type: String,
      enum: ["ADHD", "Dyslexia", "Autism", "None"],
      default: "None"
    },
    language: {
      type: String,
      enum: ["English", "Hindi"],
      default: "English"
    },
    title: { type: String, required: true },
    status: {
      type: String,
      enum: ["active"],
      default: "active"
    },
    coverImageUrl: { type: String, default: "" },
    currentPageNumber: { type: Number, default: 1 },
    totalPagesGenerated: { type: Number, default: 0 },
    isSample: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

export const SampleBook = mongoose.model("SampleBook", sampleBookSchema);
