// Auth utilities for A26 game
// Supports two access modes:
//   1. GUEST  — anyone can play with a DEMO balance of ₹50,000. Guests CAN
//               place bets to learn the game, but the balance is purely
//               demonstrative: demo winnings are NOT credited as real money
//               and the balance resets to ₹50,000 on each new visit (or when
//               it runs low). To play for real money, register an account.
//   2. PLAYER — registered user with a server-backed balance. Required for
//               real-money play. Login/register at /login.html.
const API_BASE = '';
const GUEST_BALANCE_KEY = 'a26_guest_balance';
const GUEST_NAME_KEY = 'a26_guest_name';
// Guests start with ₹50,000 DEMO coins. They can place bets to understand
// the game, but winnings are demo-only (never real money). If the demo
// balance drops below the min bet, the game refills it back to this amount.
const GUEST_DEMO_BALANCE = 50000;
const GUEST_DEMO_MIN_REFILL = 2000;

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

  // Returns the guest's current DEMO balance (persisted in localStorage so
  // it survives page refreshes within the same browser session). Defaults
  // to ₹50,000 on first visit. Clamped to a non-negative value.
  getGuestBalance() {
    let raw = localStorage.getItem(GUEST_BALANCE_KEY);
    let n = parseInt(raw, 10);
    if (isNaN(n) || n < 0) {
      n = GUEST_DEMO_BALANCE;
      localStorage.setItem(GUEST_BALANCE_KEY, String(n));
    }
    return n;
  },

  // Persist the guest's demo balance. This IS used now — guests can bet and
  // their demo balance goes up/down with wins/losses — but the value is
  // purely local (never sent to the server, never real money).
  setGuestBalance(amount) {
    const n = Math.max(0, parseInt(amount, 10) || 0);
    localStorage.setItem(GUEST_BALANCE_KEY, String(n));
    return n;
  },

  // Refill the demo balance back to ₹50,000 when it runs low. Returns the
  // new balance. Called by game.js when the guest can't afford the min bet.
  refillGuestBalance() {
    const current = this.getGuestBalance();
    if (current < GUEST_DEMO_MIN_REFILL) {
      this.setGuestBalance(GUEST_DEMO_BALANCE);
      return GUEST_DEMO_BALANCE;
    }
    return current;
  },

  // Reset the demo balance to the starting amount (e.g. on explicit "reset
  // demo" action — currently auto-triggered only via refill when low).
  resetGuestBalance() {
    this.setGuestBalance(GUEST_DEMO_BALANCE);
    return GUEST_DEMO_BALANCE;
  },

  isGuestBalanceUnlimited() {
    return false; // guests now have a finite ₹50,000 demo balance
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

  // Format a balance for display. Guests show ₹X (DEMO); registered users show ₹X.
  formatBalance(amount) {
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
      // Guest nav — show ₹50,000 DEMO balance and DEMO badge
      const guestName = this.getGuestName();
      const demoBal = this.getGuestBalance();
      if (navUser) navUser.textContent = guestName;
      if (navBalance) navBalance.textContent = '\u20B9' + demoBal.toLocaleString('en-IN');
      if (navModeBadge) {
        navModeBadge.style.display = '';
        navModeBadge.textContent = 'DEMO';
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
