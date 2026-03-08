import express from "express"
import { requireAuth } from "../middleware/authMiddleware.js"
import { getWorkspaces, inviteMember, createWorkspace } from "../controllers/workspaceController.js"

const router = express.Router()

router.get("/", requireAuth, getWorkspaces)
router.post("/", requireAuth, createWorkspace)
router.post("/invite", requireAuth, inviteMember)

export default router