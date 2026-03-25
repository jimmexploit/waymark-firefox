// options.js - Waymark v8

const POS_LABELS = {
  'top-left':'Top left','top-center':'Top center','top-right':'Top right',
  'mid-left':'Middle left','mid-center':'Middle','mid-right':'Middle right',
  'bot-left':'Bottom left','bot-center':'Bottom center','bot-right':'Bottom right'
};

const ALL_ONETIME_COLORS = ['#e8612a','#e8a12a','#e82a6e','#2ae85a','#2a9de8','#a12ae8','#e8e02a','#2ae8c8'];
const ALL_SAVED_COLORS = ['#2a7de8','#3dba6e','#a12ae8','#e82a6e','#2ae8d8','#e8c02a'];

const DEFAULTS = {
  theme:'dark', scrollIndicator:true, autoBookmark:false,
  savedColor:'#3b82f6', onetimeColor:'#e8612a', multiColorOnetime:false,
  floatMode:'always', floatingBtnPos:'bot-right', viewportLimit:false,
  proximityEnabled:true, proximityPx:250,
  pinTitleVis:'always', pinDblClick:true, clearOnClose:false,
  autoBackup:false, backupFreq:'on-save', backupFilename:'waymarks-{date}.json',
  floatDomains:[], bmFolder:'', uiFont:'Inter'
};

let settings = { ...DEFAULTS };
let pendingShortcuts = {}, recordingEl = null, dirty = false;

async function init() {
  const g = id => document.getElementById(id);

  document.querySelectorAll('.nav-item').forEach(b =>
    b.addEventListener('click', () => switchPage(b.dataset.page))
  );

  g('btn-theme')?.addEventListener('click', () => {
    settings.theme = settings.theme==='dark'?'light':'dark'; applyTheme(); markDirty();
  });
  g('setting-theme')?.addEventListener('change', e => {
    settings.theme=e.target.value; applyTheme(); markDirty();
  });
  g('btn-save')?.addEventListener('click', saveAll);
  g('btn-reset')?.addEventListener('click', resetDefaults);

  // Toggles - all guarded with ?.
  ['indicator','multicolor','autobookmark','viewportlimit','clearonclose','proximityenabled','pindblclick'].forEach(id => {
    const el = g('setting-'+id);
    if (!el) return;
    el.addEventListener('change', e => {
      if (id==='proximityenabled') toggleProximityPx(e.target.checked);
      if (id==='autobookmark') { const r=g('bm-folder-row'); if(r) r.style.display=e.target.checked?'flex':'none'; }
      markDirty();
    });
  });

  g('setting-proximity')?.addEventListener('input', markDirty);
  g('setting-bmfolder')?.addEventListener('input', markDirty);
  g('setting-backupfilename')?.addEventListener('input', markDirty);
  document.querySelectorAll('input[name="backup-freq"]').forEach(r => r.addEventListener('change', markDirty));
  document.querySelectorAll('input[name="pin-title-vis"]').forEach(r => r.addEventListener('change', markDirty));
  g('setting-autobackup')?.addEventListener('change', e => {
    toggleAutoBackupRow(e.target.checked); markDirty();
  });
  g('btn-backup-now')?.addEventListener('click', triggerBackupDownload);
  g('btn-settings-import')?.addEventListener('click', ()=>g('settings-file-input')?.click());
  g('settings-file-input')?.addEventListener('change', async ev=>{
    const file=ev.target.files[0]; if(!file)return;
    const reader=new FileReader();
    reader.onload=async e=>{
      try{
        const backup=JSON.parse(e.target.result);
        if(!backup||typeof backup!=='object'){alert('Invalid backup file');return;}
        const existing=await browser.storage.local.get(null);
        const toSet={};
        if(backup.settings&&Object.keys(backup.settings).length)
          toSet.wm_settings={...(existing.wm_settings||{}),...backup.settings};
        const pages=backup.pages||{};
        Object.keys(pages).forEach(k=>{
          if(!k.startsWith('wm:'))return;
          const incoming=Array.isArray(pages[k])?pages[k]:[];
          if(!incoming.length)return;
          const merged=[...(existing[k]||[])];
          incoming.forEach(wm=>{if(wm&&wm.id&&!merged.find(w=>w.id===wm.id))merged.push(wm);});
          toSet[k]=merged;
        });
        if(Object.keys(toSet).length) await browser.storage.local.set(toSet);
        if(toSet.wm_settings){settings={...settings,...toSet.wm_settings};applyTheme();applyAllUI();}
        const btn=g('btn-settings-import');
        if(btn){const orig=btn.textContent;btn.textContent='✓ Imported';setTimeout(()=>btn.textContent=orig,2000);}
      }catch(err){alert('Could not read file: '+err.message);}
    };
    reader.readAsText(file);
    ev.target.value='';
  });

  document.querySelectorAll('input[name="sidebar-title-vis"]').forEach(r => r.addEventListener('change', markDirty));
  document.querySelectorAll('input[name="wm-font"]').forEach(r =>
    r.addEventListener('change', () => { applyFont(r.value); markDirty(); })
  );
  // Font cards
  document.querySelectorAll('.font-card').forEach(card =>
    card.addEventListener('click', () => {
      const font = card.dataset.font;
      selectFontCard(font);
      applyFont(font);
      markDirty();
    })
  );
  document.querySelectorAll('input[name="float-mode"]').forEach(r =>
    r.addEventListener('change', () => { toggleDomainsRow(); markDirty(); })
  );

  document.querySelectorAll('.pos-cell').forEach(cell =>
    cell.addEventListener('click', () => {
      document.querySelectorAll('.pos-cell').forEach(c=>c.classList.remove('selected'));
      cell.classList.add('selected');
      const lbl = g('pos-label'); if(lbl) lbl.textContent = POS_LABELS[cell.dataset.pos]||cell.dataset.pos;
      markDirty();
    })
  );

  g('btn-add-domain')?.addEventListener('click', () => addDomainRow(''));

  // Firefox: shortcuts read-only

  g('link-github')?.addEventListener('click', e => { e.preventDefault(); browser.tabs.create({url:'https://github.com/jimmexploit'}); });
  g('link-x')?.addEventListener('click', e => { e.preventDefault(); browser.tabs.create({url:'https://x.com/Gameel_ad'}); });
  g('link-kofi')?.addEventListener('click', e => { e.preventDefault(); browser.tabs.create({url:'https://ko-fi.com/jimmex04'}); });
  g('link-paypal')?.addEventListener('click', e => { e.preventDefault(); browser.tabs.create({url:'https://paypal.me/GamelAli'}); });

  const res = await browser.storage.local.get('wm_settings');
  if (res.wm_settings) settings = { ...DEFAULTS, ...res.wm_settings };
  // Always persist settings so they show up in exports
  await browser.storage.local.set({wm_settings: settings});
  rebuildSavedSwatches(); rebuildOnetimeSwatches();
  applyTheme(); applyAllUI(); await loadShortcuts();
}

function switchPage(name) {
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===name));
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+name));
}

function applyFont(font) {
  const stack = `'${font}', system-ui, -apple-system, sans-serif`;
  document.body.style.fontFamily = stack;
  document.documentElement.style.setProperty('--ui-font', stack);
  // Force all elements that use font-family: inherit to pick it up
  document.querySelectorAll('.nav-item,.scard-title,.sr-name,.sr-desc,.page-title,.page-sub,.btn-save,.btn-reset,.topbar-logo')
    .forEach(el => el.style.fontFamily = '');
}

function selectFontCard(font) {
  document.querySelectorAll('.font-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.font === font);
  });
  // also check the hidden radio
  const r = document.querySelector(`input[name="wm-font"][value="${font}"]`);
  if(r) r.checked = true;
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme',settings.theme);
  document.getElementById('btn-theme').textContent = settings.theme==='dark'?'☀️':'🌙';
  document.getElementById('setting-theme').value = settings.theme;
}

function applyAllUI() {
  const g = id => document.getElementById(id);
  if(g('setting-indicator'))         g('setting-indicator').checked         = settings.scrollIndicator;
  if(g('setting-multicolor'))        g('setting-multicolor').checked        = settings.multiColorOnetime;
  if(g('setting-autobookmark'))      g('setting-autobookmark').checked      = settings.autoBookmark;
  if(g('setting-viewportlimit'))     g('setting-viewportlimit').checked     = settings.viewportLimit;
  if(g('setting-clearonclose'))      g('setting-clearonclose').checked      = settings.clearOnClose;
  if(g('setting-pindblclick'))       g('setting-pindblclick').checked       = settings.pinDblClick ?? true;
  const ptv = settings.pinTitleVis || 'always';
  const ptvR = document.querySelector(`input[name="pin-title-vis"][value="${ptv}"]`);
  if(ptvR) ptvR.checked = true;
  if(g('setting-autobackup'))        g('setting-autobackup').checked        = settings.autoBackup;
  if(g('setting-backupfilename'))    g('setting-backupfilename').value      = settings.backupFilename || 'waymarks-{date}.json';
  const bfr = document.querySelector(`input[name="backup-freq"][value="${settings.backupFreq||'on-save'}"]`);
  if(bfr) bfr.checked = true;
  toggleAutoBackupRow(settings.autoBackup);
  if(g('setting-proximityenabled'))  g('setting-proximityenabled').checked  = settings.proximityEnabled ?? true;
  if(g('setting-proximity'))         g('setting-proximity').value           = settings.proximityPx ?? 250;
  toggleProximityPx(settings.proximityEnabled ?? true);
  // Title display
  const td = settings.titleDisplay || 'sidebar';
  const tdRadio = document.querySelector(`input[name="title-display"][value="${td}"]`);
  if(tdRadio) tdRadio.checked = true;
  if(g('setting-bmfolder'))      g('setting-bmfolder').value        = settings.bmFolder || '';
  if(g('bm-folder-row'))         g('bm-folder-row').style.display   = settings.autoBookmark ? 'flex' : 'none';
  // Font card picker
  const font = settings.uiFont || 'Inter';
  applyFont(font);
  selectFontCard(font);
  // Float mode radios
  const floatMode = settings.floatMode || 'always';
  const radioEl = document.getElementById('float-mode-'+floatMode);
  if(radioEl) radioEl.checked = true;
  toggleDomainsRow();
  const pos = settings.floatingBtnPos||'bot-right';
  document.querySelectorAll('.pos-cell').forEach(c=>c.classList.toggle('selected',c.dataset.pos===pos));
  document.getElementById('pos-label').textContent = POS_LABELS[pos]||pos;
  updateSavedColor(); rebuildOnetimeSwatches(); updateOnetimeColor();
  rebuildSavedSwatches();
  // Domain list
  document.getElementById('domain-list').innerHTML='';
  (settings.floatDomains||[]).forEach(d=>addDomainRow(d));
}

function toggleProximityPx(enabled) {
  const row = document.getElementById('proximity-px-row');
  if(row) row.style.display = enabled ? 'flex' : 'none';
}

function toggleDomainsRow() {
  const mode = document.querySelector('input[name="float-mode"]:checked')?.value || 'always';
  const dr = document.getElementById('float-domains-row');
  const pr = document.getElementById('float-position-row');
  if(dr) dr.style.display = mode==='domains' ? 'flex' : 'none';
  if(pr) pr.style.display = mode==='never'   ? 'none' : 'flex';
}

// ── Color UI ──────────────────────────────────────────────────────────────
function updateSavedColor() {
  const c=settings.savedColor;
  document.getElementById('saved-color-preview').style.background=c;
  document.getElementById('saved-color-hex').textContent=c;
  document.getElementById('saved-color-native').value=c;
  document.querySelectorAll('#saved-swatches .color-swatch').forEach(s=>s.classList.toggle('selected',s.dataset.color===c));
}

function rebuildSavedSwatches() {
  const container = document.getElementById('saved-swatches');
  container.innerHTML = '';
  // Exclude onetime color from saved options
  const available = ALL_ONETIME_COLORS.filter(c => c !== settings.onetimeColor);
  available.forEach(c => {
    const s = document.createElement('div');
    s.className = 'color-swatch' + (settings.savedColor === c ? ' selected' : '');
    s.style.background = c;
    s.dataset.color = c;
    s.addEventListener('click', () => {
      settings.savedColor = c;
      updateSavedColor();
      markDirty();
    });
    container.appendChild(s);
  });
  // Custom picker with wheel icon
  const btn = document.createElement('div');
  btn.className = 'color-picker-btn';
  btn.title = 'Custom color';
  btn.innerHTML = `<input type="color" id="saved-color-native" value="${settings.savedColor}"/>`;
  btn.querySelector('input').addEventListener('input', e => {
    settings.savedColor = e.target.value;
    updateSavedColor();
    markDirty();
  });
  container.appendChild(btn);
  // Update the preview and hex after rebuilding
  updateSavedColor();
  // If current savedColor matches onetimeColor, pick first available
  if (settings.savedColor === settings.onetimeColor && available.length) {
    settings.savedColor = available[0];
    updateSavedColor();
  }
}

function rebuildOnetimeSwatches() {
  const container = document.getElementById('onetime-swatches');
  container.innerHTML='';
  // Exclude saved color from onetime options
  const available = ALL_ONETIME_COLORS.filter(c => c !== settings.savedColor);
  available.forEach(c => {
    const s=document.createElement('div');
    s.className='color-swatch'+(settings.onetimeColor===c?' selected':'');
    s.style.background=c; s.dataset.color=c;
    s.addEventListener('click',()=>{ settings.onetimeColor=c; updateOnetimeColor(); rebuildSavedSwatches(); markDirty(); });
    container.appendChild(s);
  });
  // Custom picker with wheel icon
  const btn=document.createElement('div');
  btn.className='color-picker-btn'; btn.title='Custom color';
  btn.innerHTML=`<input type="color" id="onetime-color-native" value="${settings.onetimeColor}"/>`;
  btn.querySelector('input').addEventListener('input',e=>{
    settings.onetimeColor=e.target.value; updateOnetimeColor(); rebuildSavedSwatches(); markDirty();
  });
  container.appendChild(btn);
  // If current onetimeColor matches savedColor, pick first available
  if (settings.onetimeColor===settings.savedColor && available.length) {
    settings.onetimeColor=available[0];
  }
  updateOnetimeColor();
}

function updateOnetimeColor() {
  const c=settings.onetimeColor;
  document.getElementById('onetime-color-preview').style.background=c;
  document.getElementById('onetime-color-hex').textContent=c;
  document.querySelectorAll('#onetime-swatches .color-swatch').forEach(s=>s.classList.toggle('selected',s.dataset.color===c));
}

function rebuildSavedSwatches() {
  const container = document.getElementById('saved-swatches');
  container.innerHTML = '';
  // Exclude onetime color from saved options
  const available = ALL_SAVED_COLORS.filter(c => c !== settings.onetimeColor);
  available.forEach(c => {
    const s = document.createElement('div');
    s.className = 'color-swatch' + (settings.savedColor === c ? ' selected' : '');
    s.style.background = c;
    s.dataset.color = c;
    s.addEventListener('click', () => {
      settings.savedColor = c;
      updateSavedColor();
      rebuildOnetimeSwatches();
      markDirty();
    });
    container.appendChild(s);
  });
  // Custom picker with wheel icon
  const btn = document.createElement('div');
  btn.className = 'color-picker-btn';
  btn.title = 'Custom color';
  btn.innerHTML = `<input type="color" id="saved-color-native" value="${settings.savedColor}"/>`;
  btn.querySelector('input').addEventListener('input', e => {
    settings.savedColor = e.target.value;
    updateSavedColor();
    rebuildOnetimeSwatches();
    markDirty();
  });
  container.appendChild(btn);
  // If current savedColor matches onetimeColor, pick first available
  if (settings.savedColor === settings.onetimeColor && available.length) {
    settings.savedColor = available[0];
  }
  updateSavedColor();
}

// ── Domain patterns ───────────────────────────────────────────────────────
function addDomainRow(val) {
  const list=document.getElementById('domain-list');
  const row=document.createElement('div'); row.className='domain-row';
  const input=document.createElement('input'); input.className='domain-input';
  input.type='text'; input.placeholder='e.g. *.github.io or medium.com';
  input.value=val; input.addEventListener('input',markDirty);
  const del=document.createElement('button'); del.className='domain-del'; del.textContent='×';
  del.addEventListener('click',()=>{ row.remove(); markDirty(); });
  row.appendChild(input); row.appendChild(del); list.appendChild(row);
}

function getDomains() {
  return [...document.querySelectorAll('.domain-input')].map(i=>i.value.trim()).filter(Boolean);
}

// ── Shortcut recorder ─────────────────────────────────────────────────────
async function loadShortcuts() {
  try {
    const cmds = await browser.commands.getAll();
    cmds.forEach(c=>{
      const key = c.name==='mark-spot'?'mark':c.name==='save-spot'?'save':null;
      if(!key) return;
      const el = document.getElementById('rec-'+key);
      if(el){ el.textContent = c.shortcut||'Not set'; el.dataset.current = c.shortcut||''; }
    });
  } catch(e){ console.warn('loadShortcuts:', e); }
}
function startRecording(el,command) {
  if(recordingEl)stopRecording(true);
  recordingEl=el; el.classList.add('recording'); el.textContent='Press keys…'; el.dataset.recording='1';
}
function stopRecording(cancel) {
  if(!recordingEl)return;
  recordingEl.classList.remove('recording'); delete recordingEl.dataset.recording;
  if(cancel) recordingEl.textContent=recordingEl.dataset.current||'Not set';
  recordingEl=null;
}
function onKeyDown(e) {
  if(!recordingEl)return;
  if(e.key==='Escape'){stopRecording(true);return;}
  e.preventDefault();
  if(['Control','Alt','Shift','Meta'].includes(e.key))return;
  if(!e.ctrlKey&&!e.altKey){showHint(recordingEl,'Must include Ctrl or Alt');return;}
  const parts=[];
  if(e.ctrlKey)parts.push('Ctrl');
  if(e.altKey)parts.push('Alt');
  if(e.shiftKey)parts.push('Shift');
  parts.push(e.key.length===1?e.key.toUpperCase():e.key);
  const combo=parts.join('+');
  pendingShortcuts[recordingEl.dataset.command]=combo;
  recordingEl.textContent=combo; recordingEl.dataset.current=combo;
  showHint(recordingEl,'Will be saved when you click Save');
  stopRecording(false); markDirty();
}
function showHint(el,msg) {
  const id=el.id.includes('mark')?'hint-mark':'hint-save';
  const h=document.getElementById(id);
  if(h){h.textContent=msg;setTimeout(()=>h.textContent='',3000);}
}
function clearShortcut(command,el) {
  pendingShortcuts[command]=''; el.textContent='Not set'; el.dataset.current=''; markDirty();
}

// ── Reset defaults ────────────────────────────────────────────────────────
async function resetDefaults() {
  if(!confirm('Reset all settings to defaults? Your spots will not be affected.'))return;
  settings={...DEFAULTS};
  await browser.storage.local.set({wm_settings:settings});
  applyTheme(); applyAllUI();
  const tabs=await browser.tabs.query({});
  tabs.forEach(t=>browser.tabs.sendMessage(t.id,{action:'reloadSettings'}).catch(()=>{}));
  dirty=false;
  const btn=document.getElementById('btn-save');
  btn.textContent='✓ Reset'; btn.classList.add('saved');
  setTimeout(()=>{btn.textContent='Save settings';btn.classList.remove('saved');},2000);
}

// ── Save ──────────────────────────────────────────────────────────────────
function markDirty() {
  dirty=true;
  const btn=document.getElementById('btn-save');
  btn.textContent='Save settings'; btn.classList.remove('saved');
}

// f hena issue check later 
async function saveAll() {
  const g = id => document.getElementById(id);
  settings.scrollIndicator   = g('setting-indicator').checked;
  settings.floatMode         = document.querySelector('input[name="float-mode"]:checked')?.value || 'always';
  settings.multiColorOnetime = g('setting-multicolor').checked;
  settings.autoBookmark      = g('setting-autobookmark').checked;
  settings.viewportLimit     = g('setting-viewportlimit').checked;
  settings.stickyNote        = g('setting-stickynote')?.checked ?? false;
  settings.clearOnClose      = g('setting-clearonclose')?.checked ?? false;
  settings.autoBackup        = g('setting-autobackup')?.checked ?? false;
  settings.backupFreq        = document.querySelector('input[name="backup-freq"]:checked')?.value || 'on-save';
  settings.backupFilename    = g('setting-backupfilename')?.value.trim() || 'waymarks-{date}.json';
  settings.proximityEnabled  = g('setting-proximityenabled')?.checked ?? true;
  settings.proximityPx       = parseInt(g('setting-proximity')?.value) || 250;
  settings.pinTitleVis       = document.querySelector('input[name="pin-title-vis"]:checked')?.value || 'always';
  settings.pinDblClick       = g('setting-pindblclick')?.checked ?? true;
  settings.uiFont            = document.querySelector('input[name="wm-font"]:checked')?.value || 'Inter';
  settings.bmFolder          = g('setting-bmfolder')?.value.trim() || '';
  settings.floatDomains      = getDomains();
  const sel = document.querySelector('.pos-cell.selected');
  if(sel) settings.floatingBtnPos = sel.dataset.pos;

  await browser.storage.local.set({wm_settings:settings});

  // Firefox: shortcuts managed via about:addons
  pendingShortcuts={};

  const tabs=await browser.tabs.query({});
  tabs.forEach(t=>browser.tabs.sendMessage(t.id,{action:'reloadSettings'}).catch(()=>{}));

  dirty=false;
  const btn=document.getElementById('btn-save');
  btn.textContent='✓ Saved'; btn.classList.add('saved');
  setTimeout(()=>{btn.textContent='Save settings';btn.classList.remove('saved');},2200);
  await loadShortcuts();
}

function toggleAutoBackupRow(enabled) {
  const fnRow  = document.getElementById('autobackup-filename-row');
  const optRow = document.getElementById('autobackup-options-row');
  if(fnRow)  fnRow.style.display  = enabled ? 'flex' : 'none';
  if(optRow) optRow.style.display = enabled ? 'flex' : 'none';
}

async function triggerBackupDownload() {
  const all = await browser.storage.local.get(null);
  const pages = {};
  Object.keys(all).filter(k=>k.startsWith('wm:')).forEach(k=>{ if(all[k]?.length) pages[k]=all[k]; });
  const blob = new Blob([JSON.stringify({
    version:'1.0.1',
    exportedAt: new Date().toISOString(),
    settings: all.wm_settings || {},
    pages
  }, null, 2)], {type:'application/json'});
  const dateStr = new Date().toISOString().slice(0,10);
  const raw = (settings.backupFilename || 'waymarks-{date}.json').replace('{date}', dateStr);
  const filename = raw.endsWith('.json') ? raw : raw + '.json';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  // Reset the schedule timer so next auto-backup counts from now
  await browser.storage.local.set({ wm_last_backup: Date.now() });
  const btn = document.getElementById('btn-backup-now');
  if(btn){ const orig=btn.textContent; btn.textContent='✓ Downloaded'; setTimeout(()=>btn.textContent=orig, 2000); }
}

window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
init();
