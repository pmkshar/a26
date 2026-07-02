/* ============================================================
   A26 — LIVE ACTIVITY ENGINE (v1)
   ------------------------------------------------------------
   Simulates a real multiplayer casino atmosphere by showing
   other players' bets and wins in real-time. This makes the
   single-player game feel alive and lets the user see what
   other people are betting on and how much they're winning.

   Two visible effects:
   1. LIVE BETS BADGE on each house — shows "# players · ₹total"
      that other (simulated) players have bet on that house in
      the current round.
   2. LIVE ACTIVITY FEED — a scrolling list of recent events:
      "Ravi bet ₹5,000 on House A"
      "Sneha won ₹12,000 on House 3 (2 matches)"
      etc.

   The engine maintains a pool of fake players with realistic
   Indian names. Each round, a random subset of them places
   bets on random houses. When the player's round ends, the
   engine resolves the fake players' bets using the SAME 3
   drawn cards and shows their wins/losses in the feed.

   API (exposed as window.LiveActivity):
   - init()                      -> starts the engine
   - startRound()                -> clear per-round house bets; fake players place bets
   - resolveRound(drawnCards)    -> settle fake players' bets based on the 3 drawn cards
   - getHouseBets(house)         -> { players: N, total: ₹ } for a house
   - renderHouseBadges()         -> refresh the live-bets badge on each house
   - pushEvent(type, opts)       -> manually push a custom event to the feed
   ============================================================ */

(function (global) {
  'use strict';

  // ---------- REALISTIC INDIAN PLAYER NAME POOL ----------
  const FIRST_NAMES = [
    'Ravi', 'Sneha', 'Arjun', 'Priya', 'Vikram', 'Ananya', 'Karthik', 'Divya',
    'Rahul', 'Pooja', 'Sanjay', 'Meena', 'Amit', 'Kavya', 'Suresh', 'Nisha',
    'Rajesh', 'Anjali', 'Manoj', 'Shreya', 'Deepak', 'Lakshmi', 'Vivek', 'Aishwarya',
    'Aditya', 'Bhavya', 'Harish', 'Charan', 'Gaurav', 'Isha', 'Jai', 'Maya',
    'Naveen', 'Ojasvi', 'Pradeep', 'Ritu', 'Saketh', 'Tanvi', 'Uday', 'Varsha'
  ];
  const LAST_NAMES = [
    'Sharma', 'Reddy', 'Nair', 'Iyer', 'Gupta', 'Patel', 'Rao', 'Menon',
    'Verma', 'Singh', 'Kapoor', 'Joshi', 'Mehta', 'Chopra', 'Malhotra', 'Banerjee',
    'Das', 'Bose', 'Pillai', 'Kumar', 'Khanna', 'Saxena', 'Agarwal', 'Bhat'
  ];
  function pickName() {
    const f = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const l = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    return f + ' ' + l;
  }
  function pickInitials() {
    const f = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    return f[0] + '. ' + LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  }
  // Display name: 50% chance full name, 50% chance "R. Sharma" style
  function displayName() {
    return Math.random() < 0.5 ? pickName() : pickInitials();
  }

  // ---------- CHIP VALUES (same as player's chips) ----------
  const CHIP_VALUES = [2000, 5000, 10000, 20000, 40000, 60000];
  function pickChip() {
    // Weighted toward smaller chips (more realistic — most players bet small)
    const weights = [0.35, 0.25, 0.18, 0.12, 0.07, 0.03];
    const r = Math.random();
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i];
      if (r < acc) return CHIP_VALUES[i];
    }
    return CHIP_VALUES[0];
  }

  // ---------- ENGINE STATE ----------
  const HOUSES = ['A', '2', '3', '4', '5', '6'];
  const engine = {
    // Active fake players for the current round: { name, house, amount }
    roundBets: [],
    // Per-house aggregate: { A: { players: N, total: ₹ }, ... }
    houseBets: {},
    // Online player count (drifts up/down over time for realism)
    onlineCount: 47,
    // Whether the engine has been initialised
    initialized: false,
    // Timers
    onlineDriftTimer: null,
    betTickerTimer: null,
    // Recent feed events (max 30 kept in DOM)
    feedCount: 0
  };

  // ---------- INIT ----------
  function init() {
    if (engine.initialized) return;
    engine.initialized = true;
    // Reset house bets
    HOUSES.forEach(h => { engine.houseBets[h] = { players: 0, total: 0 }; });
    // Online count drifts every 8-15s for realism
    scheduleOnlineDrift();
    // Occasional ambient bet events (even outside of round resolution)
    // — gives the feed activity between rounds
    scheduleAmbientBet();
    // Initial online count render
    updateOnlineCountUI();
    // Seed the feed with a few recent events so it's not empty
    seedFeed();
  }

  // ---------- ONLINE COUNT ----------
  function scheduleOnlineDrift() {
    const tick = () => {
      // Drift by -2..+3 players, clamp to a realistic 35-80 range
      const delta = Math.floor(Math.random() * 6) - 2;
      engine.onlineCount = Math.max(35, Math.min(80, engine.onlineCount + delta));
      updateOnlineCountUI();
      engine.onlineDriftTimer = setTimeout(tick, 8000 + Math.random() * 7000);
    };
    engine.onlineDriftTimer = setTimeout(tick, 5000);
  }
  function updateOnlineCountUI() {
    const el = document.getElementById('liveActivityCount');
    if (el) el.textContent = engine.onlineCount + ' players online';
  }

  // ---------- AMBIENT BET TICKER (between rounds) ----------
  function scheduleAmbientBet() {
    const tick = () => {
      // 60% chance to emit a small bet event between rounds
      if (Math.random() < 0.6) {
        const name = displayName();
        const house = HOUSES[Math.floor(Math.random() * HOUSES.length)];
        const amount = pickChip();
        pushEvent('bet', { name, house, amount });
      }
      // 25% chance to emit a "joined" event
      if (Math.random() < 0.25) {
        const name = displayName();
        pushEvent('join', { name });
      }
      // 15% chance to emit a "left" event
      if (Math.random() < 0.15) {
        const name = displayName();
        pushEvent('leave', { name });
      }
      engine.betTickerTimer = setTimeout(tick, 4000 + Math.random() * 6000);
    };
    engine.betTickerTimer = setTimeout(tick, 3500);
  }

  // ---------- ROUND LIFECYCLE ----------
  // Called by game.js when a new betting window opens.
  // Resets the per-round house bets and seeds the round with a fresh
  // batch of fake-player bets.
  function startRound() {
    engine.roundBets = [];
    HOUSES.forEach(h => { engine.houseBets[h] = { players: 0, total: 0 }; });

    // 8-16 fake players bet on random houses this round
    const playerCount = 8 + Math.floor(Math.random() * 9);
    const usedNames = new Set();
    for (let i = 0; i < playerCount; i++) {
      let name;
      let tries = 0;
      do {
        name = displayName();
        tries++;
      } while (usedNames.has(name) && tries < 5);
      usedNames.add(name);

      const house = HOUSES[Math.floor(Math.random() * HOUSES.length)];
      const amount = pickChip();
      engine.roundBets.push({ name, house, amount });
      engine.houseBets[house].players += 1;
      engine.houseBets[house].total += amount;
    }

    renderHouseBadges();
    // Push a few of these bets to the feed in a staggered way so it
    // looks like real players betting live during the betting window.
    staggerFeedBets(engine.roundBets.slice(0, 6));
  }

  function staggerFeedBets(bets) {
    if (!bets.length) return;
    let i = 0;
    const emit = () => {
      if (i >= bets.length) return;
      const b = bets[i++];
      pushEvent('bet', { name: b.name, house: b.house, amount: b.amount });
      setTimeout(emit, 1200 + Math.random() * 2500);
    };
    setTimeout(emit, 600);
  }

  // Called by game.js after the 3 cards are drawn and the player's
  // result is computed. Resolves all fake-player bets using the SAME
  // drawn cards and pushes their wins/losses to the feed.
  function resolveRound(drawnCards) {
    if (!engine.initialized || !drawnCards || !drawnCards.length) return;
    // drawnCards: array of { value, suit, color }
    const drawnValues = drawnCards.map(c => c.value);

    // Pick 3-5 random fake players to "win" or "lose" visibly in the feed
    const visiblePlayers = engine.roundBets
      .slice()
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(5, engine.roundBets.length));

    visiblePlayers.forEach((p, idx) => {
      setTimeout(() => {
        const matchCount = drawnValues.filter(v => v === p.house).length;
        if (matchCount > 0) {
          // Payout table must match game.js: 1=1:1, 2=1:2, 3=1:4
          // total return = stake × (1 + multiplier)
          let multiplier = 0;
          if (matchCount === 1) multiplier = 1;
          else if (matchCount === 2) multiplier = 2;
          else if (matchCount === 3) multiplier = 3;
          const winAmount = p.amount * (1 + multiplier);
          pushEvent('win', {
            name: p.name,
            house: p.house,
            matches: matchCount,
            amount: winAmount
          });
        } else {
          pushEvent('lose', { name: p.name, house: p.house, amount: p.amount });
        }
      }, 800 + idx * 1100);
    });

    // After 6 seconds, clear the house bet badges (round is over)
    setTimeout(() => {
      HOUSES.forEach(h => { engine.houseBets[h] = { players: 0, total: 0 }; });
      renderHouseBadges();
    }, 6000);
  }

  // ---------- HOUSE BET BADGES ----------
  function getHouseBets(house) {
    return engine.houseBets[house] || { players: 0, total: 0 };
  }

  function renderHouseBadges() {
    HOUSES.forEach(h => {
      const houseEl = document.querySelector(`.house[data-house="${h}"]`);
      if (!houseEl) return;
      let badge = houseEl.querySelector('.house-live-badge');
      const data = engine.houseBets[h] || { players: 0, total: 0 };
      if (data.players === 0) {
        if (badge) badge.remove();
        return;
      }
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'house-live-badge';
        houseEl.appendChild(badge);
      }
      badge.innerHTML = `
        <span class="hlb-players">\u{1F464} ${data.players}</span>
        <span class="hlb-total">\u20B9${formatNum(data.total)}</span>
      `;
      // Pulse animation when the badge updates
      badge.classList.remove('pulse');
      void badge.offsetWidth;
      badge.classList.add('pulse');
    });
  }

  function formatNum(n) {
    if (n >= 100000) return (n / 1000).toFixed(0) + 'K';
    return n.toLocaleString('en-IN');
  }

  // ---------- LIVE ACTIVITY FEED ----------
  function pushEvent(type, opts) {
    const feed = document.getElementById('liveActivityFeed');
    if (!feed) return;
    // Remove the empty placeholder if present
    const empty = feed.querySelector('.live-activity-empty');
    if (empty) empty.remove();

    const item = document.createElement('div');
    item.className = 'la-item la-' + type;
    let html = '';
    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    switch (type) {
      case 'bet':
        html = `
          <span class="la-icon la-icon-bet">\u{1F3B0}</span>
          <span class="la-text"><b>${escapeHtml(opts.name)}</b> bet <b>\u20B9${formatNum(opts.amount)}</b> on <b>House ${escapeHtml(opts.house)}</b></span>
          <span class="la-time">${time}</span>
        `;
        break;
      case 'win':
        html = `
          <span class="la-icon la-icon-win">\u{1F389}</span>
          <span class="la-text"><b>${escapeHtml(opts.name)}</b> won <b class="la-win-amt">\u20B9${formatNum(opts.amount)}</b> on <b>House ${escapeHtml(opts.house)}</b> (${opts.matches} match${opts.matches > 1 ? 'es' : ''})</span>
          <span class="la-time">${time}</span>
        `;
        break;
      case 'lose':
        html = `
          <span class="la-icon la-icon-lose">\u{1F61E}</span>
          <span class="la-text"><b>${escapeHtml(opts.name)}</b> lost <b>\u20B9${formatNum(opts.amount)}</b> on <b>House ${escapeHtml(opts.house)}</b></span>
          <span class="la-time">${time}</span>
        `;
        break;
      case 'join':
        html = `
          <span class="la-icon la-icon-join">\u{1F44B}</span>
          <span class="la-text"><b>${escapeHtml(opts.name)}</b> joined the table</span>
          <span class="la-time">${time}</span>
        `;
        break;
      case 'leave':
        html = `
          <span class="la-icon la-icon-leave">\u{1F44B}</span>
          <span class="la-text"><b>${escapeHtml(opts.name)}</b> left the table</span>
          <span class="la-time">${time}</span>
        `;
        break;
      case 'bigwin':
        html = `
          <span class="la-icon la-icon-bigwin">\u{1F38A}</span>
          <span class="la-text"><b>${escapeHtml(opts.name)}</b> hit a JACKPOT! Won <b class="la-win-amt">\u20B9${formatNum(opts.amount)}</b> on <b>House ${escapeHtml(opts.house)}</b> (3 matches!)</span>
          <span class="la-time">${time}</span>
        `;
        break;
    }
    item.innerHTML = html;
    feed.prepend(item);
    engine.feedCount++;

    // Cap the feed to 30 items
    while (feed.children.length > 30) {
      feed.lastChild.remove();
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // Seed the feed with a few recent events so it doesn't look empty
  function seedFeed() {
    const seedEvents = [
      { type: 'join', opts: { name: displayName() } },
      { type: 'bet', opts: { name: displayName(), house: HOUSES[Math.floor(Math.random() * 6)], amount: pickChip() } },
      { type: 'bet', opts: { name: displayName(), house: HOUSES[Math.floor(Math.random() * 6)], amount: pickChip() } },
      { type: 'win', opts: { name: displayName(), house: HOUSES[Math.floor(Math.random() * 6)], matches: 1 + Math.floor(Math.random() * 3), amount: 0 } }
    ];
    // For the seed 'win' event, compute a realistic amount
    const lastEvent = seedEvents[seedEvents.length - 1];
    if (lastEvent.type === 'win') {
      const stake = pickChip();
      const m = lastEvent.opts.matches;
      const mult = m === 1 ? 1 : m === 2 ? 2 : 3;
      lastEvent.opts.amount = stake * (1 + mult);
    }
    // Push in reverse so they appear in chronological order (newest first)
    // Actually pushEvent prepends, so push in order to get oldest-first read top-down
    // Since prepend means newest on top, push in chronological order to get newest on top:
    seedEvents.forEach(e => pushEvent(e.type, e.opts));
  }

  // ---------- EXPORT ----------
  global.LiveActivity = {
    init,
    startRound,
    resolveRound,
    getHouseBets,
    renderHouseBadges,
    pushEvent
  };

})(window);
