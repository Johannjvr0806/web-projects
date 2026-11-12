# PnP Clothing Store Visit Dashboard

## Run it

Open `index.html` in Microsoft Edge or Chrome. No Node.js, build step, or installation is required.

## Included workflows

- Compact dashboard and responsive sidebar navigation
- Visit details and tabbed Sales Floor, Back of House, Leadership, Previous Actions, and Summary sections
- Original eight-item Store Audit checklist
- Standard results, observations, corrective actions, owners, priorities, and due dates
- Add Issue notes and camera/photo capture
- Automatic action creation, manual actions, filters, and status tracking
- Visit History, Reports, Store List, and Settings
- PDF report download and browser Print / Save as PDF
- Local browser storage for drafts, visits, actions, settings, and compressed photos

The existing dashboard storage keys (`visits`, `actions`, and `draft`) are retained. The original Store Audit app kept its checklist and issue photos in memory and cleared them after generating a report, so it had no saved visit data to migrate. Data remains local to the current browser profile and does not sync to other devices.

The PDF download uses jsPDF from a CDN and needs an internet connection. If it is unavailable, use the report's **Print / Save PDF** option.
