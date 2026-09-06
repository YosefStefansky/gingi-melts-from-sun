// Tiny JSON-file data store.
//
// This app is meant for one household, run on a single small server/process,
// so a full database engine would be overkill. Everything lives in one JSON
// file on disk; reads/writes are synchronous and go through this module so
// there's a single place that serializes access (Node is single-threaded per
// request anyway, but this also makes the file trivial to back up or inspect
// by hand).

const fs = require('fs');
const path = require('path');

const DB_FILE = path.resolve(process.cwd(), process.env.DB_FILE || './data/db.json');

const DEFAULT_DATA = {
  locations: ['Freezer', 'Fridge', 'Pantry', 'Cabinet', 'Spice Rack'],
  inventory: [],
  recipes: [],
  shoppingList: []
};

function ensureFile() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
  }
}

function load() {
  ensureFile();
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  try {
    const data = JSON.parse(raw);
    // Backfill any keys added in later versions of the app.
    return { ...DEFAULT_DATA, ...data };
  } catch (err) {
    throw new Error(`Data file at ${DB_FILE} is corrupted: ${err.message}`);
  }
}

function save(data) {
  // Write to a temp file first and rename, so a crash mid-write can't leave
  // behind a half-written, unparsable db.json.
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  fs.renameSync(tmpFile, DB_FILE);
}

/**
 * Run `mutator(data)` against the current data, persist the (possibly
 * mutated) result, and return whatever `mutator` returned. Use this for any
 * read-modify-write so callers can't forget to save.
 */
function transact(mutator) {
  const data = load();
  const result = mutator(data);
  save(data);
  return result;
}

module.exports = { load, save, transact, DB_FILE };
