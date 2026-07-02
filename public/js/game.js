// =========================================================
// A26 SPEED BACCARAT - Live Dealer Edition
// =========================================================

Auth.requireAuth();
Auth.updateNav();

// === CONSTANTS ===
const SUITS = [
  { sym: '\u2660', color: 'black' }, // spade
  { sym: '\u2665', color: 'red' },   // heart
  { sym: '\u2666', color: 'red' },   // diamond
  { sym: '\u2663', color: 'black' }  // club
];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const PAYOUTS = {
  player: 1,
  banker: 0.95,
  tie: 8,
  playerPair: 11,
  bankerPair: 11
};
const BET_LABELS = {
  player: 'PLAYER',
  banker: 'BANKER',
  tie: 'TIE',
  playerPair: 'P PAIR',
  bankerPair: 'B PAIR'
};
const BET_WINDOW_MS = 12000; // 12 second speed baccarat betting window

// === STATE ===
let balance = 0;
let bets = {};          // { player: 5000, banker: 0, ... }
let totalBet = 0;
let round = 1;
let history = [];
let isDealing = false;
let isBettingOpen = true;
let selectedChip = 2000;
let currentDealer = 1;
let betTimerInterval = null;
let betWindowStart = 0;
let lastWin = 0;
let videoClockInterval = null;

// === INIT ===
document.addEventListener('DOMContentLoaded', async () => {
  const user = Auth.getUser();
  if (user) {
    balance = user.balance || 0;
  }
  updateBalanceUI();

  initChips();
  initBetTiles();
  initDealerSwitch();
  startVideoClock();
  initScoreboard();

  // Begin first betting window
  startBettingWindow();
});

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

// === SCOREBOARD (P/B/T bead plate) ===
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
  const last = history.slice(0, 20);
  sb.innerHTML = last.map(h => {
    let cls = 'bead-tie';
    let lbl = 'T';
    if (h.winner === 'player') { cls = 'bead-player'; lbl = 'P'; }
    else if (h.winner === 'banker') { cls = 'bead-banker'; lbl = 'B'; }
    return `<div class="bead ${cls}">${lbl}</div>`;
  }).join('');
}

// === CHIP SELECTOR ===
function initChips() {
  document.querySelectorAll('.chip').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(x => x.classList.remove('selected'));
      c.classList.add('selected');
      selectedChip = parseInt(c.dataset.value);
    });
  });
  // Default selection
  document.querySelector('.chip-5000').classList.add('selected');
  selectedChip = 5000;
}

// === BET TILES ===
function initBetTiles() {
  document.querySelectorAll('.bet-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      if (!isBettingOpen || isDealing) return;
      const bet = tile.dataset.bet;
      placeBet(bet, selectedChip);
    });
  });

  document.getElementById('btnClear').addEventListener('click', clearBets);
  document.getElementById('btnDeal').addEventListener('click', dealNow);
}

// === DEALER SWITCH ===
function initDealerSwitch() {
  document.querySelectorAll('.dealer-pill').forEach(p => {
    p.addEventListener('click', () => {
      if (isDealing) return;
      document.querySelectorAll('.dealer-pill').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      currentDealer = parseInt(p.dataset.dealer);
      setDealerPose('idle');
    });
  });
}

function setDealerPose(pose) {
  const img = document.getElementById('dealerFrame');
  img.src = `/images/dealers/dealer${currentDealer}_${pose}.png`;
  img.dataset.current = pose;
}

function setDealerBubble(text) {
  document.getElementById('dealerBubble').textContent = text;
}

// === PLACE / CLEAR BETS ===
function placeBet(bet, amount) {
  if (balance < amount) {
    flashMessage('Insufficient balance');
    return;
  }
  bets[bet] = (bets[bet] || 0) + amount;
  balance -= amount;
  totalBet += amount;
  updateBalanceUI();
  renderChipsOnTile(bet);
  updateDealButton();
  // Subtle pulse on bet tile
  const tile = document.querySelector(`.bet-tile[data-bet="${bet}"]`);
  tile.classList.add('pulse');
  setTimeout(() => tile.classList.remove('pulse'), 400);
}

function renderChipsOnTile(bet) {
  const el = document.getElementById('chips-' + bet);
  if (!bets[bet]) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<span class="chip-stack">₹${bets[bet].toLocaleString('en-IN')}</span>`;
}

function clearBets() {
  if (isDealing || !isBettingOpen) return;
  // Refund all bets
  balance += totalBet;
  totalBet = 0;
  bets = {};
  document.querySelectorAll('.bet-tile-chips').forEach(el => el.innerHTML = '');
  updateBalanceUI();
  updateDealButton();
}

function updateDealButton() {
  const btn = document.getElementById('btnDeal');
  btn.disabled = isDealing || totalBet === 0 || !isBettingOpen;
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
  betWindowStart = Date.now();
  setDealerPose('idle');
  setDealerBubble('Place your bets');
  updateDealButton();
  document.getElementById('betTimer').textContent = '12';

  betTimerInterval = setInterval(() => {
    const elapsed = Date.now() - betWindowStart;
    const remaining = Math.max(0, Math.ceil((BET_WINDOW_MS - elapsed) / 1000));
    document.getElementById('betTimer').textContent = remaining;
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
  RANKS.forEach(r => {
    SUITS.forEach(s => {
      deck.push({ rank: r, suit: s.sym, color: s.color });
    });
  });
  // Shuffle (Fisher-Yates)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(card) {
  if (card.rank === 'A') return 1;
  if (['10','J','Q','K'].includes(card.rank)) return 0;
  return parseInt(card.rank);
}

function handTotal(cards) {
  const sum = cards.reduce((a, c) => a + cardValue(c), 0);
  return sum % 10;
}

// === BACCARAT THIRD-CARD RULES ===
function determineDraw(playerCards, bankerCards) {
  const pTotal = handTotal(playerCards);
  const bTotal = handTotal(bankerCards);

  // Natural - no more cards
  if (pTotal >= 8 || bTotal >= 8) {
    return { playerDraws: false, bankerDraws: false, playerThird: null, natural: true };
  }

  let playerDraws = false;
  let playerThird = null;

  // Player rule: stands on 6-7, draws on 0-5
  if (pTotal <= 5) {
    playerDraws = true;
  }

  let bankerDraws = false;
  if (playerDraws) {
    // Player drew a third card
    // Banker rules based on player's third card value
    if (bTotal <= 5) {
      bankerDraws = true;
    }
    // More granular rules:
    if (bTotal === 6) {
      // Banker draws only if player's third is 6 or 7
      // (handled by drawing first below)
    }
  } else {
    // Player stood (6 or 7)
    if (bTotal <= 5) bankerDraws = true;
  }

  return { playerDraws, bankerDraws, playerThird, natural: false };
}

// Standard baccarat third-card rules (full implementation)
function applyThirdCardRules(playerCards, bankerCards, deck) {
  const pTotal = handTotal(playerCards);
  const bTotal = handTotal(bankerCards);

  const result = {
    playerThird: null,
    bankerThird: null,
    natural: false
  };

  // Natural - both stand
  if (pTotal >= 8 || bTotal >= 8) {
    result.natural = true;
    return result;
  }

  // Player rule
  let playerDrew = false;
  if (pTotal <= 5) {
    result.playerThird = deck.pop();
    playerCards.push(result.playerThird);
    playerDrew = true;
  }

  // Banker rule
  const p3 = result.playerThird ? cardValue(result.playerThird) : null;
  let bankerDraws = false;

  if (!playerDrew) {
    // Player stood on 6 or 7
    if (bTotal <= 5) bankerDraws = true;
  } else {
    // Player drew - complex banker rules
    if (bTotal <= 2) bankerDraws = true;
    else if (bTotal === 3) bankerDraws = (p3 !== 8);
    else if (bTotal === 4) bankerDraws = (p3 >= 2 && p3 <= 7);
    else if (bTotal === 5) bankerDraws = (p3 >= 4 && p3 <= 7);
    else if (bTotal === 6) bankerDraws = (p3 === 6 || p3 === 7);
    // bTotal 7: stands
  }

  if (bankerDraws) {
    result.bankerThird = deck.pop();
    bankerCards.push(result.bankerThird);
  }

  return result;
}

// === PAYOUT CALCULATION ===
function calculatePayout(playerCards, bankerCards, bets) {
  const pTotal = handTotal(playerCards);
  const bTotal = handTotal(bankerCards);
  let winner;
  if (pTotal > bTotal) winner = 'player';
  else if (bTotal > pTotal) winner = 'banker';
  else winner = 'tie';

  // Pairs: first 2 cards same rank
  const playerPair = playerCards[0].rank === playerCards[1].rank;
  const bankerPair = bankerCards[0].rank === bankerCards[1].rank;

  let totalWin = 0;
  const breakdown = {};

  Object.entries(bets).forEach(([bet, amount]) => {
    let win = 0;
    if (bet === 'player' && winner === 'player') {
      win = amount + amount * PAYOUTS.player;
    } else if (bet === 'banker' && winner === 'banker') {
      win = amount + amount * PAYOUTS.banker;
    } else if (bet === 'tie' && winner === 'tie') {
      // Tie bet pays 8:1; player/banker bets push (returned)
      win = amount + amount * PAYOUTS.tie;
    } else if (bet === 'playerPair' && playerPair) {
      win = amount + amount * PAYOUTS.playerPair;
    } else if (bet === 'bankerPair' && bankerPair) {
      win = amount + amount * PAYOUTS.bankerPair;
    } else if ((bet === 'player' || bet === 'banker') && winner === 'tie') {
      // Push - return stake
      win = amount;
    } else {
      win = 0;
    }
    breakdown[bet] = win;
    totalWin += win;
  });

  return { winner, playerPair, bankerPair, totalWin, breakdown, pTotal, bTotal };
}

// === DEAL NOW ===
async function dealNow() {
  if (isDealing || totalBet === 0) return;
  isDealing = true;
  stopBettingWindow();
  document.getElementById('btnDeal').disabled = true;
  document.getElementById('btnClear').disabled = true;

  // Clear previous hand visuals
  document.getElementById('playerCards').innerHTML = '';
  document.getElementById('bankerCards').innerHTML = '';
  document.getElementById('playerScore').textContent = '0';
  document.getElementById('bankerScore').textContent = '0';
  document.getElementById('resultBanner').textContent = '';
  document.getElementById('resultBanner').className = 'result-banner';
  document.getElementById('handPlayer').classList.remove('hand-winner');
  document.getElementById('handBanker').classList.remove('hand-winner');

  // === ANIMATION SEQUENCE ===
  // 1. Dealer cuts the deck (animation)
  setDealerBubble('Cutting the deck');
  setDealerPose('cutting');
  animateDeckShuffle();
  await delay(900);

  // 2. Build deck and "burn" top card (visual flourish)
  const deck = createDeck();
  deck.pop(); // burn

  // 3. Deal cards alternately: P, B, P, B (+ optional third cards)
  const playerCards = [];
  const bankerCards = [];
  await dealSequence(deck, playerCards, bankerCards);
}

async function dealSequence(deck, playerCards, bankerCards) {
  setDealerPose('dealing');
  setDealerBubble('Dealing cards');

  // Player 1
  let c = deck.pop();
  playerCards.push(c);
  await renderCard(c, 'playerCards');
  await delay(350);

  // Banker 1
  c = deck.pop();
  bankerCards.push(c);
  await renderCard(c, 'bankerCards');
  await delay(350);

  // Player 2
  c = deck.pop();
  playerCards.push(c);
  await renderCard(c, 'playerCards');
  await delay(350);

  // Banker 2
  c = deck.pop();
  bankerCards.push(c);
  await renderCard(c, 'bankerCards');
  await delay(400);

  updateScore('player', playerCards);
  updateScore('banker', bankerCards);

  // Check for naturals
  const pTotal = handTotal(playerCards);
  const bTotal = handTotal(bankerCards);
  if (pTotal >= 8 || bTotal >= 8) {
    setDealerBubble('Natural!');
    setDealerPose('reveal');
    await delay(800);
    return finishRound(deck, playerCards, bankerCards);
  }

  // Third card phase
  setDealerBubble('Drawing third card');
  setDealerPose('dealing');

  const thirdResult = applyThirdCardRules(playerCards, bankerCards, deck);

  if (thirdResult.playerThird) {
    await renderCard(thirdResult.playerThird, 'playerCards');
    updateScore('player', playerCards);
    await delay(450);
  }
  if (thirdResult.bankerThird) {
    await renderCard(thirdResult.bankerThird, 'bankerCards');
    updateScore('banker', bankerCards);
    await delay(450);
  }

  setDealerBubble('Revealing result');
  setDealerPose('reveal');
  await delay(700);

  return finishRound(deck, playerCards, bankerCards);
}

function updateScore(side, cards) {
  const total = handTotal(cards);
  document.getElementById(side + 'Score').textContent = total;
}

async function renderCard(card, containerId) {
  const container = document.getElementById(containerId);
  const cardEl = document.createElement('div');
  cardEl.className = 'play-card';
  cardEl.innerHTML = `
    <div class="play-card-inner">
      <div class="play-card-back">
        <div class="play-card-back-pattern">A26</div>
      </div>
      <div class="play-card-face ${card.color}">
        <div class="card-corner top">
          <div class="card-rank">${card.rank}</div>
          <div class="card-suit-sm">${card.suit}</div>
        </div>
        <div class="card-center">${card.suit}</div>
        <div class="card-corner bottom">
          <div class="card-rank">${card.rank}</div>
          <div class="card-suit-sm">${card.suit}</div>
        </div>
      </div>
    </div>
  `;
  container.appendChild(cardEl);
  // Slide-in + flip animation
  cardEl.classList.add('slide-in');
  await delay(50);
  cardEl.classList.add('flip');
  await delay(450);
}

async function finishRound(deck, playerCards, bankerCards) {
  const result = calculatePayout(playerCards, bankerCards, bets);

  balance += result.totalWin;
  lastWin = result.totalWin;

  // Update localStorage user
  const user = Auth.getUser();
  if (user) {
    user.balance = balance;
    localStorage.setItem('a26_user', JSON.stringify(user));
  }

  // Show result banner
  const banner = document.getElementById('resultBanner');
  let bannerText = '';
  let bannerCls = 'result-banner show';
  if (result.winner === 'player') {
    bannerText = 'PLAYER WINS';
    bannerCls += ' win-player';
  } else if (result.winner === 'banker') {
    bannerText = 'BANKER WINS';
    bannerCls += ' win-banker';
  } else {
    bannerText = 'TIE';
    bannerCls += ' win-tie';
  }
  if (result.playerPair) bannerText += ' · P PAIR';
  if (result.bankerPair) bannerText += ' · B PAIR';
  banner.textContent = bannerText;
  banner.className = bannerCls;

  // Highlight winning hand
  if (result.winner === 'player') {
    document.getElementById('handPlayer').classList.add('hand-winner');
  } else if (result.winner === 'banker') {
    document.getElementById('handBanker').classList.add('hand-winner');
  }

  setDealerBubble(result.totalWin > 0 ? `You won ₹${result.totalWin.toLocaleString('en-IN')}!` : 'Better luck next round');

  // Save history
  history.unshift({
    round,
    winner: result.winner,
    playerTotal: result.pTotal,
    bankerTotal: result.bTotal,
    playerPair: result.playerPair,
    bankerPair: result.bankerPair,
    bet: totalBet,
    won: result.totalWin
  });
  updateHistory();
  updateScoreboard();

  if (result.totalWin > 0) launchConfetti();

  // Persist bet to backend (best-effort)
  try {
    await Auth.api('/api/player/bet', {
      method: 'POST',
      body: JSON.stringify({
        roundId: 'round_' + round,
        house: result.winner,
        amount: totalBet,
        winnings: result.totalWin,
        result: result.winner,
        finalBalance: balance
      })
    });
  } catch (e) {
    // ignore network errors - game still works client-side
    console.log('Server sync skipped:', e.message);
  }

  round++;
  updateBalanceUI();

  await delay(3000);
  // Reset for next round
  resetRound();
}

function resetRound() {
  bets = {};
  totalBet = 0;
  document.querySelectorAll('.bet-tile-chips').forEach(el => el.innerHTML = '');
  document.getElementById('handPlayer').classList.remove('hand-winner');
  document.getElementById('handBanker').classList.remove('hand-winner');
  document.getElementById('playerCards').innerHTML = '';
  document.getElementById('bankerCards').innerHTML = '';
  document.getElementById('playerScore').textContent = '0';
  document.getElementById('bankerScore').textContent = '0';
  document.getElementById('btnClear').disabled = false;
  document.getElementById('resultBanner').textContent = '';
  document.getElementById('resultBanner').className = 'result-banner';
  isDealing = false;
  updateBalanceUI();
  startBettingWindow();
}

// === HISTORY ===
function updateHistory() {
  const list = document.getElementById('historyList');
  list.innerHTML = '';
  history.slice(0, 20).forEach(h => {
    const div = document.createElement('div');
    div.className = 'history-item';
    const net = h.won - h.bet;
    let winnerCls = 'tie';
    let winnerLbl = 'T';
    if (h.winner === 'player') { winnerCls = 'player'; winnerLbl = 'P'; }
    else if (h.winner === 'banker') { winnerCls = 'banker'; winnerLbl = 'B'; }
    div.innerHTML = `
      <div class="hist-bead ${winnerCls}">${winnerLbl}</div>
      <div class="hist-totals">P${h.playerTotal} · B${h.bankerTotal}</div>
      <div class="hist-net ${net >= 0 ? 'win' : 'lose'}">${net >= 0 ? '+' : ''}₹${net.toLocaleString('en-IN')}</div>
    `;
    list.appendChild(div);
  });
}

// === DECK SHUFFLE ANIMATION ===
function animateDeckShuffle() {
  const deck = document.getElementById('deckStack');
  deck.classList.add('shuffling');
  // Show "cut card" overlay
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
  }, 1500);
}

// === RULES TOGGLE ===
function toggleRules() {
  document.getElementById('rulesPanel').classList.toggle('show');
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
