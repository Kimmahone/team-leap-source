(() => {
  'use strict';
  const workerUrl=new URL('./terrain-worker.js',document.currentScript.src);
  let installed=false,worker,serial=0,workerFailure=false;
  const pending=new Map();
  window.installTerrainProtocol=function(lib){
    if(installed)return;
    worker=new Worker(workerUrl);
    worker.onmessage=({data})=>{
      const job=pending.get(data.id);if(!job)return;
      pending.delete(data.id);job.cleanup();
      if(data.error)job.reject(new Error(data.error));else job.resolve({data:data.buffer});
    };
    worker.onerror=()=>{
      workerFailure=true;
      for(const job of pending.values()){job.cleanup();job.reject(new Error('고도 처리 작업을 불러오지 못했습니다.'));}
      pending.clear();
    };
    lib.addProtocol('leap-dem',async(params,controller)=>{
      if(workerFailure)throw new Error('고도 처리 작업을 불러오지 못했습니다. 새로고침해 주세요.');
      const match=/^leap-dem:\/\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(params.url);
      if(!match)throw new Error('잘못된 고도 타일 주소');
      const [z,x,y]=match.slice(1).map(Number);
      if(z<0||z>14||x>=2**z||y>=2**z)throw new Error('고도 타일 범위 초과');
      if(z<12){
        const response=await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,{signal:controller.signal});
        if(!response.ok)throw new Error(`고도 타일 HTTP ${response.status}`);
        return {data:await response.arrayBuffer()};
      }
      return new Promise((resolve,reject)=>{
        const id=++serial,signal=controller.signal;
        const abort=()=>{pending.delete(id);worker.postMessage({id,cancel:true});reject(new DOMException('취소됨','AbortError'));};
        if(signal.aborted){reject(new DOMException('취소됨','AbortError'));return;}
        signal.addEventListener('abort',abort,{once:true});
        pending.set(id,{resolve,reject,cleanup:()=>signal.removeEventListener('abort',abort)});
        worker.postMessage({id,z,x,y});
      });
    });
    installed=true;
  };
})();
