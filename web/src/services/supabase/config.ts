// src/supabase.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_CLIENT_ID || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_CLIENT_SECRET || "";
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
