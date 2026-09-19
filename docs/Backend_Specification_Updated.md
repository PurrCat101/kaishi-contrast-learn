# Backend & Product Specification — Japanese Vocabulary SRS

## 1. Overview

ระบบนี้เป็น Japanese Vocabulary SRS ที่ใช้ Kaishi 1.5k เป็น initial content source แต่ไม่ได้ใช้ Anki เป็น runtime database

แนวคิดหลัก:

> **Anki-style SRS + Personal Vocabulary + AI Vocabulary Knowledge Graph + Confusion-aware Learning**

ระบบต้องแก้ pain point หลักของผู้เรียนภาษาญี่ปุ่นที่ไม่ได้มีปัญหาแค่ “ลืมคำ” แต่มีปัญหา “จำได้แต่สับสนกับคำที่อ่านเหมือนกัน/เขียนคล้ายกัน/ความหมายใกล้กัน”

ระบบจึงต้องแยกอย่างน้อย:

- Recall — จำ vocabulary ได้หรือไม่
- Discrimination — แยก vocabulary ออกจากคำที่สับสนได้หรือไม่

---

# 2. Product Architecture

```text
                    Kaishi 1.5k .apkg
                    Source / Seed Data
                           │
                           ▼
                  ┌─────────────────┐
                  │  Anki Importer  │
                  └────────┬────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
      Vocabulary Data                Media Assets
             │                           │
             ▼                           ▼
     ┌────────────────┐          ┌────────────────┐
     │   PostgreSQL   │          │ Supabase       │
     │                │          │ Storage        │
     │ vocabulary     │          │ images         │
     │ relations      │          │ audio          │
     │ enrichment     │          │ CDN            │
     │ user data      │          └────────────────┘
     └────────┬───────┘
              │
              ▼
      ┌─────────────────┐
      │  SRS / Learning │
      │      Engine     │
      └────────┬────────┘
               │
               ▼
             Web App
```

---

# 3. Technology Stack

## 3.1 Frontend

Recommended:

- Next.js
- TypeScript
- React
- Tailwind CSS or equivalent styling system

## 3.2 Backend

Supabase:

- PostgreSQL
- Supabase Auth
- Supabase Storage
- Row Level Security (RLS)
- PostgreSQL extensions where needed

## 3.3 SRS

Use an existing FSRS implementation such as:

- `ts-fsrs`

Do not implement the FSRS scheduling algorithm from scratch.

## 3.4 Anki Import

The application should support importing `.apkg` directly.

The importer should:

- Parse Anki notes/cards
- Extract vocabulary fields
- Extract media
- Normalize source data
- Upload media to Supabase Storage
- Insert/update vocabulary records in PostgreSQL

The `.apkg` is an import source, not runtime application storage.

---

# 4. Authentication & User Access

## 4.1 Authentication Provider

Primary authentication:

```text
Google OAuth
    ↓
Supabase Auth
    ↓
User Session
    ↓
PostgreSQL + RLS
```

Supabase Auth is the authentication provider.

No custom authentication system is required for MVP.

Google OAuth is the primary login method.

The architecture should remain provider-agnostic so additional Supabase Auth providers can be added later.

---

## 4.2 Guest Access

Login is NOT required to browse the website.

Guest users can:

- Open the website
- Browse vocabulary
- Search vocabulary
- View reading
- View meaning
- View examples
- View image
- Play audio
- View public vocabulary relationships
- View public AI enrichment

Guest users cannot persist personalized learning data.

```text
Guest
  │
  ├── Browse vocabulary       ✓
  ├── Search                  ✓
  ├── View meaning            ✓
  ├── View example            ✓
  ├── View image/audio        ✓
  ├── View relations          ✓
  │
  ├── Persistent SRS          ✕
  ├── Save progress           ✕
  ├── User notes              ✕
  ├── Review history          ✕
  └── Personal vocabulary     ✕
```

---

## 4.3 Authenticated User

After successful login:

```text
Google
   ↓
Supabase Auth
   ↓
Authenticated Session
   ↓
Supabase User ID
   │
   ├── User Notes
   ├── User Vocabulary
   ├── SRS State
   ├── FSRS State
   ├── Review History
   └── Learning Progress
```

The application uses `auth.users.id` / Supabase `user.id` as the user identity.

Email must NOT be used as the primary user identifier.

---

## 4.4 SRS Requires Authentication

Persistent SRS requires authentication because the system must save user-specific state.

Guest behavior:

```text
Guest
  ↓
[Start Review]
  ↓
Login Required
  ↓
Sign in with Google
  ↓
Start SRS
```

Suggested UI message:

> Sign in to save your learning progress.

Browsing vocabulary must remain available without login.

---

## 4.5 Session Persistence

A valid Supabase session should persist across normal page reloads/browser restarts according to Supabase Auth behavior.

When a valid session exists:

```text
Open Website
     ↓
Check Session
     ↓
Authenticated
     ↓
Load User SRS State
```

When no valid session exists:

```text
Open Website
     ↓
Guest Mode
     ↓
Vocabulary browsing remains available
```

---

## 4.6 Logout

Logout removes the active session but MUST NOT delete user data.

```text
Session
   ↓
Logout
   ↓
Guest Mode
```

The user's:

- Notes
- Vocabulary collection
- FSRS state
- Review history
- Preferences

remain in the database and become available again after login.

---

# 5. Data Ownership

The system must distinguish three ownership layers.

## 5.1 Source Content

```text
source = kaishi
owner = system
```

User cannot directly modify source content.

## 5.2 AI Enrichment

```text
source = AI
owner = system
```

AI-generated content must remain separate from original source content.

## 5.3 User Data

```text
owner = user
user_id = auth.users.id
```

User can create/update:

- Notes
- Personal vocabulary
- Personal learning state
- Review history
- Preferences

---

# 6. Core Database Schema

## 6.1 `decks`

Deck/source metadata.

```text
decks
────────────────────────
id
name
description

source
source_version

created_at
updated_at
```

Examples:

```text
Kaishi 1.5k
JLPT N5
JLPT N4
Custom
```

---

## 6.2 `vocabulary`

Shared vocabulary content.

```text
vocabulary
────────────────────────────
id
deck_id

word
meaning
part_of_speech

example_sentence
example_translation
example_furigana

image_path
audio_path

source
source_id
source_note_id
source_version

created_at
updated_at
```

Source data from Kaishi must remain identifiable.

The source fields should not be overwritten by user notes or AI enrichment.

---

## 6.3 `vocabulary_readings`

Supports multiple readings.

```text
vocabulary_readings
────────────────────
id
vocabulary_id

reading
is_primary

notes

created_at
updated_at
```

Example:

```text
何
├── なに
└── なん
```

---

## 6.4 `vocabulary_relations`

Stores relationships between vocabulary items.

```text
vocabulary_relations
────────────────────────
id

vocabulary_id
related_vocabulary_id

relation_type
confidence

source
source_version

created_at
updated_at
```

Supported initial relation types:

```text
HOMOPHONE
SAME_KANJI
SIMILAR_MEANING
SYNONYM
ANTONYM
RELATED
EASILY_CONFUSED
```

Examples:

```text
橋 ── HOMOPHONE ── 箸
橋 ── HOMOPHONE ── 端

大きい ── ANTONYM ── 小さい
```

Relation semantics must be defined before implementation.

Some relationships are symmetric:

```text
ANTONYM
A ↔ B
```

Some may be directional.

---

# 7. AI Enrichment

## 7.1 `vocabulary_enrichment`

Stores AI-generated additional information.

```text
vocabulary_enrichment
────────────────────────────
id
vocabulary_id

type
content

source
model
confidence

status

created_at
updated_at
```

Initial enrichment types:

```text
USAGE
NUANCE
DISCRIMINATION
COMMON_MISTAKE
MEMORY_HINT
CONTEXT
```

AI enrichment must never overwrite source content.

---

## 7.2 AI Relationship Generation

The AI enrichment pipeline should identify, where applicable:

- Homophones
- Same-kanji / different-reading relationships
- Similar meanings
- Synonyms
- Antonyms
- Related concepts
- Easily confused words
- Usage differences
- Nuance differences
- Common learner mistakes

The system must not assume every vocabulary item has every relationship.

Only meaningful relationships should be created.

---

## 7.3 Relationship Confidence

AI-generated relationships must contain confidence metadata.

Example:

```text
橋
  relation:
    箸
  type:
    HOMOPHONE
  confidence:
    0.98
```

Confidence is metadata for validation/prioritization, not a user-facing quality score.

---

# 8. AI Enrichment Pipeline

AI enrichment should not run directly from the browser.

```text
Vocabulary
    ↓
Enrichment Job
    ↓
AI Processing
    │
    ├── Homophones
    ├── Similar meanings
    ├── Antonyms
    ├── Related words
    ├── Easily confused words
    ├── Usage
    └── Nuance
    ↓
Validation
    ↓
Supabase PostgreSQL
```

Each generated record should include:

```text
model
confidence
source
status
created_at
updated_at
```

Possible status:

```text
PENDING
PROCESSING
GENERATED
VALIDATED
REJECTED
```

AI enrichment must be reproducible and replaceable.

---

# 9. Import Pipeline

Initial import:

```text
.apkg
  │
  ▼
Parse Anki package
  │
  ├── Notes
  ├── Cards
  └── Media
  │
  ▼
Normalize
  │
  ├── Vocabulary → PostgreSQL
  └── Media → Supabase Storage
```

Import must be idempotent.

Re-importing the same source must not create duplicate vocabulary.

Use stable source identifiers such as:

```text
source
source_id
source_note_id
source_version
```

to identify imported content.

---

# 10. Media Strategy

Media from `.apkg` must NOT be bundled into the frontend application.

```text
.apkg
   │
   ├── image → Supabase Storage
   └── audio → Supabase Storage
```

Storage layout:

```text
storage/
├── images/
│   ├── 私.webp
│   ├── 橋.webp
│   └── ...
│
└── audio/
    ├── 私.mp3
    ├── 橋.mp3
    └── ...
```

PostgreSQL stores only references:

```text
image_path
audio_path
```

The browser loads media on demand.

Do not download all 1,500 images/audio files on initial page load.

---

# 11. User Vocabulary Collection

Add a `user_vocabulary` table.

This represents whether a vocabulary item belongs to a user's personal learning collection.

```text
user_vocabulary
────────────────────────
id
user_id
vocabulary_id

is_active
is_suspended

added_at
updated_at
```

Unique constraint:

```text
(user_id, vocabulary_id)
```

This prevents duplicate personal collection entries.

Example:

```text
Kaishi vocabulary
       │
       ├── User A → added
       ├── User B → not added
       └── User C → added
```

Shared vocabulary remains shared.

Personal learning state remains per user.

---

# 12. User-Created Vocabulary

Users may add vocabulary that does not exist in Kaishi.

Example:

```text
検索
けんさく
search
```

User-created vocabulary must be distinguishable from source vocabulary.

Suggested metadata:

```text
source = user
user_id = current_user
```

The user may provide:

- Word
- Reading
- Meaning
- Example
- Personal note

AI enrichment may be applied later.

User-created vocabulary should be visible only to its owner unless the system explicitly promotes it to shared content.

---

# 13. Search

Global vocabulary search should support:

```text
Kanji
Reading
Meaning
Example
```

Example:

```text
Search: hashi

橋  はし  bridge
箸  はし  chopsticks
端  はし  edge / end
```

When multiple confusing vocabulary items are found, the UI may offer:

```text
[Compare]
```

which opens a contrast view.

Search should include both:

- Shared vocabulary
- User's personal vocabulary

with appropriate ownership rules.

---

# 14. User Notes

## 14.1 `user_notes`

```text
user_notes
────────────────
id
user_id
vocabulary_id

content

created_at
updated_at
```

Notes are private to the user.

User notes are never written back into `.apkg`.

Free-text notes are the default MVP approach.

Example:

```text
MY NOTES

จำว่า "อยู่บ้าน"

[ Add note... ]
```

The user may create, edit, and delete their own notes.

---

# 15. User Settings

## 15.1 `user_settings`

User preferences must be stored per user.

```text
user_settings
────────────────────────
user_id

auto_play_audio
show_reading
show_image
show_example
show_pitch_accent

auto_play_after_reveal

daily_new_limit
daily_review_limit
session_size

recall_cards_enabled
contrast_cards_enabled
context_cards_enabled
confusion_reinforcement_enabled

theme
font_size
japanese_font_size

keyboard_shortcuts_enabled

created_at
updated_at
```

Defaults:

```text
auto_play_audio = true
auto_play_after_reveal = true
show_reading = true
show_image = true
show_example = true
show_pitch_accent = true

recall_cards_enabled = true
contrast_cards_enabled = true
context_cards_enabled = true
confusion_reinforcement_enabled = true
```

Exact defaults may be adjusted during UX testing.

---

# 16. Review Behavior

## 16.1 Audio

Default behavior:

- Audio autoplay is ON.
- Audio should normally autoplay after answer reveal.
- The user can disable autoplay in Settings.
- A Listen button remains available for manual replay.

Important:

If the card is testing reading/pronunciation, audio must not reveal the answer before the user responds.

Example:

```text
Question

住む

[ Show Answer ]

Say the reading first
```

After reveal:

```text
住む
すむ
to live, to reside

[ Listen ]
```

---

## 16.2 Reading Visibility

The user can configure whether reading is shown by default.

For cards testing reading, reading must remain hidden until answer reveal.

A per-card action may allow:

```text
[ Show reading ]
```

without changing the global setting.

---

# 17. Learning Model

The system must separate:

```text
Recall
   │
   └── จำ vocabulary ได้หรือไม่

Discrimination
   │
   └── แยก vocabulary ที่คล้ายกันได้หรือไม่
```

Example:

```text
橋

Recall:
GOOD

Discrimination:
AGAIN
```

Meaning:

```text
User knows:
橋 = bridge

But confuses it with:
箸
端
```

---

# 18. User Vocabulary State

## 18.1 `user_vocabulary_state`

```text
user_vocabulary_state
────────────────────────
id

user_id
vocabulary_id

status

recall_state
discrimination_state

created_at
updated_at
```

Status:

```text
NEW
LEARNING
REVIEW
SUSPENDED
```

---

# 19. FSRS State

FSRS data must be stored per user and per learning dimension.

Recommended fields:

```text
due
stability
difficulty
elapsed_days
scheduled_days
reps
lapses
state
last_review
```

The implementation may use separate state objects for:

```text
recall
discrimination
```

The scheduler must use `ts-fsrs` or an equivalent maintained FSRS implementation.

Do not reimplement the FSRS algorithm.

---

# 20. Review History

## 20.1 `review_history`

```text
review_history
────────────────────────
id
user_id
vocabulary_id

card_type

rating
reviewed_at

previous_state
new_state

response_time
```

Card types:

```text
RECALL
READING
MEANING
DISCRIMINATION
CONTEXT
```

Review history allows the system to distinguish:

```text
Forgot the word
```

from:

```text
Knew the word but confused it with another word
```

---

# 21. Card Engine

Cards should be dynamically generated from:

```text
Vocabulary
+
Relationships
+
AI Enrichment
+
User Learning State
+
User Settings
```

Do not store every possible card as static records.

---

# 22. Card Types

## 22.1 Recall Card

Tests direct memory.

```text
橋

[ Show Answer ]
```

---

## 22.2 Reading Card

Tests Japanese reading.

```text
住む

[ Show Answer ]
```

The answer reveals:

```text
すむ
```

---

## 22.3 Meaning Card

Tests meaning from Japanese vocabulary.

---

## 22.4 Discrimination / Contrast Card

The key feature of this application.

Example:

```text
はし

Which word means "bridge"?

○ 橋
○ 箸
○ 端
```

Purpose:

> Test whether the learner can distinguish confusing vocabulary, not merely recall one translation.

---

## 22.5 Context Card

Tests the appropriate vocabulary in context.

Example:

```text
家族はタイに＿＿でいます。

○ 住ん
○ 泊まっ
...
```

Context cards should use source examples where appropriate and AI-generated examples only when explicitly marked as generated content.

---

# 23. Contrast / Confusion System

When a user repeatedly confuses words, the system should surface a contrast card.

Example:

```text
はし

橋   → bridge
箸   → chopsticks
端   → edge / end
```

After a contrast miss:

```text
CONTRAST MISSED

You knew the word,
but confused it with:

箸
```

The answer may include a concise discrimination explanation.

Example:

```text
Why they differ

橋
→ something you cross

箸
→ something you eat with
```

The system should avoid presenting every related word back-to-back unnecessarily.

Contrast scheduling should be controlled by learning state and review history.

---

# 24. Full Vocabulary Detail

The Full Detail page should include:

```text
Vocabulary
├── Word
├── Reading
├── Meaning
├── Audio
├── Image
├── Pitch accent
├── Example
│
├── My Notes
│
├── Memory / Learning State
│
├── Homophones
├── Commonly Confused
├── Similar Meanings
├── Antonyms
└── Related Words
```

Example layout:

```text
住む
すむ
to live, to reside

[ Listen ]

[PITCH スム] [FREQ #919] [HOMOPHONE]

Example
家族はタイに住んでいます。
My family lives in Thailand.

[Image]

Memory
Review: ...
Next review: ...

My Notes
[ Add note... ]

Homophones
落ちる ...

Similar meanings
暮らす ...

Commonly confused
...
```

---

# 25. Memory UI

Raw FSRS internals should not dominate the UI.

Avoid making this the primary presentation:

```text
Stability 0.63d
Difficulty 5.9
Reviews 2
Lapses 2
```

Prefer learner-oriented information:

```text
MEMORY

Recall
████████░░ 67%

Next review
Today

Confusion
1 word
```

Advanced FSRS details may be available through an expandable Details section.

---

# 26. Today Dashboard

The Today page should show:

```text
Today's Review

24   Due
8    New
6    Confusing

[ Start Review ]
```

Also show:

```text
Needs attention

橋
Confused with 箸

何
Confused between なに / なん

住む
Confused with 暮らす
```

The purpose is to surface learning problems, not only card counts.

---

# 27. Progress Dashboard

Progress should distinguish recall from discrimination.

```text
Learning Health

Recall
████████████░░ 82%

Discrimination
███████░░░░░░░ 61%

Words due       24
New              8
Confusing        6
```

The user should be able to open the confusing-word list.

Example:

```text
Your confusing words

橋 / 箸 / 端
何 / なに / なん
人 / ひと / じん / にん
```

Progress should also include:

- Review history
- Cards reviewed
- New vocabulary
- Due vocabulary
- Confusion frequency
- Recall performance
- Discrimination performance

Do not present an overall score/rating that hides these separate dimensions.

---

# 28. Words Page

The Words page should support:

```text
Search vocabulary...

Tabs / filters:

All
Kaishi
My Words
Confusing
Recently Learned
```

Each vocabulary item should expose its learning state where appropriate.

---

# 29. Settings UI

Settings should be grouped.

```text
SETTINGS

Review
├── New cards per day
├── Maximum reviews per day
├── Review session size
├── Show answer automatically
└── Keyboard shortcuts

Pronunciation
├── Auto-play audio
├── Auto-play after reveal
└── Show Listen button

Card Display
├── Show reading
├── Show image
├── Show example
├── Show pitch accent
└── Japanese font size

Learning
├── Recall cards
├── Contrast cards
├── Context cards
└── Confusion reinforcement

Appearance
├── Light / Dark / System
└── Compact / Comfortable

Account
├── Google account
├── Export my data
└── Sign out
```

Do not expose advanced FSRS parameters in MVP.

---

# 30. Personal Vocabulary Flow

## 30.1 Existing Shared Word

```text
Search
  ↓
橋
  ↓
[ Add to My Words ]
  ↓
user_vocabulary
```

Do not duplicate the shared vocabulary record.

Only create the user's collection relationship.

---

## 30.2 New Word

```text
Search
  ↓
No results
  ↓
[ + Create New Word ]
```

Input:

```text
Word
Reading
Meaning

Example (optional)
Note (optional)
```

Then:

```text
Create
  ↓
Personal Vocabulary
  ↓
Optional AI Enrichment
```

---

# 31. Personalization

The following data must be unique to each user:

```text
User
├── vocabulary collection
├── notes
├── FSRS state
├── review history
├── confusion history
├── settings
└── learning progress
```

Two users studying the same word must have independent state.

Example:

```text
User A
橋 → Good → due tomorrow

User B
橋 → Again → due today
```

User A must never see User B's private learning data.

---

# 32. Security

## 32.1 Row Level Security

Shared content:

```text
vocabulary
vocabulary_readings
vocabulary_relations
vocabulary_enrichment
```

can be readable according to public-content policies.

Private content:

```text
user_vocabulary
user_notes
user_vocabulary_state
review_history
user_settings
```

must be protected by RLS.

Primary ownership condition:

```text
auth.uid() = user_id
```

Users must not be able to:

- Read another user's learning data
- Modify another user's learning data
- Delete another user's notes
- Change ownership to another user

---

# 33. Storage Security

Recommended buckets:

```text
kaishi-images
kaishi-audio
```

Media access policies must match the intended public/private nature of the content.

Source media should not be stored as database binary data.

---

# 34. Server-side Operations

Operations requiring elevated privileges must run server-side.

Examples:

```text
.apkg import
AI enrichment
bulk vocabulary updates
media migration
admin operations
```

Never expose Supabase service-role/secret keys in the browser.

---

# 35. Data Export

Authenticated users should be able to export their personal learning data.

MVP export formats:

```text
JSON
CSV
```

Export should include, where applicable:

```text
Personal vocabulary collection
User notes
Review history
FSRS state
User settings
```

Export must not expose another user's data.

---

# 36. Future Semantic Features

The architecture may later support PostgreSQL `pgvector` for:

```text
semantic similarity
related vocabulary discovery
AI search
```

This is not required for MVP.

Explicit vocabulary relationships should be implemented first.

---

# 37. Multiple Vocabulary Sources

The schema must not assume Kaishi 1.5k is the only vocabulary source.

Potential future sources:

```text
Kaishi 1.5k
JLPT N5
JLPT N4
Custom Deck
User-created vocabulary
```

Use:

```text
deck
source
source_id
source_version
```

to keep source identity explicit.

---

# 38. UI Navigation

Primary navigation:

```text
Today
Review
Words
Progress
Settings
```

## Today

- Due
- New
- Confusing
- Start Review
- Needs Attention

## Review

- Recall
- Reading
- Meaning
- Contrast
- Context
- Again / Hard / Good / Easy

## Words

- Search
- All
- Kaishi
- My Words
- Confusing
- Recently Learned

## Progress

- Recall
- Discrimination
- Reviews
- Confusions
- Difficult vocabulary
- Review history

## Settings

- Review
- Pronunciation
- Card Display
- Learning
- Appearance
- Account

---

# 39. MVP Scope

## Phase 1 — Foundation

```text
Supabase
├── Auth
├── PostgreSQL
└── Storage

Import
├── .apkg
├── vocabulary
├── readings
├── image
└── audio

Learning
├── basic FSRS
├── user progress
├── user_vocabulary
└── review history
```

Authentication:

```text
Google OAuth
Guest browsing
Persistent authenticated session
```

---

## Phase 2 — Vocabulary Relationships

```text
Homophone
Same Kanji
Similar Meaning
Synonym
Antonym
Related
Easily Confused
```

---

## Phase 3 — AI Enrichment

```text
Usage
Nuance
Discrimination
Common Mistakes
Memory Hints
Context
```

---

## Phase 4 — Advanced Learning

```text
Recall FSRS
Discrimination FSRS
Context Cards
Adaptive Card Selection
Confusion Reinforcement
```

---

## Phase 5 — Optional Semantic Features

```text
pgvector
Semantic Similarity
Semantic Search
AI-assisted vocabulary discovery
```

---

# 40. Design Principles

1. **Kaishi `.apkg` is a source, not the application database.**
2. **Source data must remain distinguishable from AI-generated data.**
3. **User data must never be written back into the source `.apkg`.**
4. **Binary media belongs in Supabase Storage, not PostgreSQL.**
5. **Frontend must not bundle all Kaishi media.**
6. **Media should load on demand.**
7. **User-specific data must be protected by RLS.**
8. **FSRS should use an existing maintained implementation.**
9. **Vocabulary relationships are first-class data.**
10. **Recall and discrimination are separate learning dimensions.**
11. **AI enrichment must be reproducible and replaceable.**
12. **AI-generated relationships should carry confidence and provenance metadata.**
13. **Users can browse vocabulary without authentication.**
14. **Persistent SRS requires authentication.**
15. **Google OAuth is the primary MVP authentication method.**
16. **User notes and personal vocabulary belong only to the owning user.**
17. **Shared vocabulary must not be duplicated merely because multiple users study it.**
18. **Card behavior must respect the learning objective; audio/reading must not accidentally reveal answers.**
19. **Global settings should have sensible defaults and per-card overrides where appropriate.**
20. **The UI should surface learning problems rather than expose raw algorithm internals.**
21. **The schema must support multiple decks/sources in the future.**
22. **MVP should remain simple; semantic AI features can be added later.**
23. **User learning data must be exportable.**
24. **The system should behave like Anki in persistence and scheduling while changing the learning experience around confusion/discrimination.**
