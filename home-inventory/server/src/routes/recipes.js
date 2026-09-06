const express = require('express');
const { transact } = require('../db');
const { newId } = require('../lib/id');
const { findByName } = require('../lib/matching');

const router = express.Router();

function cleanIngredients(ingredients) {
  if (!Array.isArray(ingredients)) return [];
  return ingredients
    .filter((i) => i && String(i.name || '').trim())
    .map((i) => ({
      name: String(i.name).trim(),
      quantity: i.quantity != null ? Number(i.quantity) : 1,
      unit: i.unit ? String(i.unit).trim() : 'item'
    }));
}

// GET /api/recipes
router.get('/', (req, res) => {
  const { recipes } = transact((data) => data);
  res.json(recipes);
});

// GET /api/recipes/lookup?name=bolognese - fuzzy match, used by Alexa
router.get('/lookup', (req, res) => {
  const name = req.query.name;
  if (!name) return res.status(400).json({ error: 'name query param is required' });
  const { recipes } = transact((data) => data);
  res.json(findByName(recipes, String(name)));
});

// GET /api/recipes/:id
router.get('/:id', (req, res) => {
  const { recipes } = transact((data) => data);
  const recipe = recipes.find((r) => r.id === req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
  res.json(recipe);
});

// POST /api/recipes  { name, servings, ingredients: [{name, quantity, unit}] }
router.post('/', (req, res) => {
  const { name, servings, ingredients } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });

  const recipe = {
    id: newId('recipe'),
    name: String(name).trim(),
    servings: servings != null ? Number(servings) : 1,
    ingredients: cleanIngredients(ingredients),
    createdAt: new Date().toISOString()
  };

  transact((data) => data.recipes.push(recipe));
  res.status(201).json(recipe);
});

// PUT /api/recipes/:id
router.put('/:id', (req, res) => {
  const updated = transact((data) => {
    const recipe = data.recipes.find((r) => r.id === req.params.id);
    if (!recipe) return null;
    const { name, servings, ingredients } = req.body || {};
    if (name != null) recipe.name = String(name).trim();
    if (servings != null) recipe.servings = Number(servings);
    if (ingredients != null) recipe.ingredients = cleanIngredients(ingredients);
    return recipe;
  });

  if (!updated) return res.status(404).json({ error: 'Recipe not found' });
  res.json(updated);
});

// DELETE /api/recipes/:id
router.delete('/:id', (req, res) => {
  const removed = transact((data) => {
    const idx = data.recipes.findIndex((r) => r.id === req.params.id);
    if (idx === -1) return false;
    data.recipes.splice(idx, 1);
    return true;
  });

  if (!removed) return res.status(404).json({ error: 'Recipe not found' });
  res.status(204).end();
});

module.exports = router;
