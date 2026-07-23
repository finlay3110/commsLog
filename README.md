# UCN Comms Log

A fan-made communications logging tool for the United Confederation Navy (UCN)
community. Not affiliated with or approved by Bridge Command / The London
Space Elevator Limited.

## What it does

- **Mission Briefing** — records comms operative, mission name, ship
  (HAVOCK / TAKANAMI), flight controller (searchable by character name only,
  from the campaign cast list), date, time, and captain.
- **Overall Log tab** — every transmission from every ship, merged and sorted
  by time.
- **Ships Spoken To tab** — log new ships (name, affiliation, type) and click
  into any ship to log communications against it. UCS Warspite is present by
  default and can't be removed.
  - Every ship gets quick-entry buttons: Comms Opened, Comms Closed, Video
    Comms Started, Video Comms Ended, Video Comms Transferred to Bridge.
  - UCS Warspite additionally gets priority quick-entry buttons: Nuclear
    Authorization Requested, Nuclear Authorization Declined, FC Advised of
    Code Omega UVP Activity, FC Advised of Request for Urgent Support.
  - Manual entries can also be logged with a custom time and message.
- **Export Log (JSON)** — exports the full briefing + all ship logs as JSON,
  for import into another UCN tool.
- **Import Log (JSON)** — reloads a previously exported log.
- **Export Full Report (PDF)** — generates a formatted report: cover page,
  table of contents with clickable links, the full comms narrative in time
  order, a ships-spoken-to summary table, and one section per ship. Built
  with jsPDF (embedded locally, no CDN) with the UCN Exo 2 / Orbitron
  typefaces embedded directly in the PDF.

## File structure

```
index.html              main page
css/style.css            styling
js/app.js                app logic (state, tabs, ship log, JSON export/import)
js/pdf-export.js         PDF report generation
js/vendor/jspdf.umd.min.js   jsPDF library (local copy, not loaded from a CDN)
js/vendor/ucn-fonts.js       Exo 2 / Orbitron fonts, base64-encoded for the PDF
fonts/*.ttf               Exo 2 / Orbitron font files for on-screen display
```

## Notes

- All data is kept in memory for the session — nothing is saved automatically.
  Use **Export Log (JSON)** before closing the tab if you want to keep or
  resume a log later.
- The flight controller list is drawn from the campaign cast list (character
  names only — performer names are never shown).
