const state = {
  files: [],
  issues: [],
  logFile: null,
  scanMeta: null,
  filter: 'all'
};

const qs = (s) => document.querySelector(s);
const qsa = (s) => [...document.querySelectorAll(s)];
const fileInput = qs('#fileInput');
const folderInput = qs('#folderInput');
const dropZone = qs('#dropZone');
const fileStatus = qs('#fileStatus');
const scanFilesBtn = qs('#scanFilesBtn');
const logFileInput = qs('#logFileInput');
const logDropZone = qs('#logDropZone');
const logFileStatus = qs('#logFileStatus');
const logInput = qs('#logInput');

qsa('.tab').forEach((tab) => tab.addEventListener('click', () => {
  qsa('.tab').forEach((t) => t.classList.remove('active'));
  qsa('.panel').forEach((p) => p.classList.remove('active'));
  tab.classList.add('active');
  qs(`#${tab.dataset.tab}Panel`).classList.add('active');
}));

fileInput.addEventListener('change', () => setFiles([...fileInput.files]));
folderInput.addEventListener('change', () => setFiles([...folderInput.files]));
['dragenter', 'dragover'].forEach((ev) => dropZone.addEventListener(ev, (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
}));
['dragleave', 'drop'].forEach((ev) => dropZone.addEventListener(ev, (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
}));
dropZone.addEventListener('drop', (e) => setFiles([...e.dataTransfer.files]));

function isSupportedFile(file) {
  const name = file.name.toLowerCase();
  return /\.(txt|yml|yaml|log|mod)$/.test(name) || name === 'descriptor.mod';
}

function filePath(file) {
  return file.webkitRelativePath || file.name;
}

function setFiles(files) {
  state.files = files.filter(isSupportedFile);
  const totalBytes = state.files.reduce((sum, f) => sum + f.size, 0);
  const rejected = files.length - state.files.length;
  scanFilesBtn.disabled = !state.files.length;
  fileStatus.textContent = state.files.length
    ? `${state.files.length} supported file${state.files.length === 1 ? '' : 's'} · ${formatBytes(totalBytes)}${rejected ? ` · ${rejected} skipped` : ''}`
    : 'No supported files selected';
  dropZone.querySelector('strong').textContent = state.files.length
    ? `${state.files.length} file${state.files.length === 1 ? '' : 's'} ready`
    : 'Drop mod text files here';
}

logFileInput.addEventListener('change', () => loadLogFile(logFileInput.files[0]));
['dragenter', 'dragover'].forEach((ev) => logDropZone.addEventListener(ev, (e) => {
  e.preventDefault();
  logDropZone.classList.add('dragover');
}));
['dragleave', 'drop'].forEach((ev) => logDropZone.addEventListener(ev, (e) => {
  e.preventDefault();
  logDropZone.classList.remove('dragover');
}));
logDropZone.addEventListener('drop', (e) => {
  const file = [...e.dataTransfer.files].find((f) => /\.(log|txt)$/i.test(f.name));
  if (file) loadLogFile(file);
  else logFileStatus.textContent = 'Please choose a .log or .txt file.';
});

async function loadLogFile(file) {
  if (!file) return;
  if (!/\.(log|txt)$/i.test(file.name)) {
    logFileStatus.textContent = 'Please choose a .log or .txt file.';
    return;
  }
  state.logFile = file;
  logFileStatus.textContent = `Loaded ${file.name} (${formatBytes(file.size)})`;
  logDropZone.querySelector('strong').textContent = file.name;
  logInput.value = await file.text();
  renderIssues(analyzeLog(logInput.value, file.name), {
    mode: 'error.log', files: 1, bytes: file.size
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

scanFilesBtn.addEventListener('click', scanFiles);
qs('#scanLogBtn').addEventListener('click', () => renderIssues(
  analyzeLog(logInput.value, state.logFile?.name || 'error.log'),
  { mode: 'error.log', files: 1, bytes: logInput.value.length }
));
qs('#transformYearsBtn').addEventListener('click', transformYears);
qs('#copyYearsBtn').addEventListener('click', async () => {
  await navigator.clipboard.writeText(qs('#yearOutput').value);
  flashButton(qs('#copyYearsBtn'), 'Copied!');
});

async function scanFiles() {
  if (!state.files.length) return;
  const totalBytes = state.files.reduce((sum, f) => sum + f.size, 0);
  if (state.files.length > 3500 || totalBytes > 60 * 1024 * 1024) {
    renderIssues([
      issue('warning', 'Large scan blocked', 'selection', 1,
        'For browser stability, scan up to 3,500 supported files or 60 MB at a time. Split the mod into smaller groups and scan again.')
    ], { mode: 'mod files', files: state.files.length, bytes: totalBytes });
    return;
  }

  scanFilesBtn.disabled = true;
  scanFilesBtn.textContent = 'Scanning…';
  const records = [];
  for (const file of state.files) {
    records.push({ file, path: filePath(file), text: await file.text() });
  }

  const issues = [];
  records.forEach((record) => {
    if (/\.ya?ml$/i.test(record.path)) issues.push(...analyzeLocalization(record.text, record.path));
    if (/\.log$/i.test(record.path) || record.path.toLowerCase().endsWith('error.log')) issues.push(...analyzeLog(record.text, record.path));
    if (/\.(txt|mod)$/i.test(record.path)) issues.push(...analyzeScript(record.text, record.path));
  });
  issues.push(...analyzeCrossFile(records));

  renderIssues(issues, { mode: 'mod files', files: records.length, bytes: totalBytes });
  scanFilesBtn.disabled = false;
  scanFilesBtn.textContent = 'Scan selected files';
}

function issue(severity, title, file, line, explanation, code = '') {
  return { severity, title, file, line, explanation, code };
}

function analyzeLocalization(text, file) {
  const out = [];
  const hasBom = text.charCodeAt(0) === 0xFEFF;
  const normalized = text.replace(/^\uFEFF/, '');
  const lines = normalized.split(/\r?\n/);
  const seen = new Map();

  if (!hasBom) {
    out.push(issue('warning', 'Missing UTF-8 BOM', file, 1,
      'HOI4 localization commonly expects UTF-8 with BOM. If the game ignores this file, re-save it as UTF-8 with BOM.', 'LOC_BOM'));
  }
  const firstContentIndex = lines.findIndex((line) => line.trim() && !line.trim().startsWith('#'));
  if (firstContentIndex >= 0 && !/^\s*l_[a-z_]+:\s*$/i.test(lines[firstContentIndex])) {
    out.push(issue('error', 'Missing or malformed language header', file, firstContentIndex + 1,
      'Localization files should begin with a language header such as l_english: or l_korean:.', 'LOC_HEADER'));
  }

  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trim();
    if (!line || line.startsWith('#') || /^l_[a-z_]+:\s*$/i.test(line)) return;
    const m = raw.match(/^\s*([^\s:#]+)\s*:\s*(\d+)?\s*"(.*)"\s*(?:#.*)?$/);
    if (!m) {
      if (line.includes(':') && !/".*"/.test(line)) {
        out.push(issue('warning', 'Localization value may be unquoted', file, n,
          'Localization text should normally be wrapped in double quotes.', 'LOC_UNQUOTED'));
      } else if (line.includes('"') || /^[^#\s]+\s+/.test(line)) {
        out.push(issue('error', 'Malformed localization entry', file, n,
          'This line does not match the expected key:0 "Text" format. Check the colon, version number and quotes.', 'LOC_MALFORMED'));
      }
      return;
    }
    const key = m[1];
    if (seen.has(key)) {
      out.push(issue('error', `Duplicate localization key: ${key}`, file, n,
        `This key was already declared on line ${seen.get(key)} in the same file. Rename or remove one declaration.`, 'LOC_DUPLICATE'));
    } else {
      seen.set(key, n);
    }
    const quoteCount = (raw.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      out.push(issue('error', 'Unbalanced quotes', file, n,
        'The localization value appears to contain an unmatched double quote.', 'LOC_QUOTES'));
    }
  });
  return out;
}

function analyzeLog(text, file) {
  const out = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    const lower = raw.toLowerCase();
    const n = i + 1;
    if (lower.includes('duplicate localization found')) {
      const key = (raw.match(/key:\s*([^,\s]+)/i) || [])[1];
      out.push(issue('error', key ? `Duplicate localization: ${key}` : 'Duplicate localization', file, n,
        'The same localization key is declared more than once. Search the key across localization files and keep only the intended definition.', 'LOG_DUP_LOC'));
    } else if (lower.includes('unexpected token') || lower.includes('unexpected end of file')) {
      out.push(issue('error', 'Unexpected token / parser failure', file, n,
        'Inspect nearby braces, equals signs, identifiers and quotes. The true syntax error can be a few lines before this log entry.', 'LOG_TOKEN'));
    } else if (lower.includes('unknown effect') || lower.includes('unknown trigger')) {
      out.push(issue('error', 'Unknown effect or trigger', file, n,
        'Check spelling, game version, scope, scripted effects/triggers and mod dependencies.', 'LOG_UNKNOWN_COMMAND'));
    } else if (lower.includes('invalid scope') || lower.includes('scope mismatch')) {
      out.push(issue('error', 'Invalid scope', file, n,
        'This command is running in a scope it does not support. Review the current ROOT/FROM/THIS context and scope-changing blocks.', 'LOG_SCOPE'));
    } else if (lower.includes('could not find') || lower.includes('not found') || lower.includes('failed to find')) {
      out.push(issue('warning', 'Missing reference', file, n,
        'A referenced object or file could not be resolved. Verify the identifier, path, namespace and load order.', 'LOG_MISSING'));
    } else if (lower.includes('duplicate') && (lower.includes('id') || lower.includes('focus') || lower.includes('event'))) {
      out.push(issue('warning', 'Possible duplicate identifier', file, n,
        'Two scripted objects may be using the same identifier. Search the reported ID across the mod.', 'LOG_DUP_ID'));
    } else if (/error|exception|invalid|malformed/.test(lower)) {
      out.push(issue('warning', 'Unclassified engine error', file, n,
        raw.replace(/^.*?:\s*/, '').slice(0, 260), 'LOG_OTHER'));
    }
  });
  if (text.trim() && !out.length) {
    out.push(issue('info', 'No known patterns detected', file, 1,
      'The log contains text, but this scanner did not recognize a supported error pattern yet.', 'LOG_UNKNOWN'));
  }
  return out;
}

function analyzeScript(text, file) {
  const out = [];
  const lines = text.split(/\r?\n/);
  const localIds = new Map();
  const idPattern = /^\s*id\s*=\s*([A-Za-z0-9_.:-]+)\s*(?:#.*)?$/i;
  let balance = 0;

  lines.forEach((raw, i) => {
    const n = i + 1;
    const withoutComment = raw.replace(/#.*$/, '');
    balance += (withoutComment.match(/{/g) || []).length;
    balance -= (withoutComment.match(/}/g) || []).length;
    if (balance < 0) {
      out.push(issue('error', 'Closing brace without matching opening brace', file, n,
        'The brace balance becomes negative here. Check this line and the block immediately above it.', 'SCRIPT_BRACE'));
      balance = 0;
    }

    const m = raw.match(idPattern);
    if (m) {
      const id = m[1];
      if (localIds.has(id)) {
        out.push(issue('warning', `Possible duplicate ID: ${id}`, file, n,
          `The same id assignment appeared on line ${localIds.get(id)} in this file.`, 'SCRIPT_DUP_ID'));
      } else {
        localIds.set(id, n);
      }
    }

    const years = [...raw.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map((x) => Number(x[1]));
    years.forEach((y) => {
      if (y < 1936 && /\byear\s*=|\bdate\s*[<>=]/i.test(raw)) {
        out.push(issue('info', `Suspicious historical year: ${y}`, file, n,
          'This may be intentional. If your mod shifts the timeline, review whether this date should be transformed.', 'SCRIPT_YEAR'));
      }
    });
  });

  if (balance > 0) {
    out.push(issue('error', `Unclosed brace${balance === 1 ? '' : 's'}: ${balance}`, file, lines.length,
      'The file ends with more opening braces than closing braces. Check the final blocks and nested scopes.', 'SCRIPT_BRACE'));
  }
  return out;
}

function analyzeCrossFile(records) {
  const out = [];
  const locDefinitions = new Map();
  const allLocKeys = new Set();
  const focusDefinitions = new Map();

  records.forEach(({ path, text }) => {
    if (/\.ya?ml$/i.test(path)) {
      text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, i) => {
        const m = raw.match(/^\s*([^\s:#]+)\s*:\s*(?:\d+)?\s*"/);
        if (!m) return;
        const key = m[1];
        allLocKeys.add(key);
        if (!locDefinitions.has(key)) locDefinitions.set(key, []);
        locDefinitions.get(key).push({ path, line: i + 1 });
      });
    }
  });

  locDefinitions.forEach((places, key) => {
    if (places.length < 2) return;
    const first = places[0];
    places.slice(1).forEach((place) => {
      out.push(issue('error', `Cross-file duplicate localization: ${key}`, place.path, place.line,
        `Also defined in ${first.path}:${first.line}. Duplicate localization keys can silently overwrite each other.`, 'CROSS_LOC_DUP'));
    });
  });

  records.filter(({ path }) => /focus/i.test(path) && /\.txt$/i.test(path)).forEach(({ path, text }) => {
    text.split(/\r?\n/).forEach((raw, i) => {
      const m = raw.match(/^\s*id\s*=\s*([A-Za-z0-9_.:-]+)\s*(?:#.*)?$/i);
      if (!m) return;
      const id = m[1];
      if (!focusDefinitions.has(id)) focusDefinitions.set(id, []);
      focusDefinitions.get(id).push({ path, line: i + 1 });
    });
  });

  focusDefinitions.forEach((places, id) => {
    if (places.length > 1) {
      const first = places[0];
      places.slice(1).forEach((place) => {
        out.push(issue('error', `Duplicate focus ID: ${id}`, place.path, place.line,
          `Also found in ${first.path}:${first.line}. Focus IDs should be unique.`, 'CROSS_FOCUS_DUP'));
      });
    }
    const hasName = allLocKeys.has(id);
    const hasDesc = allLocKeys.has(`${id}_desc`);
    if (!hasName || !hasDesc) {
      const first = places[0];
      const missing = [!hasName ? id : null, !hasDesc ? `${id}_desc` : null].filter(Boolean).join(', ');
      out.push(issue('warning', `Possible missing focus localization: ${id}`, first.path, first.line,
        `No localization definition was found for: ${missing}. This is a heuristic; dynamic localization can be intentional.`, 'CROSS_FOCUS_LOC'));
    }
  });

  return out;
}

function transformYears() {
  const input = qs('#yearInput').value;
  const offset = Number(qs('#yearOffset').value) || 0;
  const min = Number(qs('#yearMin').value) || 0;
  const max = Number(qs('#yearMax').value) || 9999;
  const output = input.replace(/\b(\d{4})\b/g, (full, y, idx, str) => {
    const year = Number(y);
    if (year < min || year > max) return full;
    const context = str.slice(Math.max(0, idx - 30), idx + 16);
    if (!/(year\s*=|date\s*[<>=]|\b\d{4}[.\/-])/i.test(context)) return full;
    return String(year + offset);
  });
  qs('#yearOutput').value = output;
  qs('#copyYearsBtn').disabled = !output;
}

function renderIssues(issues, meta = {}) {
  state.issues = issues;
  state.scanMeta = { ...meta, timestamp: new Date().toISOString() };
  state.filter = 'all';
  qsa('.filter').forEach((b) => b.classList.toggle('active', b.dataset.filter === 'all'));
  const counts = countIssues(issues);
  const score = Math.max(0, 100 - counts.error * 10 - counts.warning * 3 - Math.min(counts.info, 10));

  qs('#results').classList.remove('hidden');
  qs('#healthScore').textContent = `${score} / 100`;
  qs('#errorCount').textContent = `${counts.error} error${counts.error === 1 ? '' : 's'}`;
  qs('#warningCount').textContent = `${counts.warning} warning${counts.warning === 1 ? '' : 's'}`;
  qs('#infoCount').textContent = `${counts.info} note${counts.info === 1 ? '' : 's'}`;
  qs('#scanSummary').textContent = meta.files
    ? `${meta.files} file${meta.files === 1 ? '' : 's'} scanned${meta.bytes ? ` · ${formatBytes(meta.bytes)}` : ''}`
    : '';

  renderIssueList();
  saveScanHistory({ score, counts, meta: state.scanMeta });
  qs('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function countIssues(issues) {
  return issues.reduce((acc, x) => {
    acc[x.severity] = (acc[x.severity] || 0) + 1;
    return acc;
  }, { error: 0, warning: 0, info: 0 });
}

function renderIssueList() {
  const list = qs('#resultList');
  list.innerHTML = '';
  const visible = state.filter === 'all' ? state.issues : state.issues.filter((x) => x.severity === state.filter);
  if (!visible.length) {
    list.innerHTML = '<article class="result-card"><div class="result-title">No results in this filter</div><p>No supported problems were found here. This does not guarantee the mod is error-free.</p></article>';
    return;
  }
  visible.forEach((x) => {
    const card = document.createElement('article');
    card.className = 'result-card';
    card.dataset.severity = x.severity;
    card.innerHTML = '<div class="result-top"><span class="result-title"></span><span class="badge"></span></div><div class="result-meta"></div><p></p>';
    card.querySelector('.result-title').textContent = x.title;
    const badge = card.querySelector('.badge');
    badge.className = `badge ${x.severity}`;
    badge.textContent = x.severity;
    card.querySelector('.result-meta').textContent = `${x.file}:${x.line}${x.code ? ` · ${x.code}` : ''}`;
    card.querySelector('p').textContent = x.explanation;
    list.appendChild(card);
  });
}

qsa('.filter').forEach((button) => button.addEventListener('click', () => {
  state.filter = button.dataset.filter;
  qsa('.filter').forEach((b) => b.classList.toggle('active', b === button));
  renderIssueList();
}));

function buildMarkdownReport() {
  const counts = countIssues(state.issues);
  const lines = [
    '# Paradox Doctor Scan Report',
    '',
    `Generated: ${new Date().toLocaleString()}`,
    `Mode: ${state.scanMeta?.mode || 'scan'}`,
    `Errors: ${counts.error} · Warnings: ${counts.warning} · Notes: ${counts.info}`,
    '',
    '## Findings',
    ''
  ];
  if (!state.issues.length) lines.push('No supported problems detected.');
  state.issues.forEach((x) => {
    lines.push(`### ${x.severity.toUpperCase()} — ${x.title}`);
    lines.push(`- Location: \`${x.file}:${x.line}\``);
    if (x.code) lines.push(`- Code: \`${x.code}\``);
    lines.push(`- ${x.explanation}`);
    lines.push('');
  });
  lines.push('---', 'Generated by Paradox Doctor — https://reridy.github.io/paradox-doctor/');
  return lines.join('\n');
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

qs('#exportMarkdownBtn').addEventListener('click', () => downloadText('paradox-doctor-report.md', buildMarkdownReport(), 'text/markdown'));
qs('#exportJsonBtn').addEventListener('click', () => downloadText('paradox-doctor-report.json', JSON.stringify({ meta: state.scanMeta, issues: state.issues }, null, 2), 'application/json'));
qs('#copyReportBtn').addEventListener('click', async () => {
  await navigator.clipboard.writeText(buildMarkdownReport());
  flashButton(qs('#copyReportBtn'), 'Copied!');
});

function flashButton(button, text) {
  const original = button.textContent;
  button.textContent = text;
  setTimeout(() => { button.textContent = original; }, 1200);
}

const HISTORY_KEY = 'paradoxDoctorScanHistoryV1';
function saveScanHistory(entry) {
  try {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    history.unshift({
      timestamp: new Date().toISOString(),
      mode: entry.meta?.mode || 'scan',
      files: entry.meta?.files || 0,
      score: entry.score,
      counts: entry.counts
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 6)));
    renderHistory();
  } catch (_) {}
}

function renderHistory() {
  const section = qs('#recent');
  const list = qs('#historyList');
  let history = [];
  try { history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (_) {}
  if (!history.length) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  list.innerHTML = '';
  history.forEach((h) => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = '<strong></strong><span></span><span></span>';
    item.children[0].textContent = `${h.score} / 100 · ${h.mode}`;
    item.children[1].textContent = `${h.counts.error} errors · ${h.counts.warning} warnings · ${h.counts.info} notes`;
    item.children[2].textContent = new Date(h.timestamp).toLocaleString();
    list.appendChild(item);
  });
}

qs('#clearHistoryBtn').addEventListener('click', () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

renderHistory();
