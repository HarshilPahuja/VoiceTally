class SpeechToTextInterface:
    """
    Abstract interface for Speech-to-Text providers.
    """

    def transcribe(self, audio_path: str) -> str:
        raise NotImplementedError("STT provider not implemented")
