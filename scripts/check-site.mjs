import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.cwd());
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.name==='.git'||e.name==='node_modules'?[]:e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const files=walk(root);const html=files.filter(f=>f.endsWith('.html'));let failed=false;
for(const file of html){const text=fs.readFileSync(file,'utf8');const ids=[...text.matchAll(/\sid=["']([^"']+)["']/g)].map(m=>m[1]);const dup=[...new Set(ids.filter((x,i)=>ids.indexOf(x)!==i))];if(dup.length){console.error(`${path.relative(root,file)} duplicate ids: ${dup.join(', ')}`);failed=true;}for(const m of text.matchAll(/(?:href|src)=["']([^"'#?]+)["']/g)){const target=m[1];if(/^(?:https?:|mailto:|data:|\/)/.test(target))continue;const resolved=path.resolve(path.dirname(file),target);if(!fs.existsSync(resolved)){console.error(`${path.relative(root,file)} missing internal target: ${target}`);failed=true;}}}
if(failed)process.exit(1);console.log(`Checked ${html.length} HTML files: internal links and duplicate IDs OK.`);
