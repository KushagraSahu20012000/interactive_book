import "dotenv/config";
import http from "node:http";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import { connectDB } from "./db.js";
import { createBooksRouter } from "./routes/books.js";
import { createAuthRouter } from "./routes/auth.js";
import { createFeedbackRouter } from "./routes/feedback.js";
import { Book } from "./models/Book.js";
import { SampleBook } from "./models/SampleBook.js";
import { seedSampleBooksFromAssets } from "./services/sampleBooksSeeder.js";

const app = express();
const server = http.createServer(app);

const defaultOrigins = ["http://localhost:5173", "http://localhost:8080", "http://127.0.0.1:5173", "http://127.0.0.1:8080"];
const configuredOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...configuredOrigins]));

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE"]
  }
});

app.use(
  cors({
    origin: allowedOrigins
  })
);
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    service: "bright-minds-backend",
    status: "ok",
    health: "/health"
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/health/ai", (_req, res) => {
  res.json({ aiLayerUrl: process.env.AI_LAYER_URL || "http://localhost:8000" });
});

app.use("/api/books", createBooksRouter(io));
app.use("/api/auth", createAuthRouter());
app.use("/api/feedback", createFeedbackRouter());

io.on("connection", async (socket) => {
  const [books, sampleBooks] = await Promise.all([
    Book.find()
      .sort({ createdAt: -1 })
      .select("title topic ageGroup neurotype language status currentPageNumber totalPagesGenerated createdAt")
      .lean(),
    SampleBook.find()
      .sort({ createdAt: -1 })
      .select("title topic ageGroup neurotype language status currentPageNumber totalPagesGenerated coverImageUrl createdAt isSample")
      .lean()
  ]);
  socket.emit("books:bootstrap", [...sampleBooks, ...books]);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

const PORT = Number(process.env.PORT || 4000);

async function start() {
  await connectDB(process.env.MONGO_URI);
  await seedSampleBooksFromAssets();
  server.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start backend", error);
  process.exit(1);
});
