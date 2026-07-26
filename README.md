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
  - A ship's log opens as a log view: the transmissions, and one
    **+ Log Entry** button that opens the entry pad over it (a bottom sheet
    on a phone).
  - The entry pad holds the entry time and every quick action, grouped:
    **Comms** (Opened, Closed) and **Video** (Started, Ended, Transferred to
    Bridge). UCS Warspite additionally gets a priority group: Nuclear
    Authorization Requested, Nuclear Authorization Declined, FC Advised of
    Code Omega UVP Activity, FC Advised of Request for Urgent Support.
    Manual entries with a custom message are logged from the same pad.
  - The pad **stays open** after each entry — set the time once and log a
    run of events with one tap each, with the last one echoed in its
    header. Close it with Done, the X, Escape, or by tapping outside.
  - Entries can be edited (time and text) or deleted from the log, and a
    ship's name, affiliation and type corrected via the pencil in the log
    header. Any ship except UCS Warspite can be removed.
- **Export Log (JSON)** — exports the full briefing + all ship logs as JSON,
  for import into another UCN tool.
- **Import Log (JSON)** — reloads a previously exported log. The file is
  validated in full before anything is replaced, so a bad file leaves the
  current log untouched.
- **Export Full Report (PDF)** — generates a formatted report: cover page,
  table of contents with clickable links, the full comms narrative in time
  order, a ships-spoken-to summary table, and one section per ship. Built
  with jsPDF (embedded locally, no CDN) with the UCN Exo 2 / Orbitron
  typefaces embedded directly in the PDF.

## File structure

```
index.html              main page
css/style.css            styling
js/app.js                app logic (state, autosave, tabs, ship log, JSON export/import)
js/pdf-export.js         PDF report generation + on-demand loading of the vendor bundle
js/vendor/jspdf.umd.min.js   jsPDF library (local copy, not loaded from a CDN)
js/vendor/ucn-fonts.js       Exo 2 / Orbitron fonts, base64-encoded for the PDF
js/vendor/ucn-logo.js        UCN emblem, base64-encoded for the PDF cover
fonts/*.ttf               Exo 2 / Orbitron font files for on-screen display
```

## Notes

- **The log is saved in this browser automatically** after every change, and
  restored if you refresh, crash, or close and reopen the tab. It lives in
  `localStorage` on that one device — use **Export Log (JSON)** for a
  permanent copy or to move a log elsewhere. **+ New Mission** clears both the
  board and the saved copy.
- Log ordering is anchored to the briefing time, so a mission that runs past
  midnight keeps 23:50 → 00:15 in the order it actually happened. Entries
  timed up to two hours before the briefing time are treated as pre-mission
  rather than as next-day traffic.
- The PDF engine and its embedded fonts (~1.1 MB) are downloaded the first
  time you open the Export tab, not on page load.
- The flight controller list is drawn from the campaign cast list (character
  names only — performer names are never shown). The dropdown is navigable
  with the arrow keys; modals close with Escape.
