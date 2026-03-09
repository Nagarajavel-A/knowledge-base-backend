import supabase from "../services/supabaseClient.js"

const INVITES_TABLE = "member_invites"

export const createProfile = async (req, res) => {

  const user = req.user
  const normalizedEmail = user?.email?.trim().toLowerCase()

  if (!normalizedEmail) {
    return res.status(400).json({ message: "Authenticated user email is required" })
  }

  const { data: existingProfile } = await supabase
    .from("user_profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle()

  const { data, error } = await supabase
    .from("user_profiles")
    .upsert({
      id: user.id,
      email: normalizedEmail,
      full_name: existingProfile?.full_name || user.user_metadata?.full_name || null,
      avatar_url: existingProfile?.avatar_url || null
    })
    .select()
    .single()

  if (error) return res.status(400).json(error)

  res.json(data)
}

export const getProfile = async (req, res) => {
  const user = req.user
  const normalizedEmail = user?.email?.trim().toLowerCase()

  if (!normalizedEmail) {
    return res.status(400).json({ message: "Authenticated user email is required" })
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, email, full_name, avatar_url, created_at")
    .eq("id", user.id)
    .maybeSingle()

  if (error) return res.status(400).json(error)

  if (data) {
    return res.json(data)
  }

  const { data: created, error: createError } = await supabase
    .from("user_profiles")
    .upsert({
      id: user.id,
      email: normalizedEmail,
      full_name: user.user_metadata?.full_name || null
    })
    .select("id, email, full_name, avatar_url, created_at")
    .single()

  if (createError) return res.status(400).json(createError)

  return res.json(created)
}

export const updateProfile = async (req, res) => {
  const user = req.user
  const { full_name, avatar_url } = req.body || {}
  const normalizedEmail = user?.email?.trim().toLowerCase()

  if (!normalizedEmail) {
    return res.status(400).json({ message: "Authenticated user email is required" })
  }

  const patch = {}

  if (typeof full_name === "string") {
    patch.full_name = full_name.trim() || null
  }

  if (typeof avatar_url === "string") {
    patch.avatar_url = avatar_url.trim() || null
  }

  if (!Object.keys(patch).length) {
    return res.status(400).json({ message: "At least one editable field is required" })
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .upsert({
      id: user.id,
      email: normalizedEmail,
      ...patch
    })
    .select("id, email, full_name, avatar_url, created_at")
    .single()

  if (error) return res.status(400).json(error)

  return res.json(data)
}

export const syncInvites = async (req,res)=>{

  const user = req.user
  const normalizedEmail = user?.email?.trim().toLowerCase()

  if (!normalizedEmail) {
    return res.status(400).json({ message: "Authenticated user email is required" })
  }

  const { data: invites, error: inviteError } = await supabase
    .from(INVITES_TABLE)
    .select("*")
    .ilike("email", normalizedEmail)
    .eq("status", "pending")

  if (inviteError) return res.status(400).json(inviteError)

  if (!invites?.length) return res.json({ message: "no invites", synced: 0 })

  let synced = 0

  for (const invite of invites) {
    const role = invite.role || "member"
    const canInviteMembers = role === "owner" ? true : invite.can_invite_members ?? false
    const canUploadDocuments = role === "owner" ? true : invite.can_upload_documents ?? false

    const { error: memberError } = await supabase
      .from("workspace_members")
      .upsert({
        role,
        workspace_id: invite.workspace_id,
        user_id: user.id,
        can_invite_members: canInviteMembers,
        can_upload_documents: canUploadDocuments
      }, {
        onConflict: "workspace_id,user_id",
        ignoreDuplicates: true
      })

    if (memberError) return res.status(400).json(memberError)

    const { error: updateInviteError } = await supabase
      .from(INVITES_TABLE)
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString()
      })
      .eq("id", invite.id)

    if (updateInviteError) return res.status(400).json(updateInviteError)

    synced += 1
  }

  res.json({ message: "invites synced", synced })
}
