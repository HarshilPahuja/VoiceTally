import os
import tempfile
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.nlp_engine.speech_to_text.whisper_client import WhisperClient

router = APIRouter(prefix="/stt", tags=["Speech-to-Text"])

_stt_client = WhisperClient()


@router.post("/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    """
    Accepts an audio file (webm, wav, mp3, etc.), transcribes it
    via Whisper, and returns the text.
    """
    if not audio.filename:
        raise HTTPException(status_code=400, detail="No audio file provided.")

    # Determine file extension from upload
    ext = os.path.splitext(audio.filename)[1] or ".webm"
    tmp_path = None

    try:
        # Save to a temp file so Whisper can read it
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext, mode="wb") as tmp:
            tmp_path = tmp.name
            content = await audio.read()
            tmp.write(content)

        text = _stt_client.transcribe(tmp_path)
        return {"text": text}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    finally:
        # Clean up temp file
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
