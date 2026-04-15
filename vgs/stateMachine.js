class VGSStateMachine {
  constructor(commandTree, activationKey, onMatch, onReset) {
    this.tree = commandTree;
    // activationKey is now an e.code string like "KeyV"
    this.activationKey = activationKey || 'KeyV';
    this.onMatch = onMatch;
    this.onReset = onReset;
    this.currentNode = this.tree;
    this.sequenceTimeout = null;
    this.active = false;
    this.currentPath = '';
  }

  activate() {
    this.active = true;
    this.currentNode = this.tree[this.activationKey] || {};
    this.currentPath = this.activationKey;
    this.resetTimeout();
  }

  handleKey(code) {
    if (!this.active) return false;

    if (code === 'Escape') {
      this.reset();
      return true;
    }

    // code is an e.code string like "KeyA", "Digit1"
    const child = this.currentNode[code];

    if (child && typeof child === 'object' && !Array.isArray(child)) {
      this.currentPath += '.' + code;
      this.currentNode = child;
      this.resetTimeout();

      if (child.label) {
        this.onMatch(this.currentPath, child.label, child.sound);
        this.reset();
        return true;
      }

      // Check if this node only has metadata keys (leaf with no further children)
      const childKeys = Object.keys(child).filter(c => !c.startsWith('_') && c !== 'label' && c !== 'sound');
      if (childKeys.length === 0) {
        this.reset();
      }

      return true;
    }

    // No matching child — reset
    this.reset();
    return false;
  }

  // Returns the available options at the current tree node.
  // Each option has { display, label } for the VGS menu overlay.
  getCurrentOptions() {
    if (!this.active) return [];
    const options = [];
    for (const [key, child] of Object.entries(this.currentNode)) {
      if (key.startsWith('_') || key === 'label' || key === 'sound') continue;
      if (typeof child !== 'object' || Array.isArray(child)) continue;
      const display = child._display || key;
      const label = child.label || child._groupLabel || '';
      options.push({ display, label });
    }
    return options;
  }

  resetTimeout() {
    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout);
    }
    this.sequenceTimeout = setTimeout(() => this.reset(), 1500);
  }

  reset() {
    const wasActive = this.active;
    this.active = false;
    this.currentNode = this.tree;
    this.currentPath = '';
    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout);
      this.sequenceTimeout = null;
    }
    if (wasActive && this.onReset) {
      this.onReset();
    }
  }

  isActive() {
    return this.active;
  }

  getActivationKey() {
    return this.activationKey;
  }
}

module.exports = { VGSStateMachine };
