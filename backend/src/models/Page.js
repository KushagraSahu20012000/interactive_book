import mongoose from "mongoose";

const sectionSchema = new mongoose.Schema(
  {
    position: { type: Number, required: true },
    text: { type: String, default: "" },
    imagePrompt: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    imageStatus: {
      type: String,
      enum: ["queued", "generating", "ready", "failed"],
      default: "queued"
    },
    imagePixelArray: { type: [[Number]], default: [] },
    imageWidth: { type: Number, default: 0 },
    imageHeight: { type: Number, default: 0 }
  },
  { _id: false }
);

const pageSchema = new mongoose.Schema(
  {
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true,
      index: true
    },
    pageNumber: { type: Number, required: true },
    title: { type: String, default: "" },
    actionItem: { type: String, default: "" },
    status: {
      type: String,
      enum: ["queued", "text_ready", "completed", "failed"],
      default: "queued"
    },
    sections: {
      type: [sectionSchema],
      default: [
        { position: 1 },
        { position: 2 },
        { position: 3 }
      ]
    },
    aiJobId: { type: String, default: "" },
    lastError: { type: String, default: "" }
  },
  { timestamps: true }
);

pageSchema.index({ bookId: 1, pageNumber: 1 }, { unique: true });

export const Page = mongoose.model("Page", pageSchema);
