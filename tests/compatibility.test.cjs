const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../compatibility-engine.js');
function entry(text){return {text};}

test('detects exact-path override and duplicate focus ID',()=>{
  const a=new Map([['common/national_focus/a.txt',entry('focus = { id = DUP }')]]);
  const b=new Map([['common/national_focus/a.txt',entry('focus = { id = DUP x = yes }')],['common/national_focus/b.txt',entry('focus = { id = DUP }')]]);
  const r=E.compare(a,b,'hoi4','unknown');
  assert.ok(r.some(x=>x.kind==='path'));
  assert.ok(r.some(x=>x.kind==='id'&&x.id==='DUP'));
});

test('detects overlapping replace_path',()=>{
  const a=new Map([['descriptor.mod',entry('replace_path = "common/journal_entries"')]]);
  const b=new Map([['descriptor.mod',entry('replace_path = "common"')],['common/journal_entries/x.txt',entry('je_x = { }')]]);
  const r=E.compare(a,b,'vic3','unknown');
  assert.ok(r.some(x=>x.kind==='replace'&&x.severity==='error'));
});

test('does not report descriptor.mod as a normal exact-path collision',()=>{
  const a=new Map([['descriptor.mod',entry('name = "A"')]]);
  const b=new Map([['descriptor.mod',entry('name = "B"')]]);
  const r=E.compare(a,b,'hoi4','unknown');
  assert.equal(r.some(x=>x.kind==='path'&&x.pathA==='descriptor.mod'),false);
});
