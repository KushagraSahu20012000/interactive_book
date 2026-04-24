import mongoose from "mongoose";

const bookSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true
    },
    guestKey: {
      type: String,
      default: "",
      index: true
    },
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
      enum: ["queued", "generating", "active", "failed"],
      default: "queued"
    },
    coverImageUrl: { type: String, default: "" },
    coverImagePixelArray: { type: [[Number]], default: [] },
    coverImageWidth: { type: Number, default: 0 },
    coverImageHeight: { type: Number, default: 0 },
    currentPageNumber: { type: Number, default: 0 },
    totalPagesGenerated: { type: Number, default: 0 },
    lastError: { type: String, default: "" }
  },
  { timestamps: true }
);

export const Book = mongoose.model("Book", bookSchema);
