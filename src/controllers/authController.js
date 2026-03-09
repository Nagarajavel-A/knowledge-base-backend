import supabase from "../services/supabaseClient.js"



export const loginWithGoogle = async (req, res) => {

    console.log("Google route triggered")
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      queryParams: {
        prompt: "select_account"
      }
    }
  })

  if (error) return res.status(400).json(error)

    console.log("OAuth URL:", data.url)

  return res.redirect(302, data.url)
}


export const loginWithMicrosoft = async (req, res) => {

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      queryParams: {
        prompt: "select_account"
      }
    }
  })

  if (error) return res.status(400).json(error)

  return res.redirect(302, data.url)
}
