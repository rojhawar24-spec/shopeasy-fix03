import { inflateSync } from 'node:zlib';

// Validate the complete container before trusting its dimensions. PNG image data
// is inflated with an explicit output budget; JPEG/WebP entropy is not decoded.
// Keep the synchronous API portable to the supported Node/Worker runtimes.
const MAX_SIDE = 10000;
const MAX_PIXELS = 40_000_000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_PNG_DECODED_BYTES = 64 * 1024 * 1024;
const PNG_SIGNATURE = '89504e470d0a1a0a';
const PNG_DEPTHS = {0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
const PNG_CHANNELS = {0:1,2:3,3:1,4:2,6:4};
const ADAM7 = [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]];
const CRC_TABLE = Uint32Array.from({length:256},(_,index)=>{
  let value=index;
  for(let bit=0;bit<8;bit++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;
  return value>>>0;
});

function dimensions(width,height) {
  return Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width<=MAX_SIDE&&height<=MAX_SIDE&&width*height<=MAX_PIXELS?{width,height}:null;
}

function pngCrc(bytes,start,end) {
  let value=0xffffffff;
  for(let i=start;i<end;i++)value=CRC_TABLE[(value^bytes[i])&255]^(value>>>8);
  return (value^0xffffffff)>>>0;
}

function paeth(left,up,upperLeft) {
  const prediction=left+up-upperLeft;
  const a=Math.abs(prediction-left),b=Math.abs(prediction-up),c=Math.abs(prediction-upperLeft);
  return a<=b&&a<=c?left:b<=c?up:upperLeft;
}

function validatePngPixels(parts,width,height,header,paletteSize,budget) {
  const bitsPerPixel=PNG_CHANNELS[header.color]*header.depth;
  const passes=(header.interlace?ADAM7:[[0,0,1,1]]).map(([x,y,dx,dy])=>({
    width:Math.max(0,Math.ceil((width-x)/dx)),height:Math.max(0,Math.ceil((height-y)/dy))
  })).filter(pass=>pass.width&&pass.height);
  const expected=passes.reduce((sum,pass)=>sum+(1+Math.ceil(pass.width*bitsPerPixel/8))*pass.height,0);
  if(!parts.length||!expected||expected>budget.remaining)return false;
  const compressed=Buffer.concat(parts);
  const result=inflateSync(compressed,{maxOutputLength:expected,info:true});
  const pixels=result.buffer;
  if(pixels.length!==expected||result.engine.bytesWritten!==compressed.length)return false;
  budget.remaining-=expected;
  let offset=0;
  const pixelBytes=Math.max(1,Math.ceil(bitsPerPixel/8));
  for(const pass of passes) {
    const rowBytes=Math.ceil(pass.width*bitsPerPixel/8);
    let previous=null;
    for(let y=0;y<pass.height;y++) {
      const filter=pixels[offset++];
      if(filter>4)return false;
      const row=pixels.subarray(offset,offset+rowBytes);
      // Indexed images need unfiltering to reject references outside PLTE.
      if(header.color===3) {
        for(let i=0;i<rowBytes;i++) {
          const left=i>=pixelBytes?row[i-pixelBytes]:0,up=previous?.[i]||0,upperLeft=i>=pixelBytes?(previous?.[i-pixelBytes]||0):0;
          row[i]=(row[i]+(filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):filter===4?paeth(left,up,upperLeft):0))&255;
        }
        for(let x=0;x<pass.width;x++) {
          const bit=x*header.depth,value=(row[bit>>>3]>>>(8-header.depth-(bit&7)))&((1<<header.depth)-1);
          if(value>=paletteSize)return false;
        }
      }
      previous=row;offset+=rowBytes;
    }
  }
  return offset===expected;
}

function readPng(bytes) {
  if(bytes.length<45||bytes.toString('hex',0,8)!==PNG_SIGNATURE)return null;
  let pos=8,header=null,paletteSize=0,sawData=false,dataEnded=false,sawTransparency=false;
  const imageParts=[],budget={remaining:MAX_PNG_DECODED_BYTES};
  let animationFrames=0,framesSeen=0,sequence=0,frame=null;
  const finishFrame=()=>!frame||frame.defaultImage||validatePngPixels(frame.parts,frame.width,frame.height,header,paletteSize,budget);
  while(pos+12<=bytes.length) {
    const size=bytes.readUInt32BE(pos),type=bytes.toString('latin1',pos+4,pos+8),start=pos+8,end=start+size;
    if(end+4>bytes.length||!/^[A-Za-z]{4}$/.test(type)||(bytes[pos+6]&32)||pngCrc(bytes,pos+4,end)!==bytes.readUInt32BE(end))return null;
    if(!header&&type!=='IHDR')return null;
    if(sawData&&type!=='IDAT')dataEnded=true;
    if(type==='IHDR') {
      if(header||size!==13)return null;
      header={...dimensions(bytes.readUInt32BE(start),bytes.readUInt32BE(start+4)),depth:bytes[start+8],color:bytes[start+9],interlace:bytes[start+12]};
      if(!header.width||!PNG_DEPTHS[header.color]?.includes(header.depth)||bytes[start+10]!==0||bytes[start+11]!==0||header.interlace>1)return null;
    } else if(type==='PLTE') {
      if(paletteSize||sawData||![2,3,6].includes(header.color)||!size||size%3||size>768)return null;
      paletteSize=size/3;
      if(header.color===3&&paletteSize>2**header.depth)return null;
    } else if(type==='tRNS') {
      if(sawTransparency||sawData||!([0,2,3].includes(header.color))||(header.color===0&&size!==2)||(header.color===2&&size!==6)||(header.color===3&&(!paletteSize||!size||size>paletteSize)))return null;
      sawTransparency=true;
    } else if(type==='IDAT') {
      if(dataEnded||(header.color===3&&!paletteSize))return null;
      imageParts.push(bytes.subarray(start,end));sawData=true;
    } else if(type==='acTL') {
      if(animationFrames||sawData||size!==8)return null;
      animationFrames=bytes.readUInt32BE(start);
      if(!animationFrames)return null;
    } else if(type==='fcTL') {
      if(!animationFrames||size!==26||bytes.readUInt32BE(start)!==sequence++||!finishFrame())return null;
      const width=bytes.readUInt32BE(start+4),height=bytes.readUInt32BE(start+8),x=bytes.readUInt32BE(start+12),y=bytes.readUInt32BE(start+16);
      if(!dimensions(width,height)||x+width>header.width||y+height>header.height||bytes[start+24]>2||bytes[start+25]>1)return null;
      frame={width,height,parts:[],defaultImage:!sawData};framesSeen++;
      if(frame.defaultImage&&(framesSeen!==1||x||y||width!==header.width||height!==header.height))return null;
    } else if(type==='fdAT') {
      if(!animationFrames||!sawData||!frame||frame.defaultImage||size<5||bytes.readUInt32BE(start)!==sequence++)return null;
      frame.parts.push(bytes.subarray(start+4,end));
    } else if(type==='IEND') {
      if(size||end+4!==bytes.length||!sawData||!finishFrame()||(animationFrames&&framesSeen!==animationFrames))return null;
      if(!validatePngPixels(imageParts,header.width,header.height,header,paletteSize,budget))return null;
      return {width:header.width,height:header.height};
    } else if(!(bytes[pos+4]&32))return null;
    pos=end+4;
  }
  return null;
}

const JPEG_SOF = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
function readJpeg(bytes) {
  if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)return null;
  let pos=2,frame=null,scans=0,restartInterval=0;
  while(pos<bytes.length) {
    if(bytes[pos++]!==0xff)return null;
    while(bytes[pos]===0xff)pos++;
    const marker=bytes[pos++];
    if(marker===0xd9)return frame&&scans&&pos===bytes.length?frame.dimensions:null;
    if(marker===0x01)continue;
    if(marker===undefined||marker===0||marker===0xd8||(marker>=0xd0&&marker<=0xd7)||pos+2>bytes.length)return null;
    const length=bytes.readUInt16BE(pos),start=pos+2,end=pos+length;
    if(length<2||end>bytes.length)return null;
    if(JPEG_SOF.has(marker)) {
      if(frame||length<11)return null;
      const count=bytes[start+5],value=dimensions(bytes.readUInt16BE(start+3),bytes.readUInt16BE(start+1));
      if(!value||!count||length!==8+3*count||bytes[start]<2||bytes[start]>16||(marker===0xc0&&bytes[start]!==8))return null;
      const components=new Set();
      for(let i=0;i<count;i++) {
        const offset=start+6+3*i,id=bytes[offset],sampling=bytes[offset+1];
        if(components.has(id)||!(sampling>>4)||!(sampling&15)||(sampling>>4)>4||(sampling&15)>4||bytes[offset+2]>3)return null;
        components.add(id);
      }
      frame={dimensions:value,components};
    } else if(marker===0xdb) {
      for(let cursor=start;cursor<end;) {
        const spec=bytes[cursor++],precision=spec>>4;
        if(precision>1||(spec&15)>3)return null;
        const size=64*(precision+1);
        if(cursor+size>end)return null;
        for(let i=0;i<size;i+=precision+1)if(precision?bytes.readUInt16BE(cursor+i)===0:bytes[cursor+i]===0)return null;
        cursor+=size;
      }
      if(length===2)return null;
    } else if(marker===0xc4) {
      for(let cursor=start;cursor<end;) {
        if(cursor+17>end)return null;
        const spec=bytes[cursor++];if((spec>>4)>1||(spec&15)>3)return null;
        let count=0,available=1;
        for(let i=0;i<16;i++) {const n=bytes[cursor++];count+=n;available=available*2-n;if(available<0)return null;}
        if(!count||count>256||cursor+count>end)return null;
        cursor+=count;
      }
      if(length===2)return null;
    } else if(marker===0xdd) {
      if(length!==4)return null;
      restartInterval=bytes.readUInt16BE(start);
    } else if(marker===0xda) {
      const count=bytes[start];
      if(!frame||!count||count>frame.components.size||length!==6+2*count)return null;
      const used=new Set();
      for(let i=0;i<count;i++) {
        const id=bytes[start+1+2*i],tables=bytes[start+2+2*i];
        if(!frame.components.has(id)||used.has(id)||(tables>>4)>3||(tables&15)>3)return null;
        used.add(id);
      }
      pos=end;let entropyBytes=0;
      while(pos<bytes.length) {
        if(bytes[pos]!==0xff){pos++;entropyBytes++;continue;}
        const markerStart=pos++;
        while(bytes[pos]===0xff)pos++;
        const next=bytes[pos];
        if(next===0){pos++;entropyBytes++;continue;}
        if(next>=0xd0&&next<=0xd7){if(!restartInterval)return null;pos++;continue;}
        pos=markerStart;break;
      }
      if(!entropyBytes)return null;
      scans++;continue;
    }
    pos=end;
  }
  return null;
}

function webpChunks(bytes,start,end) {
  const chunks=[];
  for(let pos=start;pos<end;) {
    if(pos+8>end)return null;
    const size=bytes.readUInt32LE(pos+4),finish=pos+8+size,next=finish+(size&1);
    if(next>end||((size&1)&&bytes[finish]!==0))return null;
    const type=bytes.toString('latin1',pos,pos+4);
    if(!/^[\x20-\x7e]{4}$/.test(type))return null;
    chunks.push({type,data:bytes.subarray(pos+8,finish)});
    pos=next;
  }
  return chunks;
}

function webpImage(chunk) {
  const bytes=chunk.data;
  if(chunk.type==='VP8L') {
    if(bytes.length<6||bytes[0]!==0x2f||(bytes[4]>>5)!==0)return null;
    return dimensions(1+(bytes[1]|((bytes[2]&0x3f)<<8)),1+((bytes[2]>>6)|(bytes[3]<<2)|((bytes[4]&15)<<10)));
  }
  if(chunk.type!=='VP8 '||bytes.length<11||bytes[3]!==0x9d||bytes[4]!==0x01||bytes[5]!==0x2a)return null;
  const tag=bytes.readUIntLE(0,3),partition=tag>>>5;
  if((tag&1)||((tag>>>1)&7)>3||!(tag&16)||!partition||10+partition>=bytes.length)return null;
  return dimensions(bytes.readUInt16LE(6)&0x3fff,bytes.readUInt16LE(8)&0x3fff);
}

function webpFrame(chunks,width,height) {
  let image=null,alpha=null;
  for(const chunk of chunks) {
    if(chunk.type==='ALPH') {if(alpha||image)return false;alpha=chunk.data;}
    else if(chunk.type==='VP8 '||chunk.type==='VP8L') {if(image)return false;image=chunk;}
    else if(['VP8X','ANIM','ANMF'].includes(chunk.type))return false;
  }
  const value=image&&webpImage(image);
  if(!value||value.width!==width||value.height!==height)return false;
  if(alpha) {
    if(image.type!=='VP8 '||alpha.length<2||(alpha[0]&0xc0)||(alpha[0]&3)>1||((alpha[0]>>>4)&3)>1)return false;
    if((alpha[0]&3)===0&&alpha.length!==1+width*height)return false;
  }
  return true;
}

function readWebp(bytes) {
  if(bytes.length<26||bytes.toString('latin1',0,4)!=='RIFF'||bytes.toString('latin1',8,12)!=='WEBP'||bytes.readUInt32LE(4)+8!==bytes.length)return null;
  const chunks=webpChunks(bytes,12,bytes.length);
  if(!chunks?.length)return null;
  if(chunks[0].type!=='VP8X') {
    const value=webpImage(chunks[0]);
    return value&&webpFrame(chunks,value.width,value.height)?value:null;
  }
  const header=chunks[0].data;
  if(header.length!==10||(header[0]&0xc1)||header[1]||header[2]||header[3])return null;
  const canvas=dimensions(1+header.readUIntLE(4,3),1+header.readUIntLE(7,3));
  if(!canvas)return null;
  const content=chunks.slice(1);
  if(!(header[0]&2))return webpFrame(content,canvas.width,canvas.height)?canvas:null;
  let animation=false,frames=0;
  for(const chunk of content) {
    if(chunk.type==='ANIM') {if(animation||frames||chunk.data.length!==6)return null;animation=true;}
    else if(chunk.type==='ANMF') {
      const f=chunk.data;
      if(!animation||f.length<24||(f[15]&0xfc))return null;
      const x=f.readUIntLE(0,3)*2,y=f.readUIntLE(3,3)*2,width=f.readUIntLE(6,3)+1,height=f.readUIntLE(9,3)+1;
      const nested=webpChunks(f,16,f.length);
      if(!dimensions(width,height)||x+width>canvas.width||y+height>canvas.height||!nested||!webpFrame(nested,width,height))return null;
      frames++;
    } else if(['VP8X','VP8 ','VP8L','ALPH'].includes(chunk.type))return null;
  }
  return animation&&frames?canvas:null;
}

export function readImageDimensions(bytes, mime) {
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>MAX_FILE_BYTES)return null;
  const buffer=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  try {
    if(mime==='image/png')return readPng(buffer);
    if(mime==='image/jpeg')return readJpeg(buffer);
    if(mime==='image/webp')return readWebp(buffer);
    return null;
  } catch { return null; }
}

export function imageQualityNotes(dimensions) {
  if (!dimensions) return ['Image dimensions could not be verified.'];
  const notes = [];
  if (dimensions.width < 500 || dimensions.height < 500) notes.push('Use a photo at least 500 × 500 pixels for Google Merchant listings from 31 January 2027.');
  if (Math.abs(dimensions.width / dimensions.height - 1) > 0.10) notes.push('This image is not square; product cards crop the edges. Keep the entire product safely inside the centre.');
  return notes;
}
