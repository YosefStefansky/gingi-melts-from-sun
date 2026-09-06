let allShoppingItems = [];

function renderList() {
  const container = document.getElementById('listContainer');
  if (allShoppingItems.length === 0) {
    container.innerHTML = '<p class="empty-state">Your shopping list is empty.</p>';
    return;
  }

  const unchecked = allShoppingItems.filter((i) => !i.checked);
  const checked = allShoppingItems.filter((i) => i.checked);

  const row = (i) => `
    <tr class="${i.checked ? 'checked-row' : ''}" data-id="${i.id}">
      <td><input type="checkbox" class="toggle-checked" ${i.checked ? 'checked' : ''}></td>
      <td>${escapeHtml(i.name)} ${i.source === 'menu' ? '<span class="badge">from menu</span>' : ''}</td>
      <td>${i.quantity} ${escapeHtml(i.unit)}</td>
      <td>${escapeHtml(i.note || '')}</td>
      <td><button class="danger remove">Remove</button></td>
    </tr>`;

  container.innerHTML = `
    <div class="card">
      <table>
        <thead><tr><th></th><th>Item</th><th>Qty</th><th>Note</th><th></th></tr></thead>
        <tbody>
          ${unchecked.map(row).join('')}
          ${checked.map(row).join('')}
        </tbody>
      </table>
    </div>`;

  container.querySelectorAll('tr[data-id]').forEach((tr) => {
    const id = tr.dataset.id;
    tr.querySelector('.toggle-checked').addEventListener('change', async (e) => {
      if (e.target.checked) {
        const location = prompt(
          "Where did you put it? (Leave blank to just check it off without updating inventory)"
        );
        if (location) {
          await withErrorToast(api.shoppingList.purchase(id, location));
        } else if (location === '') {
          await withErrorToast(api.shoppingList.purchase(id, null));
        } else {
          // Cancelled - revert the checkbox.
          e.target.checked = false;
          return;
        }
      } else {
        await withErrorToast(api.shoppingList.update(id, { checked: false }));
      }
      await refresh();
    });
    tr.querySelector('.remove').addEventListener('click', () => {
      withErrorToast(api.shoppingList.remove(id)).then(refresh);
    });
  });
}

document.getElementById('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const item = {
    name: document.getElementById('name').value,
    quantity: document.getElementById('quantity').value,
    unit: document.getElementById('unit').value,
    note: document.getElementById('note').value
  };
  try {
    await api.shoppingList.create(item);
    showToast(`Added ${item.name} to shopping list`);
    e.target.reset();
    document.getElementById('quantity').value = 1;
    document.getElementById('unit').value = 'item';
    await refresh();
  } catch (err) {
    showToast(err.message, true);
  }
});

document.getElementById('clearCheckedBtn').addEventListener('click', async () => {
  await withErrorToast(api.shoppingList.clearChecked());
  showToast('Cleared checked items');
  await refresh();
});

async function refresh() {
  allShoppingItems = await api.shoppingList.list();
  renderList();
}

document.addEventListener('DOMContentLoaded', refresh);
