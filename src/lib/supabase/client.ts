import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Provide a warning if env vars are missing
if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase Environment Variables. Application will not connect to the database.')
}

export const supabase = createClient(
    supabaseUrl || 'http://localhost:54321', // Fallback to local
    supabaseAnonKey || 'dummy_anon_key',
    {
        global: {
            // We will override headers manually when Clerk provides a token
            // in the auth feature module later
            headers: {
                'x-client-info': 'verbs-quest-web',
            },
        },
    }
)
