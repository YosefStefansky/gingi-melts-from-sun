// Item names come from three different sources - the web form, a recipe
// ingredient list, and Alexa's speech-to-text - so matching them up needs to
// be forgiving about case, whitespace, plurals and punctuation.

function normalize(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

// Very small English plural stemmer - good enough to match "onions" against
// "onion", "tomatoes" against "tomato", etc. Not linguistically complete, but
// this is a matching heuristic, not a spellchecker.
function stem(word) {
  if (word.endsWith('ies') && word.length > 3) return `${word.slice(0, -3)}y`;
  if (word.endsWith('oes') && word.length > 3) return word.slice(0, -2);
  if (word.endsWith('es') && word.length > 3) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
  return word;
}

function stemName(name) {
  return normalize(name)
    .split(' ')
    .map(stem)
    .join(' ');
}

/** True when two item names should be treated as "the same thing". */
function namesMatch(a, b) {
  if (!a || !b) return false;
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  return stemName(a) === stemName(b);
}

/** Find inventory rows (or any {name} records) matching a given name. */
function findByName(records, name) {
  return records.filter((r) => namesMatch(r.name, name));
}

module.exports = { normalize, stemName, namesMatch, findByName };
