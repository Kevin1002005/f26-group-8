import { createClient } from '@supabase/supabase-js';

// one shared Supabase client for the whole backend, using the SECRET key
// (the secret key skips RLS, so only the server may ever have it)
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      // by default supabase-js remembers a logged-in user and keeps their token fresh.
      // that's for browsers, where one person uses the client. our server handles
      // many different users, so it must never remember or refresh anyone's session.
      // careful: every backend query runs with the secret key, never the user's own token,
      // so RLS doesn't limit what a route can read or change. a route that should only
      // touch the user's own rows has to check that itself, e.g. .eq('posted_by', <their id>)
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
