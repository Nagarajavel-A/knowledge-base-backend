import express from "express"
import upload from "../middleware/uploadMiddleware.js"
import {
  uploadDocument,
  listDocuments,
  getWorkspaceDocuments,
  deleteDocument,
  updateDocumentApproval,
  approveDocument,
  rejectDocument
} from "../controllers/documentController.js"
import { requireAuth } from "../middleware/authMiddleware.js"

const router = express.Router()

router.get("/", requireAuth, listDocuments)
router.get("/workspace/:workspaceId", requireAuth, getWorkspaceDocuments)
router.post("/upload", requireAuth, upload.single("file"), uploadDocument)
router.delete("/:documentId", requireAuth, deleteDocument)
router.patch("/:documentId/approval", requireAuth, updateDocumentApproval)
router.post("/:id/approve", requireAuth, approveDocument)
router.post("/:id/reject", requireAuth, rejectDocument)

export default router
