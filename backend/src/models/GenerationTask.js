import mongoose from "mongoose";

const generationTaskSchema = new mongoose.Schema(
  {
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true,
      index: true
    },
    pageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Page",
      required: true,
      index: true
    },
    taskType: {
      type: String,
      enum: ["create_book", "next_page"],
      required: true
    },
    aiJobId: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ["queued", "monitoring", "completed", "failed"],
      default: "queued"
    },
    monitorStarted: { type: Boolean, default: false },
    lastError: { type: String, default: "" }
  },
  { timestamps: true }
);

export const GenerationTask = mongoose.model("GenerationTask", generationTaskSchema);
