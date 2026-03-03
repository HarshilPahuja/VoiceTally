# Voice-Tally
Voice-Tally is a voice-driven AI assistant for Tally that allows business owners and accountants to ask questions in natural language and instantly receive insights from their Tally data.

## Setup

1. **Install dependencies:**
	- For the backend: `cd voicetally-backend && npm install`
	- For Python extraction: `pip install -r requirements.txt` (if requirements.txt exists)

2. **Configure Tally:**
	- Start Tally Prime, enable ODBC, and set the port to 9000.
	- Update `extracting_tally_data/config.json` with your company name.

3. **Extract Data:**
	- Run `python extracting_tally_data/tally_to_csv.py` to generate CSVs for the backend.

4. **Start Backend:**
	- `cd voicetally-backend && npm start`

5. **Load Chrome Extension:**
	- Go to `chrome://extensions`, enable Developer Mode, and load `voicetally-extension` as an unpacked extension.

## Usage

1. Click the VoiceTally extension icon in Chrome.
2. Type or speak your query (e.g., "sales last week").
3. Results will appear in a user-friendly table.

## Troubleshooting

- **Tally connection errors:** Ensure Tally is running and ODBC is enabled on port 9000.
- **No data in extension:** Make sure you have run the extraction script and the backend is running.
- **Backend errors:** Check the backend terminal for error logs.
- **Audio issues:** Grant microphone permissions in Chrome and your OS.

## Contributing

Pull requests are welcome! Please add tests and update documentation as appropriate.
