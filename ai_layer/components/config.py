from __future__ import annotations

import os

# Core model config
DEFAULT_GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

# Input normalization config
VALID_AGE_GROUPS = {"5-10", "10-15", "15-20", "20+"}
VALID_NEUROTYPES = {"ADHD", "Dyslexia", "Autism", "None"}
VALID_LANGUAGES = {"English", "Hindi"}

DEFAULT_AGE_GROUP = "15-20"
DEFAULT_NEUROTYPE = "None"
DEFAULT_LANGUAGE = "English"

# Prompt style config
HINDI_STYLE_INSTRUCTION = "Write in native everyday spoken Hindi — as if speaking to a friend, not writing a formal document."

# Page generation config
PAGE_MEMORY_LIMIT = 10
AGE_TEMPERATURES = {"5-10": 0.70, "10-15": 0.65, "15-20": 0.45, "20+": 0.35}

# TTS config
TTS_DEFAULT_LANGUAGE = "English"
TTS_MAX_TEXT_LENGTH = 4000

TTS_ENGLISH_VOICE = os.getenv("GROQ_TTS_VOICE_ENGLISH", "diana")
TTS_HINDI_VOICE = os.getenv("GROQ_TTS_VOICE_HINDI", "lulwa")

TTS_ENGLISH_MODEL = os.getenv("GROQ_TTS_MODEL_ENGLISH", os.getenv("GROQ_TTS_MODEL", "canopylabs/orpheus-v1-english"))
TTS_HINDI_MODEL = os.getenv("GROQ_TTS_MODEL_HINDI", "canopylabs/orpheus-arabic-saudi")
