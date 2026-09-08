'use strict';

(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.CompatibilityEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const TEXT_RE=/\.(txt|yml|yaml|mod|gui|asset|csv|json)$/i;
  function normalizePath(path){return String(path||'').replaceAll('\\','/').replace(/^\/+|\/+$/g,'');}
  function relativeProjectPath(file){
    const raw=normalizePath(file.webkitRelativePath||file.name||'');
    const parts=raw.split('/');
    return parts.length>1?parts.slice(1).join('/'):raw;
  }
  function supportedFile(file){return TEXT_RE.test(file?.name||'');}
  function lineAt(text,index){return String(text).slice(0,Math.max(0,index)).split(/\r?\n/).length;}
  function isDescriptorPath(path){return /(?:^|\/)(?:descriptor\.mod|[^/]+\.mod)$/i.test(normalizePath(path));}
  function locKeys(text,path){
    const out=[];
    for(const m of String(text).matchAll(/^\s*([^\s:#]+)\s*:/gm)){
      if(/^l_[a-z_]+$/i.test(m[1])) continue;
      out.push({id:m[1],path,line:lineAt(text,m.index)});
    }
    return out;
  }
  function idsFor(text,path,game){
    const out=[]; const add=(type,re)=>{for(const m of String(text).matchAll(re))out.push({type,id:m[1],path,line:lineAt(text,m.index)});};
    if(game==='hoi4'){
      if(/common\/national_focus\/.*\.txt$/i.test(path)) add('focus',/\bfocus\s*=\s*\{[\s\S]*?\bid\s*=\s*([A-Za-z0-9_.:-]+)/g);
      if(/events\/.*\.txt$/i.test(path)) add('event',/\bid\s*=\s*([A-Za-z0-9_]+\.\d+)/g);
      if(/history\/states\/.*\.txt$/i.test(path)) add('state',/\bid\s*=\s*(\d+)/g);
    }else{
      if(/common\/journal_entries\/.*\.txt$/i.test(path)) add('journal',/^\s*(je_[A-Za-z0-9_.:-]+)\s*=\s*\{/gm);
      if(/events\/.*\.txt$/i.test(path)) add('event',/\bid\s*=\s*([A-Za-z0-9_]+\.\d+)/g);
      if(/(?:map_data|common)\/state_regions\/.*\.txt$/i.test(path)) add('state region',/^\s*(STATE_[A-Za-z0-9_]+)\s*=\s*\{/gm);
    }
    return out;
  }
  function replacePaths(text,path){
    if(!isDescriptorPath(path)) return [];
    const out=[];
    for(const m of String(text).matchAll(/\breplace_path\s*=\s*"([^"]+)"/gi)) out.push(normalizePath(m[1]));
    return out;
  }
  function pathRisk(path,game){
    const p=normalizePath(path).toLowerCase();
    const rules=game==='hoi4'?
      [[/history\/states\//,'Map/state'],[/map\/strategicregions\//,'Map/strategic region'],[/map\/definition\.csv$/,'Map/definition'],[/common\/national_focus\//,'Focus tree'],[/events\//,'Events'],[/common\/(ideas|decisions|scripted_)/,'Shared scripted content'],[/locali[sz]ation\//,'Localization']]:
      [[/(?:map_data|common)\/state_regions\//,'State region'],[/common\/journal_entries\//,'Journal entries'],[/events\//,'Events'],[/common\/scripted_/,'Shared scripted content'],[/common\/(laws|buildings|production_methods)\//,'Core objects'],[/localization\//,'Localization']];
    for(const [re,label] of rules) if(re.test(p)) return label;
    return 'Project file';
  }
  function indexEntries(entries,game){
    const paths=new Map(), loc=new Map(), ids=new Map(), replace=[];
    for(const [path,entry] of entries){
      const rel=normalizePath(path); paths.set(rel,entry);
      if(/\.ya?ml$/i.test(rel)) for(const x of locKeys(entry.text,rel)){const arr=loc.get(x.id)||[];arr.push(x);loc.set(x.id,arr);}
      for(const x of idsFor(entry.text,rel,game)){const k=`${x.type}|${x.id}`,arr=ids.get(k)||[];arr.push(x);ids.set(k,arr);}
      for(const p of replacePaths(entry.text,rel)) replace.push({path:p,source:rel});
    }
    return {paths,loc,ids,replace};
  }
  function underReplace(path,replacePath){
    const p=normalizePath(path).toLowerCase(),r=normalizePath(replacePath).toLowerCase();
    return p===r||p.startsWith(r+'/');
  }
  function make(kind,severity,title,detail,opts={}){
    return {kind,severity,title,detail,confidence:opts.confidence||'high',pathA:opts.pathA||null,pathB:opts.pathB||null,id:opts.id||null,category:opts.category||'Compatibility',action:opts.action||null};
  }
  function compare(entriesA,entriesB,game='hoi4',loadOrder='unknown'){
    const a=indexEntries(entriesA,game),b=indexEntries(entriesB,game),out=[];
    for(const [path,ea] of a.paths){
      if(isDescriptorPath(path)||!b.paths.has(path)) continue;
      const eb=b.paths.get(path); const same=ea.text===eb.text; const subsystem=pathRisk(path,game);
      if(same) out.push(make('path','info',`Both mods contain the same file: ${path}`,'The file contents are identical in the selected versions. It is redundant but not necessarily harmful.',{pathA:path,pathB:path,category:'File overrides',action:'Keep only one copy when practical, especially if the file was copied from a dependency as a template.'}));
      else {
        const winner=loadOrder==='a-first'?'Mod B likely wins':loadOrder==='b-first'?'Mod A likely wins':'load order decides which file wins';
        out.push(make('path','warning',`Both mods change the same path: ${path}`,`${subsystem}. The files differ, so ${winner}.`,{confidence:'high',pathA:path,pathB:path,category:'File overrides',action:'Compare the two files and decide whether one should intentionally override the other or whether the definitions should be merged.'}));
      }
    }
    for(const [key,defsA] of a.loc){if(!b.loc.has(key))continue;const defsB=b.loc.get(key);out.push(make('localization','warning',`Both mods define localization key: ${key}`,'Only one value will be visible for the same language/key after load-order resolution. This is often intentional for overrides.',{confidence:'high',pathA:defsA[0].path,pathB:defsB[0].path,id:key,category:'Localization',action:'Confirm the override is intentional and that the winning text belongs to the intended mod/load order.'}));}
    for(const [k,defsA] of a.ids){if(!b.ids.has(k))continue;const defsB=b.ids.get(k),[type,id]=k.split('|');out.push(make('id','error',`Both mods define ${type} ID: ${id}`,`The same ${type} identifier is defined by both selected mods. This can cause replacement, duplicate-object errors, or inconsistent references depending on the engine object.`,{confidence:'high',pathA:defsA[0].path,pathB:defsB[0].path,id,category:'Duplicate IDs',action:'Rename one object and update its references, or intentionally consolidate the override into one authoritative definition.'}));}
    for(const ra of a.replace){
      for(const rb of b.replace){if(underReplace(ra.path,rb.path)||underReplace(rb.path,ra.path))out.push(make('replace','error',`replace_path overlap: ${ra.path} ↔ ${rb.path}`,'Both mods replace overlapping content trees. One mod can hide large parts of the other regardless of individual file IDs.',{confidence:'high',pathA:ra.source,pathB:rb.source,category:'replace_path',action:'Avoid overlapping replace_path scopes when the mods must work together, or create a dedicated compatibility patch.'}));}
      for(const path of b.paths.keys())if(!isDescriptorPath(path)&&underReplace(path,ra.path))out.push(make('replace','warning',`Mod A replace_path can hide Mod B file: ${path}`,`Mod A declares replace_path = "${ra.path}".`,{confidence:'high',pathA:ra.source,pathB:path,category:'replace_path',action:'Check load order and whether Mod B content inside this replaced path needs to be merged into a compatibility patch.'}));
    }
    for(const rb of b.replace)for(const path of a.paths.keys())if(!isDescriptorPath(path)&&underReplace(path,rb.path))out.push(make('replace','warning',`Mod B replace_path can hide Mod A file: ${path}`,`Mod B declares replace_path = "${rb.path}".`,{confidence:'high',pathA:path,pathB:rb.source,category:'replace_path',action:'Check load order and whether Mod A content inside this replaced path needs to be merged into a compatibility patch.'}));
    const uniq=new Map();
    for(const x of out){const k=[x.kind,x.title,x.pathA,x.pathB].join('|');if(!uniq.has(k))uniq.set(k,x);}
    const rank={error:0,warning:1,info:2};
    return [...uniq.values()].sort((x,y)=>rank[x.severity]-rank[y.severity]||x.title.localeCompare(y.title));
  }
  return {normalizePath,relativeProjectPath,supportedFile,isDescriptorPath,locKeys,idsFor,replacePaths,pathRisk,indexEntries,compare};
});
