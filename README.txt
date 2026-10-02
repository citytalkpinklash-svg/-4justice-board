4JUSTICE BOARD
Files:
worker.js - website, submission form, D1 storage, email notification support
schema.sql - D1 submissions table

Expected existing Cloudflare setup:
Worker: 4justice-board
D1 binding: DB

Email notifications use Resend.
Configure Worker secrets/variables:
RESEND_API_KEY = your Resend API key
NOTIFY_EMAIL = your private notification email
FROM_EMAIL = optional verified sender

Never put the API key directly into worker.js.

After deployment, your existing workers.dev address is the clickable public link.
Use that same final public link to create the QR code.
