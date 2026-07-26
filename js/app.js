/* ============================================================
   UCN COMMS LOG — application logic
   State is held in memory and mirrored to localStorage after every
   mutation, so a refresh or a crash mid-session doesn't lose the log.
   PDF report generation lives in js/pdf-export.js and pulls its heavy
   vendor assets in on demand.
   ============================================================ */

const UCN_CAST = ["Angaharad 'Angie' Talbot", "Aquila Nova", "Athena Hamilton", "Bec Dallas", "Ben Rhydding", "Billy Wallace", "Calliope 'Callie' Kihu", "Casper Bartholin", "Chef Lucia Vittorini", "Cora Dent", "Danni Acharya", "Darius Gray", "Dr. Andrew Barnes", "Dr. Brian 'Bo' Murphy", "Dr. Kennedy Greene", "Dr. Oliver Nightingale", "Eagle", "Edward 'Dingers' Bell", "Egon Larsen", "Emilia Sultana", "Esther Gefen", "Frederica 'Freddie' Moore", "Gilbert 'Teddy' Fraser", "Huey Carson", "J.U.D.I.T.H.", "Jack Talisker", "Jasmine Hannover", "Jay Washburne", "Jeremy Stockwell", "Joanna Campbell", "Jordan Simpson", "Julio Ferreira", "Kate Thursday", "Kenneth Collingwood", "Layla Talwar", "Leon Grant", "Marcus Segretto", "Neil Bell", "Nurse Nathan Kilmore", "Ozymandias 'Oz' Willcox", "Robert Lyon", "Roger Taylor", "Rowen Jones", "Sam Falco", "Saskia Ubosi", "Shirley Bishop", "Stjerne Olsen", "Tanya Scott", "Uzoma Adebayo", "Wi Yun Moon"];

/* Quick actions live in the entry sheet, grouped by kind. Groups are
   always expanded — a collapsed group is a tap between the operative and
   an action they need now. */
const QUICK_GROUPS = [
  { label: 'Comms', items: ['COMMS OPENED', 'COMMS CLOSED'] },
  { label: 'Video', items: ['VIDEO COMMS STARTED', 'VIDEO COMMS ENDED', 'VIDEO COMMS TRANSFERRED TO BRIDGE'] }
];

const WARSPITE_QUICK = [
  'NUCLEAR AUTHORIZATION REQUESTED',
  'NUCLEAR AUTHORIZATION DECLINED',
  'FC ADVISED OF CODE OMEGA UVP ACTIVITY',
  'FC ADVISED OF REQUEST FOR URGENT SUPPORT'
];

const STORAGE_KEY = 'ucnCommsLogState_v1';
const INTRO_SEEN_KEY = 'ucnCommsLogIntroSeen_v1';

/* Entries timed up to this many minutes before the briefing time are read
   as pre-mission rather than as next-day traffic. Everything else earlier
   than the briefing time is treated as after midnight. */
const PRE_MISSION_GRACE_MIN = 120;

/* ---------------- helpers ---------------- */
function uid(prefix){ return prefix + '-' + Math.random().toString(36).slice(2,9) + Date.now().toString(36); }
function pad2(n){ return String(n).padStart(2,'0'); }
function nowHHMM(){ const d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
/* Local date — toISOString() would hand back the UTC day and roll over early. */
function todayISO(){ const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function asString(v){ return typeof v === 'string' ? v : ''; }

function timeToMinutes(t){
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t == null ? '' : t).trim());
  if(!m) return null;
  const h = parseInt(m[1], 10), mm = parseInt(m[2], 10);
  if(h > 23 || mm > 59) return null;
  return h * 60 + mm;
}
function normaliseTime(t){
  const mins = timeToMinutes(t);
  return mins == null ? '' : pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60);
}

/* Sort position relative to the briefing time, so a mission that runs past
   midnight keeps 23:50 → 00:15 in the order it actually happened. */
function entryOrder(entry){
  const mins = timeToMinutes(entry && entry.time);
  if(mins == null) return -Infinity;
  const anchor = timeToMinutes(state.briefing.time);
  if(anchor == null) return mins;
  return ((mins - anchor + 1440 + PRE_MISSION_GRACE_MIN) % 1440) - PRE_MISSION_GRACE_MIN;
}
function entrySort(a, b){
  const d = entryOrder(a) - entryOrder(b);
  if(d) return d;
  return (Number.isFinite(a.ts) ? a.ts : 0) - (Number.isFinite(b.ts) ? b.ts : 0);
}

/* ---------------- state ---------------- */
function defaultBriefing(){
  return {
    opName:'', opRank:'', missionName:'', shipName:'', fc:'', date: todayISO(), time: nowHHMM(),
    capName:'', capRank:''
  };
}

function makeDefaultWarspite(){
  return {
    id: 'ship-warspite-default',
    name: 'UCS Warspite',
    affiliation: 'UCN Fleet Command',
    type: 'Flagship',
    special: true,
    entries: []
  };
}

let state = { briefing: defaultBriefing(), ships: [ makeDefaultWarspite() ] };
let currentShipId = null;
let editingEntryId = null;
let storageOk = true;

function initState(){
  state = { briefing: defaultBriefing(), ships: [ makeDefaultWarspite() ] };
}

/* ---------------- validation / normalisation ----------------
   Shared by JSON import and localStorage restore. Nothing reaches `state`
   until the whole payload has come through here intact. */
function normaliseBriefing(raw){
  const b = defaultBriefing();
  if(raw && typeof raw === 'object'){
    Object.keys(b).forEach(k => { if(typeof raw[k] === 'string') b[k] = raw[k]; });
    if(b.time) b.time = normaliseTime(b.time) || b.time;
  }
  return b;
}

function normaliseEntry(raw){
  if(!raw || typeof raw !== 'object') return null;
  const text = asString(raw.text);
  if(!text.trim()) return null;
  return {
    id: asString(raw.id) || uid('entry'),
    time: normaliseTime(raw.time),
    text,
    ts: Number.isFinite(raw.ts) ? raw.ts : Date.now()
  };
}

function normaliseShip(raw){
  if(!raw || typeof raw !== 'object') return null;
  const name = asString(raw.name).trim();
  if(!name) return null;
  return {
    id: asString(raw.id) || uid('ship'),
    name,
    affiliation: asString(raw.affiliation).trim(),
    type: asString(raw.type).trim(),
    special: !!raw.special,
    entries: Array.isArray(raw.entries) ? raw.entries.map(normaliseEntry).filter(Boolean) : []
  };
}

/* Throws an Error whose message is safe to show the operator. */
function normaliseLog(raw){
  if(!raw || typeof raw !== 'object' || Array.isArray(raw)){
    throw new Error("That file isn't a UCN comms log.");
  }
  if(!('briefing' in raw) && !('ships' in raw)){
    throw new Error("That file has no briefing or ships — not a UCN comms log.");
  }
  if('ships' in raw && !Array.isArray(raw.ships)){
    throw new Error("That log's ship list is malformed — nothing was imported.");
  }
  const ships = Array.isArray(raw.ships) ? raw.ships.map(normaliseShip).filter(Boolean) : [];
  const seenIds = new Set();
  ships.forEach(s => {
    while(seenIds.has(s.id)) s.id = uid('ship');
    seenIds.add(s.id);
  });
  /* UCS Warspite is always on the board. */
  if(!ships.some(s => s.special)) ships.unshift(makeDefaultWarspite());
  return { briefing: normaliseBriefing(raw.briefing), ships };
}

/* ---------------- persistence ---------------- */
function probeStorage(){
  try{
    localStorage.setItem(STORAGE_KEY + '_probe', '1');
    localStorage.removeItem(STORAGE_KEY + '_probe');
    storageOk = true;
  }catch(e){ storageOk = false; }
}

function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      briefing: state.briefing,
      ships: state.ships
    }));
    storageOk = true;
  }catch(e){
    storageOk = false;
  }
}

function clearSavedState(){
  try{ localStorage.removeItem(STORAGE_KEY); }catch(e){ /* storage unavailable, ignore */ }
}

function readSavedState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}

function briefingHasContent(b){
  return Object.keys(b).some(k => k !== 'date' && k !== 'time' && b[k]);
}

function hasLoggedContent(){
  return state.ships.some(s => s.entries.length > 0) ||
         state.ships.length > 1 ||
         briefingHasContent(state.briefing);
}

/* Returns the savedAt stamp when something was restored, otherwise null. */
function restoreSavedState(){
  const raw = readSavedState();
  if(!raw) return null;
  let restored;
  try{
    restored = normaliseLog(raw);
  }catch(err){
    clearSavedState();
    return null;
  }
  const worthRestoring = restored.ships.some(s => s.entries.length > 0) ||
                         restored.ships.length > 1 ||
                         briefingHasContent(restored.briefing);
  if(!worthRestoring) return null;
  state = restored;
  return asString(raw.savedAt) || '';
}

function formatSavedAt(iso){
  const d = new Date(iso);
  if(isNaN(d.getTime())) return 'earlier';
  const time = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? time : d.toLocaleDateString() + ' ' + time;
}

/* Every mutation goes through here: persist, then repaint. */
function commit(){
  saveState();
  renderAll();
}

/* ---------------- toast ---------------- */
let toastTimer = null;
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> el.classList.remove('show'), 2400);
}

/* ---------------- panel / tabs ---------------- */
function togglePanel(id){
  document.getElementById(id).classList.toggle('collapsed');
}
const TAB_NAMES = ['briefing', 'overall', 'ships', 'export'];
function switchTab(tab){
  document.querySelectorAll('.bottom-tab-btn').forEach(b => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  TAB_NAMES.forEach(name => {
    document.getElementById('tab-' + name).classList.toggle('active', name === tab);
  });
  /* Warm the PDF vendor bundle while the operator reads the export blurb. */
  if(tab === 'export' && typeof window.preloadPdfAssets === 'function') window.preloadPdfAssets();
}

/* ---------------- briefing fields ---------------- */
const BRIEFING_FIELD_IDS = {
  opName:'opName', opRank:'opRank', missionName:'missionName', shipName:'shipName',
  date:'missionDate', time:'missionTime', capName:'capName', capRank:'capRank'
};

/* Listeners are attached exactly once, at init. */
function wireBriefingFields(){
  Object.keys(BRIEFING_FIELD_IDS).forEach(key => {
    const el = document.getElementById(BRIEFING_FIELD_IDS[key]);
    const onChange = () => {
      state.briefing[key] = el.value;
      saveState();
      /* The briefing time anchors log ordering, so a change repaints. */
      if(key === 'time') renderOverallLog();
    };
    el.addEventListener('input', onChange);
    el.addEventListener('change', onChange);
  });
}

/* Pushes state into the form. Safe to call as often as needed. */
function applyStateToUi(){
  Object.keys(BRIEFING_FIELD_IDS).forEach(key => {
    document.getElementById(BRIEFING_FIELD_IDS[key]).value = state.briefing[key] || '';
  });
  document.getElementById('fcInput').value = state.briefing.fc || '';
}

/* ---------------- flight controller combobox ---------------- */
let fcMatches = [];
let fcHighlight = -1;

function wireFcCombo(){
  const input = document.getElementById('fcInput');
  const list = document.getElementById('fcList');

  function renderList(items){
    fcMatches = items;
    fcHighlight = items.length ? 0 : -1;
    if(items.length === 0){
      list.innerHTML = '<div class="none">No matching character</div>';
    } else {
      list.innerHTML = items.map((name, i) =>
        `<div role="option" id="fcOpt-${i}" aria-selected="${i === 0 ? 'true' : 'false'}" class="${i === 0 ? 'hi' : ''}" data-name="${escapeHtml(name)}">${escapeHtml(name)}</div>`
      ).join('');
    }
    list.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    syncHighlight();
  }

  function closeList(){
    list.classList.remove('open');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    fcHighlight = -1;
  }

  function syncHighlight(){
    const opts = list.querySelectorAll('[data-name]');
    opts.forEach((el, i) => {
      const on = i === fcHighlight;
      el.classList.toggle('hi', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
      if(on){
        input.setAttribute('aria-activedescendant', el.id);
        if(typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function choose(name){
    input.value = name;
    state.briefing.fc = name;
    saveState();
    closeList();
  }

  input.addEventListener('focus', () => renderList(UCN_CAST.slice().sort()));
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    renderList(UCN_CAST.filter(n => n.toLowerCase().includes(q)).sort());
    state.briefing.fc = input.value;
    saveState();
  });

  input.addEventListener('keydown', (e) => {
    const open = list.classList.contains('open');
    if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      if(!open){ renderList(UCN_CAST.slice().sort()); return; }
      if(!fcMatches.length) return;
      e.preventDefault();
      fcHighlight = (fcHighlight + (e.key === 'ArrowDown' ? 1 : -1) + fcMatches.length) % fcMatches.length;
      syncHighlight();
    } else if(e.key === 'Enter'){
      if(open && fcHighlight >= 0 && fcMatches[fcHighlight]){
        e.preventDefault();
        choose(fcMatches[fcHighlight]);
      }
    } else if(e.key === 'Escape'){
      if(open){ e.stopPropagation(); closeList(); }
    }
  });

  list.addEventListener('mousedown', (e) => {
    const target = e.target.closest('[data-name]');
    if(!target) return;
    e.preventDefault();
    choose(target.dataset.name);
  });

  document.addEventListener('click', (e) => {
    if(!document.getElementById('fcCombo').contains(e.target)) closeList();
  });
}

/* ---------------- rendering: overall log ---------------- */
function getAllEntriesSorted(){
  const all = [];
  state.ships.forEach(s => {
    s.entries.forEach(e => all.push({ time: e.time, text: e.text, ts: e.ts, shipName: s.name }));
  });
  return all.sort(entrySort);
}

function renderOverallLog(){
  const wrap = document.getElementById('overallTableWrap');
  const all = getAllEntriesSorted();
  if(all.length === 0){
    wrap.innerHTML = `<div class="empty-state"><strong>NO TRANSMISSIONS LOGGED</strong>Log communications from the "Ships Spoken To" tab — every entry will appear here in time order.</div>`;
    return;
  }
  const rows = all.map(e => `
    <tr>
      <td class="tag-time">${escapeHtml(e.time || '--:--')}</td>
      <td class="tag-ship">${escapeHtml(e.shipName)}</td>
      <td>${escapeHtml(e.text)}</td>
    </tr>`).join('');
  wrap.innerHTML = `
    <table class="log-table">
      <thead><tr><th style="width:80px;">Time</th><th style="width:180px;">Ship</th><th>What Was Said</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ---------------- rendering: ship grid ---------------- */
function renderShipGrid(){
  const grid = document.getElementById('shipGrid');
  grid.innerHTML = state.ships.map(s => `
    <div class="ship-card${s.special ? ' default' : ''}" role="button" tabindex="0"
         aria-label="Open comms log for ${escapeHtml(s.name)}" data-ship-id="${escapeHtml(s.id)}">
      <h3>${escapeHtml(s.name)}</h3>
      <div class="meta-line"><b>Affiliation:</b> ${escapeHtml(s.affiliation || '—')}</div>
      <div class="meta-line"><b>Type:</b> ${escapeHtml(s.type || '—')}</div>
      <div class="entry-count">${s.entries.length} ENTR${s.entries.length===1?'Y':'IES'} LOGGED</div>
    </div>`).join('');
  grid.querySelectorAll('.ship-card').forEach(card => {
    const open = () => openShipModal(card.getAttribute('data-ship-id'));
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); }
    });
  });
}

function renderAll(){
  renderOverallLog();
  renderShipGrid();
}

/* ---------------- ships ---------------- */
function getShip(id){ return state.ships.find(s => s.id === id); }

function shipNameTaken(name, exceptId){
  const key = name.trim().toLowerCase();
  return state.ships.some(s => s.id !== exceptId && s.name.trim().toLowerCase() === key);
}

function addShip(){
  const nameEl = document.getElementById('newShipName');
  const affEl = document.getElementById('newShipAffiliation');
  const typeEl = document.getElementById('newShipType');
  const name = nameEl.value.trim();
  if(!name){ toast('Enter a ship name first.'); nameEl.focus(); return; }
  if(shipNameTaken(name)){ toast(`${name} is already on the board.`); nameEl.focus(); return; }
  state.ships.push({
    id: uid('ship'),
    name,
    affiliation: affEl.value.trim(),
    type: typeEl.value.trim(),
    special: false,
    entries: []
  });
  nameEl.value = ''; affEl.value = ''; typeEl.value = '';
  commit();
  toast(`${name} added to Ships Spoken To.`);
}

function saveShipDetails(){
  const ship = getShip(currentShipId);
  if(!ship) return;
  const nameEl = document.getElementById('editShipName');
  const name = nameEl.value.trim();
  if(!name){ toast('A ship needs a name.'); nameEl.focus(); return; }
  if(shipNameTaken(name, ship.id)){ toast(`${name} is already on the board.`); nameEl.focus(); return; }
  ship.name = name;
  ship.affiliation = document.getElementById('editShipAffiliation').value.trim();
  ship.type = document.getElementById('editShipType').value.trim();
  commit();
  setModalHeader(ship);
  const label = document.getElementById('modalShipLabel');
  if(label) label.textContent = ship.name;
  if(entrySheetOpen()) document.getElementById('entrySheetTitle').textContent = 'LOG ENTRY — ' + ship.name.toUpperCase();
  toggleShipDetails();
  toast('Ship details updated.');
}

function removeCurrentShip(){
  const ship = getShip(currentShipId);
  if(!ship) return;
  if(ship.special){ toast('UCS Warspite is a fixture — it can\'t be removed.'); return; }
  const count = ship.entries.length;
  const ok = window.confirm(
    `Remove ${ship.name}?` + (count ? `\n\nIts ${count} logged ${count === 1 ? 'entry' : 'entries'} will be deleted too.` : '')
  );
  if(!ok) return;
  state.ships = state.ships.filter(s => s.id !== ship.id);
  closeShipModal();
  commit();
  toast(`${ship.name} removed.`);
}

/* ---------------- ship modal ---------------- */
let lastFocusedBeforeModal = null;

function setModalHeader(ship){
  document.getElementById('modalShipName').textContent = ship.name.toUpperCase();
  document.getElementById('modalShipMeta').textContent =
    `${ship.affiliation || 'Affiliation unknown'} · ${ship.type || 'Type unknown'}`;
}

function openShipModal(id){
  const ship = getShip(id);
  if(!ship) return;
  currentShipId = id;
  editingEntryId = null;
  lastFocusedBeforeModal = document.activeElement;
  setModalHeader(ship);
  document.getElementById('modalBody').innerHTML = buildModalBodyHtml(ship);
  renderEntryList();
  document.getElementById('shipDetailsBtn').setAttribute('aria-expanded', 'false');
  const overlay = document.getElementById('shipModalOverlay');
  overlay.classList.add('open');
  overlay.scrollTop = 0;
  const first = document.getElementById('logEntryBtn');
  if(first) first.focus();
}

function closeShipModal(){
  document.getElementById('entrySheetOverlay').classList.remove('open');
  document.getElementById('shipModalOverlay').classList.remove('open');
  currentShipId = null;
  editingEntryId = null;
  if(lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') lastFocusedBeforeModal.focus();
  lastFocusedBeforeModal = null;
}

/* The ship modal is a log view: details editor (hidden behind the header
   pencil), the one action that opens the entry sheet, then the log. */
function buildModalBodyHtml(ship){
  const removeBtn = ship.special
    ? '<span class="hint-note">Default vessel — can\'t be removed.</span>'
    : '<button class="btn btn-sm btn-danger" id="removeShipBtn">Remove Ship</button>';

  return `
    <div class="ship-details-edit" id="shipDetailsPanel" hidden>
      <div class="wr-label" style="margin-top:0;">Ship Details</div>
      <div class="grid-form">
        <div class="field">
          <label for="editShipName">Ship Name</label>
          <input type="text" id="editShipName" value="${escapeHtml(ship.name)}">
        </div>
        <div class="field">
          <label for="editShipAffiliation">Affiliation</label>
          <input type="text" id="editShipAffiliation" value="${escapeHtml(ship.affiliation)}">
        </div>
        <div class="field">
          <label for="editShipType">Ship Type</label>
          <input type="text" id="editShipType" value="${escapeHtml(ship.type)}">
        </div>
      </div>
      <div class="actions-row">
        <button class="btn btn-sm" id="saveShipBtn">Save Details</button>
        ${removeBtn}
      </div>
    </div>

    <button class="btn btn-primary btn-block log-entry-btn" id="logEntryBtn">+ Log Entry</button>

    <div class="entry-list">
      <div class="wr-label" style="margin-top:0;">Log for <span id="modalShipLabel">${escapeHtml(ship.name)}</span></div>
      <div id="entryList"></div>
    </div>
  `;
}

/* ---------------- entry sheet ---------------- */
function quickGroupHtml(label, items, danger){
  const btns = items.map(item =>
    `<button class="quick-btn${danger ? ' danger' : ''}" data-quick-label="${escapeHtml(item)}">${escapeHtml(item)}</button>`
  ).join('');
  return `<div class="quick-group">
    <div class="wr-label">${escapeHtml(label)}</div>
    <div class="quick-grid">${btns}</div>
  </div>`;
}

function buildEntrySheetHtml(ship){
  const groups = QUICK_GROUPS.map(g => quickGroupHtml(g.label, g.items, false)).join('');
  const warspiteBlock = ship.special
    ? `<div class="warspite-block">${quickGroupHtml('Warspite Priority Comms', WARSPITE_QUICK, true)}</div>`
    : '';

  return `
    <div class="field sheet-time">
      <label for="entryTime">Entry Time</label>
      <input type="time" id="entryTime" value="${escapeHtml(nowHHMM())}">
    </div>

    ${groups}
    ${warspiteBlock}

    <div class="quick-group">
      <div class="wr-label">Manual Entry</div>
      <div class="field">
        <label for="entryText">What was said</label>
        <textarea id="entryText" rows="3" placeholder="Log the substance of the transmission&hellip;"></textarea>
      </div>
      <div class="actions-row">
        <button class="btn btn-primary" id="addEntryBtn">+ Add Entry</button>
      </div>
    </div>

    <div class="sheet-foot">
      <button class="btn btn-block" id="entrySheetDoneBtn">Done</button>
    </div>
  `;
}

/* The sheet stays open after an entry lands, so a burst of related events
   is one tap each. `lastText` gives confirmation without the log list,
   which is behind the sheet on a phone. */
function setSheetMeta(ship, lastText){
  const el = document.getElementById('entrySheetMeta');
  if(!el) return;
  el.textContent = lastText
    ? 'Last logged: ' + lastText
    : ship.entries.length + (ship.entries.length === 1 ? ' entry' : ' entries') + ' logged so far';
}

function entrySheetOpen(){
  return document.getElementById('entrySheetOverlay').classList.contains('open');
}

function openEntrySheet(){
  const ship = getShip(currentShipId);
  if(!ship) return;
  document.getElementById('entrySheetTitle').textContent = 'LOG ENTRY — ' + ship.name.toUpperCase();
  document.getElementById('entrySheetBody').innerHTML = buildEntrySheetHtml(ship);
  setSheetMeta(ship, null);
  const overlay = document.getElementById('entrySheetOverlay');
  overlay.classList.add('open');
  overlay.scrollTop = 0;
  const time = document.getElementById('entryTime');
  if(time) time.focus();
}

function closeEntrySheet(){
  document.getElementById('entrySheetOverlay').classList.remove('open');
  const back = document.getElementById('logEntryBtn');
  if(back) back.focus();
}

/* Only the entry list repaints when entries change, so the time field,
   the manual-entry box and the scroll position all survive. */
function renderEntryList(){
  const ship = getShip(currentShipId);
  const el = document.getElementById('entryList');
  if(!ship || !el) return;
  const entries = ship.entries.slice().sort(entrySort);
  if(entries.length === 0){
    el.innerHTML = `<div class="empty-state" style="padding:16px 4px;"><strong>NO ENTRIES YET</strong>Use the quick buttons above or log a manual entry.</div>`;
    return;
  }
  el.innerHTML = entries.map(e => e.id === editingEntryId ? entryEditHtml(e) : entryRowHtml(e)).join('');
  if(editingEntryId){
    const timeInput = el.querySelector('.entry-edit-time');
    if(timeInput) timeInput.focus();
  }
}

function entryRowHtml(e){
  const id = escapeHtml(e.id);
  return `<div class="entry-item">
    <div class="et">${escapeHtml(e.time || '--:--')}</div>
    <div class="em">${escapeHtml(e.text)}</div>
    <button class="entry-act" title="Edit entry" aria-label="Edit entry" data-edit-id="${id}">&#9998;</button>
    <button class="entry-act danger" title="Delete entry" aria-label="Delete entry" data-delete-id="${id}">&times;</button>
  </div>`;
}

function entryEditHtml(e){
  const id = escapeHtml(e.id);
  return `<div class="entry-item editing">
    <input type="time" class="entry-edit-time" aria-label="Entry time" value="${escapeHtml(e.time)}">
    <textarea class="entry-edit-text" rows="2" aria-label="Entry text">${escapeHtml(e.text)}</textarea>
    <div class="entry-edit-actions">
      <button class="btn btn-sm btn-primary" data-save-id="${id}">Save</button>
      <button class="btn btn-sm" data-cancel-id="${id}">Cancel</button>
    </div>
  </div>`;
}

/* One delegated listener per container, attached once at init — bodies are
   rewritten on every open, so per-element listeners would stack. */
function wireModalDelegation(){
  const body = document.getElementById('modalBody');
  body.addEventListener('click', (e) => {
    if(e.target.closest('#logEntryBtn')){ openEntrySheet(); return; }

    const del = e.target.closest('[data-delete-id]');
    if(del){ deleteEntry(currentShipId, del.getAttribute('data-delete-id')); return; }

    const edit = e.target.closest('[data-edit-id]');
    if(edit){ editingEntryId = edit.getAttribute('data-edit-id'); renderEntryList(); return; }

    const save = e.target.closest('[data-save-id]');
    if(save){ saveEntryEdit(save.getAttribute('data-save-id')); return; }

    const cancel = e.target.closest('[data-cancel-id]');
    if(cancel){ editingEntryId = null; renderEntryList(); return; }

    if(e.target.closest('#saveShipBtn')){ saveShipDetails(); return; }
    if(e.target.closest('#removeShipBtn')){ removeCurrentShip(); return; }
  });
}

function wireEntrySheetDelegation(){
  document.getElementById('entrySheetBody').addEventListener('click', (e) => {
    const quick = e.target.closest('[data-quick-label]');
    if(quick){ logQuickEntry(quick.getAttribute('data-quick-label')); return; }
    if(e.target.closest('#addEntryBtn')){ addManualEntry(); return; }
    if(e.target.closest('#entrySheetDoneBtn')){ closeEntrySheet(); return; }
  });
}

function toggleShipDetails(){
  const panel = document.getElementById('shipDetailsPanel');
  const btn = document.getElementById('shipDetailsBtn');
  if(!panel) return;
  const show = panel.hasAttribute('hidden');
  panel.toggleAttribute('hidden', !show);
  btn.setAttribute('aria-expanded', show ? 'true' : 'false');
  if(show) document.getElementById('editShipName').focus();
}

function currentEntryTime(){
  const el = document.getElementById('entryTime');
  return (el && el.value) ? el.value : nowHHMM();
}

function pushEntry(ship, text){
  ship.entries.push({ id: uid('entry'), time: currentEntryTime(), text, ts: Date.now() });
}

function logQuickEntry(label){
  const ship = getShip(currentShipId);
  if(!ship) return;
  const time = currentEntryTime();
  pushEntry(ship, label);
  commit();
  renderEntryList();
  setSheetMeta(ship, `${time} · ${label}`);
  toast(`Logged: ${label}`);
}

function addManualEntry(){
  const ship = getShip(currentShipId);
  if(!ship) return;
  const textEl = document.getElementById('entryText');
  const text = textEl.value.trim();
  if(!text){ toast('Enter what was said first.'); textEl.focus(); return; }
  const time = currentEntryTime();
  pushEntry(ship, text);
  textEl.value = '';
  commit();
  renderEntryList();
  setSheetMeta(ship, `${time} · ${text}`);
  toast('Entry logged.');
}

function saveEntryEdit(entryId){
  const ship = getShip(currentShipId);
  if(!ship) return;
  const entry = ship.entries.find(e => e.id === entryId);
  if(!entry) return;
  const row = document.querySelector('#entryList .entry-item.editing');
  if(!row) return;
  const text = row.querySelector('.entry-edit-text').value.trim();
  if(!text){ toast('An entry needs some text.'); row.querySelector('.entry-edit-text').focus(); return; }
  entry.time = normaliseTime(row.querySelector('.entry-edit-time').value);
  entry.text = text;
  editingEntryId = null;
  commit();
  renderEntryList();
  toast('Entry updated.');
}

function deleteEntry(shipId, entryId){
  const ship = getShip(shipId);
  if(!ship) return;
  const idx = ship.entries.findIndex(e => e.id === entryId);
  if(idx === -1) return;
  ship.entries.splice(idx, 1);
  if(editingEntryId === entryId) editingEntryId = null;
  commit();
  if(currentShipId === shipId) renderEntryList();
}

/* ---------------- JSON export / import ---------------- */
function exportJSON(){
  const payload = {
    exportedAt: new Date().toISOString(),
    briefing: state.briefing,
    ships: state.ships
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeMission = (state.briefing.missionName || 'mission').replace(/[^a-z0-9]+/gi,'_');
  a.href = url;
  a.download = `UCN_Comms_Log_${safeMission}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('Log exported as JSON.');
}

function importJSON(){
  document.getElementById('importFileInput').click();
}

function wireImportInput(){
  const input = document.getElementById('importFileInput');
  input.addEventListener('change', () => {
    const file = input.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onerror = () => { toast('Could not read that file.'); input.value = ''; };
    reader.onload = () => {
      let parsed;
      try{
        parsed = JSON.parse(reader.result);
      }catch(err){
        toast("Could not read that file — it isn't valid JSON.");
        input.value = '';
        return;
      }
      let next;
      try{
        next = normaliseLog(parsed);
      }catch(err){
        toast(err.message);
        input.value = '';
        return;
      }
      /* Only now is the current log replaced. */
      state = next;
      closeShipModal();
      applyStateToUi();
      commit();
      toast('Log imported successfully.');
      input.value = '';
    };
    reader.readAsText(file);
  });
}

function newMission(){
  const ok = window.confirm(
    'Start a new mission? This clears the current mission briefing and every logged ship and entry.\n\nExport your log first (Export tab) if you want to keep it.'
  );
  if(!ok) return;
  closeShipModal();
  initState();
  clearSavedState();
  applyStateToUi();
  commit();
  switchTab('briefing');
  toast('New mission started.');
}

/* ---------------- intro / instructions modal ---------------- */
function openIntro(){
  lastFocusedBeforeModal = document.activeElement;
  const overlay = document.getElementById('introOverlay');
  overlay.classList.add('open');
  const btn = document.getElementById('introGotItBtn');
  if(btn) btn.focus();
}
function closeIntro(remember){
  document.getElementById('introOverlay').classList.remove('open');
  if(remember){
    try{ localStorage.setItem(INTRO_SEEN_KEY, '1'); }catch(e){ /* storage unavailable, ignore */ }
  }
  if(lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') lastFocusedBeforeModal.focus();
  lastFocusedBeforeModal = null;
}
function maybeShowIntroOnFirstLoad(){
  let seen = false;
  try{ seen = !!localStorage.getItem(INTRO_SEEN_KEY); }catch(e){ /* storage unavailable, ignore */ }
  if(!seen) openIntro();
}

/* ---------------- modal keyboard handling ---------------- */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/* Topmost first: the entry sheet stacks over the ship modal, so Escape and
   the focus trap act on it before anything underneath. */
function topOpenModal(){
  const sheet = document.getElementById('entrySheetOverlay');
  if(sheet.classList.contains('open')) return sheet;
  const intro = document.getElementById('introOverlay');
  if(intro.classList.contains('open')) return intro;
  const ship = document.getElementById('shipModalOverlay');
  if(ship.classList.contains('open')) return ship;
  return null;
}

function wireGlobalKeys(){
  document.addEventListener('keydown', (e) => {
    const overlay = topOpenModal();
    if(!overlay) return;
    if(e.key === 'Escape'){
      e.preventDefault();
      if(overlay.id === 'entrySheetOverlay') closeEntrySheet();
      else if(overlay.id === 'introOverlay') closeIntro(true);
      else closeShipModal();
      return;
    }
    if(e.key !== 'Tab') return;
    const items = Array.from(overlay.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null);
    if(items.length === 0) return;
    const first = items[0], last = items[items.length - 1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  });
}

/* ---------------- init ---------------- */
function wireStaticControls(){
  document.querySelectorAll('.bottom-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
  });

  document.getElementById('newShipPanel').addEventListener('click', () => togglePanel('newShipPanelWrap'));
  document.getElementById('addShipBtn').addEventListener('click', addShip);

  document.getElementById('importJsonBtn').addEventListener('click', importJSON);
  document.getElementById('exportJsonBtn').addEventListener('click', exportJSON);
  document.getElementById('pdfExportBtn').addEventListener('click', () => exportPDF());

  document.getElementById('modalCloseBtn').addEventListener('click', closeShipModal);
  document.getElementById('shipDetailsBtn').addEventListener('click', toggleShipDetails);
  document.getElementById('shipModalOverlay').addEventListener('click', (e) => {
    if(e.target.id === 'shipModalOverlay') closeShipModal();
  });

  document.getElementById('entrySheetCloseBtn').addEventListener('click', closeEntrySheet);
  document.getElementById('entrySheetOverlay').addEventListener('click', (e) => {
    if(e.target.id === 'entrySheetOverlay') closeEntrySheet();
  });

  document.getElementById('newMissionBtn').addEventListener('click', newMission);
  document.getElementById('helpBtn').addEventListener('click', openIntro);
  document.getElementById('introCloseBtn').addEventListener('click', () => closeIntro(true));
  document.getElementById('introGotItBtn').addEventListener('click', () => closeIntro(true));
  document.getElementById('introOverlay').addEventListener('click', (e) => {
    if(e.target.id === 'introOverlay') closeIntro(true);
  });

  /* Backstop for the one case autosave can't cover. */
  window.addEventListener('beforeunload', (e) => {
    if(storageOk || !hasLoggedContent()) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

function init(){
  probeStorage();
  const savedAt = restoreSavedState();
  wireBriefingFields();
  wireFcCombo();
  wireImportInput();
  wireModalDelegation();
  wireEntrySheetDelegation();
  wireStaticControls();
  wireGlobalKeys();
  applyStateToUi();
  renderAll();
  if(savedAt !== null){
    toast('Previous log restored (saved ' + formatSavedAt(savedAt) + ').');
  }else{
    maybeShowIntroOnFirstLoad();
  }
  if(!storageOk) console.warn('UCN Comms Log: localStorage unavailable — the log will not survive a refresh.');
}
document.addEventListener('DOMContentLoaded', init);
