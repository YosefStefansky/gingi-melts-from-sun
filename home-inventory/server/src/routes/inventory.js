const express = require('express');
const { transact } = require('../db');
const { newId } = require('../lib/id');
const { findByName, namesMatch, normalize } = require('../lib/matching');
const { asyncHandler } = require('../lib/asyncHandler');

const router = express.Router();

function serialize(item) {
  return item;
}

// GET /api/inventory?location=Freezer&search=chicken&lowStock=true
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { location, search, lowStock } = req.query;
    const { inventory } = await transact((data) => data);

    let results = inventory;
    if (location) {
      results = results.filter((i) => i.location.toLowerCase() === String(location).toLowerCase());
    }
    if (search) {
      const term = normalize(String(search));
      results = results.filter((i) => normalize(i.name).includes(term));
    }
    if (lowStock === 'true') {
      results = results.filter(
        (i) => i.lowStockThreshold != null && i.quantity <= i.lowStockThreshold
      );
    }
    res.json(results.map(serialize));
  })
);

// GET /api/inventory/lookup?name=chicken - used by Alexa's "how much X do I have?"
router.get(
  '/lookup',
  asyncHandler(async (req, res) => {
    const name = req.query.name;
    if (!name) return res.status(400).json({ error: 'name query param is required' });
    const { inventory } = await transact((data) => data);
    res.json(findByName(inventory, String(name)));
  })
);

// GET /api/inventory/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { inventory } = await transact((data) => data);
    const item = inventory.find((i) => i.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  })
);

// POST /api/inventory  { name, category, location, quantity, unit, expiryDate, lowStockThreshold }
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, category, location, quantity, unit, expiryDate, lowStockThreshold } =
      req.body || {};

    if (!name || !String(name).trim())
      return res.status(400).json({ error: 'name is required' });
    if (!location || !String(location).trim())
      return res.status(400).json({ error: 'location is required' });

    const cleanName = String(name).trim();
    const cleanLocation = String(location).trim();
    const cleanUnit = unit ? String(unit).trim() : 'item';
    const addedQuantity = quantity != null ? Number(quantity) : 1;

    const item = await transact((data) => {
      // Merging avoids ending up with five separate "chicken breast / Freezer"
      // rows every time someone restocks the same thing (a very common case
      // from voice: "I bought 2 lbs of chicken").
      const existing = data.inventory.find(
        (i) =>
          namesMatch(i.name, cleanName) &&
          i.location.toLowerCase() === cleanLocation.toLowerCase() &&
          i.unit === cleanUnit
      );

      if (existing) {
        existing.quantity += addedQuantity;
        if (category) existing.category = String(category).trim();
        if (expiryDate) existing.expiryDate = expiryDate;
        if (lowStockThreshold != null) existing.lowStockThreshold = Number(lowStockThreshold);
        existing.updatedAt = new Date().toISOString();
        return existing;
      }

      const created = {
        id: newId('inv'),
        name: cleanName,
        category: category ? String(category).trim() : '',
        location: cleanLocation,
        quantity: addedQuantity,
        unit: cleanUnit,
        expiryDate: expiryDate || null,
        lowStockThreshold: lowStockThreshold != null ? Number(lowStockThreshold) : null,
        updatedAt: new Date().toISOString()
      };
      data.inventory.push(created);
      // Learn any new location on the fly so the web UI's dropdown picks it up.
      if (!data.locations.some((l) => l.toLowerCase() === created.location.toLowerCase())) {
        data.locations.push(created.location);
      }
      return created;
    });

    res.status(201).json(item);
  })
);

// PUT /api/inventory/:id  - partial update
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const updated = await transact((data) => {
      const item = data.inventory.find((i) => i.id === req.params.id);
      if (!item) return null;

      const { name, category, location, quantity, unit, expiryDate, lowStockThreshold } =
        req.body || {};
      if (name != null) item.name = String(name).trim();
      if (category != null) item.category = String(category).trim();
      if (location != null) item.location = String(location).trim();
      if (quantity != null) item.quantity = Number(quantity);
      if (unit != null) item.unit = String(unit).trim();
      if (expiryDate !== undefined) item.expiryDate = expiryDate;
      if (lowStockThreshold !== undefined)
        item.lowStockThreshold = lowStockThreshold == null ? null : Number(lowStockThreshold);
      item.updatedAt = new Date().toISOString();
      return item;
    });

    if (!updated) return res.status(404).json({ error: 'Item not found' });
    res.json(updated);
  })
);

// POST /api/inventory/:id/adjust  { delta }  - e.g. Alexa "I used 2 eggs" -> delta: -2
router.post(
  '/:id/adjust',
  asyncHandler(async (req, res) => {
    const delta = Number(req.body?.delta);
    if (Number.isNaN(delta)) return res.status(400).json({ error: 'delta must be a number' });

    const updated = await transact((data) => {
      const item = data.inventory.find((i) => i.id === req.params.id);
      if (!item) return null;
      item.quantity = Math.max(0, item.quantity + delta);
      item.updatedAt = new Date().toISOString();
      return item;
    });

    if (!updated) return res.status(404).json({ error: 'Item not found' });
    res.json(updated);
  })
);

// DELETE /api/inventory/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const removed = await transact((data) => {
      const idx = data.inventory.findIndex((i) => i.id === req.params.id);
      if (idx === -1) return false;
      data.inventory.splice(idx, 1);
      return true;
    });

    if (!removed) return res.status(404).json({ error: 'Item not found' });
    res.status(204).end();
  })
);

module.exports = router;
