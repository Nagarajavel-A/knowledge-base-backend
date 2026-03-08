import "./config/env.js"

import express from "express"
import cors from "cors"

import authRoutes from "./routes/authRoutes.js"
import userRoutes from "./routes/userRoutes.js"
import workspaceRoutes from "./routes/workspaceRoutes.js"
import documentRoutes from "./routes/documentRoutes.js"

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
app.use("/documents", documentRoutes)

app.get("/", (req, res) => {
  res.send("Backend working")
})

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
    
  console.log(`Server running on port ${PORT}`)
})