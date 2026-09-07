// Express 4 doesn't catch rejected promises from async route handlers -
// an unhandled rejection there just hangs the request. Wrap every async
// handler with this so a thrown/rejected error reaches the error middleware
// in server.js instead.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
