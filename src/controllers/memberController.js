import supabase from "../services/supabaseClient.js"

const INVITES_TABLE = "member_invites"

async function getWorkspaceMembership(workspaceId, userId) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, can_invite_members, can_upload_documents")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle()

  return { data, error }
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
    .eq("status", "pending")
    .maybeSingle()

  if (existingInviteError) return res.status(400).json(existingInviteError)

  if (existingInvite) {
    return res.status(409).json({ message: "An invite is already pending for this email" })
  }

  const { data: invite, error: insertError } = await supabase
    .from(INVITES_TABLE)
    .insert({
      workspace_id: workspaceId,
      email: normalizedEmail,
      role: resolvedRole,
      status: "pending",
      invited_by: requesterId,
      can_invite_members: resolvedCanInviteMembers,
      can_upload_documents: resolvedCanUploadDocuments
    })
    .select("id, workspace_id, email, role, can_invite_members, can_upload_documents, status, created_at")
    .single()

  if (insertError) return res.status(400).json(insertError)

  res.status(201).json({
    invite
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
