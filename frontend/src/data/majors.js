// majors.js is the list of majors you can pick on the welcome guide and Edit
// profile (components/ProfileFields.jsx). Opportunities uses your major to show
// jobs for it, and to work out how well each job fits you.
//
// The backend has the same names, each with the words that job posts in that
// field tend to use (backend/src/fit.ts). If you add a major here, add it there
// too. A major that isn't on the list ("Other") still works: the backend looks
// for the words you typed.
export const majors = [
    'Computer Science',
    'Data Science',
    'Computer or Electrical Engineering',
    'Mechanical Engineering',
    'Civil or Environmental Engineering',
    'Biology',
    'Chemistry',
    'Health Sciences or Nursing',
    'Psychology',
    'Business',
    'Finance or Accounting',
    'Economics',
    'Marketing or Communications',
    'Design',
    'Mathematics or Statistics',
    'Political Science or Public Policy',
    'Environmental Science',
    'Education',
];

// For students who haven't picked one yet (most high schoolers): Opportunities
// then shows every field
export const undecided = 'Undecided / exploring';
