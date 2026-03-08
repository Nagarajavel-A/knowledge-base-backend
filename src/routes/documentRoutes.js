import express from "express"
import multer from "multer"
import { uploadDocument, listDocuments, approveDocument, rejectDocument } from "../controllers/documentController.js"
import { requireAuth } from "../middleware/authMiddleware.js"

const router = express.Router()

const upload = multer({ dest: "uploads/" })

router.get("/", requireAuth, listDocuments)
router.post("/upload", requireAuth, upload.single("file"), uploadDocument)
router.post("/:id/approve", requireAuth, approveDocument)
router.post("/:id/reject", requireAuth, rejectDocument)

export default router