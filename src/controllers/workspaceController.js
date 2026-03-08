import supabase from "../services/supabaseClient.js"

export const getWorkspaces = async (req, res) => {

  const userId = req.user.id

  const { data, error } = await supabase
    .from("workspace_members")
    .select(`
      workspace_id,
      workspaces(*)
    `)
    .eq("user_id", userId)

  if (error) return res.status(400).json(error)

  res.json(data.map(w => w.workspaces))
}

export const inviteMember = async (req, res) => {

  const userId = req.user.id

  const {
    workspace_id,
    email,
    role,
    can_invite_members,
    can_upload_documents
  } = req.body

  const { data, error } = await supabase
    .from("workspace_invites")
    .insert({
      workspace_id,
      email,
      role,
      can_invite_members,
      can_upload_documents,
      invited_by: userId
    })

  if (error) return res.status(400).json(error)

  res.json(data)
}

export const createWorkspace = async (req,res)=>{

  const { name } = req.body
  const userId = req.user.id

  const { data:workspace } = await supabase
  .from("workspaces")
  .insert({
    name,
    owner_id:userId
  })
  .select()
  .single()

  await supabase
  .from("workspace_members")
  .insert({
    workspace_id:workspace.id,
    user_id:userId,
    role: 'owner',
    can_invite_members:true,
    can_upload_documents:true
  })

  res.json(workspace)
}