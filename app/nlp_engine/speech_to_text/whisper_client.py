from app.nlp_engine.speech_to_text.stt_interface import SpeechToTextInterface


class WhisperClient(SpeechToTextInterface):
    """
    Whisper STT client (stub).
    """

    def transcribe(self, audio_path: str) -> str:
        raise NotImplementedError(
            "Whisper speech-to-text not implemented yet"
        )
