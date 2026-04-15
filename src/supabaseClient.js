import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
        '[Zeno Chat] Supabase URL or Anon Key is missing.\n' +
        'Create a .env file based on .env.example and restart the dev server.'
    )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
