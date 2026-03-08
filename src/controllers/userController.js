import supabase from "../services/supabaseClient.js"

export const createProfile = async (req, res) => {

  const user = req.user

  const { data, error } = await supabase
    .from("user_profiles")
    .upsert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name
    })
    .select()
    .single()

  if (error) return res.status(400).json(error)

  res.json(data)
}

export const syncInvites = async (req,res)=>{

  const user = req.user

  const { data:invites } = await supabase
  .from("workspace_invites")
  .select("*")
  .eq("email", user.email)
  .eq("status","pending")

  if(!invites?.length) return res.json({message:"no invites"})

  for(const invite of invites){

    await supabase
    .from("workspace_members")
    .insert({
      role: invite.role,
      workspace_id:invite.workspace_id,
      user_id:user.id,
      can_invite_members:invite.can_invite_members,
      can_upload_documents:invite.can_upload_documents
    })

    await supabase
    .from("workspace_invites")
    .update({status:"accepted"})
    .eq("id",invite.id)

  }

  res.json({message:"invites synced"})
}