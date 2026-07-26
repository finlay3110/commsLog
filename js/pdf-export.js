/* ============================================================
   UCN COMMS LOG — PDF export
   Built with jsPDF (local vendor files, no CDN). Every element is
   placed at explicit coordinates — no window.print(), no CSS
   print pipeline, no html2canvas.

   The vendor bundle (jsPDF + embedded fonts + logo, ~1.1 MB) is
   fetched on demand rather than on page load: warmed when the
   Export tab opens, awaited when the button is pressed.
   ============================================================ */

(function(){
'use strict';

const PAGE_W = 210, PAGE_H = 297, MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;
const NAVY = [10, 26, 46];
const ORANGE = [232, 131, 42];
const LINE = [37, 64, 94];
const DANGER = [214, 69, 69];
const TEXT_DARK = [24, 33, 42];
const TEXT_MUTE = [110, 122, 134];

const CONTENT_BOTTOM = PAGE_H - MARGIN - 14;
const TOC_ROW_H = 9.5;
const TOC_ROWS_PER_PAGE = 22;

/* ---------------- on-demand vendor loading ---------------- */
const PDF_ASSETS = [
  'js/vendor/jspdf.umd.min.js',
  'js/vendor/ucn-fonts.js',
  'js/vendor/ucn-logo.js'
];
const scriptPromises = {};

function loadScriptOnce(src){
  if(scriptPromises[src]) return scriptPromises[src];
  scriptPromises[src] = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = false;
    el.onload = () => resolve();
    el.onerror = () => { delete scriptPromises[src]; reject(new Error('Failed to load ' + src)); };
    document.head.appendChild(el);
  });
  return scriptPromises[src];
}

function assetsReady(){
  return !!(window.jspdf && window.jspdf.jsPDF && window.UCN_FONTS && window.UCN_LOGO_NAVY_PNG);
}

function ensurePdfAssets(){
  if(assetsReady()) return Promise.resolve();
  return Promise.all(PDF_ASSETS.map(loadScriptOnce)).then(() => {});
}

/* Fire-and-forget warm-up used when the Export tab is opened. */
window.preloadPdfAssets = function(){
  ensurePdfAssets().catch(() => { /* the export button reports failures */ });
};

/* ---------------- drawing helpers ---------------- */
function registerFonts(doc){
  try{
    if(!window.UCN_FONTS) throw new Error('UCN_FONTS not loaded');
    doc.addFileToVFS('Exo2-Regular.ttf', window.UCN_FONTS.exoRegular);
    doc.addFont('Exo2-Regular.ttf', 'Exo2', 'normal');
    doc.addFileToVFS('Exo2-Bold.ttf', window.UCN_FONTS.exoBold);
    doc.addFont('Exo2-Bold.ttf', 'Exo2', 'bold');
    doc.addFileToVFS('Exo2-SemiBold.ttf', window.UCN_FONTS.exoSemiBold);
    doc.addFont('Exo2-SemiBold.ttf', 'Exo2Semi', 'normal');
    doc.addFileToVFS('Orbitron-Bold.ttf', window.UCN_FONTS.orbitronBold);
    doc.addFont('Orbitron-Bold.ttf', 'Orbitron', 'bold');
    doc.addFileToVFS('Orbitron-Black.ttf', window.UCN_FONTS.orbitronBlack);
    doc.addFont('Orbitron-Black.ttf', 'OrbitronBlack', 'bold');
    const list = doc.getFontList();
    if(!list['Exo2'] || !list['Orbitron']) throw new Error('font registration incomplete');
    return { body: 'Exo2', bodySemi: 'Exo2Semi', display: 'Orbitron', displayBlack: 'OrbitronBlack', ok: true };
  }catch(err){
    console.warn('UCN Comms Log: custom font embedding failed, falling back to Helvetica.', err);
    return { body: 'helvetica', bodySemi: 'helvetica', display: 'helvetica', displayBlack: 'helvetica', ok: false };
  }
}

function truncateToWidth(doc, text, maxWidth){
  text = String(text);
  if(doc.getTextWidth(text) <= maxWidth) return text;
  let t = text;
  while(t.length > 1 && doc.getTextWidth(t + '…') > maxWidth){ t = t.slice(0, -1); }
  return t + '…';
}

function joinNameRank(name, rank){
  const parts = [rank, name].map(s => (s || '').trim()).filter(Boolean);
  return parts.length ? parts.join(' ') : '—';
}

function drawFrame(doc){
  const m = 8;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.rect(m, m, PAGE_W - 2 * m, PAGE_H - 2 * m);
  const cl = 6;
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(0.6);
  doc.line(m, m + cl, m, m); doc.line(m, m, m + cl, m);
  doc.line(PAGE_W - m - cl, m, PAGE_W - m, m); doc.line(PAGE_W - m, m, PAGE_W - m, m + cl);
  doc.line(m, PAGE_H - m - cl, m, PAGE_H - m); doc.line(m, PAGE_H - m, m + cl, PAGE_H - m);
  doc.line(PAGE_W - m - cl, PAGE_H - m, PAGE_W - m, PAGE_H - m); doc.line(PAGE_W - m, PAGE_H - m - cl, PAGE_W - m, PAGE_H - m);
}

function pageStamp(doc, fonts){
  const n = doc.internal.getCurrentPageInfo().pageNumber;
  doc.setFont(fonts.body, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTE);
  doc.text('PAGE ' + n, PAGE_W - 15, PAGE_H - 11, { align: 'right' });
  doc.text('UCN COMMS LOG — CLASSIFIED', MARGIN + 10, PAGE_H - 11);
}

function newPage(doc, fonts){
  doc.addPage();
  drawFrame(doc);
  pageStamp(doc, fonts);
}

function drawEmblem(doc, fonts, cx, cy, r){
  const size = r * 2;
  if(window.UCN_LOGO_NAVY_PNG){
    try{
      doc.addImage(window.UCN_LOGO_NAVY_PNG, 'PNG', cx - r, cy - r, size, size, undefined, 'FAST');
      return;
    }catch(err){
      console.warn('UCN Comms Log: logo image failed to embed, falling back to drawn emblem.', err);
    }
  }
  // fallback: simple drawn emblem if the logo asset didn't load
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(1.1);
  doc.circle(cx, cy, r, 'S');
  doc.setFont(fonts.displayBlack, 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...ORANGE);
  doc.text('UCN', cx, cy + 5, { align: 'center' });
}

function drawMetaTable(doc, fonts, x, y, w, rows){
  const labelW = w * 0.42, valueW = w - labelW, rh = 10;
  rows.forEach((r, i) => {
    const ry = y + i * rh;
    doc.setFillColor(...NAVY);
    doc.rect(x, ry, labelW, rh, 'F');
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.rect(x, ry, labelW, rh, 'S');
    doc.rect(x + labelW, ry, valueW, rh, 'S');
    doc.setFont(fonts.display, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(r[0], x + 4, ry + 6.4);
    doc.setFont(fonts.body, 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...TEXT_DARK);
    doc.text(truncateToWidth(doc, r[1], valueW - 8), x + labelW + 4, ry + 6.4);
  });
  return y + rows.length * rh;
}

function buildCoverPage(doc, fonts, meta){
  drawFrame(doc);
  const cx = PAGE_W / 2;
  drawEmblem(doc, fonts, cx, 58, 22);

  doc.setFont(fonts.displayBlack, 'bold');
  doc.setFontSize(27);
  doc.setTextColor(...NAVY);
  doc.text('COMMS LOG', cx, 98, { align: 'center' });

  doc.setFont(fonts.display, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...ORANGE);
  doc.text('UNITED CONFEDERATION NAVY  —  FLEET COMMUNICATIONS', cx, 106, { align: 'center' });

  doc.setFont(fonts.bodySemi, 'normal');
  doc.setFontSize(13);
  doc.setTextColor(70, 82, 94);
  doc.text(truncateToWidth(doc, meta.missionName || 'UNTITLED MISSION', 160), cx, 118, { align: 'center' });

  doc.setFillColor(...DANGER);
  doc.rect(cx - 26, 126, 52, 7, 'F');
  doc.setFont(fonts.display, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('CLASSIFIED', cx, 131, { align: 'center' });

  const tableX = MARGIN + 8, tableW = CONTENT_W - 16, tableY = 148;
  const rows = [
    ['OPERATIVE', joinNameRank(meta.opName, meta.opRank)],
    ['MISSION NAME', meta.missionName || '—'],
    ['SHIP', meta.shipName || '—'],
    ['FLIGHT CONTROLLER', meta.fc || '—'],
    ['DATE', meta.date || '—'],
    ['TIME', meta.time || '—'],
    ['CAPTAIN', joinNameRank(meta.capName, meta.capRank)],
  ];
  drawMetaTable(doc, fonts, tableX, tableY, tableW, rows);

  doc.setFont(fonts.body, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTE);
  doc.text('Fan-made UCN tool — not affiliated with or approved by Bridge Command / The London Space Elevator Limited.',
    cx, PAGE_H - 26, { align: 'center' });
}

function drawSectionHeading(doc, fonts, title){
  doc.setFont(fonts.display, 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...NAVY);
  doc.text(title.toUpperCase(), MARGIN + 10, 34);
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(1);
  doc.line(MARGIN + 10, 38, MARGIN + 10 + 64, 38);
}

function startSection(doc, fonts, title){
  newPage(doc, fonts);
  const pageNum = doc.internal.getCurrentPageInfo().pageNumber;
  drawSectionHeading(doc, fonts, title);
  return { pageNum, cursorY: 50 };
}

function ensureSpace(doc, fonts, cursor, neededHeight, redrawHeader){
  if(cursor.y + neededHeight > CONTENT_BOTTOM){
    newPage(doc, fonts);
    cursor.y = 26;
    if(typeof redrawHeader === 'function') redrawHeader();
  }
}

/* A card whose text runs past the bottom of the page continues on the
   next one rather than overflowing the frame. */
function addLogCard(doc, fonts, cursor, title, body){
  const x = MARGIN + 8, w = CONTENT_W - 16;
  const lineH = 4.2, titleH = 6.5, boxPad = 6, gap = 3.5;
  doc.setFont(fonts.body, 'normal');
  doc.setFontSize(8.8);
  const lines = doc.splitTextToSize(body && body.trim() ? body : '(no message text recorded)', w - 14);

  let index = 0;
  let first = true;
  while(index < lines.length){
    let room = CONTENT_BOTTOM - cursor.y - (titleH + boxPad + gap);
    let fit = Math.floor(room / lineH);
    if(fit < 1){
      newPage(doc, fonts);
      cursor.y = 26;
      room = CONTENT_BOTTOM - cursor.y - (titleH + boxPad + gap);
      fit = Math.max(1, Math.floor(room / lineH));
    }
    const chunk = lines.slice(index, index + fit);
    const boxH = titleH + chunk.length * lineH + boxPad;
    const y = cursor.y;

    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, boxH, 1.6, 1.6, 'S');
    doc.setFillColor(...ORANGE);
    doc.rect(x, y, 1.4, boxH, 'F');
    doc.setFont(fonts.display, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...NAVY);
    doc.text(first ? title : title + '  (cont.)', x + 6, y + 6.5);
    doc.setFont(fonts.body, 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(60, 70, 80);
    doc.text(chunk, x + 6, y + 6.5 + titleH - 2.4);

    cursor.y = y + boxH + gap;
    index += chunk.length;
    first = false;
  }
}

function drawTable(doc, fonts, cursor, headers, rows, colWidths){
  const x = MARGIN + 8, w = CONTENT_W - 16, rh = 8;
  function header(){
    doc.setFillColor(...NAVY);
    doc.rect(x, cursor.y, w, rh, 'F');
    let cx = x;
    doc.setFont(fonts.display, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    headers.forEach((h, i) => { doc.text(h, cx + 3, cursor.y + 5.5); cx += colWidths[i]; });
    cursor.y += rh;
  }
  header();
  if(rows.length === 0){
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(x, cursor.y, x + w, cursor.y);
    doc.setFont(fonts.body, 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(...TEXT_MUTE);
    doc.text('No records.', x + 3, cursor.y + 5.5);
    cursor.y += rh;
  }
  rows.forEach(row => {
    ensureSpace(doc, fonts, cursor, rh, header);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(x, cursor.y, x + w, cursor.y);
    let cx = x;
    doc.setFont(fonts.body, 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(40, 48, 56);
    row.forEach((cell, i) => {
      doc.text(truncateToWidth(doc, cell, colWidths[i] - 6), cx + 3, cursor.y + 5.5);
      cx += colWidths[i];
    });
    cursor.y += rh;
  });
  cursor.y += 7;
}

/* Written into pages reserved before the sections were laid out, so the
   recorded page numbers and links stay correct however long it runs. */
function drawTOC(doc, fonts, entries, firstPage, rowsPerPage){
  for(let page = 0; page * rowsPerPage < Math.max(entries.length, 1); page++){
    doc.setPage(firstPage + page);
    drawSectionHeading(doc, fonts, page === 0 ? 'Table of Contents' : 'Table of Contents (cont.)');
    let y = 55;
    entries.slice(page * rowsPerPage, (page + 1) * rowsPerPage).forEach(e => {
      doc.setFont(fonts.body, 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(...TEXT_DARK);
      const label = truncateToWidth(doc, e.label, 120);
      doc.text(label, MARGIN + 10, y);
      const labelW = doc.getTextWidth(label);
      const pageStr = String(e.page);
      const pageW = doc.getTextWidth(pageStr);
      const rightX = PAGE_W - MARGIN - 10;
      doc.text(pageStr, rightX, y, { align: 'right' });

      const leaderStartX = MARGIN + 10 + labelW + 3;
      const leaderEndX = rightX - pageW - 3;
      if(leaderEndX > leaderStartX){
        doc.setDrawColor(150, 160, 170);
        doc.setLineWidth(0.3);
        if(typeof doc.setLineDashPattern === 'function') doc.setLineDashPattern([0.7, 1.3], 0);
        doc.line(leaderStartX, y - 1.3, leaderEndX, y - 1.3);
        if(typeof doc.setLineDashPattern === 'function') doc.setLineDashPattern([], 0);
      }
      doc.link(MARGIN + 10, y - 5, CONTENT_W - 20, 7.5, { pageNumber: e.page });
      y += TOC_ROW_H;
    });
  }
}

/* ---------------- entry point ---------------- */
async function exportPDF(){
  const btn = document.getElementById('pdfExportBtn');
  try{
    if(btn) btn.disabled = true;

    if(!assetsReady()){
      toast('Preparing the PDF engine…');
      try{
        await ensurePdfAssets();
      }catch(err){
        console.error('UCN Comms Log: PDF assets failed to load.', err);
        toast('PDF engine failed to load.');
        return;
      }
    }

    const jspdfNS = window.jspdf;
    if(!jspdfNS || !jspdfNS.jsPDF){ toast('PDF engine failed to load.'); return; }
    const { jsPDF } = jspdfNS;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const fonts = registerFonts(doc);

    const meta = state.briefing;

    buildCoverPage(doc, fonts, meta);

    /* Reserve the contents pages up front: two fixed sections plus one
       per ship, so the count is known before anything is drawn. */
    const tocCount = 2 + state.ships.length;
    const tocPageCount = Math.max(1, Math.ceil(tocCount / TOC_ROWS_PER_PAGE));
    newPage(doc, fonts);
    const tocPageNum = doc.internal.getCurrentPageInfo().pageNumber;
    for(let i = 1; i < tocPageCount; i++) newPage(doc, fonts);
    const toc = [];

    let sec = startSection(doc, fonts, 'Overall Comms Log');
    toc.push({ label: 'Overall Comms Log — Full Narrative', page: sec.pageNum });
    let cursor = { y: sec.cursorY };
    const allEntries = getAllEntriesSorted();
    if(allEntries.length === 0){
      doc.setFont(fonts.body, 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...TEXT_MUTE);
      doc.text('No communications have been logged for this mission.', MARGIN + 8, cursor.y + 2);
    }else{
      allEntries.forEach(e => {
        addLogCard(doc, fonts, cursor, `${e.time || '--:--'}   ·   ${e.shipName}`, e.text);
      });
    }

    sec = startSection(doc, fonts, 'Ships Spoken To');
    toc.push({ label: 'Ships Spoken To — Summary', page: sec.pageNum });
    cursor = { y: sec.cursorY };
    const colW = [ (CONTENT_W - 16) * 0.36, (CONTENT_W - 16) * 0.30, (CONTENT_W - 16) * 0.18, (CONTENT_W - 16) * 0.16 ];
    drawTable(
      doc, fonts, cursor,
      ['SHIP NAME', 'AFFILIATION', 'TYPE', 'ENTRIES'],
      state.ships.map(s => [s.name, s.affiliation || '—', s.type || '—', String(s.entries.length)]),
      colW
    );

    state.ships.forEach(s => {
      sec = startSection(doc, fonts, `Ship Log: ${s.name}`);
      toc.push({ label: `Ship Log — ${s.name}`, page: sec.pageNum });
      cursor = { y: sec.cursorY };
      const infoColW = [ (CONTENT_W - 16) * 0.4, (CONTENT_W - 16) * 0.3, (CONTENT_W - 16) * 0.3 ];
      drawTable(
        doc, fonts, cursor,
        ['AFFILIATION', 'TYPE', 'ENTRIES LOGGED'],
        [[s.affiliation || '—', s.type || '—', String(s.entries.length)]],
        infoColW
      );
      const sorted = s.entries.slice().sort(entrySort);
      if(sorted.length === 0){
        doc.setFont(fonts.body, 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...TEXT_MUTE);
        doc.text('No communications logged with this vessel.', MARGIN + 8, cursor.y + 2);
      }else{
        sorted.forEach(e => addLogCard(doc, fonts, cursor, e.time || '--:--', e.text));
      }
    });

    drawTOC(doc, fonts, toc, tocPageNum, TOC_ROWS_PER_PAGE);

    const safeMission = (meta.missionName || 'mission').replace(/[^a-z0-9]+/gi, '_');
    doc.save(`UCN_Comms_Log_${safeMission}.pdf`);
    toast('Full PDF report exported.');
  }catch(err){
    console.error('UCN Comms Log PDF export error:', err);
    toast('PDF export failed — check browser console.');
  }finally{
    if(btn) btn.disabled = false;
  }
}

window.exportPDF = exportPDF;

})();
