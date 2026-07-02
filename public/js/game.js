// =========================================================
// A26 LIVE CARD GAME
// 6 Houses (A, 2, 3, 4, 5, 6) · 1:1 / 1:2 / 1:4 payouts
// AI virtual dealer with multi-pose card-cutting animation
// Open access: guests play with 5,000 trial coins; registered
// users play with their server-backed balance.
// =========================================================

// NOTE: Auth.requireAuth() is now a no-op so the game is open to guests.
Auth.updateNav();

// === CONSTANTS ===
const HOUSES = ['A', '2', '3', '4', '5', '6'];
const CARD_VALUES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS = [
  { sym: '\u2660', color: 'black' }, // spade
  { sym: '\u2665', color: 'red' },   // heart
  { sym: '\u2666', color: 'red' },   // diamond
  { sym: '\u2663', color: 'black' }  // club
];
const BET_WINDOW_MS = 20000; // 20 second betting window
const MIN_BET = 2000;
const MAX_BET = 60000;

// === STATE ===
let balance = 0;
let bets = {};          // { A: 5000, 2: 0, 3: 3000, ... }
let totalBet = 0;
let round = 1;
let history = [];
let isDealing = false;
let isBettingOpen = true;
let selectedChip = 5000;
let currentDealer = 1;
let betTimerInterval = null;
let betWindowStart = 0;
let lastWin = 0;
let videoClockInterval = null;
let dhReady = false;
let idleChatInterval = null;
let hasSpokenBetPlaced = false;  // Only speak "bet placed" once per round
let isGuest = false;             // true if running in trial mode

// === INIT ===
document.addEventListener('DOMContentLoaded', async () => {
  // Branch on guest vs registered user. Guests use the localStorage trial
  // balance (5,000 coins); registered users use their server balance.
  isGuest = Auth.isGuest();
  if (isGuest) {
    balance = Auth.getGuestBalance();
    // If the guest has run out, give them a fresh 5,000 on this visit so
    // they can keep exploring. (The "Out of coins" modal will fire if they
    // actually try to place a bet with 0 balance.)
    if (balance <= 0) {
      balance = Auth.refillGuestBalance();
    }
  } else {
    const user = Auth.getUser();
    balance = user ? (user.balance || 0) : 0;
  }
  updateBalanceUI();
  updateModeUI();

  initHouses();
  initChips();
  initBetTiles();
  initButtons();
  startVideoClock();
  initScoreboard();
  bindOutOfCoinsModal();

  // Initialize the AI Digital Human dealer
  try {
    DigitalHuman.init('dhContainer');
    dhReady = true;
    DigitalHuman.setPose('idle');
    // Welcome line after slight delay (let voices load)
    setTimeout(() => {
      DigitalHuman.say('welcome');
      DigitalHuman.gesture('wave');
    }, 800);
    // Idle chatter
    startIdleChatter();
  } catch (e) {
    console.warn('Digital Human init failed:', e);
  }

  // Initialize the Live Activity engine (other players' bets + wins feed)
  try {
    LiveActivity.init();
  } catch (e) {
    console.warn('LiveActivity init failed:', e);
  }

  // Begin first betting window
  startBettingWindow();
});

// Update the trial-mode banner visibility and any other mode-dependent UI
function updateModeUI() {
  Auth.updateNav();
}

// Persist the current balance back to whatever store is appropriate:
// localStorage for guests, server-synced for registered users (handled in
// dealNow via /api/player/bet).
function persistBalance() {
  if (isGuest) {
    Auth.setGuestBalance(balance);
  } else {
    const user = Auth.getUser();
    if (user) {
      user.balance = balance;
      localStorage.setItem('a26_user', JSON.stringify(user));
    }
  }
}

// Bind the "Out of coins" modal buttons (refill trial / go to login)
function bindOutOfCoinsModal() {
  const overlay = document.getElementById('outOfCoinsOverlay');
  const refillBtn = document.getElementById('btnRefillTrial');
  if (refillBtn) {
    refillBtn.addEventListener('click', () => {
      balance = Auth.refillGuestBalance();
      persistBalance();
      updateBalanceUI();
      if (overlay) overlay.classList.remove('show');
      flashMessage('5,000 trial coins added!');
    });
  }
}

// === IDLE CHATTER (contextual banter — only when truly idle and silent) ===
function startIdleChatter() {
  if (idleChatInterval) clearInterval(idleChatInterval);
  idleChatInterval = setInterval(() => {
    // Only chatter when: betting open, not dealing, not already speaking,
    // and no bets placed yet (don't interrupt the player's thinking).
    if (isBettingOpen && !isDealing && dhReady && !DigitalHuman.isSpeaking() && totalBet === 0) {
      DigitalHuman.say('idle');
    }
  }, 25000); // every 25s when truly idle
}

// === VIDEO CLOCK (decorative, runs always) ===
function startVideoClock() {
  const clockEl = document.getElementById('videoClock');
  const sessionStart = Date.now();
  videoClockInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    clockEl.textContent = `${h}:${m}:${s}`;
  }, 1000);
}

// === SCOREBOARD ===
function initScoreboard() {
  const sb = document.getElementById('scoreboard');
  sb.innerHTML = '<div class="scoreboard-empty">No rounds yet</div>';
}

function updateScoreboard() {
  const sb = document.getElementById('scoreboard');
  if (history.length === 0) {
    sb.innerHTML = '<div class="scoreboard-empty">No rounds yet</div>';
    return;
  }
  const last = history.slice(0, 24);
  sb.innerHTML = last.map(h => {
    const net = h.won - h.bet;
    const cls = net > 0 ? 'bead-win' : 'bead-lose';
    const lbl = net > 0 ? 'W' : 'L';
    const title = `Round ${h.round}: ${h.cards.join(' ')} - ${net >= 0 ? '+' : ''}₹${net}`;
    return `<div class="bead ${cls}" title="${title}">${lbl}</div>`;
  }).join('');
}

// === INIT HOUSES (the 6 betting boxes on the table) ===
function initHouses() {
  const grid = document.getElementById('housesGrid');
  grid.innerHTML = '';
  HOUSES.forEach(h => {
    const div = document.createElement('div');
    div.className = 'house';
    div.dataset.house = h;
    div.innerHTML = `
      <div class="house-label">${h}</div>
      <div class="house-dots">${'<div class="house-dot"></div>'.repeat(4)}</div>
      <div class="house-payouts">
        <span class="hp hp1">1:1</span>
        <span class="hp hp2">1:2</span>
        <span class="hp hp3">1:4</span>
      </div>
      <div class="house-max-label">Max \u20B960,000</div>
      <div class="house-bets" id="bets-${h}"></div>
    `;
    // Normal click: toggle selection
    div.addEventListener('click', (ev) => selectHouse(h, ev));
    // Shift-click: remove the bet from this house (refund)
    div.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      removeBetFromHouse(h);
    });
    grid.appendChild(div);
  });
}

function selectHouse(house, ev) {
  if (isDealing || !isBettingOpen) return;
  // Shift+click removes the bet
  if (ev && ev.shiftKey) {
    removeBetFromHouse(house);
    return;
  }
  document.querySelectorAll('.house').forEach(el => {
    if (el.dataset.house === house) el.classList.toggle('selected');
  });
  updateHouseSelectionDisplay();
  updateDealButton();
}

// Remove the entire bet from a house and refund the player
function removeBetFromHouse(house) {
  if (isDealing || !isBettingOpen) return;
  if (!bets[house]) {
    flashMessage(`No bet on house ${house} to remove`);
    return;
  }
  const refund = bets[house];
  balance += refund;
  totalBet -= refund;
  delete bets[house];
  persistBalance();
  renderChipsOnHouse(house);
  updateBalanceUI();
  updateHouseSelectionDisplay();
  updateBetSummary();
  updateDealButton();
  flashMessage(`Removed \u20B9${refund.toLocaleString('en-IN')} from house ${house}`);
}

function updateHouseSelectionDisplay() {
  const selected = document.querySelectorAll('.house.selected');
  const display = document.getElementById('selectedHouseDisplay');
  const bettedCount = Object.keys(bets).filter(h => bets[h] > 0).length;
  if (selected.length === 1) {
    display.textContent = 'House: ' + selected[0].dataset.house;
  } else if (selected.length > 1) {
    display.textContent = selected.length + ' houses selected';
  } else if (bettedCount > 0) {
    display.textContent = bettedCount + ' house' + (bettedCount > 1 ? 's' : '') + ' bet';
  } else {
    display.textContent = 'Select one or more houses';
  }
}

// === CHIPS ===
function initChips() {
  document.querySelectorAll('.chip').forEach(c => {
    c.addEventListener('click', () => {
      const val = parseInt(c.dataset.value);
      // If a house is selected, immediately place this chip on it
      const selected = document.querySelectorAll('.house.selected');
      if (selected.length > 0) {
        selected.forEach(el => placeBet(el.dataset.house, val));
      } else {
        // Otherwise just set the bet input
        document.getElementById('betInput').value = val;
      }
    });
  });
}

// === PLACE BET ===
function placeBet(house, amount) {
  if (!isBettingOpen || isDealing) return;
  if (amount < MIN_BET || amount > MAX_BET) {
    flashMessage(`Bet must be between \u20B9${MIN_BET} and \u20B9${MAX_BET}`);
    if (dhReady) DigitalHuman.sayCustom(`Bet must be between ${MIN_BET} and ${MAX_BET} rupees.`, 'serious', 0.98, 0.98);
    return;
  }
  if (balance < amount) {
    if (isGuest) {
      // Guest ran out of trial coins — prompt to register or refill.
      showOutOfCoinsModal();
      return;
    }
    flashMessage('Insufficient balance');
    if (dhReady) DigitalHuman.sayCustom('Insufficient balance. Please top up to continue.', 'sad', 0.96, 0.98);
    return;
  }
  const newTotal = (bets[house] || 0) + amount;
  if (newTotal > MAX_BET) {
    // Per-house limit: only accept up to MAX_BET, refuse the excess
    const accepted = MAX_BET - (bets[house] || 0);
    if (accepted <= 0) {
      flashMessage(`House ${house} is at the \u20B9${MAX_BET} maximum`);
      if (dhReady) DigitalHuman.sayCustom(`House ${house} is already at the maximum of ${MAX_BET} rupees.`, 'serious', 0.98, 0.98);
      return;
    }
    bets[house] = MAX_BET;
    balance -= accepted;
    totalBet += accepted;
    flashMessage(`House ${house} capped at \u20B9${MAX_BET}`);
  } else {
    bets[house] = newTotal;
    balance -= amount;
    totalBet += amount;
  }
  persistBalance();
  updateBalanceUI();
  renderChipsOnHouse(house);
  updateHouseSelectionDisplay();
  updateBetSummary();
  updateDealButton();
  // Pulse the house
  const houseEl = document.querySelector(`.house[data-house="${house}"]`);
  houseEl.classList.add('pulse');
  setTimeout(() => houseEl.classList.remove('pulse'), 400);
  // Dealer acknowledges bet — only on the FIRST bet of the round (avoid spam)
  if (dhReady && !hasSpokenBetPlaced && !DigitalHuman.isSpeaking()) {
    hasSpokenBetPlaced = true;
    DigitalHuman.say('betPlaced');
  }
  // Push the player's own bet to the Live Activity feed
  try {
    const me = isGuest ? Auth.getGuestName() : ((Auth.getUser() && Auth.getUser().username) || 'You');
    LiveActivity.pushEvent('bet', { name: me, house, amount });
  } catch (e) { /* feed is optional */ }
}

// Show the "Out of trial coins" modal (guests only)
function showOutOfCoinsModal() {
  const overlay = document.getElementById('outOfCoinsOverlay');
  if (overlay) overlay.classList.add('show');
}

// Render the active bets summary panel
function updateBetSummary() {
  const list = document.getElementById('betSummaryList');
  if (!list) return;
  const entries = Object.entries(bets).filter(([h, amt]) => amt > 0);
  if (entries.length === 0) {
    list.innerHTML = '<div class="bet-summary-empty">No bets placed yet</div>';
    return;
  }
  list.innerHTML = entries.map(([house, amt]) => {
    const pct = Math.min(100, Math.round(amt / MAX_BET * 100));
    const atMax = amt >= MAX_BET;
    return `
      <div class="bet-summary-item ${atMax ? 'at-max' : ''}">
        <span class="bsi-house">House ${house}</span>
        <div class="bsi-bar"><div class="bsi-fill" style="width:${pct}%"></div></div>
        <span class="bsi-amount">₹${amt.toLocaleString('en-IN')}</span>
        <button class="bsi-remove" onclick="removeBetFromHouse('${house}')" title="Remove bet">✕</button>
      </div>
    `;
  }).join('');
}

function renderChipsOnHouse(house) {
  const el = document.getElementById('bets-' + house);
  const houseEl = document.querySelector(`.house[data-house="${house}"]`);
  if (!bets[house]) {
    el.innerHTML = '';
    if (houseEl) houseEl.classList.remove('at-max', 'has-bet');
    return;
  }
  el.innerHTML = `<span class="chip-stack">₹${bets[house].toLocaleString('en-IN')}</span>`;
  if (houseEl) {
    houseEl.classList.add('has-bet');
    houseEl.classList.toggle('at-max', bets[house] >= MAX_BET);
  }
}

// === BUTTONS ===
function initButtons() {
  document.getElementById('btnClear').addEventListener('click', clearBets);
  document.getElementById('btnDeal').addEventListener('click', dealNow);
  document.getElementById('btnNewRound').addEventListener('click', closeResult);
  document.getElementById('btnRules').addEventListener('click', () => {
    document.getElementById('rulesPanel').classList.toggle('show');
  });
  document.getElementById('betInput').addEventListener('input', updateDealButton);
}

function initBetTiles() {
  // No separate bet tiles in A26 - houses are the bet tiles
}

// === DEALER (now powered by Digital Human) ===
function setDealerPose(pose) {
  if (!dhReady) return;
  // Map legacy pose names to digital-human poses
  const map = { idle: 'idle', cutting: 'cutting', dealing: 'dealing', reveal: 'reveal-win' };
  DigitalHuman.setPose(map[pose] || pose);
}

function setDealerBubble(text) {
  if (!dhReady) return;
  DigitalHuman.setBubble(text);
}

// === CLEAR BETS ===
function clearBets() {
  if (isDealing || !isBettingOpen) return;
  balance += totalBet;
  totalBet = 0;
  bets = {};
  hasSpokenBetPlaced = false;  // Allow "bet placed" to speak again
  document.querySelectorAll('.house-bets').forEach(el => el.innerHTML = '');
  document.querySelectorAll('.house').forEach(el => el.classList.remove('selected', 'at-max', 'has-bet'));
  document.getElementById('selectedHouseDisplay').textContent = 'Select one or more houses';
  document.getElementById('betInput').value = '';
  persistBalance();
  updateBalanceUI();
  updateBetSummary();
  updateDealButton();
}

function updateDealButton() {
  const btn = document.getElementById('btnDeal');
  const inputAmount = parseInt(document.getElementById('betInput').value) || 0;
  const hasSelectedHouse = document.querySelectorAll('.house.selected').length > 0;
  const hasChipsOnHouses = totalBet > 0;
  // Can deal if: there are bets on houses OR a house is selected with valid amount in input
  const canDeal = !isDealing && isBettingOpen && (
    hasChipsOnHouses || (hasSelectedHouse && inputAmount >= MIN_BET && inputAmount <= MAX_BET)
  );
  btn.disabled = !canDeal;
}

function updateBalanceUI() {
  document.getElementById('balance').textContent = '\u20B9' + balance.toLocaleString('en-IN');
  document.getElementById('totalBet').textContent = '\u20B9' + totalBet.toLocaleString('en-IN');
  document.getElementById('lastWin').textContent = '\u20B9' + lastWin.toLocaleString('en-IN');
  document.getElementById('nav-balance').textContent = '\u20B9' + balance.toLocaleString('en-IN');
  document.getElementById('roundNum').textContent = round;
}

// === BETTING WINDOW TIMER ===
function startBettingWindow() {
  isBettingOpen = true;
  hasSpokenBetPlaced = false;  // Reset for the new round
  betWindowStart = Date.now();
  setDealerPose('idle');
  setDealerBubble('Place your bets');
  updateDealButton();
  document.getElementById('betTimer').textContent = '20';

  // Tell the Live Activity engine to seed fake-player bets for this round
  try { LiveActivity.startRound(); } catch (e) { console.warn('LiveActivity.startRound failed:', e); }

  betTimerInterval = setInterval(() => {
    const elapsed = Date.now() - betWindowStart;
    const remaining = Math.max(0, Math.ceil((BET_WINDOW_MS - elapsed) / 1000));
    document.getElementById('betTimer').textContent = remaining;
    // Bet-closing warning at 5s (only if bets placed and not already speaking)
    if (remaining === 5 && dhReady && totalBet > 0 && !DigitalHuman.isSpeaking()) {
      DigitalHuman.say('betClosingSoon');
    }
    if (remaining <= 0) {
      clearInterval(betTimerInterval);
      // Auto-deal if any bets placed
      if (totalBet > 0) {
        dealNow();
      } else {
        // Restart betting window if no bets
        startBettingWindow();
      }
    }
  }, 250);
}

function stopBettingWindow() {
  isBettingOpen = false;
  if (betTimerInterval) clearInterval(betTimerInterval);
  document.getElementById('betTimer').textContent = '0';
  updateDealButton();
}

// === DECK & CARD LOGIC ===
function createDeck() {
  const deck = [];
  CARD_VALUES.forEach(val => {
    SUITS.forEach(suit => {
      deck.push({ value: val, suit: suit.sym, color: suit.color });
    });
  });
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// === DEAL NOW (main game flow) ===
async function dealNow() {
  if (isDealing) return;

  // If a house is selected AND amount in input, place that bet first
  const inputAmount = parseInt(document.getElementById('betInput').value) || 0;
  const selected = document.querySelectorAll('.house.selected');
  if (selected.length > 0 && inputAmount >= MIN_BET && inputAmount <= MAX_BET) {
    const totalNeeded = inputAmount * selected.length;
    if (totalNeeded > balance + totalBet) {
      flashMessage('Insufficient balance for all selected houses');
      return;
    }
    selected.forEach(el => placeBet(el.dataset.house, inputAmount));
  }

  if (totalBet === 0) {
    flashMessage('Please place at least one bet');
    return;
  }

  isDealing = true;
  stopBettingWindow();
  // Stop idle chatter during dealing
  if (idleChatInterval) { clearInterval(idleChatInterval); idleChatInterval = null; }
  // Cancel any current speech before starting the deal narration
  if (dhReady) DigitalHuman.cancelSpeech();
  document.getElementById('btnDeal').disabled = true;
  document.getElementById('btnClear').disabled = true;

  // Reset drawn cards display
  for (let i = 1; i <= 3; i++) {
    const slot = document.getElementById('slot' + i);
    slot.classList.remove('revealed', 'match');
    slot.innerHTML = '<div class="drawn-card-back">A26</div>';
  }
  document.getElementById('matchesDisplay').innerHTML = '';
  document.getElementById('resultBanner').textContent = '';
  document.getElementById('resultBanner').className = 'result-banner';

  // === ANIMATION SEQUENCE (sequential narration — each line waits for the previous to finish) ===
  // 1. Announce betting is closed, then shuffle
  setDealerPose('cutting');
  animateDeckShuffle();
  if (dhReady) await DigitalHuman.sayAndWait('bettingClosed');
  if (dhReady) await DigitalHuman.sayAndWait('shuffling');

  // 2. A player cuts the cards
  if (dhReady) await DigitalHuman.sayAndWait('cutDeck');

  // 3. Build deck and draw 3 cards
  setDealerPose('dealing');
  if (dhReady) await DigitalHuman.sayAndWait('drawing');
  await delay(300);

  const deck = createDeck();
  const drawn = [deck[0], deck[1], deck[2]];

  // 4. Reveal all three cards at normal speed (no long narration gaps).
  //    The dealer has already said "Now drawing three cards" above.
  //    During the reveal we just flip the cards one by one with a brief,
  //    natural 350ms cadence — no per-card speech that would slow the
  //    reveal or cause voice overlap.
  for (let i = 0; i < 3; i++) {
    const slot = document.getElementById('slot' + (i + 1));
    slot.classList.add('revealed');
    const card = drawn[i];
    slot.innerHTML = `
      <div class="drawn-card-face ${card.color}">
        <div class="dc-corner top">
          <div class="dc-rank">${card.value}</div>
          <div class="dc-suit-sm">${card.suit}</div>
        </div>
        <div class="dc-center">${card.suit}</div>
        <div class="dc-corner bottom">
          <div class="dc-rank">${card.value}</div>
          <div class="dc-suit-sm">${card.suit}</div>
        </div>
      </div>
    `;
    // Pulse the matching houses for visual feedback
    highlightMatchingHouses(card.value);
    // Brief natural pause between card flips — no per-card narration
    await delay(350);
    clearHouseHighlights();
  }

  // Wait for the dealer's "drawing three cards" line to finish before
  // announcing the result, so voice doesn't overlap.
  if (dhReady) {
    while (DigitalHuman.isSpeaking()) { await delay(120); }
  }

  // 5. Calculate results
  await delay(300);

  const bettedHouses = Object.keys(bets);
  let totalWin = 0;
  const resultDetails = [];
  let bestMatchCount = 0;

  bettedHouses.forEach(h => {
    const matchCount = drawn.filter(c => c.value === h).length;
    if (matchCount > 0) {
      // Payout table per user spec:
      //   1 match  -> 1:1 -> total return = bet x 2 (profit = bet x 1)
      //   2 matches-> 1:2 -> total return = bet x 3 (profit = bet x 2)
      //   3 matches-> 1:4 -> total return = bet x 4 (profit = bet x 3)
      let multiplier = 0;   // PROFIT multiplier (excludes original stake)
      let ratio = '';
      if (matchCount === 1) { multiplier = 1; ratio = '1:1'; }
      else if (matchCount === 2) { multiplier = 2; ratio = '1:2'; }
      else if (matchCount === 3) { multiplier = 3; ratio = '1:4'; }
      const win = bets[h] * (1 + multiplier); // stake + profit
      totalWin += win;
      if (matchCount > bestMatchCount) bestMatchCount = matchCount;
      resultDetails.push(`House ${h}: ${matchCount} match${matchCount > 1 ? 'es' : ''} (${ratio}) = +₹${(bets[h] * multiplier).toLocaleString('en-IN')}`);
    } else {
      resultDetails.push(`House ${h}: No match`);
    }
    // Highlight matching drawn cards
    drawn.forEach((c, idx) => {
      if (c.value === h) {
        document.getElementById('slot' + (idx + 1)).classList.add('match');
      }
    });
  });

  // Set dealer pose + emotion based on outcome
  if (dhReady) {
    if (totalWin > 0) {
      DigitalHuman.setPose('reveal-win');
      if (bestMatchCount === 3) { DigitalHuman.setEmotion('surprised'); DigitalHuman.say('win3'); }
      else if (bestMatchCount === 2) { DigitalHuman.setEmotion('happy'); DigitalHuman.say('win2'); }
      else { DigitalHuman.setEmotion('happy'); DigitalHuman.say('win1'); }
    } else {
      DigitalHuman.setPose('reveal-lose');
      DigitalHuman.setEmotion('sad');
      DigitalHuman.say('lose');
    }
  }

  // Resolve all fake players' bets using the SAME drawn cards so their
  // wins/losses show up in the Live Activity feed.
  try { LiveActivity.resolveRound(drawn); } catch (e) { console.warn('LiveActivity.resolveRound failed:', e); }

  // Also push the player's own result to the Live Activity feed so they
  // see themselves alongside the other players.
  try {
    const me = isGuest ? Auth.getGuestName() : ((Auth.getUser() && Auth.getUser().username) || 'You');
    if (totalWin > 0) {
      LiveActivity.pushEvent('win', {
        name: me,
        house: Object.keys(bets).join(','),
        matches: bestMatchCount,
        amount: totalWin
      });
    } else if (totalBet > 0) {
      LiveActivity.pushEvent('lose', {
        name: me,
        house: Object.keys(bets).join(','),
        amount: totalBet
      });
    }
  } catch (e) { /* feed is optional */ }

  balance += totalWin;
  lastWin = totalWin;

  // Persist the new balance (guest: localStorage; registered: localStorage
  // and server-sync below)
  persistBalance();

  // Show result banner
  const banner = document.getElementById('resultBanner');
  if (totalWin > 0) {
    banner.textContent = `YOU WON ₹${totalWin.toLocaleString('en-IN')}!`;
    banner.className = 'result-banner show win';
  } else {
    banner.textContent = `NO LUCK THIS ROUND`;
    banner.className = 'result-banner show lose';
  }

  // Update matches display
  const md = document.getElementById('matchesDisplay');
  if (totalWin > 0) {
    md.innerHTML = resultDetails.filter(d => d.includes('match')).join('<br>');
    md.className = 'matches-display show win';
  } else {
    md.innerHTML = 'No matches this round';
    md.className = 'matches-display show lose';
  }

  if (!dhReady) setDealerBubble(totalWin > 0 ? `You won ₹${totalWin.toLocaleString('en-IN')}!` : 'Better luck next round');

  // Save history
  history.unshift({
    round,
    cards: drawn.map(c => c.value),
    bets: { ...bets },
    won: totalWin,
    bet: totalBet
  });
  updateHistory();
  updateScoreboard();

  if (totalWin > 0) launchConfetti();

  // Persist bet to backend (best-effort). Only registered users have a
  // server-side balance to sync; guests just keep their localStorage balance.
  if (!isGuest) {
    try {
      await Auth.api('/api/player/bet', {
        method: 'POST',
        body: JSON.stringify({
          roundId: 'round_' + round,
          house: bettedHouses.join(','),
          amount: totalBet,
          winnings: totalWin,
          result: drawn.map(c => c.value).join(','),
          finalBalance: balance
        })
      });
    } catch (e) {
      console.log('Server sync skipped:', e.message);
    }
  }

  round++;
  updateBalanceUI();

  // Show result modal after a delay
  await delay(1500);
  showResultModal(drawn, bettedHouses, totalWin, totalBet, resultDetails);
}

function highlightMatchingHouses(value) {
  document.querySelectorAll('.house').forEach(el => {
    if (el.dataset.house === value) {
      el.classList.add('house-highlight');
    }
  });
}

function clearHouseHighlights() {
  document.querySelectorAll('.house').forEach(el => {
    el.classList.remove('house-highlight');
  });
}

function showResultModal(drawn, bettedHouses, totalWin, totalBet, resultDetails) {
  const overlay = document.getElementById('resultOverlay');
  const title = document.getElementById('resultTitle');
  const cardsEl = document.getElementById('resultCards');
  const matchesEl = document.getElementById('resultMatches');
  const amountEl = document.getElementById('resultAmount');

  cardsEl.textContent = 'Cards drawn: ' + drawn.map(c => c.value + c.suit).join('  ');
  matchesEl.innerHTML = resultDetails.join('<br>');

  if (totalWin > 0) {
    title.textContent = 'You Win!';
    amountEl.innerHTML = `<div class="win-amount">+₹${totalWin.toLocaleString('en-IN')}</div><div style="font-size:0.8rem;color:#aaa;margin-top:4px;">Net: ₹${(totalWin - totalBet).toLocaleString('en-IN')}</div>`;
  } else {
    title.textContent = 'No Luck';
    amountEl.innerHTML = `<div class="lose-text">-₹${totalBet.toLocaleString('en-IN')}</div>`;
  }

  overlay.classList.add('show');
}

function closeResult() {
  document.getElementById('resultOverlay').classList.remove('show');
  resetRound();
}

function resetRound() {
  bets = {};
  totalBet = 0;
  document.getElementById('betInput').value = '';
  document.querySelectorAll('.house').forEach(el => el.classList.remove('selected', 'house-highlight', 'at-max', 'has-bet'));
  document.querySelectorAll('.house-bets').forEach(el => el.innerHTML = '');
  document.getElementById('selectedHouseDisplay').textContent = 'Select one or more houses';
  for (let i = 1; i <= 3; i++) {
    const slot = document.getElementById('slot' + i);
    slot.classList.remove('revealed', 'match');
    slot.innerHTML = '<div class="drawn-card-back">A26</div>';
  }
  document.getElementById('matchesDisplay').innerHTML = '';
  document.getElementById('matchesDisplay').className = 'matches-display';
  document.getElementById('resultBanner').textContent = '';
  document.getElementById('resultBanner').className = 'result-banner';
  document.getElementById('btnClear').disabled = false;
  isDealing = false;
  updateBalanceUI();
  startBettingWindow();
  startIdleChatter();  // Resume idle chatter for the new round
}

// === HISTORY ===
function updateHistory() {
  const list = document.getElementById('historyList');
  list.innerHTML = '';
  history.slice(0, 20).forEach(h => {
    const div = document.createElement('div');
    div.className = 'history-item';
    const net = h.won - h.bet;
    div.innerHTML = `
      <div>R#${h.round}</div>
      <div class="round-cards">${h.cards.join(' ')}</div>
      <div class="round-result ${net >= 0 ? 'win' : 'lose'}">${net >= 0 ? '+' : ''}₹${net.toLocaleString('en-IN')}</div>
    `;
    list.appendChild(div);
  });
}

// === DECK SHUFFLE ANIMATION ===
function animateDeckShuffle() {
  const deck = document.getElementById('deckStack');
  deck.classList.add('shuffling');
  const cut = document.getElementById('cutOverlay');
  cut.classList.add('active');
  setTimeout(() => {
    deck.classList.remove('shuffling');
    cut.classList.remove('active');
  }, 900);
}

// === FLASH MESSAGE ===
function flashMessage(text) {
  const banner = document.getElementById('resultBanner');
  banner.textContent = text;
  banner.className = 'result-banner show flash-msg';
  setTimeout(() => {
    if (banner.textContent === text) {
      banner.textContent = '';
      banner.className = 'result-banner';
    }
  }, 1800);
}

// === CONFETTI ===
function launchConfetti() {
  const colors = ['#d4a843', '#f0d68a', '#c41e3a', '#2ecc71', '#fff', '#3498db'];
  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.top = '-10px';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
    piece.style.width = (4 + Math.random() * 6) + 'px';
    piece.style.height = (4 + Math.random() * 6) + 'px';
    document.body.appendChild(piece);
    const duration = 1500 + Math.random() * 2000;
    const xDrift = (Math.random() - 0.5) * 200;
    piece.animate([
      { transform: `translateY(0) translateX(0) rotate(0deg)`, opacity: 1 },
      { transform: `translateY(100vh) translateX(${xDrift}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }
    ], { duration, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }).onfinish = () => piece.remove();
  }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
