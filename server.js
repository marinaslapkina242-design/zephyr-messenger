const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { origin: "*" },
  transports: ['websocket', 'polling']
});

const db = new sqlite3.Database('./database.sqlite');

// ===== ТАБЛИЦЫ (БЕЗ ОШИБКИ duplicate column) =====
db.serialize(() => {
  // Проверяем, есть ли колонка citrus
  db.all("PRAGMA table_info(users)", (err, columns) => {
    if (!err && columns && !columns.some(c => c.name === 'citrus')) {
      db.run("ALTER TABLE users ADD COLUMN citrus INTEGER DEFAULT 0", (err) => {
        if (err && !err.message.includes('duplicate column')) {
          console.error('Ошибка добавления citrus:', err);
        }
      });
    }
  });

  // Создаём таблицы (безопасно)
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    avatar TEXT,
    bio TEXT,
    theme TEXT DEFAULT 'dark',
    citrus INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room TEXT,
    username TEXT,
    text TEXT,
    avatar TEXT,
    type TEXT DEFAULT 'text',
    image TEXT,
    voice TEXT,
    reply_to INTEGER,
    pinned INTEGER DEFAULT 0,
    edited INTEGER DEFAULT 0,
    reactions TEXT DEFAULT '{}',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS stickers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    image TEXT,
    created_by TEXT
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS boosts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    boost_type TEXT,
    expires_at DATETIME
  )`);
});

// ===== ПАПКИ =====
const dirs = ['./public/uploads', './public/voice', './public/images', './public/stickers'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ===== MULTER =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'voice') cb(null, './public/voice');
    else if (file.fieldname === 'image') cb(null, './public/images');
    else if (file.fieldname === 'sticker') cb(null, './public/stickers');
    else cb(null, './public/uploads');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/gif','image/webp','audio/webm','audio/ogg','audio/mpeg'];
    cb(null, allowed.includes(file.mimetype));
  }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('public/uploads'));
app.use('/voice', express.static('public/voice'));
app.use('/images', express.static('public/images'));
app.use('/stickers', express.static('public/stickers'));

// ===== РЕГИСТРАЦИЯ =====
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Заполните все поля!' });
  if (password.length < 3) return res.status(400).json({ error: 'Пароль минимум 3 символа!' });
  
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, row) => {
    if (err) return res.status(500).json({ error: 'Ошибка БД' });
    if (row) return res.status(400).json({ error: 'Пользователь уже существует!' });
    
    const hash = await bcrypt.hash(password, 10);
    db.run(`INSERT INTO users (username, password, avatar, bio, citrus) VALUES (?, ?, ?, ?, ?)`,
      [username, hash, '/uploads/default-avatar.png', 'Новый пользователь!', 0],
      function(err) {
        if (err) return res.status(400).json({ error: 'Ошибка создания' });
        res.json({ success: true, message: 'Регистрация успешна!' });
      }
    );
  });
});

// ===== ЛОГИН =====
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Ошибка БД' });
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Неверный пароль' });
    
    res.json({ success: true, user: { 
      username: user.username, 
      avatar: user.avatar || '/uploads/default-avatar.png', 
      bio: user.bio || '',
      theme: user.theme || 'dark',
      citrus: user.citrus || 0
    }});
  });
});

// ===== ПОЛЬЗОВАТЕЛИ =====
app.get('/users', (req, res) => {
  db.all("SELECT username, avatar, bio, theme, citrus FROM users", (err, rows) => {
    res.json(rows || []);
  });
});

app.get('/user/:username', (req, res) => {
  db.get("SELECT username, avatar, bio, theme, citrus, created_at FROM users WHERE username = ?", 
    [req.params.username], (err, row) => res.json(row || {}));
});

// ===== ОБНОВЛЕНИЯ =====
app.post('/update-theme', (req, res) => {
  db.run("UPDATE users SET theme = ? WHERE username = ?", [req.body.theme, req.body.username], function(err) {
    res.json({ success: !err });
  });
});

app.post('/upload-avatar', upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Нет файла' });
  const avatarPath = '/uploads/' + req.file.filename;
  db.run("UPDATE users SET avatar = ? WHERE username = ?", [avatarPath, req.body.username], function(err) {
    res.json({ success: !err, avatar: avatarPath });
  });
});

app.post('/update-profile', (req, res) => {
  db.run("UPDATE users SET bio = ? WHERE username = ?", [req.body.bio, req.body.username], function(err) {
    res.json({ success: !err });
  });
});

// ===== ЦИТРУСИКИ =====
app.post('/add-citrus', (req, res) => {
  const { username, amount } = req.body;
  db.run("UPDATE users SET citrus = citrus + ? WHERE username = ?", [amount, username], function(err) {
    if (err) return res.status(500).json({ error: 'Ошибка' });
    db.get("SELECT citrus FROM users WHERE username = ?", [username], (err, row) => {
      res.json({ success: true, citrus: row ? row.citrus : 0 });
    });
  });
});

app.post('/buy-boost', (req, res) => {
  const { username, boost_type, cost } = req.body;
  db.get("SELECT citrus FROM users WHERE username = ?", [username], (err, row) => {
    if (!row || row.citrus < cost) {
      return res.status(400).json({ error: 'Недостаточно цитрусиков!' });
    }
    db.run("UPDATE users SET citrus = citrus - ? WHERE username = ?", [cost, username], function(err) {
      if (err) return res.status(500).json({ error: 'Ошибка' });
      const expires = new Date(Date.now() + 30 * 60000).toISOString();
      db.run("INSERT INTO boosts (username, boost_type, expires_at) VALUES (?, ?, ?)",
        [username, boost_type, expires], function(err) {
          db.get("SELECT citrus FROM users WHERE username = ?", [username], (err, row2) => {
            res.json({ success: true, citrus: row2 ? row2.citrus : 0 });
          });
        }
      );
    });
  });
});

app.get('/boosts/:username', (req, res) => {
  db.all("SELECT * FROM boosts WHERE username = ? AND expires_at > datetime('now')", 
    [req.params.username], (err, rows) => res.json(rows || []));
});

app.post('/use-boost', (req, res) => {
  db.run("DELETE FROM boosts WHERE username = ? AND boost_type = ?", 
    [req.body.username, req.body.boost_type], function(err) {
      res.json({ success: !err });
    });
});

// ===== ЗАГРУЗКИ =====
app.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Нет файла' });
  res.json({ success: true, path: '/images/' + req.file.filename });
});

app.post('/upload-voice', upload.single('voice'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Нет файла' });
  res.json({ success: true, path: '/voice/' + req.file.filename });
});

app.post('/upload-sticker', upload.single('sticker'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Нет файла' });
  const stickerPath = '/stickers/' + req.file.filename;
  db.run("INSERT INTO stickers (name, image, created_by) VALUES (?, ?, ?)",
    [req.body.name || 'Стикер', stickerPath, req.body.username], function(err) {
      res.json({ success: !err, path: stickerPath });
    });
});

app.get('/stickers', (req, res) => {
  db.all("SELECT * FROM stickers", (err, rows) => res.json(rows || []));
});

app.delete('/stickers/:id', (req, res) => {
  db.run("DELETE FROM stickers WHERE id = ?", [req.params.id], function(err) {
    res.json({ success: !err });
  });
});

// ===== СООБЩЕНИЯ =====
app.get('/messages/:room', (req, res) => {
  db.all("SELECT * FROM messages WHERE room = ? ORDER BY timestamp ASC LIMIT 200",
    [req.params.room], (err, rows) => res.json(rows || []));
});

app.post('/pin-message', (req, res) => {
  db.run("UPDATE messages SET pinned = ? WHERE id = ?", [req.body.pinned ? 1 : 0, req.body.id], function(err) {
    res.json({ success: !err });
  });
});

app.delete('/message/:id', (req, res) => {
  db.run("DELETE FROM messages WHERE id = ?", [req.params.id], function(err) {
    res.json({ success: !err });
  });
});

app.put('/message/:id', (req, res) => {
  db.run("UPDATE messages SET text = ?, edited = 1 WHERE id = ?", [req.body.text, req.params.id], function(err) {
    res.json({ success: !err });
  });
});

// ===== WEBSOCKETS =====
const users = {};

io.on('connection', (socket) => {
  console.log('🔌 Подключился:', socket.id);

  socket.on('join', ({ username, room }) => {
    users[socket.id] = { username, room };
    socket.join(room);
    db.all("SELECT * FROM messages WHERE room = ? ORDER BY timestamp ASC LIMIT 50", [room], (err, rows) => {
      socket.emit('chat history', rows || []);
    });
    io.to(room).emit('user joined', { username, online: Object.values(users).filter(u => u.room === room).map(u => u.username) });
  });

  socket.on('chat message', ({ room, username, text, type, image, voice, reply_to }) => {
    db.get("SELECT avatar FROM users WHERE username = ?", [username], (err, user) => {
      const avatar = user ? user.avatar : '/uploads/default-avatar.png';
      const msgText = (text || '').toString().trim();
      
      db.run(
        `INSERT INTO messages (room, username, text, avatar, type, image, voice, reply_to) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [room, username, msgText || ' ', avatar, type || 'text', image || null, voice || null, reply_to || null],
        function(err) {
          if (!err) {
            io.to(room).emit('chat message', {
              id: this.lastID,
              username, 
              text: msgText || ' ',
              avatar,
              type: type || 'text',
              image: image || null,
              voice: voice || null,
              reply_to: reply_to || null,
              pinned: 0,
              edited: 0,
              reactions: '{}',
              timestamp: new Date().toISOString()
            });
          }
        }
      );
    });
  });

  socket.on('reaction', ({ messageId, username, reaction, room }) => {
    db.get("SELECT reactions FROM messages WHERE id = ?", [messageId], (err, row) => {
      if (row) {
        let reactions = JSON.parse(row.reactions || '{}');
        reactions[username] === reaction ? delete reactions[username] : reactions[username] = reaction;
        db.run("UPDATE messages SET reactions = ? WHERE id = ?", [JSON.stringify(reactions), messageId], function(err) {
          if (!err) io.to(room).emit('reaction update', { messageId, reactions });
        });
      }
    });
  });

  socket.on('typing', ({ room, username }) => {
    socket.to(room).emit('typing', { username });
  });

  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      const online = Object.values(users).filter(u => u.room === user.room).map(u => u.username);
      io.to(user.room).emit('user left', { username: user.username, online });
      delete users[socket.id];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`\n🚀 ZEPHYR ЗАПУЩЕН! http://localhost:${PORT}`));
