#!/usr/bin/env python3
"""Static declared-route and asset contract only; not a browser click test."""
from pathlib import Path
from collections import defaultdict
import re,sys
root=Path(__file__).resolve().parent.parent
server=(root/'src/server.js').read_text(encoding='utf-8')
routes=[]
for meth,route in re.findall(r'\bapp\.(get|post|put|delete|patch)\(\s*[\'\"]([^\'\"]+)[\'\"]',server):
    pattern=re.escape(route)
    pattern=re.sub(r'\\:([\w]+)',r'[^/]+',pattern)
    routes.append((meth,re.compile('^'+pattern+'$'),route))
failures=[];checked=[];dynamic=[];external=[]
for file in sorted((root/'views').rglob('*.ejs')):
    raw=file.read_text(encoding='utf-8')
    # EJS's <% ... %> contains '>' and defeats a naive HTML tag regex.
    # Count such dynamic attribute expressions independently as unresolved.
    for dynamic_match in re.finditer(r'\b(?:href|action)\s*=\s*"([^"]*)"',raw):
        if '<%' in dynamic_match.group(1):
            dynamic.append((str(file.relative_to(root)),'dynamic',dynamic_match.group(1)))
    for tag_match in re.finditer(r'<(a|form)\b[^>]*>',raw,re.I|re.S):
        kind=tag_match.group(1).lower()
        attrs=tag_match.group(0)
        attr='href' if kind=='a' else 'action'
        match=re.search(r'\b'+attr+r'\s*=\s*"([^"]*)"',attrs,re.I)
        if not match: continue
        url=match.group(1)
        method='get' if kind=='a' else ('post' if re.search(r'\bmethod\s*=\s*"post"',attrs,re.I) else 'get')
        if not url.startswith('/'):
            external.append((str(file.relative_to(root)),url));continue
        if '<%' in url or '${' in url: continue
        path=url.split('?',1)[0].split('#',1)[0]
        asset=path.startswith(('/assets/','/js/','/css/','/fonts/'))
        exists=(root/'public'/path.lstrip('/')).is_file() if asset else any(m==method and patt.fullmatch(path) for m,patt,_ in routes)
        checked.append((str(file.relative_to(root)),method,path))
        if not exists: failures.append((str(file.relative_to(root)),method,path))
print(f'Routes declared: {len(routes)}; static local href/action checked: {len(checked)}; dynamic unresolved: {len(dynamic)}; other/nonlocal: {len(external)}; missing static target: {len(failures)}')
for file,method,path in failures:print('FAIL',file,method,path)
print('NOT TESTED: dynamic EJS targets, post-submit redirect correctness, authorization, JavaScript click handlers and real HTTP responses.')
sys.exit(bool(failures))
