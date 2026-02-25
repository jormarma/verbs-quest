import { createClient } from 'npm:@supabase/supabase-js'

const supabaseUrl = 'http://127.0.0.1:54321'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwcXhwbXN2bHFveW91ZGhqcXRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTA1NDUxOTksImV4cCI6MTk5MjIzODc5OX0.eKqFh6M5r9z3eG6w'
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data, error } = await supabase.rpc('submit_level_attempt', {
      p_level_id: 1,
      p_start_time: new Date(Date.now() - 60000).toISOString(),
      p_end_time: new Date().toISOString(),
      p_error_count: 0,
      p_questions_count: 5
  })
  console.log("data:", JSON.stringify(data, null, 2))
  console.log("error:", error)
}
run()
