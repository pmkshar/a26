// Auth utilities for A26 game
// Supports two access modes:
//   1. GUEST  — anyone can play with UNLIMITED trial coins. Guests can deal
//               cards and watch the game, but the betting panel is locked.
//               To place actual bets, they must register.
//   2. PLAYER — registered user with a server-backed balance. Required for
//               placing real bets. Login/register at /login.html.
const API_BASE = '';
const GUEST_BALANCE_KEY = 'a26_guest_balance';
const GUEST_NAME_KEY = 'a26_guest_name';
// Guests have unlimited coins for "playing" (dealing, watching) — but the
// betting panel is locked, so the balance is purely cosmetic. We store a
// big sentinel so existing arithmetic in game.js still works if needed.
const GUEST_BALANCE_SENTINEL = 999999999;

const Auth = {
  getToken() {
    return localStorage.getItem('a26_token');
  },

  getUser() {
    const data = localStorage.getItem('a26_user');
    return data ? JSON.parse(data) : null;
  },

  setAuth(token, user) {
    localStorage.setItem('a26_token', token);
    localStorage.setItem('a26_user', JSON.stringify(user));
  },

  logout() {
    localStorage.removeItem('a26_token');
    localStorage.removeItem('a26_user');
    window.location.href = '/login.html';
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  isAdmin() {
    const user = this.getUser();
    return user && user.role === 'admin';
  },

  // === GUEST MODE ===
  isGuest() {
    return !this.isLoggedIn();
  },

  // Returns the guest balance. Always unlimited (the sentinel). We keep the
  // localStorage entry for backward-compat with older clients.
  getGuestBalance() {
    let raw = localStorage.getItem(GUEST_BALANCE_KEY);
    if (raw === null || isNaN(parseInt(raw, 10))) {
      localStorage.setItem(GUEST_BALANCE_KEY, String(GUEST_BALANCE_SENTINEL));
    }
    return GUEST_BALANCE_SENTINEL;
  },

  setGuestBalance(amount) {
    // No-op for guests — their balance is always unlimited. Kept for
    // backward-compat with code that calls this on every bet/clear.
    return GUEST_BALANCE_SENTINEL;
  },

  refillGuestBalance() {
    return GUEST_BALANCE_SENTINEL;
  },

  // Whether the guest balance should be shown as "∞" in the UI.
  isGuestBalanceUnlimited() {
    return true;
  },

  // Generate / retrieve a friendly guest display name like "Guest_3847"
  getGuestName() {
    let name = localStorage.getItem(GUEST_NAME_KEY);
    if (!name) {
      const id = Math.floor(1000 + Math.random() * 9000);
      name = 'Guest_' + id;
      localStorage.setItem(GUEST_NAME_KEY, name);
    }
    return name;
  },

  // Soft-require auth: never redirect away from the game. The game JS will
  // branch on guest vs. registered user.
  requireAuth() { /* no-op — game is open to guests */ },
  requireAdmin() {
    if (!this.isLoggedIn()) {
      window.location.href = '/login.html';
    } else if (!this.isAdmin()) {
      window.location.href = '/dashboard.html';
    }
  },

  async api(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers
    };

    const res = await fetch(API_BASE + endpoint, { ...options, headers });
    const data = await res.json();

    if (res.status === 401 || res.status === 403) {
      this.logout();
      throw new Error('Session expired');
    }

    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  },

  // Format a balance for display. Guests show "∞"; registered users show ₹X.
  formatBalance(amount) {
    if (this.isGuest()) return '\u221E'; // ∞
    return '\u20B9' + Number(amount || 0).toLocaleString('en-IN');
  },

  // === NAV BAR UPDATE ===
  updateNav() {
    const navUser = document.getElementById('nav-user');
    const navBalance = document.getElementById('nav-balance');
    const navModeBadge = document.getElementById('navModeBadge');
    const navLogout = document.getElementById('nav-logout');
    const navLogin = document.getElementById('nav-login');
    const navAdmin = document.getElementById('nav-admin');
    const navDashboard = document.getElementById('nav-dashboard');
    const trialBanner = document.getElementById('trialBanner');

    if (this.isLoggedIn()) {
      const user = this.getUser();
      // Registered user nav
      if (navUser) navUser.textContent = user.username;
      if (navBalance) navBalance.textContent = '\u20B9' + (user.balance || 0).toLocaleString('en-IN');
      if (navModeBadge) {
        navModeBadge.style.display = '';
        navModeBadge.textContent = user.role === 'admin' ? 'ADMIN' : 'REAL';
        navModeBadge.classList.add('real');
      }
      if (navLogout) navLogout.style.display = '';
      if (navLogin) navLogin.style.display = 'none';
      if (navDashboard) navDashboard.style.display = '';
      if (navAdmin) navAdmin.style.display = (user.role === 'admin') ? '' : 'none';
      if (trialBanner) trialBanner.style.display = 'none';

      if (navLogout && !navLogout.dataset.bound) {
        navLogout.addEventListener('click', (e) => {
          e.preventDefault();
          this.logout();
        });
        navLogout.dataset.bound = '1';
      }
    } else {
      // Guest nav — show "∞" balance and TRIAL badge
      const guestName = this.getGuestName();
      if (navUser) navUser.textContent = guestName;
      if (navBalance) navBalance.textContent = '\u221E'; // ∞
      if (navModeBadge) {
        navModeBadge.style.display = '';
        navModeBadge.textContent = 'TRIAL';
        navModeBadge.classList.remove('real');
      }
      if (navLogout) navLogout.style.display = 'none';
      if (navLogin) navLogin.style.display = '';
      if (navDashboard) navDashboard.style.display = 'none';
      if (navAdmin) navAdmin.style.display = 'none';
      if (trialBanner) trialBanner.style.display = '';
    }
  },

  formatINR(amount) {
    return '\u20B9' + Number(amount).toLocaleString('en-IN');
  }
};
