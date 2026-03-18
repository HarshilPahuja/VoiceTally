"""
voicetally_query.py — System Tray NLP Query Tool

Runs as a system tray icon with a global hotkey (Ctrl+Shift+V).
Press the hotkey or click the tray icon to open the query window.
Close the window → hides to tray (always ready).

Dependencies:
    pip install requests pystray Pillow keyboard sounddevice soundfile

Usage:
    pythonw voicetally_query.py        (background, no console)
    python  voicetally_query.py        (with console for debugging)
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

try:
    import pystray
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    pystray = None

try:
    import keyboard
except ImportError:
    keyboard = None


# ── Config ────────────────────────────────────────────────────────────

API_BASE = os.environ.get("VT_API_URL", "http://127.0.0.1:8001")
RECORD_SECONDS = 5
SAMPLE_RATE = 16000
HOTKEY = "ctrl+shift+v"


# ── Dark Theme Colors ────────────────────────────────────────────────

BG = "#0F1117"
BG_SECONDARY = "#1A1D27"
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


# ── Tray Icon Generator ──────────────────────────────────────────────

def create_tray_icon_image():
    """Generate a small 64x64 icon with 'VT' text for the system tray."""
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Purple rounded background
    draw.rounded_rectangle([2, 2, 62, 62], radius=14, fill="#6C63FF")

    # "VT" text
    try:
        fnt = ImageFont.truetype("arial.ttf", 26)
    except Exception:
        fnt = ImageFont.load_default()

    draw.text((10, 14), "VT", fill="white", font=fnt)
    return img


# ── Main Application ─────────────────────────────────────────────────

class VoiceTallyApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("VoiceTally — NLP Query")
        self.root.configure(bg=BG)
        self.root.resizable(False, False)

        # Center window
        w, h = 480, 560
        x = (self.root.winfo_screenwidth() // 2) - (w // 2)
        y = (self.root.winfo_screenheight() // 2) - (h // 2)
        self.root.geometry(f"{w}x{h}+{x}+{y}")

        # Override close button → hide to tray
        self.root.protocol("WM_DELETE_WINDOW", self.hide_window)

        self.is_recording = False
        self.tray_icon = None
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

        # Hotkey hint
        hotkey_text = f"  {HOTKEY.upper()}" if keyboard else ""
        self.status_label = tk.Label(
            header, text=f"Ready{hotkey_text}", font=("Segoe UI", 9),
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

        self.result_card = tk.Frame(result_frame, bg=BG_CARD, bd=0,
                                     highlightthickness=1, highlightbackground=BORDER)
        self.result_card.pack(fill="both", expand=True)

        self.result_text = tk.Text(
            self.result_card, font=("Consolas", 11), bg=BG_CARD, fg=TEXT,
            relief="flat", bd=0, wrap="word", padx=14, pady=14,
            insertbackground=TEXT, state="disabled", highlightthickness=0
        )
        self.result_text.pack(fill="both", expand=True)

        # Text tags for colored output
        self.result_text.tag_configure("label", foreground=TEXT_MUTED, font=("Consolas", 10))
        self.result_text.tag_configure("value", foreground=TEXT, font=("Consolas", 11, "bold"))
        self.result_text.tag_configure("intent", foreground=ACCENT, font=("Consolas", 12, "bold"))
        self.result_text.tag_configure("entity", foreground=SUCCESS, font=("Consolas", 11))
        self.result_text.tag_configure("error", foreground=ERROR, font=("Consolas", 11))
        self.result_text.tag_configure("info", foreground=INFO, font=("Consolas", 10))
        self.result_text.tag_configure("muted", foreground=TEXT_MUTED, font=("Consolas", 10))

        hotkey_hint = f"\n\nHotkey: {HOTKEY.upper()}" if keyboard else ""
        self._set_result(
            f"Type a query or click 🎤 to speak.\n\n"
            f"Examples:\n"
            f"  • show sales for last week\n"
            f"  • ledger balance of ABC Traders\n"
            f"  • stock inquiry for cement{hotkey_hint}", "muted"
        )

        # ── Footer ───────────────────────────────────────────────
        footer = tk.Frame(self.root, bg=BG, pady=8, padx=20)
        footer.pack(fill="x")
        tk.Label(
            footer, text=f"API: {API_BASE}  •  Close to hide to tray",
            font=("Segoe UI", 8), bg=BG, fg=TEXT_MUTED
        ).pack(side="left")

    # ── Window Show/Hide ─────────────────────────────────────────

    def show_window(self):
        self.root.deiconify()
        self.root.lift()
        self.root.focus_force()
        self.query_entry.focus_set()

    def hide_window(self):
        self.root.withdraw()

    def toggle_window(self):
        if self.root.winfo_viewable():
            self.hide_window()
        else:
            self.show_window()

    # ── System Tray ──────────────────────────────────────────────

    def setup_tray(self):
        if pystray is None:
            return

        icon_image = create_tray_icon_image()

        menu = pystray.Menu(
            pystray.MenuItem("Open VoiceTally", lambda: self.root.after(0, self.show_window), default=True),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Quit", self._quit_app),
        )

        self.tray_icon = pystray.Icon(
            "VoiceTally",
            icon_image,
            "VoiceTally — Ctrl+Shift+V",
            menu
        )

        # Run tray icon in a separate thread
        tray_thread = threading.Thread(target=self.tray_icon.run, daemon=True)
        tray_thread.start()

    def setup_hotkey(self):
        if keyboard is None:
            return

        keyboard.add_hotkey(HOTKEY, lambda: self.root.after(0, self.toggle_window))

    def _quit_app(self):
        if self.tray_icon:
            self.tray_icon.stop()
        if keyboard:
            keyboard.unhook_all()
        self.root.after(0, self.root.destroy)

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

            audio = sd.rec(
                int(RECORD_SECONDS * SAMPLE_RATE),
                samplerate=SAMPLE_RATE, channels=1, dtype="float32"
            )
            sd.wait()

            tmp = os.path.join(tempfile.gettempdir(), "vt_rec.wav")
            sf.write(tmp, audio, SAMPLE_RATE)

            self.root.after(0, lambda: self._set_status("Transcribing...", INFO))

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

            self.root.after(0, lambda: self.query_var.set(text))
            self.root.after(0, lambda: self.query_entry.config(fg=TEXT))
            self.root.after(0, lambda: self._set_status(f'Heard: "{text}" — parsing...', SUCCESS))
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

    # ── Run ──────────────────────────────────────────────────────

    def run(self):
        # Setup tray icon
        self.setup_tray()

        # Setup global hotkey
        self.setup_hotkey()

        # Start hidden in tray (background mode)
        if "--show" in sys.argv:
            self.show_window()
        else:
            self.hide_window()

        self.root.mainloop()


# ── Entry Point ──────────────────────────────────────────────────────

if __name__ == "__main__":
    app = VoiceTallyApp()
    app.run()
