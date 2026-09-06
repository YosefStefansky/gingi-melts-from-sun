let allRecipes = [];

function addIngredientRow(prefill) {
  const row = document.createElement('div');
  row.className = 'ingredient-row';
  row.innerHTML = `
    <input class="ing-name" placeholder="Ingredient name" value="${escapeHtml(prefill?.name || '')}">
    <input class="ing-qty" type="number" step="any" placeholder="Qty" value="${prefill?.quantity ?? 1}">
    <input class="ing-unit" placeholder="Unit" value="${escapeHtml(prefill?.unit || 'item')}">
    <button type="button" class="icon-btn remove-ing">Remove</button>
  `;
  row.querySelector('.remove-ing').addEventListener('click', () => row.remove());
  document.getElementById('ingredientRows').appendChild(row);
}

document.getElementById('addIngredientRow').addEventListener('click', () => addIngredientRow());

document.getElementById('recipeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ingredients = [...document.querySelectorAll('#ingredientRows .ingredient-row')]
    .map((row) => ({
      name: row.querySelector('.ing-name').value,
      quantity: row.querySelector('.ing-qty').value,
      unit: row.querySelector('.ing-unit').value
    }))
    .filter((i) => i.name.trim());

  if (ingredients.length === 0) {
    showToast('Add at least one ingredient', true);
    return;
  }

  try {
    await api.recipes.create({
      name: document.getElementById('recipeName').value,
      servings: document.getElementById('recipeServings').value,
      ingredients
    });
    showToast('Recipe saved');
    e.target.reset();
    document.getElementById('ingredientRows').innerHTML = '';
    addIngredientRow();
    document.getElementById('recipeServings').value = 4;
    await refresh();
  } catch (err) {
    showToast(err.message, true);
  }
});

function renderRecipePickList() {
  const list = document.getElementById('recipePickList');
  if (allRecipes.length === 0) {
    list.innerHTML = '<p class="empty-state">Save a recipe above to build a menu.</p>';
    return;
  }
  list.innerHTML = allRecipes
    .map(
      (r) => `
      <label class="recipe-row">
        <input type="checkbox" class="menu-pick" value="${r.id}">
        <span class="grow">${escapeHtml(r.name)} <span class="settings-note">(serves ${r.servings})</span></span>
      </label>`
    )
    .join('');
}

function renderRecipeCards() {
  const container = document.getElementById('recipeCards');
  if (allRecipes.length === 0) {
    container.innerHTML = '<p class="empty-state">No recipes saved yet.</p>';
    return;
  }
  container.innerHTML = allRecipes
    .map(
      (r) => `
      <div class="card" data-id="${r.id}">
        <div class="page-header">
          <h3>${escapeHtml(r.name)} <span class="settings-note">(serves ${r.servings})</span></h3>
          <button class="danger remove-recipe">Delete</button>
        </div>
        <ul>
          ${r.ingredients.map((i) => `<li>${i.quantity} ${escapeHtml(i.unit)} ${escapeHtml(i.name)}</li>`).join('')}
        </ul>
      </div>`
    )
    .join('');

  container.querySelectorAll('.remove-recipe').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('[data-id]').dataset.id;
      if (!confirm('Delete this recipe?')) return;
      await withErrorToast(api.recipes.remove(id));
      await refresh();
    });
  });
}

document.getElementById('submitMenuBtn').addEventListener('click', async () => {
  const recipeIds = [...document.querySelectorAll('.menu-pick:checked')].map((c) => c.value);
  if (recipeIds.length === 0) {
    showToast('Pick at least one recipe first', true);
    return;
  }
  try {
    const result = await api.menu.submit(recipeIds);
    const resultEl = document.getElementById('menuResult');
    resultEl.innerHTML = `
      <div class="card">
        <h4>Added to shopping list</h4>
        ${
          result.added.length
            ? `<ul>${result.added.map((i) => `<li>${i.quantity} ${escapeHtml(i.unit)} ${escapeHtml(i.name)}</li>`).join('')}</ul>`
            : '<p class="empty-state">Nothing needed - you already have everything!</p>'
        }
        ${
          result.alreadyHave.length
            ? `<p class="settings-note">Already fully stocked: ${result.alreadyHave.map((i) => escapeHtml(i.name)).join(', ')}</p>`
            : ''
        }
      </div>`;
    showToast('Shopping list updated');
  } catch (err) {
    showToast(err.message, true);
  }
});

async function refresh() {
  allRecipes = await api.recipes.list();
  renderRecipePickList();
  renderRecipeCards();
}

document.addEventListener('DOMContentLoaded', () => {
  addIngredientRow();
  refresh();
});
