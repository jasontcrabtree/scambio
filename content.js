(() => {
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT',
    'OPTION', 'CODE', 'PRE'
  ]);

  let enabled = true;
  let highlightMode = false;
  let replacements = {};
  let regex = null;
  let lookup = new Map();
  let mutationTimer = null;

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function rebuildMatcher() {
    const entries = Object.entries(replacements)
      .filter(([english, italian]) => english && italian)
      .sort((a, b) => b[0].length - a[0].length);

    lookup = new Map(entries.map(([english, italian]) => [english.toLocaleLowerCase(), italian]));

    regex = entries.length
      ? new RegExp(`\\b(?:${entries.map(([english]) => escapeRegExp(english)).join('|')})\\b`, 'giu')
      : null;
  }

  function preserveCase(original, replacement) {
    if (original === original.toUpperCase()) return replacement.toUpperCase();
    if (original[0] === original[0].toUpperCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  function shouldSkipNode(node) {
    const parent = node.parentElement;
    if (!parent) return true;
    if (SKIP_TAGS.has(parent.tagName)) return true;
    if (parent.isContentEditable) return true;
    if (parent.closest('[contenteditable="true"]')) return true;
    if (parent.closest('.ita-swapped-word')) return true;
    return false;
  }

  function replaceNode(node) {
    if (!enabled || !regex || !node?.nodeValue || shouldSkipNode(node)) return;

    const text = node.nodeValue;
    regex.lastIndex = 0;
    if (!regex.test(text)) return;
    regex.lastIndex = 0;

    if (!highlightMode) {
      const output = text.replace(regex, match => {
        const replacement = lookup.get(match.toLocaleLowerCase());
        return replacement ? preserveCase(match, replacement) : match;
      });

      if (output !== text) node.nodeValue = output;
      regex.lastIndex = 0;
      return;
    }

    const parent = node.parentNode;
    if (!parent) return;

    const fragment = document.createDocumentFragment();
    let currentIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > currentIndex) {
        fragment.appendChild(document.createTextNode(text.slice(currentIndex, match.index)));
      }

      const replacement = lookup.get(match[0].toLocaleLowerCase());
      if (!replacement) {
        fragment.appendChild(document.createTextNode(match[0]));
      } else {
        const span = document.createElement('span');
        span.className = 'ita-swapped-word';
        span.textContent = preserveCase(match[0], replacement);
        span.title = `Original: ${match[0]}`;
        span.style.cursor = 'help';
        span.style.borderRadius = '3px';
        span.addEventListener('mouseenter', () => {
          span.style.backgroundColor = 'rgba(37, 99, 235, 0.12)';
        });
        span.addEventListener('mouseleave', () => {
          span.style.backgroundColor = 'transparent';
        });
        fragment.appendChild(span);
      }

      currentIndex = match.index + match[0].length;
    }

    if (currentIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(currentIndex)));
    }

    parent.replaceChild(fragment, node);
    regex.lastIndex = 0;
  }

  function scan(root = document.body) {
    if (!enabled || !regex || !root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      replaceNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE || shouldSkipNode(root.firstChild || root)) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return shouldSkipNode(node)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      }
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
    rebuildMatcher();

    // Deliberately rescan the existing DOM. We do not cache processed nodes:
    // this ensures newly added vocabulary works without a page refresh.
    if (enabled) scan();
  }

  chrome.runtime.sendMessage({ type: 'get-settings' })
    .then(applySettings)
    .catch(() => {});

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'settings-updated') applySettings(message);
  });

  new MutationObserver(mutations => {
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      if (!enabled) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) replaceNode(node);
          else if (node.nodeType === Node.ELEMENT_NODE) scan(node);
        }
      }
    }, 50);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
