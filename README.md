# evtx-to-csv


![evtx-to-csv Homescreen](/public/homescreen.png)
![report sample](/public/report-sample.png)]

<!-- DOWNLOADS_START -->
## Downloads

| Platform | Link |
|----------|------|
| macOS (Universal) | [Download Dev build #11](https://github.com/maxacode/evtx-Enrich/releases/download/v0.2.4-dev.11/evtx-Enrich_0.2.4_universal.dmg) |
| Windows (x64) | [Download Dev build #11](https://github.com/maxacode/evtx-Enrich/releases/download/v0.2.4-dev.11/evtx-Enrich_0.2.4_x64_en-US.msi) |

<!-- DOWNLOADS_END -->

A high-performance desktop application for incident responders that parses Windows Event Log `.evtx` files, applies per-file filters or global filters, exports records to CSV, and runs an automated enrichment check against known-suspicious command patterns.

[For Developers Click Here](Technical_README.md)
---

## Features

- **Multi-file loading** — add and manage multiple `.evtx` files in a single session; each file is processed independently
- **Per-file filter panel** — every loaded file has its own filter configuration, or use Global Filters: 
  - Date range filter (absolute from/to datetime) or relative filter (last 1 / 3 / 7 / 14 / 30 days)
  - Hostname / computer name (case-insensitive partial match)
  - Username (matches `SubjectUserName` and `TargetUserName`)
  - Process ID
  - IP address (matches any IP-related EventData field)
  - Custom field filter — specify any arbitrary EventData field name, with an optional value to match against
- **IR-focused CSV columns**:
  `timestamp`, `event_id`, `level`, `channel`, `computer`, `username`, `domain`, `target_username`, `target_domain`, `process_id`, `process_name`, `ip_address`, `port`, `logon_type`, `command_line`, `parent_process`, `workstation`, `auth_package` — plus every additional `EventData` field appended as extra columns so no data is lost
- **Incident Response enrichment** — scans event fields against regex patterns from `signatures.json` and generates a `report.md` alongside the CSV output; toggle with a checkbox (enabled by default)
- **Drag-and-drop** — drop `.evtx` files directly onto the window to load them
- **Cross-platform** — builds for macOS and Windows via Tauri
- **Export many to One CSV** - add multiple CSV files but choose to export them into a single combined file. 

---

## Enrichment / signatures.json

`signatures.json` defines the regex patterns used by the enrichment engine.


