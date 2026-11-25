#!/usr/bin/env node
// Read-only local upload quality audit; no remote URLs or database access.
// Uploaded assets may include logos, stories or product images. This tool cannot
// determine which gallery row uses a file without querying the live database.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readImageDimensions, imageQualityNotes} from '../src/image-dimensions.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'public','uploads');
const files=fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).filter(item=>item.isFile()&&/^[a-f0-9]{32}\.(png|jpg|webp)$/.test(item.name)).map(item=>item.name):[];
const issues=[];
let checked=0;
if(files.length>20000){console.log('Too many files for a bounded audit (20,000 maximum).');process.exit(1);}
for(const filename of files){
 const ext=path.extname(filename).slice(1);
 const mime={png:'image/png',jpg:'image/jpeg',webp:'image/webp'}[ext];
 const filenamePath=path.join(dir,filename);
 const size=fs.statSync(filenamePath).size;
 if(size<1||size>2*1024*1024){issues.push({file:filename,level:'error',reason:'File is empty or exceeds 2 MiB'});continue;}
 const dimensions=readImageDimensions(fs.readFileSync(filenamePath),mime);
 if(!dimensions){issues.push({file:filename,level:'error',reason:'Header dimensions are invalid or exceed safety limits'});continue;}
 checked++;
 for(const note of imageQualityNotes(dimensions))issues.push({file:filename,level:'review',reason:note});
}
console.log(JSON.stringify({status:files.length?'CHECKED_FILE_HEADERS':'NO_LOCAL_UPLOADS',files:files.length,validDimensions:checked,issues,scope:'Local upload headers only; database gallery mapping, external URL images and visual truthfulness not verified'},null,2));
if(issues.some(item=>item.level==='error'))process.exitCode=1;
