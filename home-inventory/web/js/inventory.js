let allItems = [];

async function loadLocations() {
  const locations = await api.locations.list();
  const datalist = document.getElementById('locationOptions');
  const filter = document.getElementById('locationFilter');
  datalist.innerHTML = locations.map((l) => `<option value="${escapeHtml(l)}">`).join('');
  filter.innerHTML =
    '<option value="">All locations</option>' +
    locations.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
}

function isExpiringSoon(dateStr) {
  if (!dateStr) return false;
  const days = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24);
  return days <= 3;
}

function renderInventory() {
  const search = document.getElementById('searchBox').value.trim().toLowerCase();
  const locationFilter = document.getElementById('locationFilter').value;

  const filtered = allItems.filter((i) => {
    if (locationFilter && i.location !== locationFilter) return false;
    if (search && !i.name.toLowerCase().includes(search)) return false;
    return true;
  });

  const container = document.getElementById('inventoryByLocation');
  if (filtered.length === 0) {
    container.innerHTML = '<p class="empty-state">No items match. Try adding one above.</p>';
    return;
  }

  const byLocation = {};
  for (const item of filtered) {
    (byLocation[item.location] ||= []).push(item);
  }

  container.innerHTML = Object.entries(byLocation)
    .map(([location, items]) => {
      const rows = items
        .map((i) => {
          const lowStock = i.lowStockThreshold != null && i.quantity <= i.lowStockThreshold;
          const expiring = isExpiringSoon(i.expiryDate);
          const rowClass = expiring ? 'expiring' : lowStock ? 'low-stock' : '';
          return `
            <tr class="${rowClass}" data-id="${i.id}">
              <td>${escapeHtml(i.name)}${i.category ? `<div class="settings-note">${escapeHtml(i.category)}</div>` : ''}</td>
              <td>
                <button class="icon-btn adjust" data-delta="-1">-</button>
                <strong>${i.quantity}</strong> ${escapeHtml(i.unit)}
                <button class="icon-btn adjust" data-delta="1">+</button>
              </td>
              <td>${i.expiryDate ? escapeHtml(i.expiryDate) : '-'}
                ${expiring ? '<span class="badge danger">expiring soon</span>' : ''}
                ${lowStock && !expiring ? '<span class="badge warn">low stock</span>' : ''}
              </td>
              <td><button class="danger remove">Remove</button></td>
            </tr>`;
        })
        .join('');

      return `
        <div class="card">
          <h3>${escapeHtml(location)}</h3>
          <table>
            <thead><tr><th>Item</th><th>Quantity</th><th>Expiry</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    })
    .join('');

  container.querySelectorAll('tr[data-id]').forEach((row) => {
    const id = row.dataset.id;
    row.querySelectorAll('.adjust').forEach((btn) => {
      btn.addEventListener('click', () =>
        withErrorToast(api.inventory.adjust(id, Number(btn.dataset.delta))).then(refresh)
      );
    });
    row.querySelector('.remove').addEventListener('click', () => {
      if (!confirm('Remove this item from inventory?')) return;
      withErrorToast(api.inventory.remove(id)).then(refresh);
    });
  });
}

async function refresh() {
  allItems = await api.inventory.list();
  renderInventory();
}

document.getElementById('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const item = {
    name: document.getElementById('name').value,
    quantity: document.getElementById('quantity').value,
    unit: document.getElementById('unit').value,
    location: document.getElementById('location').value,
    category: document.getElementById('category').value,
    expiryDate: document.getElementById('expiryDate').value || null,
    lowStockThreshold: document.getElementById('lowStockThreshold').value || null
  };
  try {
    await api.inventory.create(item);
    showToast(`Added ${item.name}`);
    e.target.reset();
    document.getElementById('quantity').value = 1;
    document.getElementById('unit').value = 'item';
    await refresh();
    await loadLocations();
  } catch (err) {
    showToast(err.message, true);
  }
});

document.getElementById('searchBox').addEventListener('input', renderInventory);
document.getElementById('locationFilter').addEventListener('change', renderInventory);

document.addEventListener('DOMContentLoaded', async () => {
  await loadLocations();
  await refresh();
});
