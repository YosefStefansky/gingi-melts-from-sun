// Optional shared-secret auth. This app has no user accounts - it's one
// household's data - so the only thing worth protecting against is the API
// being open to the entire internet once it's deployed somewhere public
// (which it has to be, for Alexa to reach it). Set API_KEY to turn this on;
// leave it blank for local development.

function apiKeyAuth(req, res, next) {
  const required = process.env.API_KEY;
  if (!required) return next();

  const provided = req.get('x-api-key');
  if (provided && provided === required) return next();

  res.status(401).json({ error: 'Missing or invalid x-api-key header.' });
}

module.exports = { apiKeyAuth };
