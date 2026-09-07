'use strict';

function analyzeReference(entries) {
  if (!state.referenceData.size) return [];
  const out=[], refLoc=new Map(); let exactOverrides=0;
  for (const [path,e] of state.referenceData) if (/\.ya?ml$/i.test(path)) for (const m of e.text.matchAll(/^\s*([^\s:#]+)\s*:/gm)) refLoc.set(m[1],path);
  const broad=[];
  for (const [path,e] of entries) {
    const rel=relativePath(path);
    if (state.referenceData.has(rel)) { exactOverrides++; if (/(?:^|\/)(?:00_|01_|zz_|defines|on_actions|scripted_)/i.test(rel)) broad.push(rel); }
    if (/\.ya?ml$/i.test(path)) for (const m of e.text.matchAll(/^\s*([^\s:#]+)\s*:/gm)) if (refLoc.has(m[1])) out.push(makeFinding('info',`Localization overrides reference key: ${m[1]}`,path,lineAt(e.text,m.index),`Reference also defines this key in ${refLoc.get(m[1])}. This may be intentional.`,{confidence:'high',category:'Overrides',heuristic:true}));
  }
  if (exactOverrides) out.push(makeFinding('info',`${exactOverrides} project files override the reference by exact path`,'project',1,'Exact-path overrides are normal when intentional. Review copied broad system files after updates.',{confidence:'high',category:'Overrides',frequency:exactOverrides,heuristic:true}));
  broad.slice(0,20).forEach(rel => out.push(makeFinding('warning',`Review broad reference override: ${rel}`,rel,1,'This project file replaces a broad/system-like reference path. Confirm it was copied intentionally.',{confidence:'medium',category:'Overrides',heuristic:true,action:'If the file was copied only as a template, reduce the override to the smallest necessary file or definition.'})));
  return out;
}

function extractLogLocation(line, fallbackFile, fallbackLine) {
  const patterns = [
    /(?:file|at)[:\s]+["']?([^"'\s]+\.(?:txt|yml|yaml|gui|asset))(?::|\s+line\s+)(\d+)/i,
    /([^\s"']+\.(?:txt|yml|yaml|gui|asset)):(\d+)/i,
    /([^\s"']+\.(?:txt|yml|yaml|gui|asset))\s+line\s*:?\s*(\d+)/i
  ];
  for (const re of patterns) { const m=line.match(re); if (m) return {file:m[1].replaceAll('\\','/'),line:Number(m[2])||1}; }
  return {file:fallbackFile,line:fallbackLine};
}
function normalizeLogMessage(s) { return s.toLowerCase().replace(/line\s*:?\s*\d+/g,'line').replace(/\d+/g,'#').replace(/[A-F0-9]{8,}/gi,'#').slice(0,240); }
function cleanLogLine(line) { return line.replace(/^(?:\[[^\]]+\])+\s*/,'').trim().slice(0,650); }
function analyzeLog(text) {
  if (!text.trim()) return [];
  const raw=[];
  text.split(/\r?\n/).forEach((line,i) => {
    if (!line.trim()) return;
    const low=line.toLowerCase(), loc=extractLogLocation(line,state.logFile?.name||'error.log',i+1), msg=cleanLogLine(line);
    if (low.includes('unexpected token') || low.includes('unexpected characters')) raw.push(makeFinding('error','Parser encountered unexpected input',loc.file,loc.line,msg,{root:true,confidence:'high',category:'Syntax',guide:'errors/unexpected-token.html',action:'Fix the earliest parser/structure error first; later parser lines may disappear after one correction.'}));
    else if (low.includes('duplicate localization found')) raw.push(makeFinding('error','Engine reported duplicate localization',loc.file,loc.line,msg,{root:true,confidence:'high',category:'Localization',guide:'errors/duplicate-localization.html'}));
    else if (low.includes('unknown effect') || low.includes('unknown trigger') || low.includes('invalid effect')) raw.push(makeFinding('error','Unknown or invalid script command',loc.file,loc.line,msg,{root:true,confidence:'high',category:'Scripting',guide:state.game==='vic3'?'errors/vic3-scope.html':'errors/unknown-effect.html'}));
    else if (low.includes('wrong scope') || low.includes('unset scope') || low.includes('returned an invalid object') || low.includes('event target link')) raw.push(makeFinding('error','Scope or event-target failure',loc.file,loc.line,msg,{root:true,confidence:'high',category:'Scope',guide:state.game==='vic3'?'errors/vic3-scope.html':'errors/unknown-effect.html',action:'Trace the scope immediately before the reported command or event target; verify the object type at each scope transition.'}));
    else if (low.includes('failed to read key reference') || low.includes('could not find') || low.includes('failed to find') || low.includes('not found')) raw.push(makeFinding('warning','Missing or unresolved reference',loc.file,loc.line,msg,{confidence:'medium',category:'References',heuristic:true}));
    else if (state.game==='hoi4' && (low.includes('map definition error') || (low.includes('strategic region') && low.includes('province')) || (low.includes('province') && low.includes('state')))) raw.push(makeFinding('error','HOI4 map/state validation error',loc.file,loc.line,msg,{root:true,confidence:'high',category:'Map',guide:'errors/hoi4-map-state.html'}));
    else if (state.game==='vic3' && (low.includes('state region') || low.includes('assertion failed') || (low.includes('spline') && low.includes('not found')))) raw.push(makeFinding('warning','Possible Victoria 3 map/state failure',loc.file,loc.line,msg,{confidence:'medium',category:'Map',heuristic:true,guide:'errors/vic3-map-state.html'}));
    else if (/\b(error|exception|invalid)\b/i.test(line)) raw.push(makeFinding('info','Unclassified engine error',loc.file,loc.line,msg,{confidence:'low',category:'Engine',heuristic:true}));
  });
  const grouped=new Map();
  for (const x of raw) { const key=[x.title,normalizeLogMessage(x.explanation),x.file].join('|'); const found=grouped.get(key); if(found) found.frequency++; else grouped.set(key,{...x}); }
  if (!grouped.size) return [makeFinding('info','No supported high-signal log pattern recognized',state.logFile?.name||'error.log',1,'The log contains text, but this scanner did not recognize a supported high-signal pattern. This does not prove the mod is error-free.',{confidence:'high',category:'Log'})];
  return [...grouped.values()];
}

function dedupeAndPrioritize(items) {
  const map=new Map();
  for (const x of items) { const key=[x.title,x.file,x.line,x.explanation].join('|'); const current=map.get(key); if(current) current.frequency += x.frequency||1; else map.set(key,{...x}); }
  const severityRank={error:1,warning:2,info:3};
  return [...map.values()].sort((a,b)=>(a.root?0:severityRank[a.severity])-(b.root?0:severityRank[b.severity]) || ({high:0,medium:1,low:2}[a.confidence]-({high:0,medium:1,low:2}[b.confidence])) || (b.frequency||1)-(a.frequency||1));
}

async function runDiagnosis() {
  state.cancel=false; state.gameVersion=$('#gameVersionInput').value.trim(); state.scanCoverage=[];
  const hasProject=state.projectFiles.length>0, logText=$('#logInput').value.trim();
  const total=state.projectFiles.reduce((n,f)=>n+f.size,0);
  if(total>MAX_TOTAL_BYTES){ showResults([makeFinding('warning','Project selection is too large for a safe browser scan','project',1,`Selected supported files total ${formatBytes(total)}. Reduce the selection below ${formatBytes(MAX_TOTAL_BYTES)}.`,{root:true,confidence:'high',category:'Performance'})],{hasProject,hasLog:!!logText}); return; }
  $('#progressWrap').classList.remove('hidden'); setProgress(2,'Reading project files…'); state.fileData.clear();
  let done=0;
  for (const file of state.projectFiles) {
    if(state.cancel){ finishProgress(); return; }
    if(file.size<=MAX_FILE_BYTES){ try{state.fileData.set(pathOf(file),await readFileEntry(file));}catch{} }
    done++; if(done%25===0||done===state.projectFiles.length){setProgress(hasProject?Math.round((done/Math.max(1,state.projectFiles.length))*46):46,`Reading ${done}/${state.projectFiles.length} files…`);await new Promise(r=>setTimeout(r,0));}
  }
  const findings=[], globalKeys=new Map();
  if(hasProject){
    setProgress(52,'Checking common structure…');
    for(const [path,e] of state.fileData){ if(/\.txt$/i.test(path)) findings.push(...analyzeBraces(e.text,path)); if(/\.ya?ml$/i.test(path)) findings.push(...analyzeLocalization(e,globalKeys)); }
    for(const [key,defs] of globalKeys) { const uniquePaths=[...new Set(defs.map(d=>d.path))]; if(uniquePaths.length>1) findings.push(makeFinding('error',`Duplicate localization key across files: ${key}`,defs[0].path,defs[0].line,`Defined in ${uniquePaths.length} files: ${defs.map(d=>`${d.path}:${d.line}`).join(', ')}`,{root:true,confidence:'high',category:'Localization',frequency:defs.length})); }
    findings.push(...analyzeDescriptor(state.fileData));
    setProgress(66,`Running ${profiles[state.game].short} checks…`); findings.push(...(state.game==='hoi4'?analyzeHoi4(state.fileData):analyzeVic3(state.fileData)));
    if(state.referenceData.size){setProgress(77,'Comparing local reference…');findings.push(...analyzeReference(state.fileData));}
    state.scanCoverage.unshift(`${state.fileData.size} text files parsed`);
  }
  if(logText){setProgress(87,'Grouping error.log signals…');findings.push(...analyzeLog(logText));state.scanCoverage.push('error.log included');}
  else state.scanCoverage.push('no error.log');
  if(state.referenceData.size) state.scanCoverage.push(`${state.referenceData.size} reference files indexed`); else state.scanCoverage.push('no reference loaded');
  setProgress(96,'Prioritizing findings…'); await new Promise(r=>setTimeout(r,0)); finishProgress(); showResults(dedupeAndPrioritize(findings),{hasProject,hasLog:!!logText});
}
function setProgress(p,text){$('#progressBar').style.width=`${Math.min(100,Math.max(0,p))}%`;$('#progressText').textContent=text;}
function finishProgress(){$('#progressWrap').classList.add('hidden');$('#progressBar').style.width='0%';}

