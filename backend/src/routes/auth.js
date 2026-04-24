import crypto from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

function hashEmail(email) {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function issueToken(user) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    {
      sub: String(user._id),
      emailHash: user.emailHash,
      provider: user.authProvider
    },
    jwtSecret,
    { expiresIn: "30d" }
  );
}

function toPublicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    dateOfBirth: user.dateOfBirth,
    authProvider: user.authProvider,
    emailHash: user.emailHash
  };
}

export function createAuthRouter() {
  const router = Router();

  router.post("/register", async (req, res, next) => {
    try {
      const { name = "", email = "", dateOfBirth = "", password = "" } = req.body || {};
      const normalizedName = String(name).trim();
      const normalizedEmail = String(email).trim().toLowerCase();
      const normalizedPassword = String(password);
      const dob = new Date(dateOfBirth);

      if (!normalizedName) {
        return res.status(400).json({ message: "Name is required" });
      }
      if (!normalizedEmail || !normalizedEmail.includes("@")) {
        return res.status(400).json({ message: "Valid email is required" });
      }
      if (Number.isNaN(dob.getTime())) {
        return res.status(400).json({ message: "Valid date of birth is required" });
      }
      if (normalizedPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const emailHash = hashEmail(normalizedEmail);
      const existing = await User.findOne({ emailHash });
      if (existing) {
        if (!existing.passwordHash) {
          return res.status(400).json({ message: "This account uses Google login." });
        }

        const passwordMatches = await bcrypt.compare(normalizedPassword, existing.passwordHash);
        if (!passwordMatches) {
          return res.status(409).json({ message: "User already exists. Please login." });
        }

        const token = issueToken(existing);
        return res.json({ token, user: toPublicUser(existing) });
      }

      const passwordHash = await bcrypt.hash(normalizedPassword, 12);
      const user = await User.create({
        name: normalizedName,
        email: normalizedEmail,
        emailHash,
        dateOfBirth: dob,
        passwordHash,
        authProvider: "local"
      });

      const token = issueToken(user);
      return res.status(201).json({ token, user: toPublicUser(user) });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const { email = "", password = "" } = req.body || {};
      const normalizedEmail = String(email).trim().toLowerCase();
      const normalizedPassword = String(password);

      if (!normalizedEmail || !normalizedPassword) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const emailHash = hashEmail(normalizedEmail);
      const user = await User.findOne({ emailHash });
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (!user.passwordHash) {
        return res.status(400).json({ message: "This account uses Google login." });
      }

      const passwordMatches = await bcrypt.compare(normalizedPassword, user.passwordHash);
      if (!passwordMatches) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const token = issueToken(user);
      return res.json({ token, user: toPublicUser(user) });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/google", async (req, res, next) => {
    try {
      const { idToken = "" } = req.body || {};
      if (!idToken) {
        return res.status(400).json({ message: "Google idToken is required" });
      }

      const googleClientId = process.env.GOOGLE_CLIENT_ID;
      if (!googleClientId) {
        return res.status(500).json({ message: "GOOGLE_CLIENT_ID is not configured" });
      }

      const client = new OAuth2Client(googleClientId);
      const ticket = await client.verifyIdToken({
        idToken,
        audience: googleClientId
      });
      const payload = ticket.getPayload();

      const email = String(payload?.email || "").trim().toLowerCase();
      const googleId = String(payload?.sub || "").trim();
      const name = String(payload?.name || email.split("@")[0] || "Google User").trim();

      if (!email || !googleId || payload?.email_verified !== true) {
        return res.status(401).json({ message: "Google identity verification failed" });
      }

      const emailHash = hashEmail(email);
      let user = await User.findOne({ emailHash });

      if (!user) {
        user = await User.create({
          name,
          email,
          emailHash,
          dateOfBirth: new Date("2000-01-01"),
          authProvider: "google",
          googleId,
          passwordHash: ""
        });
      } else if (!user.googleId) {
        user.googleId = googleId;
        user.authProvider = "google";
        await user.save();
      }

      const token = issueToken(user);
      return res.json({ token, user: toPublicUser(user) });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/me", requireAuth, async (req, res, next) => {
    try {
      const user = await User.findById(req.auth?.sub);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.json({ user: toPublicUser(user) });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
