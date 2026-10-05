// Derive animation sheets from the CC0 Dungeon Crawl tiles in dist/oga.
// Uses only Node's standard library; each row is idle, walk, attack, hurt.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..', 'dist');
const names = ['hero','red-jelly','cave-bat','iron-imp','royal-jelly','sun-demon','ancient-lich','potion','stairs'];
const WIDTH = 128, HEIGHT = 128;
const crcTable = Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function chunk(type,data){const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);let value=0xffffffff;for(const byte of Buffer.concat([name,data]))value=crcTable[(value^byte)&255]^(value>>>8);crc.writeUInt32BE((value^0xffffffff)>>>0);return Buffer.concat([length,name,data,crc]);}
function writePng(pixels){const header=Buffer.alloc(13);header.writeUInt32BE(WIDTH,0);header.writeUInt32BE(HEIGHT,4);header[8]=8;header[9]=6;const raw=Buffer.alloc(HEIGHT*(WIDTH*4+1));for(let y=0;y<HEIGHT;y++)pixels.copy(raw,y*(WIDTH*4+1)+1,y*WIDTH*4,(y+1)*WIDTH*4);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
function paeth(a,b,c){const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;}
function readPng(file){
  const input=fs.readFileSync(file),parts=[];let at=8,width=0,height=0;
  while(at<input.length){const length=input.readUInt32BE(at),type=input.toString('ascii',at+4,at+8),data=input.subarray(at+8,at+8+length);at+=length+12;
    if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);if(data[8]!==8||data[9]!==6||data[12]!==0)throw Error(`Expected non-interlaced RGBA PNG: ${file}`);}
    if(type==='IDAT')parts.push(data);
    if(type==='IEND')break;
  }
  const raw=zlib.inflateSync(Buffer.concat(parts)),stride=width*4,pixels=Buffer.alloc(width*height*4);let offset=0;
  for(let y=0;y<height;y++){const filter=raw[offset++];for(let x=0;x<stride;x++){
    const left=x>=4?pixels[y*stride+x-4]:0,up=y?pixels[(y-1)*stride+x]:0,upperLeft=y&&x>=4?pixels[(y-1)*stride+x-4]:0;
    const predictor=[0,left,up,Math.floor((left+up)/2),paeth(left,up,upperLeft)][filter];
    if(predictor===undefined)throw Error(`Unsupported PNG filter ${filter}`);
    pixels[y*stride+x]=(raw[offset++]+predictor)&255;
  }}
  return {width,height,pixels};
}
function derive(name){
  const source=readPng(path.join(root,'oga',`${name}.png`));
  if(source.width!==32||source.height!==32)throw Error(`${name} is not a 32×32 tile`);
  const result=Buffer.alloc(WIDTH*HEIGHT*4),isProp=name==='potion'||name==='stairs';
  const pixel=(x,y,rgba)=>{if(x<0||y<0||x>=WIDTH||y>=HEIGHT)return;const i=(y*WIDTH+x)*4;for(let c=0;c<4;c++)result[i+c]=rgba[c];};
  const rect=(x,y,w,h,rgba)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)pixel(xx,yy,rgba);};
  for(let state=0;state<4;state++)for(let frame=0;frame<4;frame++){
    const ox=frame*32,oy=state*32;
    const dx=state===1?[0,1,0,-1][frame]:state===2?[0,1,3,1][frame]:0;
    const dy=state===1?[0,-1,0,1][frame]:state===0?[0,0,-1,0][frame]:0;
    for(let y=0;y<32;y++)for(let x=0;x<32;x++){
      const i=(y*32+x)*4,alpha=source.pixels[i+3];if(!alpha)continue;
      let red=source.pixels[i],green=source.pixels[i+1],blue=source.pixels[i+2];
      if(state===3&&frame%2===0){red=Math.min(255,red+100);green=Math.min(255,green+75);blue=Math.min(255,blue+70);}
      if(isProp&&frame%2===1){red=Math.min(255,red+20);green=Math.min(255,green+20);blue=Math.min(255,blue+20);}
      pixel(ox+x+dx,oy+y+dy,[red,green,blue,alpha]);
    }
    if(state===2&&!isProp){const slash=name==='hero'?[255,229,166,235]:[255,133,112,220];
      if(frame===1){rect(ox+26,oy+10,3,9,slash);rect(ox+23,oy+17,7,3,slash);}
      if(frame===2){rect(ox+27,oy+7,3,17,slash);rect(ox+23,oy+21,8,3,slash);}
    }
  }
  return writePng(result);
}
fs.mkdirSync(path.join(root,'sprites'),{recursive:true});
for(const name of names)fs.writeFileSync(path.join(root,'sprites',`${name}.png`),derive(name));
console.log(`Built ${names.length} OpenGameArt-based sprite sheets`);
