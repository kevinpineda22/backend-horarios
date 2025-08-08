import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

export const supabaseAxios = axios.create({
  baseURL: `${supabaseUrl}/rest/v1`,
  headers: {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  }
});

// Para storage, usamos supabase-js:
import { createClient } from '@supabase/supabase-js';
export const storageClient = createClient(supabaseUrl, supabaseKey);