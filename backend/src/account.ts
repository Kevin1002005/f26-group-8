// Your account's privacy controls (the Settings page's "Your data" buttons, and what the
// Privacy Policy promises):
//   GET    /api/account/export   everything ScoutSearch has saved for your account  -> JSON
//   DELETE /api/account          delete your account and everything tied to it      -> 204
// Every route needs you to be logged in (authenticateToken), and only ever touches YOUR account.
// (These use the login token in the Authorization header, not cookies, so another website
// can't make your browser call them: that's why there's no CSRF token here.)
import express from 'express';
import { supabase } from './db.js';
import { authenticateToken } from './middleware.js';

const router = express.Router();

router.use(authenticateToken);


// GET /api/account/export: a copy of your data (the right to access and to take it with you)
router.get('/export', async (req, res) => {
  const id = req.user!.id;
  // three lookups at once (Promise.all waits for all of them)
  const [profile, applications, resume] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
    supabase.from('applications')
      .select('id, job_id, example_id, title, organization, deadline, status, notes, created_at, updated_at')
      .eq('student_id', id)
      .order('created_at'),
    supabase.from('resumes').select('data, updated_at').eq('student_id', id).maybeSingle(),
  ]);
  const failed = [profile, applications, resume].find((result) => result.error);
  if (failed) {
    console.error('account export failed:', failed.error);
    return res.status(500).json({ error: 'Database error' });
  }

  // no-store: browsers and anything in between must not keep a copy of this answer
  res.set('Cache-Control', 'no-store');
  res.json({
    exported_at: new Date().toISOString(),
    account: { id: id, email: req.user!.email },
    profile: profile.data,
    applications: applications.data,
    resume: resume.data,
  });
});


// DELETE /api/account: deletes your login in Supabase Auth. Your profile, tracker, and resume
// go with it: their tables are set to "on delete cascade" (backend/sql/*.sql)
router.delete('/', async (req, res) => {
  const { error } = await supabase.auth.admin.deleteUser(req.user!.id);
  if (error) {
    console.error('account delete failed:', error);
    return res.status(500).json({ error: 'Server error' });
  }
  res.status(204).end();
});

export default router;
