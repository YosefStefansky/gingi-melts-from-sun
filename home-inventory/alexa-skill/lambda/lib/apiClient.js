// Talks to the Home Inventory REST API (see ../../server). Uses the global
// `fetch` available in the Lambda Node.js 18+ runtime, so there's no HTTP
// library dependency to bundle.

function baseUrl() {
  const url = process.env.API_BASE_URL;
  if (!url) throw new Error('API_BASE_URL environment variable is not set.');
  return url.replace(/\/$/, '');
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.API_KEY) headers['x-api-key'] = process.env.API_KEY;

  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  if (res.status === 204) return null;

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const message = (data && data.error) || `Request to ${path} failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

const apiClient = {
  // Inventory
  lookupInventory: (name) => request('GET', `/api/inventory/lookup?name=${encodeURIComponent(name)}`),
  createInventoryItem: (item) => request('POST', '/api/inventory', item),
  adjustInventoryItem: (id, delta) => request('POST', `/api/inventory/${id}/adjust`, { delta }),

  // Recipes
  lookupRecipe: (name) => request('GET', `/api/recipes/lookup?name=${encodeURIComponent(name)}`),
  submitMenu: (recipeIds) => request('POST', '/api/menu/submit', { recipeIds }),

  // Shopping list
  listShoppingList: (checked) =>
    request('GET', `/api/shopping-list${checked != null ? `?checked=${checked}` : ''}`),
  findShoppingListItem: (name) =>
    request('GET', `/api/shopping-list?checked=false&search=${encodeURIComponent(name)}`),
  addShoppingListItem: (item) => request('POST', '/api/shopping-list', item),
  removeShoppingListItem: (id) => request('DELETE', `/api/shopping-list/${id}`),
  clearCheckedItems: () => request('POST', '/api/shopping-list/clear-checked')
};

module.exports = apiClient;
