import supabase from "../services/supabaseClient.js"
import { sendWorkspaceInviteEmail } from "../services/inviteEmailService.js"

const INVITES_TABLE = "member_invites"
const INVITE_STATUS = {
  PENDING: "pending",
  APPROVAL_PENDING: "approval_pending",
  ACCEPTED: "accepted",
  REVOKED: "revoked",
  EXPIRED: "expired"
}
const OPEN_INVITE_STATUSES = [INVITE_STATUS.PENDING, INVITE_STATUS.APPROVAL_PENDING]

async function getWorkspaceMembership(workspaceId, userId) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, can_invite_members, can_upload_documents")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle()

  return { data, error }
}

async function getWorkspaceName(workspaceId) {
  try {
    const { data } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", workspaceId)
      .maybeSingle()

    return data?.name || null
  } catch {
    return null
  }
}

async function sendInviteEmailInBackground({ workspaceId, email, role, status }) {
  try {
    if (status !== INVITE_STATUS.PENDING) return

    const workspaceName = await getWorkspaceName(workspaceId)
    await sendWorkspaceInviteEmail({
      toEmail: email,
      workspaceName,
      role
    })
  } catch (error) {
    // Never block API flow for email delivery issues.
    console.error("[invite-email] Background invite email failed:", error?.message || error)
  }
}

async function requireOwner(workspaceId, userId) {
  const { data, error } = await getWorkspaceMembership(workspaceId, userId)

  if (error) {
    return { ok: false, status: 400, payload: error }
  }

  if (!data || data.role !== "owner") {
    return { ok: false, status: 403, payload: { message: "Only workspace owner can perform this action" } }
  }

  return { ok: true }
}

async function requireCanInvite(workspaceId, userId) {
  const { data, error } = await getWorkspaceMembership(workspaceId, userId)

  if (error) {
    return { ok: false, status: 400, payload: error }
  }

  if (!data) {
    return { ok: false, status: 403, payload: { message: "Not part of workspace" } }
  }

  if (data.role === "owner" || data.can_invite_members) {
    return { ok: true, membership: data }
  }

  return { ok: false, status: 403, payload: { message: "You do not have permission to invite members" } }
}

export const inviteMemberByEmail = async (req, res) => {

  const { workspaceId } = req.params
  const {
    email,
    role = "member",
    can_invite_members: canInviteMembers = false,
    can_upload_documents: canUploadDocuments = false
  } = req.body || {}
  const requesterId = req.user?.id

  if (!workspaceId) {
    return res.status(400).json({ message: "workspaceId is required" })
  }

  if (!requesterId) {
    return res.status(401).json({ message: "Unauthorized" })
  }

  if (!email || typeof email !== "string") {
    return res.status(400).json({ message: "Valid email is required" })
  }

  if (role !== "owner" && role !== "member") {
    return res.status(400).json({ message: "role must be either 'owner' or 'member'" })
  }

  const invitePermissionCheck = await requireCanInvite(workspaceId, requesterId)
  if (!invitePermissionCheck.ok) {
    return res.status(invitePermissionCheck.status).json(invitePermissionCheck.payload)
  }

  const requesterMembership = invitePermissionCheck.membership
  const requesterIsOwner = requesterMembership?.role === "owner"
  const resolvedRole = requesterIsOwner ? role : "member"
  const inviteStatus = requesterIsOwner ? INVITE_STATUS.PENDING : INVITE_STATUS.APPROVAL_PENDING

  const normalizedEmail = email.trim().toLowerCase()
  const resolvedCanInviteMembers = requesterIsOwner
    ? (resolvedRole === "owner" ? true : Boolean(canInviteMembers))
    : false
  const resolvedCanUploadDocuments = resolvedRole === "owner"
    ? true
    : Boolean(canUploadDocuments)

  const { data: invitedUser, error: userError } = await supabase
    .from("user_profiles")
    .select("id")
    .ilike("email", normalizedEmail)
    .maybeSingle()

  if (userError) return res.status(400).json(userError)

  if (invitedUser?.id) {
    const { data: existingMember, error: existingError } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", invitedUser.id)
      .maybeSingle()

    if (existingError) return res.status(400).json(existingError)

    if (existingMember) {
      return res.status(409).json({ message: "User is already a workspace member" })
    }
  }

  const { data: existingInvite, error: existingInviteError } = await supabase
    .from(INVITES_TABLE)
    .select("id")
    .eq("workspace_id", workspaceId)
    .ilike("email", normalizedEmail)
    .in("status", OPEN_INVITE_STATUSES)
    .maybeSingle()

  if (existingInviteError) return res.status(400).json(existingInviteError)

  if (existingInvite) {
    return res.status(409).json({ message: "An open invite already exists for this email" })
  }

  const { data: invite, error: insertError } = await supabase
    .from(INVITES_TABLE)
    .insert({
      workspace_id: workspaceId,
      email: normalizedEmail,
      role: resolvedRole,
      status: inviteStatus,
      invited_by: requesterId,
      can_invite_members: resolvedCanInviteMembers,
      can_upload_documents: resolvedCanUploadDocuments
    })
    .select("id, workspace_id, email, role, can_invite_members, can_upload_documents, status, created_at")
    .single()

  if (insertError) return res.status(400).json(insertError)

  void sendInviteEmailInBackground({
    workspaceId,
    email: invite.email,
    role: invite.role,
    status: invite.status
  })

  res.status(201).json({
    invite,
    requires_owner_approval: inviteStatus === INVITE_STATUS.APPROVAL_PENDING,
    message:
      inviteStatus === INVITE_STATUS.APPROVAL_PENDING
        ? "Invite request submitted for workspace owner approval"
        : "Invite created"
  })
}

export const listPendingInviteRequests = async (req, res) => {

  const { workspaceId } = req.params
  const userId = req.user?.id

  if (!workspaceId) {
    return res.status(400).json({ message: "workspaceId is required" })
  }

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" })
  }

  const ownerCheck = await requireOwner(workspaceId, userId)
  if (!ownerCheck.ok) {
    return res.status(ownerCheck.status).json(ownerCheck.payload)
  }

  const { data: requests, error: requestError } = await supabase
    .from(INVITES_TABLE)
    .select("id, workspace_id, email, role, can_invite_members, can_upload_documents, status, invited_by, created_at")
    .eq("workspace_id", workspaceId)
    .eq("status", INVITE_STATUS.APPROVAL_PENDING)
    .order("created_at", { ascending: false })

  if (requestError) return res.status(400).json(requestError)

  const inviterIds = [...new Set((requests || []).map((row) => row.invited_by).filter(Boolean))]

  let profileById = {}

  if (inviterIds.length) {
    const { data: inviterProfiles, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, email, full_name")
      .in("id", inviterIds)

    if (profileError) return res.status(400).json(profileError)

    profileById = Object.fromEntries((inviterProfiles || []).map((profile) => [profile.id, profile]))
  }

  const formatted = (requests || []).map((request) => ({
    id: request.id,
    workspace_id: request.workspace_id,
    email: request.email,
    role: request.role,
    can_invite_members: request.can_invite_members ?? false,
    can_upload_documents: request.can_upload_documents ?? false,
    status: request.status,
    invited_by: request.invited_by,
    invited_by_email: profileById[request.invited_by]?.email || null,
    invited_by_name: profileById[request.invited_by]?.full_name || null,
    created_at: request.created_at
  }))

  res.json({
    requests: formatted
  })
}

export const updateInviteRequestApproval = async (req, res) => {

  const { workspaceId, inviteId } = req.params
  const { status } = req.body || {}
  const userId = req.user?.id

  if (!workspaceId || !inviteId) {
    return res.status(400).json({ message: "workspaceId and inviteId are required" })
  }

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" })
  }

  if (status !== "approved" && status !== "rejected") {
    return res.status(400).json({ message: "status must be either 'approved' or 'rejected'" })
  }

  const ownerCheck = await requireOwner(workspaceId, userId)
  if (!ownerCheck.ok) {
    return res.status(ownerCheck.status).json(ownerCheck.payload)
  }

  const { data: invite, error: inviteError } = await supabase
    .from(INVITES_TABLE)
    .select("id, workspace_id, email, role, can_invite_members, can_upload_documents, status")
    .eq("id", inviteId)
    .eq("workspace_id", workspaceId)
    .eq("status", INVITE_STATUS.APPROVAL_PENDING)
    .maybeSingle()

  if (inviteError) return res.status(400).json(inviteError)

  if (!invite) {
    return res.status(404).json({ message: "Invite request not found or already processed" })
  }

  let shouldAcceptImmediately = false
  let acceptedAt = null

  if (status === "approved") {
    const { data: invitedUser, error: userError } = await supabase
      .from("user_profiles")
      .select("id")
      .ilike("email", invite.email)
      .maybeSingle()

    if (userError) return res.status(400).json(userError)

    if (invitedUser?.id) {
      const { data: existingMember, error: memberError } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", invitedUser.id)
        .maybeSingle()

      if (memberError) return res.status(400).json(memberError)

      if (existingMember) {
        await supabase
          .from(INVITES_TABLE)
          .update({ status: INVITE_STATUS.REVOKED })
          .eq("id", inviteId)

        return res.status(409).json({ message: "User is already a workspace member. Invite request closed." })
      }

      const resolvedRole = invite.role === "owner" ? "owner" : "member"
      const resolvedCanInviteMembers = resolvedRole === "owner" ? true : invite.can_invite_members ?? false
      const resolvedCanUploadDocuments = resolvedRole === "owner" ? true : invite.can_upload_documents ?? false

      const { error: addMemberError } = await supabase
        .from("workspace_members")
        .upsert({
          workspace_id: workspaceId,
          user_id: invitedUser.id,
          role: resolvedRole,
          can_invite_members: resolvedCanInviteMembers,
          can_upload_documents: resolvedCanUploadDocuments
        }, {
          onConflict: "workspace_id,user_id",
          ignoreDuplicates: true
        })

      if (addMemberError) return res.status(400).json(addMemberError)

      shouldAcceptImmediately = true
      acceptedAt = new Date().toISOString()
    }
  }

  const nextStatus = status === "approved"
    ? (shouldAcceptImmediately ? INVITE_STATUS.ACCEPTED : INVITE_STATUS.PENDING)
    : INVITE_STATUS.REVOKED

  const { data: updatedInvite, error: updateError } = await supabase
    .from(INVITES_TABLE)
    .update({
      status: nextStatus,
      accepted_at: acceptedAt
    })
    .eq("id", inviteId)
    .select("id, workspace_id, email, role, can_invite_members, can_upload_documents, status, created_at")
    .single()

  if (updateError) return res.status(400).json(updateError)

  void sendInviteEmailInBackground({
    workspaceId,
    email: updatedInvite.email,
    role: updatedInvite.role,
    status: updatedInvite.status
  })

  res.json({
    invite: updatedInvite
  })
}

export const listWorkspaceMembers = async (req, res) => {

  const { workspaceId } = req.params
  const userId = req.user?.id

  if (!workspaceId) {
    return res.status(400).json({ message: "workspaceId is required" })
  }

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" })
  }

  const { data: requesterMembership, error: requesterError } = await getWorkspaceMembership(workspaceId, userId)

  if (requesterError) return res.status(400).json(requesterError)

  if (!requesterMembership) {
    return res.status(403).json({ message: "Not part of workspace" })
  }

  const { data: rows, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id, user_id, role, can_invite_members, can_upload_documents")
    .eq("workspace_id", workspaceId)

  if (memberError) return res.status(400).json(memberError)

  const memberIds = [...new Set((rows || []).map((row) => row.user_id))]

  let profileById = {}

  if (memberIds.length) {
    const { data: profiles, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, email, full_name")
      .in("id", memberIds)

    if (profileError) return res.status(400).json(profileError)

    profileById = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile]))
  }

  const members = (rows || [])
    .map((row) => ({
      user_id: row.user_id,
      workspace_id: row.workspace_id,
      role: row.role,
      can_invite_members: row.can_invite_members ?? false,
      can_upload_documents: row.can_upload_documents ?? false,
      email: profileById[row.user_id]?.email || null,
      full_name: profileById[row.user_id]?.full_name || null
    }))
    .sort((a, b) => {
      if (a.role === b.role) return 0
      return a.role === "owner" ? -1 : 1
    })

  res.json({
    role: requesterMembership.role,
    can_invite_members: requesterMembership.can_invite_members ?? false,
    can_upload_documents: requesterMembership.can_upload_documents ?? false,
    members
  })
}

export const removeWorkspaceMember = async (req, res) => {

  const { workspaceId, memberId } = req.params
  const requesterId = req.user?.id

  if (!workspaceId || !memberId) {
    return res.status(400).json({ message: "workspaceId and memberId are required" })
  }

  if (!requesterId) {
    return res.status(401).json({ message: "Unauthorized" })
  }

  const ownerCheck = await requireOwner(workspaceId, requesterId)
  if (!ownerCheck.ok) {
    return res.status(ownerCheck.status).json(ownerCheck.payload)
  }

  const { data: targetMembership, error: targetError } = await supabase
    .from("workspace_members")
    .select("user_id, role, can_invite_members, can_upload_documents")
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberId)
    .maybeSingle()

  if (targetError) return res.status(400).json(targetError)

  if (!targetMembership) {
    return res.status(404).json({ message: "Member not found in workspace" })
  }

  if (targetMembership.role === "owner") {
    return res.status(400).json({ message: "Owner cannot be removed from workspace" })
  }

  const { error: deleteError } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberId)

  if (deleteError) return res.status(400).json(deleteError)

  res.json({ success: true })
}

export const changeWorkspaceMemberRole = async (req, res) => {

  const { workspaceId, memberId } = req.params
  const { role } = req.body || {}
  const requesterId = req.user?.id

  if (!workspaceId || !memberId) {
    return res.status(400).json({ message: "workspaceId and memberId are required" })
  }

  if (!requesterId) {
    return res.status(401).json({ message: "Unauthorized" })
  }

  if (role !== "owner" && role !== "member") {
    return res.status(400).json({ message: "role must be either 'owner' or 'member'" })
  }

  const ownerCheck = await requireOwner(workspaceId, requesterId)
  if (!ownerCheck.ok) {
    return res.status(ownerCheck.status).json(ownerCheck.payload)
  }

  const { data: targetMembership, error: targetError } = await supabase
    .from("workspace_members")
    .select("user_id, role, can_invite_members, can_upload_documents")
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberId)
    .maybeSingle()

  if (targetError) return res.status(400).json(targetError)

  if (!targetMembership) {
    return res.status(404).json({ message: "Member not found in workspace" })
  }

  if (targetMembership.role === role) {
    return res.json({
      member: targetMembership
    })
  }

  if (targetMembership.user_id === requesterId && role !== "owner") {
    return res.status(400).json({ message: "Owner cannot demote self" })
  }

  if (targetMembership.role === "owner" && role === "member") {
    const { count: ownerCount, error: ownerCountError } = await supabase
      .from("workspace_members")
      .select("*", { head: true, count: "exact" })
      .eq("workspace_id", workspaceId)
      .eq("role", "owner")

    if (ownerCountError) return res.status(400).json(ownerCountError)

    if ((ownerCount || 0) <= 1) {
      return res.status(400).json({ message: "Workspace must have at least one owner" })
    }
  }

  const { data: updatedMember, error: updateError } = await supabase
    .from("workspace_members")
    .update({
      role,
      can_invite_members: role === "owner" ? true : targetMembership.can_invite_members,
      can_upload_documents: role === "owner" ? true : targetMembership.can_upload_documents
    })
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberId)
    .select("workspace_id, user_id, role, can_invite_members, can_upload_documents")
    .single()

  if (updateError) return res.status(400).json(updateError)

  if (role === "owner") {
    await supabase
      .from("workspaces")
      .update({ owner_id: memberId })
      .eq("id", workspaceId)
  }

  res.json({
    member: updatedMember
  })
}
