// Bounded ZIP reader/writer for release packaging and safe extraction.
// Supports ordinary single-disk ZIP with stored/deflated regular files; no Zip64.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {safeReleasePath} from './release-files.mjs';

const table = Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++) value=(value>>>1)^((value&1)?0xedb88320:0);return value>>>0;});
export function crc32(data) {let crc=0xffffffff;for(const value of data)crc=table[(crc^value)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
const limit = 512*1024*1024;
export function readZip(archive) {
  const bytes=Buffer.isBuffer(archive)?archive:fs.readFileSync(archive);
  if(bytes.length>limit || bytes.length<22)throw new Error('Archive size is unsupported.');
  let end=-1;
  for(let offset=bytes.length-22;offset>=Math.max(0,bytes.length-65557);offset--) {
    if(bytes.readUInt32LE(offset)===0x06054b50 && offset+22+bytes.readUInt16LE(offset+20)===bytes.length){end=offset;break;}
  }
  if(end<0)throw new Error('ZIP directory is missing.');
  const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),directory=bytes.readUInt32LE(end+16);
  if(bytes.readUInt16LE(end+4)!==0 || bytes.readUInt16LE(end+6)!==0 || count!==bytes.readUInt16LE(end+8) || count>10000 || directory+size!==end)throw new Error('Unsupported ZIP directory.');
  const entries=[];const names=new Set();let offset=directory,total=0;
  for(let index=0;index<count;index++) {
    if(offset+46>end || bytes.readUInt32LE(offset)!==0x02014b50)throw new Error('Invalid ZIP entry.');
    const flags=bytes.readUInt16LE(offset+8),method=bytes.readUInt16LE(offset+10),checksum=bytes.readUInt32LE(offset+16);
    const packed=bytes.readUInt32LE(offset+20),unpacked=bytes.readUInt32LE(offset+24),nameLength=bytes.readUInt16LE(offset+28),extra=bytes.readUInt16LE(offset+30),comment=bytes.readUInt16LE(offset+32),local=bytes.readUInt32LE(offset+42);
    const type=(bytes.readUInt32LE(offset+38)>>>16)&0xf000;
    if(flags&~0x80e || ![0,8].includes(method) || ![0,0x8000,0x4000].includes(type) || offset+46+nameLength+extra+comment>end || bytes.readUInt16LE(offset+34)!==0)throw new Error('Encrypted, linked or unsupported ZIP entry.');
    let name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(offset+46,offset+46+nameLength));
    const directoryEntry=name.endsWith('/');if(directoryEntry)name=name.slice(0,-1);
    const collision=name.normalize('NFC').toLocaleLowerCase('en');
    if(!safeReleasePath(name) || names.has(collision))throw new Error('Unsafe or duplicate ZIP path.');
    if(type===0x4000&&!directoryEntry || type===0x8000&&directoryEntry)throw new Error('ZIP entry type/name mismatch.');
    names.add(collision);total+=unpacked;if(total>limit)throw new Error('Expanded ZIP exceeds size limit.');
    if(local+30>directory || bytes.readUInt32LE(local)!==0x04034b50)throw new Error('Invalid local ZIP header.');
    const localNameLength=bytes.readUInt16LE(local+26),localExtra=bytes.readUInt16LE(local+28),start=local+30+localNameLength+localExtra;
    const localName=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(local+30,local+30+localNameLength));
    if(localName!==(directoryEntry?name+'/':name) || bytes.readUInt16LE(local+6)!==flags || bytes.readUInt16LE(local+8)!==method || start+packed>directory)throw new Error('ZIP local header mismatch.');
    if(!(flags&8) && (bytes.readUInt32LE(local+14)!==checksum || bytes.readUInt32LE(local+18)!==packed || bytes.readUInt32LE(local+22)!==unpacked))throw new Error('ZIP local checksum/size mismatch.');
    const compressed=bytes.subarray(start,start+packed);
    const data=method===0?Buffer.from(compressed):zlib.inflateRawSync(compressed,{maxOutputLength:Math.max(1,unpacked)});
    if(data.length!==unpacked || crc32(data)!==checksum || (directoryEntry && data.length!==0))throw new Error('ZIP size or CRC mismatch.');
    entries.push({name,directory:directoryEntry,data});offset+=46+nameLength+extra+comment;
  }
  if(offset!==end)throw new Error('ZIP directory length mismatch.');
  const fileNames=new Set(entries.filter(entry=>!entry.directory).map(entry=>entry.name.normalize('NFC').toLocaleLowerCase('en')));
  for(const entry of entries)for(const parent of entry.name.split('/').slice(0,-1).map((_,i)=>entry.name.split('/').slice(0,i+1).join('/'))) {
    if(fileNames.has(parent.normalize('NFC').toLocaleLowerCase('en')))throw new Error('ZIP file/directory collision.');
  }
  return entries;
}
export function extractZip(archive,destination) {
  const entries=readZip(archive);
  // Refuse existing linked parents as well as a linked destination. Otherwise an
  // apparently new extraction directory could write through an older symlink.
  let ancestor=path.resolve(destination);
  while(true) {
    let stat;
    try{stat=fs.lstatSync(ancestor);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(stat&&(!stat.isDirectory()||stat.isSymbolicLink()))throw new Error('Extraction requires real directory ancestors without symbolic links.');
    const parent=path.dirname(ancestor);if(parent===ancestor)break;ancestor=parent;
  }
  let existing;
  try{existing=fs.lstatSync(destination);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(existing && (!existing.isDirectory() || existing.isSymbolicLink() || fs.readdirSync(destination).length))throw new Error('Extraction destination must be a real empty directory.');
  fs.mkdirSync(destination,{recursive:true,mode:0o700});
  for(const entry of entries) {
    const target=path.join(destination,...entry.name.split('/'));
    if(entry.directory)fs.mkdirSync(target,{recursive:true,mode:0o755});
    else {fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o755});fs.writeFileSync(target,entry.data,{flag:'wx',mode:0o644});}
  }
  return entries.filter(entry=>!entry.directory).map(entry=>entry.name);
}
export function createZip(directory,files,destination) {
  if(!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink())throw new Error('Archive source must be a real directory.');
  const locals=[],centrals=[],names=new Set();let offset=0,total=0;
  if(files.length>10000)throw new Error('Too many release files.');
  for(const relative of files) {
    if(!safeReleasePath(relative))throw new Error('Unsafe release file.');
    const collision=relative.normalize('NFC').toLocaleLowerCase('en');
    if(names.has(collision))throw new Error('Duplicate release file.');
    names.add(collision);
    let current=directory;
    const components=relative.split('/');
    for(const [index,component]of components.entries()) {
      current=path.join(current,component);const stat=fs.lstatSync(current);
      if(stat.isSymbolicLink() || (index===components.length-1?!stat.isFile():!stat.isDirectory()))throw new Error('Archive source contains a linked or non-regular path.');
      if(index===components.length-1){total+=stat.size;if(total>limit)throw new Error('Archive source exceeds size limit.');}
    }
    const name=Buffer.from(relative),data=fs.readFileSync(path.join(directory,relative)),compressed=zlib.deflateRawSync(data,{level:9}),checksum=crc32(data);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt16LE(0x21,12);local.writeUInt32LE(checksum,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(0x314,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(8,10);central.writeUInt16LE(0x21,14);central.writeUInt32LE(checksum,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(0x81a40000,38);central.writeUInt32LE(offset,42);
    locals.push(local,name,compressed);centrals.push(central,name);offset+=local.length+name.length+compressed.length;
  }
  const central=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
  fs.writeFileSync(destination,Buffer.concat([...locals,central,end]),{flag:'wx',mode:0o600});
  const entries=readZip(destination);if(entries.length!==files.length)throw new Error('Archive entry count mismatch.');
  return entries.map(entry=>({path:entry.name,bytes:entry.data.length,sha256:crypto.createHash('sha256').update(entry.data).digest('hex')}));
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const [command,archive,destination]=process.argv.slice(2);
    if(command!=='extract'||!archive||!destination)throw new Error('Usage: node scripts/release-archive.mjs extract ARCHIVE EMPTY_DIRECTORY');
    const files=extractZip(archive,destination);console.log(`VERIFIED: safely extracted ${files.length} regular release files.`);
  }catch(error){console.error(`Release archive rejected: ${error.message}`);process.exitCode=1;}
}
