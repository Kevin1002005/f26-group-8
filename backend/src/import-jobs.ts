// plans.md Task JB2. Pulls internships from outside job sites into our jobs table.
//
// run it by hand:   cd backend  &&  npm run import-jobs
// it does NOT run when the server starts: "tsx watch" restarts the server every time you
// save a file, and each restart would call every job site again (and use up Adzuna's daily limit).
// The steps themselves are in import-runner.ts (the Refresh button on Opportunities uses them too).
//
// Two options, for the schedule that runs it on its own (.github/workflows/update-jobs.yml):
//   --quick       only the sources Refresh runs (no daily limits), for the run every few hours
//   --skip-unset  leave out a source whose key isn't set (JSearch without JSEARCH_API_KEY), instead
//                 of counting it as failed, so a missing key doesn't make every scheduled run "fail"
// By hand: npm run import-jobs -- --quick   (the -- passes the option through npm)
import { runImport, refreshSources, SOURCES, keysSet } from './import-runner.js';

const options = process.argv.slice(2);
// a mistyped option ("--quik") stops here, instead of quietly running everything
const unknown = options.filter((option) => !['--quick', '--skip-unset'].includes(option));
if (unknown.length > 0) {
  console.error(`import-jobs: unknown option ${unknown.join(' ')} (the options are --quick and --skip-unset)`);
  process.exit(1);
}

let names = options.includes('--quick') ? refreshSources() : SOURCES.map((source) => source.name);
if (options.includes('--skip-unset')) {
  const unset = names.filter((name) => !keysSet(name));
  if (unset.length > 0) console.log(`import-jobs: left out ${unset.join(', ')} (no key set)`);
  names = names.filter((name) => !unset.includes(name));
}

const everythingWorked = await runImport(names);

// a non-zero exit code tells the terminal (or the schedule) that something went wrong
if (!everythingWorked) {
  process.exitCode = 1;
}
