// Main menu, frog shop and saved frogspawn wallet. Progress is cosmetic, so it lives in localStorage.
import { SKINS } from './shared/skins.mjs';

const KEY = 'tadpole-tag:progress';

function loadProgress() {
  let saved = {};
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') saved = raw;
  } catch { saved = {}; }
  const valid = (i) => Number.isInteger(i) && i >= 0 && i < SKINS.length;
  const owned = new Set(Array.isArray(saved.owned) ? saved.owned.filter(valid) : []);
  owned.add(0);
  const equipped = valid(saved.equipped) && owned.has(saved.equipped) ? saved.equipped : 0;
  const wallet = Math.max(0, Math.floor(Number(saved.wallet) || 0));
  return { wallet, owned, equipped };
}

export function createMenu({ onEquip, onPlay } = {}) {
  const progress = loadProgress();
  const el = {
    root: document.getElementById('menu'),
    main: document.getElementById('menu-main'),
    shop: document.getElementById('menu-shop'),
    grid: document.getElementById('shop-grid'),
    wallets: [...document.querySelectorAll('[data-wallet]')],
    play: document.getElementById('play-btn'),
    openShop: document.getElementById('open-shop-btn'),
    back: document.getElementById('shop-back-btn'),
    menuBtn: document.getElementById('menu-btn'),
  };
  let open = true;

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        wallet: progress.wallet, owned: [...progress.owned], equipped: progress.equipped,
      }));
    } catch { /* storage may be unavailable; progress lasts this session only */ }
  }

  function renderWallets() {
    for (const w of el.wallets) w.textContent = String(progress.wallet);
  }

  function renderShop() {
    el.grid.innerHTML = '';
    SKINS.forEach((skin, i) => {
      const owned = progress.owned.has(i);
      const equipped = progress.equipped === i;
      const card = document.createElement('div');
      card.className = `flex flex-col items-center gap-2 rounded-xl bg-white/5 p-3 ${equipped ? 'ring-2 ring-emerald-300' : ''}`;
      const swatch = document.createElement('div');
      swatch.className = 'h-10 w-16 rounded-full shadow-inner';
      swatch.style.background = skin.color;
      const name = document.createElement('div');
      name.className = 'text-xs font-bold text-white';
      name.textContent = skin.name;
      const btn = document.createElement('button');
      btn.dataset.skin = String(i);
      btn.className = 'w-full rounded-lg px-2 py-1 text-xs font-bold disabled:opacity-50';
      if (equipped) {
        btn.textContent = 'Equipped';
        btn.disabled = true;
        btn.className += ' bg-emerald-300 text-emerald-950';
      } else if (owned) {
        btn.textContent = 'Equip';
        btn.className += ' bg-white/80 text-slate-900 hover:bg-white';
      } else {
        btn.textContent = `Buy · ${skin.price}`;
        btn.disabled = progress.wallet < skin.price;
        btn.className += ' bg-amber-300 text-amber-950 hover:bg-amber-200';
      }
      card.append(swatch, name, btn);
      el.grid.append(card);
    });
  }

  function refresh() {
    renderWallets();
    renderShop();
    el.root.classList.toggle('hidden', !open);
    el.main.classList.toggle('hidden', !open);
    el.shop.classList.add('hidden');
    el.menuBtn?.classList.toggle('hidden', open);
  }

  function setOpen(v) {
    open = v;
    refresh();
  }

  function showShop() {
    el.main.classList.add('hidden');
    el.shop.classList.remove('hidden');
    renderShop();
  }

  function equip(i) {
    progress.equipped = i;
    persist();
    renderShop();
    onEquip?.(i);
  }

  el.grid.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-skin]');
    if (!btn || btn.disabled) return;
    const i = Number(btn.dataset.skin);
    const skin = SKINS[i];
    if (!progress.owned.has(i)) {
      if (progress.wallet < skin.price) return;
      progress.wallet -= skin.price;
      progress.owned.add(i);
      renderWallets();
    }
    equip(i);
  });
  el.play.addEventListener('click', () => { setOpen(false); onPlay?.(); });
  el.openShop.addEventListener('click', showShop);
  el.back.addEventListener('click', () => refresh());
  el.menuBtn?.addEventListener('click', () => setOpen(true));

  refresh();

  return {
    isOpen: () => open,
    setOpen,
    equipped: () => progress.equipped,
    credit(n) {
      if (!n) return;
      progress.wallet += n;
      persist();
      renderWallets();
    },
  };
}
