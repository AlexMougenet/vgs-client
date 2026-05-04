// State
let playerName = '';
let playerColor = '#7cacff';
let roomCode = '';
let players = {}; // { [name]: { color, voicePack } } for other players
let settings = {
  volume: 80,
  overlayEnabled: true,
  playOwnSounds: true,
};

// Load settings from localStorage
const saved = localStorage.getItem('vgs-settings');
if (saved) {
  try { Object.assign(settings, JSON.parse(saved)); } catch { }
}

// User preferences (name, color, last room) — stored via main process in userData
let userPrefs = { name: '', color: '#7cacff', lastRoom: '' };

function saveUserPrefs() {
  window.vgsAPI.saveUserPrefs(userPrefs);
}

// DOM elements
const views = {
  connect: document.getElementById('view-connect'),
  lobby: document.getElementById('view-lobby'),
  settings: document.getElementById('view-settings'),
  voicePacks: document.getElementById('view-voice-packs'),
  keybinds: document.getElementById('view-keybinds'),
};

const els = {
  serverUrl: document.getElementById('server-url'),
  playerName: document.getElementById('player-name'),
  playerColor: document.getElementById('player-color'),
  roomCode: document.getElementById('room-code'),
  btnJoin: document.getElementById('btn-join'),
  btnCreate: document.getElementById('btn-create'),
  btnGenerate: document.getElementById('btn-generate'),
  lobbyRoomCode: document.getElementById('lobby-room-code'),
  btnCopyCode: document.getElementById('btn-copy-code'),
  statusIndicator: document.getElementById('status-indicator'),
  playerList: document.getElementById('player-list'),
  commandTree: document.getElementById('command-tree'),
  eventLog: document.getElementById('event-log'),
  vgsIndicator: document.getElementById('vgs-active-indicator'),
  btnSettings: document.getElementById('btn-settings'),
  btnDisconnect: document.getElementById('btn-disconnect'),
  volumeSlider: document.getElementById('volume-slider'),
  volumeValue: document.getElementById('volume-value'),
  toggleOverlay: document.getElementById('toggle-overlay'),
  toggleOwnSounds: document.getElementById('toggle-own-sounds'),
  btnBack: document.getElementById('btn-back'),
  btnBackArrow: document.getElementById('btn-back-arrow'),
  btnKeybinds: document.getElementById('btn-keybinds'),
  bindActivationKey: document.getElementById('bind-activation-key'),
  keybindSearch: document.getElementById('keybind-search'),
  keybindList: document.getElementById('keybind-list'),
  btnResetKeybinds: document.getElementById('btn-reset-keybinds'),
  btnKeybindsBack: document.getElementById('btn-keybinds-back'),
  btnKeybindsBackArrow: document.getElementById('btn-keybinds-back-arrow'),
  btnVoicePacks: document.getElementById('btn-voice-packs'),
  btnVoicePacksBackArrow: document.getElementById('btn-voice-packs-back-arrow'),
  vpSearch: document.getElementById('vp-search'),
  vpGrid: document.getElementById('vp-grid'),
  btnClearCache: document.getElementById('btn-clear-cache'),
  playerModal: document.getElementById('player-modal'),
  pmUsername: document.getElementById('pm-username'),
  pmColorBox: document.getElementById('pm-color-box'),
  pmVoicepack: document.getElementById('pm-voicepack'),
  pmArtwork: document.getElementById('pm-artwork'),
  btnCloseModal: document.getElementById('btn-close-modal'),
};

// Helper: convert e.code to a short display label using e.key
// e.code is layout-independent ("KeyA", "Digit1"), e.key is what the user sees ("a", "&")
function codeToDisplayChar(code, key) {
  // Use the key character if it's a single character (letter, digit, symbol)
  if (key && key.length === 1) {
    return key.toUpperCase();
  }
  // Fallback: extract from code string
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

// View management
function showView(name) {
  for (const [key, el] of Object.entries(views)) {
    el.classList.toggle('active', key === name);
  }
}

// Generate room code
function generateRoomCode() {
  const words = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL',
    'INDIA', 'JULIET', 'KILO', 'LIMA', 'MIKE', 'NOVA', 'OSCAR', 'PAPA', 'ROMEO', 'SIERRA',
    'TANGO', 'VICTOR', 'WHISKEY', 'ZULU', 'PHOENIX', 'SHADOW', 'STORM', 'VIPER', 'TITAN',
    'RAVEN', 'COBRA', 'HAWK'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${word}-${num}`;
}

// Render player list
function renderPlayers() {
  els.playerList.innerHTML = '';
  const allNames = [playerName, ...Object.keys(players)];
  for (const name of allNames) {
    const li = document.createElement('li');
    li.textContent = name;

    const info = (name === playerName)
      ? { color: playerColor, voicePack: userPrefs.voicePack || 'default' }
      : players[name];

    if (info && info.color) {
      li.style.color = info.color;
      li.style.borderColor = info.color;
    }

    if (name === playerName) li.classList.add('self');

    li.addEventListener('click', () => {
      showPlayerInfo(name, info);
    });

    els.playerList.appendChild(li);
  }
}

async function showPlayerInfo(name, info) {
  els.pmUsername.textContent = name;
  els.pmColorBox.style.backgroundColor = info.color || 'var(--accent)';

  // Find voice pack name and artwork from ID
  let vpName = 'Default';
  let artSrc = '';

  if (info.voicePack && info.voicePack !== 'default') {
    if (voicePacksList.length === 0) {
      voicePacksList = await window.vgsAPI.getVoicePacks();
    }
    const pack = voicePacksList.find(p => p.id === info.voicePack);
    if (pack) {
      vpName = pack.name;
      artSrc = pack.artwork || '';
    } else {
      vpName = info.voicePack;
    }
  }

  els.pmVoicepack.textContent = vpName;
  if (artSrc) {
    els.pmArtwork.src = artSrc;
    els.pmArtwork.classList.remove('hidden');
  } else {
    els.pmArtwork.classList.add('hidden');
  }

  els.playerModal.classList.add('active');
}

// Close modal on background click
els.playerModal.addEventListener('click', (e) => {
  if (e.target === els.playerModal) {
    els.playerModal.classList.remove('active');
  }
});

els.btnCloseModal.addEventListener('click', () => {
  els.playerModal.classList.remove('active');
});

els.pmVoicepack.addEventListener('click', () => {
  const text = els.pmVoicepack.textContent;
  navigator.clipboard.writeText(text);
  const original = text;
  els.pmVoicepack.textContent = 'Copied!';
  setTimeout(() => { if (els.pmVoicepack.textContent === 'Copied!') els.pmVoicepack.textContent = original; }, 1500);
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Event log
function addEvent(text) {
  const empty = els.eventLog.querySelector('.empty-state');
  if (empty) empty.remove();

  const item = document.createElement('div');
  item.className = 'event-item';
  item.innerHTML = text;
  els.eventLog.prepend(item);

  while (els.eventLog.children.length > 20) {
    els.eventLog.removeChild(els.eventLog.lastChild);
  }
}

// Audio playback

function playFromUrl(url) {
  if (!url) {
    addEvent('<span style="color:var(--danger)">Play error: URL is empty</span>');
    return;
  }
  const audio = new Audio(url);
  audio.volume = settings.volume / 100;
  audio.play().catch((e) => {
    addEvent(`<span style="color:var(--danger)">Audio error: ${escapeHtml(e.message || String(e))}</span>`);
  });
}

function playSound(soundFile) {
  if (!soundFile) return;
  playFromUrl(`../assets/sounds/default/${soundFile}`);
}

// pathToFileUrl removed as IPC now returns data URIs

async function playSoundWithVoicePack(sound, voicePackId, commandId) {
  if (voicePackId && voicePackId !== 'default') {
    // Voice pack is active: always go through resolveVoiceSound (download + cache if needed).
    // If commandId is unknown, the URL is missing, or download fails → silent, no fallback.
    if (commandId) {
      try {
        const localPath = await window.vgsAPI.getVoiceSound(voicePackId, commandId);
        if (localPath) playFromUrl(localPath);
        else addEvent(`<span style="color:var(--danger)">VoicePack: No sound mapped for ${commandId}</span>`);
      } catch (err) {
        addEvent(`<span style="color:var(--danger)">IPC Error: ${escapeHtml(err.message)}</span>`);
      }
    }
    return; // ALWAYS return here — never fall back to default when a voice pack is active
  }
  playSound(sound); // Default pack only
}

// Status
function setStatus(connected) {
  els.statusIndicator.className = `status ${connected ? 'connected' : 'disconnected'}`;
  els.statusIndicator.querySelector('.status-text').textContent = connected ? 'Connected' : 'Disconnected';
}

// Connect
function joinRoom() {
  const server = els.serverUrl.value.trim();
  const name = els.playerName.value.trim();
  const color = els.playerColor.value;
  const code = els.roomCode.value.trim().toUpperCase();

  if (!name) { els.playerName.focus(); return; }
  if (!code) { els.roomCode.focus(); return; }
  if (!server) { els.serverUrl.focus(); return; }

  playerName = name;
  playerColor = color;
  roomCode = code;
  players = {};

  // Save user preferences
  userPrefs.name = name;
  userPrefs.color = color;
  userPrefs.lastRoom = code;
  saveUserPrefs();

  els.lobbyRoomCode.textContent = roomCode;
  renderPlayers();
  renderCommandTree();
  els.eventLog.innerHTML = '<div class="empty-state">No events yet</div>';
  showView('lobby');

  window.vgsAPI.joinRoom(server, roomCode, playerName, playerColor);
}

// Event listeners — Connect view
els.btnJoin.addEventListener('click', joinRoom);

els.btnCreate.addEventListener('click', () => {
  if (!els.roomCode.value.trim()) els.roomCode.value = generateRoomCode();
  joinRoom();
});

els.btnGenerate.addEventListener('click', () => {
  els.roomCode.value = generateRoomCode();
});

// Enter key on inputs
els.playerName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') els.roomCode.focus();
});
els.roomCode.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoom();
});

// Lobby
els.btnCopyCode.addEventListener('click', () => {
  navigator.clipboard.writeText(roomCode);
  els.btnCopyCode.textContent = '\u2713';
  setTimeout(() => { els.btnCopyCode.textContent = '\u2398'; }, 1500);
});

els.btnDisconnect.addEventListener('click', () => {
  window.vgsAPI.disconnect();
  players = {};
  showView('connect');
});

els.btnSettings.addEventListener('click', () => {
  window.vgsAPI.setVgsMonitoring(false);
  showView('settings');
});

els.btnClearCache.addEventListener('click', async () => {
  els.btnClearCache.disabled = true;
  els.btnClearCache.textContent = 'Clearing...';
  try {
    const response = await window.vgsAPI.clearCache();
    if (response && response.success) {
      addEvent('<span style="color:var(--success)">Voice pack cache cleared</span>');
      els.btnClearCache.textContent = 'Cleared';
    } else {
      addEvent('<span style="color:var(--danger)">Failed to clear cache</span>');
      els.btnClearCache.disabled = false;
      els.btnClearCache.textContent = 'Clear cache';
    }
  } catch (err) {
    addEvent(`<span style="color:var(--danger)">Cache clearer error: ${escapeHtml(err.message)}</span>`);
    els.btnClearCache.disabled = false;
    els.btnClearCache.textContent = 'Clear cache';
  }
});

// Settings
els.volumeSlider.value = settings.volume;
els.volumeValue.textContent = `${settings.volume}%`;
els.toggleOverlay.checked = settings.overlayEnabled;
els.toggleOwnSounds.checked = settings.playOwnSounds;

els.volumeSlider.addEventListener('input', () => {
  settings.volume = parseInt(els.volumeSlider.value);
  els.volumeValue.textContent = `${settings.volume}%`;
  saveSettings();
});

els.toggleOverlay.addEventListener('change', () => {
  settings.overlayEnabled = els.toggleOverlay.checked;
  saveSettings();
});

els.toggleOwnSounds.addEventListener('change', () => {
  settings.playOwnSounds = els.toggleOwnSounds.checked;
  saveSettings();
});

function goBackToLobby() {
  window.vgsAPI.setVgsMonitoring(true);
  showView('lobby');
}
els.btnBack.addEventListener('click', goBackToLobby);
els.btnBackArrow.addEventListener('click', goBackToLobby);

function saveSettings() {
  localStorage.setItem('vgs-settings', JSON.stringify(settings));
}

// WebSocket messages from main process
window.vgsAPI.onWsMessage((msg) => {
  switch (msg.type) {
    case 'connected':
      setStatus(true);
      addEvent('<span style="color:var(--success)">Connected to server</span>');
      break;
    case 'disconnected':
      setStatus(false);
      addEvent('<span style="color:var(--danger)">Disconnected</span>');
      break;
    case 'error':
      addEvent(`<span style="color:var(--danger)">Error: ${escapeHtml(msg.message)}</span>`);
      break;
    case 'room_state':
      // Server sends { [name]: { color, voicePack } } for all existing members except self.
      players = (msg.players && typeof msg.players === 'object' && !Array.isArray(msg.players))
        ? msg.players
        : {};
      renderPlayers();
      break;
    case 'player_joined':
      if (msg.playerName !== playerName) {
        players[msg.playerName] = {
          color: msg.playerColor,
          voicePack: msg.voicePack
        };
      }
      renderPlayers();
      addEvent(`<span class="event-player" style="color:${msg.playerColor || 'var(--accent)'}">${escapeHtml(msg.playerName)}</span> joined`);
      break;
    case 'player_left':
      delete players[msg.playerName];
      renderPlayers();
      addEvent(`<span class="event-player">${escapeHtml(msg.playerName)}</span> left`);
      break;
    case 'vgs_event': {
      const evtColor = msg.playerColor || 'var(--accent)';
      addEvent(`<span class="event-player" style="color:${evtColor}">${escapeHtml(msg.playerName)}</span>: ${escapeHtml(msg.label)}`);
      playSoundWithVoicePack(msg.sound, msg.voicePackId, msg.commandId);
      break;
    }
  }
});

// VGS triggered locally (own command)
window.vgsAPI.onVgsTriggered(({ command, commandId, voicePackId, label, sound }) => {
  addEvent(`<span class="event-player" style="color:${playerColor}">${escapeHtml(playerName)}</span>: ${escapeHtml(label)}`);
  if (settings.playOwnSounds) {
    playSoundWithVoicePack(sound, voicePackId, commandId);
  }
});

// VGS active state indicator
window.vgsAPI.onVgsActive((active) => {
  els.vgsIndicator.classList.toggle('hidden', !active);
});

// Play dynamic system sounds
window.vgsAPI.onPlaySystemSound((data) => {
  if (settings.volume === 0) return;

  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';

  // Base volume scaled by user settings, maxed at a gentle 0.1
  const maxVol = (settings.volume / 100) * 0.1;
  const startVol = maxVol * 0.5;

  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(maxVol, ctx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

  if (data.type === 'join') {
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
  } else {
    osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
    osc.frequency.setValueAtTime(523.25, ctx.currentTime + 0.1); // C5
  }

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.5);
});

// === Keybind Editor ===
// Uses e.code (physical key identity) for matching — works on any keyboard layout.
// Uses e.key (layout character) for display — shows what the user sees on their keyboard.
let currentKeybinds = null;
let defaultKeybinds = null;
let listeningBtn = null;
let listeningId = null;
let codesCollected = [];   // e.code values for matching
let displayCollected = []; // e.key values for display
let keyTimer = null;

els.btnKeybinds.addEventListener('click', async () => {
  window.vgsAPI.setVgsMonitoring(false);
  currentKeybinds = await window.vgsAPI.getKeybinds();
  defaultKeybinds = await window.vgsAPI.getDefaultKeybinds();
  renderKeybindList();
  els.bindActivationKey.textContent = currentKeybinds.activationKey;
  showView('keybinds');
});

function renderKeybindList(filter = '') {
  els.keybindList.innerHTML = '';
  const filterLower = filter.toLowerCase();

  for (const [id, cmd] of Object.entries(currentKeybinds.binds)) {
    const display = cmd.keys || cmd.codes.join('');
    if (filterLower && !cmd.label.toLowerCase().includes(filterLower) && !display.toLowerCase().includes(filterLower)) {
      continue;
    }

    const row = document.createElement('div');
    row.className = 'keybind-row';

    const label = document.createElement('span');
    label.className = 'keybind-label';
    label.textContent = cmd.label;

    const isModified = defaultKeybinds && defaultKeybinds.binds[id] &&
      JSON.stringify(defaultKeybinds.binds[id].codes) !== JSON.stringify(cmd.codes);

    const btn = document.createElement('button');
    btn.className = 'keybind-btn';
    btn.textContent = display;
    btn.dataset.bindId = id;
    btn.addEventListener('click', () => startListening(btn, id));

    if (isModified) {
      const mod = document.createElement('span');
      mod.className = 'keybind-modified';
      mod.textContent = '(custom)';
      label.appendChild(mod);
    }

    row.appendChild(label);
    row.appendChild(btn);
    els.keybindList.appendChild(row);
  }
}

els.keybindSearch.addEventListener('input', () => {
  renderKeybindList(els.keybindSearch.value);
});

function startListening(btn, id) {
  cancelListening();

  listeningBtn = btn;
  listeningId = id;
  codesCollected = [];
  displayCollected = [];
  btn.classList.add('listening');
  btn.textContent = 'Press keys...';

  document.addEventListener('keydown', onKeybindKeydown);
}

function onKeybindKeydown(e) {
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') {
    cancelListening();
    return;
  }

  // Only accept letter keys and digit keys
  const code = e.code; // e.g. "KeyA", "Digit1"
  if (!code.startsWith('Key') && !code.startsWith('Digit')) return;

  const displayChar = codeToDisplayChar(code, e.key);

  codesCollected.push(code);
  displayCollected.push(displayChar);
  listeningBtn.textContent = displayCollected.join('');

  // Reset timer — finish after 800ms of no input
  if (keyTimer) clearTimeout(keyTimer);
  keyTimer = setTimeout(() => finishListening(), 800);

  // Auto-finish at 5 keys
  if (codesCollected.length >= 5) {
    finishListening();
  }
}

function finishListening() {
  if (keyTimer) { clearTimeout(keyTimer); keyTimer = null; }
  document.removeEventListener('keydown', onKeybindKeydown);

  if (!listeningBtn || codesCollected.length === 0) {
    cancelListening();
    return;
  }

  const newCodes = [...codesCollected];
  const newDisplay = displayCollected.join('');

  // Check for conflicts (another command with the same code sequence)
  let conflict = false;
  for (const [id, cmd] of Object.entries(currentKeybinds.binds)) {
    if (id !== listeningId && JSON.stringify(cmd.codes) === JSON.stringify(newCodes)) {
      listeningBtn.classList.remove('listening');
      listeningBtn.classList.add('conflict');
      listeningBtn.textContent = `${newDisplay} (conflict: ${cmd.label})`;
      setTimeout(() => {
        listeningBtn.classList.remove('conflict');
        listeningBtn.textContent = currentKeybinds.binds[listeningId].keys;
        listeningBtn = null;
        listeningId = null;
      }, 2000);
      conflict = true;
      break;
    }
  }

  if (!conflict) {
    // Ensure the sequence starts with the activation key code
    if (newCodes[0] !== currentKeybinds.activationCode) {
      newCodes.unshift(currentKeybinds.activationCode);
      currentKeybinds.binds[listeningId].keys = currentKeybinds.activationKey + newDisplay;
    } else {
      currentKeybinds.binds[listeningId].keys = newDisplay;
    }
    currentKeybinds.binds[listeningId].codes = newCodes;
    listeningBtn.classList.remove('listening');
    listeningBtn.textContent = currentKeybinds.binds[listeningId].keys;
    listeningBtn = null;
    listeningId = null;
  }

  codesCollected = [];
  displayCollected = [];
}

function cancelListening() {
  if (keyTimer) { clearTimeout(keyTimer); keyTimer = null; }
  document.removeEventListener('keydown', onKeybindKeydown);

  if (listeningBtn && listeningId && currentKeybinds) {
    listeningBtn.classList.remove('listening');
    listeningBtn.textContent = currentKeybinds.binds[listeningId].keys;
  }

  listeningBtn = null;
  listeningId = null;
  codesCollected = [];
  displayCollected = [];
}

// Activation key rebind
els.bindActivationKey.addEventListener('click', () => {
  cancelListening();
  els.bindActivationKey.classList.add('listening');
  els.bindActivationKey.textContent = 'Press key or mouse button...';

  function applyNewActivation(code, displayChar) {
    const oldCode = currentKeybinds.activationCode;
    const oldDisplay = currentKeybinds.activationKey;

    currentKeybinds.activationCode = code;
    currentKeybinds.activationKey = displayChar;

    // Update all binds: replace ALL occurrences of the old activation code/key
    // (covers VV... sequences where the sub-V is also the activation key)
    for (const [id, cmd] of Object.entries(currentKeybinds.binds)) {
      if (cmd.codes) {
        cmd.codes = cmd.codes.map(c => c === oldCode ? code : c);
      }
      if (cmd.keys) {
        // Replace every occurrence of the old activation display char with the new one
        cmd.keys = cmd.keys.split(oldDisplay).join(displayChar);
      }
    }

    els.bindActivationKey.classList.remove('listening');
    els.bindActivationKey.textContent = displayChar;
    renderKeybindList(els.keybindSearch.value);
  }

  function cancelActBind() {
    els.bindActivationKey.classList.remove('listening');
    els.bindActivationKey.textContent = currentKeybinds.activationKey;
  }

  function cleanupActListeners() {
    document.removeEventListener('keydown', onActKey);
    document.removeEventListener('mousedown', onActMouse);
  }

  function onActKey(e) {
    e.preventDefault();
    e.stopPropagation();
    cleanupActListeners();

    if (e.key === 'Escape') { cancelActBind(); return; }

    const code = e.code;
    if (!code.startsWith('Key') && !code.startsWith('Digit')) { cancelActBind(); return; }

    applyNewActivation(code, codeToDisplayChar(code, e.key));
  }

  function onActMouse(e) {
    // Browser: button 3 = Mouse4 (back), button 4 = Mouse5 (forward)
    if (e.button !== 3 && e.button !== 4) return;
    e.preventDefault();
    e.stopPropagation();
    cleanupActListeners();

    const mouseNum = e.button === 3 ? 4 : 5; // Convert browser button to hardware button
    applyNewActivation(`Mouse${mouseNum}`, `M${mouseNum}`);
  }

  document.addEventListener('keydown', onActKey);
  document.addEventListener('mousedown', onActMouse);
});

// Reset keybinds
els.btnResetKeybinds.addEventListener('click', async () => {
  window.vgsAPI.resetKeybinds();
  currentKeybinds = await window.vgsAPI.getKeybinds();
  els.bindActivationKey.textContent = currentKeybinds.activationKey;
  renderKeybindList(els.keybindSearch.value);
});

// Save & back
function saveKeybindsAndGoBack() {
  cancelListening();
  window.vgsAPI.saveKeybinds(currentKeybinds);
  showView('settings');
  // VGS stays disabled — still in settings; re-enabled only when going back to lobby
}
els.btnKeybindsBack.addEventListener('click', saveKeybindsAndGoBack);
els.btnKeybindsBackArrow.addEventListener('click', saveKeybindsAndGoBack);

// Update command tree display to use current keybinds
async function renderCommandTree() {
  let keybinds;
  try {
    keybinds = await window.vgsAPI.getKeybinds();
  } catch {
    keybinds = null;
  }

  const commands = await window.vgsAPI.getCommands();
  const tree = commands['V'];
  els.commandTree.innerHTML = '';

  if (keybinds) {
    // Group binds by their display prefix (first 2 chars)
    const groups = {};
    for (const [id, cmd] of Object.entries(keybinds.binds)) {
      const display = cmd.keys || '';
      const groupKey = display.length >= 2 ? display.substring(0, 2) : display;
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push({ keys: display, label: cmd.label });
    }

    for (const [groupKey, items] of Object.entries(groups)) {
      const group = document.createElement('div');
      group.className = 'cmd-group';

      const title = document.createElement('div');
      title.className = 'cmd-group-title';
      title.textContent = groupKey;
      group.appendChild(title);

      for (const item of items) {
        const el = document.createElement('div');
        el.className = 'cmd-item';
        el.innerHTML = `<span class="cmd-key">${escapeHtml(item.keys)}</span> ${escapeHtml(item.label)}`;
        group.appendChild(el);
      }

      els.commandTree.appendChild(group);
    }
  } else {
    // Fallback: render from VGS_sound.json tree
    for (const [key, node] of Object.entries(tree)) {
      if (typeof node !== 'object') continue;
      const group = document.createElement('div');
      group.className = 'cmd-group';
      const title = document.createElement('div');
      title.className = 'cmd-group-title';
      title.textContent = `V${key}`;
      group.appendChild(title);
      renderNode(node, `V${key}`, group);
      els.commandTree.appendChild(group);
    }
  }
}

// === Voice Packs ===
const TEST_COMMANDS = ['VAA', 'VVW', 'VER', 'VBE', 'VVGN', 'VEA', 'VEW'];
let voicePacksList = [];
let testAbortController = null;

els.btnVoicePacks.addEventListener('click', async () => {
  await openVoicePacksView();
});

els.btnVoicePacksBackArrow.addEventListener('click', () => {
  abortTest();
  showView('settings');
});

async function openVoicePacksView() {
  voicePacksList = await window.vgsAPI.getVoicePacks();
  renderVoicePacks();
  showView('voicePacks');
}

els.vpSearch.addEventListener('input', () => {
  renderVoicePacks(els.vpSearch.value);
});

function renderVoicePacks(filter = '') {
  els.vpGrid.innerHTML = '';
  const filterLower = filter.toLowerCase();
  const activePack = userPrefs.voicePack || 'default';

  const filtered = voicePacksList.filter(p =>
    (!filterLower || p.name.toLowerCase().includes(filterLower))
  );

  if (filtered.length === 0) {
    els.vpGrid.innerHTML = '<p class="vp-empty">No voice packs found.</p>';
    return;
  }

  for (const pack of filtered) {
    els.vpGrid.appendChild(buildPackCard(pack, activePack));
  }
}

function buildPackCard(pack, activePack) {
  const isActive = pack.id === activePack;
  const card = document.createElement('div');
  card.className = 'vp-card' + (isActive ? ' vp-card-active' : '');

  // Name (Title)
  const name = document.createElement('div');
  name.className = 'vp-name';
  name.textContent = pack.name;
  if (isActive) {
    const badge = document.createElement('span');
    badge.className = 'vp-active-badge';
    badge.textContent = 'Active';
    name.appendChild(badge);
  }
  card.appendChild(name);

  // Artwork
  const art = document.createElement('div');
  art.className = 'vp-art';
  if (pack.artwork) {
    const img = document.createElement('img');
    img.src = pack.artwork;
    img.alt = pack.name;
    img.onerror = () => { art.innerHTML = `<span class="vp-art-fallback">${escapeHtml(pack.name[0])}</span>`; };
    art.appendChild(img);
  } else {
    art.innerHTML = `<span class="vp-art-fallback">${escapeHtml(pack.name[0])}</span>`;
  }
  card.appendChild(art);

  // Description
  const desc = document.createElement('div');
  desc.className = 'vp-desc';
  if (pack.description) {
    desc.textContent = pack.description;
  }
  card.appendChild(desc);

  // Buttons
  const btns = document.createElement('div');
  btns.className = 'vp-btns';

  const testBtn = document.createElement('button');
  testBtn.className = 'btn-secondary vp-test-btn';
  testBtn.textContent = 'Test';
  testBtn.dataset.packId = pack.id;
  testBtn.addEventListener('click', () => testVoicePack(pack, testBtn));
  btns.appendChild(testBtn);

  if (!isActive) {
    const useBtn = document.createElement('button');
    useBtn.className = 'btn-primary vp-use-btn';
    useBtn.textContent = 'Use';
    useBtn.addEventListener('click', () => setActiveVoicePack(pack.id));
    btns.appendChild(useBtn);
  }

  if (pack.disabled) {
    const warn = document.createElement('div');
    warn.className = 'vp-disabled-warning';
    warn.textContent = 'this voice pack may be incomplete';
    btns.appendChild(warn);
  }

  card.appendChild(btns);
  return card;
}

function setActiveVoicePack(packId) {
  userPrefs.voicePack = packId;
  saveUserPrefs();
  renderVoicePacks(els.vpSearch.value);
}

async function testVoicePack(pack, btn) {
  // If already testing this pack, stop it
  if (testAbortController && btn.dataset.testing === 'true') {
    abortTest();
    return;
  }
  abortTest();

  // Determine which commands to test (only those with sounds for non-default packs)
  let testIds;
  if (pack.id === 'default') {
    testIds = TEST_COMMANDS;
  } else {
    const available = pack.sounds ? Object.keys(pack.sounds) : [];
    testIds = TEST_COMMANDS.filter(id => available.includes(id));
    if (testIds.length === 0) testIds = available;
  }

  if (testIds.length === 0) return;

  const controller = { aborted: false };
  testAbortController = controller;
  btn.dataset.testing = 'true';
  btn.classList.add('vp-testing');

  // Select one random command
  const commandId = testIds[Math.floor(Math.random() * testIds.length)];

  if (pack.id === 'default') {
    // Play default sound via the local assets path — look up sound filename from keybinds
    const keybinds = await window.vgsAPI.getKeybinds();
    const bind = keybinds && keybinds.binds && keybinds.binds[commandId];
    if (bind && bind.sound) playSound(bind.sound);
  } else {
    try {
      const localPath = await window.vgsAPI.getVoiceSound(pack.id, commandId);
      if (localPath) playFromUrl(localPath);
      else addEvent(`<span style="color:var(--danger)">Test failed: No sound mapped for ${commandId}</span>`);
    } catch (err) {
      addEvent(`<span style="color:var(--danger)">Test IPC Error: ${escapeHtml(err.message)}</span>`);
    }
  }

  // Remove feedback after a moment
  setTimeout(() => {
    btn.classList.remove('vp-testing');
    btn.dataset.testing = 'false';
    if (testAbortController === controller) testAbortController = null;
  }, 1000);
}

function abortTest() {
  if (testAbortController) {
    testAbortController.aborted = true;
    testAbortController = null;
  }
  // Reset all test buttons
  document.querySelectorAll('.vp-test-btn').forEach(b => {
    b.textContent = 'Test';
    b.classList.remove('vp-testing');
    b.dataset.testing = 'false';
  });
}

// Init settings UI
saveSettings();

// Load user preferences from main process and pre-populate inputs
(async () => {
  try {
    const loaded = await window.vgsAPI.getUserPrefs();
    Object.assign(userPrefs, loaded);
  } catch { }

  function applyPrefs() {
    if (userPrefs.name) els.playerName.value = userPrefs.name;
    if (userPrefs.color) els.playerColor.value = userPrefs.color;
    if (userPrefs.lastRoom) els.roomCode.value = userPrefs.lastRoom;
  }

  applyPrefs();
  // Re-apply after a short delay to beat Chromium autofill
  setTimeout(applyPrefs, 100);

  // Show app version in settings
  try {
    const version = await window.vgsAPI.getAppVersion();
    const versionEl = document.getElementById('app-version');
    if (versionEl && version) versionEl.textContent = `v${version}`;
  } catch { }
})();
