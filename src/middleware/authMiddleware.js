import supabase from "../services/supabaseClient.js"

export const requireAuth = async (req, res, next) => {

  const authHeader = req.headers.authorization

  if (!authHeader) {
    return res.status(401).json({ message: "No auth token" })
  }

  const token = authHeader.replace("Bearer ", "")

  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data.user) {
    return res.status(401).json({ message: "Invalid token" })
  }

  req.user = data.user

  next()
}