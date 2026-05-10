import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SERVICE_KEY;

const supabase =
	SUPABASE_URL && SUPABASE_KEY
		? createClient(SUPABASE_URL, SUPABASE_KEY)
		: null;

function getSupabase() {
	return supabase;
}

export { getSupabase, supabase };
