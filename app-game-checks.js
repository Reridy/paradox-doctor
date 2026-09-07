'use strict';

function stripStringsAndComments(text) {
  return text.split(/\r?\n/).map(line => {
    let quote = false, escaped = false, out = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (escaped) { escaped = false; out += quote ? ' ' : ch; continue; }
      if (ch === '\\' && quote) { escaped = true; out += ' '; continue; }
      if (ch === '"') { quote = !quote; out += ' '; continue; }
      if (ch === '#' && !quote) break;
      out += quote ? ' ' : ch;
    }
    return out;
  }).join('\n');
}

function analyzeBraces(text, path) {
  const clean = stripStringsAndComments(text);
  let depth = 0;
  const lines = clean.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      if (depth < 0) return [makeFinding('error', 'Closing brace has no matching opening brace', path, i + 1, 'The parser reaches an extra closing brace here. Later parser messages in the same file may be cascade errors.', {root:true,confidence:'high',category:'Syntax',action:'Fix the brace structure first, relaunch once, then inspect the new earliest parser error.'})];
    }
  }
  if (depth !== 0) return [makeFinding('error', `Unbalanced braces (${depth > 0 ? `${depth} unclosed` : `${Math.abs(depth)} extra closing`})`, path, lines.length, 'The file does not end at brace depth zero.', {root:true,confidence:'high',category:'Syntax',action:'Match each block boundary before investigating lower-priority script errors.'})];
  return [];
}

function analyzeLocalization(entry, globalKeys) {
  const {text,path,bom} = entry;
  const out = [], lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const first = lines.findIndex(x => x.trim() && !x.trim().startsWith('#'));
  if (first >= 0 && !/^\s*l_[a-z_]+:\s*$/i.test(lines[first])) out.push(makeFinding('error', 'Missing or malformed localization language header', path, first + 1, 'The first non-comment line should be a language header such as l_english:.', {root:true,confidence:'high',category:'Localization',action:'Fix the language header, save the file, then rescan localization before launching.'}));
  if (!bom) out.push(makeFinding('info', 'Localization file is UTF-8 without BOM', path, 1, 'Some Paradox localization workflows require UTF-8 with BOM. This is informational unless text fails to load in-game.', {confidence:'high',category:'Localization',heuristic:true,action:'Only change the encoding if the file is not loading or the game/tooling specifically requires BOM.'}));
  const local = new Map();
  lines.forEach((raw, i) => {
    const t = raw.trim();
    if (!t || t.startsWith('#') || /^l_[a-z_]+:\s*$/i.test(t)) return;
    const m = raw.match(/^\s*([^\s:#]+)\s*:\s*(\d+)?\s*"((?:\\.|[^"\\])*)"\s*(?:#.*)?$/);
    if (!m) {
      if (t.includes(':')) out.push(makeFinding('warning', 'Suspicious localization entry', path, i + 1, 'This line does not match the usual key:0 "Text" shape. Check quoting and colon placement.', {confidence:'medium',category:'Localization',heuristic:true}));
      return;
    }
    const key = m[1];
    if (local.has(key)) out.push(makeFinding('error', `Duplicate localization key in file: ${key}`, path, i + 1, `The same key was already defined at line ${local.get(key)}.`, {root:true,confidence:'high',category:'Localization'}));
    else local.set(key, i + 1);
    const defs = globalKeys.get(key) || []; defs.push({path,line:i+1}); globalKeys.set(key, defs);
  });
  return out;
}

function analyzeDescriptor(entries) {
  const out = [];
  for (const [path, entry] of entries) {
    if (!/(?:^|\/)(?:descriptor\.mod|[^/]+\.mod)$/i.test(path)) continue;
    const m = entry.text.match(/supported_version\s*=\s*"([^"]+)"/i);
    if (!m) out.push(makeFinding('warning', 'Mod descriptor has no supported_version', path, 1, 'Adding supported_version helps distinguish a stale mod from a script bug after game updates.', {confidence:'high',category:'Compatibility'}));
    else if (state.gameVersion && !versionMatches(m[1], state.gameVersion)) out.push(makeFinding('warning', `Descriptor may not match game ${state.gameVersion}`, path, 1, `The mod declares supported_version = "${m[1]}".`, {root:true,confidence:'medium',category:'Compatibility',heuristic:true,action:'Confirm the mod against the current game version before chasing secondary errors.'}));
  }
  return out;
}
function versionMatches(pattern, current) { const re = '^' + pattern.split('.').map(x => x === '*' ? '[^.]+': x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\.') + '$'; try { return new RegExp(re).test(current); } catch { return true; } }

function collectLocKeys(entries) { const set = new Set(); for (const [path,e] of entries) if (/\.ya?ml$/i.test(path)) for (const m of e.text.matchAll(/^\s*([^\s:#]+)\s*:/gm)) set.add(m[1]); return set; }

function analyzeHoi4(entries) {
  const out = [], loc = collectLocKeys(entries), focuses = new Map(), focusRefs = [], states = new Map(), provinceStates = new Map(), strategic = new Map(), events = new Map();
  let stateFiles = 0, strategicFiles = 0;
  for (const [path,e] of entries) {
    const text = e.text;
    if (/common\/national_focus\/.*\.txt$/i.test(path) || /national_focus/i.test(path)) {
      for (const m of text.matchAll(/\bfocus\s*=\s*\{[\s\S]*?\bid\s*=\s*([A-Za-z0-9_.:-]+)/g)) {
        const id=m[1], l=lineAt(text,m.index), defs=focuses.get(id)||[]; defs.push({path,line:l}); focuses.set(id,defs);
      }
      for (const m of text.matchAll(/\bfocus\s*=\s*([A-Za-z0-9_.:-]+)/g)) focusRefs.push({id:m[1],path,line:lineAt(text,m.index)});
    }
    if (/history\/states\/.*\.txt$/i.test(path)) {
      stateFiles++;
      const idm=text.match(/\bid\s*=\s*(\d+)/), prov=text.match(/\bprovinces\s*=\s*\{([^}]*)\}/s);
      if (!idm) out.push(makeFinding('error','State file has no id',path,1,'Every HOI4 state definition needs an ID.',{root:true,confidence:'high',category:'Map'}));
      else { const id=idm[1], defs=states.get(id)||[]; defs.push(path); states.set(id,defs); if (!loc.has(`STATE_${id}`)) out.push(makeFinding('info',`State localization not found: STATE_${id}`,path,1,'The selected localization files do not contain this state-name key.',{confidence:'medium',category:'Localization',heuristic:true})); }
      if (!prov) out.push(makeFinding('error','State has no provinces block',path,1,'A state definition should assign provinces.',{root:true,confidence:'high',category:'Map'}));
      else for (const p of prov[1].match(/\d+/g)||[]) { const defs=provinceStates.get(p)||[]; defs.push(path); provinceStates.set(p,defs); }
      if (!/\bstate_category\s*=/.test(text)) out.push(makeFinding('warning','State has no state_category',path,1,'This is unusual for a complete HOI4 state definition.',{confidence:'medium',category:'Map',heuristic:true}));
      if (!/\bhistory\s*=\s*\{/.test(text)) out.push(makeFinding('warning','State has no history block',path,1,'New states usually require valid history data.',{confidence:'medium',category:'Map',heuristic:true}));
      if (!/\bbuildings\s*=\s*\{/.test(text)) out.push(makeFinding('info','State has no buildings block',path,1,'This can be valid. Review it only when a newly added or split state fails during map loading.',{confidence:'low',category:'Map',heuristic:true,guide:'errors/hoi4-map-state.html'}));
    }
    if (/map\/strategicregions\/.*\.txt$/i.test(path)) {
      strategicFiles++;
      const prov=text.match(/\bprovinces\s*=\s*\{([^}]*)\}/s);
      if (prov) for (const p of prov[1].match(/\d+/g)||[]) { const defs=strategic.get(p)||[]; defs.push(path); strategic.set(p,defs); }
    }
    if (/events\/.*\.txt$/i.test(path)) for (const m of text.matchAll(/\bid\s*=\s*([A-Za-z0-9_]+\.\d+)/g)) { const id=m[1], defs=events.get(id)||[]; defs.push({path,line:lineAt(text,m.index)}); events.set(id,defs); }
  }
  for (const [id,defs] of focuses) { if (!loc.has(id)) out.push(makeFinding('warning',`Focus localization not found: ${id}`,defs[0].path,defs[0].line,'No matching localization key was found in the selected project. This can be intentional if another mod or vanilla provides it.',{confidence:'medium',category:'Focus',heuristic:true})); if (!loc.has(`${id}_desc`)) out.push(makeFinding('info',`Focus description localization not found: ${id}_desc`,defs[0].path,defs[0].line,'No matching description key was found in the selected project.',{confidence:'medium',category:'Focus',heuristic:true})); if (defs.length>1) out.push(makeFinding('error',`Duplicate focus ID: ${id}`,defs[0].path,defs[0].line,`The focus ID appears ${defs.length} times in the selected project.`,{root:true,confidence:'high',category:'Focus',frequency:defs.length})); }
  for (const r of focusRefs) if (!focuses.has(r.id)) out.push(makeFinding('warning',`Focus prerequisite not found in project: ${r.id}`,r.path,r.line,'The referenced focus ID was not found in the selected focus files. It may come from a dependency; load that mod as a reference before treating this as definite.',{confidence:'medium',category:'Focus',heuristic:true}));
  for (const [id,paths] of states) if (paths.length>1) out.push(makeFinding('error',`Duplicate state ID: ${id}`,paths[0],1,`State ID ${id} appears in ${paths.length} selected files.`,{root:true,confidence:'high',category:'Map',frequency:paths.length}));
  for (const [p,paths] of provinceStates) if (paths.length>1) out.push(makeFinding('error',`Province ${p} belongs to multiple states`,paths[0],1,paths.join(', '),{root:true,confidence:'high',category:'Map',frequency:paths.length,guide:'errors/hoi4-map-state.html'}));
  for (const [p,paths] of strategic) if (paths.length>1) out.push(makeFinding('error',`Province ${p} appears in multiple selected strategic regions`,paths[0],1,paths.join(', '),{root:true,confidence:'high',category:'Map',frequency:paths.length,guide:'errors/hoi4-map-state.html'}));
  for (const [id,defs] of events) if (defs.length>1) out.push(makeFinding('error',`Duplicate event ID: ${id}`,defs[0].path,defs[0].line,`The event ID appears ${defs.length} times in the selected project.`,{root:true,confidence:'high',category:'Events',frequency:defs.length}));
  state.scanCoverage.push(`${stateFiles} state files`, `${strategicFiles} strategic-region files`);
  return out;
}

function analyzeVic3(entries) {
  const out=[], loc=collectLocKeys(entries), journals=new Map(), events=new Map(), eventRefs=[], regions=new Map(), provinceRegions=new Map();
  let journalFiles=0, regionFiles=0;
  for (const [path,e] of entries) {
    const text=e.text;
    if (/\.ya?ml$/i.test(path) && !/(^|\/)localization\//i.test(path)) out.push(makeFinding('warning','Localization file is outside a localization folder',path,1,'Victoria 3 localization is path-sensitive. If the file does not load, move it into the expected localization structure.',{confidence:'medium',category:'Paths',heuristic:true,guide:'errors/vic3-localization.html'}));
    if (/common\/journal_entries\/.*\.txt$/i.test(path)) {
      journalFiles++;
      for (const m of text.matchAll(/^\s*(je_[A-Za-z0-9_.:-]+)\s*=\s*\{/gm)) { const id=m[1], defs=journals.get(id)||[]; defs.push({path,line:lineAt(text,m.index)}); journals.set(id,defs); }
      for (const m of text.matchAll(/\b(?:trigger_event|country_event)\s*=\s*\{[\s\S]*?\bid\s*=\s*([A-Za-z0-9_]+\.\d+)/g)) eventRefs.push({id:m[1],path,line:lineAt(text,m.index)});
      for (const m of text.matchAll(/\btimeout\s*=\s*0\b/g)) out.push(makeFinding('warning','Journal entry uses timeout = 0',path,lineAt(text,m.index),'A zero timeout is easy to misread and is worth confirming against current Victoria 3 behavior.',{confidence:'medium',category:'Journal',heuristic:true,guide:'errors/vic3-journal-events.html'}));
    }
    if (/events\/.*\.txt$/i.test(path)) for (const m of text.matchAll(/\bid\s*=\s*([A-Za-z0-9_]+\.\d+)/g)) { const id=m[1], defs=events.get(id)||[]; defs.push({path,line:lineAt(text,m.index)}); events.set(id,defs); }
    if (/map_data\/state_regions\/.*\.txt$/i.test(path) || /common\/state_regions\/.*\.txt$/i.test(path)) {
      regionFiles++;
      for (const m of text.matchAll(/^\s*(STATE_[A-Za-z0-9_]+)\s*=\s*\{([\s\S]*?)(?=^\s*STATE_|\s*$)/gm)) {
        const id=m[1],body=m[2], defs=regions.get(id)||[]; defs.push({path,line:lineAt(text,m.index)}); regions.set(id,defs);
        const prov=body.match(/\bprovinces\s*=\s*\{([^}]*)\}/s);
        if (!prov) out.push(makeFinding('error',`State region ${id} has no provinces block`,path,lineAt(text,m.index),'The selected state-region definition has no province membership.',{root:true,confidence:'high',category:'Map',guide:'errors/vic3-map-state.html'}));
        else for (const p of prov[1].match(/x[0-9a-fA-F]+|\d+/g)||[]) { const arr=provinceRegions.get(p)||[]; arr.push(`${path}:${lineAt(text,m.index)}`); provinceRegions.set(p,arr); }
      }
    }
  }
  for (const [id,defs] of journals) { if (!loc.has(id)) out.push(makeFinding('info',`Journal localization not found: ${id}`,defs[0].path,defs[0].line,'No matching localization key was found in the selected project.',{confidence:'medium',category:'Journal',heuristic:true})); if (defs.length>1) out.push(makeFinding('error',`Duplicate journal entry key: ${id}`,defs[0].path,defs[0].line,`The journal entry key appears ${defs.length} times in the selected project.`,{root:true,confidence:'high',category:'Journal',frequency:defs.length})); }
  for (const [id,defs] of events) if (defs.length>1) out.push(makeFinding('error',`Duplicate event ID: ${id}`,defs[0].path,defs[0].line,`The event ID appears ${defs.length} times in the selected project.`,{root:true,confidence:'high',category:'Events',frequency:defs.length}));
  for (const r of eventRefs) if (!events.has(r.id) && !referenceContainsEvent(r.id)) out.push(makeFinding('warning',`Journal event reference not found: ${r.id}`,r.path,r.line,'The event was not found in the selected project or loaded reference. Without full dependency context this remains a heuristic.',{confidence:'medium',category:'Journal',heuristic:true,guide:'errors/vic3-journal-events.html'}));
  for (const [id,defs] of regions) if (defs.length>1) out.push(makeFinding('error',`Duplicate state region: ${id}`,defs[0].path,defs[0].line,`The same state-region key appears ${defs.length} times.`,{root:true,confidence:'high',category:'Map',frequency:defs.length}));
  for (const [p,defs] of provinceRegions) if (defs.length>1) out.push(makeFinding('warning',`Province token ${p} appears in multiple selected state regions`,defs[0].split(':')[0],1,defs.join(', '),{root:true,confidence:'medium',category:'Map',frequency:defs.length,heuristic:true,guide:'errors/vic3-map-state.html'}));
  state.scanCoverage.push(`${journalFiles} journal files`, `${regionFiles} state-region files`);
  return out;
}
function referenceContainsEvent(id) { for (const [path,e] of state.referenceData) if (/events\/.*\.txt$/i.test(path) && new RegExp(`\\bid\\s*=\\s*${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`).test(e.text)) return true; return false; }

