"""Inventory every project file by reading its bytes; verify formats and local imports.
This is mechanical coverage, NOT a manual editorial review of each sentence.
Produces AUDIT-R12-EVIDENCE/file-inventory.csv and source-integrity.json.
"""
from pathlib import Path
import csv,hashlib,json,re,collections,xml.etree.ElementTree as ET
from PIL import Image
root=Path(__file__).resolve().parents[1]
out=root/'AUDIT-R12-EVIDENCE';out.mkdir(exist_ok=True)
excluded={out.resolve()}
files=sorted(p for p in root.rglob('*') if p.is_file() and not any(d in p.resolve().parents for d in excluded))
text_types={'.js','.mjs','.cjs','.ejs','.css','.html','.md','.txt','.json','.jsonc','.py','.ps1','.sh','.yml','.yaml','.service','.example','.gitignore','.dockerignore'}
entries=[];problems=[];counts=collections.Counter();bytes_read=0
for p in files:
 b=p.read_bytes();bytes_read+=len(b)
 rel=p.relative_to(root).as_posix();s=p.suffix.lower();counts[s or '(no extension)']+=1
 valid='binary';lines=''
 if s in text_types or p.name in {'Dockerfile','Caddyfile'}:
  try:
   txt=b.decode('utf-8');valid='utf-8';lines=txt.count('\n')+1 if txt else 0
   if b'\x00' in b:problems.append({'file':rel,'issue':'NUL in text file'})
  except UnicodeDecodeError:valid='INVALID_UTF8';problems.append({'file':rel,'issue':'invalid UTF-8'})
 if s=='.svg':
  try: ET.fromstring(b)
  except ET.ParseError as ex:problems.append({'file':rel,'issue':f'SVG parse: {ex}'})
 if s in {'.webp','.png','.jpg','.jpeg'}:
  try:
   with Image.open(p) as img:img.verify()
  except Exception as ex:problems.append({'file':rel,'issue':f'Image verify: {ex}'})
 if s=='.pdf':
  try:
   import fitz
   with fitz.open(p) as pdf:
    if pdf.page_count<1: problems.append({'file':rel,'issue':'PDF zero pages'})
  except Exception as ex: problems.append({'file':rel,'issue':f'PDF parse: {ex}'})
 entries.append({'file':rel,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'encoding':valid,'lines':lines,'extension':s})
# All local JS source imports (excluding generated .cloudflare-build) must have an existing relative target.
imports=0
for p in list((root/'src').rglob('*.js'))+list((root/'scripts').rglob('*.mjs'))+list((root/'test').rglob('*.js'))+list((root/'public/js').rglob('*.js')):
 for match in re.finditer(r'''\b(?:import\s+[^;\n]*?\bfrom\s*|import\s*\(|import\s*|export\s+[^;\n]*?\bfrom\s*)['\"](\.[^'\"]+)['\"]''',p.read_text('utf8')):
  imports+=1;url=match.group(1).split('?')[0];t=(p.parent/url).resolve()
  if not t.is_file() and not t.with_suffix('.js').is_file():
   # build-cloudflare.mjs holds output worker source in string literals. Verify
   # their destinations in the generated source tree, not beside this script.
   if p.name=='build-cloudflare.mjs' and url in {'./server.js','./.cloudflare-build/src/worker.js'}:
    generated=root/'.cloudflare-build/src' / ('server.js' if url=='./server.js' else 'worker.js')
    if generated.is_file(): continue
   problems.append({'file':p.relative_to(root).as_posix(),'issue':'unresolved relative import '+url})
with (out/'file-inventory.csv').open('w',newline='',encoding='utf-8') as f:
 w=csv.DictWriter(f,fieldnames=entries[0]);w.writeheader();w.writerows(entries)
summary={'scan':'All files read byte-for-byte for hashes, format checks and manifest; NOT individual semantic proof','files':len(files),'bytes_read':bytes_read,'text_utf8_files':sum(x['encoding']=='utf-8' for x in entries),'binary_files':sum(x['encoding']=='binary' for x in entries),'extensions':dict(counts),'relative_imports_scanned':imports,'problems':problems}
(out/'source-integrity.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:summary[k] for k in ['files','bytes_read','text_utf8_files','binary_files','relative_imports_scanned','problems']},ensure_ascii=False,indent=2))
