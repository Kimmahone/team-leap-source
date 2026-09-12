/* Terrain decoding/filtering runs outside the UI thread. No credentials. */
importScripts('./terrain-filter.js');
const decoded=new Map(),cancelled=new Set();
let queue=Promise.resolve();
async function tile(z,x,y){
  const n=2**z;x=((x%n)+n)%n;y=Math.max(0,Math.min(n-1,y));
  const key=`${z}/${x}/${y}`;
  if(decoded.has(key)){const hit=decoded.get(key);decoded.delete(key);decoded.set(key,hit);return hit;}
  const pending=(async()=>{
    const response=await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${key}.png`,{signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(`고도 타일 HTTP ${response.status}`);
    const bitmap=await createImageBitmap(await response.blob(),{colorSpaceConversion:'none',premultiplyAlpha:'none'});
    const canvas=new OffscreenCanvas(256,256),ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(bitmap,0,0);bitmap.close();
    const rgba=ctx.getImageData(0,0,256,256).data,heights=new Float64Array(256*256);
    for(let i=0;i<heights.length;i++)heights[i]=rgba[i*4]*256+rgba[i*4+1]+rgba[i*4+2]/256-32768;
    return heights;
  })();
  decoded.set(key,pending);
  while(decoded.size>48)decoded.delete(decoded.keys().next().value);
  try{return await pending;}catch(error){decoded.delete(key);throw error;}
}
async function render({z,x,y}){
  // Constant Mercator radius across neighbouring tiles avoids seams at their edges.
  // At Gyeongbuk latitude a z14 pixel is approximately 7.7 metres on the ground.
  const mpp=40075016.68557849*Math.cos(36*Math.PI/180)/(256*2**z);
  const r=Math.max(1,Math.ceil(90/mpp)),halo=2*r+2,w=256+2*halo;
  const data=new Float64Array(w*w),neighbours=await Promise.all(
    [-1,0,1].flatMap(dy=>[-1,0,1].map(dx=>tile(z,x+dx,y+dy))));
  for(let row=0;row<w;row++)for(let col=0;col<w;col++){
    const gx=col-halo,gy=row-halo,dx=Math.floor(gx/256),dy=Math.floor(gy/256);
    data[row*w+col]=neighbours[(dy+1)*3+dx+1][((gy%256+256)%256)*256+(gx%256+256)%256];
  }
  const filtered=TerrainFilter.condition(data,w,w,mpp);
  const canvas=new OffscreenCanvas(256,256),ctx=canvas.getContext('2d'),image=ctx.createImageData(256,256);
  for(let row=0;row<256;row++)for(let col=0;col<256;col++){
    const value=Math.max(0,Math.min(16777215,Math.round((filtered[(row+halo)*w+col+halo]+32768)*256)));
    const i=(row*256+col)*4;
    image.data[i]=value>>>16;image.data[i+1]=(value>>>8)&255;image.data[i+2]=value&255;image.data[i+3]=255;
  }
  ctx.putImageData(image,0,0);
  return (await canvas.convertToBlob({type:'image/png'})).arrayBuffer();
}
self.onmessage=({data})=>{
  if(data.cancel){cancelled.add(data.id);return;}
  queue=queue.then(async()=>{
    if(cancelled.delete(data.id))return;
    try{
      const buffer=await render(data);
      if(!cancelled.delete(data.id))self.postMessage({id:data.id,buffer},[buffer]);
    }catch(error){if(!cancelled.delete(data.id))self.postMessage({id:data.id,error:error.message});}
  });
};
