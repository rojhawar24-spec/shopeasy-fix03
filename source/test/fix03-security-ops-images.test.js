import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {crc32,deflateSync} from 'node:zlib';
import {readImageDimensions} from '../src/image-dimensions.js';

const fixture=name=>fs.readFileSync(new URL(`./fixtures/${name}`,import.meta.url));
const signature=Buffer.from('89504e470d0a1a0a','hex');
function chunk(type,payload) {
  const data=Buffer.from(payload),out=Buffer.alloc(12+data.length);
  out.writeUInt32BE(data.length);out.write(type,4,'ascii');data.copy(out,8);
  out.writeUInt32BE(crc32(out.subarray(4,-4)),out.length-4);
  return out;
}
function header(width=1,height=1,{depth=8,color=6,interlace=0}={}) {
  const value=Buffer.alloc(13);value.writeUInt32BE(width);value.writeUInt32BE(height,4);
  value[8]=depth;value[9]=color;value[12]=interlace;return chunk('IHDR',value);
}
const redPixel=Buffer.from([0,255,0,0,255]);
const finish=parts=>Buffer.concat([signature,...parts,chunk('IEND',[])]);
const tinyPng=()=>finish([header(),chunk('IDAT',deflateSync(redPixel))]);
function frameControl(sequence=0) {
  const data=Buffer.alloc(26);data.writeUInt32BE(sequence);data.writeUInt32BE(1,4);data.writeUInt32BE(1,8);data.writeUInt16BE(100,22);
  return chunk('fcTL',data);
}
function riffChunk(type,payload) {
  const data=Buffer.from(payload),out=Buffer.alloc(8+data.length+(data.length&1));
  out.write(type,0,'ascii');out.writeUInt32LE(data.length,4);data.copy(out,8);return out;
}
function webp(parts) {
  const body=Buffer.concat([Buffer.from('WEBP'),...parts]);
  const file=Buffer.alloc(8+body.length);file.write('RIFF');file.writeUInt32LE(body.length,4);body.copy(file,8);return file;
}

test('SEC003 PNG: genuine complete images and typed views remain valid',()=>{
  for(const name of ['r19-sample.png','r19-low-res.png','r19-portrait.png'])assert.ok(readImageDimensions(fixture(name),'image/png'),name);
  assert.deepEqual(readImageDimensions(tinyPng(),'image/png'),{width:1,height:1});
  const backing=Buffer.concat([Buffer.alloc(11),tinyPng(),Buffer.alloc(7)]);
  assert.deepEqual(readImageDimensions(new Uint8Array(backing.buffer,backing.byteOffset+11,backing.length-18),'image/png'),{width:1,height:1});
});

test('SEC003 PNG: header-only, missing IDAT/IEND and invalid CRC payloads fail closed',()=>{
  const sample=fixture('r19-sample.png');
  for(const bad of [sample.subarray(0,33),finish([header()]),sample.subarray(0,-12),Buffer.concat([tinyPng(),Buffer.from('extra')])])assert.equal(readImageDimensions(bad,'image/png'),null);
  for(const offset of [16,sample.length-1]) {const corrupt=Buffer.from(sample);corrupt[offset]^=1;assert.equal(readImageDimensions(corrupt,'image/png'),null);}
});

test('SEC003 PNG: valid checksums cannot disguise bad zlib, row sizes or filter bytes',()=>{
  for(const payload of [Buffer.from('bad zlib'),deflateSync(Buffer.from([0,255])),deflateSync(Buffer.from([5,255,0,0,255])),deflateSync(Buffer.concat([redPixel,Buffer.from([1])])),Buffer.concat([deflateSync(redPixel),Buffer.from([0])])]) {
    assert.equal(readImageDimensions(finish([header(),chunk('IDAT',payload)]),'image/png'),null);
  }
});

test('SEC003 PNG: split contiguous IDAT works and interrupted image data is rejected',()=>{
  const compressed=deflateSync(redPixel),first=chunk('IDAT',compressed.subarray(0,4)),last=chunk('IDAT',compressed.subarray(4));
  assert.deepEqual(readImageDimensions(finish([header(),first,last]),'image/png'),{width:1,height:1});
  assert.equal(readImageDimensions(finish([header(),first,chunk('tEXt',Buffer.from('key\0value')),last]),'image/png'),null);
});

test('SEC003 PNG: indexed palettes and all Adam7 passes are validated',()=>{
  const palette=chunk('PLTE',[255,0,0,0,255,0]);
  assert.deepEqual(readImageDimensions(finish([header(1,1,{color:3}),palette,chunk('IDAT',deflateSync(Buffer.from([0,1])))]),'image/png'),{width:1,height:1});
  assert.equal(readImageDimensions(finish([header(1,1,{color:3}),palette,chunk('IDAT',deflateSync(Buffer.from([0,2])))]),'image/png'),null);
  const adamRows=[5,5,9,9,9,17,17,17,17,17,17,33,33,33,33].map(size=>Buffer.alloc(size));
  const adam=Buffer.concat(adamRows);
  assert.equal(adam.length,271);
  assert.deepEqual(readImageDimensions(finish([header(8,8,{interlace:1}),chunk('IDAT',deflateSync(adam))]),'image/png'),{width:8,height:8});
  assert.equal(readImageDimensions(finish([header(8,8,{interlace:1}),chunk('IDAT',deflateSync(adam.subarray(1)))]),'image/png'),null);
});

test('SEC003 PNG: animated frames require correct sequencing and complete image streams',()=>{
  const animation=Buffer.alloc(8);animation.writeUInt32BE(2);
  const second=Buffer.concat([Buffer.from([0,0,0,2]),deflateSync(redPixel)]);
  const parts=[header(),chunk('acTL',animation),frameControl(0),chunk('IDAT',deflateSync(redPixel)),frameControl(1)];
  assert.deepEqual(readImageDimensions(finish([...parts,chunk('fdAT',second)]),'image/png'),{width:1,height:1});
  assert.equal(readImageDimensions(finish(parts),'image/png'),null);
  second.writeUInt32BE(9);assert.equal(readImageDimensions(finish([...parts,chunk('fdAT',second)]),'image/png'),null);
});

test('SEC003 PNG: dimension and decoded-byte budgets apply even to checksummed headers',()=>{
  for(const [width,height] of [[10001,1],[10000,10000],[4096,4096]]) {
    assert.equal(readImageDimensions(finish([header(width,height),chunk('IDAT',deflateSync(redPixel))]),'image/png'),null);
  }
});

for(const name of ['r19-sample.jpg','r19-progressive.jpg']) {
  test(`SEC003 JPEG: ${name} requires a complete scan and end marker`,()=>{
    const image=fixture(name),expected=name.includes('progressive')?{width:640,height:800}:{width:640,height:640};
    assert.deepEqual(readImageDimensions(image,'image/jpeg'),expected);
    for(const end of [2,Math.floor(image.length/2),image.length-2,image.length-1])assert.equal(readImageDimensions(image.subarray(0,end),'image/jpeg'),null);
    let pos=2;
    while(pos<image.length) {
      const marker=image[pos+1],length=image.readUInt16BE(pos+2);
      if([0xc0,0xc2].includes(marker)) {
        const metadataOnly=Buffer.concat([image.subarray(0,pos+2+length),Buffer.from([255,217])]);
        assert.equal(readImageDimensions(metadataOnly,'image/jpeg'),null);break;
      }
      pos+=2+length;
    }
    const malformedScan=Buffer.from(image);const start=malformedScan.indexOf(Buffer.from([255,218]));
    assert.ok(start>=0);malformedScan[start+4]=255;assert.equal(readImageDimensions(malformedScan,'image/jpeg'),null);
  });
}

for(const name of ['r19-sample.webp','r19-alpha.webp','r19-lossless.webp']) {
  test(`SEC003 WebP: ${name} requires the complete RIFF container`,()=>{
    const image=fixture(name),expected=name.includes('sample')?{width:640,height:640}:{width:640,height:800};
    assert.deepEqual(readImageDimensions(image,'image/webp'),expected);
    for(const end of [12,30,Math.floor(image.length/2),image.length-1])assert.equal(readImageDimensions(image.subarray(0,end),'image/webp'),null);
    const falseLength=Buffer.from(image);falseLength.writeUInt32LE(falseLength.length,4);assert.equal(readImageDimensions(falseLength,'image/webp'),null);
    const firstSize=image.readUInt32LE(16),first=image.subarray(20,20+firstSize);
    if(name.includes('alpha'))assert.equal(readImageDimensions(webp([riffChunk('VP8X',first)]),'image/webp'),null);
    if(name.includes('lossless'))assert.equal(readImageDimensions(webp([riffChunk('VP8L',first.subarray(0,5))]),'image/webp'),null);
    if(name.includes('sample'))assert.equal(readImageDimensions(webp([riffChunk('VP8 ',first.subarray(0,10))]),'image/webp'),null);
  });
}

test('SEC003 WebP: valid animation uses a real frame; empty or out-of-canvas frames fail',()=>{
  const sample=fixture('r19-sample.webp'),extension=Buffer.alloc(10);extension[0]=2;extension.writeUIntLE(639,4,3);extension.writeUIntLE(639,7,3);
  const frame=Buffer.alloc(16);frame.writeUIntLE(639,6,3);frame.writeUIntLE(639,9,3);frame.writeUIntLE(100,12,3);
  const prefix=[riffChunk('VP8X',extension),riffChunk('ANIM',Buffer.alloc(6))];
  assert.deepEqual(readImageDimensions(webp([...prefix,riffChunk('ANMF',Buffer.concat([frame,sample.subarray(12)]))]),'image/webp'),{width:640,height:640});
  assert.equal(readImageDimensions(webp(prefix),'image/webp'),null);
  frame.writeUIntLE(2,0,3);assert.equal(readImageDimensions(webp([...prefix,riffChunk('ANMF',Buffer.concat([frame,sample.subarray(12)]))]),'image/webp'),null);
});

test('SEC003 image input boundary rejects unsupported values and MIME mismatches without throwing',()=>{
  for(const input of [undefined,null,{},[],{length:33},'not bytes',Buffer.alloc(2*1024*1024+1)])assert.equal(readImageDimensions(input,'image/png'),null);
  assert.equal(readImageDimensions(tinyPng(),'image/jpeg'),null);
  assert.equal(readImageDimensions(fixture('r19-sample.jpg'),'image/webp'),null);
});

test('SEC003 non-ASCII lookalike signatures and chunk names cannot bypass structural validation',()=>{
  const png=tinyPng();png[12]|=128;png.writeUInt32BE(crc32(png.subarray(12,29)),29);
  assert.equal(readImageDimensions(png,'image/png'),null);
  for(const offset of [0,8,12]) {const image=fixture('r19-sample.webp');image[offset]|=128;assert.equal(readImageDimensions(image,'image/webp'),null);}
});
