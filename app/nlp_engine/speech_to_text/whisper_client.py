import whisper
from app.nlp_engine.speech_to_text.stt_interface import SpeechToTextInterface


class WhisperClient(SpeechToTextInterface):
    """
    Whisper STT client — uses openai-whisper 'base' model.
    Model is lazily loaded on first transcription call.
    """

    _model = None

    @classmethod
    def _load_model(cls):
        if cls._model is None:
            cls._model = whisper.load_model("base")
        return cls._model

    def transcribe(self, audio_path: str) -> str:
        model = self._load_model()
        result = model.transcribe(audio_path, fp16=False)
        return result.get("text", "").strip()
