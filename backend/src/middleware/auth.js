import jwt from "jsonwebtoken";

function resolveJwtSecret(res) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    res.status(500).json({ message: "JWT_SECRET is not configured" });
    return null;
  }
  return jwtSecret;
}

function parseBearerToken(authHeader = "") {
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  return token;
}

export function requireAuth(req, res, next) {
  const token = parseBearerToken(req.headers.authorization || "");

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const jwtSecret = resolveJwtSecret(res);
  if (!jwtSecret) {
    return;
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    req.auth = payload;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

export function attachAuthOptional(req, res, next) {
  const token = parseBearerToken(req.headers.authorization || "");
  if (!token) {
    return next();
  }

  const jwtSecret = resolveJwtSecret(res);
  if (!jwtSecret) {
    return;
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    req.auth = payload;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}
