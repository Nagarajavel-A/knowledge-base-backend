import express from "express"
import { requireAuth } from "../middleware/authMiddleware.js"
import upload from "../middleware/uploadMiddleware.js"
import {
  getWorkspaces,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  getWorkspaceDashboard
} from "../controllers/workspaceController.js"
import {
  getWorkspaceDocuments,
  getPendingWorkspaceDocuments,
  uploadWorkspaceDocument
} from "../controllers/documentController.js"

const router = express.Router()

router.get("/", requireAuth, getWorkspaces)
router.post("/", requireAuth, createWorkspace)
router.patch("/:workspaceId", requireAuth, updateWorkspace)
router.delete("/:workspaceId", requireAuth, deleteWorkspace)
router.get("/:workspaceId/dashboard", requireAuth, getWorkspaceDashboard)

router.get("/:workspaceId/documents", requireAuth, getWorkspaceDocuments)
router.get("/:workspaceId/documents/pending", requireAuth, getPendingWorkspaceDocuments)
router.post("/:workspaceId/documents", requireAuth, upload.single("file"), uploadWorkspaceDocument)

export default router
