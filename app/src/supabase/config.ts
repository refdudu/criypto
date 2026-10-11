import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const url = process.env.SUPABASE_CLIENT_ID;
const key = process.env.SUPABASE_CLIENT_SECRET;
if (!url || !key) throw new Error("Missing Supabase configuration");
export const supabase = createClient(url, key);
