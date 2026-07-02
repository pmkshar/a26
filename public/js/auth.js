// Auth utilities for A26 game
// Supports two access modes:
//   1. GUEST  — anyone can play with 5,000 trial coins (stored in localStorage).
//               No login required. Bets and wins update the local trial balance.
//   2. PLAYER — registered user with a server-backed balance. Required only for
//               "real money" play. Login/register at /login.html.
const API_BASE = '';
const GUEST_TRIAL_BALANCE = 5000;
const GUEST_BALANCE_KEY = 'a26_guest_balance';
const GUEST_NAME_KEY = 'a26_guest_name';

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
    // Keep the guest balance so the user can resume trial play after logout
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

  // Returns the current guest balance (defaults to GUEST_TRIAL_BALANCE on first visit)
  getGuestBalance() {
    const raw = localStorage.getItem(GUEST_BALANCE_KEY);
    if (raw === null) {
      localStorage.setItem(GUEST_BALANCE_KEY, String(GUEST_TRIAL_BALANCE));
      return GUEST_TRIAL_BALANCE;
    }
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : GUEST_TRIAL_BALANCE;
  },

  setGuestBalance(amount) {
    const n = Math.max(0, Math.floor(amount || 0));
    localStorage.setItem(GUEST_BALANCE_KEY, String(n));
    return n;
  },

  // Refill the trial balance (called when the user clicks "Get 5,000 more")
  refillGuestBalance() {
    return this.setGuestBalance(GUEST_TRIAL_BALANCE);
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

  // === NAV BAR UPDATE ===
  // Now also handles guest mode: shows "Login / Register" link and a TRIAL
  // badge instead of username/balance.
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
      // Guest nav
      const guestName = this.getGuestName();
      const guestBal = this.getGuestBalance();
      if (navUser) navUser.textContent = guestName;
      if (navBalance) navBalance.textContent = '\u20B9' + guestBal.toLocaleString('en-IN');
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
