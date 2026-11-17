// plans.md Task JB2. Pulls internships from outside job sites into our jobs table.
//
// run it by hand:   cd backend  &&  npm run import-jobs
// it does NOT run when the server starts: "tsx watch" restarts the server every time you
// save a file, and each restart would call every job site again (and use up Adzuna's daily limit).
// The steps themselves are in import-runner.ts (the Refresh button on Opportunities uses them too).
import { runImport } from './import-runner.js';

const everythingWorked = await runImport();

// a non-zero exit code tells the terminal (or a scheduler, later) that something went wrong
if (!everythingWorked) {
  process.exitCode = 1;
}
