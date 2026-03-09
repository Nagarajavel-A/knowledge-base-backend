import express from "express"
import { createProfile, getProfile, updateProfile, syncInvites } from "../controllers/userController.js"
import { requireAuth } from "../middleware/authMiddleware.js"

const router = express.Router()

router.get("/profile", requireAuth, getProfile)
router.post("/profile", requireAuth, createProfile)
router.patch("/profile", requireAuth, updateProfile)
router.post("/sync-invites", requireAuth, syncInvites)

export default router
