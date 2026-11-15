// plans.md Task J1. authenticateToken checks that a request comes from someone who is logged in.
//
// how logging in works now: the frontend logs people in with Supabase (Google, etc.).
// Supabase gives the browser an "access token", a long signed code that says who you are.
// the frontend sends it on every backend call (src/api.js) in this header:
//     Authorization: Bearer <token>
// this file checks that token with Supabase. If it's real and not expired, it saves who
// you are in req.user, and the route runs. If not, it answers 401 and the route never runs.
//
// how to protect a route: put authenticateToken before the route's own code, like
//     router.get('/me', authenticateToken, async (req, res) => { ... req.user.id ... })
//
// requireRole (plans.md Task J2, at the bottom) goes AFTER authenticateToken, for routes
// only some people may use:
//     router.get('/pending', authenticateToken, requireRole('admin'), async (req, res) => { ... })
import type { Request, Response, NextFunction } from "express";
import { supabase } from "./db.js";

// J1a: what we know about the logged-in person after the check.
// id is their Supabase user id (the same uuid as profiles.id and auth.users.id).
// email can be null, for example when someone's GitHub email is private.
export type TokenPayload = { id: string; email: string | null };

// the three kinds of accounts (the same list as the check on profiles.role in sql/roles.sql)
export type Role = "student" | "employer" | "admin";
const ROLES: Role[] = ["student", "employer", "admin"];

// TypeScript only knows the fields Express gives a request (req.body, req.params...).
// this tells it that a request can also have these fields.
// "declare global" adds to Express's own description of a request instead of making a new one.
// the "?" means they're only there on routes that run the middleware that fills them in:
//   user              set by authenticateToken
//   role              set by requireRole
//   employerVerified  set by requireRole (true once an admin has verified this employer)
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      role?: Role;
      employerVerified?: boolean;
    }
  }
}

// J1b: "async" because asking Supabase to check the token takes a moment, and "await"
// waits for its answer. Express 5 handles async middleware: if anything in here crashes,
// Express answers 500 instead of the server stopping.
export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  // the header looks like "Bearer eyJhbGci..." (one space, no colon).
  // split(" ") cuts it into ["Bearer", "eyJhbGci..."], and [1] is the token part.
  // "authHeader &&" only splits if the header exists, so a missing header can't crash it.
  const authHeader = req.get("Authorization");
  const token = authHeader && authHeader.split(" ")[1];

  // 401 means "you need to log in" (403 would mean "you're logged in but not allowed")
  if (!token) {
    return res.status(401).json({ error: "Not logged in" });
  }

  // getClaims checks the token's signature against Supabase's public keys, and that it
  // hasn't expired. If it's real, data.claims is what's inside the token.
  // there's no secret key to keep here anymore (the old JWT_KEY): Supabase signed the token,
  // so Supabase's keys are what check it.
  //
  // try/catch: for a token that's garbage (not even shaped like a token), getClaims
  // doesn't hand back an error, it THROWS one. Without the catch, Express would answer
  // 500 "server error" when the real answer is 401 "not logged in".
  let result;
  try {
    result = await supabase.auth.getClaims(token);
  } catch {
    return res.status(401).json({ error: "Not logged in" });
  }
  const { data, error } = result;

  // getClaims can also come back with NO data and NO error (plans.md J1b), so check both.
  // we don't send the real reason (expired? fake?) to the client, it doesn't need it.
  if (error || !data) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const claims = data.claims;

  // a token can be real but not belong to a logged-in person: Supabase's old-style "anon"
  // key is a signed token too, with role "anon" and no user id. Only accept tokens for a
  // real logged-in user ("authenticated"), with a user id (sub = "subject", the user's id),
  // who isn't an anonymous guest account.
  if (claims.role !== "authenticated" || typeof claims.sub !== "string" || claims.is_anonymous) {
    return res.status(401).json({ error: "Not logged in" });
  }

  // save who this is, so the route can use req.user.id.
  // a missing (or strange) email becomes null, to match TokenPayload
  req.user = {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
  next();
}


// J2: requireRole("admin") lets only admins through. requireRole("employer", "admin")
// lets employers OR admins through. Everyone else gets 403.
//
// "...allowed" means "any number of roles": requireRole("admin") gives ["admin"],
// requireRole("employer", "admin") gives ["employer", "admin"].
//
// it RETURNS a middleware function instead of being one, so each route can say which
// roles it allows. That's why it's written requireRole("admin") with the brackets.
//
// why it reads the database: the Supabase token only proves WHO you are, not our roles
// (its "role" is always "authenticated"). Roles live in our own profiles table, so we look
// them up on every request. That also means taking someone's admin role away works right
// away, instead of when their token runs out.
export function requireRole(...allowed: Role[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // requireRole needs to know who you are, which authenticateToken works out.
    // if a route forgot authenticateToken in front, that's our mistake, not the user's:
    // say so in the terminal, and answer 500 (never let the request through)
    if (!req.user) {
      console.error("requireRole is used on a route without authenticateToken in front of it");
      return res.status(500).json({ error: "Server error" });
    }

    // look up this person's role. .maybeSingle() gives null (not an error) if there's no row
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role, employer_verified")
      .eq("id", req.user.id)
      .maybeSingle();

    if (error) {
      console.error("requireRole: reading the profile failed", error);
      return res.status(500).json({ error: "Server error" });
    }

    // 403 means "we know who you are, but you're not allowed" (401 was "log in first").
    // no profile yet means they've never opened the site after logging in (GET /api/auth/me
    // makes the profile), so they can't be an admin or employer: also 403.
    // the ROLES check is extra safety in case the database ever holds a role we don't know.
    if (!profile || !ROLES.includes(profile.role) || !allowed.includes(profile.role)) {
      return res.status(403).json({ error: "Not allowed" });
    }

    // save the role for the route, so it doesn't have to look it up again
    // (for example, an admin may edit any job, but an employer only their own)
    req.role = profile.role;
    req.employerVerified = profile.employer_verified;
    next();
  };
}
