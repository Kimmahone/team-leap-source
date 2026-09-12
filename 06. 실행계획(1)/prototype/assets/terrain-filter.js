/* Display-only DEM conditioning. Work in metres, never blur RGB elevation codes.
   Symmetric, fixed ground-scale kernels preserve planar slopes. Neighbour-tile
   halos make the result independent of tile boundaries. This is not survey data. */
(function(root){
  'use strict';
  function box(input,w,h,r){
    const temp=new Float64Array(input.length),out=new Float64Array(input.length),n=2*r+1;
    for(let y=0;y<h;y++){
      let sum=0;for(let k=-r;k<=r;k++)sum+=input[y*w+Math.max(0,Math.min(w-1,k))];
      for(let x=0;x<w;x++){
        temp[y*w+x]=sum/n;
        sum+=input[y*w+Math.min(w-1,x+r+1)]-input[y*w+Math.max(0,x-r)];
      }
    }
    for(let x=0;x<w;x++){
      let sum=0;for(let k=-r;k<=r;k++)sum+=temp[Math.max(0,Math.min(h-1,k))*w+x];
      for(let y=0;y<h;y++){
        out[y*w+x]=sum/n;
        sum+=temp[Math.min(h-1,y+r+1)*w+x]-temp[Math.max(0,y-r)*w+x];
      }
    }
    return out;
  }
  function smoothstep(a,b,x){const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
  function condition(input,w,h,metresPerPixel){
    const r=Math.max(1,Math.ceil(90/metresPerPixel));
    const mean=box(box(input,w,h,r),w,h,r);
    const squares=Float64Array.from(input,v=>v*v);
    const second=box(box(squares,w,h,r),w,h,r);
    const result=new Float64Array(input.length);
    for(let i=0;i<input.length;i++){
      const relief=Math.sqrt(Math.max(0,second[i]-mean[i]*mean[i]));
      // Fade the correction out on hillsides/ridges; never scale absolute height.
      const strength=.98*(1-smoothstep(5,18,relief));
      result[i]=input[i]+strength*(mean[i]-input[i]);
    }
    return result;
  }
  const api={box,condition};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.TerrainFilter=api;
})(globalThis);
