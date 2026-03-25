// popup.js — Waymark v8

let waymarks = [], currentUrl = '', currentTabId = null;
let settings = {
  theme:'dark', savedColor:'#3b82f6', onetimeColor:'#e8612a',
  floatMode:'always', floatDomains:[]
};
let allStoredWaymarks = {};

async function init() {
  ['spots','search','backup'].forEach(t =>
    document.getElementById('tab-btn-'+t).addEventListener('click', ()=>switchTab(t))
  );
  document.getElementById('header-link').addEventListener('click', e=>{e.preventDefault();browser.tabs.create({url:'https://jimmexploit.vercel.app'});});
  document.getElementById('btn-clear').addEventListener('click', ()=>confirmDialog('🗑','Clear all spots?','Removes all marks from this page.','Clear all',clearPage));
  document.getElementById('btn-add-domain').addEventListener('click', addCurrentDomain);
  document.getElementById('btn-export').addEventListener('click', exportBackup);
  document.getElementById('btn-wipe').addEventListener('click', ()=>confirmDialog('⚠️','Delete everything?','All saved marks across all pages will be permanently deleted.','Delete all',wipeAll));
  document.getElementById('search-input').addEventListener('input', onSearch);
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);
  document.getElementById('btn-settings').addEventListener('click', ()=>browser.runtime.openOptionsPage());

  const [tab] = await browser.tabs.query({active:true,currentWindow:true});
  if (!tab) return;
  currentTabId = tab.id; currentUrl = tab.url || '';
  try { document.getElementById('page-host').textContent = new URL(currentUrl).hostname; } catch {}

  const res = await browser.storage.local.get(null);
  if (res.wm_settings) settings = {...settings, ...res.wm_settings};
  Object.keys(res).filter(k=>k.startsWith('wm:')).forEach(k=>{allStoredWaymarks[k]=res[k]||[];});

  applyTheme();
  applyFont(settings.uiFont || 'Inter');
  applyLegendColors();
  await refreshSpots();
}

// ── Font ──────────────────────────────────────────────────────────────────
function applyFont(font) {
  if (!font) return;
  const stack = `'${font}', system-ui, -apple-system, sans-serif`;
  document.body.style.fontFamily = stack;
}

// ── Legend colors from settings ───────────────────────────────────────────
function applyLegendColors() {
  const ot = document.getElementById('legend-onetime');
  const sv = document.getElementById('legend-saved');
  const onetimeColor = settings.onetimeColor || '#e8612a';
  const savedColor   = settings.savedColor   || '#3b82f6';
  if (ot) { ot.style.color = onetimeColor; ot.style.background = hexAlpha(onetimeColor, 0.12); ot.style.borderRadius = '6px'; }
  if (sv) { sv.style.color = savedColor;   sv.style.background = hexAlpha(savedColor, 0.12);   sv.style.borderRadius = '6px'; }
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', settings.theme);
}
function toggleTheme() {
  settings.theme = settings.theme==='dark'?'light':'dark';
  applyTheme(); saveSettings();
}

async function saveSettings() {
  await browser.storage.local.set({wm_settings:settings});
  browser.tabs.sendMessage(currentTabId,{action:'reloadSettings'}).catch(()=>{});
}

function bareHost(hostname){
  // strip www. prefix
  return hostname.replace(/^www\./,'');
}

async function addCurrentDomain() {
  let host='';
  try{const u=new URL(currentUrl);host=bareHost(u.hostname);}catch{return;}
  const domains = settings.floatDomains||[];
  const patterns = [`*.${host}.*`, `${host}/*`, host];
  let added=0;
  patterns.forEach(p=>{ if(!domains.includes(p)){domains.push(p);added++;} });
  if(!added){showToast('Already in list');return;}
  settings.floatDomains=domains;
  await saveSettings();
  showToast('Added: '+host);
}

function showToast(msg) {
  document.querySelectorAll('.wm-toast').forEach(t=>t.remove());
  const t=document.createElement('div'); t.className='wm-toast'; t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),2000);
}

function switchTab(name) {
  ['spots','search','backup'].forEach(t=>{
    document.getElementById('tab-btn-'+t).classList.toggle('active',t===name);
    document.getElementById('tab-'+t).classList.toggle('active',t===name);
  });
  if(name==='backup') refreshStats();
  if(name==='spots')  refreshSpots();
  if(name==='search'){ renderSearchResults(null); document.getElementById('search-input').focus(); }
}

async function refreshSpots() {
  try{const r=await browser.tabs.sendMessage(currentTabId,{action:'getWaymarks'});waymarks=r?.waymarks||[];}
  catch{waymarks=[];}
  renderSpots();
}

function renderSpots() {
  const list=document.getElementById('spots-list');
  document.getElementById('count').textContent=waymarks.length;
  list.replaceChildren();
  if(!waymarks.length){
    const _em=document.createElement('div');_em.className='empty';
    _em.append('Right-click anywhere to ');
    const _b1=document.createElement('b');_b1.textContent='mark';_em.append(_b1);
    _em.append(' or ');
    const _b2=document.createElement('b');_b2.textContent='save';_em.append(_b2);
    _em.append(' a spot.');
    list.appendChild(_em);
    return;
  }
  const sc=settings.savedColor||'#3b82f6';
  waymarks.forEach(wm=>{
    const isSaved=wm.mode==='saved';
    const color=wm.color||(isSaved?sc:(settings.onetimeColor||'#e8612a'));
    const card=document.createElement('div');
    card.className='spot-card';
    card.style.borderLeftColor=color;
    const scBg=hexAlpha(sc,0.12);
    if(wm.title){
      card.innerHTML=`
        <div class="spot-title-label">📌 ${esc(wm.title)}</div>
        <div class="spot-snip">${esc(wm.snippet||'Marked spot')}</div>
        <div class="spot-meta">
          <span class="spot-time">${fmt(wm.createdAt)}</span>
          <span class="spot-badge" style="${isSaved?`background:${scBg};color:${sc}`:`background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent)`}">${isSaved?'saved':'one-time'}</span>
        </div>
        <button class="spot-del">✕</button>`;
    } else {
      card.innerHTML=`
        <div class="spot-sec">${esc(wm.section||'Page')}</div>
        <div class="spot-snip">${esc(wm.snippet||'Marked spot')}</div>
        <div class="spot-meta">
          <span class="spot-time">${fmt(wm.createdAt)}</span>
          <span class="spot-badge" style="${isSaved?`background:${scBg};color:${sc}`:`background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent)`}">${isSaved?'saved':'one-time'}</span>
          <span class="spot-dot" style="background:${color}"></span>
        </div>
        <button class="spot-del">✕</button>`;
    }
    card.addEventListener('click',e=>{if(!e.target.classList.contains('spot-del'))goTo(wm.id);});
    card.querySelector('.spot-del').addEventListener('click',e=>{e.stopPropagation();delSpot(wm.id);});
    list.appendChild(card);
  });
}

function hexAlpha(hex,a){try{const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${(n>>8)&0xff},${n&0xff},${a})`;}catch{return hex;}}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function fmt(ts){return ts?new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):''}

async function goTo(id){
  const wm=waymarks.find(w=>w.id===id);if(!wm)return;
  await browser.tabs.sendMessage(currentTabId,{action:'scrollTo',waymark:wm}).catch(()=>{});
  window.close();
}
async function delSpot(id){
  await browser.tabs.sendMessage(currentTabId,{action:'removeWaymark',id}).catch(()=>{});
  waymarks=waymarks.filter(w=>w.id!==id);renderSpots();
}
async function clearPage(){
  if(!waymarks.length)return;
  const total=waymarks.length;
  const wrap=document.getElementById('prog-wrap'),bar=document.getElementById('prog-bar');
  wrap.classList.add('on');bar.style.width='0%';
  let done=0;
  for(const wm of [...waymarks]){
    await browser.tabs.sendMessage(currentTabId,{action:'removeWaymark',id:wm.id}).catch(()=>{});
    waymarks=waymarks.filter(w=>w.id!==wm.id);done++;
    bar.style.width=(done/total*100)+'%';renderSpots();
    await new Promise(r=>setTimeout(r,55));
  }
  setTimeout(()=>{wrap.classList.remove('on');bar.style.width='0%';},350);
  // Refresh allStoredWaymarks so search tab stays consistent
  const _res=await browser.storage.local.get(null);
  Object.keys(allStoredWaymarks).forEach(k=>delete allStoredWaymarks[k]);
  Object.keys(_res).filter(k=>k.startsWith('wm:')).forEach(k=>{allStoredWaymarks[k]=_res[k]||[];});
}

// ── Search ──────────────────────────────────────────────────────────────────────
function renderSearchResults(query){
  const container = document.getElementById('search-results');
  const sc = settings.savedColor || '#3b82f6';
  let currentDomain = '';
  try { currentDomain = new URL(currentUrl).hostname; } catch{}

  const all = [];
  Object.entries(allStoredWaymarks).forEach(([key, marks])=>{
    marks.forEach(wm => all.push({key, wm}));
  });

  const filtered = query
    ? all.filter(({wm}) => {
        const hay = ((wm.title||'')+' '+(wm.snippet||'')+' '+(wm.section||'')+' '+(wm.url||'')).toLowerCase();
        return hay.includes(query);
      })
    : all;

  if(!filtered.length){
    container.innerHTML = '<div class="search-empty">'+(query ? 'No marks found.' : 'No saved marks yet.')+'</div>';
    return;
  }

  const groups = {};
  filtered.forEach(({key, wm})=>{
    const domain = key.replace('wm:','').split('/')[0];
    if(!groups[domain]) groups[domain] = [];
    groups[domain].push({key, wm});
  });

  const sortedDomains = Object.keys(groups).sort((a,b)=>{
    if(a === currentDomain) return -1;
    if(b === currentDomain) return 1;
    return a.localeCompare(b);
  });

  container.innerHTML = '';
  sortedDomains.forEach(domain => {
    const items = groups[domain];
    const isCurrent = domain === currentDomain;
    const label = document.createElement('div');
    label.className = 'search-grp';
    label.innerHTML = (isCurrent ? '<span style="color:var(--accent)">● </span>' : '') + esc(domain) + ' <span style="opacity:0.55">('+items.length+')</span>';
    container.appendChild(label);

    items.forEach(({wm})=>{
      const color = wm.color || (wm.mode==='saved' ? sc : (settings.onetimeColor||'#e8612a'));
      const card = document.createElement('div');
      card.className = 'search-card';
      card.style.borderLeftColor = color;

      const titleText = wm.title || wm.snippet || 'Marked spot';
      const displayText = query
        ? esc(titleText).replace(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'), m=>'<mark>'+m+'</mark>')
        : esc(titleText);

      let pathLabel = '';
      try {
        const u = new URL(wm.url||'');
        pathLabel = (u.pathname !== '/' ? u.pathname : '') + (u.search || '');
        if(pathLabel.length > 42) pathLabel = pathLabel.slice(0,40)+'…';
      } catch{}

      card.innerHTML = '<div class="search-card-title">'+displayText+'</div>'
        + '<div class="search-card-meta">'
        + '<span class="search-card-loc">'+esc(pathLabel||'/')+'</span>'
        + '<span class="search-card-mode" style="color:'+color+'">'+( wm.mode==='saved' ? 'saved' : 'one-time')+'</span>'
        + '</div>';
      card.addEventListener('click', ()=>navigateToMark(wm));
      container.appendChild(card);
    });
  });
}

function onSearch(){
  const q = document.getElementById('search-input').value.trim().toLowerCase();
  renderSearchResults(q || null);
}

async function navigateToMark(wm){
  const tabs=await browser.tabs.query({});
  const existing=tabs.find(t=>t.url===wm.url);
  if(existing){await browser.tabs.update(existing.id,{active:true});browser.tabs.sendMessage(existing.id,{action:'scrollTo',waymark:wm}).catch(()=>{});}
  else browser.tabs.create({url:wm.url});
  window.close();
}

// ── Backup ────────────────────────────────────────────────────────────────
async function refreshStats(){
  const all=await browser.storage.local.get(null);
  const keys=Object.keys(all).filter(k=>k.startsWith('wm:'));
  let total=0,pages=0;
  keys.forEach(k=>{const s=all[k]||[];if(s.length){total+=s.length;pages++;}});
  document.getElementById('stat-total').textContent=total;
  document.getElementById('stat-pages').textContent=pages;
}
async function exportBackup(){
  const all=await browser.storage.local.get(null);
  const pages={};
  Object.keys(all).filter(k=>k.startsWith('wm:')).forEach(k=>{if(all[k]?.length)pages[k]=all[k];});
  const _dateStr=new Date().toISOString().slice(0,10);
  const _fname=`waymarks-${_dateStr}.json`;
  // Use in-memory settings merged with stored — covers case where never explicitly saved
  const exportSettings = {...settings, ...(all.wm_settings||{})};
  const blob=new Blob([JSON.stringify({version:'1.0.1',exportedAt:new Date().toISOString(),settings:exportSettings,pages},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=_fname;a.click();URL.revokeObjectURL(a.href);
}
function importBackup(ev){
  const file=ev.target.files[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=async e=>{
    try{
      const backup=JSON.parse(e.target.result);
      if(!backup||typeof backup!=='object'){showToast('Invalid backup file');return;}
      const existing=await browser.storage.local.get(null);
      const toSet={};
      // Settings
      if(backup.settings&&Object.keys(backup.settings).length)
        toSet.wm_settings={...(existing.wm_settings||{}),...backup.settings};
      // Pages
      const pages=backup.pages||{};
      Object.keys(pages).forEach(k=>{
        if(!k.startsWith('wm:'))return;
        const incoming=Array.isArray(pages[k])?pages[k]:[];
        if(!incoming.length)return;
        const merged=[...(existing[k]||[])];
        incoming.forEach(wm=>{if(wm&&wm.id&&!merged.find(w=>w.id===wm.id))merged.push(wm);});
        toSet[k]=merged;
      });
      // Write to storage
      if(Object.keys(toSet).length){
        await browser.storage.local.set(toSet);
      }
      // Update in-memory settings
      if(toSet.wm_settings){
        settings={...settings,...toSet.wm_settings};
        applyTheme();
      }
      // Rebuild allStoredWaymarks from fresh storage read
      const fresh=await browser.storage.local.get(null);
      Object.keys(allStoredWaymarks).forEach(k=>delete allStoredWaymarks[k]);
      Object.keys(fresh).filter(k=>k.startsWith('wm:')).forEach(k=>{allStoredWaymarks[k]=fresh[k]||[];});
      // Reload current page marks on the tab
      const pk=storageKeyFor(currentUrl);
      if(toSet[pk]?.length){
        await browser.tabs.sendMessage(currentTabId,{action:'restoreWaymarks',waymarks:toSet[pk]}).catch(()=>{});
      }
      await refreshSpots();
      refreshStats();
      const total=Object.values(allStoredWaymarks).reduce((s,a)=>s+a.length,0);
      showToast('✓ Imported — '+total+' mark'+(total===1?'':'s'));
    }catch(err){
      console.error('Import error:',err);
      showToast('Could not read file');
    }
  };
  reader.readAsText(file);
  ev.target.value='';
}
async function wipeAll(){
  const all=await browser.storage.local.get(null);
  await browser.storage.local.remove(Object.keys(all).filter(k=>k.startsWith('wm:')));
  await browser.tabs.sendMessage(currentTabId,{action:'clearPage'}).catch(()=>{});
  waymarks=[];allStoredWaymarks={};renderSpots();refreshStats();
}
function storageKeyFor(url){
  try{const u=new URL(url);return 'wm:'+u.hostname+u.pathname;}catch{return 'wm:'+url.slice(0,100);}
}

function confirmDialog(icon,title,msg,label,onConfirm){
  const ov=document.createElement('div');ov.className='wm-ov';
  ov.innerHTML=`<div class="wm-dlg"><div class="wm-dlg-icon">${icon}</div><div class="wm-dlg-title">${title}</div><div class="wm-dlg-msg">${msg}</div><div class="wm-dlg-btns"><button class="wm-btn-cancel">Cancel</button><button class="wm-btn-ok">${label}</button></div></div>`;
  document.body.appendChild(ov);
  ov.querySelector('.wm-btn-cancel').addEventListener('click',()=>ov.remove());
  ov.querySelector('.wm-btn-ok').addEventListener('click',()=>{ov.remove();onConfirm();});
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
}

init();
