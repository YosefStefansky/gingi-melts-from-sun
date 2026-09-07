const express = require('express');
const { transact } = require('../db');
const { newId } = require('../lib/id');
const { namesMatch, findByName } = require('../lib/matching');
const { asyncHandler } = require('../lib/asyncHandler');

const router = express.Router();

/**
 * Combine every ingredient across the chosen recipes into one
 * "how much of each thing do I need" list, scaling each recipe by
 * multiplier / recipe.servings when a target serving count is given.
 */
function combineIngredients(recipes, multiplierByRecipeId) {
  const needed = []; // [{ name, unit, quantity }]

  for (const recipe of recipes) {
    const multiplier = multiplierByRecipeId.get(recipe.id) ?? 1;
    for (const ing of recipe.ingredients) {
      const scaledQty = ing.quantity * multiplier;
      const existing = needed.find((n) => namesMatch(n.name, ing.name) && n.unit === ing.unit);
      if (existing) {
        existing.quantity += scaledQty;
      } else {
        needed.push({ name: ing.name, unit: ing.unit, quantity: scaledQty });
      }
    }
  }
  return needed;
}

// POST /api/menu/submit
// body: { recipeIds: ["recipe_..."], servings: { "recipe_...": 6 } }
// `servings` is optional per-recipe target serving count; omit to use the
// recipe's own serving size (multiplier 1).
router.post(
  '/submit',
  asyncHandler(async (req, res) => {
    const { recipeIds, servings } = req.body || {};
    if (!Array.isArray(recipeIds) || recipeIds.length === 0) {
      return res.status(400).json({ error: 'recipeIds must be a non-empty array' });
    }

    const result = await transact((data) => {
      const chosen = recipeIds.map((id) => data.recipes.find((r) => r.id === id)).filter(Boolean);

      if (chosen.length === 0) return { error: 'not_found' };

      const multiplierByRecipeId = new Map();
      for (const recipe of chosen) {
        const targetServings = servings && servings[recipe.id];
        const multiplier =
          targetServings && recipe.servings ? Number(targetServings) / recipe.servings : 1;
        multiplierByRecipeId.set(recipe.id, multiplier);
      }

      const needed = combineIngredients(chosen, multiplierByRecipeId);

      const added = [];
      const alreadyHave = [];

      for (const need of needed) {
        const inStock = findByName(data.inventory, need.name)
          .filter((i) => i.unit === need.unit)
          .reduce((sum, i) => sum + i.quantity, 0);

        const shortfall = need.quantity - inStock;

        if (shortfall <= 0) {
          alreadyHave.push({ name: need.name, unit: need.unit, needed: need.quantity, inStock });
          continue;
        }

        // Merge into an existing (unchecked) shopping list entry for the same
        // item/unit instead of creating a duplicate line.
        const existingLine = data.shoppingList.find(
          (i) => !i.checked && namesMatch(i.name, need.name) && i.unit === need.unit
        );
        if (existingLine) {
          existingLine.quantity += shortfall;
          added.push(existingLine);
        } else {
          const item = {
            id: newId('sl'),
            name: need.name,
            quantity: Math.round(shortfall * 100) / 100,
            unit: need.unit,
            note: `For menu: ${chosen.map((r) => r.name).join(', ')}`,
            source: 'menu',
            checked: false,
            createdAt: new Date().toISOString()
          };
          data.shoppingList.push(item);
          added.push(item);
        }
      }

      return { recipes: chosen.map((r) => ({ id: r.id, name: r.name })), added, alreadyHave };
    });

    if (result.error === 'not_found') {
      return res.status(404).json({ error: 'None of the given recipeIds were found' });
    }
    res.status(201).json(result);
  })
);

module.exports = router;
