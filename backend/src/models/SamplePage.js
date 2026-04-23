import mongoose from "mongoose";

const sampleSectionSchema = new mongoose.Schema(
  {
    position: { type: Number, required: true },
    text: { type: String, default: "" },
    imagePrompt: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    imageStatus: {
      type: String,
      enum: ["ready"],
      default: "ready"
    },
    imagePixelArray: { type: [[Number]], default: [] },
    imageWidth: { type: Number, default: 0 },
    imageHeight: { type: Number, default: 0 }
  },
  { _id: false }
);

const samplePageSchema = new mongoose.Schema(
  {
    sampleBookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SampleBook",
      required: true,
      index: true
    },
    pageNumber: { type: Number, required: true },
    title: { type: String, default: "" },
    actionItem: { type: String, default: "" },
    status: {
      type: String,
      enum: ["completed"],
      default: "completed"
    },
    sections: {
      type: [sampleSectionSchema],
      default: [{ position: 1 }, { position: 2 }, { position: 3 }]
    }
  },
  { timestamps: true }
);

samplePageSchema.index({ sampleBookId: 1, pageNumber: 1 }, { unique: true });

export const SamplePage = mongoose.model("SamplePage", samplePageSchema);
