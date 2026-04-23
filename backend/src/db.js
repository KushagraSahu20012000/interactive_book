import mongoose from "mongoose";

export async function connectDB(mongoUri) {
  if (!mongoUri) {
    throw new Error("Missing MONGO_URI in environment");
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri);

  // Remove legacy index from older schema versions where `slug` was unique.
  // New schema does not use slug, so keeping this index causes E11000 on inserts.
  try {
    const booksCollection = mongoose.connection.db.collection("books");
    const indexes = await booksCollection.indexes();
    const hasLegacySlugIndex = indexes.some((index) => index.name === "slug_1");
    if (hasLegacySlugIndex) {
      await booksCollection.dropIndex("slug_1");
      console.log("Dropped legacy books index: slug_1");
    }
  } catch (error) {
    const ignorableCodes = new Set([26, 27]);
    if (!ignorableCodes.has(error?.code)) {
      throw error;
    }
  }
}
