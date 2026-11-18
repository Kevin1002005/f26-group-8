// Tests for places.ts (finding places on the map) and fitsMajor in fit.ts.
// run them:   cd backend  &&  npm test
// They use Node's own test tools (node:test), so there's nothing to install, and they never
// touch the database or the internet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPlace, milesBetween, placesIn } from './places.js';
import { fitsMajor } from './fit.js';

// "Boston, MA" for each place found, so the checks below are easy to read
const where = (location: string | null) => placesIn(location).map((p) => `${p.city}, ${p.state}`);

test('a job location with a state code, a full state name, or a ZIP code', () => {
  assert.deepEqual(where('Boston, MA'), ['Boston, MA']);
  assert.deepEqual(where('Needham, MA, United States'), ['Needham, MA']);
  assert.deepEqual(where('Boston, Massachusetts'), ['Boston, MA']);
  assert.deepEqual(where('Chicago, ILLINOIS, US'), ['Chicago, IL']);
  assert.deepEqual(where('Boston, MA 02110'), ['Boston, MA']);
  assert.deepEqual(where('Columbia, MO (Headquarters)'), ['Columbia, MO']);
  assert.deepEqual(where('Washington, D.C.'), ['Washington, DC']);
  assert.deepEqual(where('Washington, District of Columbia, United States'), ['Washington, DC']);
});

test('a job listed in several places', () => {
  assert.deepEqual(where('Boston, MA · Johnston, RI · Columbus, OH'), ['Boston, MA', 'Johnston, RI', 'Columbus, OH']);
  assert.deepEqual(where('SF · NYC'), ['San Francisco, CA', 'New York, NY']);
  assert.deepEqual(where('Boston, MA, New York, NY'), ['Boston, MA', 'New York, NY']);
});

test('short names and other ways job sites write places', () => {
  assert.deepEqual(where('NYC'), ['New York, NY']);
  assert.deepEqual(where('LA'), ['Los Angeles, CA']);
  assert.deepEqual(where('Remote - Boston, MA'), ['Boston, MA']);
  assert.deepEqual(where('US-MA-Boston'), ['Boston, MA']);
  assert.deepEqual(where('Boise, ID'), ['Boise City, ID']);
  assert.deepEqual(where('New York, NY - Hybrid'), ['New York, NY']);
  assert.deepEqual(where('Morrisville, NC · Boise, ID +1 more'), ['Morrisville, NC', 'Boise City, ID']);
  assert.deepEqual(where('New York, Chicago'), ['New York, NY', 'Chicago, IL']);
});

test('places outside the US, and no place at all, are never on the map', () => {
  assert.deepEqual(where('Worcester, England, GB'), []);
  assert.deepEqual(where('Worcester, UK'), []);
  assert.deepEqual(where('Toronto, ON, Canada'), []);
  assert.deepEqual(where('Bangalore, IN, India'), []);
  assert.deepEqual(where('London'), []);
  assert.deepEqual(where('Remote'), []);
  assert.deepEqual(where('United States'), []);
  assert.deepEqual(where(null), []);
  // ", or" isn't Oregon: a state code only counts in capitals
  assert.deepEqual(where('Portland, or Remote'), []);
});

test('what a student types in "City or state"', () => {
  const city = (typed: string, prefer: string[] = []) => {
    const found = findPlace(typed, prefer);
    return found?.kind === 'city' ? `${found.place.city}, ${found.place.state}` : found;
  };
  // a city without a state: the one in the student's home state, or else the biggest
  assert.equal(city('Worcester'), 'Worcester, MA');
  // Worcester, NY is a town of about 2,000: a New York student typing "Worcester" gets the city
  // in Massachusetts, unless Worcester, NY is their own city
  assert.equal(city('Worcester', ['NY']), 'Worcester, MA');
  const homeNY = findPlace('Worcester, NY');
  assert.equal(homeNY?.kind, 'city');
  const own = findPlace('Worcester', ['NY'], homeNY?.kind === 'city' ? homeNY.place : null);
  assert.equal(own?.kind === 'city' ? `${own.place.city}, ${own.place.state}` : own, 'Worcester, NY');
  assert.equal(city('Cambridge'), 'Cambridge, MA');
  // with a state, typed any way
  assert.equal(city('worcester, ny'), 'Worcester, NY');
  assert.equal(city('Worcester MA'), 'Worcester, MA');
  assert.equal(city('Worcester, Massachusetts'), 'Worcester, MA');
  // short names
  assert.equal(city('LA'), 'Los Angeles, CA');
  assert.equal(city('NYC'), 'New York, NY');
  assert.equal(city('Washington'), 'Washington, DC');
  // the home state only wins for a real town there, not a village with a big city's name
  assert.equal(city('Washington', ['MA']), 'Washington, DC');
  assert.equal(city('Phoenix', ['NY']), 'Phoenix, AZ');
  assert.equal(city('Springfield', ['MA']), 'Springfield, MA');
  assert.equal(city('Portland', ['ME']), 'Portland, ME');
  // a state
  assert.deepEqual(findPlace('MA'), { kind: 'state', state: 'MA' });
  assert.deepEqual(findPlace('ma'), { kind: 'state', state: 'MA' });
  assert.deepEqual(findPlace('Massachusetts'), { kind: 'state', state: 'MA' });
  assert.deepEqual(findPlace('WA'), { kind: 'state', state: 'WA' });
  // not something we can find: the page then matches the words, the old way
  assert.equal(findPlace('01609'), null);
  assert.equal(findPlace('Worcester, England'), null);
  // on its own, a country or a big city abroad isn't a small US town with the same name
  assert.equal(findPlace('England'), null);
  assert.equal(findPlace('London'), null);
  assert.equal(city('Paris, TX'), 'Paris, TX');
  assert.equal(findPlace('Notarealplace'), null);
  assert.equal(findPlace(''), null);
});

test('miles between two places', () => {
  const worcester = placesIn('Worcester, MA')[0]!;
  const boston = placesIn('Boston, MA')[0]!;
  const framingham = placesIn('Framingham, MA')[0]!;
  // the real distances are about 39 and 20 miles (center to center)
  assert.ok(Math.abs(milesBetween(worcester, boston) - 39) < 3);
  assert.ok(Math.abs(milesBetween(worcester, framingham) - 20) < 3);
  assert.equal(milesBetween(worcester, worcester), 0);
});

test('fitsMajor: only jobs whose title is in your field (or, for a title with no field, the AI says so)', () => {
  const job = (title: string, ai_majors: string[] = []) => ({ title, type: 'internship', level: 'college', setting: null, paid: null, location: null, ai_majors });
  const fits = (title: string, major: string, ai: string[] = []) => fitsMajor(job(title, ai), major).fits;
  const ACC = 'Finance or Accounting';
  // the title decides
  assert.deepEqual(fitsMajor(job('Finance Intern'), ACC), { fits: true, word: 'finance' });
  assert.equal(fits('Audit & Tax Intern', ACC), true);
  assert.equal(fits('Equity Investments Intern', ACC), true);
  assert.equal(fits('Software Engineer Intern', 'Computer Science'), true);
  // a software job is never an accounting job: not by its company's name, its description, or its AI tags
  assert.equal(fits('Software Engineer Intern', ACC), false);
  assert.equal(fits('Software Engineer Intern', ACC, ['Computer Science', ACC]), false);
  assert.equal(fits('Software Engineer Intern, Trading Systems', ACC), false);
  assert.equal(fits('Engineering Intern', ACC, [ACC]), false);
  // a title with no field uses the AI's reading of the post
  assert.deepEqual(fitsMajor(job('Summer Analyst', [ACC]), ACC), { fits: true, word: null });
  assert.equal(fits('Summer Analyst', 'Computer Science', [ACC]), false);
  assert.equal(fits('Summer Analyst', ACC), false);   // not read by the AI yet: not shown under any major
  // words that used to cross fields
  assert.equal(fits('Data Analyst Intern', 'Business'), false);
  assert.equal(fits('Data Analyst Intern', 'Data Science'), true);
  assert.equal(fits('Design Verification Engineer Intern', 'Design'), false);
  assert.equal(fits('Product Design Intern', 'Design'), true);
  assert.equal(fits('Cloud Infrastructure Intern', 'Civil or Environmental Engineering'), false);
  assert.equal(fits('Robotics Lab Intern', 'Biology'), false);
  assert.equal(fits('High School Internship, Software Engineering', 'Education'), false);
  assert.equal(fits('Climate, Health and Equity Internship', ACC), false);
  assert.equal(fits('Communications Engineering Intern', 'Marketing or Communications'), false);
  assert.equal(fits('Communications Intern', 'Marketing or Communications'), true);
  assert.equal(fits('Project Controls Intern', 'Computer or Electrical Engineering'), false);
  assert.equal(fits('FPGA Design Verification Intern', 'Design'), false);
  assert.equal(fits('FPGA Design Verification Intern', 'Computer or Electrical Engineering'), true);
  assert.equal(fits('Timing Analog Mixed Signal Design Intern', 'Design'), false);
  assert.equal(fits('Summer Intern (Legal Administrative Specialist) (Non-Tax)', ACC), false);
  assert.equal(fits('Capital Markets Intern', ACC), true);
  // a typed-in major ("Other") matches its own words in the title
  assert.equal(fitsMajor(job('Architecture Intern'), 'Architecture', ['architecture']).fits, true);
  assert.equal(fitsMajor(job('Software Intern'), 'Architecture', ['architecture']).fits, false);
});
