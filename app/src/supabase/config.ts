// src/supabase.ts
import { createClient } from "@supabase/supabase-js";

// Replace with your actual Supabase URL and anon key
// It's recommended to use environment variables for these
const supabaseUrl = process.env.SUPABASE_CLIENT_ID || "";
const supabaseAnonKey = process.env.SUPABASE_CLIENT_SECRET || "";
console.log("🚀 ~ supabaseAnonKey:", supabaseAnonKey)

// Create and export the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
