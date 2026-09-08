import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function contextFor(game='hoi4'){
  const context={console,state:{game,gameVersion:'',scanCoverage:[]},lineAt:(t,i)=>t.slice(0,Math.max(0,i)).split(/\r?\n/).length,makeFinding:(severity,title,file,line,explanation,opts={})=>({severity,title,file,line,explanation,...opts})};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('app-game-checks.js','utf8'),context);
  return context;
}

test('brace checker ignores braces inside strings and comments',()=>{
  const c=contextFor();
  assert.equal(c.analyzeBraces('root = { text = "}" # }\n value = yes\n}','x.txt').length,0);
});

test('brace checker reports an unclosed block as a high-confidence root',()=>{
  const c=contextFor();
  const r=c.analyzeBraces('root = {\n value = yes','x.txt');
  assert.equal(r.length,1); assert.equal(r[0].root,true); assert.equal(r[0].confidence,'high');
});

test('localization checker detects a duplicate key in one file',()=>{
  const c=contextFor(); const g=new Map();
  const r=c.analyzeLocalization({text:'l_english:\n key:0 "One"\n key:0 "Two"',path:'localization/english/test_l_english.yml',bom:true},g);
  assert.ok(r.some(x=>x.title.includes('Duplicate localization key in file')));
});

test('HOI4 detects duplicate focus IDs across files',()=>{
  const c=contextFor('hoi4');
  const entries=new Map([
    ['common/national_focus/a.txt',{text:'focus = { id = DUP }'}],
    ['common/national_focus/b.txt',{text:'focus = { id = DUP }'}],
    ['localisation/english/a_l_english.yml',{text:'l_english:\n DUP:0 "D"\n DUP_desc:0 "D"'}]
  ]);
  const r=c.analyzeHoi4(entries);
  assert.ok(r.some(x=>x.title==='Duplicate focus ID: DUP'&&x.confidence==='high'));
});

test('Victoria 3 detects duplicate journal entry keys',()=>{
  const c=contextFor('vic3');
  const entries=new Map([
    ['common/journal_entries/a.txt',{text:'je_same = { }'}],
    ['common/journal_entries/b.txt',{text:'je_same = { }'}]
  ]);
  const r=c.analyzeVic3(entries);
  assert.ok(r.some(x=>x.title==='Duplicate journal entry key: je_same'));
});

test('supported_version wildcard matching works',()=>{
  const c=contextFor();
  assert.equal(c.versionMatches('1.17.*','1.17.4'),true);
  assert.equal(c.versionMatches('1.17.*','1.18.0'),false);
});
