(() => {
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
    'CODE', 'PRE', 'KBD', 'SAMP', 'BUTTON'
  ]);
  let enabled = true;
  let highlightMode = false;
  let replacements = {};
  let grammarEntries = [];
  let mutationTimer = null;
  let encounterTimer = null;
  const encountered = new Set();
  const pending = new Set();
  const changedNodes = new Map();
  const pendingRoots = new Set();

  function recordMatch(words) {
    if (window !== window.top) return;
    for (const word of words) if (!encountered.has(word)) { pending.add(word); encountered.add(word); }
    if (!pending.size || encounterTimer) return;
    encounterTimer = setTimeout(() => {
      encounterTimer = null;
      const english = [...pending]; pending.clear();
      chrome.runtime.sendMessage({ type: 'encounter', english }).catch(() => {});
    }, 500);
  }

  function shouldSkipNode(node) {
    const parent = node.parentElement;
    if (!parent || parent.closest([...SKIP_TAGS].join(','))) return true;
    if (parent.isContentEditable || parent.closest('[contenteditable="true"]')) return true;
    if (parent.closest('.ita-swapped-word')) return true;
    return false;
  }
  function replaceNode(node) {
    if (!enabled || !node?.nodeValue || shouldSkipNode(node)) return;
    const previous = changedNodes.get(node);
    if (previous && node.nodeValue === previous.output) return;
    const original = node.nodeValue;
    const words = new Set();
    const output = globalThis.ScambioGrammar.replaceText(original, replacements, grammarEntries, matches => {
      matches.forEach(word => words.add(word));
      recordMatch(matches);
    });
    if (output === original) return;
    if (!highlightMode) {
      node.nodeValue = output;
      changedNodes.set(node, { original, output, words: [...words] });
      return;
    }
    // Hint mode wraps the translated output and retains the original text in its title.
    const span = document.createElement('span');
    span.className = 'ita-swapped-word';
    span.textContent = output;
    span.title = `Original: ${original}`;
    span.style.cursor = 'help';
    span.style.borderRadius = '3px';
    span.style.backgroundColor = 'rgba(37, 99, 235, 0.08)';
    node.parentNode?.replaceChild(span, node);
    changedNodes.set(span, { original, output, words: [...words] });
  }
  function scan(root = document.body) {
    if (!enabled || !root) return;
    if (root.nodeType === Node.TEXT_NODE) { replaceNode(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    if (SKIP_TAGS.has(root.tagName) || root.isContentEditable || root.closest('[contenteditable="true"]')) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) { return shouldSkipNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
    });
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(replaceNode);
  }
  function applySettings(data) {
    if (!data || data.error) return;
    for (const [node, value] of changedNodes) {
      if (!node.isConnected) continue;
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue === value.output) node.nodeValue = value.original;
      else if (node.nodeType === Node.ELEMENT_NODE && node.textContent === value.output) node.replaceWith(document.createTextNode(value.original));
    }
    changedNodes.clear();
    enabled = Boolean(data.enabled);
    pending.clear(); encountered.clear();
    highlightMode = Boolean(data.highlightMode);
    replacements = data.replacements || {};
    grammarEntries = Array.isArray(data.grammarEntries) ? data.grammarEntries : [];
    if (enabled) scan();
  }
  chrome.runtime.sendMessage({ type: 'get-settings' }).then(applySettings).catch(() => {});
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'settings-updated') applySettings(message);
    if (message?.type === 'page-words') {
      const words = new Set();
      if (enabled) for (const [node, value] of changedNodes) {
        if (node.isConnected && (node.nodeType === Node.TEXT_NODE ? node.nodeValue : node.textContent) === value.output) {
          value.words.forEach(word => words.add(word));
        }
      }
      // Page identity is transient and is never written to storage.
      sendResponse({ english: [...words], pageKey: `${performance.timeOrigin}:${location.href}`, enabled });
    }
  });
  new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') pendingRoots.add(mutation.target);
      for (const node of mutation.addedNodes) pendingRoots.add(node);
    }
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      const roots = [...pendingRoots]; pendingRoots.clear();
      for (const node of changedNodes.keys()) if (!node.isConnected) changedNodes.delete(node);
      if (!enabled) return;
      for (const node of roots) if (node.isConnected) scan(node);
    }, 50);
  }).observe(document.documentElement, { childList: true, characterData: true, subtree: true });
})();
