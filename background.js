// background.js — Waymark 1.0.1 (Firefox MV2)

browser.runtime.onInstalled.addListener(()=>{
  browser.contextMenus.removeAll().then(()=>{
    browser.contextMenus.create({id:'waymark-onetime', title:'📌 Mark this spot', contexts:['all']});
    browser.contextMenus.create({id:'waymark-save',    title:'🔖 Save this spot',  contexts:['all']});
    browser.contextMenus.create({id:'waymark-sep',     type:'separator',            contexts:['all']});
    browser.contextMenus.create({id:'waymark-add-domain', title:'➕ Add this site to Waymark float list', contexts:['all']});
  });
});

browser.contextMenus.onClicked.addListener(async(info,tab)=>{
  if(!tab?.id) return;
  if(info.menuItemId==='waymark-add-domain'){
    try{
      const raw=new URL(tab.url).hostname;
      const host=raw.replace(/^www\./,'');
      const res=await browser.storage.local.get('wm_settings');
      const s=res.wm_settings||{};
      const domains=s.floatDomains||[];
      const patterns=[`*.${host}.*`,`${host}/*`,host];
      let changed=false;
      patterns.forEach(p=>{if(!domains.includes(p)){domains.push(p);changed=true;}});
      if(changed){s.floatDomains=domains;await browser.storage.local.set({wm_settings:s});}
      browser.tabs.sendMessage(tab.id,{action:'reloadSettings'}).catch(()=>{});
    }catch{}
    return;
  }
  const mode=info.menuItemId==='waymark-save'?'saved':'onetime';
  browser.tabs.sendMessage(tab.id,{action:'placeWaymark',mode,selectionText:info.selectionText||'',useLastPos:true}).catch(()=>{});
  if(mode==='saved'){ await maybeBookmark(tab); await maybeAutoBackup(tab); }
});

// Firefox: onCommand provides command string only — query active tab separately
browser.commands.onCommand.addListener(async(command)=>{
  const tabs = await browser.tabs.query({active:true, currentWindow:true});
  const tab = tabs[0];
  if(!tab?.id) return;
  const mode=command==='save-spot'?'saved':'onetime';
  browser.tabs.sendMessage(tab.id,{action:'placeWaymark',mode,selectionText:'',useLastPos:false}).catch(()=>{});
  if(mode==='saved'){ await maybeBookmark(tab); await maybeAutoBackup(tab); }
});

async function maybeAutoBackup(tab) {
  const res = await browser.storage.local.get(null);
  const s = res.wm_settings || {};
  if(!s.autoBackup) return;
  const freq = s.backupFreq || 'on-save';
  if(freq === 'on-close') return; // handled by beforeunload below

  if(freq === 'daily' || freq === 'every-2-days' || freq === 'weekly') {
    const lastBackup = res.wm_last_backup || 0;
    const now = Date.now();
    const msPerDay = 86400000;
    const thresholds = { daily: msPerDay, 'every-2-days': 2*msPerDay, weekly: 7*msPerDay };
    if(now - lastBackup < thresholds[freq]) return;
  }

  await runBackup(tab, s);
  await browser.storage.local.set({ wm_last_backup: Date.now() });
}

async function runBackup(tab, s) {
  const res = await browser.storage.local.get(null);
  const filename = (s.backupFilename || 'waymarks-{date}.json')
    .replace('{date}', new Date().toISOString().slice(0,10));
  const pages = {};
  Object.keys(res).filter(k=>k.startsWith('wm:')).forEach(k=>{ if(res[k]?.length) pages[k]=res[k]; });
  const json = JSON.stringify({ version:'1.0.1', exportedAt:new Date().toISOString(), settings:s, pages }, null, 2);
  if(tab?.id) browser.tabs.sendMessage(tab.id, {action:'triggerDownload', filename, json}).catch(()=>{});
}

// on-close backup — MV2 persistent background page can use beforeunload
window.addEventListener('beforeunload', async () => {
  const res = await browser.storage.local.get('wm_settings');
  const s = res.wm_settings || {};
  if(!s.autoBackup || s.backupFreq !== 'on-close') return;
  const tabs = await browser.tabs.query({ active:true, currentWindow:true });
  if(tabs[0]) await runBackup(tabs[0], s);
});

async function maybeBookmark(tab){
  const res=await browser.storage.local.get('wm_settings');
  const s=res.wm_settings||{};
  if(!s.autoBookmark||!tab.url||!tab.title) return;
  const existing=await browser.bookmarks.search({url:tab.url});
  if(existing.length) return;
  const folderName=(s.bmFolder||'').trim();
  if(!folderName){browser.bookmarks.create({title:tab.title,url:tab.url}).catch(()=>{});return;}
  const folders=await browser.bookmarks.search({title:folderName});
  const folder=folders.find(f=>!f.url);
  if(folder){browser.bookmarks.create({parentId:folder.id,title:tab.title,url:tab.url}).catch(()=>{});}
  else{const nf=await browser.bookmarks.create({title:folderName});browser.bookmarks.create({parentId:nf.id,title:tab.title,url:tab.url}).catch(()=>{});}
}

