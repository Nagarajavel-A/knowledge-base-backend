import "./config/env.js"

import express from "express"
import cors from "cors"
import multer from "multer"

import authRoutes from "./routes/authRoutes.js"
import userRoutes from "./routes/userRoutes.js"
import workspaceRoutes from "./routes/workspaceRoutes.js"
import memberRoutes from "./routes/memberRoutes.js"
import documentRoutes from "./routes/documentRoutes.js"
import ragRoutes from "./routes/ragRoutes.js"

const app = express()

app.use(cors())
app.use(express.json())

app.use((req, res, next) => {
  console.log("Incoming request:", req.method, req.url)
  next()
})

app.use("/auth", authRoutes)
app.use("/users", userRoutes)
app.use("/workspaces", workspaceRoutes)
app.use("/workspaces", memberRoutes)
app.use("/documents", documentRoutes)
app.use("/rag", ragRoutes)

app.get("/", (req, res) => {
  res.send("Backend working")
})

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "File exceeds 10MB limit" })
    }

    return res.status(400).json({ message: err.message })
  }

  if (err?.message?.includes("Only pdf, docx, txt, md and xlsx files are allowed")) {
    return res.status(400).json({ message: err.message })
  }

  return next(err)
})

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
    
  console.log(`Server running on port ${PORT}`)
})
