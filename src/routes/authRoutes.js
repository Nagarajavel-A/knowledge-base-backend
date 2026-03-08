import express from "express"
import { loginWithGoogle, loginWithMicrosoft } from "../controllers/authController.js"

const router = express.Router()

router.get("/google", loginWithGoogle)
router.get("/microsoft", loginWithMicrosoft)

export default router