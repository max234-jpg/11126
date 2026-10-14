"""Serveur relais AI-CAM.

Reçoit une photo JPEG de la carte, demande à Claude une description courte en
français, la synthétise en voix (Piper, hors-ligne) et renvoie du PCM 16 bits
mono brut, avec l'en-tête X-Sample-Rate.

La clé API reste sur ce serveur : la carte ne connaît que DEVICE_TOKEN.

    pip install -r requirements.txt
    python -m piper.download_voices fr_FR-siwis-medium
    export ANTHROPIC_API_KEY=...  DEVICE_TOKEN=change-moi
    uvicorn relay:app --host 0.0.0.0 --port 8000
"""

import base64
import io
import logging
import os
import secrets
import urllib.parse
import wave

import anthropic
from fastapi import FastAPI, Header, HTTPException, Request, Response
from piper import PiperVoice

MODEL = "claude-opus-5-5"
VOICE_PATH = os.environ.get("PIPER_VOICE", "fr_FR-siwis-medium.onnx")
DEVICE_TOKEN = os.environ["DEVICE_TOKEN"]
MAX_JPEG_BYTES = 2_000_000

SYSTEM = (
    "Tu es la voix d'un petit appareil photo de poche. On te montre la photo "
    "que l'utilisateur vient de prendre. Décris en français ce qui est "
    "important, en deux ou trois phrases courtes, comme si tu parlais à voix "
    "haute : pas de liste, pas de markdown, pas d'émoji. S'il y a du texte "
    "lisible (panneau, étiquette, document), lis-le. Si la photo est floue ou "
    "trop sombre, dis-le simplement."
)

log = logging.getLogger("relay")
logging.basicConfig(level=logging.INFO)

client = anthropic.Anthropic()
voice = PiperVoice.load(VOICE_PATH)
app = FastAPI()


def describe(jpeg: bytes) -> str:
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=4000,
        output_config={"effort": "low"},  # réponse courte : latence avant tout
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=SYSTEM,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": base64.standard_b64encode(jpeg).decode("ascii"),
                    },
                },
                {"type": "text", "text": "Que vois-tu ?"},
            ],
        }],
    )
    if response.stop_reason == "refusal":
        return "Je ne peux pas décrire cette image."
    text = " ".join(b.text for b in response.content if b.type == "text").strip()
    return text or "Je n'ai rien à dire sur cette image."


def speak(text: str) -> tuple[bytes, int]:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        voice.synthesize_wav(text, wav)
    buf.seek(0)
    with wave.open(buf, "rb") as wav:
        assert wav.getsampwidth() == 2 and wav.getnchannels() == 1
        return wav.readframes(wav.getnframes()), wav.getframerate()


@app.post("/ask")
async def ask(request: Request, x_device_token: str = Header(default="")) -> Response:
    if not secrets.compare_digest(x_device_token, DEVICE_TOKEN):
        raise HTTPException(status_code=401)
    jpeg = await request.body()
    if not jpeg.startswith(b"\xff\xd8") or len(jpeg) > MAX_JPEG_BYTES:
        raise HTTPException(status_code=400, detail="JPEG attendu")

    try:
        text = describe(jpeg)
    except anthropic.RateLimitError:
        text = "Trop de demandes, réessaie dans un instant."
    except (anthropic.APIStatusError, anthropic.APIConnectionError) as e:
        log.error("Erreur API Claude : %s", e)
        text = "Je n'arrive pas à joindre l'intelligence artificielle."
    log.info("Réponse : %s", text)

    pcm, rate = speak(text)
    return Response(
        content=pcm,
        media_type="application/octet-stream",
        headers={"X-Sample-Rate": str(rate), "X-Text": urllib.parse.quote(text)},
    )
