# VoiceTally — NLP Tally Extension

This folder contains the VoiceTally integration for TallyPrime. It provides a natural language interface (text and voice) to query real Tally data without navigating through menus, returning human-readable answers instantly.

## Architecture

Due to limitations in Tally's HTTP and external execution capabilities, the extension operates in two frontend parts, backed by a powerful cross-API orchestration layer:

1. **The Backend (System Tray App)**: `voicetally_query.py` acts as the workhorse. It runs in the background as a system tray app, captures global hotkeys (`Ctrl+Shift+V`), records microphone input, and communicates directly with the Intelligence API.
2. **The Frontend (TDL Menu)**: `voicetally_nlp.tdl` adds a menu item to the Gateway of Tally. This primarily serves as a reminder/instruction panel on how to use the tool.

### Flow & Master Endpoint Orchestration
The magic happens in the `/ask` Master Endpoint:
1. The Tray App sends your query to the **Intelligence API** (`:8001/nlp/ask`).
2. The NLP Engine parses the natural language into an **Intent** and **Entities** (e.g. `GET_SALES_SUMMARY`, `date_range`).
3. The Master Endpoint dynamically constructs a search query to the local **Tally Data API** (`:8000/search`), which is synced every 60s with Tally via ChromaDB.
4. The Master Endpoint aggregates the raw Tally data (e.g., adding up the `amount` fields on all Day Book vouchers) and returns a **human-readable sentence** to the Tray App.

```mermaid
graph LR
    U["User anywhere"] -->|"Ctrl+Shift+V"| B["System Tray App<br>(voicetally_query.py)"]
    B -->|Text Query| C["Master Endpoint<br>/ask (Port 8001)"]
    B -->|Mic Audio POST| D["/stt/transcribe<br>(Port 8001)"]
    D -.->|Transcribed Text| B
    
    C -->|Parse Request| E["Internal NLP Parser"]
    C -->|ChromaDB Search + Filters| F["Tally Database API<br>/search (Port 8000)"]
    
    F -->|Raw Synced Tally Records| C
    C -->|Human-readable Answer| B
```

## Files

| File | Description |
|---|---|
| `voicetally_query.py` | The core Python GUI application. Handles the dark-themed UI, voice recording (`sounddevice`), HTTP requests, and runs as a system tray icon (`pystray`). Displays the final human-readable answers. |
| `launch_voicetally.bat` | A Windows batch script that launches the Python GUI in the background (`pythonw.exe`). This is the intended entry point for end users. |
| `voicetally_nlp.tdl` | The TDL (Tally Definition Language) file. Loads a menu item into the Gateway of Tally displaying instructions. |

## Setup Instructions

### 1. Prerequisites
Ensure you have Python 3.x installed, along with the required dependencies. Run the following from the project root:
```bash
# Install core API dependencies (includes httpx, uvicorn, fastapi)
pip install -r requirements.txt

# Install tray app specific dependencies
pip install pystray Pillow keyboard sounddevice soundfile requests
```
> **Note for Voice Input:** `openai-whisper` (used by the backend API) requires `ffmpeg` to be installed on your system.

### 2. Start the Backend Servers
The extension requires **both** the Tally sync/search API and the Intelligence API to be running.

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
4. Return to the Gateway of Tally to see the new **VoiceTally NLP Query** menu item.

### 4. Run the Tray App
Double-click `launch_voicetally.bat`. 
- A purple **"VT"** icon will appear in your system tray.
- The app will run silently in the background.

## Usage

1. **Trigger the App:** Press exactly **`Ctrl + Shift + V`** from anywhere (even while actively working inside Tally).
2. **Text Query:** Type your query (e.g., *"show sales for last week"*) and click **Send ▶**.
3. **Voice Query:** Click the 🎤 icon, speak for 5 seconds, and let the app auto-transcribe and process your request.
4. **Close:** Click the "X" to close the window. The app will return to the system tray, waiting for your next hotkey press.

## Development

If you need to view raw console output and debug print statements while modifying the GUI, run the python script directly with the `--show` flag instead of using the background batch file:

```bash
python voicetally_query.py --show
```
