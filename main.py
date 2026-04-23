"""Safe local playground for provider APIs.

This file intentionally does NOT contain any hardcoded credentials.
Set required environment variables before running examples.
"""

from __future__ import annotations

import os


def print_env_status() -> None:
    required = ["GROQ_API_KEY", "HF_API_KEY"]
    for key in required:
        value = os.getenv(key)
        print(f"{key}: {'set' if value else 'missing'}")


if __name__ == "__main__":
    print("Local API playground")
    print("Set secrets in environment variables only.")
    print_env_status()