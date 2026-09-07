'use strict';

function visibleFindings(){
  const q=state.search.toLowerCase();
  return state.findings.filter(x=>state.showIgnored||!state.ignored.has(fingerprint(x))).filter(x=>!state.newOnly||!state.baseline.size||!state.baseline.has(fingerprint(x))).filter(x=>state.filter==='all'||(state.filter==='root'?x.root:x.severity===state.filter)).filter(x=>state.category==='all'||x.category===state.category).filter(x=>!q||`${x.title} ${x.file} ${x.explanation} ${x.category}`.toLowerCase().includes(q));
}
function findingStatus(x){return {ignored:state.ignored.has(fingerprint(x)),isNew:state.baseline.size&&!state.baseline.has(fingerprint(x))};}
function defaultAction(x){const s=`${x.title} ${x.category}`.toLowerCase();if(/syntax|brace|parser/.test(s))return'Fix the earliest structural/parser problem, launch once, then rescan before touching later parser messages.';if(/locali[sz]ation/.test(s))return'Correct or deduplicate the reported key/file, then rescan localization before launching.';if(/map|state|province|strategic/.test(s))return state.game==='hoi4'?'Review state, province and strategic-region changes together; then validate with a fresh game log.':'Review the affected state-region definitions together and reproduce with a fresh log.';if(/scope/.test(s))return'Trace the scope immediately before this command. Verify the object type rather than changing syntax blindly.';if(/override|compatibility/.test(s))return'Confirm the override or version mismatch is intentional, then test with only required dependencies.';if(/focus/.test(s))return'Check the referenced focus ID and the block immediately before it; one malformed focus can hide later nodes.';if(/journal|event/.test(s))return'Compare the object and reference with a known working example from the current game version or loaded reference.';return'Make the smallest change related to this finding, reproduce once, then compare the next diagnosis.';}

function showResults(findings,meta={}){
  state.findings=findings; state.lastScan={game:state.game,at:new Date().toISOString(),files:state.fileData.size,hasLog:meta.hasLog,referenceFiles:state.referenceData.size};
  $('#results').classList.remove('hidden'); populateCategoryFilter(); renderResults(); $('#results').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderResults(){
  const active=state.findings.filter(x=>!state.ignored.has(fingerprint(x)));
  const counts={root:0,error:0,warning:0,info:0};active.forEach(x=>{if(x.root)counts.root++;counts[x.severity]++;});
  $('#rootCount').textContent=counts.root;$('#errorCount').textContent=counts.error;$('#warningCount').textContent=counts.warning;$('#noteCount').textContent=counts.info;
  const dot=$('#statusDot');dot.className='status-dot';
  if(counts.root||counts.error){$('#resultsTitle').textContent='Needs attention';dot.classList.add('danger');}
  else if(counts.warning){$('#resultsTitle').textContent='Review warnings';dot.classList.add('warn');}
  else{$('#resultsTitle').textContent='No supported issues found';dot.classList.add('ok');}
  $('#resultsSubtitle').textContent=`${profiles[state.game].name} · ${state.fileData.size} project files${state.lastScan?.hasLog?' + error.log':''}`;
  $('#coverageBar').innerHTML=state.scanCoverage.map(x=>`<span>${escapeHtml(x)}</span>`).join('');
  const roots=active.filter(x=>x.root).slice(0,3), start=$('#startHere');
  start.classList.toggle('hidden',!roots.length);$('#startHereList').innerHTML=roots.map(x=>`<li><strong>${escapeHtml(x.title)}</strong> — ${escapeHtml(x.file)}${x.line?`:${x.line}`:''}</li>`).join('');
  renderFindingList();
}
function populateCategoryFilter(){const current=state.category;const cats=[...new Set(state.findings.map(x=>x.category))].sort();$('#categoryFilter').innerHTML='<option value="all">All categories</option>'+cats.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');state.category=cats.includes(current)?current:'all';$('#categoryFilter').value=state.category;}
function renderFindingList(){
  const list=$('#resultList'), visible=visibleFindings();list.innerHTML='';$('#emptyResults').classList.toggle('hidden',visible.length>0);
  for(const x of visible.slice(0,600)){
    const st=findingStatus(x), card=document.createElement('article');card.className=`finding${st.isNew?' new':''}${st.ignored?' ignored':''}`;
    const badgeRoot=x.root?'<span class="badge root">likely root</span>':'';const badgeNew=st.isNew?'<span class="badge new">new</span>':'';const heuristic=x.heuristic?'<span class="badge">heuristic</span>':'';
    card.innerHTML=`<div class="finding-main"><div class="finding-top"><div class="finding-title-wrap"><span class="severity-mark ${x.root?'root':x.severity}"></span><div><h3>${escapeHtml(x.title)}${x.frequency>1?` ×${x.frequency}`:''}</h3><div class="finding-meta">${escapeHtml(x.category)} · ${escapeHtml(x.file)}:${x.line} · ${escapeHtml(x.confidence)} confidence</div></div></div><div class="finding-badges">${badgeRoot}${badgeNew}${heuristic}</div></div><p class="finding-explanation">${escapeHtml(x.explanation)}</p><details><summary>What should I do?</summary><div class="finding-detail"><div class="next-action"><strong>Next action</strong><br>${escapeHtml(x.action||defaultAction(x))}</div><div class="finding-actions"><button class="text-btn" data-copy type="button">Copy finding</button><button class="text-btn" data-ignore type="button">${st.ignored?'Unignore':'Ignore this pattern'}</button>${x.guide?`<a class="quiet-link" href="${escapeHtml(x.guide)}">Open guide →</a>`:''}</div></div></details></div>`;
    $('[data-copy]',card).addEventListener('click',async e=>{await navigator.clipboard.writeText(`[${profiles[state.game].short}] ${x.title}\n${x.file}:${x.line}\n${x.explanation}\nNext: ${x.action||defaultAction(x)}`);const old=e.target.textContent;e.target.textContent='Copied';setTimeout(()=>e.target.textContent=old,900);});
    $('[data-ignore]',card).addEventListener('click',()=>{const f=fingerprint(x);if(state.ignored.has(f))state.ignored.delete(f);else state.ignored.add(f);saveIgnored();renderResults();});
    list.appendChild(card);
  }
  if(visible.length>600){const n=document.createElement('div');n.className='empty-state';n.innerHTML=`<strong>Showing the first 600 of ${visible.length} findings.</strong><span>Export the report for the complete list.</span>`;list.appendChild(n);}
}

function clearResults(message='') { state.findings=[]; state.lastScan=null; $('#results').classList.add('hidden'); if(message){$('#readyLabel').textContent=message;$('#readyDetail').textContent='Existing results were cleared to avoid mixing game profiles.';} }

function reportObject(){return{schema:'paradox-doctor-report-v4',scan:state.lastScan,coverage:state.scanCoverage,issues:state.findings};}
function markdownReport(){const o=reportObject();let md=`# Paradox Doctor report\n\n- Game: ${profiles[state.game].name}\n- Generated: ${o.scan?.at||new Date().toISOString()}\n- Project files: ${o.scan?.files||0}\n- error.log: ${o.scan?.hasLog?'included':'not included'}\n- Reference files: ${o.scan?.referenceFiles||0}\n- Findings: ${o.issues.length}\n\n## Coverage\n${o.coverage.map(x=>`- ${x}`).join('\n')}\n\n`;for(const x of o.issues)md+=`## ${x.root?'[Likely root] ':''}${x.title}\n- Severity: ${x.severity}\n- Category: ${x.category}\n- Confidence: ${x.confidence}${x.heuristic?' (heuristic)':''}\n- Location: ${x.file}:${x.line}\n- Repeats: ${x.frequency}\n\n${x.explanation}\n\nNext action: ${x.action||defaultAction(x)}\n\n`;return md;}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
function saveCurrentBaseline(){if(!state.findings.length)return;const all=readJSON(BASELINE_KEY,{});all[state.game]={createdAt:new Date().toISOString(),fingerprints:state.findings.filter(x=>!state.ignored.has(fingerprint(x))).map(fingerprint)};writeJSON(BASELINE_KEY,all);loadBaselineForGame();renderResults();}
async function importBaseline(file){try{const data=JSON.parse(await file.text());const issues=Array.isArray(data)?data:(data.issues||data.results||[]);if(!issues.length)throw new Error('No issues');const all=readJSON(BASELINE_KEY,{});all[state.game]={createdAt:new Date().toISOString(),fingerprints:issues.map(fingerprint)};writeJSON(BASELINE_KEY,all);loadBaselineForGame();renderResults();}catch{$('#baselineStatus').textContent='Could not import that report.';}}
function clearBaseline(){const all=readJSON(BASELINE_KEY,{});delete all[state.game];writeJSON(BASELINE_KEY,all);loadBaselineForGame();state.newOnly=false;$('#newOnlyToggle').checked=false;renderResults();}

function bindUI(){
  $('#gameSelect').addEventListener('change',e=>setGame(e.target.value));
  $('#folderInput').addEventListener('change',e=>setProjectFiles([...e.target.files]));$('#fileInput').addEventListener('change',e=>setProjectFiles([...e.target.files]));$('#clearProjectBtn').addEventListener('click',clearProject);
  $('#logFileInput').addEventListener('change',e=>setLogFile(e.target.files[0]));$('#clearLogBtn').addEventListener('click',clearLog);$('#logInput').addEventListener('input',()=>{state.logText=$('#logInput').value;$('#clearLogBtn').classList.toggle('hidden',!state.logText.trim()&&!state.logFile);updateReadyState();});
  const drop=$('#logDropZone');['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('dragover')}));['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('dragover')}));drop.addEventListener('drop',e=>{const f=[...e.dataTransfer.files].find(x=>/\.(log|txt)$/i.test(x.name));if(f)setLogFile(f);});
  $('#referenceInput').addEventListener('change',e=>loadReference([...e.target.files]));$('#gameVersionInput').addEventListener('input',e=>state.gameVersion=e.target.value.trim());
  $('#runBtn').addEventListener('click',runDiagnosis);$('#cancelBtn').addEventListener('click',()=>state.cancel=true);$('#clearWorkspaceBtn').addEventListener('click',clearWorkspace);
  $$('.filter').forEach(b=>b.addEventListener('click',()=>{$$('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.filter=b.dataset.severity;renderFindingList();}));
  $('#categoryFilter').addEventListener('change',e=>{state.category=e.target.value;renderFindingList();});$('#searchInput').addEventListener('input',e=>{state.search=e.target.value;renderFindingList();});$('#newOnlyToggle').addEventListener('change',e=>{state.newOnly=e.target.checked;renderFindingList();});$('#showIgnoredToggle').addEventListener('change',e=>{state.showIgnored=e.target.checked;renderFindingList();});
  $('#saveBaselineBtn').addEventListener('click',saveCurrentBaseline);$('#clearBaselineBtn').addEventListener('click',clearBaseline);$('#importBaselineBtn').addEventListener('click',()=>$('#baselineInput').click());$('#baselineInput').addEventListener('change',e=>{if(e.target.files[0])importBaseline(e.target.files[0]);});
  $('#exportJsonBtn').addEventListener('click',()=>download(`paradox-doctor-${state.game}.json`,JSON.stringify(reportObject(),null,2),'application/json'));$('#exportMdBtn').addEventListener('click',()=>download(`paradox-doctor-${state.game}.md`,markdownReport(),'text/markdown'));$('#copyReportBtn').addEventListener('click',async e=>{await navigator.clipboard.writeText(markdownReport());const old=e.target.textContent;e.target.textContent='Copied';setTimeout(()=>e.target.textContent=old,900);});
  const dialog=$('#logDialog');$('#logLocationBtn').addEventListener('click',()=>dialog.showModal());$('#closeLogDialog').addEventListener('click',()=>dialog.close());
}

bindUI();loadStoredPreferences();updateReadyState();
