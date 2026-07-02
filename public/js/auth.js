// Auth utilities for A26 game
const API_BASE = '';

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

  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = '/login.html';
    }
  },

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

  updateNav() {
    const user = this.getUser();
    if (!user) return;

    const navUser = document.getElementById('nav-user');
    const navBalance = document.getElementById('nav-balance');
    const navRole = document.getElementById('nav-role');
    const navLogout = document.getElementById('nav-logout');
    const navAdmin = document.getElementById('nav-admin');

    if (navUser) navUser.textContent = user.username;
    if (navBalance) navBalance.textContent = '₹' + (user.balance || 0).toLocaleString('en-IN');
    if (navRole) navRole.textContent = user.role === 'admin' ? 'Admin' : 'Player';

    // Show Admin link only for admin users
    if (navAdmin) {
      navAdmin.style.display = (user.role === 'admin') ? '' : 'none';
    }

    if (navLogout) {
      navLogout.addEventListener('click', (e) => {
        e.preventDefault();
        Auth.logout();
      });
    }
  },

  formatINR(amount) {
    return '₹' + Number(amount).toLocaleString('en-IN');
  }
};
