import express from "express"
import { requireAuth } from "../middleware/authMiddleware.js"

const router = express.Router()
import { ask } from "../controllers/ragController.js"

router.post("/ask", requireAuth, ask)

export default router