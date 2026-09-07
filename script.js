const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const state={game:'hoi4',files:[],fileTexts:new Map(),issues:[],filter:'all',search:'',logFile:null,cancel:false,lastScan:null};
const MAX_FILES=1800,MAX_TOTAL_BYTES=35*1024*1024,MAX_FILE_BYTES=2.5*1024*1024;

const profiles={
  hoi4:{
    name:'Hearts of Iron IV',short:'HOI4',slug:'hoi4',yearTool:true,
    hero:'Scan a Hearts of Iron IV mod folder together with error.log. Paradox Doctor prioritizes common focus, localization, scope and map mistakes instead of dumping raw engine noise back at you.',
    badges:['Focus trees','Localization','Script','Map / states','error.log'],
    research:'HOI4 modders repeatedly run into cascaded parser errors, partial focus-tree loading, localization mistakes, invalid effects/scopes and map/state failures. The scanner prioritizes those patterns and marks heuristic checks clearly.',
    researchPoints:[['Parser cascades','Missing braces often produce many later “unexpected token” errors.'],['Focus trees','One bad block can make everything after it disappear.'],['Map/state','Province overlap, missing state fields and stale map data can crash loading.'],['Localization','Bad headers, duplicate keys and missing focus text remain frequent.']],
    guides:[
      ['Parser','Unexpected token','Why braces and malformed blocks can break everything after one line.','errors/unexpected-token.html'],
      ['Localization','Duplicate localization','Find duplicate keys across multiple localization files.','errors/duplicate-localization.html'],
      ['Scripting','Unknown effect / scope','Separate spelling, context and scope problems.','errors/unknown-effect.html'],
      ['Map','State & province crashes','Check state IDs, province duplication and common map mistakes.','errors/hoi4-map-state.html']
    ],
    logPath:'Documents/Paradox Interactive/Hearts of Iron IV/logs/error.log',
    checklist:['Enable -debug while reproducing a modding issue.','Reproduce the problem once with only the target mod and required dependencies enabled.','Save a fresh error.log before launching again.','Scan the mod folder and error.log together.','Fix the earliest likely root cause, then reproduce again before chasing later cascade errors.']
  },
  vic3:{
    name:'Victoria 3',short:'VIC3',slug:'vic3',yearTool:false,
    hero:'Scan a Victoria 3 mod folder and error.log together. Paradox Doctor focuses on Jomini scope failures, journal/event structure, localization/path mistakes, state-region problems and repeated log noise.',
    badges:['Jomini scopes','Journal entries','Events','Localization','State regions','error.log'],
    research:'Victoria 3 modders frequently struggle with localization paths/encoding, unset or wrong scopes, journal/event scripting, state/map crashes and logs that are difficult to connect back to a mod. Sparse documentation also makes invented syntax a real risk.',
    researchPoints:[['Scope errors','Unset and wrong-scope event targets are recurring log patterns.'],['Localization','Correct path, header, filename and encoding matter.'],['Journal/events','Modders report scarce examples and invalid AI-generated syntax.'],['Compatibility','Crashes and load-order conflicts can be hard to isolate from engine noise.']],
    guides:[
      ['Localization','Localization not showing','Check folder path, header, filename and UTF-8 BOM.','errors/vic3-localization.html'],
      ['Jomini','Unset / wrong scope','Understand event-target and scope failures.','errors/vic3-scope.html'],
      ['Journal','Journal entries & events','Debug structure and references without guessing syntax.','errors/vic3-journal-events.html'],
      ['Map','State-region crashes','Check duplicate province references and incomplete state regions.','errors/vic3-map-state.html']
    ],
    logPath:'Documents/Paradox Interactive/Victoria 3/logs/error.log',
    checklist:['Run Victoria 3 in debug mode when developing scripts.','Reproduce once with only the target mod and required dependencies enabled.','Copy error.log before starting another session if you need to preserve it.','Scan the project folder and log together so paths and IDs can be cross-referenced.','Treat scope errors at the reported location as the failure point, then inspect the referenced object and earlier scope transitions.']
  }
};

function issue(severity,title,file,line,explanation,opts={}){return{severity,title,file:file||'project',line:line||1,explanation,category:opts.category||'General',confidence:opts.confidence||'medium',root:!!opts.root,frequency:opts.frequency||1,game:state.game,guide:opts.guide||null};}
function pathOf(file){return (file.webkitRelativePath||file.name||'').replaceAll('\\','/');}
function fmtBytes(bytes){if(bytes<1024)return`${bytes} B`;if(bytes<1048576)return`${(bytes/1024).toFixed(1)} KB`;return`${(bytes/1048576).toFixed(1)} MB`;}
function escapeMd(s){return String(s).replace(/([*_`])/g,'\\$1');}

function applyGame(game,{showGate=false}={}){
  if(!profiles[game])return; state.game=game; const p=profiles[game]; document.body.dataset.game=game;
  $('#gameSwitch').value=game; $('#heroGameShort').textContent=p.short; $('#heroGameName').textContent=p.name; $('#scannerGameName').textContent=p.name; $('#heroCopy').textContent=p.hero;
  $('#profileBadges').innerHTML=p.badges.map(x=>`<span>${x}</span>`).join('');
  $('#guideHeading').textContent=`Common ${p.short} problems`; $('#guideGrid').innerHTML=p.guides.map(g=>`<a class="guide-card" href="${g[3]}"><span>${g[0]}</span><h3>${g[1]}</h3><p>${g[2]}</p></a>`).join('');
  $('#researchCopy').textContent=p.research; $('#researchPoints').innerHTML=p.researchPoints.map(x=>`<div class="research-point"><strong>${x[0]}</strong><span>${x[1]}</span></div>`).join('');
  $('#reproChecklist').innerHTML=p.checklist.map(x=>`<li>${x}</li>`).join('');
  $('#yearTool').classList.toggle('hidden',!p.yearTool);
  if(state.files.length) updateSelectionUI();
  if(showGate) $('#gameGate').classList.remove('hidden');
}

function initGame(){
  const saved=localStorage.getItem('paradoxDoctorGame');
  if(saved&&profiles[saved]){applyGame(saved);$('#gameGate').classList.add('hidden');}else{applyGame('hoi4');$('#gameGate').classList.remove('hidden');}
}
$$('[data-game-choice]').forEach(b=>b.addEventListener('click',()=>{const g=b.dataset.gameChoice;applyGame(g);if($('#rememberGame').checked)localStorage.setItem('paradoxDoctorGame',g);else localStorage.removeItem('paradoxDoctorGame');$('#gameGate').classList.add('hidden');}));
$('#gameSwitch').addEventListener('change',e=>{applyGame(e.target.value);localStorage.setItem('paradoxDoctorGame',e.target.value);});
$('#changeGameHero').addEventListener('click',()=>$('#gameGate').classList.remove('hidden'));

$$('.tab').forEach(tab=>tab.addEventListener('click',()=>{$$('.tab').forEach(t=>t.classList.remove('active'));$$('.panel').forEach(p=>p.classList.remove('active'));tab.classList.add('active');$(`#${tab.dataset.tab}Panel`).classList.add('active');}));

const fileInput=$('#fileInput'),folderInput=$('#folderInput'),dropZone=$('#dropZone'),scanBtn=$('#scanFilesBtn');
fileInput.addEventListener('change',()=>setFiles([...fileInput.files])); folderInput.addEventListener('change',()=>setFiles([...folderInput.files]));
['dragenter','dragover'].forEach(ev=>dropZone.addEventListener(ev,e=>{e.preventDefault();dropZone.classList.add('dragover')}));
['dragleave','drop'].forEach(ev=>dropZone.addEventListener(ev,e=>{e.preventDefault();dropZone.classList.remove('dragover')}));
dropZone.addEventListener('drop',e=>setFiles([...e.dataTransfer.files]));
function supported(file){return /\.(txt|yml|yaml|log|mod|json|gui|asset|csv)$/i.test(file.name);}
function setFiles(files){
  const usable=files.filter(supported); state.files=usable.slice(0,MAX_FILES); state.fileTexts.clear();
  const total=state.files.reduce((n,f)=>n+f.size,0); $('#fileStatus').textContent=state.files.length?`${state.files.length} supported files selected · ${fmtBytes(total)}`:'No supported project files selected';
  scanBtn.disabled=!state.files.length; updateSelectionUI();
  if(files.length>MAX_FILES)$('#fileStatus').textContent+=` · first ${MAX_FILES} files will be scanned`;
}
function updateSelectionUI(){
  const box=$('#selectionSummary'); if(!state.files.length){box.classList.add('hidden');return;} const paths=state.files.map(pathOf);
  const loc=paths.filter(x=>/\.ya?ml$/i.test(x)).length, scripts=paths.filter(x=>/\.txt$/i.test(x)).length, logs=paths.filter(x=>/\.log$/i.test(x)).length;
  box.innerHTML=`<span>${profiles[state.game].short}</span><span>${scripts} scripts</span><span>${loc} localization</span><span>${logs} logs</span><span>${paths.some(x=>x.includes('/'))?'folder context':'file selection'}</span>`; box.classList.remove('hidden');
}

const logFileInput=$('#logFileInput'),logDropZone=$('#logDropZone'),logInput=$('#logInput');
logFileInput.addEventListener('change',()=>loadLog(logFileInput.files[0]));
['dragenter','dragover'].forEach(ev=>logDropZone.addEventListener(ev,e=>{e.preventDefault();logDropZone.classList.add('dragover')}));
['dragleave','drop'].forEach(ev=>logDropZone.addEventListener(ev,e=>{e.preventDefault();logDropZone.classList.remove('dragover')}));
logDropZone.addEventListener('drop',e=>{const f=[...e.dataTransfer.files].find(x=>/\.(log|txt)$/i.test(x.name));if(f)loadLog(f);});
async function loadLog(file){if(!file)return;state.logFile=file;logInput.value=await file.text();$('#logFileStatus').textContent=`Loaded ${file.name} · ${fmtBytes(file.size)}`;logDropZone.querySelector('strong').textContent=file.name;}
$('#scanLogBtn').addEventListener('click',()=>{const out=analyzeLog(logInput.value,state.logFile?.name||'error.log');renderIssues(out,{mode:'error.log'});});

scanBtn.addEventListener('click',scanProject); $('#cancelScanBtn').addEventListener('click',()=>state.cancel=true);
async function scanProject(){
  state.cancel=false; const totalBytes=state.files.reduce((n,f)=>n+f.size,0); if(totalBytes>MAX_TOTAL_BYTES){renderIssues([issue('warning','Project selection is too large for a safe browser scan','project',1,`Selected files total ${fmtBytes(totalBytes)}. Select the mod's text/script/localization folders or reduce the selection below ${fmtBytes(MAX_TOTAL_BYTES)}.`,{root:true,category:'Performance'})],{mode:'project'});return;}
  showProgress(0,'Reading project files…'); const texts=new Map(); let done=0;
  for(const file of state.files){if(state.cancel){hideProgress();return;} if(file.size<=MAX_FILE_BYTES){try{texts.set(pathOf(file),await file.text());}catch{}} done++; if(done%20===0||done===state.files.length){showProgress((done/state.files.length)*55,`Reading ${done}/${state.files.length} files…`);await new Promise(r=>setTimeout(r,0));}}
  state.fileTexts=texts; showProgress(60,'Running common structure checks…'); let out=analyzeCommon(texts);
  showProgress(72,`Running ${profiles[state.game].short} checks…`); out.push(...(state.game==='hoi4'?analyzeHoi4(texts):analyzeVic3(texts)));
  if(logInput.value.trim()){showProgress(88,'Connecting error.log patterns…');out.push(...analyzeLog(logInput.value,state.logFile?.name||'error.log'));}
  showProgress(96,'Prioritizing likely root causes…');out=prioritizeIssues(out); hideProgress(); renderIssues(out,{mode:'project + log'});
}
function showProgress(p,text){$('#scanProgress').classList.remove('hidden');$('#progressBar').style.width=`${Math.max(0,Math.min(100,p))}%`;$('#progressText').textContent=text;}
function hideProgress(){$('#scanProgress').classList.add('hidden');$('#progressBar').style.width='0%';}

function stripComments(line){const idx=line.indexOf('#');return idx>=0?line.slice(0,idx):line;}
function braceBalance(text){let d=0,min=0;const clean=text.replace(/"(?:\\.|[^"\\])*"/g,'""').split(/\r?\n/);for(let i=0;i<clean.length;i++){const line=stripComments(clean[i]);for(const ch of line){if(ch==='{')d++;else if(ch==='}')d--;min=Math.min(min,d);}if(d<0)return{balance:d,line:i+1,earlyClose:true};}return{balance:d,line:clean.length,min};}
function analyzeCommon(texts){
  const out=[],globalLoc=new Map();
  for(const [path,text] of texts){
    if(/\.txt$/i.test(path)){const b=braceBalance(text);if(b.earlyClose)out.push(issue('error','Closing brace without matching opening brace',path,b.line,'A block closes before a matching opening brace exists. Parser errors after this line are likely cascades.',{root:true,confidence:'high',category:'Syntax'}));else if(b.balance!==0)out.push(issue('error',`Unbalanced braces (${b.balance>0?`${b.balance} unclosed`:`${Math.abs(b.balance)} extra closing`})`,path,b.line,'Fix brace balance before investigating later parser messages in this file.',{root:true,confidence:'high',category:'Syntax'}));}
    if(/\.ya?ml$/i.test(path))out.push(...analyzeLocalizationFile(text,path,globalLoc));
  }
  for(const [key,defs] of globalLoc){if(defs.length>1){const first=defs[0],rest=defs.slice(1);out.push(issue('error',`Duplicate localization key across files: ${key}`,first.path,first.line,`Defined ${defs.length} times: ${defs.map(d=>d.path+':'+d.line).join(', ')}. Keep the intended definition or use unique keys.`,{root:true,confidence:'high',category:'Localization',frequency:defs.length}));}}
  return out;
}
function analyzeLocalizationFile(text,path,globalLoc){
  const out=[],rawLines=text.replace(/^\uFEFF/,'').split(/\r?\n/); if(text&&text.charCodeAt(0)!==0xFEFF)out.push(issue('warning','Localization file has no UTF-8 BOM',path,1,'Paradox localization is commonly expected as UTF-8 with BOM. If text does not load, re-save with BOM.',{category:'Localization'}));
  const first=rawLines.findIndex(x=>x.trim()&&!x.trim().startsWith('#')); if(first>=0&&!/^\s*l_[a-z_]+:\s*$/i.test(rawLines[first]))out.push(issue('error','Missing or malformed localization language header',path,first+1,'The first non-comment line should look like l_english: or another valid language header.',{root:true,confidence:'high',category:'Localization'}));
  rawLines.forEach((raw,i)=>{const line=raw.trim();if(!line||line.startsWith('#')||/^l_[a-z_]+:\s*$/i.test(line))return;const m=raw.match(/^\s*([^\s:#]+)\s*:\s*(\d+)?\s*"(.*)"\s*(?:#.*)?$/);if(m){const key=m[1],arr=globalLoc.get(key)||[];arr.push({path,line:i+1});globalLoc.set(key,arr);const quotes=(raw.match(/"/g)||[]).length;if(quotes%2)out.push(issue('error','Unbalanced quotes in localization value',path,i+1,'A double quote appears unmatched on this line.',{root:true,category:'Localization'}));}else if(line.includes(':'))out.push(issue('warning','Suspicious localization entry',path,i+1,'This line does not match the usual key:0 "Text" structure. Check quotes, colon placement and accidental characters.',{category:'Localization'}));});
  return out;
}

function analyzeHoi4(texts){
  const out=[],locKeys=new Set(),focusDefs=new Map(),stateIds=new Map(),provinceOwners=new Map(),strategicProv=new Map();
  for(const [path,text] of texts){if(/\.ya?ml$/i.test(path)){for(const m of text.matchAll(/^\s*([^\s:#]+)\s*:/gm))locKeys.add(m[1]);}}
  for(const [path,text] of texts){
    if(/common\/national_focus\/.*\.txt$/i.test(path)||/national_focus/i.test(path)){
      for(const m of text.matchAll(/\bfocus\s*=\s*\{[\s\S]*?\bid\s*=\s*([A-Za-z0-9_.:-]+)/g)){const id=m[1],line=text.slice(0,m.index).split(/\r?\n/).length,arr=focusDefs.get(id)||[];arr.push({path,line});focusDefs.set(id,arr);if(!locKeys.has(id))out.push(issue('warning',`Missing focus localization: ${id}`,path,line,`No localization key named ${id} was found in the selected project.`,{category:'Focus'}));if(!locKeys.has(id+'_desc'))out.push(issue('info',`Missing focus description localization: ${id}_desc`,path,line,'The focus may show without a description or display a raw key.',{category:'Focus'}));}
      if(/completion_reward\s*=\s*\{[\s\S]*?\bmodifier\s*=\s*\{/i.test(text))out.push(issue('warning','Direct modifier block inside focus completion_reward',path,1,'HOI4 commonly expects an effect such as adding an idea/dynamic modifier rather than a bare modifier block in completion_reward. Verify this against current game syntax.',{category:'Focus',guide:'errors/unknown-effect.html'}));
    }
    if(/history\/states\/.*\.txt$/i.test(path)){
      const idm=text.match(/\bid\s*=\s*(\d+)/),provm=text.match(/\bprovinces\s*=\s*\{([^}]*)\}/s); if(!idm)out.push(issue('error','State file has no id',path,1,'Every HOI4 state definition needs a state ID.',{root:true,category:'Map'})); else{const id=idm[1],arr=stateIds.get(id)||[];arr.push(path);stateIds.set(id,arr);} if(!/\bstate_category\s*=/.test(text))out.push(issue('warning','State has no state_category',path,1,'A state without a category is suspicious and may not behave correctly.',{category:'Map'})); if(!provm)out.push(issue('error','State has no provinces block',path,1,'A state definition should assign provinces.',{root:true,category:'Map'})); else{for(const p of provm[1].match(/\d+/g)||[]){const arr=provinceOwners.get(p)||[];arr.push(path);provinceOwners.set(p,arr);}} if(!/\bhistory\s*=\s*\{/.test(text))out.push(issue('warning','State has no history block',path,1,'New states usually need a valid history block. Missing state setup is a common source of load failures.',{category:'Map'})); if(!/\bbuildings\s*=\s*\{/.test(text))out.push(issue('info','State has no buildings block',path,1,'This can be intentional, but newly created states that crash during map loading are worth checking for valid building/state setup.',{category:'Map'}));
    }
    if(/map\/strategicregions\/.*\.txt$/i.test(path)){const m=text.match(/\bprovinces\s*=\s*\{([^}]*)\}/s);if(m)for(const p of m[1].match(/\d+/g)||[]){const arr=strategicProv.get(p)||[];arr.push(path);strategicProv.set(p,arr);}}
  }
  for(const [id,defs] of focusDefs)if(defs.length>1)out.push(issue('error',`Duplicate focus ID: ${id}`,defs[0].path,defs[0].line,`The focus ID appears ${defs.length} times across the selected project.`,{root:true,category:'Focus',frequency:defs.length}));
  for(const [id,paths] of stateIds)if(paths.length>1)out.push(issue('error',`Duplicate state ID: ${id}`,paths[0],1,`State ID ${id} appears in ${paths.length} files.`,{root:true,category:'Map',frequency:paths.length}));
  for(const [p,paths] of provinceOwners)if(paths.length>1)out.push(issue('error',`Province ${p} belongs to multiple states`,paths[0],1,paths.join(', '),{root:true,category:'Map',frequency:paths.length,guide:'errors/hoi4-map-state.html'}));
  for(const [p,paths] of strategicProv)if(paths.length>1)out.push(issue('error',`Province ${p} appears in multiple strategic regions`,paths[0],1,paths.join(', '),{root:true,category:'Map',frequency:paths.length,guide:'errors/hoi4-map-state.html'}));
  return out;
}

function analyzeVic3(texts){
  const out=[],locKeys=new Set(),jeDefs=new Map(),eventIds=new Map(),stateRegions=new Map(),provinceRegions=new Map();
  for(const [path,text] of texts){if(/\.ya?ml$/i.test(path)){for(const m of text.matchAll(/^\s*([^\s:#]+)\s*:/gm))locKeys.add(m[1]);if(!/(^|\/)localization\//i.test(path))out.push(issue('info','Victoria 3 localization file is outside a localization folder',path,1,'Victoria 3 normally loads localization from the expected localization language-folder structure. Check the project path if this text is not appearing.',{category:'Localization'}));}}
  for(const [path,text] of texts){
    if(/common\/journal_entries\/.*\.txt$/i.test(path)){for(const m of text.matchAll(/^\s*(je_[A-Za-z0-9_.:-]+)\s*=\s*\{/gm)){const id=m[1],line=text.slice(0,m.index).split(/\r?\n/).length,arr=jeDefs.get(id)||[];arr.push({path,line});jeDefs.set(id,arr);if(!locKeys.has(id))out.push(issue('warning',`Journal entry localization may be missing: ${id}`,path,line,'No matching localization key was found in the selected project. Verify the title/name key used by this journal entry.',{category:'Journal'}));}}
    if(/events\/.*\.txt$/i.test(path)){for(const m of text.matchAll(/\bid\s*=\s*([A-Za-z0-9_]+\.\d+)/g)){const id=m[1],line=text.slice(0,m.index).split(/\r?\n/).length,arr=eventIds.get(id)||[];arr.push({path,line});eventIds.set(id,arr);}}
    if(/map_data\/state_regions\/.*\.txt$/i.test(path)||/common\/state_regions\/.*\.txt$/i.test(path)){for(const m of text.matchAll(/^\s*(STATE_[A-Za-z0-9_]+)\s*=\s*\{([\s\S]*?)(?=^\s*STATE_|\s*$)/gm)){const id=m[1],body=m[2],line=text.slice(0,m.index).split(/\r?\n/).length,arr=stateRegions.get(id)||[];arr.push({path,line});stateRegions.set(id,arr);const prov=body.match(/\bprovinces\s*=\s*\{([^}]*)\}/s);if(!prov)out.push(issue('error',`State region ${id} has no provinces block`,path,line,'A state region without province membership is suspicious and can contribute to map-loading failures.',{root:true,category:'Map'}));else for(const token of prov[1].match(/x[0-9a-fA-F]+|\d+/g)||[]){const a=provinceRegions.get(token)||[];a.push(`${path}:${line}`);provinceRegions.set(token,a);}}}
    if(/history\//i.test(path)&&!/\.txt$/i.test(path))out.push(issue('warning','Unexpected file extension in history folder',path,1,'Victoria 3 history overrides are path-sensitive. Verify the filename and extension match what the game expects.',{category:'Paths'}));
  }
  for(const [id,defs] of jeDefs)if(defs.length>1)out.push(issue('error',`Duplicate journal entry key: ${id}`,defs[0].path,defs[0].line,`The journal entry key appears ${defs.length} times.`,{root:true,category:'Journal',frequency:defs.length}));
  for(const [id,defs] of eventIds)if(defs.length>1)out.push(issue('error',`Duplicate event ID: ${id}`,defs[0].path,defs[0].line,`Event ID ${id} appears ${defs.length} times.`,{root:true,category:'Events',frequency:defs.length}));
  for(const [id,defs] of stateRegions)if(defs.length>1)out.push(issue('error',`Duplicate state region: ${id}`,defs[0].path,defs[0].line,`The state region is defined ${defs.length} times in the selected project.`,{root:true,category:'Map'}));
  for(const [p,defs] of provinceRegions)if(defs.length>1)out.push(issue('warning',`Province token ${p} appears in multiple state regions`,defs[0].split(':')[0],1,defs.join(', '),{root:true,category:'Map',frequency:defs.length,guide:'errors/vic3-map-state.html'}));
  return out;
}

function analyzeLog(text,file){
  if(!text.trim())return[]; const raw=[],profile=state.game; const lines=text.split(/\r?\n/);
  lines.forEach((line,i)=>{const low=line.toLowerCase(),n=i+1; if(!line.trim())return;
    if(low.includes('unexpected token')||low.includes('unexpected characters'))raw.push(issue('error','Parser encountered unexpected input',file,n,extractEngineMessage(line),{root:true,confidence:'high',category:'Syntax',guide:'errors/unexpected-token.html'}));
    else if(low.includes('duplicate localization found'))raw.push(issue('error','Duplicate localization reported by engine',file,n,extractEngineMessage(line),{root:true,confidence:'high',category:'Localization',guide:'errors/duplicate-localization.html'}));
    else if(low.includes('unknown effect')||low.includes('unknown trigger')||low.includes('invalid effect'))raw.push(issue('error','Unknown or invalid script command',file,n,extractEngineMessage(line),{root:true,confidence:'high',category:'Scripting',guide:profile==='vic3'?'errors/vic3-scope.html':'errors/unknown-effect.html'}));
    else if(low.includes('wrong scope')||low.includes('unset scope')||low.includes('returned an invalid object')||low.includes('event target link'))raw.push(issue('error','Scope or event-target failure',file,n,extractEngineMessage(line),{root:true,confidence:'high',category:'Scope',guide:profile==='vic3'?'errors/vic3-scope.html':'errors/unknown-effect.html'}));
    else if(low.includes('failed to read key reference')||low.includes('could not find')||low.includes('not found')||low.includes('failed to find'))raw.push(issue('warning','Missing or unresolved reference',file,n,extractEngineMessage(line),{category:'References'}));
    else if(profile==='hoi4'&&(low.includes('map definition error')||low.includes('strategic region')&&low.includes('duplicate')||low.includes('province')&&low.includes('state')))raw.push(issue('error','Map/state validation error',file,n,extractEngineMessage(line),{root:true,category:'Map',guide:'errors/hoi4-map-state.html'}));
    else if(profile==='vic3'&&(low.includes('assertion failed')||low.includes('state region')||low.includes('spline')&&low.includes('not found')))raw.push(issue('warning','Possible Victoria 3 map/state failure',file,n,extractEngineMessage(line),{category:'Map',guide:'errors/vic3-map-state.html'}));
    else if(/\b(error|exception|invalid)\b/i.test(line))raw.push(issue('warning','Unclassified engine error',file,n,extractEngineMessage(line),{category:'Engine'}));
  });
  const grouped=new Map(); for(const x of raw){const signature=[x.title,normalizeLogMessage(x.explanation)].join('|');const existing=grouped.get(signature);if(existing)existing.frequency++;else grouped.set(signature,{...x});}
  const out=[...grouped.values()]; if(!out.length)out.push(issue('info','No supported error patterns recognized',file,1,'The log contains text, but no currently supported high-signal pattern was detected. This does not prove the mod is error-free.',{category:'Log'}));
  return prioritizeIssues(out);
}
function extractEngineMessage(line){return line.replace(/^\[[^\]]+\](?:\[[^\]]+\])*(?:\[[^\]]+\])?\s*/,'').trim().slice(0,520);}
function normalizeLogMessage(s){return s.toLowerCase().replace(/line\s*:?\s*\d+/g,'line').replace(/\d+/g,'#').slice(0,220);}
function prioritizeIssues(items){
  const rank={root:0,error:1,warning:2,info:3}; const seen=new Map(),result=[];
  for(const x of items){const key=[x.title,x.file,x.line,x.explanation].join('|');if(seen.has(key)){seen.get(key).frequency+=x.frequency||1;}else{const y={...x};seen.set(key,y);result.push(y);}}
  result.sort((a,b)=>(a.root?0:rank[a.severity])-(b.root?0:rank[b.severity])||(b.frequency||1)-(a.frequency||1)); return result;
}

function scoreIssues(items){let score=100;for(const x of items){if(x.root)score-=14;else if(x.severity==='error')score-=8;else if(x.severity==='warning')score-=3;else score-=.5;}return Math.max(0,Math.round(score));}
function renderIssues(items,meta={}){
  state.issues=prioritizeIssues(items); state.lastScan={game:state.game,mode:meta.mode||'scan',at:new Date().toISOString(),score:scoreIssues(state.issues)}; $('#results').classList.remove('hidden');
  const counts={root:0,error:0,warning:0,info:0};state.issues.forEach(x=>{if(x.root)counts.root++;counts[x.severity]++;}); const score=state.lastScan.score;
  $('#healthScore').textContent=score;$('#criticalCount').textContent=`${counts.root} likely root${counts.root===1?'':'s'}`;$('#errorCount').textContent=`${counts.error} errors`;$('#warningCount').textContent=`${counts.warning} warnings`;$('#infoCount').textContent=`${counts.info} notes`;
  $('#scanSummary').textContent=`${profiles[state.game].name} · ${meta.mode||'scan'} · ${state.files.length||0} project files${logInput.value.trim()?' + log':''}`;
  renderNextSteps(); renderIssueList(); saveHistory(counts,score); $('#results').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderNextSteps(){const roots=state.issues.filter(x=>x.root).slice(0,3),box=$('#nextSteps');if(!roots.length){box.classList.add('hidden');return;}box.innerHTML=`<h3>Start here</h3><ol>${roots.map(x=>`<li><strong>${x.title}</strong> — ${x.file}${x.line?`:${x.line}`:''}</li>`).join('')}</ol>`;box.classList.remove('hidden');}
function renderIssueList(){
  const q=state.search.toLowerCase(),list=$('#resultList');list.innerHTML='';let shown=state.issues.filter(x=>state.filter==='all'||(state.filter==='root'?x.root:x.severity===state.filter)).filter(x=>!q||`${x.title} ${x.file} ${x.explanation} ${x.category}`.toLowerCase().includes(q));
  if(!shown.length){list.innerHTML='<article class="result-card"><strong>No matching findings</strong><p>Try another filter or search term.</p></article>';return;}
  shown.slice(0,500).forEach(x=>{const card=document.createElement('article');card.className=`result-card ${x.root?'root':''}`;const badge=x.root?'root':x.severity;card.innerHTML=`<div class="result-top"><span class="result-title"></span><span class="badge ${badge}">${x.root?'likely root':x.severity}</span></div><div class="result-meta"></div><p></p>`;card.querySelector('.result-title').textContent=x.title+(x.frequency>1?` ×${x.frequency}`:'');card.querySelector('.result-meta').textContent=`${x.category} · ${x.file}:${x.line} · ${x.confidence} confidence`;card.querySelector('p').textContent=x.explanation;if(x.guide){const a=document.createElement('a');a.className='inline-link';a.href=x.guide;a.textContent='Open related guide →';card.appendChild(a);}list.appendChild(card);});
  if(shown.length>500){const note=document.createElement('div');note.className='muted small';note.textContent=`Showing first 500 of ${shown.length} findings. Export the report for the complete list.`;list.appendChild(note);}
}
$$('.filter').forEach(b=>b.addEventListener('click',()=>{$$('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.filter=b.dataset.filter;renderIssueList();}));
$('#resultSearch').addEventListener('input',e=>{state.search=e.target.value;renderIssueList();});

function makeMarkdown(){const s=state.lastScan||{game:state.game,mode:'scan',at:new Date().toISOString(),score:scoreIssues(state.issues)};let md=`# Paradox Doctor report\n\n- Game: ${profiles[s.game].name}\n- Mode: ${s.mode}\n- Score: ${s.score}/100\n- Generated: ${s.at}\n- Findings: ${state.issues.length}\n\n`;for(const x of state.issues)md+=`## ${x.root?'[Likely root] ':''}${escapeMd(x.title)}\n- Severity: ${x.severity}\n- Category: ${x.category}\n- Location: ${escapeMd(x.file)}:${x.line}\n- Repeats: ${x.frequency}\n\n${escapeMd(x.explanation)}\n\n`;return md;}
function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);}
$('#exportMarkdownBtn').addEventListener('click',()=>download(`paradox-doctor-${state.game}.md`,makeMarkdown(),'text/markdown'));
$('#exportJsonBtn').addEventListener('click',()=>download(`paradox-doctor-${state.game}.json`,JSON.stringify({scan:state.lastScan,issues:state.issues},null,2),'application/json'));
$('#copyReportBtn').addEventListener('click',async()=>{await navigator.clipboard.writeText(makeMarkdown());flashButton($('#copyReportBtn'),'Copied');});
function flashButton(btn,text){const old=btn.textContent;btn.textContent=text;setTimeout(()=>btn.textContent=old,1200);}

function saveHistory(counts,score){const key='paradoxDoctorHistoryV2';let h=[];try{h=JSON.parse(localStorage.getItem(key)||'[]')}catch{}h.unshift({at:new Date().toISOString(),game:state.game,score,root:counts.root,error:counts.error,warning:counts.warning});h=h.slice(0,9);localStorage.setItem(key,JSON.stringify(h));renderHistory();}
function renderHistory(){const key='paradoxDoctorHistoryV2';let h=[];try{h=JSON.parse(localStorage.getItem(key)||'[]')}catch{}const sec=$('#recent'),list=$('#historyList');if(!h.length){sec.classList.add('hidden');return;}sec.classList.remove('hidden');list.innerHTML=h.map(x=>`<div class="history-item"><strong>${profiles[x.game]?.short||x.game} · ${x.score}/100</strong><span>${new Date(x.at).toLocaleString()}</span><span>${x.root} likely roots · ${x.error} errors · ${x.warning} warnings</span></div>`).join('');}
$('#clearHistoryBtn').addEventListener('click',()=>{localStorage.removeItem('paradoxDoctorHistoryV2');renderHistory();});

$('#transformYearsBtn').addEventListener('click',()=>{const input=$('#yearInput').value,off=Number($('#yearOffset').value)||0,min=Number($('#yearMin').value)||0,max=Number($('#yearMax').value)||9999;const output=input.replace(/\b(\d{4})\b/g,(full,y,idx,str)=>{const year=Number(y);if(year<min||year>max)return full;const ctx=str.slice(Math.max(0,idx-30),idx+15);return/(year\s*=|date\s*[<>=]|\b\d{4}[.\/-])/i.test(ctx)?String(year+off):full;});$('#yearOutput').value=output;$('#copyYearsBtn').disabled=!output;});
$('#copyYearsBtn').addEventListener('click',async()=>{await navigator.clipboard.writeText($('#yearOutput').value);flashButton($('#copyYearsBtn'),'Copied');});
$('#copyChecklistBtn').addEventListener('click',async()=>{await navigator.clipboard.writeText(profiles[state.game].checklist.map((x,i)=>`${i+1}. ${x}`).join('\n'));flashButton($('#copyChecklistBtn'),'Copied');});

const dialog=$('#tipsDialog');$('#showLogTips').addEventListener('click',()=>{$('#tipsDialogContent').innerHTML=`<p>Typical location:</p><p><code>${profiles[state.game].logPath}</code></p><p class="muted">Generate a fresh log by reproducing the issue, then copy or upload it before another launch changes the log.</p>`;dialog.showModal();});$('#closeTips').addEventListener('click',()=>dialog.close());

initGame();renderHistory();
