(() => {
  const WKEY='paradoxDoctorWorkflowV3';
  const IKEY='paradoxDoctorIgnoredV3';
  const workflow={baseline:new Set(),ignored:new Set(JSON.parse(localStorage.getItem(IKEY)||'[]')),newOnly:false,showIgnored:false,rawIssues:[],referenceFiles:[],referenceTexts:new Map(),gameVersion:'',guided:true};

  function fp(x){
    const title=String(x.title||'').replace(/\b\d+\b/g,'#').toLowerCase();
    const file=String(x.file||'').replace(/\\/g,'/').replace(/^.*?\/(common|events|history|map|map_data|locali[sz]ation|gfx)\//i,'$1/').toLowerCase();
    return [x.game||state.game,x.category||'general',title,file].join('|');
  }
  function saveIgnored(){localStorage.setItem(IKEY,JSON.stringify([...workflow.ignored]));}
  function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function css(){
    const style=document.createElement('style');
    style.textContent=`
    .workflow-strip{max-width:1080px;margin:-12px auto 24px;padding:0 24px}.workflow-box{border:1px solid #303846;background:#141923;border-radius:18px;padding:16px;display:grid;gap:13px}.workflow-top{display:flex;justify-content:space-between;gap:16px;align-items:center}.workflow-top h3{margin:0;font-size:1rem}.workflow-controls{display:flex;gap:9px;flex-wrap:wrap;align-items:center}.workflow-controls label,.workflow-check{display:flex;gap:7px;align-items:center;color:#b7c0cf;font-size:.84rem}.workflow-file{position:relative;overflow:hidden}.workflow-file input{position:absolute;inset:0;opacity:0;cursor:pointer}.workflow-status{font-size:.8rem;color:#8e99ab}.workflow-pill{border:1px solid #384151;background:#1a202b;border-radius:999px;padding:7px 10px;font-size:.78rem;color:#c8d0dd}.workflow-new{border-color:#416a52!important;box-shadow:inset 3px 0 #6bc98b}.issue-helpers{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px;align-items:center}.issue-helper{border:1px solid #343d4b;background:#171d27;color:#c9d1dd;border-radius:9px;padding:7px 9px;font:inherit;font-size:.76rem;cursor:pointer}.issue-helper:hover{border-color:#61718a}.next-action{margin-top:12px;padding:10px 12px;border-left:3px solid #7089bc;background:#171d28;border-radius:7px;color:#c7cedb;font-size:.84rem}.confidence-chip{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:#96a2b5}.reference-card{border-top:1px solid #29313e;padding-top:12px}.reference-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.reference-drop{border:1px dashed #465266;border-radius:12px;padding:12px;position:relative;cursor:pointer}.reference-drop input{position:absolute;inset:0;opacity:0;cursor:pointer}.reference-drop strong{display:block}.reference-drop span{font-size:.78rem;color:#929daf}.version-input{background:#0d1117;border:1px solid #313a49;border-radius:9px;color:#fff;padding:8px 10px;width:130px}.feedback-nudge{max-width:1080px;margin:0 auto 38px;padding:0 24px}.feedback-nudge>div{border:1px solid #303846;border-radius:16px;padding:18px;background:#141923;display:flex;justify-content:space-between;gap:20px;align-items:center}.feedback-nudge h3{margin:0 0 5px}.feedback-nudge p{margin:0;color:#a8b2c2}.new-count{font-weight:800;color:#8fe0aa}@media(max-width:760px){.workflow-top,.feedback-nudge>div{align-items:flex-start;flex-direction:column}.reference-grid{grid-template-columns:1fr}.workflow-controls{width:100%}}
    `;
    document.head.appendChild(style);
  }
  function injectUI(){
    css();
    const scanner=document.querySelector('#scanner');
    if(scanner&&!document.querySelector('#workflowStrip')){
      const wrap=document.createElement('section');wrap.id='workflowStrip';wrap.className='workflow-strip';
      wrap.innerHTML=`<div class="workflow-box"><div class="workflow-top"><div><p class="eyebrow">DEBUGGING WORKFLOW</p><h3>Compare runs, suppress known noise, and catch risky overrides</h3></div><span id="workflowNewCount" class="workflow-pill">No baseline loaded</span></div><div class="workflow-controls"><label class="secondary-btn workflow-file">Load previous JSON report<input id="baselineReportInput" type="file" accept=".json,application/json"></label><button id="clearBaselineBtn" class="secondary-btn" type="button" disabled>Clear baseline</button><label class="workflow-check"><input id="newOnlyToggle" type="checkbox"> New issues only</label><label class="workflow-check"><input id="showIgnoredToggle" type="checkbox"> Show ignored</label><label class="workflow-check"><input id="guidedToggle" type="checkbox" checked> Guided fixes</label></div><div class="reference-card"><div class="reference-grid"><label class="reference-drop"><input id="referenceFolderInput" type="file" webkitdirectory directory multiple><strong>Optional reference folder</strong><span>Select vanilla game files or a dependency mod. Used locally to spot file/key override collisions.</span></label><div><label class="workflow-check">Current game version <input id="gameVersionInput" class="version-input" placeholder="e.g. 1.17.4"></label><div id="referenceStatus" class="workflow-status">No reference folder loaded. This is optional.</div></div></div></div><div id="workflowStatus" class="workflow-status">Tip: export a JSON report after a stable run, then load it next time to focus on regressions.</div></div>`;
      scanner.insertAdjacentElement('afterend',wrap);
    }
    const main=document.querySelector('main');
    if(main&&!document.querySelector('#feedbackNudge')){
      const n=document.createElement('section');n.id='feedbackNudge';n.className='feedback-nudge';
      n.innerHTML=`<div><div><h3>Did the diagnosis miss the real problem?</h3><p>Tell us the game, the error pattern, and whether the result was useful or noisy. Real cases decide what gets built next.</p></div><a class="secondary-btn" href="https://github.com/Reridy/paradox-doctor/issues/5" target="_blank" rel="noopener">Answer the modder survey</a></div>`;
      main.appendChild(n);
    }
    bindUI();
  }
  function bindUI(){
    const baseline=document.querySelector('#baselineReportInput');
    if(baseline&&!baseline.dataset.bound){baseline.dataset.bound='1';baseline.addEventListener('change',async()=>{const f=baseline.files[0];if(!f)return;try{const data=JSON.parse(await f.text());const arr=Array.isArray(data)?data:(data.issues||data.results||[]);workflow.baseline=new Set(arr.map(fp));document.querySelector('#clearBaselineBtn').disabled=false;setStatus(`Loaded baseline with ${workflow.baseline.size} issue fingerprints from ${f.name}.`);rerender();}catch{setStatus('Could not read that JSON report. Use a Paradox Doctor JSON report or an array of issue objects.');}});}
    const clear=document.querySelector('#clearBaselineBtn');if(clear&&!clear.dataset.bound){clear.dataset.bound='1';clear.addEventListener('click',()=>{workflow.baseline.clear();workflow.newOnly=false;document.querySelector('#newOnlyToggle').checked=false;clear.disabled=true;setStatus('Baseline cleared.');rerender();});}
    const newOnly=document.querySelector('#newOnlyToggle');if(newOnly&&!newOnly.dataset.bound){newOnly.dataset.bound='1';newOnly.addEventListener('change',()=>{workflow.newOnly=newOnly.checked;rerender();});}
    const showIgnored=document.querySelector('#showIgnoredToggle');if(showIgnored&&!showIgnored.dataset.bound){showIgnored.dataset.bound='1';showIgnored.addEventListener('change',()=>{workflow.showIgnored=showIgnored.checked;rerender();});}
    const guided=document.querySelector('#guidedToggle');if(guided&&!guided.dataset.bound){guided.dataset.bound='1';guided.addEventListener('change',()=>{workflow.guided=guided.checked;decorateCards();});}
    const ref=document.querySelector('#referenceFolderInput');if(ref&&!ref.dataset.bound){ref.dataset.bound='1';ref.addEventListener('change',()=>loadReference([...ref.files]));}
    const ver=document.querySelector('#gameVersionInput');if(ver&&!ver.dataset.bound){ver.dataset.bound='1';ver.addEventListener('input',()=>workflow.gameVersion=ver.value.trim());}
  }
  function setStatus(t){const el=document.querySelector('#workflowStatus');if(el)el.textContent=t;}
  async function loadReference(files){
    workflow.referenceFiles=files.filter(f=>/\.(txt|yml|yaml|mod|gui|asset|csv)$/i.test(f.name)).slice(0,3000);workflow.referenceTexts.clear();
    const status=document.querySelector('#referenceStatus');status.textContent=`Indexing ${workflow.referenceFiles.length} text files…`;
    let n=0;for(const f of workflow.referenceFiles){if(f.size<1200000){try{workflow.referenceTexts.set(relPath(f),await f.text());}catch{}}if(++n%100===0)await new Promise(r=>setTimeout(r,0));}
    status.textContent=`Reference ready: ${workflow.referenceTexts.size} files indexed locally.`;
    rerender();
  }
  function relPath(file){const p=(file.webkitRelativePath||file.name).replaceAll('\\','/');const parts=p.split('/');return parts.length>1?parts.slice(1).join('/'):p;}
  function pathRel(p){const parts=String(p).replaceAll('\\','/').split('/');return parts.length>1?parts.slice(1).join('/'):String(p);}

  function descriptorChecks(texts){
    const out=[];let found=false;
    for(const [path,text] of texts){if(/(?:^|\/)(?:descriptor\.mod|[^/]+\.mod)$/i.test(path)){found=true;const m=text.match(/supported_version\s*=\s*"([^"]+)"/i);if(!m)out.push(issue('warning','Mod descriptor has no supported_version',path,1,'Declare supported_version so users can quickly see whether a game update may have made the mod stale.',{category:'Compatibility',confidence:'high'}));else{out.push(issue('info',`Declared supported version: ${m[1]}`,path,1,'Keep this value current after testing against a game update.',{category:'Compatibility',confidence:'high'}));if(workflow.gameVersion&&!versionMatches(m[1],workflow.gameVersion))out.push(issue('warning',`Descriptor may not match game ${workflow.gameVersion}`,path,1,`The descriptor declares ${m[1]}. A version mismatch is a strong reason to review changed script/map formats before debugging secondary errors.`,{category:'Compatibility',confidence:'medium',root:true}));}}
    }
    if(!found)out.push(issue('info','No descriptor.mod was included in the selection','project',1,'Select the mod root folder if you want compatibility/version and replace_path checks.',{category:'Compatibility',confidence:'high'}));
    return out;
  }
  function versionMatches(pattern,current){const p=pattern.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\\\*/g,'[^.]+');try{return new RegExp('^'+p+'$').test(current);}catch{return true;}}

  function referenceChecks(texts){
    if(!workflow.referenceTexts.size)return[];const out=[],refKeys=new Map();
    for(const [p,t] of workflow.referenceTexts){if(/\.ya?ml$/i.test(p)){for(const m of t.matchAll(/^\s*([^\s:#]+)\s*:/gm)){const a=refKeys.get(m[1])||[];a.push(p);refKeys.set(m[1],a);}}}
    let overrides=0;const risky=[];
    for(const [path,text] of texts){const rel=pathRel(path);if(workflow.referenceTexts.has(rel)){overrides++;if(/(?:^|\/)(00_|01_|zz_|defines|on_actions|scripted_)/i.test(rel)||/titlebar_styles|buildings\.txt/i.test(rel))risky.push(rel);}
      if(/\.ya?ml$/i.test(path)&&!/locali[sz]ation\/replace\//i.test(path)){for(const m of text.matchAll(/^\s*([^\s:#]+)\s*:/gm)){if(refKeys.has(m[1]))out.push(issue('info',`Localization key also exists in reference: ${m[1]}`,path,text.slice(0,m.index).split(/\r?\n/).length,'This may be an intentional localization override. If not, rename the key or move intended replacements into the game-appropriate replace structure.',{category:'Overrides',confidence:'medium'}));}}
    }
    if(overrides)out.push(issue('info',`${overrides} project file${overrides===1?'':'s'} override the reference by path`,'project',1,'Exact relative-path overrides are normal when intentional. Review broad copied vanilla files because they can silently replace unrelated systems.',{category:'Overrides',confidence:'high',frequency:overrides}));
    risky.slice(0,20).forEach(rel=>out.push(issue('warning',`Review broad reference override: ${rel}`,rel,1,'This project file has the same relative path as the reference and a broad/system-like filename. Remove it if it was copied accidentally.',{category:'Overrides',confidence:'medium',root:true})));
    return out;
  }

  function extraHoi4(texts){
    const out=[],focusIds=new Set(),focusRefs=[],stateProvinces=new Set(),strategicProvinces=new Set(),locKeys=new Set();
    for(const [p,t] of texts){if(/\.ya?ml$/i.test(p))for(const m of t.matchAll(/^\s*([^\s:#]+)\s*:/gm))locKeys.add(m[1]);if(/national_focus.*\.txt$/i.test(p)){for(const m of t.matchAll(/\bfocus\s*=\s*\{[\s\S]*?\bid\s*=\s*([A-Za-z0-9_.:-]+)/g))focusIds.add(m[1]);for(const m of t.matchAll(/\bfocus\s*=\s*([A-Za-z0-9_.:-]+)/g))focusRefs.push({id:m[1],p,line:t.slice(0,m.index).split(/\r?\n/).length});}
      if(/history\/states\/.*\.txt$/i.test(p)){const id=(t.match(/\bid\s*=\s*(\d+)/)||[])[1];const prov=(t.match(/\bprovinces\s*=\s*\{([^}]*)\}/s)||[])[1];for(const x of prov?.match(/\d+/g)||[])stateProvinces.add(x);if(id&&!locKeys.has('STATE_'+id))out.push(issue('info',`State ${id} has no STATE_${id} localization in selection`,p,1,'If the state name appears as a raw key, add its state localization entry.',{category:'Localization',confidence:'medium'}));if(!/\bbuildings\s*=\s*\{/.test(t))out.push(issue('warning','State has no buildings block',p,1,'Recent community cases show newly added states can crash when required building/state data is incomplete. Validate the state in debug/nudge and add the expected building structure.',{category:'Map',confidence:'medium',root:true,guide:'errors/hoi4-map-state.html'}));}
      if(/map\/strategicregions\/.*\.txt$/i.test(p)){const prov=(t.match(/\bprovinces\s*=\s*\{([^}]*)\}/s)||[])[1];for(const x of prov?.match(/\d+/g)||[])strategicProvinces.add(x);}}
    for(const r of focusRefs)if(!focusIds.has(r.id))out.push(issue('error',`Focus prerequisite references missing focus: ${r.id}`,r.p,r.line,'A focus prerequisite points to an ID that was not found in the selected focus files. This can break or hide parts of a focus tree.',{category:'Focus',confidence:'high',root:true}));
    if(strategicProvinces.size)for(const p of stateProvinces)if(!strategicProvinces.has(p))out.push(issue('warning',`Province ${p} is in a state but not in selected strategic regions`,'map/strategicregions',1,'HOI4 map changes commonly require strategic-region membership to be updated together with state province changes.',{category:'Map',confidence:'medium',guide:'errors/hoi4-map-state.html'}));
    return out;
  }
  function extraVic3(texts){
    const out=[],eventIds=new Set(),refs=[];
    for(const [p,t] of texts){if(/events\/.*\.txt$/i.test(p))for(const m of t.matchAll(/\bid\s*=\s*([A-Za-z0-9_]+\.\d+)/g))eventIds.add(m[1]);if(/common\/journal_entries\/.*\.txt$/i.test(p)){for(const m of t.matchAll(/\b(?:trigger_event|country_event)\s*=\s*\{[\s\S]*?\bid\s*=\s*([A-Za-z0-9_]+\.\d+)/g))refs.push({id:m[1],p,line:t.slice(0,m.index).split(/\r?\n/).length});for(const m of t.matchAll(/^\s*(je_[A-Za-z0-9_.:-]+)\s*=\s*\{([\s\S]*?)(?=^\s*je_|\s*$)/gm)){if(/\btimeout\s*=\s*0\b/.test(m[2]))out.push(issue('warning',`Journal entry ${m[1]} uses timeout = 0`,p,t.slice(0,m.index).split(/\r?\n/).length,'A zero timeout is easy to misread and validator tooling specifically treats it as suspicious. Confirm the current Victoria 3 behavior is intentional.',{category:'Journal',confidence:'medium',guide:'errors/vic3-journal-events.html'}));}}
    }
    for(const r of refs)if(!eventIds.has(r.id))out.push(issue('warning',`Journal/event reference not found in selection: ${r.id}`,r.p,r.line,'The referenced event ID was not found in the selected project. It may come from vanilla or a dependency; load that as a reference folder before treating this as definite.',{category:'Journal',confidence:'medium',guide:'errors/vic3-journal-events.html'}));
    return out;
  }

  const oldHoi4=analyzeHoi4,oldVic3=analyzeVic3;
  analyzeHoi4=function(texts){return oldHoi4(texts).concat(descriptorChecks(texts),referenceChecks(texts),extraHoi4(texts));};
  analyzeVic3=function(texts){return oldVic3(texts).concat(descriptorChecks(texts),referenceChecks(texts),extraVic3(texts));};

  const originalRender=renderIssues;
  renderIssues=function(issues,meta={}){
    workflow.rawIssues=issues||[];let filtered=workflow.rawIssues.slice();
    if(!workflow.showIgnored)filtered=filtered.filter(x=>!workflow.ignored.has(fp(x)));
    if(workflow.newOnly&&workflow.baseline.size)filtered=filtered.filter(x=>!workflow.baseline.has(fp(x)));
    originalRender(filtered,meta);updateWorkflowCounts();setTimeout(decorateCards,0);
  };
  function rerender(){if(workflow.rawIssues.length)renderIssues(workflow.rawIssues,{mode:'workflow'});else updateWorkflowCounts();}
  function updateWorkflowCounts(){const el=document.querySelector('#workflowNewCount');if(!el)return;if(!workflow.baseline.size){el.textContent='No baseline loaded';return;}const visible=workflow.rawIssues.filter(x=>!workflow.ignored.has(fp(x)));const count=visible.filter(x=>!workflow.baseline.has(fp(x))).length;el.innerHTML=`<span class="new-count">${count}</span> new · ${workflow.ignored.size} ignored`;}

  function actionFor(x){const s=(x.title+' '+x.category).toLowerCase();if(/brace|unexpected|parser|syntax/.test(s))return 'Fix this structure problem first, then relaunch once before investigating later parser messages; many of them may be cascades.';if(/locali[sz]ation|quote/.test(s))return 'Open the reported localization file/key, correct or deduplicate it, then rescan the localization folder before launching the game.';if(/state|province|strategic|map/.test(s))return state.game==='hoi4'?'Validate state/building/strategic-region membership together in debug/nudge. A province moved in one place usually needs matching updates elsewhere.':'Check both source and destination state-region definitions, then reproduce with a fresh error.log before changing unrelated files.';if(/scope|event target/.test(s))return 'Trace the scope immediately before this command or event target. Confirm the object type at each scope transition instead of changing the command blindly.';if(/override|compatibility|version/.test(s))return 'Confirm this override/version mismatch is intentional. Remove copied reference files that your mod does not actually need, then test with only required dependencies.';if(/focus/.test(s))return 'Check the referenced focus ID and the block immediately before the failure. One malformed focus can make later focuses disappear.';if(/journal|event/.test(s))return 'Compare the object and referenced IDs with a known working vanilla/mod example. Avoid guessing Victoria 3 syntax when the reference cannot be resolved.';return 'Open the reported file and line, make the smallest change that addresses this message, then reproduce once and compare the next report.';}
  function findIssueFromCard(card){const title=(card.querySelector('.result-title')?.textContent||card.querySelector('strong')?.textContent||'').trim();const meta=(card.querySelector('.result-meta')?.textContent||'').trim();return workflow.rawIssues.find(x=>x.title===title&&(meta.includes(x.file)||!meta));}
  function decorateCards(){
    document.querySelectorAll('#resultList .result-card').forEach(card=>{if(card.dataset.v3==='1')return;const x=findIssueFromCard(card);if(!x)return;card.dataset.v3='1';const f=fp(x);if(workflow.baseline.size&&!workflow.baseline.has(f))card.classList.add('workflow-new');
      const helper=document.createElement('div');helper.className='issue-helpers';helper.innerHTML=`<span class="confidence-chip">${esc(x.confidence||'medium')} confidence${x.root?' · likely root':''}</span><button class="issue-helper" data-copy>Copy issue</button><button class="issue-helper" data-ignore>${workflow.ignored.has(f)?'Unignore':'Ignore this pattern'}</button>`;card.appendChild(helper);
      helper.querySelector('[data-copy]').addEventListener('click',async e=>{await navigator.clipboard.writeText(`[${profiles[state.game].short}] ${x.title}\n${x.file}:${x.line}\n${x.explanation}`);e.target.textContent='Copied';setTimeout(()=>e.target.textContent='Copy issue',1000);});
      helper.querySelector('[data-ignore]').addEventListener('click',()=>{if(workflow.ignored.has(f))workflow.ignored.delete(f);else workflow.ignored.add(f);saveIgnored();rerender();});
      if(workflow.guided){const a=document.createElement('div');a.className='next-action';a.innerHTML=`<strong>Next action</strong><br>${esc(actionFor(x))}`;card.appendChild(a);}
    });
  }
  const observer=new MutationObserver(()=>decorateCards());
  const startObserver=()=>{const list=document.querySelector('#resultList');if(list)observer.observe(list,{childList:true,subtree:true});};

  injectUI();startObserver();updateWorkflowCounts();
})();
