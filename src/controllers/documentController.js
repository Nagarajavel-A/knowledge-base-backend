import supabase from "../services/supabaseClient.js"

export const uploadDocument = async (req, res) => {

  const { workspaceId, notes } = req.body
  const file = req.file

  if (!file) {
    return res.status(400).json({ message: "No file uploaded" })
}

  const user = req.user

  const storagePath = `${workspaceId}/${Date.now()}-${file.originalname}`

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file.buffer)

  if(uploadError) return res.status(400).json(uploadError)

  const { data, error } = await supabase
    .from("documents")
    .insert({
      workspace_id: workspaceId,
      uploaded_by: user.id,
      file_name: file.originalname,
      file_type: file.mimetype,
      file_size: file.size,
      notes,
      status: "pending",
      storage_path: storagePath
    })
    .select()
    .single()

  if(error) return res.status(400).json(error)

  res.json(data)
}

// export const listDocuments = async (req, res) => {

//   const { workspaceId } = req.query
//   console.log("workspaceId:", workspaceId)

//   const { data, error } = await supabase
//     .from("documents")
//     .select(`
//       *,
//       user_profiles(email)
//     `)
//     .eq("workspace_id", workspaceId)
//     .order("created_at", { ascending: false })

//   if (error) {
//     console.log("Supabase error:", error)
//     return res.status(400).json(error)
//   }

//   console.log("documents:", data)

//   res.json(data)
// }

export const listDocuments = async (req, res) => {

  const { workspaceId } = req.query
  const user = req.user

  // check workspace membership
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single()

  if (!member) {
    return res.status(403).json({ message: "Not part of workspace" })
  }

  let query = supabase
    .from("documents")
    .select(`
      *,
      user_profiles(email)
    `)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  // if NOT owner → only their documents
  if (member.role !== "owner") {
    query = query.eq("uploaded_by", user.id)
  }

  const { data, error } = await query

  if (error) return res.status(400).json(error)

  res.json({
    documents: data,
    role: member.role
  })
}

export const approveDocument = async(req,res)=>{

  const { id } = req.params

  await supabase
  .from("documents")
  .update({status:"approved"})
  .eq("id",id)

  res.json({success:true})
}

export const rejectDocument = async(req,res)=>{

  const { id } = req.params

  await supabase
  .from("documents")
  .update({status:"rejected"})
  .eq("id",id)

  res.json({success:true})
}