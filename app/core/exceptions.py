class VoiceTallyException(Exception):
    """Base exception for VoiceTally Intelligence Service"""
    pass


class IntentNotFoundException(VoiceTallyException):
    """Raised when intent cannot be determined"""
    pass


class InsightGenerationException(VoiceTallyException):
    """Raised when insight generation fails"""
    pass
