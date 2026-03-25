// content.js — Waymark v8

let waymarks = [];
let lastX = 0, lastY = 0, lastTarget = null;
let onetimeColorIndex = 0;
let floatSpawnOffset = 0;

const ONETIME_COLORS = ['#e8612a','#e8a12a','#e82a6e','#2ae85a','#3b82f6','#a12ae8'];
const SPAWN_OFFSETS = [
  {dx:0,dy:0},{dx:90,dy:0},{dx:0,dy:90},{dx:-90,dy:0},
  {dx:0,dy:-90},{dx:90,dy:90},{dx:-90,dy:90},{dx:90,dy:-90}
];

let settings = {
  scrollIndicator:true, autoBookmark:false,
  savedColor:'#3b82f6', onetimeColor:'#e8612a', multiColorOnetime:false,
  floatMode:'always', floatingBtnPos:'bot-right', viewportLimit:false,
  proximityEnabled:true, proximityPx:250,
  pinTitleVis:'always', pinDblClick:true, clearOnClose:false,
  floatDomains:[], bmFolder:'', theme:'dark', uiFont:'Inter'
};

document.addEventListener('contextmenu', e=>{
  lastX = e.clientX + window.scrollX;
  lastY = e.clientY + window.scrollY;
  lastTarget = e.target;
}, true);

// ── Helpers ───────────────────────────────────────────────────────────────
function uid(){return 'wm_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);}

function getSection(el){
  let node=el;
  for(let i=0;i<12;i++){
    if(!node||node===document.body)break;
    let sib=node.previousElementSibling;
    while(sib){if(/^H[1-6]$/.test(sib.tagName))return sib.textContent.trim().slice(0,60);sib=sib.previousElementSibling;}
    node=node.parentElement;
  }
  return(document.querySelector('h1')?.textContent||document.title).trim().slice(0,60);
}

function getSnippet(el,sel){
  if(sel?.trim())return sel.trim().slice(0,100);
  return(el?.textContent?.trim()||'').slice(0,100)||'Marked spot';
}

function storageKey(){
  try{const u=new URL(location.href);return 'wm:'+u.hostname+u.pathname;}
  catch{return 'wm:'+location.href.slice(0,100);}
}

function persistSaved(){
  browser.storage.local.set({[storageKey()]:waymarks.filter(w=>w.mode==='saved')});
}

function getOnetimeColor(){
  const available=ONETIME_COLORS.filter(c=>c!==settings.savedColor);
  if(!settings.multiColorOnetime){
    const base=settings.onetimeColor||available[0];
    return base===settings.savedColor?available[0]:base;
  }
  const c=available[onetimeColorIndex%available.length];
  onetimeColorIndex++;
  return c;
}

function darken(hex){
  try{
    const n=parseInt(hex.slice(1),16);
    const r=Math.max(0,(n>>16)-40),g=Math.max(0,((n>>8)&0xff)-40),b=Math.max(0,(n&0xff)-40);
    return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
  }catch{return hex;}
}

// ── Pattern matching ──────────────────────────────────────────────────────
function matchesPattern(pattern, fullUrl){
  try{
    const u=new URL(fullUrl);
    const host=u.hostname, path=u.pathname, full=host+path;
    if(pattern.startsWith('*/')){
      const re=new RegExp('^'+pattern.slice(1).replace(/\./g,'\\.').replace(/\*/g,'.*')+'$');
      return re.test(path);
    }
    if(pattern.includes('/')){
      const re=new RegExp('^'+pattern.replace(/\./g,'\\.').replace(/\*/g,'.*')+'$');
      return re.test(full);
    }
    const re=new RegExp('^'+pattern.replace(/\./g,'\\.').replace(/\*/g,'.*')+'$');
    return re.test(host);
  }catch{return false;}
}

function shouldShowFloat(){
  const mode=settings.floatMode||'always';
  if(mode==='never')return false;
  if(mode==='always')return true;
  const domains=settings.floatDomains||[];
  if(!domains.length)return false;
  return domains.some(p=>matchesPattern(p,location.href));
}

// ── Proximity — removes existing same-type marks within radius ────────────
function proximityCheck(x, y, mode){
  if(!(settings.proximityEnabled ?? true)) return;
  const px = settings.proximityPx ?? 250;
  if(px <= 0) return;
  const nearby = waymarks.filter(w => w.mode===mode && Math.hypot(w.scrollX-x, w.scrollY-y) < px);
  nearby.forEach(w=>{ removePin(w.id); removeStickyNote(w.id); });
  waymarks = waymarks.filter(w => !nearby.includes(w));
}

// ── Viewport limit ────────────────────────────────────────────────────────
function getViewportWaymarks(mode){
  const top=window.scrollY, bot=window.scrollY+window.innerHeight;
  return waymarks.filter(w=>w.mode===mode&&w.scrollY>=top&&w.scrollY<=bot);
}
function enforceViewportLimit(mode){
  if(!settings.viewportLimit)return;
  const visible=getViewportWaymarks(mode);
  if(visible.length>=1){
    const oldest=visible.sort((a,b)=>a.createdAt-b.createdAt)[0];
    removeWaymark(oldest.id);
  }
}

// ── Pin ───────────────────────────────────────────────────────────────────
function getScrollParent(el){
  if(!el||el===document.body)return null;
  const s=window.getComputedStyle(el);
  if(/auto|scroll/.test(s.overflow+s.overflowY)&&el.scrollHeight>el.clientHeight+2)return el;
  return getScrollParent(el.parentElement);
}

function placePin(id, x, y, mode, color){
  const pin=document.createElement('span');
  pin.className='waymark-pin';
  pin.dataset.waymarkId=id; pin.dataset.mode=mode;
  // Detect if the page scrolls via a container rather than window
  const scrollEl = getScrollParent(lastTarget);
  if(scrollEl && scrollEl!==document.body){
    // Position relative to scrolling container
    const rect=scrollEl.getBoundingClientRect();
    pin.style.left=(x-rect.left+scrollEl.scrollLeft-11)+'px';
    pin.style.top=(y-rect.top+scrollEl.scrollTop-30)+'px';
    pin.style.setProperty('--pin-color',color);
    pin.dataset.scrollContainer='1';
    scrollEl.style.position=scrollEl.style.position||'relative';
    makeDraggable(pin,scrollEl);
    attachPinDblClick(pin);
    scrollEl.appendChild(pin);
  } else {
    pin.style.left=(x-11)+'px'; pin.style.top=(y-30)+'px';
    pin.style.setProperty('--pin-color',color);
    makeDraggable(pin,null);
    attachPinDblClick(pin);
    document.body.appendChild(pin);
  }
}

function attachPinDblClick(pin){
  pin.addEventListener('dblclick', e=>{
    if(!(settings.pinDblClick ?? true))return;
    e.stopPropagation();
    const wm=waymarks.find(w=>w.id===pin.dataset.waymarkId);
    if(!wm)return;
    const existing=document.getElementById('wm-pin-title-input-'+wm.id);
    if(existing){existing.focus();return;}
    const inp=document.createElement('input');
    inp.id='wm-pin-title-input-'+wm.id;
    inp.className='wm-pin-title-input';
    inp.type='text';inp.placeholder='Add title…';inp.value=wm.title||'';
    inp.style.left=(parseInt(pin.style.left)+26)+'px';
    inp.style.top=(parseInt(pin.style.top)+4)+'px';
    inp.style.setProperty('--pin-color',wm.color);
    (pin.parentElement||document.body).appendChild(inp);
    inp.focus();inp.select();
    const save=()=>{
      wm.title=inp.value.trim();
      if(wm.mode==='saved')persistSaved();
      placeStickyNote(wm);updateIndicator();
      inp.remove();
    };
    inp.addEventListener('keydown',e=>{
      if(e.key==='Enter'){save();e.stopPropagation();}
      if(e.key==='Escape'){inp.remove();e.stopPropagation();}
    });
    inp.addEventListener('blur',save);
  });
}

function removePin(id){ document.querySelector(`.waymark-pin[data-waymark-id="${id}"]`)?.remove(); }

// ── Sticky note (shown on page next to pin) ───────────────────────────────
function placeStickyNote(wm){
  removeStickyNote(wm.id);
  const ptv = settings.pinTitleVis || 'always';
  if(ptv !== 'hidden' && wm.title){
    const note=document.createElement('div');
    const ptv = settings.pinTitleVis || 'always';
    note.className = 'waymark-sticky' + (ptv === 'hover' ? ' waymark-sticky-hover' : '');
    note.dataset.stickyFor=wm.id;
    note.textContent=wm.title;
    note.style.left=(wm.scrollX+16)+'px';
    note.style.top=(wm.scrollY-30)+'px';
    note.style.setProperty('--pin-color',wm.color);
    document.body.appendChild(note);
  }
}
function removeStickyNote(id){ document.querySelector(`.waymark-sticky[data-sticky-for="${id}"]`)?.remove(); }
function refreshStickyNotes(){
  document.querySelectorAll('.waymark-sticky').forEach(n=>n.remove());
  waymarks.forEach(wm=>placeStickyNote(wm));
}

// ── Draggable ─────────────────────────────────────────────────────────────
function makeDraggable(pin, container){
  let startX,startY,origLeft,origTop,dragging=false;
  pin.addEventListener('mousedown', e=>{
    if(e.button!==0)return;
    e.preventDefault(); dragging=false;
    startX=e.clientX; startY=e.clientY;
    origLeft=parseInt(pin.style.left); origTop=parseInt(pin.style.top);
    pin.style.transition='none'; pin.style.zIndex='2147483647';
    showTrashIfFloat();
    const onMove=e=>{
      const dx=e.clientX-startX, dy=e.clientY-startY;
      if(Math.abs(dx)>3||Math.abs(dy)>3) dragging=true;
      if(!dragging)return;
      pin.style.left=(origLeft+dx)+'px'; pin.style.top=(origTop+dy)+'px';
      highlightTrashIfOver(e.clientX,e.clientY);
    };
    const onUp=e=>{
      document.removeEventListener('mousemove',onMove);
      document.removeEventListener('mouseup',onUp);
      pin.style.zIndex=''; pin.style.transition='';
      if(dragging&&isOverTrash(e.clientX,e.clientY)){
        deleteWaymarkById(pin.dataset.waymarkId);
      } else if(!dragging){
        // Click on pin — if pinDblClick enabled, single click does nothing, dbl-click opens title
        // handled by dblclick listener below
      } else if(dragging){
        const wm=waymarks.find(w=>w.id===pin.dataset.waymarkId);
        if(wm){
          wm.scrollX=parseInt(pin.style.left)+11;
          wm.scrollY=parseInt(pin.style.top)+30;
          if(wm.mode==='saved')persistSaved();
          updateIndicator();
          placeStickyNote(wm);
        }
      }
      hideTrash();
    };
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
  });
}

// ── Trash ─────────────────────────────────────────────────────────────────
let trashEl=null;
function showTrashIfFloat(){
  if(trashEl)return;
  trashEl=document.createElement('div'); trashEl.id='waymark-trash'; trashEl.textContent='🗑';
  // Always show trash on drag — use position from settings if float enabled, else default bot-right
  const css=posToCSS(settings.floatingBtnPos||'bot-right');
  Object.assign(trashEl.style,css);
  if(trashEl.style.bottom!=='auto') trashEl.style.bottom=(parseInt(trashEl.style.bottom||0)+90)+'px';
  else trashEl.style.top=(parseInt(trashEl.style.top||0)+90)+'px';
  document.body.appendChild(trashEl);
}
function hideTrash(){trashEl?.remove();trashEl=null;}
function isOverTrash(cx,cy){if(!trashEl)return false;const r=trashEl.getBoundingClientRect();return cx>=r.left&&cx<=r.right&&cy>=r.top&&cy<=r.bottom;}
function highlightTrashIfOver(cx,cy){if(trashEl)trashEl.classList.toggle('wm-trash-over',isOverTrash(cx,cy));}
function deleteWaymarkById(id){
  waymarks=waymarks.filter(w=>w.id!==id);
  removePin(id); removeStickyNote(id);
  persistSaved(); updateIndicator();
}

// ── Scroll indicator — 1 click = navigate, 2 clicks = edit title ─────────
let indicator=null;
function createIndicator(){
  if(indicator)return;
  indicator=document.createElement('div');
  indicator.id='waymark-indicator';
  document.body.appendChild(indicator);
}

function updateIndicator(){
  if(!settings.scrollIndicator){indicator?.remove();indicator=null;return;}
  if(!indicator)createIndicator();
  indicator.innerHTML='';
  const pageH=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight,1);

  waymarks.forEach(wm=>{
    const pct=Math.min((wm.scrollY/pageH)*100,99);
    const wrap=document.createElement('div');
    wrap.className='wm-bm-wrap';
    wrap.style.top=pct+'%';

    const bm=document.createElement('div');
    bm.className='wm-bookmark-shape';
    bm.style.setProperty('--bm-color',wm.color);
    bm.style.setProperty('--bm-stroke',darken(wm.color));
    bm.innerHTML=`<svg viewBox="0 0 26 14" xmlns="http://www.w3.org/2000/svg"><path d="M26 0 H4 L0 7 L4 14 H26 Z"/></svg>`;

    // Sidebar bookmark: always hover-only label
    if(wm.title){
      bm.title = wm.title;
      const hoverLabel = document.createElement('div');
      hoverLabel.className = 'wm-bm-label';
      hoverLabel.textContent = wm.title;
      hoverLabel.style.setProperty('--pin-color', wm.color);
      wrap.appendChild(hoverLabel);
    } else {
      bm.title = wm.snippet || wm.section || 'Waymark';
    }

    const inp=document.createElement('input');
    inp.className='wm-bm-title-input';
    inp.type='text'; inp.placeholder='Add title…'; inp.value=wm.title||'';

    // ── Click logic: 1 click = navigate, 2nd click within 400ms = open title ──
    let lastClick=0;
    bm.addEventListener('click', e=>{
      e.stopPropagation();
      const now=Date.now();
      if(now-lastClick<400){
        // Double-click → edit title
        inp.style.display='block'; inp.focus(); inp.select();
        lastClick=0;
      } else {
        lastClick=now;
        setTimeout(()=>{
          if(lastClick===now){
            // Single click → navigate
            scrollToWaymark(wm);
          }
        }, 410);
      }
    });

    inp.addEventListener('keydown', e=>{
      if(e.key==='Enter'){
        wm.title=inp.value.trim();
        if(wm.mode==='saved')persistSaved();
        inp.style.display='none';
        placeStickyNote(wm);
        bm.title=wm.title||wm.snippet||'Waymark';
      }
      if(e.key==='Escape'){ inp.style.display='none'; inp.value=wm.title||''; }
      e.stopPropagation();
    });
    inp.addEventListener('blur',()=>{
      wm.title=inp.value.trim();
      if(wm.mode==='saved')persistSaved();
      placeStickyNote(wm);
      setTimeout(()=>{ inp.style.display='none'; },150);
    });
    inp.addEventListener('click', e=>e.stopPropagation());

    wrap.appendChild(bm);
    wrap.appendChild(inp);
    indicator.appendChild(wrap);
  });
  indicator.style.display=waymarks.length?'block':'none';
}

window.addEventListener('scroll',updateIndicator,{passive:true});
window.addEventListener('resize',updateIndicator,{passive:true});

// ── Floating button ───────────────────────────────────────────────────────
let floatBtn=null;

function posToCSS(pos){
  const m={
    'top-left':{top:'16px',left:'8px',bottom:'auto',right:'auto'},
    'top-center':{top:'16px',left:'50%',transform:'translateX(-50%)',bottom:'auto',right:'auto'},
    'top-right':{top:'16px',right:'28px',bottom:'auto',left:'auto'},
    'mid-left':{top:'50%',left:'8px',transform:'translateY(-50%)',bottom:'auto',right:'auto'},
    'mid-center':{top:'50%',left:'50%',transform:'translate(-50%,-50%)',bottom:'auto',right:'auto'},
    'mid-right':{top:'50%',right:'28px',transform:'translateY(-50%)',bottom:'auto',left:'auto'},
    'bot-left':{bottom:'80px',left:'8px',top:'auto',right:'auto'},
    'bot-center':{bottom:'80px',left:'50%',transform:'translateX(-50%)',top:'auto',right:'auto'},
    'bot-right':{bottom:'80px',right:'28px',top:'auto',left:'auto'},
  };
  return m[pos]||m['bot-right'];
}

function createFloatingBtn(){
  if(floatBtn)return;
  const oc = settings.onetimeColor || '#e8612a';
  const sc = settings.savedColor   || '#3b82f6';
  floatBtn=document.createElement('div');
  floatBtn.id='waymark-float';
  floatBtn.innerHTML=`
    <button class="wm-float-btn" id="wm-float-mark" title="Mark this spot (one-time)" style="background:${oc}">
      <svg viewBox="0 0 14 18" width="13" height="17"><path d="M1 1 H13 V17 L7 13 L1 17 Z" fill="currentColor"/></svg>
    </button>
    <button class="wm-float-btn wm-float-save" id="wm-float-save" title="Save this spot" style="background:${sc}">
      <svg viewBox="0 0 14 18" width="13" height="17"><path d="M1 1 H13 V17 L7 13 L1 17 Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
    </button>`;
  Object.assign(floatBtn.style,posToCSS(settings.floatingBtnPos||'bot-right'));
  document.body.appendChild(floatBtn);

  document.getElementById('wm-float-mark').addEventListener('click',()=>{
    const off=SPAWN_OFFSETS[floatSpawnOffset%SPAWN_OFFSETS.length]; floatSpawnOffset++;
    lastX=window.scrollX+window.innerWidth/2+off.dx;
    lastY=window.scrollY+window.innerHeight/2+off.dy;
    lastTarget=document.elementFromPoint(window.innerWidth/2,window.innerHeight/2)||document.body;
    createWaymark('onetime','',false);
  });
  document.getElementById('wm-float-save').addEventListener('click',()=>{
    const off=SPAWN_OFFSETS[floatSpawnOffset%SPAWN_OFFSETS.length]; floatSpawnOffset++;
    lastX=window.scrollX+window.innerWidth/2+off.dx;
    lastY=window.scrollY+window.innerHeight/2+off.dy;
    lastTarget=document.elementFromPoint(window.innerWidth/2,window.innerHeight/2)||document.body;
    createWaymark('saved','',false);
    browser.runtime.sendMessage({action:'triggerAutoBookmark'}).catch(()=>{});
  });
}

function removeFloatingBtn(){ floatBtn?.remove(); floatBtn=null; }

// ── Apply settings ────────────────────────────────────────────────────────
function applySettings(){
  if(settings.scrollIndicator) updateIndicator(); else{ indicator?.remove(); indicator=null; }
  // Recreate float buttons so colors refresh
  removeFloatingBtn();
  if(shouldShowFloat()) createFloatingBtn();
  if(floatBtn) Object.assign(floatBtn.style,posToCSS(settings.floatingBtnPos||'bot-right'));
  refreshStickyNotes();
  if(settings.clearOnClose){
    window.addEventListener('beforeunload', clearOnetimesOnClose);
  } else {
    window.removeEventListener('beforeunload', clearOnetimesOnClose);
  }
}

function clearOnetimesOnClose(){
  const toRemove = waymarks.filter(w=>w.mode==='onetime');
  toRemove.forEach(w=>{ removePin(w.id); removeStickyNote(w.id); });
  waymarks = waymarks.filter(w=>w.mode!=='onetime');
}

function loadSettings(){
  browser.storage.local.get('wm_settings', res=>{
    const oldSavedColor = settings.savedColor;
    if(res.wm_settings) settings={...settings,...res.wm_settings};
    // If saved color changed, update all existing saved marks
    if(settings.savedColor !== oldSavedColor){
      waymarks.forEach(wm=>{
        if(wm.mode==='saved'){
          wm.color = settings.savedColor;
          // Update pin CSS variable live
          const pin = document.querySelector(`.waymark-pin[data-waymark-id="${wm.id}"]`);
          if(pin) pin.style.setProperty('--pin-color', settings.savedColor);
          // Update sidebar bookmark color
          const bmWrap = indicator?.querySelector(`.wm-bm-wrap:nth-child(${waymarks.indexOf(wm)+1})`);
          if(bmWrap){
            const bm = bmWrap.querySelector('.wm-bookmark-shape');
            if(bm){ bm.style.setProperty('--bm-color', settings.savedColor); bm.style.setProperty('--bm-stroke', darken(settings.savedColor)); }
          }
        }
      });
      persistSaved();
      updateIndicator();
    }
    applySettings();
  });
}

// ── Load saved ────────────────────────────────────────────────────────────
function loadSaved(){
  browser.storage.local.get(storageKey(), result=>{
    const saved=result[storageKey()]||[];
    saved.forEach(wm=>{
      if(!waymarks.find(w=>w.id===wm.id)){
        placePin(wm.id,wm.scrollX,wm.scrollY,wm.mode,wm.color||settings.savedColor);
        waymarks.push(wm);
      }
    });
    loadSettings();
  });
}
loadSaved();

// ── Create waymark ────────────────────────────────────────────────────────


function createWaymark(mode, selectionText, useCenter){
  if(useCenter){
    lastX=window.scrollX+window.innerWidth/2;
    lastY=window.scrollY+window.innerHeight/2;
    lastTarget=document.elementFromPoint(window.innerWidth/2,window.innerHeight/2)||document.body;
  }
  // Proximity check — removes nearby same-type marks
  proximityCheck(lastX,lastY,mode);
  enforceViewportLimit(mode);

  const id=uid();
  const color=mode==='saved'?(settings.savedColor||'#3b82f6'):getOnetimeColor();
  const section=getSection(lastTarget);
  const snippet=getSnippet(lastTarget,selectionText);
  placePin(id,lastX,lastY,mode,color);
  const wm={id,mode,color,section,snippet,title:'',scrollX:lastX,scrollY:lastY,url:location.href,createdAt:Date.now()};
  waymarks.push(wm);
  if(mode==='saved') persistSaved();
  updateIndicator();
}

// ── Navigate ──────────────────────────────────────────────────────────────
function scrollToWaymark(wm){
  const pin=document.querySelector(`.waymark-pin[data-waymark-id="${wm.id}"]`);
  if(pin){
    pin.scrollIntoView({behavior:'smooth',block:'center'});
    pin.classList.add('waymark-pin-active');
    setTimeout(()=>pin.classList.remove('waymark-pin-active'),2000);
  } else {
    window.scrollTo({top:wm.scrollY-window.innerHeight/2,behavior:'smooth'});
  }
}

// ── Remove ────────────────────────────────────────────────────────────────
function removeWaymark(id){
  waymarks=waymarks.filter(w=>w.id!==id);
  removePin(id); removeStickyNote(id);
  persistSaved(); updateIndicator();
}

// ── Messages ──────────────────────────────────────────────────────────────
browser.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  switch(msg.action){
    case 'placeWaymark': createWaymark(msg.mode,msg.selectionText||'',!msg.useLastPos); sendResponse({ok:true}); break;
    case 'getWaymarks': sendResponse({waymarks}); break;
    case 'scrollTo': scrollToWaymark(msg.waymark); break;
    case 'removeWaymark': removeWaymark(msg.id); sendResponse({ok:true}); break;
    case 'clearPage':
      waymarks.forEach(w=>{removePin(w.id);removeStickyNote(w.id);});
      waymarks=[];persistSaved();updateIndicator(); break;
    case 'restoreWaymarks':
      msg.waymarks.forEach(wm=>{
        if(!waymarks.find(w=>w.id===wm.id)){
          placePin(wm.id,wm.scrollX,wm.scrollY,wm.mode,wm.color||settings.savedColor);
          waymarks.push(wm);
          placeStickyNote(wm);
        }
      });
      persistSaved();updateIndicator();sendResponse({ok:true}); break;
    case 'reloadSettings': loadSettings(); sendResponse({ok:true}); break;
    case 'triggerDownload': {
      const blob = new Blob([msg.json], {type:'application/json'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = msg.filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      sendResponse({ok:true});
      break;
    }
    case 'addDomain':
      browser.storage.local.get('wm_settings', res=>{
        const s=res.wm_settings||{};
        const domains=s.floatDomains||[];
        if(!domains.includes(msg.domain)){domains.push(msg.domain);s.floatDomains=domains;browser.storage.local.set({wm_settings:s});}
      });
      break;
  }
  return true;
});
