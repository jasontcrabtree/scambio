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

  function shouldSkipNode(node) {
    const parent = node.parentElement;
    if (!parent || SKIP_TAGS.has(parent.tagName)) return true;
    if (parent.isContentEditable || parent.closest('[contenteditable="true"]')) return true;
    if (parent.closest('.ita-swapped-word')) return true;
    return false;
  }
  function replaceNode(node) {
    if (!enabled || !node?.nodeValue || shouldSkipNode(node)) return;
    const original = node.nodeValue;
    const output = globalThis.ScambioGrammar.replaceText(original, replacements, grammarEntries);
    if (output === original) return;
    if (!highlightMode) {
      node.nodeValue = output;
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
    enabled = Boolean(data.enabled);
    highlightMode = Boolean(data.highlightMode);
    replacements = data.replacements || {};
    grammarEntries = Array.isArray(data.grammarEntries) ? data.grammarEntries : [];
    if (enabled) scan();
  }
  chrome.runtime.sendMessage({ type: 'get-settings' }).then(applySettings).catch(() => {});
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'settings-updated') applySettings(message);
  });
  new MutationObserver(mutations => {
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      if (!enabled) return;
      for (const mutation of mutations) for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE) replaceNode(node);
        else if (node.nodeType === Node.ELEMENT_NODE) scan(node);
      }
    }, 50);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
