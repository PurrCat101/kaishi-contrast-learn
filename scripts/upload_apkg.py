"""Upload the normalized Kaishi APKG seed into Supabase.

This is an explicit server-side operation. It reads SUPABASE_SERVICE_ROLE_KEY
from the local environment, never prints it, and skips a completed package
using the package SHA-256 unless --force is supplied.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sqlite3
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from import_apkg import FIELD_NAMES, media_references, parse_package


class ProgressBar:
    def __init__(self, total: int) -> None:
        self.total = max(total, 1)
        self.current = 0

    def update(self, label: str, amount: int = 1) -> None:
        self.current = min(self.current + amount, self.total)
        percent = self.current / self.total
        width = 30
        filled = int(width * percent)
        bar = "#" * filled + "." * (width - filled)
        sys.stdout.write(f"\r[{bar}] {percent:6.1%} {label[:55]:<55}")
        sys.stdout.flush()
        if self.current >= self.total:
            sys.stdout.write("\n")


def chunk_count(row_count: int, chunk_size: int = 100) -> int:
    return (row_count + chunk_size - 1) // chunk_size if row_count else 0


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    env_path = Path(".env")
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.strip() and not line.lstrip().startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip()
    values.update({key: value for key, value in os.environ.items() if value})
    return values


class SupabaseApi:
    def __init__(self, url: str, service_key: str) -> None:
        self.url = url.rstrip("/")
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Accept": "application/json",
        }

    def request(self, method: str, path: str, body: Any = None, headers: dict[str, str] | None = None) -> Any:
        request_headers = {**self.headers, **(headers or {})}
        data = None
        if body is not None:
            data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
            request_headers.setdefault("Content-Type", "application/json")
        request = urllib.request.Request(f"{self.url}{path}", data=data, headers=request_headers, method=method)
        try:
            with urllib.request.urlopen(request) as response:
                payload = response.read()
                return json.loads(payload) if payload else None
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase {method} {path} failed ({error.code}): {detail}") from error

    def rest(self, table: str, query: str = "") -> Any:
        return self.request("GET", f"/rest/v1/{table}{query}")

    def insert(self, table: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result = self.request("POST", f"/rest/v1/{table}", rows, {"Prefer": "return=representation"})
        return result if isinstance(result, list) else []

    def upsert(self, table: str, rows: list[dict[str, Any]], conflict: str) -> list[dict[str, Any]]:
        result = self.request(
            "POST",
            f"/rest/v1/{table}?on_conflict={urllib.parse.quote(conflict, safe=',')}",
            rows,
            {"Prefer": "resolution=merge-duplicates,return=representation"},
        )
        return result if isinstance(result, list) else []

    def insert_chunks(
        self,
        table: str,
        rows: list[dict[str, Any]],
        chunk_size: int = 100,
        on_chunk: Any = None,
    ) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for start in range(0, len(rows), chunk_size):
            result.extend(self.insert(table, rows[start : start + chunk_size]))
            if on_chunk:
                on_chunk(table, min(start + chunk_size, len(rows)), len(rows))
        return result

    def delete(self, table: str, query: str) -> None:
        self.request("DELETE", f"/rest/v1/{table}{query}", headers={"Prefer": "return=minimal"})

    def upload_media(self, bucket: str, path: str, content: bytes, content_type: str) -> None:
        encoded_path = "/".join(urllib.parse.quote(part, safe="") for part in path.split("/"))
        self.request(
            "POST",
            f"/storage/v1/object/{urllib.parse.quote(bucket, safe='')}/{encoded_path}",
            content,
            {"Content-Type": content_type, "x-upsert": "true"},
        )

    def ensure_bucket(self, bucket: str) -> None:
        try:
            self.request("POST", "/storage/v1/bucket", {"id": bucket, "name": bucket, "public": False})
        except RuntimeError as error:
            if "(409)" not in str(error) and "BucketAlreadyExists" not in str(error) and '"code":"Duplicate"' not in str(error):
                raise


def source_timestamp(milliseconds: int) -> str:
    return datetime.fromtimestamp(milliseconds / 1000, tz=timezone.utc).isoformat()


def source_rows(apkg_path: Path, import_batch_id: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    with zipfile.ZipFile(apkg_path) as archive, TemporaryDirectory() as temp_dir:
        database_path = Path(temp_dir) / "collection.anki21"
        database_name = "collection.anki21" if "collection.anki21" in archive.namelist() else "collection.anki2"
        database_path.write_bytes(archive.read(database_name))
        connection = sqlite3.connect(database_path)
        connection.row_factory = sqlite3.Row
        try:
            cards = [
                {
                    "import_batch_id": import_batch_id,
                    "source_card_id": str(row["id"]),
                    "source_note_id": str(row["nid"]),
                    "source_deck_id": str(row["did"]),
                    "ordinal": row["ord"],
                    "raw_card": dict(row),
                }
                for row in connection.execute("select * from cards")
            ]
            revlog = [
                {
                    "import_batch_id": import_batch_id,
                    "source_review_id": str(row["id"]),
                    "source_card_id": str(row["cid"]),
                    "reviewed_at": source_timestamp(row["id"]),
                    "raw_review": dict(row),
                }
                for row in connection.execute("select * from revlog")
            ]
            return cards, revlog
        finally:
            connection.close()


def upload(apkg_path: Path, force: bool, reset: bool) -> dict[str, Any]:
    env = load_env()
    url = env.get("VITE_SUPABASE_URL")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not service_key:
        raise RuntimeError("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

    manifest = parse_package(apkg_path, None)
    api = SupabaseApi(url, service_key)
    package_hash = manifest["package_sha256"]
    media_manifest: dict[str, str]
    with zipfile.ZipFile(apkg_path) as archive:
        media_manifest = json.loads(archive.read("media").decode("utf-8"))

    media_link_count = sum(
        len(media_references(note["raw_fields"].get(field, "")))
        for note in manifest["notes"]
        for field in ("Word Audio", "Sentence Audio", "Picture")
    )
    chunked_rows = [
        len(manifest["notes"]),
        len(manifest["notes"]),
        len(manifest["notes"]),
        len(manifest["notes"]),
        manifest["counts"]["cards"],
        manifest["counts"]["revlog"],
    ]
    total_steps = 5 + sum(chunk_count(count) for count in chunked_rows) + len(media_manifest) * 2 + chunk_count(media_link_count)
    progress = ProgressBar(total_steps)
    progress.update("Reading package")
    encoded_hash = urllib.parse.quote(package_hash, safe="")
    existing = api.rest("import_batches", f"?package_sha256=eq.{encoded_hash}&select=id,status&order=created_at.desc")
    completed = next((batch for batch in existing if batch.get("status") == "completed"), None)
    if completed and not force:
        return {"status": "skipped", "reason": "package already completed", "import_batch_id": completed["id"]}
    if existing and not reset:
        raise RuntimeError("An incomplete import batch already exists; rerun with --reset to remove this seed batch")
    if existing and reset:
        source_version = urllib.parse.quote(manifest["source_version"], safe="")
        api.delete("vocabulary", f"?source=eq.{manifest['source']}&source_version=eq.{source_version}")
        for batch in existing:
            api.delete("media_assets", f"?import_batch_id=eq.{batch['id']}")
            api.delete("import_batches", f"?id=eq.{batch['id']}")
        api.delete("decks", f"?source=eq.{manifest['source']}&source_version=eq.{source_version}")

    batch = api.insert(
        "import_batches",
        [{
            "source": manifest["source"],
            "source_version": manifest["source_version"],
            "package_sha256": package_hash,
            "importer_version": "1.0.0",
            "status": "processing",
            "notes_count": manifest["counts"]["notes"],
            "cards_count": manifest["counts"]["cards"],
            "media_count": manifest["counts"]["media"],
            "started_at": datetime.now(timezone.utc).isoformat(),
        }],
    )
    if not batch:
        raise RuntimeError("Supabase did not return the import batch")
    batch_id = batch[0]["id"]
    progress.update("Created import batch")

    deck = next(deck for deck in manifest["decks"] if deck["name"] != "Default")
    deck_row = api.insert("decks", [{
        "name": deck["name"],
        "source": manifest["source"],
        "source_version": manifest["source_version"],
        "source_deck_id": deck["source_deck_id"],
        "import_batch_id": batch_id,
    }])[0]
    deck_id = deck_row["id"]
    progress.update("Created deck")

    model = next(model for model in manifest["models"] if model["name"] == manifest["source_version"])
    api.insert("source_models", [{
        "import_batch_id": batch_id,
        "source_model_id": model["source_model_id"],
        "name": model["name"],
        "fields": model["fields"],
    }])
    progress.update("Created source model")

    raw_rows = [{
        "import_batch_id": batch_id,
        "source_note_id": note["source_note_id"],
        "source_guid": note["source_guid"],
        "source_model_id": note["source_model_id"],
        "source_deck_id": deck["source_deck_id"],
        "fields": note["raw_fields"],
        "tags": note["tags"],
        "raw_hash": package_hash,
    } for note in manifest["notes"]]
    api.insert_chunks("source_notes_raw", raw_rows, on_chunk=lambda table, done, total: progress.update(f"Uploading {table}: {done}/{total}"))

    vocabulary_rows = [{
        "deck_id": deck_id,
        "source": manifest["source"],
        "source_note_id": note["source_note_id"],
        "source_version": manifest["source_version"],
        "source_id": note["source_guid"],
        "word": note["word"],
        "meaning": note["meaning"],
        "notes": note["notes"],
        "pitch_accent_raw": note["pitch_accent_raw"],
        "pitch_accent_notes": note["pitch_accent_notes"],
        "frequency": note["frequency"],
    } for note in manifest["notes"]]
    vocabulary_result = api.insert_chunks("vocabulary", vocabulary_rows, on_chunk=lambda table, done, total: progress.update(f"Uploading {table}: {done}/{total}"))
    vocabulary_by_note = {row["source_note_id"]: row["id"] for row in vocabulary_result}

    readings = [{"vocabulary_id": vocabulary_by_note[note["source_note_id"]], "reading": note["reading"], "is_primary": True} for note in manifest["notes"]]
    examples = [{
        "vocabulary_id": vocabulary_by_note[note["source_note_id"]],
        "sentence": note["sentence"],
        "translation": note["sentence_meaning"],
        "furigana": note["sentence_furigana"],
        "source_html": {"sentence": note["raw_fields"].get("Sentence", ""), "furigana": note["raw_fields"].get("Sentence Furigana", "")},
    } for note in manifest["notes"]]
    api.insert_chunks("vocabulary_readings", readings, on_chunk=lambda table, done, total: progress.update(f"Uploading {table}: {done}/{total}"))
    api.insert_chunks("vocabulary_examples", examples, on_chunk=lambda table, done, total: progress.update(f"Uploading {table}: {done}/{total}"))

    cards, revlog = source_rows(apkg_path, batch_id)
    api.insert_chunks("source_cards", cards, on_chunk=lambda table, done, total: progress.update(f"Uploading {table}: {done}/{total}"))
    api.insert_chunks("source_revlog", revlog, on_chunk=lambda table, done, total: progress.update(f"Uploading {table}: {done}/{total}"))

    bucket_by_extension = {".mp3": "kaishi-audio", ".wav": "kaishi-audio", ".ogg": "kaishi-audio", ".webp": "kaishi-images", ".png": "kaishi-images", ".jpg": "kaishi-images", ".jpeg": "kaishi-images"}
    media_rows: list[dict[str, Any]] = []
    media_ids: dict[str, str] = {}
    with zipfile.ZipFile(apkg_path) as archive:
        for bucket in sorted(set(bucket_by_extension.values())):
            api.ensure_bucket(bucket)
        for archive_id, filename in media_manifest.items():
            extension = Path(filename).suffix.lower()
            bucket = bucket_by_extension.get(extension, "kaishi-media")
            content = archive.read(archive_id)
            storage_path = f"kaishi-1.5k/{package_hash[:16]}/{archive_id}{extension}"
            api.upload_media(bucket, storage_path, content, mimetypes.guess_type(filename)[0] or "application/octet-stream")
            progress.update(f"Uploading media: {filename}")
            asset = api.upsert("media_assets", [{
                "import_batch_id": batch_id,
                "original_filename": filename,
                "checksum_sha256": __import__("hashlib").sha256(content).hexdigest(),
                "mime_type": mimetypes.guess_type(filename)[0] or "application/octet-stream",
                "byte_size": len(content),
                "storage_bucket": bucket,
                "storage_path": storage_path,
                "status": "uploaded",
            }], "checksum_sha256")[0]
            media_ids[filename] = asset["id"]
            progress.update(f"Saving media record: {filename}")

        media_links: list[dict[str, Any]] = []
        for note in manifest["notes"]:
            vocabulary_id = vocabulary_by_note[note["source_note_id"]]
            for field, role in (("Word Audio", "WORD_AUDIO"), ("Sentence Audio", "SENTENCE_AUDIO"), ("Picture", "PICTURE")):
                for filename in media_references(note["raw_fields"].get(field, "")):
                    media_links.append({"vocabulary_id": vocabulary_id, "media_asset_id": media_ids[filename], "role": role, "source_field": field})
        api.insert_chunks("vocabulary_media", media_links, on_chunk=lambda table, done, total: progress.update(f"Uploading {table}: {done}/{total}"))

    api.request("PATCH", f"/rest/v1/import_batches?id=eq.{batch_id}", {"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()}, {"Prefer": "return=minimal"})
    progress.update("Import completed")
    return {"status": "completed", "import_batch_id": batch_id, "counts": manifest["counts"]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--force", action="store_true", help="Re-import even when this package hash is completed")
    parser.add_argument("--reset", action="store_true", help="Delete the incomplete seed batch before importing again")
    args = parser.parse_args()
    try:
        print(json.dumps(upload(args.input, args.force, args.reset), ensure_ascii=False, indent=2))
    except (OSError, ValueError, RuntimeError, zipfile.BadZipFile, sqlite3.Error, json.JSONDecodeError) as error:
        print(f"APKG upload failed: {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())