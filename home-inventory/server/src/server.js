require('dotenv').config();
const path = require('path');
const express = require('express');

const { apiKeyAuth } = require('./middleware/auth');
const inventoryRoutes = require('./routes/inventory');
const locationsRoutes = require('./routes/locations');
const recipesRoutes = require('./routes/recipes');
const shoppingListRoutes = require('./routes/shoppingList');
const menuRoutes = require('./routes/menu');

const app = express();
app.use(express.json());

// Basic request log - handy when watching Alexa requests come in live.
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/inventory', apiKeyAuth, inventoryRoutes);
app.use('/api/locations', apiKeyAuth, locationsRoutes);
app.use('/api/recipes', apiKeyAuth, recipesRoutes);
app.use('/api/shopping-list', apiKeyAuth, shoppingListRoutes);
app.use('/api/menu', apiKeyAuth, menuRoutes);

// Serve the web UI (same origin as the API, so no CORS setup is needed for
// the browser). The Alexa Lambda calls the /api/* routes directly over the
// internet and is the only client that needs the x-api-key header.
const webDir = path.join(__dirname, '..', '..', 'web');
app.use(express.static(webDir));

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Home Inventory server listening on http://localhost:${PORT}`);
  if (!process.env.API_KEY) {
    console.warn('API_KEY is not set - the API is unauthenticated. Fine for local dev only.');
  }
});
