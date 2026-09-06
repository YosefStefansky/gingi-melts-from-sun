// Thin fetch wrapper shared by every page. The web UI is served by the same
// Express server as the API (see server/src/server.js), so requests are
// same-origin and relative paths just work - no base URL or CORS config
// needed here. If you ever host the web UI separately from the API, set
// window.API_BASE below.

const API_BASE = window.API_BASE || '';

async function apiRequest(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const apiKey = localStorage.getItem('homeInventoryApiKey');
  if (apiKey) headers['x-api-key'] = apiKey;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  if (res.status === 204) return null;

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

const api = {
  get: (path) => apiRequest('GET', path),
  post: (path, body) => apiRequest('POST', path, body ?? {}),
  put: (path, body) => apiRequest('PUT', path, body ?? {}),
  del: (path) => apiRequest('DELETE', path),

  inventory: {
    list: (params = '') => api.get(`/api/inventory${params}`),
    create: (item) => api.post('/api/inventory', item),
    update: (id, patch) => api.put(`/api/inventory/${id}`, patch),
    adjust: (id, delta) => api.post(`/api/inventory/${id}/adjust`, { delta }),
    remove: (id) => api.del(`/api/inventory/${id}`)
  },
  locations: {
    list: () => api.get('/api/locations'),
    create: (name) => api.post('/api/locations', { name })
  },
  recipes: {
    list: () => api.get('/api/recipes'),
    create: (recipe) => api.post('/api/recipes', recipe),
    update: (id, patch) => api.put(`/api/recipes/${id}`, patch),
    remove: (id) => api.del(`/api/recipes/${id}`)
  },
  shoppingList: {
    list: (params = '') => api.get(`/api/shopping-list${params}`),
    create: (item) => api.post('/api/shopping-list', item),
    update: (id, patch) => api.put(`/api/shopping-list/${id}`, patch),
    purchase: (id, location) => api.post(`/api/shopping-list/${id}/purchase`, { location }),
    clearChecked: () => api.post('/api/shopping-list/clear-checked'),
    remove: (id) => api.del(`/api/shopping-list/${id}`)
  },
  menu: {
    submit: (recipeIds, servings) => api.post('/api/menu/submit', { recipeIds, servings })
  }
};

function showToast(message, isError = false) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function withErrorToast(promise) {
  return promise.catch((err) => {
    showToast(err.message || 'Something went wrong', true);
    throw err;
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
