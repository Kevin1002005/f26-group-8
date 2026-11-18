// Tests for who a job is for (job-sources/shared.ts): only jobs high school seniors and college
// undergrads can really get are saved, and "high school" only when it's FOR high schoolers.
// run them:   cd backend  &&  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessLevel, isForOurStudents } from './job-sources/shared.js';

test('law-school, pharmacy-school, and grad-school jobs are left out', () => {
  for (const title of [
    'Summer 2027 Legal Intern, Voting Rights Project', 'Legal Intern (Summer 2027)', 'Honors Program Law Clerk (J.D. Students)',
    'Honors Program Law Clerk (LL.M. Students)', 'Pharmacy Intern', 'Neurosurgery - Nurse Practitioner APN',
    'PhD Research Intern', "Master's Intern, Data Science", 'MBA Summer Associate Intern',
  ]) assert.equal(isForOurStudents(title, null), false, title);
  assert.equal(isForOurStudents('Software Engineer Intern', 'Currently pursuing a PhD in Computer Science'), false);
});

test('jobs undergrads and high schoolers can get stay in', () => {
  for (const title of [
    'Finance Intern', 'Accounting Co-op', 'Pharmacy Aggregation Intern', 'Pharmacy Consultant Internship',
    'Undergraduate Research Intern', 'Scrum Master Intern', 'Paralegal Intern', 'High School Internship, Software Engineering',
    // "LLM" is a large language model, not the LL.M. law degree
    'LLM Research Intern', 'AI/LLM Engineering Intern', 'Generative AI (LLM) Intern', 'LLM Ops Intern',
  ]) assert.equal(isForOurStudents(title, null), true, title);
  // "Bachelor's, Master's, or PhD" includes undergrads
  assert.equal(isForOurStudents('Data Intern', "Pursuing a Bachelor's, Master's, or PhD"), true);
});

test('"high school" only counts when the job is for high schoolers', () => {
  assert.equal(guessLevel('Summer High-school Intern Program', 'seeks current high school juniors and seniors'), 'high-school');
  assert.equal(guessLevel('Student Trainee', 'for students enrolled from high school to graduate level, at a college or university'), 'both');
  // these say "high school" but mean college, or a finished diploma
  assert.equal(guessLevel('Student Trainee', 'Completion of 2 academic years of post-high school study at a university'), 'college');
  assert.equal(guessLevel('Warehouse Intern', 'Requires a high school diploma or GED'), 'college');
  assert.equal(guessLevel('Data Intern', 'Currently enrolled in an undergraduate program'), 'college');
});
