# VoiceTally Extension Changelog's

---

Log Date: 04-03-2026 Time: 19:55

### Changes/Audit

1. **background.js:** improved logging added.
2. **popup.js:** logging added and.
3. **admin.html:** now working and opens from extension popup
4. **admin.js:** javascript for ```admin.js``` is placed here and now working.
5. **index.html:** now working and opens from extension popup
6. **index.js:** javascript for ```index.js``` is placed here and now working.
7. **login.html:** now working and opens from extension popup
8. **login.js:** javascript for ```login.js``` is placed here and now working.

---

Log Date: 04-03-2026

### Changes/Audit

1. **server.js:** added Winston for logging.

2. **logger.js:** Created a custom logging utility using Winston that formats messages nicely with timestamps.

3. Dual Transports: It is configured to output colorized logs to your development console, while simultaneously appending all logs to voicetally-backend/backend.log as requested.

4. Request Middleware: Added a global middleware in server.js that automatically logs every incoming request and its outcome status (e.g. Incoming request: GET /sales... and Request succeeded: ... Status: 200).

5. Converted Statements: ```server.js``` and ```file_ingestion.js```, upgraded all existing *console.log* and *console.error* calls to use the proper *logger.info*, *logger.warn*, or *logger.error* methods with stack traces for errors.

6. Dashboard: Added a dashboard to display the total sales, average sales, and status breakdown.
note: Dashboard is not ready, it is under development and open/access by opening it manually(login required, id & pass already shown).

---

Log Date: 11-02-2026

### Changes/Audit

0. **Libraries:** added date-fns for date manipulation, @xenova/transformers for STT integration, ffmpeg for audio processing, wavefile for audio processing.

1. **server.js:** added STT integration with Whisper API.

2. **background.js:** welcome.html is added for the first time use.

3. **popup.js:** major changes in Audio processing and STT integration, permission handling for microphone access, UI changes.

4. **welcome.html:** added welcome page for the first time use.

5. **welcome.js:** added logic for the welcome page(mic permission).

---

Log Date: 04-02-2026

### Changes/Audit

1. **Background.js:** added hotkey support for opening the popup, Refactored `background.js` to read `connectorUrl` from `chrome.storage.local`.

2. **data/sales.csv:** added more data for testing.

3. **manifest.json:** added hotkey support for opening the popup, removed unused permissions.

4. **ISSUES.md:** updated issues tracking.

5. **file_ingestion.js:** Implemented `date-fns` in `file_ingestion.js` to intelligently parse generic ISO, `dd-MM-yyyy`, and slash-separated formats.

---

Log Date: 03-02-2026

### Changes/Audit

1. **Manifest.json:** clean and minimal, only required permissions are kept.

2. **Background.js:** simple query handler upgrade to "Robust Query Handling" with better error handling and user-friendly messages, it extracts date, status, customer from the query and sends it to the backend.

3. **file_ingestion.js:** file ingestion with validation and error handling and advanced query handling with filtering.

4. **server.js:** now accepts rich parameters alongside period.

---

Log Date: 25-01-2026 - 30-01-2026

This changelog covers the new features implemented for VoiceTally: Voice/STT Integration and Real-World Backend with File Ingestion.

### New Features

1. **Voice Interaction:** Click the 🎤 button in the popup to speak your query. The extension uses the Web Speech API to transcribe your voice.

2. **Real Data Ingestion:** The local backend now reads from a CSV file ```(data/sales.csv)``` instead of using hardcoded mock data.
   * Supported format: ```Date,Customer,Amount,Status```.
   * Secure ingestion: Validates file existence and content.

### Setup & Verification
1. Start the Local Backend
    The extension relies on the local backend service.

    1. Navigate to ```...\Voice_Tally\voicetally-backend```.
    2. Run the server:
       ```node
       npm start
       ```
       *Note: The server runs on port 3000.*

2. Install/Reload Extension

   Follow the steps in **extension_steps.md:** if avilable.
   1. Open ```chrome://extensions```.
   2. Enable Developer Mode.
   3. Click Load Unpacked.
   4. Select folder ```...\Voice_Tally\voicetally-extension```.

4. Verify Voice & Data
   1. Click the VoiceTally extension icon.
   2. **Text Query:** Type ```sales last week``` and press Enter. You should see real data from the CSV file (e.g., Total: ₹...).
   3. **Voice Query:** Click the Microphone icon, say ```"sales last week"```. It should transcribe and fetch the same data.

Configuration
1. **Data File:** You can edit ```...\Voice_Tally\voicetally-backend\data\sales.csv``` to add your own test data.
2. **Environment:** Configuration is in **voicetally-backend/.env**.

Security Notes
* **Rate Limiting:** The backend limits requests to 100/min.
* **Input Validation:** Extension and Backend strictly validate length and content of queries.