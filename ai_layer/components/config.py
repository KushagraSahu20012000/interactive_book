from __future__ import annotations

import os


def sanitize_env_value(value: str | None, default: str = "") -> str:
	if value is None:
		return default

	cleaned = value.strip()
	if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {"\"", "'"}:
		cleaned = cleaned[1:-1].strip()

	return cleaned or default


def get_env(name: str, default: str = "") -> str:
	return sanitize_env_value(os.getenv(name), default)

# Core model config
DEFAULT_GROQ_MODEL = get_env("GROQ_MODEL", "openai/gpt-oss-120b")

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

TTS_ENGLISH_VOICE = get_env("GROQ_TTS_VOICE_ENGLISH", "diana")
TTS_HINDI_VOICE = get_env("GROQ_TTS_VOICE_HINDI", "lulwa")

TTS_ENGLISH_MODEL = get_env("GROQ_TTS_MODEL_ENGLISH", get_env("GROQ_TTS_MODEL", "canopylabs/orpheus-v1-english"))
TTS_HINDI_MODEL = get_env("GROQ_TTS_MODEL_HINDI", "canopylabs/orpheus-arabic-saudi")
