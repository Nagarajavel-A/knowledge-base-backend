import fs from "fs/promises"
import path from "path"
import supabase from "../services/supabaseClient.js"

async function getWorkspaceMembership(workspaceId, userId) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, can_upload_documents")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle()

  return { data, error }
}

async function attachUploaderProfiles(documents) {
  const docs = documents || []
  const uploaderIds = [...new Set(docs.map((doc) => doc.uploaded_by).filter(Boolean))]

  if (!uploaderIds.length) return docs

  const { data: profiles, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, email, full_name")
    .in("id", uploaderIds)

  if (profileError) {
    return docs
  }

  const profileById = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile]))

  return docs.map((doc) => ({
    ...doc,
    uploader_email: profileById[doc.uploaded_by]?.email || null,
    uploader_name: profileById[doc.uploaded_by]?.full_name || null
  }))
}

export const uploadWorkspaceDocument = async (req, res) => {

  const { workspaceId } = req.params
  const userId = req.user?.id
  const file = req.file

  if (!workspaceId) {
    return res.status(400).json({ message: "workspaceId is required" })
  }

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" })
  }

  if (!file) {
    return res.status(400).json({ message: "No file uploaded" })
  }

  const { data: membership, error: membershipError } = await getWorkspaceMembership(workspaceId, userId)

  if (membershipError) return res.status(400).json(membershipError)

  if (!membership) {
    return res.status(403).json({ message: "Not part of workspace" })
  }

  const normalizedStoragePath = file.path.replace(/\\/g, "/")
  const initialStatus = membership.role === "owner" ? "approved" : "pending"

  const { data: document, error: insertError } = await supabase
    .from("documents")
    .insert({
      workspace_id: workspaceId,
      uploaded_by: userId,
      file_name: file.originalname,
      file_type: file.mimetype,
      file_size: file.size,
      notes: req.body?.notes || null,
      storage_path: normalizedStoragePath,
      status: initialStatus
    })
    .select("*")
    .single()

  if (insertError) return res.status(400).json(insertError)

  res.status(201).json({
    document
  })
}

export const uploadDocument = async (req, res) => {
  req.params.workspaceId = req.params.workspaceId || req.body?.workspaceId
  return uploadWorkspaceDocument(req, res)
}

export const getWorkspaceDocuments = async (req, res) => {

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

  let query = supabase
    .from("documents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  if (membership.role === "member") {
    query = query.eq("uploaded_by", userId)
  } else if (membership.role !== "owner") {
    return res.status(403).json({ message: "Invalid workspace role" })
  }

  const { data: documents, error: documentsError } = await query

  if (documentsError) return res.status(400).json(documentsError)

  const enriched = await attachUploaderProfiles(documents)

  res.json({
    role: membership.role,
    documents: enriched
  })
}

export const listDocuments = async (req, res) => {
  req.params.workspaceId = req.params.workspaceId || req.query.workspaceId
  return getWorkspaceDocuments(req, res)
}

export const getPendingWorkspaceDocuments = async (req, res) => {

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

  if (!membership || membership.role !== "owner") {
    return res.status(403).json({ message: "Only workspace owner can access pending documents" })
  }

  const { data: documents, error: documentsError } = await supabase
    .from("documents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })

  if (documentsError) return res.status(400).json(documentsError)

  const enriched = await attachUploaderProfiles(documents)

  res.json({
    documents: enriched
  })
}

export const deleteDocument = async (req, res) => {

  const documentId = req.params.documentId || req.params.id
  const userId = req.user?.id

  if (!documentId) {
    return res.status(400).json({ message: "documentId is required" })
  }

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" })
  }

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id, workspace_id, uploaded_by, storage_path")
    .eq("id", documentId)
    .maybeSingle()

  if (documentError) return res.status(400).json(documentError)

  if (!document) {
    return res.status(404).json({ message: "Document not found" })
  }

  const { data: membership, error: membershipError } = await getWorkspaceMembership(document.workspace_id, userId)

  if (membershipError) return res.status(400).json(membershipError)

  if (!membership) {
    return res.status(403).json({ message: "Not part of workspace" })
  }

  const canDelete = membership.role === "owner" || document.uploaded_by === userId

  if (!canDelete) {
    return res.status(403).json({ message: "You do not have permission to delete this document" })
  }

  const { error: deleteError } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId)

  if (deleteError) return res.status(400).json(deleteError)

  if (document.storage_path) {
    const normalizedPath = document.storage_path.replace(/\\/g, "/")
    const absolutePath = path.isAbsolute(normalizedPath)
      ? normalizedPath
      : path.join(process.cwd(), normalizedPath)

    await fs.unlink(absolutePath).catch(() => {})
  }

  res.json({ success: true })
}

export const updateDocumentApproval = async (req, res) => {

  const { documentId } = req.params
  const { status } = req.body || {}
  const userId = req.user?.id

  if (!documentId) {
    return res.status(400).json({ message: "documentId is required" })
  }

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" })
  }

  if (status !== "approved" && status !== "rejected") {
    return res.status(400).json({ message: "status must be either 'approved' or 'rejected'" })
  }

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id, workspace_id")
    .eq("id", documentId)
    .maybeSingle()

  if (documentError) return res.status(400).json(documentError)

  if (!document) {
    return res.status(404).json({ message: "Document not found" })
  }

  const { data: membership, error: membershipError } = await getWorkspaceMembership(document.workspace_id, userId)

  if (membershipError) return res.status(400).json(membershipError)

  if (!membership || membership.role !== "owner") {
    return res.status(403).json({ message: "Only workspace owner can approve or reject documents" })
  }

  const { data: updatedDocument, error: updateError } = await supabase
    .from("documents")
    .update({ status })
    .eq("id", documentId)
    .select("*")
    .single()

  if (updateError) return res.status(400).json(updateError)

  res.json({
    document: updatedDocument
  })
}

export const approveDocument = async (req, res) => {
  req.params.documentId = req.params.documentId || req.params.id
  req.body = { ...(req.body || {}), status: "approved" }
  return updateDocumentApproval(req, res)
}

export const rejectDocument = async (req, res) => {
  req.params.documentId = req.params.documentId || req.params.id
  req.body = { ...(req.body || {}), status: "rejected" }
  return updateDocumentApproval(req, res)
}
