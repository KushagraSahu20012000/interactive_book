import { Router } from "express";
import { getIdentityFromRequest, getRewardsStatus, recordSamplePageRead } from "../services/rewardsService.js";
import { attachAuthOptional } from "../middleware/auth.js";

export function createRewardsRouter() {
  const router = Router();

  router.use(attachAuthOptional);

  router.get("/status", async (req, res, next) => {
    try {
      const identity = getIdentityFromRequest(req);
      const rewards = await getRewardsStatus(identity);
      return res.json(rewards);
    } catch (error) {
      return next(error);
    }
  });

  router.post("/sample-page-read", async (req, res, next) => {
    try {
      const identity = getIdentityFromRequest(req);
      const { bookId = "", pageNumber = 0, dwellMs = 0 } = req.body || {};

      if (!bookId) {
        return res.status(400).json({ message: "bookId is required" });
      }

      const result = await recordSamplePageRead({
        identity,
        sampleBookId: String(bookId),
        pageNumber: Number(pageNumber),
        dwellMs: Number(dwellMs),
      });

      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
