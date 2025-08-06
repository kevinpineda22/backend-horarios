// src/services/supabase.service.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export default supabase;