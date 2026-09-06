async function loadDashboard() {
  try {
    const [inventory, lowStock, shoppingList, recipes] = await Promise.all([
      api.inventory.list(),
      api.inventory.list('?lowStock=true'),
      api.shoppingList.list('?checked=false'),
      api.recipes.list()
    ]);

    const stats = document.querySelectorAll('#statGrid .value');
    stats[0].textContent = inventory.length;
    stats[1].textContent = lowStock.length;
    stats[2].textContent = shoppingList.length;
    stats[3].textContent = recipes.length;

    const lowStockEl = document.getElementById('lowStockList');
    lowStockEl.innerHTML = lowStock.length
      ? `<table><thead><tr><th>Item</th><th>Location</th><th>Quantity</th><th>Threshold</th></tr></thead><tbody>${lowStock
          .map(
            (i) =>
              `<tr><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.location)}</td><td>${i.quantity} ${escapeHtml(i.unit)}</td><td>${i.lowStockThreshold}</td></tr>`
          )
          .join('')}</tbody></table>`
      : '<p class="empty-state">Nothing is running low. 🎉</p>';

    const shoppingEl = document.getElementById('shoppingPreview');
    const preview = shoppingList.slice(0, 8);
    shoppingEl.innerHTML = preview.length
      ? `<ul>${preview
          .map((i) => `<li>${i.quantity} ${escapeHtml(i.unit)} ${escapeHtml(i.name)}</li>`)
          .join('')}</ul>${shoppingList.length > 8 ? `<p class="settings-note">+${shoppingList.length - 8} more</p>` : ''}`
      : '<p class="empty-state">Your shopping list is empty.</p>';
  } catch (err) {
    showToast(err.message, true);
  }
}

document.addEventListener('DOMContentLoaded', loadDashboard);
