import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";
import { supabaseConfig } from "./supabase-config.js";

export const setupError = !/^https:\/\/[^/]+/.test(supabaseConfig.url) || !supabaseConfig.publishableKey
  ? "Supabase setup is pending. Add your Project URL and publishable key to supabase-config.js, then follow SUPABASE_SETUP.md."
  : "";
export const supabase = setupError ? null : createClient(supabaseConfig.url, supabaseConfig.publishableKey);
