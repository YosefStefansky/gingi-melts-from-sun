const express = require('express');
const { transact } = require('../db');
const { newId } = require('../lib/id');
const { findByName, namesMatch } = require('../lib/matching');

const router = express.Router();

// GET /api/shopping-list?checked=false&search=milk
router.get('/', (req, res) => {
  const { checked, search } = req.query;
  const { shoppingList } = transact((data) => data);

  let results = shoppingList;
  if (checked === 'true') results = results.filter((i) => i.checked);
  if (checked === 'false') results = results.filter((i) => !i.checked);
  if (search) results = results.filter((i) => namesMatch(i.name, String(search)));

  res.json(results);
});

// POST /api/shopping-list  { name, quantity, unit, note } - "add on demand"
router.post('/', (req, res) => {
  const { name, quantity, unit, note, source } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });

  const item = {
    id: newId('sl'),
    name: String(name).trim(),
    quantity: quantity != null ? Number(quantity) : 1,
    unit: unit ? String(unit).trim() : 'item',
    note: note ? String(note).trim() : '',
    source: source === 'menu' ? 'menu' : 'manual',
    checked: false,
    createdAt: new Date().toISOString()
  };

  transact((data) => data.shoppingList.push(item));
  res.status(201).json(item);
});

// PUT /api/shopping-list/:id  - edit fields and/or toggle checked
router.put('/:id', (req, res) => {
  const updated = transact((data) => {
    const item = data.shoppingList.find((i) => i.id === req.params.id);
    if (!item) return null;
    const { name, quantity, unit, note, checked } = req.body || {};
    if (name != null) item.name = String(name).trim();
    if (quantity != null) item.quantity = Number(quantity);
    if (unit != null) item.unit = String(unit).trim();
    if (note != null) item.note = String(note).trim();
    if (checked != null) item.checked = Boolean(checked);
    return item;
  });

  if (!updated) return res.status(404).json({ error: 'Shopping list item not found' });
  res.json(updated);
});

// POST /api/shopping-list/:id/purchase  { location }
// Marks the item checked and (optionally) folds it straight into inventory,
// so buying something closes the loop back to "what do I have".
router.post('/:id/purchase', (req, res) => {
  const location = req.body?.location ? String(req.body.location).trim() : null;

  const result = transact((data) => {
    const item = data.shoppingList.find((i) => i.id === req.params.id);
    if (!item) return null;
    item.checked = true;

    let inventoryItem = null;
    if (location) {
      const [existing] = findByName(data.inventory, item.name).filter(
        (i) => i.location.toLowerCase() === location.toLowerCase() && i.unit === item.unit
      );
      if (existing) {
        existing.quantity += item.quantity;
        existing.updatedAt = new Date().toISOString();
        inventoryItem = existing;
      } else {
        inventoryItem = {
          id: newId('inv'),
          name: item.name,
          category: '',
          location,
          quantity: item.quantity,
          unit: item.unit,
          expiryDate: null,
          lowStockThreshold: null,
          updatedAt: new Date().toISOString()
        };
        data.inventory.push(inventoryItem);
        if (!data.locations.some((l) => l.toLowerCase() === location.toLowerCase())) {
          data.locations.push(location);
        }
      }
    }
    return { shoppingListItem: item, inventoryItem };
  });

  if (!result) return res.status(404).json({ error: 'Shopping list item not found' });
  res.json(result);
});

// POST /api/shopping-list/clear-checked
router.post('/clear-checked', (req, res) => {
  const remaining = transact((data) => {
    data.shoppingList = data.shoppingList.filter((i) => !i.checked);
    return data.shoppingList;
  });
  res.json(remaining);
});

// DELETE /api/shopping-list/:id
router.delete('/:id', (req, res) => {
  const removed = transact((data) => {
    const idx = data.shoppingList.findIndex((i) => i.id === req.params.id);
    if (idx === -1) return false;
    data.shoppingList.splice(idx, 1);
    return true;
  });

  if (!removed) return res.status(404).json({ error: 'Shopping list item not found' });
  res.status(204).end();
});

module.exports = router;
