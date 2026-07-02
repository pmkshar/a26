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
app.use(express.static('public'));

// Data storage
const DATA_FILE = path.join(__dirname, 'data.json');

// Initialize data
async function initData() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    const initialData = {
      users: [
        {
          id: 'admin1',
          username: 'admin',
          password: await bcrypt.hash('admin123', 10),
          role: 'admin',
          createdAt: new Date().toISOString()
        }
      ],
      players: [],
      rounds: [],
      bets: []
    };
    await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
  }
}

async function loadData() {
  const data = await fs.readFile(DATA_FILE, 'utf-8');
  return JSON.parse(data);
}

async function saveData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
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

// === PLAYER ROUTES ===

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

// Place bet
app.post('/api/player/bet', authenticateToken, async (req, res) => {
  try {
    const { roundId, house, amount } = req.body;

    if (!roundId || !house || !amount) {
      return res.status(400).json({ error: 'Round ID, house, and amount required' });
    }

    if (amount < 2000 || amount > 60000) {
      return res.status(400).json({ error: 'Bet must be between ₹2,000 and ₹60,000' });
    }

    const data = await loadData();
    const user = data.users.find(u => u.id === req.user.id);

    if (user.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    user.balance -= amount;

    const bet = {
      id: 'bet_' + Date.now(),
      playerId: req.user.id,
      roundId,
      house,
      amount,
      winnings: 0,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    data.bets.push(bet);
    await saveData(data);

    res.json({ bet, newBalance: user.balance });
  } catch (error) {
    console.error('Bet error:', error);
    res.status(500).json({ error: 'Failed to place bet' });
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
        balance: u.balance,
        phone: u.phone,
        email: u.email,
        createdAt: u.createdAt,
        totalBets: data.bets.filter(b => b.playerId === u.id).length,
        totalWinnings: data.bets.filter(b => b.playerId === u.id).reduce((sum, b) => sum + (b.winnings || 0), 0)
      }));

    res.json({ players });
  } catch (error) {
    console.error('Get players error:', error);
    res.status(500).json({ error: 'Failed to load players' });
  }
});

// Update player balance
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

    res.json({
      totalPlayers: players.length,
      totalRounds: data.rounds.length,
      totalBets,
      totalPayout,
      profit: totalBets - totalPayout,
      activeRounds: data.rounds.filter(r => r.status === 'open').length
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
initData().then(() => {
  app.listen(PORT, () => {
    console.log(`A26 Server running on http://localhost:${PORT}`);
    console.log('Default admin credentials: admin / admin123');
  });
});
