/* ============================================================
   UCN COMMS LOG — application logic
   PDF export is parked for a later pass (button disabled).
   ============================================================ */

const UCN_CAST = ["Angaharad 'Angie' Talbot", "Aquila Nova", "Athena Hamilton", "Bec Dallas", "Ben Rhydding", "Billy Wallace", "Calliope 'Callie' Kihu", "Casper Bartholin", "Chef Lucia Vittorini", "Cora Dent", "Danni Acharya", "Darius Gray", "Dr. Andrew Barnes", "Dr. Brian 'Bo' Murphy", "Dr. Kennedy Greene", "Dr. Oliver Nightingale", "Eagle", "Edward 'Dingers' Bell", "Egon Larsen", "Emilia Sultana", "Esther Gefen", "Frederica 'Freddie' Moore", "Gilbert 'Teddy' Fraser", "Huey Carson", "J.U.D.I.T.H.", "Jack Talisker", "Jasmine Hannover", "Jay Washburne", "Jeremy Stockwell", "Joanna Campbell", "Jordan Simpson", "Julio Ferreira", "Kate Thursday", "Kenneth Collingwood", "Layla Talwar", "Leon Grant", "Marcus Segretto", "Neil Bell", "Nurse Nathan Kilmore", "Ozymandias 'Oz' Willcox", "Robert Lyon", "Roger Taylor", "Rowen Jones", "Sam Falco", "Saskia Ubosi", "Shirley Bishop", "Stjerne Olsen", "Tanya Scott", "Uzoma Adebayo", "Wi Yun Moon"];

const UNIVERSAL_QUICK = [
  'COMMS OPENED',
  'COMMS CLOSED',
  'VIDEO COMMS STARTED',
  'VIDEO COMMS ENDED',
  'VIDEO COMMS TRANSFERRED TO BRIDGE'
];

const WARSPITE_QUICK = [
  'NUCLEAR AUTHORIZATION REQUESTED',
  'NUCLEAR AUTHORIZATION DECLINED',
  'FC ADVISED OF CODE OMEGA UVP ACTIVITY',
  'FC ADVISED OF REQUEST FOR URGENT SUPPORT'
];

function uid(prefix){ return prefix + '-' + Math.random().toString(36).slice(2,9) + Date.now().toString(36); }
function nowHHMM(){ const d = new Date(); return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); }
function todayISO(){ const d = new Date(); return d.toISOString().slice(0,10); }
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function timeToMinutes(t){ if(!t) return 0; const parts = String(t).split(':'); const h = parseInt(parts[0],10)||0; const m = parseInt(parts[1],10)||0; return h*60+m; }
function entrySort(a,b){ return (timeToMinutes(a.time) - timeToMinutes(b.time)) || (a.ts - b.ts); }

/* ---------------- state ---------------- */
let state = {
  briefing: {
    opName:'', opRank:'', missionName:'', shipName:'', fc:'', date: todayISO(), time: nowHHMM(),
    capName:'', capRank:''
  },
  ships: []
};

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

function initState(){
  state.ships = [ makeDefaultWarspite() ];
}

let currentShipId = null;

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
function switchTab(tab){
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('tab-overall').classList.toggle('active', tab === 'overall');
  document.getElementById('tab-ships').classList.toggle('active', tab === 'ships');
}

/* ---------------- briefing fields wiring ---------------- */
function wireBriefingFields(){
  const map = {
    opName:'opName', opRank:'opRank', missionName:'missionName', shipName:'shipName',
    date:'missionDate', time:'missionTime', capName:'capName', capRank:'capRank'
  };
  Object.keys(map).forEach(key => {
    const el = document.getElementById(map[key]);
    el.value = state.briefing[key] || '';
    el.addEventListener('input', () => { state.briefing[key] = el.value; });
    el.addEventListener('change', () => { state.briefing[key] = el.value; });
  });
}

/* ---------------- flight controller combobox ---------------- */
function wireFcCombo(){
  const input = document.getElementById('fcInput');
  const list = document.getElementById('fcList');
  input.value = state.briefing.fc || '';

  function render(items){
    if(items.length === 0){
      list.innerHTML = '<div class="none">No matching character</div>';
    } else {
      list.innerHTML = items.map(name => `<div data-name="${escapeHtml(name)}">${escapeHtml(name)}</div>`).join('');
    }
    list.classList.add('open');
  }

  input.addEventListener('focus', () => {
    render(UCN_CAST.slice().sort());
  });
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    const filtered = UCN_CAST.filter(n => n.toLowerCase().includes(q)).sort();
    render(filtered);
    state.briefing.fc = input.value;
  });
  list.addEventListener('mousedown', (e) => {
    const target = e.target.closest('[data-name]');
    if(!target) return;
    input.value = target.dataset.name;
    state.briefing.fc = target.dataset.name;
    list.classList.remove('open');
  });
  document.addEventListener('click', (e) => {
    if(!document.getElementById('fcCombo').contains(e.target)){
      list.classList.remove('open');
    }
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
    <div class="ship-card${s.special ? ' default' : ''}" data-ship-id="${escapeHtml(s.id)}">
      <h3>${escapeHtml(s.name)}</h3>
      <div class="meta-line"><b>Affiliation:</b> ${escapeHtml(s.affiliation || '—')}</div>
      <div class="meta-line"><b>Type:</b> ${escapeHtml(s.type || '—')}</div>
      <div class="entry-count">${s.entries.length} ENTR${s.entries.length===1?'Y':'IES'} LOGGED</div>
    </div>`).join('');
  grid.querySelectorAll('.ship-card').forEach(card => {
    card.addEventListener('click', () => openShipModal(card.getAttribute('data-ship-id')));
  });
}

function renderAll(){
  renderOverallLog();
  renderShipGrid();
}

/* ---------------- add ship ---------------- */
function addShip(){
  const nameEl = document.getElementById('newShipName');
  const affEl = document.getElementById('newShipAffiliation');
  const typeEl = document.getElementById('newShipType');
  const name = nameEl.value.trim();
  if(!name){ toast('Enter a ship name first.'); nameEl.focus(); return; }
  state.ships.push({
    id: uid('ship'),
    name,
    affiliation: affEl.value.trim(),
    type: typeEl.value.trim(),
    special: false,
    entries: []
  });
  nameEl.value = ''; affEl.value = ''; typeEl.value = '';
  renderAll();
  toast(`${name} added to Ships Spoken To.`);
}

/* ---------------- ship modal ---------------- */
function getShip(id){ return state.ships.find(s => s.id === id); }

function openShipModal(id){
  currentShipId = id;
  const ship = getShip(id);
  if(!ship) return;
  document.getElementById('modalShipName').textContent = ship.name.toUpperCase();
  document.getElementById('modalShipMeta').textContent =
    `${ship.affiliation || 'Affiliation unknown'} · ${ship.type || 'Type unknown'}`;
  document.getElementById('modalBody').innerHTML = buildModalBodyHtml(ship);
  document.getElementById('shipModalOverlay').classList.add('open');
  wireModalControls();
}

function closeShipModal(){
  document.getElementById('shipModalOverlay').classList.remove('open');
  currentShipId = null;
}

function buildModalBodyHtml(ship){
  const isWarspite = !!ship.special;
  const quickBtnAttr = (label) => `data-quick-label="${escapeHtml(label)}"`;
  const universalBtns = UNIVERSAL_QUICK.map(label =>
    `<button class="quick-btn" ${quickBtnAttr(label)}>${escapeHtml(label)}</button>`
  ).join('');

  const warspiteBlock = isWarspite ? `
    <div class="warspite-block">
      <div class="wr-label">Warspite Priority Comms</div>
      <div class="quick-grid">
        ${WARSPITE_QUICK.map(label =>
          `<button class="quick-btn danger" ${quickBtnAttr(label)}>${escapeHtml(label)}</button>`
        ).join('')}
      </div>
    </div>` : '';

  const entries = ship.entries.slice().sort(entrySort);
  const entryListHtml = entries.length === 0
    ? `<div class="empty-state" style="padding:16px 4px;"><strong>NO ENTRIES YET</strong>Use the quick buttons above or log a manual entry.</div>`
    : entries.map(e => {
        const realIndex = ship.entries.indexOf(e);
        return `<div class="entry-item">
          <div class="et">${escapeHtml(e.time || '--:--')}</div>
          <div class="em">${escapeHtml(e.text)}</div>
          <div class="ed" title="Delete entry" data-delete-index="${realIndex}">&times;</div>
        </div>`;
      }).join('');

  return `
    <div class="field" style="max-width:160px; margin-bottom:14px;">
      <label>Entry Time</label>
      <input type="time" id="entryTime" value="${escapeHtml(nowHHMM())}">
    </div>

    <div class="wr-label">Quick Entry</div>
    <div class="quick-grid">${universalBtns}</div>

    ${warspiteBlock}

    <div class="wr-label">Manual Entry</div>
    <div class="field">
      <label>What was said</label>
      <textarea id="entryText" rows="3" placeholder="Log the substance of the transmission&hellip;"></textarea>
    </div>
    <div class="actions-row">
      <button class="btn btn-primary" id="addEntryBtn">+ Add Entry</button>
    </div>

    <div class="entry-list">
      <div class="wr-label" style="margin-top:0;">Log for ${escapeHtml(ship.name)}</div>
      ${entryListHtml}
    </div>
  `;
}

function wireModalControls(){
  document.querySelectorAll('#modalBody [data-quick-label]').forEach(btn => {
    btn.addEventListener('click', () => logQuickEntry(btn.getAttribute('data-quick-label')));
  });
  const addBtn = document.getElementById('addEntryBtn');
  if(addBtn) addBtn.addEventListener('click', addManualEntry);
  document.querySelectorAll('#modalBody [data-delete-index]').forEach(el => {
    el.addEventListener('click', () => deleteEntry(currentShipId, parseInt(el.getAttribute('data-delete-index'), 10)));
  });
}

function currentEntryTime(){
  const el = document.getElementById('entryTime');
  return (el && el.value) ? el.value : nowHHMM();
}

function pushEntry(ship, text){
  ship.entries.push({ time: currentEntryTime(), text, ts: Date.now() });
}

function logQuickEntry(label){
  const ship = getShip(currentShipId);
  if(!ship) return;
  pushEntry(ship, label);
  renderAll();
  openShipModal(ship.id); // refresh modal contents, keeps time value
  toast(`Logged: ${label}`);
}

function addManualEntry(){
  const ship = getShip(currentShipId);
  if(!ship) return;
  const textEl = document.getElementById('entryText');
  const text = textEl.value.trim();
  if(!text){ toast('Enter what was said first.'); textEl.focus(); return; }
  pushEntry(ship, text);
  renderAll();
  openShipModal(ship.id);
  toast('Entry logged.');
}

function deleteEntry(shipId, index){
  const ship = getShip(shipId);
  if(!ship) return;
  ship.entries.splice(index, 1);
  renderAll();
  if(currentShipId === shipId) openShipModal(shipId);
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
    reader.onload = () => {
      try{
        const data = JSON.parse(reader.result);
        if(data.briefing) state.briefing = Object.assign(state.briefing, data.briefing);
        if(Array.isArray(data.ships) && data.ships.length){
          state.ships = data.ships;
        }
        wireBriefingFields();
        document.getElementById('fcInput').value = state.briefing.fc || '';
        renderAll();
        toast('Log imported successfully.');
      }catch(err){
        console.error(err);
        toast('Could not read that file — invalid JSON.');
      }
      input.value = '';
    };
    reader.readAsText(file);
  });
}

/* ---------------- init ---------------- */
function init(){
  initState();
  wireBriefingFields();
  wireFcCombo();
  wireImportInput();
  renderAll();
}
document.addEventListener('DOMContentLoaded', init);
