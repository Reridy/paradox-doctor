'use strict';

function analyzeReference(entries) {
  if (!state.referenceData.size) return [];
  const out=[], refLoc=new Map(); let exactOverrides=0;
  for (const [path,e] of state.referenceData) if (/\.ya?ml$/i.test(path)) for (const m of e.text.matchAll(/^\s*([^\s:#]+)\s*:/gm)) refLoc.set(m[1],path);
  const broad=[];
  for (const [path,e] of entries) {
    const rel=relativePath(path);
    if (state.referenceData.has(rel)) { exactOverrides++; if (/(?:^|\/)(?:00_|01_|zz_|defines|on_actions|scripted_)/i.test(rel)) broad.push(rel); }
    if (/\.ya?ml$/i.test(path)) for (const m of e.text.matchAll(/^\s*([^\s:#]+)\s*:/gm)) if (refLoc.has(m[1])) out.push(makeFinding('info',pdText(`Localization overrides reference key: ${m[1]}`,`현지화가 reference 키를 덮어씁니다: ${m[1]}`),path,lineAt(e.text,m.index),pdText(`Reference also defines this key in ${refLoc.get(m[1])}. This may be intentional.`,`Reference도 ${refLoc.get(m[1])}에서 이 키를 정의합니다. 의도된 동작일 수 있습니다.`),{confidence:'high',category:'Overrides',heuristic:true}));
  }
  if (exactOverrides) out.push(makeFinding('info',pdText(`${exactOverrides} project files override the reference by exact path`,`${exactOverrides}개 프로젝트 파일이 같은 경로의 reference를 덮어씁니다`),'project',1,pdText('Exact-path overrides are normal when intentional. Review copied broad system files after updates.','같은 경로의 override는 의도된 경우 정상입니다. 업데이트 후 복사된 광범위한 시스템 파일을 확인하세요.'),{confidence:'high',category:'Overrides',frequency:exactOverrides,heuristic:true}));
  broad.slice(0,20).forEach(rel => out.push(makeFinding('warning',pdText(`Review broad reference override: ${rel}`,`광범위한 reference override 확인: ${rel}`),rel,1,pdText('This project file replaces a broad/system-like reference path. Confirm it was copied intentionally.','이 프로젝트 파일은 광범위한 시스템 계열 reference 경로를 대체합니다. 의도적으로 복사한 것인지 확인하세요.'),{confidence:'medium',category:'Overrides',heuristic:true,action:pdText('If the file was copied only as a template, reduce the override to the smallest necessary file or definition.','템플릿 목적으로만 복사한 파일이라면 override 범위를 필요한 최소 파일/정의로 줄이세요.')})));
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
    if (low.includes('unexpected token') || low.includes('unexpected characters')) raw.push(makeFinding('error',pdText('Parser encountered unexpected input','파서가 예상하지 못한 입력을 발견했습니다'),loc.file,loc.line,msg,{root:true,confidence:'high',category:'Syntax',guide:'errors/unexpected-token.html',action:pdText('Fix the earliest parser/structure error first; later parser lines may disappear after one correction.','가장 먼저 발생한 파서/구조 오류부터 수정하세요. 하나를 고치면 뒤쪽 파서 오류가 사라질 수 있습니다.')}));
    else if (low.includes('duplicate localization found')) raw.push(makeFinding('error',pdText('Engine reported duplicate localization','엔진이 중복 현지화를 보고했습니다'),loc.file,loc.line,msg,{root:true,confidence:'high',category:'Localization',guide:'errors/duplicate-localization.html'}));
    else if (low.includes('unknown effect') || low.includes('unknown trigger') || low.includes('invalid effect')) raw.push(makeFinding('error',pdText('Unknown or invalid script command','알 수 없거나 유효하지 않은 스크립트 명령'),loc.file,loc.line,msg,{root:true,confidence:'high',category:'Scripting',guide:state.game==='vic3'?'errors/vic3-scope.html':'errors/unknown-effect.html'}));
    else if (low.includes('wrong scope') || low.includes('unset scope') || low.includes('returned an invalid object') || low.includes('event target link')) raw.push(makeFinding('error',pdText('Scope or event-target failure','Scope 또는 event-target 오류'),loc.file,loc.line,msg,{root:true,confidence:'high',category:'Scope',guide:state.game==='vic3'?'errors/vic3-scope.html':'errors/unknown-effect.html',action:pdText('Trace the scope immediately before the reported command or event target; verify the object type at each scope transition.','보고된 명령 또는 event target 직전의 scope를 추적하고 각 scope 전환의 오브젝트 타입을 확인하세요.')}));
    else if (low.includes('failed to read key reference') || low.includes('could not find') || low.includes('failed to find') || low.includes('not found')) raw.push(makeFinding('warning',pdText('Missing or unresolved reference','누락되었거나 해결되지 않은 참조'),loc.file,loc.line,msg,{confidence:'medium',category:'References',heuristic:true}));
    else if (state.game==='hoi4' && (low.includes('map definition error') || (low.includes('strategic region') && low.includes('province')) || (low.includes('province') && low.includes('state')))) raw.push(makeFinding('error',pdText('HOI4 map/state validation error','HOI4 지도/state 검증 오류'),loc.file,loc.line,msg,{root:true,confidence:'high',category:'Map',guide:'errors/hoi4-map-state.html'}));
    else if (state.game==='vic3' && (low.includes('state region') || low.includes('assertion failed') || (low.includes('spline') && low.includes('not found')))) raw.push(makeFinding('warning',pdText('Possible Victoria 3 map/state failure','Victoria 3 지도/state 오류 가능성'),loc.file,loc.line,msg,{confidence:'medium',category:'Map',heuristic:true,guide:'errors/vic3-map-state.html'}));
    else if (/\b(error|exception|invalid)\b/i.test(line)) raw.push(makeFinding('info',pdText('Unclassified engine error','분류되지 않은 엔진 오류'),loc.file,loc.line,msg,{confidence:'low',category:'Engine',heuristic:true}));
  });
  const grouped=new Map();
  for (const x of raw) { const key=[x.title,normalizeLogMessage(x.explanation),x.file].join('|'); const found=grouped.get(key); if(found) found.frequency++; else grouped.set(key,{...x}); }
  if (!grouped.size) return [makeFinding('info',pdText('No supported high-signal log pattern recognized','지원되는 주요 로그 패턴을 찾지 못했습니다'),state.logFile?.name||'error.log',1,pdText('The log contains text, but this scanner did not recognize a supported high-signal pattern. This does not prove the mod is error-free.','로그 내용은 있지만 현재 스캐너가 지원하는 주요 패턴을 인식하지 못했습니다. 이것이 모드에 오류가 없다는 뜻은 아닙니다.'),{confidence:'high',category:'Log'})];
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
  if(total>MAX_TOTAL_BYTES){ showResults([makeFinding('warning',pdText('Project selection is too large for a safe browser scan','브라우저에서 안전하게 검사하기에는 프로젝트 선택 범위가 너무 큽니다'),'project',1,pdText(`Selected supported files total ${formatBytes(total)}. Reduce the selection below ${formatBytes(MAX_TOTAL_BYTES)}.`,`선택된 지원 파일의 총 크기는 ${formatBytes(total)}입니다. ${formatBytes(MAX_TOTAL_BYTES)} 이하로 줄여주세요.`),{root:true,confidence:'high',category:'Performance'})],{hasProject,hasLog:!!logText}); return; }
  $('#progressWrap').classList.remove('hidden'); setProgress(2,pdText('Reading project files…','프로젝트 파일 읽는 중…')); state.fileData.clear();
  let done=0;
  for (const file of state.projectFiles) {
    if(state.cancel){ finishProgress(); return; }
    if(file.size<=MAX_FILE_BYTES){ try{state.fileData.set(pathOf(file),await readFileEntry(file));}catch{} }
    done++; if(done%25===0||done===state.projectFiles.length){setProgress(hasProject?Math.round((done/Math.max(1,state.projectFiles.length))*46):46,pdText(`Reading ${done}/${state.projectFiles.length} files…`,`${done}/${state.projectFiles.length}개 파일 읽는 중…`));await new Promise(r=>setTimeout(r,0));}
  }
  const findings=[], globalKeys=new Map();
  if(hasProject){
    setProgress(52,pdText('Checking common structure…','공통 구조 검사 중…'));
    for(const [path,e] of state.fileData){ if(/\.txt$/i.test(path)) findings.push(...analyzeBraces(e.text,path)); if(/\.ya?ml$/i.test(path)) findings.push(...analyzeLocalization(e,globalKeys)); }
    for(const [key,defs] of globalKeys) { const uniquePaths=[...new Set(defs.map(d=>d.path))]; if(uniquePaths.length>1) findings.push(makeFinding('error',pdText(`Duplicate localization key across files: ${key}`,`파일 간 중복 현지화 키: ${key}`),defs[0].path,defs[0].line,pdText(`Defined in ${uniquePaths.length} files: ${defs.map(d=>`${d.path}:${d.line}`).join(', ')}`,`${uniquePaths.length}개 파일에서 정의됨: ${defs.map(d=>`${d.path}:${d.line}`).join(', ')}`),{root:true,confidence:'high',category:'Localization',frequency:defs.length})); }
    findings.push(...analyzeDescriptor(state.fileData));
    setProgress(66,pdText(`Running ${profiles[state.game].short} checks…`,`${profiles[state.game].short} 검사 실행 중…`)); findings.push(...(state.game==='hoi4'?analyzeHoi4(state.fileData):analyzeVic3(state.fileData)));
    if(state.referenceData.size){setProgress(77,pdText('Comparing local reference…','로컬 reference 비교 중…'));findings.push(...analyzeReference(state.fileData));}
    state.scanCoverage.unshift(pdText(`${state.fileData.size} text files parsed`,`텍스트 파일 ${state.fileData.size}개 분석`));
  }
  if(logText){setProgress(87,pdText('Grouping error.log signals…','error.log 신호 묶는 중…'));findings.push(...analyzeLog(logText));state.scanCoverage.push(pdText('error.log included','error.log 포함'));}
  else state.scanCoverage.push(pdText('no error.log','error.log 없음'));
  if(state.referenceData.size) state.scanCoverage.push(pdText(`${state.referenceData.size} reference files indexed`, `reference 파일 ${state.referenceData.size}개 색인`)); else state.scanCoverage.push(pdText('no reference loaded','reference 없음'));
  setProgress(96,pdText('Prioritizing findings…','결과 우선순위 정리 중…')); await new Promise(r=>setTimeout(r,0)); finishProgress(); showResults(dedupeAndPrioritize(findings),{hasProject,hasLog:!!logText});
}
function setProgress(p,text){$('#progressBar').style.width=`${Math.min(100,Math.max(0,p))}%`;$('#progressText').textContent=text;}
function finishProgress(){$('#progressWrap').classList.add('hidden');$('#progressBar').style.width='0%';}
