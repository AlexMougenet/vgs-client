/**
 * Keybind system: flattens the command tree into a bindable list,
 * stores custom key sequences, and rebuilds a tree for the state machine.
 *
 * Internally uses e.code values (layout-independent physical key identifiers)
 * for matching, and stores a display string (e.key based) for the UI.
 */

// Map a QWERTY character to its e.code equivalent (for building defaults from VGS_sound.json)
const charToCode = {};
for (let i = 0; i < 26; i++) {
  const letter = String.fromCharCode(65 + i); // A-Z
  charToCode[letter] = `Key${letter}`;
}
for (let i = 0; i <= 9; i++) {
  charToCode[String(i)] = `Digit${i}`;
}

// Flatten VGS_sound.json tree into a list of { id, label, sound, defaultKeys }
// defaultKeys is the full sequence e.g. "VAA" for Attack!
function flattenCommands(tree, path = '', results = []) {
  for (const [key, node] of Object.entries(tree)) {
    if (key === 'label' || key === 'sound') continue;
    if (typeof node !== 'object' || Array.isArray(node)) continue;

    const fullPath = path + key;

    if (node.label) {
      results.push({
        id: fullPath,
        label: node.label,
        sound: node.sound,
        defaultKeys: fullPath,
      });
    }

    // Recurse into children (skip label/sound)
    flattenCommands(node, fullPath, results);
  }
  return results;
}

// Build default keybinds from VGS_sound.json
function buildDefaultKeybinds(commandTree) {
  const flat = flattenCommands(commandTree);
  const activationKey = 'V';
  const activationCode = 'KeyV';
  const activationCharCode = charToCode[activationKey] || `Key${activationKey}`;

  const binds = {};
  for (const cmd of flat) {
    // Convert QWERTY characters to e.code values for matching.
    // Any key in the sequence that matches the activation key character is treated
    // as the activation key press (e.g. the sub-"V" category = press activation key again),
    // so "VVY" maps to [activationCode, activationCode, KeyY].
    const codes = [];
    for (const ch of cmd.defaultKeys) {
      const code = charToCode[ch] || `Key${ch}`;
      codes.push(code === activationCharCode ? activationCode : code);
    }
    binds[cmd.id] = {
      label: cmd.label,
      sound: cmd.sound,
      keys: cmd.defaultKeys,   // display string (QWERTY characters)
      codes,                   // e.code array for matching
    };
  }
  return {
    activationKey,   // display character
    activationCode,  // e.code for matching
    binds,
  };
}

// Merge saved keybinds with defaults (handles new commands added to VGS_sound.json)
function mergeKeybinds(defaults, saved) {
  const merged = {
    activationKey: saved.activationKey || defaults.activationKey,
    activationCode: saved.activationCode || defaults.activationCode,
    binds: {},
  };

  // Start with all defaults
  for (const [id, cmd] of Object.entries(defaults.binds)) {
    merged.binds[id] = { ...cmd, codes: [...cmd.codes] };
  }

  // Override with saved custom keys
  if (saved.binds) {
    for (const [id, savedCmd] of Object.entries(saved.binds)) {
      if (merged.binds[id]) {
        merged.binds[id].keys = savedCmd.keys;
        // If saved bind has codes, use them; otherwise derive from keys (backward compat)
        if (savedCmd.codes && Array.isArray(savedCmd.codes)) {
          merged.binds[id].codes = savedCmd.codes;
        } else {
          // Backward compatibility: convert old char-based keys to codes
          const codes = [];
          for (const ch of savedCmd.keys) {
            codes.push(charToCode[ch] || `Key${ch}`);
          }
          merged.binds[id].codes = codes;
        }
      }
    }
  }

  return merged;
}

// Build a command tree from keybinds (for the state machine)
// The tree is keyed by e.code values (e.g. "KeyV" -> "KeyA" -> "KeyA" -> {label, sound})
// Each node also stores _display (the user-visible key character) and
// _groupLabel (summary label for intermediate nodes, e.g. "Attack" for the VA group)
function buildTreeFromKeybinds(keybinds) {
  const tree = {};

  for (const [id, cmd] of Object.entries(keybinds.binds)) {
    const codes = cmd.codes;
    const display = cmd.keys || '';
    if (!codes || codes.length < 2) continue;

    // Walk/create the path in the tree using code values
    // The activation key display (e.g. "M5") can be multi-char, so track display offset carefully.
    // Any code that equals the activationCode gets the full activation display string.
    let displayOffset = 0;
    let node = tree;
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      let displayChar;
      if (code === keybinds.activationCode) {
        // This key press is the activation key — use its full display string
        displayChar = keybinds.activationKey || '';
        displayOffset += displayChar.length;
      } else {
        // Normal key — one display char at the current offset
        displayChar = display[displayOffset] || '';
        displayOffset += 1;
      }
      if (!node[code]) node[code] = {};
      // Store display character for this key (later nodes may overwrite with same value)
      node[code]._display = displayChar;

      if (i === codes.length - 1) {
        // Leaf node — set label and sound
        node[code].label = cmd.label;
        node[code].sound = cmd.sound;
      } else {
        node = node[code];
      }
    }
  }

  // Derive group labels for intermediate nodes
  deriveGroupLabels(tree);

  return tree;
}

// Walk the tree and assign _groupLabel to intermediate nodes (those with children but no label).
// Uses the "self-repeat" child pattern first (e.g. VAA = "Attack!" for the VA group),
// then falls back to the first child's label.
function deriveGroupLabels(node) {
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('_') || key === 'label' || key === 'sound') continue;
    if (typeof child !== 'object') continue;

    // Recurse into children first so nested group labels are available
    deriveGroupLabels(child);

    // Only set group label for intermediate nodes (with children, no direct label)
    const childKeys = Object.keys(child).filter(k => !k.startsWith('_') && k !== 'label' && k !== 'sound');
    if (childKeys.length > 0 && !child.label) {
      // Try self-repeat pattern (e.g. VAA "Attack!" for VA, VDD "Defend!" for VD)
      const selfChild = child[key];
      if (selfChild && (selfChild.label || selfChild._groupLabel)) {
        child._groupLabel = selfChild.label || selfChild._groupLabel;
      } else {
        // Fall back to first child's label or group label
        for (const k of childKeys) {
          const c = child[k];
          if (c && (c.label || c._groupLabel)) {
            child._groupLabel = c.label || c._groupLabel;
            break;
          }
        }
      }
    }
  }
}

module.exports = { flattenCommands, buildDefaultKeybinds, mergeKeybinds, buildTreeFromKeybinds, charToCode };
