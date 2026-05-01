# VoiceTally

VoiceTally is a voice-driven AI assistant and intelligent dashboard ecosystem for **Tally Prime / Tally ERP 9**. It allows business owners, administrators, and accountants to ask questions in natural language, retrieve insights, and visualize their Tally Data securely locally.

With Real-Time Financial Insights, NLP-driven Context generation, and Automated PDF Reporting, VoiceTally elevates traditional accounting software interaction to a modern cloud-like experience.

## Features

- **Voice & Text AI Intelligence**: Query Tally in natural language (e.g., "what were my sales last week", "list all sundry debtors").
- **Graphical Dashboards**: 8 real-time Base64 generated Pandas and Matplotlib visual charts dynamically tracking Cash, P&L, Sales, Assets, and Top 5 Reports.
- **Live WebSocket Sync**: Any change in Tally triggers the Python backend to sync to ChromaDB and automatically updates the Chrome Extension Dashboards without a page refresh.
- **PDF Report Exports**: Generate clean, stylized data-point summaries directly from your search queries.
- **User & Admin Tiers**: Built on Firebase Authentication. Administrators have extra capabilities (Rate Limiting, Audit Logs).

---

## Architecture Stack

VoiceTally consists of three main components:

1. **The Tally Data Extractor API** (`extracting_tally_data/`): A FastAPI service that connects directly to the local Tally instance via ODBC/XML on port 9000, pulling Masters and Vouchers and syncing them into an intelligent **Chroma Vector Database**.

2. **The Intelligence API** (`app/`): A powerful FastAPI analytical engine that handles natural language processing (NLP), text-to-speech (TTS), Markdown extraction, Matplotlib charting (`dashboard_routes.py`), and PDF report generation.

3. **The Chrome Extension** (`voicetally-extension/`): A sleek, responsive dashboard UI built with HTML/CSS/JS that communicates securely with both python layers to display text queries and graphs.

---

## Setup & Running VoiceTally

### Step 1. Tally Preparations
1. Open Tally Prime.
2. Ensure ODBC Server / XML Web Server is enabled, listening on port `9000`. Let your primary company sit open and authenticated.
3. Verify your company name in `extracting_tally_data/config.json`.

### Step 2. Local Python Environment
1. Ensure Python 3.9+ is installed on your machine.
2. In the project root, install all dependencies:
```bash
pip install -r requirements.txt
```

### Step 3. Run The Backend Servers
VoiceTally uses two independent APIs running concurrently. Open **3 terminals** in the project directory:

**Terminal A: Extension Server/Backend (Port 3000)**  
Handles all the chrome extension requests and responses. It also handles the authentication and authorization of the users.
```bash
cd voicetally-backend
npm run dev
```

**Terminal B: Extract Layer (Port 8000)**  
Handles Tally direct connections, Chroma DB populating, and WebSocket synchronization.
```bash
cd extracting_tally_data
uvicorn tally_api:app --host 0.0.0.0 --port 8000 --reload
```
or
```bash
cd extracting_tally_data
uvicorn tally_api:app --reload --port 8000
```

**Terminal C: Intelligence Layer (Port 8001)**  
Handles NLP logic, TTS Audio blobs, Pydantic validations, and PDF/Matplotlib graphic builds.
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### Step 4. Install The Chrome Extension
1. Open Google Chrome.
2. Navigate to `chrome://extensions`.
3. Toggle on **Developer mode** in the top-right corner.
4. Click **Load unpacked**.
5. Select the `voicetally-extension` folder located in the project's root directory.
6. Pin the VoiceTally icon for easy access!

---

## Usage

1. Click the VoiceTally extension icon to open the popup (for quick voice/text queries) or launch the full Dashboard.
2. **Login/Register** using Email & Password or Google Sign-In via the Firebase UI.
3. Access the **Data Explorer** tab to manually type complex searches (e.g. tracking "Sales" collections) or click on the popup microphone icon to utilize TTS features.
4. **Dashboards**: Once logged in as User or Admin, visit `index.html` or `admin.html` respectively to watch your financial Matplotlib charts update dynamically over WebSockets!

---

## Troubleshooting

- **Tally Connection Refused / 500 Errors (*from 8000*)**  
  *Cause*: Tally is enclosed or not responding to XML POST requests on port 9000.  
  *Fix*: Go to Settings in Tally and fully restart ODBC protocol. Ensure your selected company matches `config.json`.
- **CORS / Method Not Allowed Errors**  
  *Cause*: Sometimes happens if an old version of `voicetally-backend (NodeJS)` is masking the Python servers. Ensure you are directing traffic strictly to `localhost:8000` (Tally DB) and `localhost:8001` (Intelligence API).
- **Missing Audio or `langdetect` / `reportlab` failures**  
  *Cause*: Incomplete `pip install`.  
  *Fix*: Re-run `pip install -r requirements.txt` and ensure `langdetect` is natively installed.
- **Empty / Broken Graphs in Dashboards**  
  *Cause*: Vector Search failed, meaning ChromaDB might be bare.  
  *Fix*: Send a ping to `/trigger-sync` manually or wait for the auto-synchronization cycle from `tally_api.py`.

---

> **Small Note**: VoiceTally's Vector Search (`nlp/parse-query`) implements a graceful secondary fallback Regex feature. If Chroma retrieval is occasionally fuzzy or your AI endpoints are offline, the backend intelligently falls back to local cached pattern matching so you never lose control of your books!

---

## screenshots

will be added soon!