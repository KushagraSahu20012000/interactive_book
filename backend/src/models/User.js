import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    emailHash: { type: String, required: true, unique: true, index: true },
    dateOfBirth: { type: Date, required: true },
    passwordHash: { type: String, default: "" },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local"
    },
    googleId: { type: String, default: "", unique: true, sparse: true }
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
