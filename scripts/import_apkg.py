"""Validate and normalize an Anki APKG without contacting Supabase.

The output is a JSON import manifest suitable for a later server-side loader.
The command is intentionally dry-run by default and never imports Anki revlog
rows into application review history.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sqlite3
import sys
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any


FIELD_NAMES = [
    "Word",
    "Word Reading",
    "Word Meaning",
    "Word Furigana",
    "Word Audio",
    "Sentence",
    "Sentence Meaning",
    "Sentence Furigana",
    "Sentence Audio",
    "Notes",
    "Pitch Accent",
    "Pitch Accent Notes",
    "Frequency",
    "Picture",
]


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def text(self) -> str:
        return " ".join(" ".join(self.parts).split())


def plain_text(value: str) -> str:
    parser = TextExtractor()
    parser.feed(value)
    return html.unescape(parser.text())


def media_references(value: str) -> list[str]:
    sounds = re.findall(r"\[sound:([^\]]+)\]", value)
    pictures = re.findall(r'<img[^>]+src=["\']([^"\']+)', value, re.IGNORECASE)
    return sounds + pictures


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_package(path: Path, extract_dir: Path | None) -> dict[str, Any]:
    package_bytes = path.read_bytes()
    package_hash = sha256(package_bytes)

    with zipfile.ZipFile(path) as archive, TemporaryDirectory() as temp_dir:
        database_name = "collection.anki21" if "collection.anki21" in archive.namelist() else "collection.anki2"
        database_path = Path(temp_dir) / database_name
        database_path.write_bytes(archive.read(database_name))
        media_manifest = json.loads(archive.read("media").decode("utf-8"))
        media_names = set(media_manifest.values())

        connection = sqlite3.connect(database_path)
        connection.row_factory = sqlite3.Row
        try:
            collection = connection.execute("select * from col").fetchone()
            decks = json.loads(collection["decks"])
            models = json.loads(collection["models"])
            notes = connection.execute("select id, guid, mid, tags, flds from notes order by id").fetchall()
            cards = connection.execute("select id, nid, did, ord, type, queue from cards order by id").fetchall()
            revlog_count = connection.execute("select count(*) from revlog").fetchone()[0]

            model_by_id = {str(model_id): model for model_id, model in models.items()}
            normalized_notes: list[dict[str, Any]] = []
            referenced_media: set[str] = set()
            for note in notes:
                fields = note["flds"].split("\x1f")
                model = model_by_id.get(str(note["mid"]), {})
                model_fields = [field.get("name", "") for field in model.get("flds", [])]
                raw_fields = {
                    name: fields[index] if index < len(fields) else ""
                    for index, name in enumerate(model_fields)
                }
                referenced_media.update(media_references(note["flds"]))
                normalized = {name: raw_fields.get(name, "") for name in FIELD_NAMES}
                normalized_notes.append(
                    {
                        "source_note_id": str(note["id"]),
                        "source_guid": note["guid"],
                        "source_model_id": str(note["mid"]),
                        "tags": note["tags"].split() if note["tags"].strip() else [],
                        "raw_fields": raw_fields,
                        "word": plain_text(normalized["Word"]),
                        "reading": plain_text(normalized["Word Reading"]),
                        "meaning": plain_text(normalized["Word Meaning"]),
                        "sentence": plain_text(normalized["Sentence"]),
                        "sentence_meaning": plain_text(normalized["Sentence Meaning"]),
                        "sentence_furigana": normalized["Sentence Furigana"],
                        "notes": plain_text(normalized["Notes"]) or None,
                        "pitch_accent_raw": normalized["Pitch Accent"] or None,
                        "pitch_accent_notes": plain_text(normalized["Pitch Accent Notes"]) or None,
                        "frequency": int(normalized["Frequency"]) if normalized["Frequency"].isdigit() else None,
                        "media": media_references(note["flds"]),
                    }
                )
        finally:
            connection.close()

        missing_media = sorted(referenced_media - media_names)
        if missing_media:
            raise ValueError(f"Missing media references: {missing_media[:5]}")

        if extract_dir:
            extract_dir.mkdir(parents=True, exist_ok=True)
            for archive_id, filename in media_manifest.items():
                target = extract_dir / filename
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(archive_id))

        return {
            "source": "kaishi",
            "source_version": next((deck.get("name") for deck in decks.values() if deck.get("name") != "Default"), "unknown"),
            "package_sha256": package_hash,
            "database": database_name,
            "decks": [{"source_deck_id": str(deck_id), "name": deck.get("name")} for deck_id, deck in decks.items()],
            "models": [{"source_model_id": str(model_id), "name": model.get("name"), "fields": [field.get("name") for field in model.get("flds", [])]} for model_id, model in models.items()],
            "counts": {"notes": len(normalized_notes), "cards": len(cards), "revlog": revlog_count, "media": len(media_manifest)},
            "media": [{"archive_id": archive_id, "filename": filename, "checksum_sha256": sha256(archive.read(archive_id))} for archive_id, filename in media_manifest.items()],
            "notes": normalized_notes,
        }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Path to an .apkg file")
    parser.add_argument("--output", type=Path, help="Write the normalized manifest JSON")
    parser.add_argument("--extract-media", type=Path, help="Extract media files to this directory")
    args = parser.parse_args()

    try:
        manifest = parse_package(args.input, args.extract_media)
    except (OSError, ValueError, zipfile.BadZipFile, sqlite3.Error, json.JSONDecodeError) as error:
        print(f"APKG import failed: {error}", file=sys.stderr)
        return 1

    payload = json.dumps(manifest, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")
    else:
        print(json.dumps({"source": manifest["source"], "database": manifest["database"], "counts": manifest["counts"], "package_sha256": manifest["package_sha256"]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())