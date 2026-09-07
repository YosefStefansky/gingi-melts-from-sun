const express = require('express');
const { transact } = require('../db');
const { asyncHandler } = require('../lib/asyncHandler');

const router = express.Router();

// GET /api/locations
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { locations } = await transact((data) => data);
    res.json(locations);
  })
);

// POST /api/locations  { name }
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });

    const locations = await transact((data) => {
      const exists = data.locations.some((l) => l.toLowerCase() === name.toLowerCase());
      if (!exists) data.locations.push(name);
      return data.locations;
    });
    res.status(201).json(locations);
  })
);

module.exports = router;
