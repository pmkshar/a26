// A26 Game Logic - Connected to Backend API

// Check auth
Auth.requireAuth();

// === GAME STATE ===
const HOUSES = ['A', '2', '3', '4', '5', '6'];
const CARD_VALUES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS = [
  { sym: '♠', color: 'black' },
  { sym: '♥', color: 'red' },
  { sym: '♦', color: 'red' },
  { sym: '♣', color: 'black' }
];

let balance = 0;
let bets = {};
let round = 1;
let history = [];
let isDealing = false;
let currentRoundId = null;

// === INIT ===
document.addEventListener('DOMContentLoaded', async () => {
  Auth.updateNav();
  
  // Load user balance
  const user = Auth.getUser();
  if (user) {
    balance = user.balance || 0;
    updateUI();
  }
  
  initHouses();
  setupQuickBets();
  
  // Create initial round
  try {
    const data = await Auth.api('/api/admin/rounds', { method: 'POST' });
    currentRoundId = data.round.id;
  } catch (err) {
    // If not admin, we'll create rounds client-side for now
    console.log('Round creation requires admin');
  }
});

// === INIT HOUSES ===
function initHouses() {
  const grid = document.getElementById('housesGrid');
  grid.innerHTML = '';
  HOUSES.forEach(h => {
    const div = document.createElement('div');
    div.className = 'house';
    div.dataset.house = h;
    div.innerHTML = `
      <div class="house-label">${h}</div>
      <div class="house-dots">${'<div class="house-dot"></div>'.repeat(6)}</div>
      <div class="house-bets" id="bets-${h}"></div>
    `;
    div.addEventListener('click', () => selectHouse(h));
    grid.appendChild(div);
  });
}

function setupQuickBets() {
  document.querySelectorAll('.quick-bet').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('betInput').value = btn.dataset.amount;
      updateDealButton();
    });
  });
  document.getElementById('betInput').addEventListener('input', updateDealButton);
}

// === SELECT HOUSE ===
function selectHouse(house) {
  if (isDealing) return;
  document.querySelectorAll('.house').forEach(el => {
    if (el.dataset.house === house) el.classList.toggle('selected');
  });
  const selected = document.querySelectorAll('.house.selected');
  if (selected.length === 1) {
    document.getElementById('selectedHouseDisplay').textContent = 'House: ' + selected[0].dataset.house;
  } else if (selected.length > 1) {
    document.getElementById('selectedHouseDisplay').textContent = selected.length + ' houses selected';
  } else {
    document.getElementById('selectedHouseDisplay').textContent = 'Select a house';
  }
  updateDealButton();
}

function updateDealButton() {
  const amount = parseInt(document.getElementById('betInput').value) || 0;
  const selected = document.querySelectorAll('.house.selected');
  const canDeal = selected.length > 0 && amount >= 2000 && amount <= 60000;
  document.getElementById('btnDeal').disabled = !canDeal;
}

// === CREATE DECK ===
function createDeck() {
  const deck = [];
  CARD_VALUES.forEach(val => {
    SUITS.forEach(suit => {
      deck.push({ value: val, suit: suit.sym, color: suit.color });
    });
  });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// === DEAL CARDS ===
async function dealCards() {
  if (isDealing) return;
  
  const amount = parseInt(document.getElementById('betInput').value) || 0;
  if (amount < 2000 || amount > 60000) {
    alert('Bet must be between ₹2,000 and ₹60,000');
    return;
  }
  
  const selected = document.querySelectorAll('.house.selected');
  if (selected.length === 0) {
    alert('Please select at least one house');
    return;
  }
  
  const totalNeeded = amount * selected.length;
  if (totalNeeded > balance) {
    alert('Insufficient balance! You need ₹' + totalNeeded.toLocaleString('en-IN'));
    return;
  }
  
  isDealing = true;
  document.getElementById('btnDeal').disabled = true;
  document.getElementById('btnClear').disabled = true;

  const statusEl = document.getElementById('dealerStatus');
  statusEl.textContent = 'Shuffling...';

  // Place bets client-side (for demo)
  bets = {};
  let total = 0;
  selected.forEach(el => {
    const h = el.dataset.house;
    bets[h] = amount;
    total += amount;
  });
  balance -= total;
  updateUI();
  
  selected.forEach(el => {
    const h = el.dataset.house;
    document.getElementById('bets-' + h).innerHTML = `<span class="bet-chip">₹${bets[h].toLocaleString('en-IN')}</span>`;
  });

  // Reset cards
  for (let i = 1; i <= 3; i++) {
    const slot = document.getElementById('card' + i);
    slot.classList.remove('revealed', 'match');
    slot.querySelector('.card-back').style.display = '';
    slot.querySelector('.card-face').style.display = 'none';
  }

  // Create and pick cards
  const deck = createDeck();
  const drawn = [deck[0], deck[1], deck[2]];

  await delay(800);
  statusEl.textContent = 'Drawing cards...';

  for (let i = 0; i < 3; i++) {
    const slot = document.getElementById('card' + (i + 1));
    slot.classList.add('revealed');
    const card = drawn[i];
    slot.querySelector('.card-face').style.display = 'flex';
    slot.querySelector('.card-back').style.display = 'none';
    const valEl = slot.querySelector('.card-value');
    const suitEl = slot.querySelector('.card-suit');
    valEl.textContent = card.value;
    valEl.className = 'card-value ' + card.color;
    suitEl.textContent = card.suit;
    suitEl.style.color = card.color === 'red' ? '#c41e3a' : '#1a1a1a';
    await delay(500);
  }

  // Calculate results
  await delay(300);
  let totalWin = 0;
  let bettedHouses = Object.keys(bets);

  bettedHouses.forEach(h => {
    const matchCount = drawn.filter(c => c.value === h).length;
    if (matchCount > 0) {
      let multiplier = 0;
      if (matchCount === 1) multiplier = 1;
      else if (matchCount === 2) multiplier = 2;
      else if (matchCount === 3) multiplier = 4;
      totalWin += bets[h] * (1 + multiplier);
    }
    drawn.forEach((c, idx) => {
      if (c.value === h) {
        document.getElementById('card' + (idx + 1)).classList.add('match');
      }
    });
  });

  balance += totalWin;

  // Update user in localStorage
  const user = Auth.getUser();
  if (user) {
    user.balance = balance;
    localStorage.setItem('a26_user', JSON.stringify(user));
  }

  await delay(600);
  showResult(drawn, bettedHouses, totalWin, total);

  history.unshift({
    round: round,
    cards: drawn.map(c => c.value),
    bets: { ...bets },
    won: totalWin,
    bet: total
  });
  updateHistory();

  round++;
  isDealing = false;

  if (totalWin > 0) {
    launchConfetti();
  }
}

function showResult(drawn, bettedHouses, totalWin, totalBet) {
  const overlay = document.getElementById('resultOverlay');
  const title = document.getElementById('resultTitle');
  const cardsEl = document.getElementById('resultCards');
  const matchesEl = document.getElementById('resultMatches');
  const amountEl = document.getElementById('resultAmount');

  cardsEl.textContent = 'Cards drawn: ' + drawn.map(c => c.value + c.suit).join('  ');

  let matchDetails = [];
  bettedHouses.forEach(h => {
    const mc = drawn.filter(c => c.value === h).length;
    if (mc > 0) {
      const ratio = mc === 1 ? '1:1' : mc === 2 ? '1:2' : '1:4';
      matchDetails.push(`House ${h}: ${mc} match${mc > 1 ? 'es' : ''} (${ratio})`);
    } else {
      matchDetails.push(`House ${h}: No match`);
    }
  });
  matchesEl.innerHTML = matchDetails.join('<br>');

  if (totalWin > 0) {
    title.textContent = 'You Win!';
    amountEl.innerHTML = `<div class="win-amount">+₹${totalWin.toLocaleString('en-IN')}</div><div style="font-size:0.8rem;color:#aaa;margin-top:4px;">Net: ₹${(totalWin - totalBet).toLocaleString('en-IN')}</div>`;
  } else {
    title.textContent = 'No Luck';
    amountEl.innerHTML = `<div class="lose-text">-₹${totalBet.toLocaleString('en-IN')}</div>`;
  }

  overlay.classList.add('show');
  document.getElementById('dealerStatus').textContent = totalWin > 0 ? 'Congratulations!' : 'Better luck next time!';
}

function closeResult() {
  document.getElementById('resultOverlay').classList.remove('show');
  resetRound();
}

function resetRound() {
  bets = {};
  document.getElementById('betInput').value = '';
  document.querySelectorAll('.house').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.house-bets').forEach(el => el.innerHTML = '');
  document.getElementById('selectedHouseDisplay').textContent = 'Select a house';
  document.getElementById('dealerStatus').textContent = 'Place your bets';
  for (let i = 1; i <= 3; i++) {
    const slot = document.getElementById('card' + i);
    slot.classList.remove('revealed', 'match');
    slot.querySelector('.card-back').style.display = '';
    slot.querySelector('.card-face').style.display = 'none';
  }
  document.getElementById('btnClear').disabled = false;
  updateUI();
}

function clearBets() {
  if (isDealing) return;
  document.querySelectorAll('.house').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.house-bets').forEach(el => el.innerHTML = '');
  document.getElementById('selectedHouseDisplay').textContent = 'Select a house';
  document.getElementById('betInput').value = '';
  updateDealButton();
}

function updateUI() {
  document.getElementById('balance').textContent = '₹' + balance.toLocaleString('en-IN');
  const tb = Object.values(bets).reduce((a, b) => a + b, 0);
  document.getElementById('totalBet').textContent = '₹' + tb.toLocaleString('en-IN');
  document.getElementById('roundNum').textContent = round;
  document.getElementById('nav-balance').textContent = '₹' + balance.toLocaleString('en-IN');
}

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

function toggleRules() {
  document.getElementById('rulesPanel').classList.toggle('show');
}

function launchConfetti() {
  const colors = ['#d4a843', '#f0d68a', '#c41e3a', '#2ecc71', '#fff'];
  for (let i = 0; i < 60; i++) {
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
