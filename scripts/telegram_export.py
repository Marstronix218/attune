#!/usr/bin/env python3
"""Read one Telegram chat locally and create an Attune-compatible JSON export."""

from __future__ import annotations

import argparse
import asyncio
import getpass
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from telethon import TelegramClient
    from telethon.sessions import MemorySession
except ImportError as error:
    raise SystemExit(
        "Telethon is not installed. Run:\n"
        "  python3 -m pip install -r scripts/telegram-requirements.txt"
    ) from error


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export a Telegram conversation into a JSON file Attune can import."
    )
    parser.add_argument("chat", nargs="?", help="Telegram @username, phone number, or chat ID")
    parser.add_argument("--limit", type=int, default=5000, help="Maximum messages to read (default: 5000)")
    parser.add_argument("--output", default="telegram-attune-export.json", help="Output JSON path")
    parser.add_argument("--api-id", help="Telegram API ID; TELEGRAM_API_ID is also supported")
    return parser.parse_args()


def display_name(entity: Any, fallback: str) -> str:
    first = getattr(entity, "first_name", None)
    last = getattr(entity, "last_name", None)
    title = getattr(entity, "title", None)
    username = getattr(entity, "username", None)
    full_name = " ".join(part for part in (first, last) if part)
    return full_name or title or username or fallback


def media_kind(message: Any) -> str | None:
    if not getattr(message, "media", None):
        return None
    if getattr(message, "photo", None):
        return "photo"
    if getattr(message, "video", None):
        return "video"
    if getattr(message, "voice", None):
        return "voice_message"
    if getattr(message, "audio", None):
        return "audio"
    if getattr(message, "document", None):
        return "file"
    return type(message.media).__name__


async def export_chat(args: argparse.Namespace) -> None:
    api_id_text = args.api_id or os.getenv("TELEGRAM_API_ID") or input("Telegram API ID: ").strip()
    api_hash = os.getenv("TELEGRAM_API_HASH") or getpass.getpass("Telegram API hash (hidden): ").strip()
    target = args.chat or input("Chat @username, phone number, or ID: ").strip()

    if not api_id_text.isdigit() or not api_hash or not target:
        raise SystemExit("API ID, API hash, and chat are all required.")
    if args.limit < 1 or args.limit > 100_000:
        raise SystemExit("--limit must be between 1 and 100000.")

    output_path = Path(args.output).expanduser().resolve()
    client = TelegramClient(MemorySession(), int(api_id_text), api_hash)

    print("\nConnecting to Telegram. Telegram may ask for your phone, login code, and 2FA password.")
    print("The authorization session is kept in memory and discarded when this command exits.\n")

    await client.start()
    try:
        me = await client.get_me()
        entity = await client.get_entity(target)
        conversation_name = display_name(entity, target)
        messages: list[dict[str, Any]] = []

        print(f"Reading up to {args.limit:,} messages from {conversation_name}…")
        async for message in client.iter_messages(entity, limit=args.limit):
            sender = getattr(message, "sender", None)
            sender_name = "You" if message.out else display_name(sender, "Unknown participant")
            date = message.date
            if date.tzinfo is None:
                date = date.replace(tzinfo=timezone.utc)
            date_utc = date.astimezone(timezone.utc)
            messages.append(
                {
                    "id": message.id,
                    "type": "message",
                    "date": date_utc.isoformat(),
                    "date_unixtime": str(int(date_utc.timestamp())),
                    "from": sender_name,
                    "from_id": f"user{message.sender_id}" if message.sender_id else "unknown",
                    "text": message.raw_text or "",
                    "reply_to_message_id": message.reply_to_msg_id,
                    "media_type": media_kind(message),
                }
            )

        messages.reverse()
        payload = {
            "name": conversation_name,
            "type": "personal_chat",
            "id": getattr(entity, "id", target),
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "exported_by": display_name(me, "Telegram user"),
            "messages": messages,
        }
        output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nExported {len(messages):,} messages to:\n  {output_path}")
        print("Open Attune → Telegram import and upload this JSON file.")
    finally:
        await client.disconnect()


if __name__ == "__main__":
    asyncio.run(export_chat(arguments()))
