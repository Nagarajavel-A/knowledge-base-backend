import path from "path"
import multer from "multer"

const allowedExtensions = new Set([".pdf", ".docx", ".txt", ".md", ".xlsx"])
const maxFileSize = 10 * 1024 * 1024

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: maxFileSize
  },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase()

    if (!allowedExtensions.has(extension)) {
      return cb(new Error("Only pdf, docx, txt, md and xlsx files are allowed"))
    }

    cb(null, true)
  }
})

export default upload
