"""
voicetally_query.py — Standalone NLP Query Tool (GUI)

Launched from Tally via the TDL extension menu item.
Provides:
  - Text input for typing queries
  - Voice input (mic recording → STT → auto-query)
  - Sends queries to /nlp/parse-query
  - Displays parsed intent + entities in a dark-themed GUI

Dependencies:
    pip install requests sounddevice soundfile

Usage:
    python voicetally_query.py
"""

import os
import sys
import json
import threading
import tempfile
import tkinter as tk
from tkinter import font as tkfont

try:
    import requests
except ImportError:
    print("Missing: pip install requests")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────

API_BASE = os.environ.get("VT_API_URL", "http://127.0.0.1:8001")
RECORD_SECONDS = 5
SAMPLE_RATE = 16000


# ── Dark Theme Colors ────────────────────────────────────────────────

BG = "#0F1117"
BG_SECONDARY = "#1A1D27"
BG_INPUT = "#22263280"
BG_CARD = "#1E2130"
BORDER = "#2E3340"
ACCENT = "#6C63FF"
ACCENT_HOVER = "#5A52E0"
TEXT = "#E8E9ED"
TEXT_MUTED = "#8B8FA3"
SUCCESS = "#34D399"
ERROR = "#F87171"
INFO = "#60A5FA"
WARNING = "#FBBF24"


# ── Main Application ─────────────────────────────────────────────────

class VoiceTallyApp:
    def __init__(self, root):
        self.root = root
        self.root.title("VoiceTally — NLP Query")
        self.root.configure(bg=BG)
        self.root.resizable(False, False)

        # Center window
        w, h = 480, 560
        x = (self.root.winfo_screenwidth() // 2) - (w // 2)
        y = (self.root.winfo_screenheight() // 2) - (h // 2)
        self.root.geometry(f"{w}x{h}+{x}+{y}")

        self.is_recording = False
        self._build_ui()

    def _build_ui(self):
        # ── Header ───────────────────────────────────────────────
        header = tk.Frame(self.root, bg=BG, pady=16, padx=20)
        header.pack(fill="x")

        title_font = tkfont.Font(family="Segoe UI", size=16, weight="bold")
        tk.Label(
            header, text="⚡ VoiceTally", font=title_font,
            bg=BG, fg=ACCENT
        ).pack(side="left")

        self.status_label = tk.Label(
            header, text="Ready", font=("Segoe UI", 9),
            bg=BG, fg=TEXT_MUTED
        )
        self.status_label.pack(side="right")

        # ── Separator ────────────────────────────────────────────
        tk.Frame(self.root, bg=BORDER, height=1).pack(fill="x")

        # ── Input Section ────────────────────────────────────────
        input_frame = tk.Frame(self.root, bg=BG, pady=14, padx=20)
        input_frame.pack(fill="x")

        tk.Label(
            input_frame, text="QUERY", font=("Segoe UI", 9, "bold"),
            bg=BG, fg=TEXT_MUTED
        ).pack(anchor="w", pady=(0, 6))

        entry_frame = tk.Frame(input_frame, bg=BG)
        entry_frame.pack(fill="x")

        self.query_var = tk.StringVar()
        self.query_entry = tk.Entry(
            entry_frame, textvariable=self.query_var,
            font=("Segoe UI", 12), bg=BG_SECONDARY, fg=TEXT,
            insertbackground=TEXT, relief="flat", bd=0,
            highlightthickness=1, highlightbackground=BORDER,
            highlightcolor=ACCENT
        )
        self.query_entry.pack(side="left", fill="x", expand=True, ipady=10, ipadx=10)
        self.query_entry.bind("<Return>", lambda e: self._on_submit())

        # Mic button
        self.mic_btn = tk.Button(
            entry_frame, text="🎤", font=("Segoe UI", 14),
            bg=BG_SECONDARY, fg=TEXT_MUTED, relief="flat", bd=0,
            cursor="hand2", width=3, activebackground=ACCENT,
            command=self._on_mic_click
        )
        self.mic_btn.pack(side="left", padx=(6, 0), ipady=6)

        # Submit button
        self.submit_btn = tk.Button(
            entry_frame, text="Send ▶", font=("Segoe UI", 10, "bold"),
            bg=ACCENT, fg="white", relief="flat", bd=0,
            cursor="hand2", activebackground=ACCENT_HOVER,
            command=self._on_submit
        )
        self.submit_btn.pack(side="left", padx=(6, 0), ipady=8, ipadx=14)

        # Placeholder text
        self.query_entry.insert(0, "e.g. show sales for last week")
        self.query_entry.config(fg=TEXT_MUTED)
        self.query_entry.bind("<FocusIn>", self._on_focus_in)
        self.query_entry.bind("<FocusOut>", self._on_focus_out)

        # ── Separator ────────────────────────────────────────────
        tk.Frame(self.root, bg=BORDER, height=1).pack(fill="x", pady=(4, 0))

        # ── Result Section ───────────────────────────────────────
        result_frame = tk.Frame(self.root, bg=BG, pady=14, padx=20)
        result_frame.pack(fill="both", expand=True)

        tk.Label(
            result_frame, text="PARSED RESULT", font=("Segoe UI", 9, "bold"),
            bg=BG, fg=TEXT_MUTED
        ).pack(anchor="w", pady=(0, 8))

        # Result card
        self.result_card = tk.Frame(result_frame, bg=BG_CARD, bd=0,
                                     highlightthickness=1, highlightbackground=BORDER)
        self.result_card.pack(fill="both", expand=True)

        self.result_text = tk.Text(
            self.result_card, font=("Consolas", 11), bg=BG_CARD, fg=TEXT,
            relief="flat", bd=0, wrap="word", padx=14, pady=14,
            insertbackground=TEXT, state="disabled",
            highlightthickness=0
        )
        self.result_text.pack(fill="both", expand=True)

        # Configure text tags for colored output
        self.result_text.tag_configure("label", foreground=TEXT_MUTED, font=("Consolas", 10))
        self.result_text.tag_configure("value", foreground=TEXT, font=("Consolas", 11, "bold"))
        self.result_text.tag_configure("intent", foreground=ACCENT, font=("Consolas", 12, "bold"))
        self.result_text.tag_configure("entity", foreground=SUCCESS, font=("Consolas", 11))
        self.result_text.tag_configure("error", foreground=ERROR, font=("Consolas", 11))
        self.result_text.tag_configure("info", foreground=INFO, font=("Consolas", 10))
        self.result_text.tag_configure("muted", foreground=TEXT_MUTED, font=("Consolas", 10))

        self._set_result("Type a query or click 🎤 to speak.\n\nExamples:\n  • show sales for last week\n  • ledger balance of ABC Traders\n  • stock inquiry for cement", "muted")

        # ── Footer ───────────────────────────────────────────────
        footer = tk.Frame(self.root, bg=BG, pady=8, padx=20)
        footer.pack(fill="x")
        tk.Label(
            footer, text=f"API: {API_BASE}", font=("Segoe UI", 8),
            bg=BG, fg=TEXT_MUTED
        ).pack(side="left")

    # ── Placeholder behavior ─────────────────────────────────────

    def _on_focus_in(self, event):
        if self.query_var.get() == "e.g. show sales for last week":
            self.query_entry.delete(0, "end")
            self.query_entry.config(fg=TEXT)

    def _on_focus_out(self, event):
        if not self.query_var.get().strip():
            self.query_entry.insert(0, "e.g. show sales for last week")
            self.query_entry.config(fg=TEXT_MUTED)

    # ── Submit (text) ────────────────────────────────────────────

    def _on_submit(self):
        query = self.query_var.get().strip()
        if not query or query == "e.g. show sales for last week":
            self._set_status("Type a query first", ERROR)
            return

        self._set_status("Parsing with NLP...", INFO)
        self.submit_btn.config(state="disabled", text="...")

        # Run in thread to keep UI responsive
        threading.Thread(target=self._do_parse, args=(query,), daemon=True).start()

    def _do_parse(self, query):
        try:
            resp = requests.post(
                f"{API_BASE}/nlp/parse-query",
                json={"query": query},
                timeout=10
            )

            if resp.status_code != 200:
                self.root.after(0, self._show_error, f"API returned {resp.status_code}: {resp.text[:100]}")
                return

            data = resp.json()
            self.root.after(0, self._show_result, data)

        except requests.ConnectionError:
            self.root.after(0, self._show_error, f"Cannot connect to {API_BASE}\nIs the server running?")
        except requests.Timeout:
            self.root.after(0, self._show_error, "Request timed out (10s)")
        except Exception as e:
            self.root.after(0, self._show_error, str(e))
        finally:
            self.root.after(0, lambda: self.submit_btn.config(state="normal", text="Send ▶"))

    # ── Voice Input ──────────────────────────────────────────────

    def _on_mic_click(self):
        if self.is_recording:
            return

        # Check if audio libs are available
        try:
            import sounddevice as sd
            import soundfile as sf
        except ImportError:
            self._show_error("Voice requires: pip install sounddevice soundfile")
            return

        self.is_recording = True
        self.mic_btn.config(bg=ERROR, fg="white", text="⏺")
        self._set_status(f"Recording {RECORD_SECONDS}s... speak now!", ERROR)

        threading.Thread(target=self._do_voice_capture, daemon=True).start()

    def _do_voice_capture(self):
        try:
            import sounddevice as sd
            import soundfile as sf

            # 1. Record audio
            audio = sd.rec(
                int(RECORD_SECONDS * SAMPLE_RATE),
                samplerate=SAMPLE_RATE, channels=1, dtype="float32"
            )
            sd.wait()

            # Save temp file
            tmp = os.path.join(tempfile.gettempdir(), "vt_rec.wav")
            sf.write(tmp, audio, SAMPLE_RATE)

            self.root.after(0, lambda: self._set_status("Transcribing...", INFO))

            # 2. Send to STT
            with open(tmp, "rb") as f:
                stt_resp = requests.post(
                    f"{API_BASE}/stt/transcribe",
                    files={"audio": ("recording.wav", f, "audio/wav")},
                    timeout=30
                )

            os.unlink(tmp)

            if stt_resp.status_code != 200:
                self.root.after(0, self._show_error, f"STT failed: {stt_resp.text[:100]}")
                return

            text = stt_resp.json().get("text", "").strip()
            if not text:
                self.root.after(0, self._show_error, "Couldn't understand audio. Try again.")
                return

            # Show transcribed text in input
            self.root.after(0, lambda: self.query_var.set(text))
            self.root.after(0, lambda: self.query_entry.config(fg=TEXT))
            self.root.after(0, lambda: self._set_status(f'Heard: "{text}" — parsing...', SUCCESS))

            # 3. Auto-send to parse-query
            self._do_parse(text)

        except Exception as e:
            self.root.after(0, self._show_error, f"Voice error: {e}")
        finally:
            self.is_recording = False
            self.root.after(0, lambda: self.mic_btn.config(bg=BG_SECONDARY, fg=TEXT_MUTED, text="🎤"))

    # ── Display Helpers ──────────────────────────────────────────

    def _show_result(self, data):
        self.result_text.config(state="normal")
        self.result_text.delete("1.0", "end")

        intent = data.get("intent") or "UNKNOWN"
        entities = data.get("entities", {})
        language = data.get("language", "—")
        original = data.get("original_query", "—")
        error = data.get("error")

        if error:
            self.result_text.insert("end", f"⚠ {error}\n", "error")
            self._set_status("Parse returned an error", WARNING)
        else:
            self._set_status(f"✓ {intent}", SUCCESS)

        self.result_text.insert("end", "INTENT\n", "label")
        self.result_text.insert("end", f"  {intent}\n\n", "intent")

        if entities:
            self.result_text.insert("end", "ENTITIES\n", "label")
            self._insert_entities(entities, indent=2)
            self.result_text.insert("end", "\n")

        self.result_text.insert("end", "LANGUAGE\n", "label")
        self.result_text.insert("end", f"  {language}\n\n", "value")

        self.result_text.insert("end", "ORIGINAL QUERY\n", "label")
        self.result_text.insert("end", f"  {original}\n", "info")

        self.result_text.config(state="disabled")

    def _insert_entities(self, obj, indent=0):
        prefix = " " * indent
        if isinstance(obj, dict):
            for k, v in obj.items():
                if isinstance(v, dict):
                    self.result_text.insert("end", f"{prefix}{k}:\n", "label")
                    self._insert_entities(v, indent + 2)
                else:
                    self.result_text.insert("end", f"{prefix}{k}: ", "label")
                    self.result_text.insert("end", f"{v}\n", "entity")
        else:
            self.result_text.insert("end", f"{prefix}{obj}\n", "entity")

    def _show_error(self, msg):
        self._set_result(f"❌ {msg}", "error")
        self._set_status("Error", ERROR)

    def _set_result(self, text, tag="muted"):
        self.result_text.config(state="normal")
        self.result_text.delete("1.0", "end")
        self.result_text.insert("1.0", text, tag)
        self.result_text.config(state="disabled")

    def _set_status(self, text, color=TEXT_MUTED):
        self.status_label.config(text=text, fg=color)


# ── Entry Point ──────────────────────────────────────────────────────

if __name__ == "__main__":
    root = tk.Tk()
    app = VoiceTallyApp(root)
    root.mainloop()
