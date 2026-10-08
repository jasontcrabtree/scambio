const enabledEl = document.getElementById('enabled');
const highlightEl = document.getElementById('highlight');
const italianEl = document.getElementById('italian');
const englishEl = document.getElementById('english');
const addEl = document.getElementById('add');
const downloadEl = document.getElementById('download');
const listEl = document.getElementById('list');
const countEl = document.getElementById('count');
const statusEl = document.getElementById('status');

let state;

async function getState() {
  state = await chrome.runtime.sendMessage({ type: 'get-settings' });
  render();
}

function render() {
  enabledEl.checked = state.enabled;
  highlightEl.checked = state.highlightMode;
  listEl.innerHTML = '';
  countEl.textContent = `${state.allEntries.length} entries`;

  state.allEntries.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'item';

    const text = document.createElement('span');
    text.textContent = `${entry.italian} → ${entry.english}`;

    const isAdded = index >= state.bundledEntries.length;
    if (isAdded) {
      const remove = document.createElement('button');
      remove.className = 'remove';
      remove.textContent = 'Remove';
      remove.onclick = async () => {
        const addedEntries = state.addedEntries.filter((_, i) => i !== index - state.bundledEntries.length);
        await chrome.storage.local.set({ addedEntries });
        await chrome.runtime.sendMessage({ type: 'settings-changed' });
        await getState();
        showStatus('Removed');
      };
      row.append(text, remove);
    } else {
      const source = document.createElement('span');
      source.className = 'source';
      source.textContent = 'CSV';
      row.append(text, source);
    }

    listEl.append(row);
  });
}

async function updateSetting(key, value) {
  await chrome.storage.local.set({ [key]: value });
  await chrome.runtime.sendMessage({ type: 'settings-changed' });
}

enabledEl.onchange = async () => {
  await updateSetting('enabled', enabledEl.checked);
  showStatus(enabledEl.checked ? 'Enabled' : 'Disabled');
};

highlightEl.onchange = async () => {
  await updateSetting('highlightMode', highlightEl.checked);
  showStatus(highlightEl.checked ? 'Hints on' : 'Hints off');
};

addEl.onclick = async () => {
  const italian = italianEl.value.trim();
  const english = englishEl.value.trim();
  if (!italian || !english) return;

  const addedEntries = [...state.addedEntries, { italian, english }];
  await chrome.storage.local.set({ addedEntries });
  await chrome.runtime.sendMessage({ type: 'settings-changed' });

  italianEl.value = '';
  englishEl.value = '';
  await getState();
  showStatus('Added');
};

function downloadCsv() {
  const csv = state.allEntries
    .map(({ italian, english }) => `${italian},${english}`)
    .join('\n') + '\n';

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'vocabulary.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showStatus('CSV downloaded');
}

downloadEl.onclick = downloadCsv;

function showStatus(message) {
  statusEl.textContent = message;
  clearTimeout(showStatus.timer);
  showStatus.timer = setTimeout(() => { statusEl.textContent = ''; }, 1800);
}

getState();
