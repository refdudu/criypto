import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_CLIENT_ID;
const key = import.meta.env.VITE_SUPABASE_CLIENT_SECRET;
// VITE_ values are public in browser bundles. Use only the publishable/anon key with RLS.
if (!url || !key) throw new Error("Missing public Supabase browser configuration");
export const supabase = createClient(url, key);
