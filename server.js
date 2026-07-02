const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'a26-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());

// Static file serving - resolve path relative to this file so it works on Vercel
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

// Data storage - use /tmp on Vercel (serverless, read-only fs except /tmp)
// On local dev, use project dir for persistence.
const isVercel = !!process.env.VERCEL;
const DATA_FILE = isVercel
  ? '/tmp/a26-data.json'
  : path.join(__dirname, 'data.json');

// Initialize data
async function initData() {
  let data;
  let existed = false;
  try {
    await fs.access(DATA_FILE);
    existed = true;
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    data = JSON.parse(raw);
  } catch {
    data = {
      users: [],
      players: [],
      rounds: [],
      bets: []
    };
  }

  // Ensure the admin account exists with a ₹200,000 balance.
  // This is idempotent: if admin already exists with a balance, we leave it
  // alone (so admin credits/deductions persist). If admin exists WITHOUT a
  // balance field (legacy), we set it to 200000. If admin doesn't exist,
  // we create it with 200000.
  const ADMIN_USERNAME = 'admin';
  const ADMIN_PASSWORD = 'admin123';
  const ADMIN_INITIAL_BALANCE = 200000;
  let admin = data.users.find(u => u.username === ADMIN_USERNAME && u.role === 'admin');
  if (!admin) {
    admin = {
      id: 'admin1',
      username: ADMIN_USERNAME,
      password: await bcrypt.hash(ADMIN_PASSWORD, 10),
      role: 'admin',
      balance: ADMIN_INITIAL_BALANCE,
      createdAt: new Date().toISOString()
    };
    data.users.push(admin);
  } else if (typeof admin.balance !== 'number') {
    admin.balance = ADMIN_INITIAL_BALANCE;
  }

  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (writeErr) {
    console.error('Failed to write data file:', writeErr);
  }
}

async function loadData() {
  // Ensure file exists before reading (handles cold-start race condition on Vercel)
  await initData();
  try {
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('loadData error, returning default:', err.message);
    return { users: [], players: [], rounds: [], bets: [] };
  }
}

async function saveData(data) {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('saveData error:', err.message);
    throw err;
  }
}

// Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// === AUTH ROUTES ===

// Register player
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, phone, email } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const data = await loadData();
    
    // Check if user exists
    if (data.users.find(u => u.username === username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = 'player_' + Date.now();

    const newUser = {
      id: userId,
      username,
      password: hashedPassword,
      role: 'player',
      phone: phone || '',
      email: email || '',
      balance: 100000, // Starting balance
      createdAt: new Date().toISOString()
    };

    data.users.push(newUser);
    await saveData(data);

    const token = jwt.sign(
      { id: userId, username, role: 'player' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: userId,
        username,
        role: 'player',
        balance: newUser.balance
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const data = await loadData();
    const user = data.users.find(u => u.username === username);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        balance: user.balance || 0
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// === ME (current user, any role) ===
app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const data = await loadData();
    const user = data.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      balance: user.balance || 0,
      email: user.email,
      phone: user.phone,
      createdAt: user.createdAt
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Get player dashboard
app.get('/api/player/dashboard', authenticateToken, async (req, res) => {
  try {
    const data = await loadData();
    const user = data.users.find(u => u.id === req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const playerBets = data.bets.filter(b => b.playerId === req.user.id);
    const playerRounds = data.rounds.filter(r => 
      playerBets.some(b => b.roundId === r.id)
    );

    const totalBets = playerBets.reduce((sum, b) => sum + b.amount, 0);
    const totalWins = playerBets.reduce((sum, b) => sum + (b.winnings || 0), 0);
    const netProfit = totalWins - totalBets;

    res.json({
      user: {
        id: user.id,
        username: user.username,
        balance: user.balance,
        phone: user.phone,
        email: user.email,
        createdAt: user.createdAt
      },
      stats: {
        totalBets,
        totalWins,
        netProfit,
        roundsPlayed: playerRounds.length,
        winRate: playerRounds.length > 0 
          ? (playerRounds.filter(r => playerBets.some(b => b.roundId === r.id && b.winnings > 0)).length / playerRounds.length * 100).toFixed(1)
          : 0
      },
      recentBets: playerBets.slice(-10).reverse(),
      recentRounds: playerRounds.slice(-10).reverse()
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// Place bet / Record round result (baccarat settles client-side for snappy UX)
app.post('/api/player/bet', authenticateToken, async (req, res) => {
  try {
    const { roundId, house, amount, betType, result, winnings, finalBalance } = req.body;

    if (!roundId) {
      return res.status(400).json({ error: 'Round ID required' });
    }

    const data = await loadData();
    const user = data.users.find(u => u.id === req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Record the bet/round outcome
    const bet = {
      id: 'bet_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      playerId: req.user.id,
      roundId,
      house: house || betType || (result || 'unknown'),
      amount: amount || 0,
      winnings: winnings || 0,
      result: result || null,
      status: 'completed',
      createdAt: new Date().toISOString()
    };

    data.bets.push(bet);

    // Sync user balance to client-reported value (client is source of truth for live game)
    if (typeof finalBalance === 'number' && finalBalance >= 0) {
      user.balance = finalBalance;
    }

    await saveData(data);

    res.json({ bet, newBalance: user.balance });
  } catch (error) {
    console.error('Bet error:', error);
    res.status(500).json({ error: 'Failed to record bet' });
  }
});

// === ADMIN ROUTES ===

// Get all players
app.get('/api/admin/players', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const data = await loadData();
    const players = data.users
      .filter(u => u.role === 'player')
      .map(u => ({
        id: u.id,
        username: u.username,
        balance: u.balance || 0,
        phone: u.phone,
        email: u.email,
        createdAt: u.createdAt,
        totalBets: data.bets.filter(b => b.playerId === u.id).length,
        totalWinnings: data.bets.filter(b => b.playerId === u.id).reduce((sum, b) => sum + (b.winnings || 0), 0),
        ledgerCount: (u.ledger || []).length
      }));

    res.json({ players });
  } catch (error) {
    console.error('Get players error:', error);
    res.status(500).json({ error: 'Failed to load players' });
  }
});

// Update player balance (sets absolute balance)
app.put('/api/admin/players/:id/balance', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { balance } = req.body;
    const data = await loadData();
    const user = data.users.find(u => u.id === req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'Player not found' });
    }

    user.balance = balance;
    await saveData(data);

    res.json({ success: true, newBalance: user.balance });
  } catch (error) {
    console.error('Update balance error:', error);
    res.status(500).json({ error: 'Failed to update balance' });
  }
});

// Credit (add coins) to a player — ADDS the amount to current balance.
// Supports negative amounts for deductions. Records a ledger entry for audit.
app.post('/api/admin/players/:id/credit', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { amount, note } = req.body;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt === 0) {
      return res.status(400).json({ error: 'A non-zero numeric amount is required' });
    }
    const data = await loadData();
    const user = data.users.find(u => u.id === req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Player not found' });
    }
    const previousBalance = user.balance || 0;
    const newBalance = previousBalance + amt;
    if (newBalance < 0) {
      return res.status(400).json({ error: 'Resulting balance cannot be negative' });
    }
    user.balance = newBalance;

    // Append to ledger for audit
    if (!Array.isArray(user.ledger)) user.ledger = [];
    user.ledger.push({
      type: amt > 0 ? 'credit' : 'debit',
      amount: amt,
      previousBalance,
      newBalance,
      note: note || (amt > 0 ? 'Admin credit' : 'Admin debit'),
      by: req.user.username,
      at: new Date().toISOString()
    });

    await saveData(data);
    res.json({
      success: true,
      previousBalance,
      credited: amt,
      newBalance: user.balance,
      ledger: user.ledger.slice(-5)
    });
  } catch (error) {
    console.error('Credit error:', error);
    res.status(500).json({ error: 'Failed to credit player' });
  }
});

// Get a player's ledger (recent admin credits/debits)
app.get('/api/admin/players/:id/ledger', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const data = await loadData();
    const user = data.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Player not found' });
    res.json({ ledger: (user.ledger || []).slice(-20).reverse() });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load ledger' });
  }
});

// Create new round
app.post('/api/admin/rounds', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const data = await loadData();

    const round = {
      id: 'round_' + Date.now(),
      status: 'open',
      cards: [],
      createdAt: new Date().toISOString()
    };

    data.rounds.push(round);
    await saveData(data);

    res.json({ round });
  } catch (error) {
    console.error('Create round error:', error);
    res.status(500).json({ error: 'Failed to create round' });
  }
});

// Deal cards for round
app.post('/api/admin/rounds/:id/deal', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const data = await loadData();
    const round = data.rounds.find(r => r.id === req.params.id);

    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }

    // Generate 3 random cards
    const cardValues = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    const suits = ['♠','♥','♦','♣'];
    
    const cards = [];
    for (let i = 0; i < 3; i++) {
      cards.push({
        value: cardValues[Math.floor(Math.random() * cardValues.length)],
        suit: suits[Math.floor(Math.random() * suits.length)]
      });
    }

    round.cards = cards;
    round.status = 'dealt';
    round.dealtAt = new Date().toISOString();

    // Calculate winnings for all bets in this round
    const roundBets = data.bets.filter(b => b.roundId === round.id);
    
    roundBets.forEach(bet => {
      const matches = cards.filter(c => c.value === bet.house).length;
      if (matches === 1) {
        bet.winnings = bet.amount * 2; // 1:1
      } else if (matches === 2) {
        bet.winnings = bet.amount * 3; // 1:2
      } else if (matches === 3) {
        bet.winnings = bet.amount * 5; // 1:4
      } else {
        bet.winnings = 0;
      }
      bet.status = 'completed';

      // Add winnings to player balance
      if (bet.winnings > 0) {
        const player = data.users.find(u => u.id === bet.playerId);
        if (player) {
          player.balance += bet.winnings;
        }
      }
    });

    round.status = 'completed';
    await saveData(data);

    res.json({ round, bets: roundBets });
  } catch (error) {
    console.error('Deal error:', error);
    res.status(500).json({ error: 'Failed to deal cards' });
  }
});

// Get all rounds
app.get('/api/admin/rounds', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const data = await loadData();
    const rounds = data.rounds.map(round => {
      const roundBets = data.bets.filter(b => b.roundId === round.id);
      const totalBets = roundBets.reduce((sum, b) => sum + b.amount, 0);
      const totalPayout = roundBets.reduce((sum, b) => sum + (b.winnings || 0), 0);
      return {
        ...round,
        totalBets,
        totalPayout,
        profit: totalBets - totalPayout,
        betCount: roundBets.length
      };
    });

    res.json({ rounds: rounds.reverse() });
  } catch (error) {
    console.error('Get rounds error:', error);
    res.status(500).json({ error: 'Failed to load rounds' });
  }
});

// Get admin stats
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const data = await loadData();
    const players = data.users.filter(u => u.role === 'player');
    const totalBets = data.bets.reduce((sum, b) => sum + b.amount, 0);
    const totalPayout = data.bets.reduce((sum, b) => sum + (b.winnings || 0), 0);
    const admin = data.users.find(u => u.id === req.user.id);

    res.json({
      totalPlayers: players.length,
      totalRounds: data.rounds.length,
      totalBets,
      totalPayout,
      profit: totalBets - totalPayout,
      activeRounds: data.rounds.filter(r => r.status === 'open').length,
      adminBalance: admin ? (admin.balance || 0) : 0
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// Serve index.html for all other routes (non-API, non-static)
// Note: On Vercel, static files are served by the platform — this only runs locally.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize data file (idempotent - safe to call on every cold start)
initData().catch(err => console.error('Init data error:', err));

// Start HTTP server only when run directly (local dev), not when imported by Vercel serverless
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`A26 Server running on http://localhost:${PORT}`);
    console.log('Default admin credentials: admin / admin123');
  });
}

// Export for Vercel serverless function
module.exports = app;
