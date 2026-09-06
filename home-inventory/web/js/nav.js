// Renders the sidebar. Each page sets <body data-page="inventory"> etc. so
// this can highlight the current section without duplicating the nav markup
// in every HTML file.

function renderNav() {
  const page = document.body.dataset.page || '';
  const items = [
    { key: 'dashboard', href: 'index.html', icon: '🏠', label: 'Dashboard' },
    { key: 'inventory', href: 'inventory.html', icon: '📦', label: 'Inventory' },
    { key: 'recipes', href: 'recipes.html', icon: '🍽️', label: 'Recipes & Menus' },
    { key: 'shopping-list', href: 'shopping-list.html', icon: '🛒', label: 'Shopping List' },
    { key: 'settings', href: 'settings.html', icon: '⚙️', label: 'Settings' }
  ];

  const nav = document.createElement('aside');
  nav.className = 'sidebar';
  nav.innerHTML = `
    <div class="brand">🏡 Home Inventory</div>
    ${items
      .map(
        (item) =>
          `<a href="${item.href}" class="${item.key === page ? 'active' : ''}">
             <span>${item.icon}</span><span>${item.label}</span>
           </a>`
      )
      .join('')}
  `;

  const shell = document.querySelector('.app-shell');
  shell.insertBefore(nav, shell.firstChild);
}

document.addEventListener('DOMContentLoaded', renderNav);
