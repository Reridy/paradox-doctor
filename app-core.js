'use strict';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const MAX_FILES = 2200;
const MAX_TOTAL_BYTES = 45 * 1024 * 1024;
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const BASELINE_KEY = 'paradoxDoctorBaselineV4';
const IGNORE_KEY = 'paradoxDoctorIgnoredV4';
const GAME_KEY = 'paradoxDoctorGameV4';

const profiles = {
  hoi4: {
    name: 'Hearts of Iron IV', short: 'HOI4',
    hero: 'Scan a Hearts of Iron IV project and a fresh error.log. Paradox Doctor groups repeated engine noise, checks common cross-file mistakes, and tells you what to investigate first.',
    logPath: 'Documents/Paradox Interactive/Hearts of Iron IV/logs/error.log',
    guides: [
      ['Parser', 'Unexpected token', 'Trace parser cascades back to the first broken block.', 'errors/unexpected-token.html'],
      ['Localization', 'Duplicate localization', 'Find duplicate keys across selected localization files.', 'errors/duplicate-localization.html'],
      ['Scripting', 'Unknown effect / scope', 'Separate spelling, context and scope problems.', 'errors/unknown-effect.html'],
      ['Map', 'State & province failures', 'Review state IDs, province membership and strategic regions.', 'errors/hoi4-map-state.html']
    ]
  },
  vic3: {
    name: 'Victoria 3', short: 'VIC3',
    hero: 'Scan a Victoria 3 project and a fresh error.log. Paradox Doctor focuses on Jomini scope failures, journal/event references, localization paths and state-region problems.',
    logPath: 'Documents/Paradox Interactive/Victoria 3/logs/error.log',
    guides: [
      ['Localization', 'Localization not showing', 'Check path, header, syntax and file encoding.', 'errors/vic3-localization.html'],
      ['Jomini', 'Unset / wrong scope', 'Understand event-target and scope failures.', 'errors/vic3-scope.html'],
      ['Journal', 'Journal entries & events', 'Check object structure and unresolved references.', 'errors/vic3-journal-events.html'],
      ['Map', 'State-region failures', 'Review duplicate province membership and state regions.', 'errors/vic3-map-state.html']
    ]
  }
};

const state = {
  game: 'hoi4', projectFiles: [], fileData: new Map(), logFile: null, logText: '',
  referenceData: new Map(), referenceFiles: [], gameVersion: '', findings: [], lastScan: null,
  filter: 'all', category: 'all', search: '', newOnly: false, showIgnored: false, cancel: false,
  baseline: new Set(), ignored: new Set(), scanCoverage: []
};

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
function readJSON(key, fallback) { try { return JSON.parse(safeGet(key) || '') ?? fallback; } catch { return fallback; } }
function writeJSON(key, value) { return safeSet(key, JSON.stringify(value)); }
function formatBytes(n) { if (n < 1024) return `${n} B`; if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`; return `${(n / 1048576).toFixed(1)} MB`; }
function pathOf(file) { return (file.webkitRelativePath || file.name || '').replaceAll('\\', '/'); }
function relativePath(path) { const p = String(path).replaceAll('\\', '/').split('/'); return p.length > 1 ? p.slice(1).join('/') : p[0]; }
function lineAt(text, index) { return text.slice(0, Math.max(0, index)).split(/\r?\n/).length; }
function fileExt(name) { return (name.match(/\.([^.]+)$/) || [,''])[1].toLowerCase(); }
function isSupported(file) { return /\.(txt|yml|yaml|log|mod|json|gui|asset|csv)$/i.test(file.name); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

function makeFinding(severity, title, file, line, explanation, opts = {}) {
  return {
    severity, title, file: file || 'project', line: line || 1, explanation,
    category: opts.category || 'General', confidence: opts.confidence || 'medium', root: !!opts.root,
    frequency: opts.frequency || 1, game: state.game, guide: opts.guide || null,
    action: opts.action || null, heuristic: !!opts.heuristic
  };
}

function fingerprint(x) {
  const title = String(x.title).replace(/\b\d+\b/g, '#').toLowerCase();
  const file = String(x.file).replaceAll('\\', '/').replace(/^.*?\/(common|events|history|map|map_data|locali[sz]ation|gfx)\//i, '$1/').toLowerCase();
  return [x.game || state.game, x.category, title, file].join('|');
}

function loadStoredPreferences() {
  const q = new URLSearchParams(location.search).get('game');
  const saved = safeGet(GAME_KEY);
  setGame(profiles[q] ? q : profiles[saved] ? saved : 'hoi4', false);
  const ignoredAll = readJSON(IGNORE_KEY, {});
  state.ignored = new Set(ignoredAll[state.game] || []);
  loadBaselineForGame();
}

function setGame(game, persist = true) {
  if (!profiles[game]) return;
  const changed = state.game !== game;
  state.game = game;
  document.body.dataset.game = game;
  if (persist) safeSet(GAME_KEY, game);
  $('#gameSelect').value = game;
  $('#heroGameBadge').textContent = profiles[game].short;
  $('#heroCopy').textContent = profiles[game].hero;
  $('#workspaceGameName').textContent = profiles[game].name;
  $('#guideHeading').textContent = `Common ${profiles[game].short} problems`;
  $('#guideGrid').innerHTML = profiles[game].guides.map(([cat,title,copy,href]) => `<a class="guide-card" href="${href}"><span>${cat}</span><h3>${title}</h3><p>${copy}</p></a>`).join('');
  $('#logPathText').textContent = profiles[game].logPath;
  if (changed) {
    const ignoredAll = readJSON(IGNORE_KEY, {});
    state.ignored = new Set(ignoredAll[game] || []);
    loadBaselineForGame();
    if (state.findings.length) clearResults('Game changed. Run a new diagnosis for the selected game.');
  }
}

function loadBaselineForGame() {
  const all = readJSON(BASELINE_KEY, {});
  const entry = all[state.game];
  state.baseline = new Set(entry?.fingerprints || []);
  const status = $('#baselineStatus');
  if (!status) return;
  if (state.baseline.size) {
    const date = entry?.createdAt ? new Date(entry.createdAt).toLocaleString() : 'saved locally';
    status.textContent = `${state.baseline.size} finding fingerprints · ${date}`;
    $('#clearBaselineBtn').disabled = false;
  } else {
    status.textContent = 'No baseline saved for this game.';
    $('#clearBaselineBtn').disabled = true;
  }
}

function saveIgnored() {
  const all = readJSON(IGNORE_KEY, {});
  all[state.game] = [...state.ignored];
  writeJSON(IGNORE_KEY, all);
}

async function readFileEntry(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const text = new TextDecoder('utf-8').decode(bytes);
  return { text, bom, bytes: bytes.length, name: file.name, path: pathOf(file) };
}

function setProjectFiles(files) {
  const usable = files.filter(isSupported).slice(0, MAX_FILES);
  state.projectFiles = usable;
  state.fileData.clear();
  const total = usable.reduce((n, f) => n + f.size, 0);
  $('#projectStatus').textContent = usable.length ? `${usable.length} supported files · ${formatBytes(total)}` : 'No supported project files selected.';
  $('#clearProjectBtn').classList.toggle('hidden', !usable.length);
  const counts = {};
  usable.forEach(f => counts[fileExt(f.name)] = (counts[fileExt(f.name)] || 0) + 1);
  const chips = $('#projectSummary');
  chips.innerHTML = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,7).map(([ext,n]) => `<span>${escapeHtml(ext || 'file')} ${n}</span>`).join('');
  if (files.length > MAX_FILES) chips.innerHTML += `<span>first ${MAX_FILES} only</span>`;
  chips.classList.toggle('hidden', !usable.length);
  updateReadyState();
}

async function setLogFile(file) {
  if (!file) return;
  state.logFile = file;
  state.logText = await file.text();
  $('#logInput').value = state.logText;
  $('#logFileLabel').textContent = `${file.name} · ${formatBytes(file.size)}`;
  $('#clearLogBtn').classList.remove('hidden');
  updateReadyState();
}

function clearProject() {
  state.projectFiles = []; state.fileData.clear();
  $('#folderInput').value = ''; $('#fileInput').value = '';
  $('#projectStatus').textContent = 'No project files selected.';
  $('#projectSummary').classList.add('hidden'); $('#projectSummary').innerHTML = '';
  $('#clearProjectBtn').classList.add('hidden'); updateReadyState();
}
function clearLog() {
  state.logFile = null; state.logText = '';
  $('#logFileInput').value = ''; $('#logInput').value = '';
  $('#logFileLabel').textContent = 'No log file selected'; $('#clearLogBtn').classList.add('hidden'); updateReadyState();
}
function clearWorkspace() { clearProject(); clearLog(); state.referenceData.clear(); state.referenceFiles=[]; $('#referenceInput').value=''; $('#referenceStatus').textContent='Nothing loaded'; $('#gameVersionInput').value=''; state.gameVersion=''; clearResults(); }

function updateReadyState() {
  state.logText = $('#logInput').value;
  const hasProject = state.projectFiles.length > 0;
  const hasLog = state.logText.trim().length > 0;
  $('#runBtn').disabled = !(hasProject || hasLog);
  if (hasProject && hasLog) { $('#readyLabel').textContent = 'Project + error.log ready.'; $('#readyDetail').textContent = 'Best context: cross-file checks and engine log triage.'; }
  else if (hasProject) { $('#readyLabel').textContent = 'Project ready.'; $('#readyDetail').textContent = 'Add error.log for stronger root-cause prioritization.'; }
  else if (hasLog) { $('#readyLabel').textContent = 'error.log ready.'; $('#readyDetail').textContent = 'You can diagnose the log alone or add the project folder.'; }
  else { $('#readyLabel').textContent = 'Add a project folder or error.log to begin.'; $('#readyDetail').textContent = 'Files stay on this device.'; }
}

async function loadReference(files) {
  const usable = files.filter(isSupported).slice(0, 3000);
  state.referenceFiles = usable;
  state.referenceData.clear();
  $('#referenceStatus').textContent = usable.length ? `Indexing ${usable.length} files…` : 'Nothing loaded';
  let count = 0;
  for (const file of usable) {
    if (file.size <= 1.5 * 1024 * 1024) {
      try { state.referenceData.set(relativePath(pathOf(file)), await readFileEntry(file)); } catch {}
    }
    count++;
    if (count % 80 === 0) await new Promise(r => setTimeout(r, 0));
  }
  $('#referenceStatus').textContent = `${state.referenceData.size} text files indexed locally`;
}
