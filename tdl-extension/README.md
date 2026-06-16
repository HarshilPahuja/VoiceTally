# VoiceTally — NLP Tally Extension

This folder contains the VoiceTally integration for TallyPrime. It provides a natural language interface (text and voice) to query real Tally data without navigating through menus, returning human-readable answers instantly.

## Architecture

Due to limitations in Tally's HTTP and external execution capabilities, the extension operates in two frontend parts, backed by a powerful cross-API orchestration layer:

1. **The Backend (System Tray App)**: `voicetally_query.py` acts as the primary interface. It runs silently in the background as a system tray app, captures global hotkeys (`Ctrl+Shift+V`), records microphone input, and communicates directly with the Intelligence API.
2. **The Frontend (TDL Menu)**: `voicetally_nlp.tdl` adds a menu item to the Gateway of Tally. This primarily serves as a reminder panel on how to trigger the main VoiceTally pipeline.

### Flow & Master Endpoint Orchestration
The magic happens in the `/ask` Master Endpoint:
1. The Tray App sends your query to the **Intelligence API** (`:8001/nlp/ask`).
2. The NLP Engine parses the natural language into an **Intent** and **Entities** (e.g. `GET_SALES_SUMMARY`, `date_range`).
3. The Master Endpoint dynamically constructs a search query to the local **Tally Data API** (`:8000/search`), which is synced every 60s with Tally via ChromaDB.
4. The Master Endpoint aggregates the raw Tally data and returns a **human-readable sentence** to the Tray App.

## Setup Instructions

### 1. Prerequisites
Ensure you have Python 3.x installed, along with the required dependencies. Run the following from the project root:
```bash
# Install core API dependencies
pip install -r requirements.txt

# Install tray app specific dependencies
pip install pystray Pillow keyboard sounddevice soundfile requests
```
> **Note for Voice Input:** `openai-whisper` (used by the backend API) requires `ffmpeg` to be installed on your system.

### 2. Start the Backend Servers
The extension requires **both** the Tally sync/search API and the Intelligence API to be running on your machine.
**Terminal 1 (Tally DB Sync & Search):**
```bash
cd extracting_tally_data
uvicorn tally_api:app --port 8000
```
**Terminal 2 (Intelligence NLP Engine):**
```bash
# From project root
uvicorn app.main:app --port 8001
```

### 3. Load Tally Integration
1. Open TallyPrime.
2. Press **F1** (Help) → **TDL & Add-on** → **F4: Manage Local TDLs**.
3. Browse to and select `tdl-extension/voicetally_nlp.tdl`.

### 4. Run the Tray App (Auto-Startup)
Double-click `launch_voicetally.bat`. 
- A purple **"VT"** icon will appear in your system tray. The app will run silently in the background.
- **Auto-Startup:** The first time it is launched, the app automatically registers itself in the Windows Registry to **boot silently on system startup**. You never have to launch this batch file again.
- You can turn this off freely within your Windows Task Manager's "Startup Apps" tab.

## Supported Queries

VoiceTally understands multiple query dimensions natively. Try asking:
* **Sales:** *"Show sales for last week"*
* **Outstanding:** *"What are my pending payments?"*
* **Low Stock:** *"Show low stock items"*
* **Daily Business:** *"Business today summary"*
* **Purchases:** *"Recent purchases"*
* **Account Balance:** *"Ledger balance of ABC Traders"*
* **Inventory:** *"Stock inquiry for cement"*

## Usage

1. **Trigger the UI:** Press exactly **`Ctrl + Shift + V`** from anywhere on your PC.
2. **Text Query:** Type your query and click **Send ▶**.
3. **Voice Query:** Click the 🎤 icon, speak for 5 seconds, and let the app transcribe your voice.
4. **Close UI:** Click the "X" on the window. It hides to the system tray, waiting for your next hotkey.
