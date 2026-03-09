import supabase from "../services/supabaseClient.js"

async function getWorkspaceMembership(workspaceId, userId) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role")
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

export const getWorkspaces = async (req, res) => {

  const userId = req.user?.id

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" })
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_members")
    .select(`
      workspace_id,
      role,
      workspaces(
        id,
        name,
        owner_id
      )
    `)
    .eq("user_id", userId)

  if (membershipError) return res.status(400).json(membershipError)

  const rows = memberships || []

  const workspaceIds = rows.map((row) => row.workspace_id)

  let documentCountByWorkspace = {}

  if (workspaceIds.length) {
    const { data: documents, error: documentError } = await supabase
      .from("documents")
      .select("workspace_id")
      .in("workspace_id", workspaceIds)

    if (documentError) return res.status(400).json(documentError)

    documentCountByWorkspace = (documents || []).reduce((acc, doc) => {
      acc[doc.workspace_id] = (acc[doc.workspace_id] || 0) + 1
      return acc
    }, {})
  }

  const workspaces = rows
    .filter((row) => row.workspaces)
    .map((row) => ({
      id: row.workspaces.id,
      name: row.workspaces.name,
      owner_id: row.workspaces.owner_id,
      role: row.role,
      documents: documentCountByWorkspace[row.workspace_id] || 0
    }))

  res.json(workspaces)
}

export const createWorkspace = async (req, res) => {

  const { name } = req.body || {}
  const userId = req.user?.id

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" })
  }

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ message: "Workspace name is required" })
  }

  const trimmedName = name.trim()

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .insert({
      name: trimmedName,
      owner_id: userId
    })
    .select("id, name, owner_id")
    .single()

  if (workspaceError) return res.status(400).json(workspaceError)

  const { error: memberError } = await supabase
    .from("workspace_members")
    .insert({
      workspace_id: workspace.id,
      user_id: userId,
      role: "owner",
      can_invite_members: true,
      can_upload_documents: true
    })

  if (memberError) return res.status(400).json(memberError)

  res.status(201).json({
    ...workspace,
    role: "owner",
    documents: 0
  })
}

export const updateWorkspace = async (req, res) => {

  const { workspaceId } = req.params
  const { name } = req.body || {}
  const userId = req.user?.id

  if (!workspaceId) {
    return res.status(400).json({ message: "workspaceId is required" })
  }

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" })
  }

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ message: "Workspace name is required" })
  }

  const ownerCheck = await requireOwner(workspaceId, userId)
  if (!ownerCheck.ok) {
    return res.status(ownerCheck.status).json(ownerCheck.payload)
  }

  const { data: workspace, error: updateError } = await supabase
    .from("workspaces")
    .update({ name: name.trim() })
    .eq("id", workspaceId)
    .select("id, name, owner_id")
    .single()

  if (updateError) return res.status(400).json(updateError)

  res.json(workspace)
}

export const deleteWorkspace = async (req, res) => {

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

  const { error: documentDeleteError } = await supabase
    .from("documents")
    .delete()
    .eq("workspace_id", workspaceId)

  if (documentDeleteError) return res.status(400).json(documentDeleteError)

  const { error: memberDeleteError } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)

  if (memberDeleteError) return res.status(400).json(memberDeleteError)

  const { error: workspaceDeleteError } = await supabase
    .from("workspaces")
    .delete()
    .eq("id", workspaceId)

  if (workspaceDeleteError) return res.status(400).json(workspaceDeleteError)

  res.json({ success: true })
}

export const getWorkspaceDashboard = async (req, res) => {

  const { workspaceId } = req.params
  const userId = req.user?.id

  if (!workspaceId) {
    return res.status(400).json({ message: "workspaceId is required" })
  }

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" })
  }

  const { data: membership, error: membershipError } = await getWorkspaceMembership(workspaceId, userId)

  if (membershipError) return res.status(400).json(membershipError)

  if (!membership) {
    return res.status(403).json({ message: "Not part of workspace" })
  }

  let documentsQuery = supabase
    .from("documents")
    .select("id, status, created_at, file_name, storage_path, uploaded_by")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  if (membership.role === "member") {
    documentsQuery = documentsQuery.eq("uploaded_by", userId)
  }

  const { data: documents, error: documentsError } = await documentsQuery

  if (documentsError) return res.status(400).json(documentsError)

  const list = documents || []

  const totalDocuments = list.length
  const pendingDocuments = list.filter((doc) => doc.status === "pending").length
  const approvedDocuments = list.filter((doc) => doc.status === "approved").length
  const rejectedDocuments = list.filter((doc) => doc.status === "rejected").length

  const { count: totalMembers, error: memberCountError } = await supabase
    .from("workspace_members")
    .select("*", { head: true, count: "exact" })
    .eq("workspace_id", workspaceId)

  if (memberCountError) return res.status(400).json(memberCountError)

  const recentDocuments = list.slice(0, 10)

  res.json({
    total_documents: totalDocuments,
    pending_documents: pendingDocuments,
    approved_documents: approvedDocuments,
    rejected_documents: rejectedDocuments,
    total_members: totalMembers || 0,
    recent_documents: recentDocuments,
    role: membership.role
  })
}
