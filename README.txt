TORN NUMBER LOOKUP CONSOLE

This package keeps the original API endpoint and adds:
- red/black TORN UI using the supplied logo
- iPhone/iOS safe-area and touch optimizations
- JSON response formatter when the API allows browser CORS
- direct API iframe fallback when CORS blocks fetch
- clean NO DATA FOUND state for error/not-found JSON
- 24-hour local access password and permanent local login
- PWA manifest + service worker + 192/512 icons
- Telegram corner button

BUILT-IN PASSWORDS (CHANGE BEFORE DEPLOYING):
24-hour: TORN24
Permanent: TORN-ADMIN

IMPORTANT SECURITY NOTE:
The lock is client-side only. Anyone who can inspect the deployed HTML/JavaScript can discover the passwords and clear localStorage. It is a UI/access gate, not real server-side authentication.

The formatter displays fields returned by the API and does not create or enrich records itself.
