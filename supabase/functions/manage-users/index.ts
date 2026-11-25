import { createClient } from 'npm:@supabase/supabase-js@2.119.2';
import { createHandler } from './handler.mjs';

const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const serverKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || secretKeys.default || Object.values(secretKeys)[0];
Deno.serve(createHandler(createClient, {
  url: Deno.env.get('SUPABASE_URL'),
  serviceRoleKey: serverKey
}));
