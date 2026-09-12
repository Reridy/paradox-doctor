'use strict';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const MAX_FILES = 2200;
const MAX_TOTAL_BYTES = 45 * 1024 * 1024;
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const BASELINE_KEY = 'paradoxDoctorBaselineV4';
const IGNORE_KEY = 'paradoxDoctorIgnoredV4';
const GAME_KEY = 'paradoxDoctorGameV4';
const GUIDE_BASE = document.documentElement.lang.toLowerCase().startsWith('ko') ? '../errors/' : 'errors/';

const profiles = {
  hoi4: {
    name: 'Hearts of Iron IV', short: 'HOI4',
    hero: pdText(
      'Scan a Hearts of Iron IV project and a fresh error.log. Paradox Doctor groups repeated engine noise, checks common cross-file mistakes, and tells you what to investigate first.',
      'Hearts of Iron IV 프로젝트와 최신 error.log를 검사하세요. Paradox Doctor가 반복되는 엔진 메시지를 묶고, 파일 간 흔한 오류를 확인해 무엇부터 조사해야 할지 우선순위를 보여줍니다.'
    ),
    logPath: 'Documents/Paradox Interactive/Hearts of Iron IV/logs/error.log',
    guides: [
      [pdText('Parser','파서'), pdText('Unexpected token','Unexpected token'), pdText('Trace parser cascades back to the first broken block.','연쇄 파서 오류를 최초로 깨진 블록까지 추적합니다.'), `${GUIDE_BASE}unexpected-token.html`],
      [pdText('Localization','현지화'), pdText('Duplicate localization','중복 현지화'), pdText('Find duplicate keys across selected localization files.','선택한 현지화 파일에서 중복 키를 찾습니다.'), `${GUIDE_BASE}duplicate-localization.html`],
      [pdText('Scripting','스크립팅'), pdText('Unknown effect / scope','Unknown effect / scope'), pdText('Separate spelling, context and scope problems.','오타, 사용 맥락, scope 문제를 구분합니다.'), `${GUIDE_BASE}unknown-effect.html`],
      [pdText('Map','지도'), pdText('State & province failures','State 및 province 오류'), pdText('Review state IDs, province membership and strategic regions.','state ID, province 소속, strategic region을 함께 확인합니다.'), `${GUIDE_BASE}hoi4-map-state.html`]
    ]
  },
  vic3: {
    name: 'Victoria 3', short: 'VIC3',
    hero: pdText(
      'Scan a Victoria 3 project and a fresh error.log. Paradox Doctor focuses on Jomini scope failures, journal/event references, localization paths and state-region problems.',
      'Victoria 3 프로젝트와 최신 error.log를 검사하세요. Jomini scope 오류, journal/event 참조, 현지화 경로와 state-region 문제를 중심으로 분석합니다.'
    ),
    logPath: 'Documents/Paradox Interactive/Victoria 3/logs/error.log',
    guides: [
      [pdText('Localization','현지화'), pdText('Localization not showing','현지화가 표시되지 않음'), pdText('Check path, header, syntax and file encoding.','경로, 헤더, 문법, 파일 인코딩을 확인합니다.'), `${GUIDE_BASE}vic3-localization.html`],
      ['Jomini', pdText('Unset / wrong scope','Unset / wrong scope'), pdText('Understand event-target and scope failures.','event target과 scope 오류를 추적합니다.'), `${GUIDE_BASE}vic3-scope.html`],
      [pdText('Journal','저널'), pdText('Journal entries & events','Journal entry 및 event'), pdText('Check object structure and unresolved references.','오브젝트 구조와 해결되지 않은 참조를 확인합니다.'), `${GUIDE_BASE}vic3-journal-events.html`],
      [pdText('Map','지도'), pdText('State-region failures','State-region 오류'), pdText('Review duplicate province membership and state regions.','중복 province 소속과 state region을 확인합니다.'), `${GUIDE_BASE}vic3-map-state.html`]
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
  $('#guideHeading').textContent = pdText(`Common ${profiles[game].short} problems`, `${profiles[game].short} 자주 발생하는 문제`);
  $('#guideGrid').innerHTML = profiles[game].guides.map(([cat,title,copy,href]) => `<a class="guide-card" href="${href}"><span>${cat}</span><h3>${title}</h3><p>${copy}</p></a>`).join('');
  $('#logPathText').textContent = profiles[game].logPath;
  if (changed) {
    const ignoredAll = readJSON(IGNORE_KEY, {});
    state.ignored = new Set(ignoredAll[game] || []);
    loadBaselineForGame();
    if (state.findings.length) clearResults(pdText('Game changed. Run a new diagnosis for the selected game.','게임이 변경되었습니다. 선택한 게임으로 새 진단을 실행하세요.'));
  }
}

function loadBaselineForGame() {
  const all = readJSON(BASELINE_KEY, {});
  const entry = all[state.game];
  state.baseline = new Set(entry?.fingerprints || []);
  const status = $('#baselineStatus');
  if (!status) return;
  if (state.baseline.size) {
    const date = entry?.createdAt ? new Date(entry.createdAt).toLocaleString() : pdText('saved locally','로컬에 저장됨');
    status.textContent = pdText(`${state.baseline.size} finding fingerprints · ${date}`, `${state.baseline.size}개 결과 지문 · ${date}`);
    $('#clearBaselineBtn').disabled = false;
  } else {
    status.textContent = pdText('No baseline saved for this game.','이 게임에 저장된 기준점이 없습니다.');
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
  $('#projectStatus').textContent = usable.length ? pdText(`${usable.length} supported files · ${formatBytes(total)}`, `지원 파일 ${usable.length}개 · ${formatBytes(total)}`) : pdText('No supported project files selected.','지원되는 프로젝트 파일이 선택되지 않았습니다.');
  $('#clearProjectBtn').classList.toggle('hidden', !usable.length);
  const counts = {};
  usable.forEach(f => counts[fileExt(f.name)] = (counts[fileExt(f.name)] || 0) + 1);
  const chips = $('#projectSummary');
  chips.innerHTML = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,7).map(([ext,n]) => `<span>${escapeHtml(ext || 'file')} ${n}</span>`).join('');
  if (files.length > MAX_FILES) chips.innerHTML += `<span>${pdText(`first ${MAX_FILES} only`, `처음 ${MAX_FILES}개만`)}</span>`;
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
  $('#projectStatus').textContent = pdText('No project files selected.','프로젝트 파일이 선택되지 않았습니다.');
  $('#projectSummary').classList.add('hidden'); $('#projectSummary').innerHTML = '';
  $('#clearProjectBtn').classList.add('hidden'); updateReadyState();
}
function clearLog() {
  state.logFile = null; state.logText = '';
  $('#logFileInput').value = ''; $('#logInput').value = '';
  $('#logFileLabel').textContent = pdText('No log file selected','로그 파일이 선택되지 않음'); $('#clearLogBtn').classList.add('hidden'); updateReadyState();
}
function clearWorkspace() { clearProject(); clearLog(); state.referenceData.clear(); state.referenceFiles=[]; $('#referenceInput').value=''; $('#referenceStatus').textContent=pdText('Nothing loaded','불러온 항목 없음'); $('#gameVersionInput').value=''; state.gameVersion=''; clearResults(); }

function updateReadyState() {
  state.logText = $('#logInput').value;
  const hasProject = state.projectFiles.length > 0;
  const hasLog = state.logText.trim().length > 0;
  $('#runBtn').disabled = !(hasProject || hasLog);
  if (hasProject && hasLog) { $('#readyLabel').textContent = pdText('Project + error.log ready.','프로젝트 + error.log 준비 완료.'); $('#readyDetail').textContent = pdText('Best context: cross-file checks and engine log triage.','파일 간 검사와 엔진 로그 분석을 함께 수행할 수 있습니다.'); }
  else if (hasProject) { $('#readyLabel').textContent = pdText('Project ready.','프로젝트 준비 완료.'); $('#readyDetail').textContent = pdText('Add error.log for stronger root-cause prioritization.','error.log를 추가하면 원인 우선순위를 더 정확히 판단할 수 있습니다.'); }
  else if (hasLog) { $('#readyLabel').textContent = pdText('error.log ready.','error.log 준비 완료.'); $('#readyDetail').textContent = pdText('You can diagnose the log alone or add the project folder.','로그만 진단하거나 프로젝트 폴더도 추가할 수 있습니다.'); }
  else { $('#readyLabel').textContent = pdText('Add a project folder or error.log to begin.','프로젝트 폴더 또는 error.log를 추가하세요.'); $('#readyDetail').textContent = pdText('Files stay on this device.','파일은 이 기기에서만 처리됩니다.'); }
}

async function loadReference(files) {
  const usable = files.filter(isSupported).slice(0, 3000);
  state.referenceFiles = usable;
  state.referenceData.clear();
  $('#referenceStatus').textContent = usable.length ? pdText(`Indexing ${usable.length} files…`, `${usable.length}개 파일 색인 중…`) : pdText('Nothing loaded','불러온 항목 없음');
  let count = 0;
  for (const file of usable) {
    if (file.size <= 1.5 * 1024 * 1024) {
      try { state.referenceData.set(relativePath(pathOf(file)), await readFileEntry(file)); } catch {}
    }
    count++;
    if (count % 80 === 0) await new Promise(r => setTimeout(r, 0));
  }
  $('#referenceStatus').textContent = pdText(`${state.referenceData.size} text files indexed locally`, `텍스트 파일 ${state.referenceData.size}개를 로컬에서 색인함`);
}
