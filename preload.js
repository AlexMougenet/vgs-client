const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vgsAPI', {
  joinRoom: (serverUrl, roomCode, playerName, playerColor) => {
    ipcRenderer.send('join-room', { serverUrl, roomCode, playerName, playerColor });
  },
  disconnect: () => {
    ipcRenderer.send('disconnect');
  },
  getUserPrefs: () => ipcRenderer.invoke('get-user-prefs'),
  saveUserPrefs: (prefs) => ipcRenderer.send('save-user-prefs', prefs),
  getCommands: () => ipcRenderer.invoke('get-commands'),

  // Keybinds
  getKeybinds: () => ipcRenderer.invoke('get-keybinds'),
  getDefaultKeybinds: () => ipcRenderer.invoke('get-default-keybinds'),
  saveKeybinds: (keybinds) => ipcRenderer.send('save-keybinds', keybinds),
  resetKeybinds: () => ipcRenderer.send('reset-keybinds'),
  setVgsMonitoring: (enabled) => ipcRenderer.send('set-vgs-monitoring', enabled),

  // Voice Packs
  getVoicePacks: () => ipcRenderer.invoke('get-voice-packs'),
  getVoiceSound: (voicePackId, commandId) => ipcRenderer.invoke('get-voice-sound', { voicePackId, commandId }),
  clearCache: () => ipcRenderer.invoke('clear-cache'),

  // Events from main process
  onWsMessage: (callback) => {
    ipcRenderer.on('ws-message', (event, data) => callback(data));
  },
  onVgsTriggered: (callback) => {
    ipcRenderer.on('vgs-triggered', (event, data) => callback(data));
  },
  onVgsActive: (callback) => {
    ipcRenderer.on('vgs-active', (event, active) => callback(active));
  },
  onPlaySound: (callback) => {
    ipcRenderer.on('play-sound', (event, data) => callback(data));
  },

  // Overlay
  onShowCallout: (callback) => {
    ipcRenderer.on('show-callout', (event, data) => callback(data));
  },

  // VGS Menu overlay
  onShowVgsOptions: (callback) => {
    ipcRenderer.on('show-vgs-options', (event, options) => callback(options));
  },
  onHideVgsOptions: (callback) => {
    ipcRenderer.on('hide-vgs-options', () => callback());
  },
});
