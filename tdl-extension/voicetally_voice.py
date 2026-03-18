"""
voicetally_voice.py — Companion voice capture script for the TDL extension.

This script:
  1. Records audio from the microphone for ~5 seconds
  2. Sends the audio to the Intelligence API's /stt/transcribe endpoint
  3. Writes the transcribed text to a temp file that TDL reads back

Usage (called automatically by the TDL extension):
    python voicetally_voice.py

Dependencies:
    pip install sounddevice soundfile requests
"""

import os
import sys
import tempfile
import time

try:
    import sounddevice as sd
    import soundfile as sf
    import requests
except ImportError:
    print("Missing deps. Install: pip install sounddevice soundfile requests")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────

API_BASE = os.environ.get("VT_API_URL", "http://127.0.0.1:8001")
RECORD_SECONDS = 5
SAMPLE_RATE = 16000  # 16kHz — good for speech
CHANNELS = 1

# Output file — TDL reads this back
OUTPUT_FILE = os.path.join(tempfile.gettempdir(), "vt_voice_result.txt")


def record_audio() -> str:
    """Record audio from the default microphone and return the temp file path."""
    print(f"🎤 Recording for {RECORD_SECONDS} seconds... Speak now!")
    audio_data = sd.rec(
        int(RECORD_SECONDS * SAMPLE_RATE),
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype="float32",
    )
    sd.wait()  # Block until recording is done
    print("✅ Recording complete.")

    # Save to a temp WAV file
    tmp_path = os.path.join(tempfile.gettempdir(), "vt_recording.wav")
    sf.write(tmp_path, audio_data, SAMPLE_RATE)
    return tmp_path


def transcribe_audio(audio_path: str) -> str:
    """Send audio file to the STT endpoint and return transcribed text."""
    print(f"📤 Sending to {API_BASE}/stt/transcribe ...")

    with open(audio_path, "rb") as f:
        response = requests.post(
            f"{API_BASE}/stt/transcribe",
            files={"audio": ("recording.wav", f, "audio/wav")},
            timeout=30,
        )

    if response.status_code != 200:
        print(f"❌ STT failed: {response.status_code} — {response.text}")
        return ""

    data = response.json()
    text = data.get("text", "").strip()
    print(f"📝 Transcribed: \"{text}\"")
    return text


def main():
    try:
        # 1. Record
        audio_path = record_audio()

        # 2. Transcribe
        text = transcribe_audio(audio_path)

        # 3. Write result for TDL to read
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            f.write(text)

        print(f"💾 Saved to: {OUTPUT_FILE}")

        # Cleanup audio file
        if os.path.exists(audio_path):
            os.unlink(audio_path)

    except KeyboardInterrupt:
        print("\n⚠ Cancelled.")
        with open(OUTPUT_FILE, "w") as f:
            f.write("")

    except Exception as e:
        print(f"❌ Error: {e}")
        with open(OUTPUT_FILE, "w") as f:
            f.write("")


if __name__ == "__main__":
    main()
