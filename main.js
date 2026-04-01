const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const { VGSStateMachine } = require('./vgs/stateMachine');
const { buildDefaultKeybinds, mergeKeybinds, buildTreeFromKeybinds } = require('./vgs/keybinds');
const commands = require('./vgs/VGS_sound.json');
const voicePacksRegistry = require('./assets/voice_packs.json');
const keyBlocker = require('./vgs/keyBlocker');

let mainWindow;
let overlayWindow;
let vgsMenuWindow;
let ws = null;
let currentRoom = null;
let currentPlayer = null;
let currentPlayerColor = '#7cacff';
let vgsMachine;
let vgsMonitoringEnabled = true;

// Keybind system
const keybindsPath = path.join(app.getPath('userData'), 'keybinds.json');
const defaultKeybinds = buildDefaultKeybinds(commands);
let keybinds = loadKeybinds();

function loadKeybinds() {
  try {
    const saved = JSON.parse(fs.readFileSync(keybindsPath, 'utf8'));
    return mergeKeybinds(defaultKeybinds, saved);
  } catch {
    return { ...defaultKeybinds };
  }
}

function saveKeybinds() {
  fs.writeFileSync(keybindsPath, JSON.stringify(keybinds, null, 2));
}

// User preferences (name, color, last room) — file-based for admin-mode reliability
const userPrefsPath = path.join(app.getPath('userData'), 'userPrefs.json');
let userPrefs = loadUserPrefs();

function loadUserPrefs() {
  try {
    return JSON.parse(fs.readFileSync(userPrefsPath, 'utf8'));
  } catch {
    return { name: '', color: '#7cacff', lastRoom: '' };
  }
}

function saveUserPrefs() {
  fs.writeFileSync(userPrefsPath, JSON.stringify(userPrefs, null, 2));
}

function rebuildStateMachine() {
  const tree = buildTreeFromKeybinds(keybinds);
  vgsMachine = new VGSStateMachine(tree, keybinds.activationCode, onVgsMatch, onVgsReset);
}

// --- Voice Pack system ---

// Reverse-lookup: given the e.code dot-path from stateMachine, find the original QWERTY commandId (e.g. "VAA")
function getCommandId(commandPath) {
  for (const [id, cmd] of Object.entries(keybinds.binds)) {
    if (cmd.codes && cmd.codes.join('.') === commandPath) return id;
  }
  return null;
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? require('https') : require('http');
    const file = fs.createWriteStream(destPath);
    const req = protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        file.destroy();
        try { fs.unlinkSync(destPath); } catch { }
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', (err) => {
        try { fs.unlinkSync(destPath); } catch { }
        reject(err);
      });
    });
    req.on('error', (err) => {
      file.destroy();
      try { fs.unlinkSync(destPath); } catch { }
      reject(err);
    });
  });
}

async function resolveVoiceSound(voicePackId, commandId) {
  if (!voicePackId || voicePackId === 'default' || !commandId) return null;

  const pack = voicePacksRegistry.find(p => p.id === voicePackId);
  if (!pack || !pack.sounds || !pack.sounds[commandId]) return null;

  const url = pack.sounds[commandId];
  const soundDir = path.join(app.getPath('userData'), 'sounds', voicePackId);
  // Extract filename from URL (from 'vox' to '.ogg')
  const lastPart = url.split('/').pop().split('?')[0];
  const voxIdx = lastPart.toLowerCase().indexOf('vox');
  let filename = voxIdx !== -1 ? lastPart.substring(voxIdx) : (commandId + '.ogg');

  // Format naming convention (e.g. vox_vgs_attack_a.ogg -> VOX_VGS_Attack_A.ogg)
  if (filename.includes('_')) {
    filename = filename.split('_').map(part => {
      const isLast = part.toLowerCase().endsWith('.ogg');
      const word = isLast ? part.slice(0, -4) : part;
      const lower = word.toLowerCase();
      let transformed;

      if (lower === 'vox' || lower === 'vgs') {
        transformed = word.toUpperCase();
      } else {
        transformed = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return transformed + (isLast ? '.ogg' : '');
    }).join('_');
  }

  const soundFile = path.join(soundDir, filename);

  if (fs.existsSync(soundFile)) return soundFile;

  try {
    fs.mkdirSync(soundDir, { recursive: true });
    await downloadFile(url, soundFile);
    return soundFile;
  } catch (err) {
    console.error(`[VoicePack] Download failed for ${voicePackId}/${commandId}: ${err.message}`);
    return null;
  }
}

// Map uiohook scancodes to e.code strings (layout-independent physical key identifiers)
const keycodeToCode = {};
// Letters A-Z
for (let i = 0; i < 26; i++) {
  const letter = String.fromCharCode(65 + i);
  keycodeToCode[UiohookKey[letter]] = `Key${letter}`;
}
// Number row
const digitScancodes = {
  11: 'Digit0', 2: 'Digit1', 3: 'Digit2', 4: 'Digit3', 5: 'Digit4',
  6: 'Digit5', 7: 'Digit6', 8: 'Digit7', 9: 'Digit8', 10: 'Digit9'
};
for (const [scancode, code] of Object.entries(digitScancodes)) {
  keycodeToCode[Number(scancode)] = code;
}
// Numpad (treat same as digit keys)
const numpadMap = {
  Numpad0: 'Digit0', Numpad1: 'Digit1', Numpad2: 'Digit2', Numpad3: 'Digit3',
  Numpad4: 'Digit4', Numpad5: 'Digit5', Numpad6: 'Digit6', Numpad7: 'Digit7',
  Numpad8: 'Digit8', Numpad9: 'Digit9',
};
for (const [name, code] of Object.entries(numpadMap)) {
  if (UiohookKey[name] !== undefined) {
    keycodeToCode[UiohookKey[name]] = code;
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 580,
    height: 740,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'VGS Companion',
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility(false);
}

function createOverlayWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  overlayWindow = new BrowserWindow({
    width: 380,
    height: 300,
    x: 100,
    y: 20,
    alwaysOnTop: true,
    transparent: true,
    frame: false,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    type: 'toolbar',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  overlayWindow.setIgnoreMouseEvents(true);
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.showInactive();
}

function createVgsMenuWindow() {
  vgsMenuWindow = new BrowserWindow({
    width: 280,
    height: 600,
    x: 20,
    y: 200,
    alwaysOnTop: true,
    transparent: true,
    frame: false,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    type: 'toolbar',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  vgsMenuWindow.loadFile(path.join(__dirname, 'renderer', 'vgs-menu.html'));
  vgsMenuWindow.setIgnoreMouseEvents(true);
  vgsMenuWindow.setAlwaysOnTop(true, 'screen-saver');
  vgsMenuWindow.showInactive();
}

function connectToServer(serverUrl, roomCode, playerName, playerColor) {
  if (ws) {
    ws.close();
  }

  currentRoom = roomCode;
  currentPlayer = playerName;
  currentPlayerColor = playerColor || '#7cacff';

  ws = new WebSocket(serverUrl);

  ws.on('open', () => {
    ws.send(JSON.stringify({ 
      type: 'join', 
      roomCode, 
      playerName, 
      playerColor: currentPlayerColor,
      voicePack: userPrefs.voicePack || 'default'
    }));
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('ws-message', { type: 'connected' });
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('ws-message', msg);

      if (msg.type === 'vgs_event') {
        showOverlay(msg.playerName, msg.label, msg.playerColor);
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('play-sound', { label: msg.label, sound: msg.sound });
      } else if (msg.type === 'player_joined') {
        if (msg.playerName !== currentPlayer) {
          showOverlay('System', `${msg.playerName} joined`, msg.playerColor || '#aaa');
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('play-system-sound', { type: 'join' });
        }
      } else if (msg.type === 'player_left') {
        if (msg.playerName !== currentPlayer) {
          showOverlay('System', `${msg.playerName} left`, '#aaa');
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('play-system-sound', { type: 'leave' });
        }
      }
    } catch { }
  });

  ws.on('close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('ws-message', { type: 'disconnected' });
  });

  ws.on('error', (err) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('ws-message', { type: 'error', message: err.message });
  });
}

function showOverlay(playerName, label, playerColor) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('show-callout', { playerName, label, playerColor });
  }
}

// VGS menu overlay helpers
function sendVgsMenuOptions() {
  if (vgsMenuWindow && !vgsMenuWindow.isDestroyed()) {
    const options = vgsMachine.getCurrentOptions();
    vgsMenuWindow.webContents.send('show-vgs-options', options);
  }
}

function hideVgsMenu() {
  if (vgsMenuWindow && !vgsMenuWindow.isDestroyed()) {
    vgsMenuWindow.webContents.send('hide-vgs-options');
  }
}

// VGS match callback
function onVgsMatch(command, label, sound) {
  const commandId = getCommandId(command);
  const voicePackId = userPrefs.voicePack || 'default';

  if (ws && ws.readyState === WebSocket.OPEN && currentRoom) {
    ws.send(JSON.stringify({
      type: 'vgs_event',
      roomCode: currentRoom,
      playerName: currentPlayer,
      playerColor: currentPlayerColor,
      command,
      commandId,
      voicePackId,
      label,
      sound,
    }));
  }

  showOverlay(currentPlayer || 'You', label, currentPlayerColor);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('vgs-triggered', { command, commandId, voicePackId, label, sound });
}

// VGS reset callback — fires on timeout, no-match, or after a match completes
function onVgsReset() {
  keyBlocker.setBlocking(false);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('vgs-active', false);
  hideVgsMenu();
}

// Build initial state machine from keybinds
rebuildStateMachine();

// Foreground window check — skip VGS activation in certain apps
const koffi = require('koffi');
const user32FG = koffi.load('user32.dll');
const GetForegroundWindow = user32FG.func('__stdcall', 'GetForegroundWindow', 'void*', []);
const GetWindowTextA = user32FG.func('__stdcall', 'GetWindowTextA', 'int', ['void*', 'void*', 'int']);

const BLOCKED_TITLES = ['discord', 'steam', 'nex', 'naytars'];

function isForegroundBlocked() {
  try {
    const hwnd = GetForegroundWindow();
    if (!hwnd) return false;
    const buf = Buffer.alloc(512);
    const len = GetWindowTextA(hwnd, buf, 512);
    if (len <= 0) return false;
    const title = buf.toString('ascii', 0, len).toLowerCase();
    return BLOCKED_TITLES.some(t => title.includes(t));
  } catch {
    return false;
  }
}

// Global key listener via uiohook
uIOhook.on('keydown', (e) => {
  if (!vgsMonitoringEnabled) return;
  const code = keycodeToCode[e.keycode];
  if (!code) return;

  // Only activate via keyboard if activation key is a keyboard code
  const actKey = vgsMachine.getActivationKey();
  if (!vgsMachine.isActive() && !actKey.startsWith('Mouse') && code === actKey) {
    if (isForegroundBlocked()) return;
    vgsMachine.activate();
    keyBlocker.setBlocking(true);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('vgs-active', true);
    sendVgsMenuOptions();
    return;
  }

  if (vgsMachine.isActive()) {
    vgsMachine.handleKey(code);
    if (vgsMachine.isActive()) {
      sendVgsMenuOptions();
    }
  }
});

// Mouse button activation (Mouse4 = back/thumb, Mouse5 = forward/thumb)
uIOhook.on('mousedown', (e) => {
  if (!vgsMonitoringEnabled) return;
  // uiohook: button 4 = Mouse4 (back), button 5 = Mouse5 (forward)
  if (e.button !== 4 && e.button !== 5) return;

  const mouseCode = `Mouse${e.button}`;
  const actKey = vgsMachine.getActivationKey();

  if (!vgsMachine.isActive() && mouseCode === actKey) {
    if (isForegroundBlocked()) return;
    vgsMachine.activate();
    keyBlocker.setBlocking(true);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('vgs-active', true);
    sendVgsMenuOptions();
  } else if (vgsMachine.isActive()) {
    // Forward activation button (and any other side button) to the state machine
    // This handles sequences like M5→M5→Y for "VV" sub-commands
    vgsMachine.handleKey(mouseCode);
    if (vgsMachine.isActive()) {
      sendVgsMenuOptions();
    }
  }
});

// IPC Handlers
ipcMain.on('join-room', (event, { serverUrl, roomCode, playerName, playerColor }) => {
  connectToServer(serverUrl, roomCode, playerName, playerColor);
});

ipcMain.on('disconnect', () => {
  if (ws) {
    ws.close();
    ws = null;
  }
  currentRoom = null;
  currentPlayer = null;
});

ipcMain.handle('get-user-prefs', () => {
  return userPrefs;
});

ipcMain.on('save-user-prefs', (event, prefs) => {
  userPrefs = prefs;
  saveUserPrefs();
});

ipcMain.handle('get-commands', () => {
  return commands;
});

ipcMain.handle('get-keybinds', () => {
  return keybinds;
});

ipcMain.handle('get-default-keybinds', () => {
  return defaultKeybinds;
});

ipcMain.on('save-keybinds', (event, newKeybinds) => {
  keybinds = newKeybinds;
  saveKeybinds();
  rebuildStateMachine();
});

ipcMain.on('set-vgs-monitoring', (event, enabled) => {
  vgsMonitoringEnabled = enabled;
  if (!enabled && vgsMachine.isActive()) {
    vgsMachine.reset();
  }
});

ipcMain.handle('get-voice-packs', () => {
  return voicePacksRegistry;
});

ipcMain.handle('get-voice-sound', async (event, { voicePackId, commandId }) => {
  const localPath = await resolveVoiceSound(voicePackId, commandId);
  if (!localPath) return null; // null if unavailable or default pack

  try {
    const data = fs.readFileSync(localPath);
    return `data:audio/ogg;base64,${data.toString('base64')}`;
  } catch (err) {
    console.error(`[VoicePack] Failed to read cached file: ${err.message}`);
    return null;
  }
});

ipcMain.handle('clear-cache', async () => {
  try {
    const soundsDir = path.join(app.getPath('userData'), 'sounds');
    if (fs.existsSync(soundsDir)) {
      fs.rmSync(soundsDir, { recursive: true, force: true });
    }
    return { success: true };
  } catch (err) {
    console.error(`[VoicePack] Failed to clear cache: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.on('reset-keybinds', () => {
  keybinds = { ...defaultKeybinds, binds: { ...defaultKeybinds.binds } };
  saveKeybinds();
  rebuildStateMachine();
});

app.whenReady().then(() => {
  createMainWindow();
  createOverlayWindow();
  createVgsMenuWindow();
  keyBlocker.start(); // Install BEFORE uiohook so uiohook's hook runs first in the chain
  uIOhook.start();

  mainWindow.on('close', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.destroy();
    }
    if (vgsMenuWindow && !vgsMenuWindow.isDestroyed()) {
      vgsMenuWindow.destroy();
    }
    if (ws) {
      ws.removeAllListeners();
      ws.close();
      ws = null;
    }
    keyBlocker.stop();
    uIOhook.stop();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit();
  });
});

app.on('window-all-closed', () => {
  keyBlocker.stop();
  uIOhook.stop();
  app.quit();
});
