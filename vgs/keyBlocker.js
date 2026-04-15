/**
 * Key blocker using a Win32 low-level keyboard hook via koffi.
 * When blocking is active (VGS sequence in progress), letter and digit
 * keystrokes are suppressed so the game doesn't receive them.
 */
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');

// Win32 struct for low-level keyboard hook data
const KBDLLHOOKSTRUCT = koffi.struct('KBDLLHOOKSTRUCT', {
  vkCode: 'uint32',
  scanCode: 'uint32',
  flags: 'uint32',
  time: 'uint32',
  dwExtraInfo: 'uintptr',
});

// Callback prototype and Win32 functions
const HookProc = koffi.proto('intptr __stdcall HookProc(int nCode, uintptr wParam, void *lParam)');
const SetWindowsHookExW = user32.func('__stdcall', 'SetWindowsHookExW', 'void*', ['int', koffi.pointer(HookProc), 'void*', 'uint32']);
const CallNextHookEx = user32.func('__stdcall', 'CallNextHookEx', 'intptr', ['void*', 'int', 'uintptr', 'void*']);
const UnhookWindowsHookEx = user32.func('__stdcall', 'UnhookWindowsHookEx', 'int', ['void*']);

const WH_KEYBOARD_LL = 13;
const WM_KEYDOWN = 0x0100;
const WM_SYSKEYDOWN = 0x0104;

let hookHandle = null;
let registeredCallback = null;
let isBlocking = false;

// Movement keys that should NEVER be blocked (VK codes)
// Covers WASD (QWERTY) + ZQSD (AZERTY) + Space
const PASSTHROUGH_KEYS = new Set([
  // 0x57, // W
  // 0x41, // A
  0x53, // S
  0x44, // D
  0x5A, // Z (AZERTY up)
  0x51, // Q (AZERTY left)
  0x20, // Space
]);

function hookCallback(nCode, wParam, lParam) {
  if (nCode >= 0 && isBlocking && (wParam === WM_KEYDOWN || wParam === WM_SYSKEYDOWN)) {
    try {
      const kb = koffi.decode(lParam, KBDLLHOOKSTRUCT);
      const vk = kb.vkCode;
      // Skip whitelisted movement keys
      if (PASSTHROUGH_KEYS.has(vk)) {
        return CallNextHookEx(hookHandle, nCode, wParam, lParam);
      }
      // Block other letters A-Z (0x41-0x5A), digits 0-9 (0x30-0x39), numpad 0-9 (0x60-0x69)
      if ((vk >= 0x41 && vk <= 0x5A) || (vk >= 0x30 && vk <= 0x39) || (vk >= 0x60 && vk <= 0x69)) {
        return 1; // Suppress — do not pass to game
      }
    } catch {
      // Safety: if decode fails, pass through
    }
  }
  return CallNextHookEx(hookHandle, nCode, wParam, lParam);
}

function start() {
  if (hookHandle) return;
  registeredCallback = koffi.register(hookCallback, koffi.pointer(HookProc));
  hookHandle = SetWindowsHookExW(WH_KEYBOARD_LL, registeredCallback, null, 0);
  if (!hookHandle) {
    console.error('[keyBlocker] Failed to install keyboard hook');
  }
}

function stop() {
  if (hookHandle) {
    UnhookWindowsHookEx(hookHandle);
    hookHandle = null;
  }
  if (registeredCallback) {
    koffi.unregister(registeredCallback);
    registeredCallback = null;
  }
  isBlocking = false;
}

function setBlocking(active) {
  isBlocking = active;
}

module.exports = { start, stop, setBlocking };
