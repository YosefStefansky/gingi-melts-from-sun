const express = require('express');
const { transact } = require('../db');

const router = express.Router();

// GET /api/locations
router.get('/', (req, res) => {
  const { locations } = transact((data) => data);
  res.json(locations);
});

// POST /api/locations  { name }
router.post('/', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });

  const locations = transact((data) => {
    const exists = data.locations.some((l) => l.toLowerCase() === name.toLowerCase());
    if (!exists) data.locations.push(name);
    return data.locations;
  });
  res.status(201).json(locations);
});

module.exports = router;
