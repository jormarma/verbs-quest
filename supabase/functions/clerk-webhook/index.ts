import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Clerk Webhook Signature Validation would typically go here using svix.
// For MVP, we'll focus on the data insertion itself.

console.log("Clerk Webhook Edge Function started")

serve(async (req) => {
  try {
    const payload = await req.json()
    console.log("Received webhook payload:", payload.type)

    if (payload.type === 'user.created') {
      const { id, username, first_name } = payload.data
      const displayUsername = username || first_name || 'Student'

      // Initialize Supabase client
      // Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set in Edge Function secrets
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      console.log(`Attempting to insert user ${id} into Supabase users table`)

      const { data, error } = await supabase
        .from('users')
        .insert({
          id: id, // Explicitly linking the Clerk ID
          username: displayUsername,
          role: 'student' // Default role
        })

      if (error) {
        throw error
      }

      console.log(`Successfully synced user ${id}`)
      return new Response(JSON.stringify({ message: "User synced to Supabase" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    }

    return new Response(JSON.stringify({ message: "Webhook received, unhandled event type" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })

  } catch (error) {
    console.error("Webhook processing error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    })
  }
})
