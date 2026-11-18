// Tags EVERY open job that hasn't been tagged yet (ai-tags.ts), not just the newest 100 that
// each import tags. For catching up: after AI tags were first added, only 100 of about 6,700
// jobs had them, so "For your major" mostly guessed from keywords.
//
// run it by hand:   cd backend  &&  npm run tag-jobs
// It tags AI_JOBS_PER_RUN jobs at a time (set AI_JOBS_PER_RUN=1000 to go faster), and keeps
// going until every job is tagged or the AI service says no (usually its free daily limit:
// then run it again tomorrow, and it picks up where it stopped).
import { tagNewJobs } from './ai-tags.js';

let total = 0;
for (;;) {
  const tagged = await tagNewJobs();
  total += tagged;
  if (tagged === 0) break;
  // the free tiers allow about 15 requests a minute, so wait a little before the next group
  await new Promise((done) => setTimeout(done, 5000));
}
console.log(`tag-jobs: tagged ${total} jobs in all`);
