// Data store: a local JSON file by default, or Upstash Redis (a single JSON
// blob under one key) when UPSTASH_REDIS_REST_URL/TOKEN are set.
//
// This app is meant for one household - a full database engine and schema
// would be overkill - so the whole dataset is just one JSON object,
// read-modify-written as a unit through transact() below. Locally that
// object lives in a file on disk (easy to inspect/back up by hand). In
// production it needs to survive redeploys and idle spin-downs, which a
// platform's local disk generally doesn't guarantee on a free tier - so
// there it lives in Upstash's free Redis over their REST API (plain HTTPS,
// no driver or persistent connection needed, which keeps this dependency-free
// and works the same on any host).

const fs = require('fs');
const path = require('path');

const DB_FILE = path.resolve(process.cwd(), process.env.DB_FILE || './data/db.json');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_KEY = process.env.UPSTASH_REDIS_KEY || 'home-inventory:db';
const useRedis = Boolean(REDIS_URL && REDIS_TOKEN);

const DEFAULT_DATA = {
  locations: ['Freezer', 'Fridge', 'Pantry', 'Cabinet', 'Spice Rack'],
  inventory: [],
  recipes: [],
  shoppingList: []
};

async function redisCommand(command) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) {
    const detail = (body && body.error) || `HTTP ${res.status}`;
    throw new Error(`Upstash Redis request failed: ${detail}`);
  }
  return body.result;
}

function ensureFile() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
  }
}

function parseStored(raw, sourceDescription) {
  try {
    const data = JSON.parse(raw);
    // Backfill any keys added in later versions of the app.
    return { ...DEFAULT_DATA, ...data };
  } catch (err) {
    throw new Error(`Data at ${sourceDescription} is corrupted: ${err.message}`);
  }
}

async function load() {
  if (useRedis) {
    const raw = await redisCommand(['GET', REDIS_KEY]);
    if (raw == null) return { ...DEFAULT_DATA };
    return parseStored(raw, `Redis key "${REDIS_KEY}"`);
  }

  ensureFile();
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  return parseStored(raw, DB_FILE);
}

async function save(data) {
  if (useRedis) {
    await redisCommand(['SET', REDIS_KEY, JSON.stringify(data)]);
    return;
  }

  // Write to a temp file first and rename, so a crash mid-write can't leave
  // behind a half-written, unparsable db.json.
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  fs.renameSync(tmpFile, DB_FILE);
}

/**
 * Run `mutator(data)` against the current data, persist the (possibly
 * mutated) result, and return whatever `mutator` returned. Use this for any
 * read-modify-write so callers can't forget to save. `mutator` may be sync
 * or async.
 */
async function transact(mutator) {
  const data = await load();
  const result = await mutator(data);
  await save(data);
  return result;
}

module.exports = { load, save, transact, useRedis, DB_FILE };
