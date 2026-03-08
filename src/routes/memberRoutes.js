import express from "express"
import { requireAuth } from "../middleware/authMiddleware.js"
import {
  inviteMemberByEmail,
  listPendingInviteRequests,
  updateInviteRequestApproval,
  listWorkspaceMembers,
  removeWorkspaceMember,
  changeWorkspaceMemberRole
} from "../controllers/memberController.js"

const router = express.Router()

router.post("/:workspaceId/invite", requireAuth, inviteMemberByEmail)
router.get("/:workspaceId/invite-requests", requireAuth, listPendingInviteRequests)
router.patch("/:workspaceId/invite-requests/:inviteId/approval", requireAuth, updateInviteRequestApproval)
router.get("/:workspaceId/members", requireAuth, listWorkspaceMembers)
router.delete("/:workspaceId/members/:memberId", requireAuth, removeWorkspaceMember)
router.patch("/:workspaceId/members/:memberId/role", requireAuth, changeWorkspaceMemberRole)

export default router
