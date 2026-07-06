const socket = io();
let currentUser = null;
let currentRoom = 'general';
let allUsers = [];
let currentTheme = 'dark';
let voiceRecorder = null;
let voiceChunks = [];
let voiceTimer = null;
let voiceSeconds = 0;
let replyingTo = null;
let pinnedMessageId = null;
let userCitrus = 0;

// ===== ЦИТРУСИКИ =====
function updateCitrusUI() {
  const citrus = userCitrus || 0;
  document.querySelectorAll('#headerCitrus, #gamesCitrus, #shopCitrus, #profileCitrus, #tetrisCitrus, #snakeCitrus').forEach(el => {
    if (el) el.textContent = citrus;
  });
}

async function addCitrus(amount) {
  const res = await fetch('/add-citrus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentUser.username, amount })
  });
  const data = await res.json();
  if (data.success) {
    userCitrus = data.citrus;
    updateCitrusUI();
  }
}

async function buyBoost(boostType, cost) {
  if (userCitrus < cost) {
    alert(`❌ Недостаточно цитрусиков! Нужно ${cost} 🍊`);
    return;
  }
  
  if (!confirm(`Купить буст "${boostType}" за ${cost} 🍊?`)) return;
  
  const res = await fetch('/buy-boost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentUser.username, boost_type: boostType, cost })
  });
  const data = await res.json();
  if (data.success) {
    userCitrus = data.citrus;
    updateCitrusUI();
    alert(`✅ Буст "${boostType}" куплен!`);
    loadBoosts();
  } else {
    alert('❌ ' + (data.error || 'Ошибка'));
  }
}

async function loadBoosts() {
  const res = await fetch(`/boosts/${currentUser.username}`);
  const boosts = await res.json();
  const container = document.getElementById('activeBoosts');
  if (!container) return;
  if (boosts.length === 0) {
    container.textContent = 'Нет активных бустов';
    return;
  }
  container.innerHTML = boosts.map(b => 
    `<span style="background:#1a1a3e;padding:4px 12px;border-radius:20px;border:1px solid #f5b042;margin:4px;display:inline-block;">
      ${b.boost_type} (до ${new Date(b.expires_at).toLocaleTimeString()})
    </span>`
  ).join('');
}

async function useBoost(boostType) {
  const res = await fetch('/use-boost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentUser.username, boost_type: boostType })
  });
  const data = await res.json();
  if (data.success) {
    loadBoosts();
    return true;
  }
  return false;
}

// ===== ЗВУК =====
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.value = 0.15;
    osc.start();
    setTimeout(() => osc.stop(), 200);
    setTimeout(() => { const osc2 = ctx.createOscillator(); osc2.connect(gain); osc2.frequency.value = 1100; osc2.type = 'sine'; osc2.start(); setTimeout(() => osc2.stop(), 150); }, 150);
  } catch(e) {}
}

// ===== ТЕМЫ =====
const themes = {
  dark: { bg: '#0a0a1a', card: '#14142a', border: '#333366', text: '#e0e0ff', accent: '#7b6bff' },
  light: { bg: '#f0f0ff', card: '#ffffff', border: '#ddddee', text: '#222244', accent: '#6b5bff' },
  cosmic: { bg: '#1a0a2e', card: '#2a1a3e', border: '#4a2a6e', text: '#e8d0ff', accent: '#b86bff' }
};

function applyTheme(theme) {
  currentTheme = theme;
  const t = themes[theme] || themes.dark;
  document.documentElement.style.setProperty('--bg', t.bg);
  document.documentElement.style.setProperty('--card', t.card);
  document.documentElement.style.setProperty('--border', t.border);
  document.documentElement.style.setProperty('--text', t.text);
  document.documentElement.style.setProperty('--accent', t.accent);
  document.body.style.background = t.bg;
  document.body.style.color = t.text;
  if (currentUser) {
    fetch('/update-theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser.username, theme })
    });
  }
}

// ===== АВТОРИЗАЦИЯ =====
document.getElementById('loginBtn').onclick = login;
document.getElementById('registerBtn').onclick = register;

async function login() {
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  if (!username || !password) return showError('Заполните поля');
  
  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (data.success) {
    currentUser = data.user;
    userCitrus = data.user.citrus || 0;
    currentTheme = data.user.theme || 'dark';
    applyTheme(currentTheme);
    enterApp();
  } else showError(data.error);
}

async function register() {
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  if (!username || !password || password.length < 3) return showError('Пароль минимум 3 символа');
  
  const res = await fetch('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (data.success) showError('✅ ' + data.message);
  else showError(data.error);
}

function showError(msg) { document.getElementById('loginError').textContent = msg; }

// ===== ВХОД =====
function enterApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainScreen').style.display = 'flex';
  document.getElementById('currentUsername').textContent = currentUser.username;
  updateCitrusUI();
  
  loadUsers();
  loadProfile();
  loadStickers();
  loadBoosts();
  socket.emit('join', { username: currentUser.username, room: currentRoom });
  loadMessages(currentRoom);
  setupSocket();
  setupUI();
  initGames();
}

// ===== СООБЩЕНИЯ =====
async function loadMessages(room) {
  const res = await fetch(`/messages/${room}`);
  const messages = await res.json();
  const box = document.getElementById('messageBox');
  box.innerHTML = '';
  messages.forEach(msg => renderMessage(msg));
  scrollToBottom();
  checkPinned(messages);
}

function renderMessage(msg) {
  const box = document.getElementById('messageBox');
  const div = document.createElement('div');
  div.className = `message ${msg.username === currentUser.username ? 'out' : 'in'}`;
  div.dataset.id = msg.id;
  div.dataset.msg = JSON.stringify(msg);
  
  const time = msg.timestamp ? new Date(msg.timestamp) : new Date();
  const timeStr = time.getHours().toString().padStart(2,'0') + ':' + time.getMinutes().toString().padStart(2,'0');
  
  let content = '';
  if (msg.type === 'image' && msg.image) {
    content = `<img src="${msg.image}" style="max-width:200px;border-radius:12px;cursor:pointer;" onclick="window.open('${msg.image}','_blank')">`;
  } else if (msg.type === 'voice' && msg.voice) {
    content = `<audio controls src="${msg.voice}" style="max-width:180px;height:36px;"></audio>`;
  } else {
    content = msg.text || '';
  }
  
  if (msg.reply_to) {
    content = `<div style="font-size:12px;color:#8888bb;border-left:2px solid #7b6bff;padding-left:8px;margin-bottom:4px;">↩️ Ответ</div>` + content;
  }
  
  let reactionsHtml = '';
  if (msg.reactions) {
    const reactions = JSON.parse(msg.reactions || '{}');
    const reactList = Object.values(reactions);
    if (reactList.length > 0) {
      const counts = {};
      reactList.forEach(r => { counts[r] = (counts[r] || 0) + 1; });
      reactionsHtml = '<div class="reactions">' + Object.entries(counts).map(([emoji, count]) => 
        `<span class="reaction" onclick="toggleReaction(${msg.id}, '${emoji}')">${emoji} ${count}</span>`
      ).join('') + '</div>';
    }
  }
  
  div.innerHTML = `
    <div class="message-wrapper">
      <img src="${msg.avatar || '/uploads/default-avatar.png'}" class="msg-avatar" onerror="this.src='/uploads/default-avatar.png'">
      <div class="msg-content">
        <strong>${msg.username} ${msg.edited ? '(ред.)' : ''} ${msg.pinned ? '📌' : ''}</strong>
        ${content}
        <div class="msg-actions">
          <span class="time">${timeStr}</span>
          <span class="msg-action" onclick="addReaction(${msg.id})">❤️</span>
          ${msg.username === currentUser.username ? `
            <span class="msg-action" onclick="editMessage(${msg.id})">✏️</span>
            <span class="msg-action" onclick="deleteMessage(${msg.id})">🗑️</span>
          ` : ''}
          <span class="msg-action" onclick="replyToMessage(${msg.id})">↩️</span>
          ${!msg.pinned ? `<span class="msg-action" onclick="pinMessage(${msg.id}, true)">📌</span>` : 
            `<span class="msg-action" onclick="pinMessage(${msg.id}, false)">📌 (открепить)</span>`}
        </div>
        ${reactionsHtml}
      </div>
    </div>
  `;
  box.appendChild(div);
  playNotificationSound();
}

function checkPinned(messages) {
  const pinned = messages.find(m => m.pinned);
  if (pinned) {
    document.getElementById('pinnedMessage').style.display = 'block';
    document.getElementById('pinnedText').textContent = pinned.text || '(изображение)';
    pinnedMessageId = pinned.id;
  } else {
    document.getElementById('pinnedMessage').style.display = 'none';
    pinnedMessageId = null;
  }
}

function sendMessage(text, type, image, voice) {
  const msgText = text || '';
  const msgType = type || 'text';
  if (msgType === 'text' && !msgText.trim()) return;
  
  socket.emit('chat message', {
    room: currentRoom,
    username: currentUser.username,
    text: msgText,
    type: msgType,
    image: image || null,
    voice: voice || null,
    reply_to: replyingTo || null
  });
  
  replyingTo = null;
  document.getElementById('msgInput').placeholder = 'Напишите сообщение...';
}

function addReaction(messageId) {
  const emojis = ['❤️', '👍', '😂', '😮', '🔥', '🎉'];
  const emoji = emojis[Math.floor(Math.random() * emojis.length)];
  toggleReaction(messageId, emoji);
}

function toggleReaction(messageId, emoji) {
  socket.emit('reaction', {
    messageId,
    username: currentUser.username,
    reaction: emoji,
    room: currentRoom
  });
}

function editMessage(id) {
  const msgEl = document.querySelector(`.message[data-id="${id}"]`);
  if (!msgEl) return;
  const data = JSON.parse(msgEl.dataset.msg);
  const newText = prompt('Редактировать сообщение:', data.text);
  if (newText && newText.trim()) {
    fetch(`/message/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newText.trim() })
    }).then(() => loadMessages(currentRoom));
  }
}

function deleteMessage(id) {
  if (!confirm('Удалить сообщение?')) return;
  fetch(`/message/${id}`, { method: 'DELETE' }).then(() => loadMessages(currentRoom));
}

function pinMessage(id, pin) {
  fetch('/pin-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, pinned: pin })
  }).then(() => loadMessages(currentRoom));
}

function replyToMessage(id) {
  const msgEl = document.querySelector(`.message[data-id="${id}"]`);
  if (!msgEl) return;
  const data = JSON.parse(msgEl.dataset.msg);
  replyingTo = id;
  document.getElementById('msgInput').placeholder = `↩️ Ответ ${data.username}: ${data.text || '...'}`;
  document.getElementById('msgInput').focus();
}

function searchMessages(query) {
  const messages = document.querySelectorAll('.message');
  messages.forEach(msg => {
    const text = msg.textContent.toLowerCase();
    msg.style.display = text.includes(query.toLowerCase()) ? '' : 'none';
  });
  if (!query) messages.forEach(msg => msg.style.display = '');
}

// ===== СОКЕТЫ =====
function setupSocket() {
  socket.on('chat history', (messages) => {
    const box = document.getElementById('messageBox');
    box.innerHTML = '';
    messages.forEach(msg => renderMessage(msg));
    scrollToBottom();
    checkPinned(messages);
  });

  socket.on('chat message', (data) => {
    renderMessage(data);
    scrollToBottom();
    playNotificationSound();
  });

  socket.on('reaction update', ({ messageId, reactions }) => {
    const msgEl = document.querySelector(`.message[data-id="${messageId}"]`);
    if (msgEl) {
      const data = JSON.parse(msgEl.dataset.msg);
      data.reactions = JSON.stringify(reactions);
      msgEl.dataset.msg = JSON.stringify(data);
      const reactContainer = msgEl.querySelector('.reactions');
      if (reactContainer) {
        const counts = {};
        Object.values(reactions).forEach(r => { counts[r] = (counts[r] || 0) + 1; });
        reactContainer.innerHTML = Object.entries(counts).map(([emoji, count]) => 
          `<span class="reaction" onclick="toggleReaction(${messageId}, '${emoji}')">${emoji} ${count}</span>`
        ).join('');
      }
    }
  });

  socket.on('user joined', ({ username, online }) => {
    updateOnline(online);
    if (username !== currentUser.username) addSystemMessage(`🟢 ${username} присоединился`);
  });

  socket.on('user left', ({ username, online }) => {
    updateOnline(online);
    addSystemMessage(`🔴 ${username} покинул чат`);
  });

  socket.on('typing', ({ username }) => {
    document.getElementById('typingIndicator').textContent = `${username} печатает...`;
    clearTimeout(window.typingTimeout);
    window.typingTimeout = setTimeout(() => document.getElementById('typingIndicator').textContent = '', 2000);
  });

  // ===== ВИДЕОЗВОНКИ (WebRTC) =====
  socket.on('call signal', async ({ signal, type, from }) => {
    if (type === 'offer') {
      if (!confirm(`📞 ${from} звонит вам! Ответить?`)) {
        socket.emit('call signal', { room: signal.room, type: 'reject', from: currentUser.username });
        return;
      }
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        callActive = true;
        callRoom = signal.room;
        showCallUI(true);
        peerConnection = new RTCPeerConnection(configuration);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        peerConnection.ontrack = (event) => {
          remoteStream = event.streams[0];
          const videoEl = document.getElementById('remoteVideo');
          if (videoEl) videoEl.srcObject = remoteStream;
        };
        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('call signal', {
              room: callRoom,
              signal: event.candidate,
              type: 'candidate',
              from: currentUser.username
            });
          }
        };
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('call signal', {
          room: callRoom,
          signal: answer,
          type: 'answer',
          from: currentUser.username
        });
      } catch (e) {
        console.error(e);
        alert('❌ Ошибка ответа на звонок');
        endCall();
      }
    }
    if (type === 'answer' && peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
    }
    if (type === 'candidate' && peerConnection) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(signal));
      } catch (e) {}
    }
    if (type === 'end' || type === 'reject') {
      if (type === 'reject') alert(`❌ ${from} отклонил звонок`);
      endCall();
    }
  });
}

// ===== ВИДЕОЗВОНКИ =====
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let callActive = false;
let callRoom = null;

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

function showCallUI(withVideo) {
  const existing = document.getElementById('callOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'callOverlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background: rgba(0,0,0,0.9);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  `;

  overlay.innerHTML = `
    <div style="position:relative;width:80%;max-width:600px;">
      <video id="remoteVideo" autoplay playsinline style="width:100%;border-radius:16px;background:#1a1a3e;${withVideo ? '' : 'display:none;'}"></video>
      <video id="localVideo" autoplay playsinline muted style="position:absolute;bottom:20px;right:20px;width:150px;border-radius:12px;border:2px solid #7b6bff;background:#1a1a3e;${withVideo ? '' : 'display:none;'}"></video>
      <div style="position:absolute;bottom:30px;left:50%;transform:translateX(-50%);display:flex;gap:20px;">
        <button id="endCallBtn" style="background:#ff6b6b;border:none;color:#fff;padding:16px 24px;border-radius:50%;font-size:24px;cursor:pointer;box-shadow:0 0 30px rgba(255,0,0,0.3);">
          <i class="fas fa-phone-slash"></i>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  if (localStream) {
    const localVideo = document.getElementById('localVideo');
    if (localVideo) localVideo.srcObject = localStream;
  }

  document.getElementById('endCallBtn')?.addEventListener('click', endCall);
}

function endCall() {
  callActive = false;
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  remoteStream = null;
  const overlay = document.getElementById('callOverlay');
  if (overlay) overlay.remove();
  if (callRoom) {
    socket.emit('call signal', {
      room: callRoom,
      type: 'end',
      from: currentUser.username
    });
    callRoom = null;
  }
}

async function startCall(withVideo) {
  if (callActive) { endCall(); return; }
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: withVideo
    });
    callActive = true;
    callRoom = 'call_' + currentRoom;
    showCallUI(withVideo);
    peerConnection = new RTCPeerConnection(configuration);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    peerConnection.ontrack = (event) => {
      remoteStream = event.streams[0];
      const videoEl = document.getElementById('remoteVideo');
      if (videoEl) videoEl.srcObject = remoteStream;
    };
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('call signal', {
          room: callRoom,
          signal: event.candidate,
          type: 'candidate',
          from: currentUser.username
        });
      }
    };
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('call signal', {
      room: callRoom,
      signal: offer,
      type: 'offer',
      from: currentUser.username
    });
  } catch (e) {
    console.error('Ошибка звонка:', e);
    alert('❌ Нет доступа к камере/микрофону!');
    endCall();
  }
}

// ===== UI =====
function setupUI() {
  document.getElementById('sendBtn').onclick = function() {
    const input = document.getElementById('msgInput');
    const text = input.value;
    if (text.trim()) { sendMessage(text); input.value = ''; }
  };
  
  document.getElementById('msgInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = this.value;
      if (text.trim()) { sendMessage(text); this.value = ''; }
    }
  });
  
  document.getElementById('msgInput').addEventListener('input', function() {
    socket.emit('typing', { room: currentRoom, username: currentUser.username });
    const searchInput = document.getElementById('searchInput');
    if (searchInput && searchInput.value) searchMessages(searchInput.value);
  });
  
  document.getElementById('searchToggle').onclick = function() {
    const bar = document.getElementById('searchBar');
    bar.style.display = bar.style.display === 'none' ? 'block' : 'none';
    if (bar.style.display === 'block') document.getElementById('searchInput').focus();
    else { document.getElementById('searchInput').value = ''; searchMessages(''); }
  };
  
  document.getElementById('searchInput').addEventListener('input', function() { searchMessages(this.value); });
  
  document.getElementById('themeToggle').onclick = function() {
    const themesList = ['dark', 'light', 'cosmic'];
    const idx = themesList.indexOf(currentTheme);
    const next = themesList[(idx + 1) % themesList.length];
    applyTheme(next);
  };
  
  document.getElementById('logoutBtn').onclick = () => { if (confirm('Выйти?')) location.reload(); };
  
  document.getElementById('emojiBtn').onclick = () => document.getElementById('emojiPanel').classList.toggle('active');
  
  document.getElementById('stickerBtn').onclick = function() {
    const panel = document.getElementById('stickerPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  };
  
  document.getElementById('stickerUpload').onchange = async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('sticker', file);
    formData.append('username', currentUser.username);
    formData.append('name', file.name);
    const res = await fetch('/upload-sticker', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) loadStickers();
  };
  
  document.getElementById('imageBtn').onclick = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async function(e) {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/upload-image', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) sendMessage('', 'image', data.path);
    };
    input.click();
  };
  
  document.getElementById('voiceBtn').onclick = startRecording;
  document.getElementById('voiceStopBtn').onclick = stopRecording;

  // КНОПКИ ЗВОНКОВ
  document.getElementById('callBtn')?.addEventListener('click', () => startCall(false));
  document.getElementById('videoCallBtn')?.addEventListener('click', () => startCall(true));

  document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
    item.onclick = function() {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      this.classList.add('active');
      const tab = this.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
      const target = document.getElementById(tab + 'Tab');
      if (target) target.style.display = tab === 'chats' ? 'flex' : 'block';
      if (tab === 'profile') { loadProfile(); loadUsers(); }
      if (tab === 'games') { showGame('guess'); updateCitrusUI(); }
      if (tab === 'shop') { updateCitrusUI(); loadBoosts(); }
    };
  });
  
  document.getElementById('newChatBtn').onclick = openNewChatModal;
  document.getElementById('modalClose').onclick = closeModal;
  document.getElementById('modalStartChat').onclick = startChatFromModal;
  window.onclick = function(event) {
    const modal = document.getElementById('newChatModal');
    if (event.target === modal) closeModal();
  };
}

// ===== ГОЛОСОВЫЕ =====
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceRecorder = new MediaRecorder(stream);
    voiceChunks = [];
    voiceSeconds = 0;
    
    voiceRecorder.ondataavailable = (e) => voiceChunks.push(e.data);
    voiceRecorder.onstop = async () => {
      const blob = new Blob(voiceChunks, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('voice', blob, 'voice.webm');
      const res = await fetch('/upload-voice', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) sendMessage('', 'voice', data.path);
      document.getElementById('voiceRecording').style.display = 'none';
      clearInterval(voiceTimer);
    };
    
    voiceRecorder.start();
    document.getElementById('voiceRecording').style.display = 'block';
    document.getElementById('voiceTimer').textContent = '0:00';
    voiceTimer = setInterval(() => {
      voiceSeconds++;
      const min = String(Math.floor(voiceSeconds / 60)).padStart(2, '0');
      const sec = String(voiceSeconds % 60).padStart(2, '0');
      document.getElementById('voiceTimer').textContent = `${min}:${sec}`;
    }, 1000);
  } catch(e) { alert('❌ Нет доступа к микрофону!'); }
}

function stopRecording() {
  if (voiceRecorder && voiceRecorder.state === 'recording') {
    voiceRecorder.stop();
    voiceRecorder.stream.getTracks().forEach(t => t.stop());
  }
}

// ===== СТИКЕРЫ =====
async function loadStickers() {
  const res = await fetch('/stickers');
  const stickers = await res.json();
  const list = document.getElementById('stickerList');
  list.innerHTML = '';
  stickers.forEach(s => {
    const div = document.createElement('div');
    div.style.cssText = 'cursor:pointer;border:1px solid #333366;border-radius:12px;padding:4px;background:#1a1a3e;';
    div.innerHTML = `<img src="${s.image}" style="width:50px;height:50px;object-fit:contain;">`;
    div.onclick = () => {
      sendMessage(s.name || 'Стикер', 'image', s.image);
      document.getElementById('stickerPanel').style.display = 'none';
    };
    list.appendChild(div);
  });
}

// ===== ПОЛЬЗОВАТЕЛИ =====
async function loadUsers() {
  const res = await fetch('/users');
  const users = await res.json();
  allUsers = users;
  const list = document.getElementById('usersList');
  list.innerHTML = '';
  users.forEach(user => {
    const div = document.createElement('div');
    div.className = 'user-card';
    div.innerHTML = `
      <img src="${user.avatar || '/uploads/default-avatar.png'}" class="user-avatar">
      <div class="user-name">${user.username}</div>
      <div class="user-bio">${user.bio || 'Нет био'}</div>
      <div style="font-size:12px;color:#f5b042;">🍊 ${user.citrus || 0}</div>
    `;
    if (user.username !== currentUser.username) {
      div.onclick = () => startPersonalChat(user.username);
    } else {
      div.style.opacity = '0.5';
      div.style.cursor = 'default';
      div.innerHTML += '<div style="font-size:10px;color:#4caf84;">⭐ Это вы</div>';
    }
    list.appendChild(div);
  });
}

// ===== ЛИЧНЫЕ ЧАТЫ =====
function startPersonalChat(username) {
  const room = `dm_${[currentUser.username, username].sort().join('_')}`;
  let exists = false, existingEl = null;
  document.querySelectorAll('.chat-item[data-personal]').forEach(el => {
    if (el.dataset.personal === username) { exists = true; existingEl = el; }
  });
  if (exists) { if (existingEl) existingEl.click(); return; }
  
  const list = document.getElementById('chatList');
  const div = document.createElement('div');
  div.className = 'chat-item';
  div.dataset.room = room;
  div.dataset.personal = username;
  div.innerHTML = `
    <div class="avatar">👤</div>
    <div>
      <div class="name">${username}</div>
      <div class="msg">💬 Личный чат</div>
    </div>
  `;
  div.onclick = () => switchRoom(room, username);
  list.appendChild(div);
  switchRoom(room, username);
}

function switchRoom(room, name) {
  currentRoom = room;
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.chat-item').forEach(el => {
    if (el.dataset.room === room) el.classList.add('active');
  });
  document.getElementById('currentRoomName').textContent = name || 'Общий чат';
  document.getElementById('messageBox').innerHTML = '';
  socket.emit('join', { username: currentUser.username, room });
  loadMessages(room);
}

// ===== МОДАЛЬНОЕ ОКНО =====
function openNewChatModal() {
  const modal = document.getElementById('newChatModal');
  const select = document.getElementById('userSelect');
  select.innerHTML = '<option value="">-- Выберите пользователя --</option>';
  allUsers.forEach(user => {
    if (user.username !== currentUser.username) {
      const option = document.createElement('option');
      option.value = user.username;
      option.textContent = user.username + (user.bio ? ' — ' + user.bio : '');
      select.appendChild(option);
    }
  });
  if (select.options.length <= 1) {
    select.innerHTML = '<option value="">-- Нет доступных пользователей --</option>';
    document.getElementById('modalStartChat').disabled = true;
  } else document.getElementById('modalStartChat').disabled = false;
  modal.style.display = 'flex';
}

function closeModal() { document.getElementById('newChatModal').style.display = 'none'; }

function startChatFromModal() {
  const select = document.getElementById('userSelect');
  const username = select.value;
  if (!username) return;
  closeModal();
  startPersonalChat(username);
}

// ===== ПРОФИЛЬ =====
async function loadProfile() {
  try {
    const res = await fetch(`/user/${currentUser.username}`);
    const user = await res.json();
    document.getElementById('profileName').textContent = user.username;
    document.getElementById('profileBio').textContent = user.bio || 'Нет био';
    document.getElementById('profileAvatar').src = user.avatar || '/uploads/default-avatar.png';
    document.getElementById('profileCitrus').textContent = user.citrus || 0;
    userCitrus = user.citrus || 0;
    updateCitrusUI();
    
    if (user.created_at) {
      const date = new Date(user.created_at);
      document.getElementById('profileDate').textContent = `Зарегистрирован: ${date.toLocaleDateString('ru-RU')} в ${date.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})}`;
    } else document.getElementById('profileDate').textContent = 'Зарегистрирован: Неизвестно';
    
    document.getElementById('profileBioInput').value = user.bio || '';
    if (user.theme) applyTheme(user.theme);
  } catch(e) { console.error('Ошибка загрузки профиля:', e); }
}

document.getElementById('avatarUpload').onchange = async function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('avatar', file);
  formData.append('username', currentUser.username);
  const res = await fetch('/upload-avatar', { method: 'POST', body: formData });
  const data = await res.json();
  if (data.success) {
    document.getElementById('profileAvatar').src = data.avatar + '?t=' + Date.now();
    alert('✅ Аватарка обновлена!');
    loadUsers();
  }
};

document.getElementById('saveProfileBtn').onclick = async function() {
  const bio = document.getElementById('profileBioInput').value;
  const res = await fetch('/update-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentUser.username, bio })
  });
  const data = await res.json();
  if (data.success) {
    document.getElementById('profileBio').textContent = bio || 'Нет био';
    alert('✅ Профиль сохранён!');
    loadUsers();
  }
};

function addEmoji(emoji) {
  const input = document.getElementById('msgInput');
  input.value += emoji;
  input.focus();
}

// ===== ВСПОМОГАТЕЛЬНЫЕ =====
function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'system-message';
  div.textContent = text;
  document.getElementById('messageBox').appendChild(div);
  scrollToBottom();
}

function updateOnline(users) {
  const count = users ? users.length : 0;
  document.getElementById('onlineStatus').textContent = `🌟 ${count}`;
  document.getElementById('generalStatus').textContent = `🌟 Онлайн: ${count}`;
}

function scrollToBottom() {
  const box = document.getElementById('messageBox');
  setTimeout(() => box.scrollTop = box.scrollHeight, 50);
}

// ============================================================
// ===== ИГРЫ =====
// ============================================================

let currentGame = null;

function showGame(game) {
  document.querySelectorAll('.game-content').forEach(el => el.style.display = 'none');
  const target = document.getElementById(game + 'Game');
  if (target) { target.style.display = 'block'; currentGame = game; }
  if (game === 'guess') initGuessGame();
  if (game === 'minesweeper') initMinesweeper();
  if (game === 'tetris') initTetris();
  if (game === 'snake') initSnakeGame();
  updateCitrusUI();
}

function hideGame(game) {
  const target = document.getElementById(game + 'Game');
  if (target) target.style.display = 'none';
  currentGame = null;
}

// ============================================================
// ===== 1. УГАДАЙ ЧИСЛО =====
// ============================================================
let guessNumber = 0, guessAttempts = 0, guessMin = 1, guessMax = 100, guessBoostUsed = false;

function initGuessGame() {
  guessNumber = Math.floor(Math.random() * 100) + 1;
  guessAttempts = 0; guessMin = 1; guessMax = 100; guessBoostUsed = false;
  document.getElementById('guessAttempts').textContent = '0';
  document.getElementById('guessRange').textContent = '1 - 100';
  document.getElementById('guessResult').textContent = '';
  document.getElementById('guessResult').className = 'guess-result';
  document.getElementById('guessInput').value = '';
  document.getElementById('guessInput').disabled = false;
  document.getElementById('guessBtn').disabled = false;
}

document.getElementById('guessBtn').onclick = function() {
  const input = document.getElementById('guessInput');
  const val = parseInt(input.value);
  if (isNaN(val) || val < guessMin || val > guessMax) {
    document.getElementById('guessResult').textContent = `❌ Введи число от ${guessMin} до ${guessMax}!`;
    return;
  }
  guessAttempts++;
  document.getElementById('guessAttempts').textContent = guessAttempts;
  if (val === guessNumber) {
    document.getElementById('guessResult').textContent = `🎉 Поздравляю! Число ${guessNumber} за ${guessAttempts} попыток! 🍊 +10`;
    document.getElementById('guessResult').className = 'guess-result win';
    document.getElementById('guessInput').disabled = true;
    document.getElementById('guessBtn').disabled = true;
    addCitrus(10);
  } else if (val < guessNumber) {
    guessMin = Math.max(guessMin, val + 1);
    document.getElementById('guessResult').textContent = `⬆️ Больше! (${guessMin} - ${guessMax})`;
    document.getElementById('guessRange').textContent = `${guessMin} - ${guessMax}`;
  } else {
    guessMax = Math.min(guessMax, val - 1);
    document.getElementById('guessResult').textContent = `⬇️ Меньше! (${guessMin} - ${guessMax})`;
    document.getElementById('guessRange').textContent = `${guessMin} - ${guessMax}`;
  }
  input.value = ''; input.focus();
};

document.getElementById('guessResetBtn').onclick = initGuessGame;

document.getElementById('guessBoostBtn').onclick = async function() {
  if (guessBoostUsed) { alert('❌ Подсказка уже использована!'); return; }
  const used = await useBoost('guess');
  if (!used) {
    buyBoost('guess', 30);
    return;
  }
  const half = Math.floor((guessMax - guessMin) / 2);
  if (guessNumber < guessMin + half) {
    guessMax = guessMin + half;
  } else {
    guessMin = guessMax - half;
  }
  guessBoostUsed = true;
  document.getElementById('guessRange').textContent = `${guessMin} - ${guessMax}`;
  document.getElementById('guessResult').textContent = `💡 Диапазон сужен! (${guessMin} - ${guessMax})`;
};

// ============================================================
// ===== 2. САПЁР =====
// ============================================================
let mineBoard = [], mineRevealed = [], mineFlagged = [], mineRows = 8, mineCols = 8, mineCount = 10, mineGameOver = false, mineScore = 0;
let mineBoostActive = false, mineBoostTimer = null;

function initMinesweeper() {
  if (mineBoostTimer) { clearTimeout(mineBoostTimer); mineBoostTimer = null; }
  mineBoostActive = false;
  mineRows = 8; mineCols = 8; mineCount = 10; mineGameOver = false; mineScore = 0;
  document.getElementById('mineCount').textContent = mineCount;
  document.getElementById('mineScore').textContent = '0';
  mineBoard = []; mineRevealed = []; mineFlagged = [];
  for (let r = 0; r < mineRows; r++) {
    mineBoard[r] = []; mineRevealed[r] = []; mineFlagged[r] = [];
    for (let c = 0; c < mineCols; c++) { mineBoard[r][c] = 0; mineRevealed[r][c] = false; mineFlagged[r][c] = false; }
  }
  let placed = 0;
  while (placed < mineCount) {
    const r = Math.floor(Math.random() * mineRows), c = Math.floor(Math.random() * mineCols);
    if (mineBoard[r][c] !== -1) { mineBoard[r][c] = -1; placed++; }
  }
  for (let r = 0; r < mineRows; r++) {
    for (let c = 0; c < mineCols; c++) {
      if (mineBoard[r][c] === -1) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < mineRows && nc >= 0 && nc < mineCols && mineBoard[nr][nc] === -1) count++;
        }
      }
      mineBoard[r][c] = count;
    }
  }
  renderMineBoard();
}

function renderMineBoard() {
  const board = document.getElementById('mineBoard');
  board.innerHTML = '';
  for (let r = 0; r < mineRows; r++) {
    for (let c = 0; c < mineCols; c++) {
      const cell = document.createElement('div');
      cell.className = 'mine-cell';
      cell.dataset.r = r; cell.dataset.c = c;
      if (mineRevealed[r][c]) {
        cell.classList.add('revealed');
        if (mineBoard[r][c] === -1) { cell.textContent = '💣'; cell.style.color = '#ff6b6b'; }
        else if (mineBoard[r][c] > 0) {
          cell.textContent = mineBoard[r][c];
          const colors = ['', '#4caf84', '#6db3f2', '#f5b042', '#ff6b6b', '#ff6b6b', '#ff6b6b', '#ff6b6b', '#ff6b6b'];
          cell.style.color = colors[mineBoard[r][c]] || '#fff';
        }
      } else if (mineFlagged[r][c]) { cell.textContent = '🚩'; }
      cell.onclick = () => mineClick(r, c);
      cell.oncontextmenu = (e) => { e.preventDefault(); mineFlag(r, c); };
      board.appendChild(cell);
    }
  }
}

function mineClick(r, c) {
  if (mineGameOver || mineRevealed[r][c] || mineFlagged[r][c]) return;
  if (mineBoard[r][c] === -1) {
    mineGameOver = true;
    revealAllMines();
    document.getElementById('mineScore').textContent = '💀 Проиграл!';
    return;
  }
  revealCell(r, c);
  checkWin();
  renderMineBoard();
}

function revealCell(r, c) {
  if (r < 0 || r >= mineRows || c < 0 || c >= mineCols) return;
  if (mineRevealed[r][c] || mineFlagged[r][c]) return;
  if (mineBoard[r][c] === -1) return;
  mineRevealed[r][c] = true;
  mineScore++;
  document.getElementById('mineScore').textContent = mineScore;
  if (mineBoard[r][c] === 0) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        revealCell(r + dr, c + dc);
      }
    }
  }
}

function mineFlag(r, c) {
  if (mineGameOver || mineRevealed[r][c]) return;
  mineFlagged[r][c] = !mineFlagged[r][c];
  renderMineBoard();
}

function revealAllMines() {
  for (let r = 0; r < mineRows; r++) {
    for (let c = 0; c < mineCols; c++) {
      if (mineBoard[r][c] === -1) mineRevealed[r][c] = true;
    }
  }
  renderMineBoard();
}

function checkWin() {
  let totalSafe = mineRows * mineCols - mineCount;
  let revealed = 0;
  for (let r = 0; r < mineRows; r++) {
    for (let c = 0; c < mineCols; c++) {
      if (mineRevealed[r][c]) revealed++;
    }
  }
  if (revealed === totalSafe) {
    mineGameOver = true;
    document.getElementById('mineScore').textContent = '🎉 Победа! 🍊 +20';
    addCitrus(20);
  }
}

document.getElementById('mineResetBtn').onclick = initMinesweeper;

document.getElementById('mineBoostBtn').onclick = async function() {
  if (mineBoostActive) { alert('❌ Миноискатель уже активен!'); return; }
  const used = await useBoost('minesweeper');
  if (!used) { buyBoost('minesweeper', 50); return; }
  
  mineBoostActive = true;
  for (let r = 0; r < mineRows; r++) {
    for (let c = 0; c < mineCols; c++) {
      if (mineBoard[r][c] === -1 && !mineRevealed[r][c]) {
        mineRevealed[r][c] = true;
      }
    }
  }
  renderMineBoard();
  mineBoostTimer = setTimeout(() => {
    for (let r = 0; r < mineRows; r++) {
      for (let c = 0; c < mineCols; c++) {
        if (mineBoard[r][c] === -1 && !mineFlagged[r][c]) {
          mineRevealed[r][c] = false;
        }
      }
    }
    mineBoostActive = false;
    renderMineBoard();
  }, 5000);
};

// ============================================================
// ===== 3. ТЕТРИС =====
// ============================================================
let tetrisCanvas, tetrisCtx, tetrisBoard = [], tetrisBlock = null, tetrisScore = 0, tetrisLevel = 1, tetrisLines = 0, tetrisCitrus = 0;
let tetrisRunning = false, tetrisPaused = false, tetrisInterval = null;
let tetrisBoostActive = false, tetrisBoostTimer = null, tetrisOriginalSpeed = 500;
const TETRIS_COLS = 10, TETRIS_ROWS = 20;
const TETRIS_SHAPES = [
  [[1,1,1,1]], [[1,1],[1,1]], [[0,1,0],[1,1,1]], [[1,0,0],[1,1,1]],
  [[0,0,1],[1,1,1]], [[1,1,0],[0,1,1]], [[0,1,1],[1,1,0]]
];
const TETRIS_COLORS = ['#6db3f2', '#f5b042', '#4caf84', '#ff6b6b', '#7b6bff', '#f25f5c', '#ff9ff3'];

function initTetris() {
  if (tetrisBoostTimer) { clearTimeout(tetrisBoostTimer); tetrisBoostTimer = null; }
  tetrisBoostActive = false;
  tetrisCanvas = document.getElementById('tetrisCanvas');
  tetrisCtx = tetrisCanvas.getContext('2d');
  tetrisBoard = [];
  for (let r = 0; r < TETRIS_ROWS; r++) {
    tetrisBoard[r] = [];
    for (let c = 0; c < TETRIS_COLS; c++) tetrisBoard[r][c] = 0;
  }
  tetrisScore = 0; tetrisLevel = 1; tetrisLines = 0; tetrisCitrus = 0;
  tetrisRunning = false; tetrisPaused = false;
  document.getElementById('tetrisScore').textContent = '0';
  document.getElementById('tetrisLevel').textContent = '1';
  document.getElementById('tetrisLines').textContent = '0';
  document.getElementById('tetrisCitrus').textContent = '0';
  document.getElementById('tetrisStartBtn').textContent = '▶ Старт';
  drawTetris();
}

function createTetrisBlock() {
  const idx = Math.floor(Math.random() * TETRIS_SHAPES.length);
  return { shape: TETRIS_SHAPES[idx], color: TETRIS_COLORS[idx], x: Math.floor((TETRIS_COLS - TETRIS_SHAPES[idx][0].length) / 2), y: 0 };
}

function drawTetris() {
  const ctx = tetrisCtx, cellSize = 20;
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, 200, 400);
  for (let r = 0; r < TETRIS_ROWS; r++) {
    for (let c = 0; c < TETRIS_COLS; c++) {
      ctx.fillStyle = tetrisBoard[r][c] || '#1a1a3e';
      ctx.fillRect(c * cellSize, r * cellSize, cellSize - 1, cellSize - 1);
    }
  }
  if (tetrisBlock) {
    const shape = tetrisBlock.shape;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          ctx.fillStyle = tetrisBlock.color;
          ctx.fillRect((tetrisBlock.x + c) * cellSize, (tetrisBlock.y + r) * cellSize, cellSize - 1, cellSize - 1);
        }
      }
    }
  }
}

function tetrisCollision(block, dx, dy) {
  const shape = block.shape;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        const newX = block.x + c + dx, newY = block.y + r + dy;
        if (newX < 0 || newX >= TETRIS_COLS || newY >= TETRIS_ROWS || (newY >= 0 && tetrisBoard[newY][newX])) return true;
      }
    }
  }
  return false;
}

function tetrisLockBlock() {
  if (!tetrisBlock) return;
  const shape = tetrisBlock.shape;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) tetrisBoard[tetrisBlock.y + r][tetrisBlock.x + c] = tetrisBlock.color;
    }
  }
  let cleared = 0;
  for (let r = TETRIS_ROWS - 1; r >= 0; r--) {
    let full = true;
    for (let c = 0; c < TETRIS_COLS; c++) { if (!tetrisBoard[r][c]) { full = false; break; } }
    if (full) {
      tetrisBoard.splice(r, 1);
      tetrisBoard.unshift([]);
      for (let c = 0; c < TETRIS_COLS; c++) tetrisBoard[0][c] = 0;
      cleared++;
      r++;
    }
  }
  if (cleared > 0) {
    tetrisLines += cleared;
    tetrisScore += cleared * 100 * tetrisLevel;
    tetrisLevel = Math.floor(tetrisLines / 5) + 1;
    tetrisCitrus += cleared;
    addCitrus(cleared);
    document.getElementById('tetrisScore').textContent = tetrisScore;
    document.getElementById('tetrisLevel').textContent = tetrisLevel;
    document.getElementById('tetrisLines').textContent = tetrisLines;
    document.getElementById('tetrisCitrus').textContent = tetrisCitrus;
    clearInterval(tetrisInterval);
    const speed = tetrisBoostActive ? Math.max(100, tetrisOriginalSpeed * 2) : Math.max(100, 500 - tetrisLevel * 30);
    tetrisInterval = setInterval(tetrisTick, speed);
  }
  tetrisBlock = createTetrisBlock();
  if (tetrisCollision(tetrisBlock, 0, 0)) gameOverTetris();
  drawTetris();
}

function tetrisTick() {
  if (!tetrisRunning || tetrisPaused || !tetrisBlock) return;
  if (!tetrisCollision(tetrisBlock, 0, 1)) { tetrisBlock.y++; drawTetris(); }
  else tetrisLockBlock();
}

function gameOverTetris() {
  tetrisRunning = false;
  clearInterval(tetrisInterval);
  document.getElementById('tetrisStartBtn').textContent = '🔄 Новая игра';
  tetrisCtx.fillStyle = 'rgba(0,0,0,0.7)';
  tetrisCtx.fillRect(0, 0, 200, 400);
  tetrisCtx.fillStyle = '#ff6b6b';
  tetrisCtx.font = 'bold 24px Arial';
  tetrisCtx.textAlign = 'center';
  tetrisCtx.fillText('💀 GAME OVER', 100, 200);
}

window.tetrisMove = function(dir) {
  if (!tetrisRunning || tetrisPaused || !tetrisBlock) return;
  const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
  const dy = dir === 'down' ? 1 : 0;
  if (dx && !tetrisCollision(tetrisBlock, dx, 0)) { tetrisBlock.x += dx; drawTetris(); }
  if (dy && !tetrisCollision(tetrisBlock, 0, 1)) { tetrisBlock.y += dy; drawTetris(); }
};

window.tetrisRotate = function() {
  if (!tetrisRunning || tetrisPaused || !tetrisBlock) return;
  const shape = tetrisBlock.shape;
  const rotated = [];
  for (let c = 0; c < shape[0].length; c++) {
    rotated[c] = [];
    for (let r = shape.length - 1; r >= 0; r--) {
      rotated[c][shape.length - 1 - r] = shape[r][c];
    }
  }
  const oldShape = tetrisBlock.shape;
  tetrisBlock.shape = rotated;
  if (tetrisCollision(tetrisBlock, 0, 0)) tetrisBlock.shape = oldShape;
  drawTetris();
};

document.getElementById('tetrisStartBtn').onclick = function() {
  if (tetrisRunning) {
    tetrisRunning = false;
    clearInterval(tetrisInterval);
    this.textContent = '▶ Старт';
    return;
  }
  initTetris();
  tetrisBlock = createTetrisBlock();
  tetrisRunning = true;
  tetrisPaused = false;
  this.textContent = '⏹ Стоп';
  tetrisOriginalSpeed = Math.max(100, 500 - tetrisLevel * 30);
  const speed = tetrisBoostActive ? tetrisOriginalSpeed * 2 : tetrisOriginalSpeed;
  tetrisInterval = setInterval(tetrisTick, speed);
  drawTetris();
};

document.getElementById('tetrisPauseBtn').onclick = function() {
  if (!tetrisRunning) return;
  tetrisPaused = !tetrisPaused;
  this.textContent = tetrisPaused ? '▶ Продолжить' : '⏸ Пауза';
  if (!tetrisPaused) drawTetris();
};

document.getElementById('tetrisBoostBtn').onclick = async function() {
  if (tetrisBoostActive) { alert('❌ Буст уже активен!'); return; }
  const used = await useBoost('tetris');
  if (!used) { buyBoost('tetris', 40); return; }
  
  tetrisBoostActive = true;
  clearInterval(tetrisInterval);
  const speed = Math.max(100, tetrisOriginalSpeed * 2);
  tetrisInterval = setInterval(tetrisTick, speed);
  tetrisBoostTimer = setTimeout(() => {
    tetrisBoostActive = false;
    clearInterval(tetrisInterval);
    const newSpeed = Math.max(100, 500 - tetrisLevel * 30);
    tetrisInterval = setInterval(tetrisTick, newSpeed);
  }, 10000);
};

// ============================================================
// ===== 4. ЗМЕЙКА =====
// ============================================================
let snakeGame2 = null;

function initSnakeGame() {
  const canvas = document.getElementById('snakeCanvas2');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('snakeScore2');
  const highEl = document.getElementById('snakeHighScore2');
  const citrusEl = document.getElementById('snakeCitrus');
  
  let snake = [{x:5,y:5},{x:4,y:5},{x:3,y:5}];
  let food = {x:10,y:10};
  let dir = 'right', nextDir = 'right';
  let score = 0, high = parseInt(localStorage.getItem('snakeHigh')) || 0;
  let running = false, paused = false;
  let loop = null;
  let snakeCitrus = 0;
  let speed = 150;
  let boostActive = false;
  let boostTimer = null;
  
  highEl.textContent = high;
  citrusEl.textContent = '0';
  
  function init() {
    if (loop) clearInterval(loop);
    if (boostTimer) clearTimeout(boostTimer);
    boostActive = false;
    snake = [{x:5,y:5},{x:4,y:5},{x:3,y:5}];
    dir = 'right'; nextDir = 'right';
    score = 0; snakeCitrus = 0;
    scoreEl.textContent = '0';
    citrusEl.textContent = '0';
    running = false; paused = false;
    speed = 150;
    genFood();
    draw();
  }
  
  function genFood() {
    let pos;
    do { pos = {x: Math.floor(Math.random()*20), y: Math.floor(Math.random()*20)}; } 
    while (snake.some(s => s.x === pos.x && s.y === pos.y));
    food = pos;
  }
  
  function draw() {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0,0,400,400);
    snake.forEach((s,i) => {
      ctx.fillStyle = i === 0 ? '#7b6bff' : '#4a3aff';
      ctx.shadowColor = 'rgba(100,50,255,0.5)';
      ctx.shadowBlur = 10;
      ctx.fillRect(s.x*20+1, s.y*20+1, 18, 18);
      ctx.shadowBlur = 0;
    });
    ctx.fillStyle = '#ff6b6b';
    ctx.shadowColor = 'rgba(255,50,50,0.5)';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(food.x*20+10, food.y*20+10, 8, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  
  function move() {
    if (!running || paused) return;
    dir = nextDir;
    const head = {...snake[0]};
    if (dir === 'up') head.y--;
    else if (dir === 'down') head.y++;
    else if (dir === 'left') head.x--;
    else if (dir === 'right') head.x++;
    
    if (head.x < 0 || head.x >= 20 || head.y < 0 || head.y >= 20) { gameOver(); return; }
    if (snake.some((s,i) => i > 0 && s.x === head.x && s.y === head.y)) { gameOver(); return; }
    
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score++;
      scoreEl.textContent = score;
      if (score % 10 === 0) {
        snakeCitrus += 5;
        citrusEl.textContent = snakeCitrus;
        addCitrus(5);
      }
      genFood();
    } else snake.pop();
    draw();
  }
  
  function gameOver() {
    running = false;
    if (loop) clearInterval(loop);
    if (score > high) { high = score; localStorage.setItem('snakeHigh', high); highEl.textContent = high; }
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0,0,400,400);
    ctx.fillStyle = '#7b6bff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('💀 Игра окончена', 200, 200);
  }
  
  function start() {
    if (loop) clearInterval(loop);
    running = true;
    paused = false;
    const currentSpeed = boostActive ? speed * 2 : speed;
    loop = setInterval(move, currentSpeed);
  }
  
  function pause() {
    paused = !paused;
    if (paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0,0,400,400);
      ctx.fillStyle = '#7b6bff';
      ctx.font = 'bold 36px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('⏸️', 200, 200);
    } else draw();
  }
  
  function reset() { if (loop) clearInterval(loop); init(); }
  
  function activateBoost() {
    if (boostActive) return;
    boostActive = true;
    clearInterval(loop);
    const newSpeed = speed * 2;
    loop = setInterval(move, newSpeed);
    boostTimer = setTimeout(() => {
      boostActive = false;
      clearInterval(loop);
      loop = setInterval(move, speed);
    }, 5000);
  }
  
  window.moveSnake2 = (d) => {
    const opp = {up:'down',down:'up',left:'right',right:'left'};
    if (d !== opp[dir]) nextDir = d;
  };
  
  document.addEventListener('keydown', (e) => {
    const map = {ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'};
    if (map[e.key]) { e.preventDefault(); window.moveSnake2(map[e.key]); }
    if (e.key === ' ' || e.key === 'Space') { e.preventDefault(); if (running) pause(); }
  });
  
  document.getElementById('snakeStartBtn2').onclick = () => { if (!running) { init(); start(); } else if (paused) pause(); };
  document.getElementById('snakePauseBtn2').onclick = () => { if (running) pause(); };
  document.getElementById('snakeResetBtn2').onclick = reset;
  
  document.getElementById('snakeBoostBtn2').onclick = async function() {
    if (boostActive) { alert('❌ Замедление уже активно!'); return; }
    const used = await useBoost('snake');
    if (!used) { buyBoost('snake', 35); return; }
    activateBoost();
  };
  
  snakeGame2 = { init, start, pause, reset };
  init();
}

// ============================================================
// ===== ЗАПУСК =====
// ============================================================
function initGames() {
  initGuessGame();
  initMinesweeper();
  initTetris();
  initSnakeGame();
  showGame('guess');
}

console.log('🚀 ZEPHYR С ЦИТРУСИКАМИ И ЗВОНКАМИ ГОТОВ!');
