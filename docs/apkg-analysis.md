# APKG Analysis

## Input

- File: `kashi-deck.apkg`
- Inspected: 2026-09-19
- Runtime source database: `collection.anki21`
- Compatibility file: `collection.anki2` contains one instructional placeholder note and is not the vocabulary source for this package.

## Observed Data

| Area | Result |
| --- | ---: |
| Notes | 1,500 |
| Cards | 1,500 |
| Anki revlog rows | 7,711 |
| Note models | 1 (`Kaishi 1.5k`) |
| Note fields | 14 |
| Media files | 4,354 |
| Audio files | 2,972 |
| Image files | 1,382 |
| Missing media references | 0 |
| Unused media files | 0 |

Fields in the source model:

```text
Word
Word Reading
Word Meaning
Word Furigana
Word Audio
Sentence
Sentence Meaning
Sentence Furigana
Sentence Audio
Notes
Pitch Accent
Pitch Accent Notes
Frequency
Picture
```

## Data Quality Findings

- `Word` has 1,476 unique values, so 24 values are duplicated. Duplicate words must be allowed because one written form can represent multiple meanings or source notes.
- `Word Reading` has 1,429 unique values, so homophones are common and reading cannot be a unique key.
- Every note has Word, Word Reading, Word Meaning, Sentence, Sentence Furigana, Sentence Audio, Pitch Accent, Frequency, and Picture populated in this export.
- Word Audio is empty for one note.
- Notes and Pitch Accent Notes are sparse and must be nullable.
- Sentence, Sentence Furigana, Pitch Accent, and Picture contain HTML markup. Picture uses `<img src="...">`; audio uses `[sound:filename]`.
- All media references resolve against the package manifest. Import should still validate this and fail the batch or quarantine missing assets rather than silently producing broken records.
- The package includes Anki scheduling history. It is useful for audit/debugging but must not be inserted into `review_history`, which belongs to authenticated application users.

## Recommended Import Boundary

```text
APKG
  ├── import_batches
  ├── source_decks
  ├── source_models / source_field_mappings
  ├── source_notes_raw
  ├── vocabulary
  ├── vocabulary_readings
  ├── vocabulary_examples
  ├── media_assets
  └── vocabulary_media
```

The normalized `vocabulary` row should reference the source note, but source HTML and original field values should remain available in a raw snapshot for reproducibility.

## Schema Additions To Make

### Import provenance

Add an `import_batches` table with package SHA-256, source name/version, importer version, status, counts, error summary, and timestamps. Add a unique constraint on package hash plus source version when re-importing the same package should be a no-op.

Add `source_note_id`, `source_guid`, `source_model_id`, and `source_deck_id` to the source snapshot. The stable content identity should be based on source metadata, not on word text.

### Source field fidelity

Store raw field values or a JSON snapshot. Store normalized values separately for search and rendering. This preserves Anki HTML, pitch markup, media references, and future reprocessing ability.

### Examples and readings

Do not keep the design limited to one reading or one example forever. Use child tables even though this APKG currently supplies one primary reading and one example per note.

### Media

Use `media_assets` plus `vocabulary_media`:

```text
media_assets
  id, import_batch_id, original_filename, checksum, mime_type,
  byte_size, storage_bucket, storage_path, created_at

vocabulary_media
  vocabulary_id, media_asset_id, role, source_field, sort_order
```

`role` should distinguish word audio, sentence audio, picture, and future media types. Deduplicate by checksum, not filename alone.

### Runtime separation

Keep these separate:

- `source_notes_raw` / Anki cards / imported revlog: source audit data
- `vocabulary` / readings / examples / media references: shared runtime content
- `user_vocabulary` / notes / FSRS state / review history: private user data

## Import Rules

1. Read `collection.anki21` first and support `collection.anki2` only as a compatibility fallback.
2. Validate the package hash and manifest before writing normalized rows.
3. Parse field values structurally; do not use regex as the primary HTML parser.
4. Convert source HTML to safe renderable content or sanitized plain text before exposing it in the browser.
5. Resolve media references through the manifest and upload with deterministic paths.
6. Make the import idempotent using source note identity and package/version metadata.
7. Preserve the original package outside runtime storage; the APKG remains an import source only.
8. Never import Anki revlog rows as a real user's review history.

## Open Decisions Before Implementation

- Whether duplicate source notes become separate vocabulary rows or are merged into one canonical vocabulary entity with multiple source memberships.
- Which field is authoritative for canonical meaning when the same word/reading occurs in multiple notes.
- Whether source HTML is rendered as sanitized HTML or converted to structured text/ruby data.
- Whether import runs are admin-only server operations and where the original APKG is retained.