import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readImageDimensions,imageQualityNotes} from '../src/image-dimensions.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

for(const [ext,mime] of [['png','image/png'],['jpg','image/jpeg'],['webp','image/webp']]) {
  test(`R19: real ${ext} dimensions are parsed before upload without decoding`,()=>{
    const bytes=fs.readFileSync(path.join(root,'test/fixtures',`r19-sample.${ext}`));
    assert.deepEqual(readImageDimensions(bytes,mime),{width:640,height:640});
    assert.deepEqual(imageQualityNotes({width:640,height:640}),[]);
  });
}
for(const [file,mime] of [['r19-alpha.webp','image/webp'],['r19-lossless.webp','image/webp'],['r19-progressive.jpg','image/jpeg']]) {
  test(`R19: ${file} supported (transparency, lossless and progressive)`,()=>{
    const bytes=fs.readFileSync(path.join(root,'test/fixtures',file));
    assert.deepEqual(readImageDimensions(bytes,mime),{width:640,height:800});
  });
}
test('R19: malformed/truncated image payloads fail closed',()=>{
  for(const mime of ['image/png','image/jpeg','image/webp']) {
    for(const sample of [Buffer.alloc(0),Buffer.from('not an image'),Buffer.from([137,80,78,71,13,10,26,10])]) {
      assert.equal(readImageDimensions(sample,mime),null);
    }
  }
});
test('R19: WebP rejects a claimed RIFF length greater than actual uploaded bytes',()=>{
  const webp=fs.readFileSync(path.join(root,'test/fixtures/r19-sample.webp'));
  assert.equal(readImageDimensions(webp.subarray(0,35),'image/webp'),null);
});
test('R19: decompression-bomb dimensions are rejected without allocating pixels',()=>{
  const png=Buffer.from(fs.readFileSync(path.join(root,'test/fixtures/r19-sample.png')));
  png.writeUInt32BE(10000,16);png.writeUInt32BE(10000,20);
  assert.equal(readImageDimensions(png,'image/png'),null);
});
test('R19: low-resolution and non-square images get actionable warnings',()=>{
  assert.equal(imageQualityNotes({width:400,height:400}).length,1);
  assert.equal(imageQualityNotes({width:640,height:900}).length,1);
  assert.equal(imageQualityNotes({width:400,height:900}).length,2);
});
test('R19: all authenticated image paths use the bounded dimension parser',()=>{
  const server=fs.readFileSync(path.join(root,'src/server.js'),'utf8');
  assert.match(server,/async function safeImagePath\(buffer,mime\)\s*\{[^}]*readImageDimensions\(buffer,mime\)/);
  for(const marker of ['safeImagePath(file.buffer,file.mimetype)','safeImagePath(req.file.buffer,req.file.mimetype)']) assert.ok(server.includes(marker));
});
