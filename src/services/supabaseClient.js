import { createClient } from "@supabase/supabase-js"

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY
console.log(process.env.SUPABASE_URL)
if (!url) {
  throw new Error("SUPABASE_URL is required. Set SUPABASE_URL in your environment or .env file.")
}

if (!key) {
  throw new Error("SUPABASE_ANON_KEY is required. Set SUPABASE_ANON_KEY in your environment or .env file.")
}

const supabase = createClient(url.trim(), key.trim())

export default supabase