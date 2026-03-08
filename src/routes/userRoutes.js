import express from "express"
import { createProfile, syncInvites } from "../controllers/userController.js"
import { requireAuth } from "../middleware/authMiddleware.js"

const router = express.Router()

router.post("/profile", requireAuth, createProfile)
router.post("/sync-invites", requireAuth, syncInvites)

export default router