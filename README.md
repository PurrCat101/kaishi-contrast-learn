# Kanji Clarity

Design a modern Japanese vocabulary SRS web app.

The app is designed specifically for learners who struggle with

confusing Japanese vocabulary, especially homophones, similar kanji,

similar meanings, and words that are easy to mix up.

Create these screens:

1. Daily Review

- Show today's review count

- Progress indicator

- Current learning streak

- Start Review button

2. Vocabulary Card

- Large Japanese word

- Reading

- Meaning

- Kaishi illustration

- Audio button

- Reveal answer interaction

- Again / Hard / Good / Easy buttons

3. Contrast Card

This is the key feature.

When the learner is studying a confusing word such as:

橋（はし）= bridge

show related confusing words such as:

箸（はし）= chopsticks

端（はし）= edge/end

The purpose is to test discrimination, not just recall.

4. Vocabulary Detail

- Word

- Reading

- Meaning

- Example sentence

- Related words

- Homophones

- Similar meanings

- Antonyms

- Commonly confused words

- Notes

5. Progress Dashboard

- Vocabulary learned

- Words currently learning

- Difficult/confusing words

- Review history

- FSRS-style next review information

Visual style:

Clean modern Japanese learning app.

Minimal, calm, highly readable.

Prioritize Japanese typography and large vocabulary text.

Desktop-first responsive web application.

Use cards and subtle visual hierarchy.

Avoid excessive gamification.

With system design
# PurrCat101 Design System




## Direction




PurrCat101 is a friendly technical blog with a soft-brutalist visual language. The interface combines editorial serif headings, highly readable body text, pastel color blocks, strong outlines, and crisp hard-offset shadows. The design should feel playful and tactile without reducing reading comfort.




## Color Tokens




The values below are the current source-of-truth tokens from `src/styles/global.css`.




### Light theme




| Token | Value | Use |

| --- | --- | --- |

| `--color-background` | `#FBF8EF` | Page canvas |

| `--color-surface` | `#FFFFFF` | Cards and reading surfaces |

| `--color-primary` | `#FF8F6B` | Links, active states, primary actions |

| `--color-primary-hover` | `#F0714B` | Hover state |

| `--color-secondary` | `#FBE285` | Labels, highlights, secondary blocks |

| `--color-accent` | `#E2B5ED` | Supporting accent |

| `--color-blue` | `#9EE0F6` | Information blocks |

| `--color-mint` | `#9DE5C1` | Success and technical accents |

| `--color-text-main` | `#121212` | Headings and primary text |

| `--color-text-body` | `#24211F` | Reading text |

| `--color-text-muted` | `#595959` | Metadata and helper text |

| `--color-border` | `#121212` | Borders and hard shadows |




### Dark theme




Dark mode uses a clean ink-blue foundation instead of warm charcoal and keeps coral as the brand signal.




| Token | Value | Use |

| --- | --- | --- |

| `--color-background` | `#101820` | Page canvas |

| `--color-surface` | `#182632` | Cards and panels |

| `--color-primary` | `#FF8A65` | Links and active states |

| `--color-primary-hover` | `#FFB199` | Hover state |

| `--color-secondary` | `#2D7C88` | Secondary blocks |

| `--color-accent` | `#D4A7F5` | Supporting accent |

| `--color-text-main` | `#F4F7F5` | Headings and primary text |

| `--color-text-body` | `#D7E0DF` | Reading text |

| `--color-text-muted` | `#AAB9BA` | Metadata and helper text |

| `--color-border` | `#51666A` | Borders and controls |




## Typography




- Headings: `Bree Serif`, `Noto Serif Thai`, Georgia, serif.

- Body: `Atkinson Hyperlegible`, `Noto Sans Thai`, system UI sans-serif.

- Code and metadata: `Red Hat Mono`, ui-monospace, monospace.

- Body text uses a comfortable 1.6 line height. Prose content uses 1.75 to 1.85 line height for long-form reading.

- Display sizes range from 28px to 64px with restrained tracking. Headings should remain readable on narrow screens.




## Shape, Depth, and Spacing




- Small, medium, large, and extra-large radii are 6px, 8px, 12px, and 16px. Pills use 9999px.

- Interactive controls and cards use strong borders, usually 2px solid `var(--color-border)`.

- Shadows are hard offsets with no blur: 3px, 5px, or 8px depending on emphasis.

- The spacing scale is 8px, 12px, 16px, 24px, and 32px. Sections use 96px where spacious separation is needed.

- Cards use tonal layering and hard shadows rather than soft blurred elevation.




## Components




### Cards and buttons




Cards use the surface token, a 2px border, 12px radius, and a hard offset shadow. Primary buttons use the primary token, dark text in light mode, and the dark-mode on-primary token when needed. Hover states shift the element slightly upward and left while increasing the hard shadow.




### Tags and filters




Tags are pill-shaped, keyboard-focusable links with a minimum height of 40px. The blog filter remains visible on mobile and allows horizontal scrolling when the tag list is wider than the viewport.




### Code




- Full code blocks use `--color-code-surface: #1E1E1E`, `--color-code-text: #FBF8EF`, and `--color-code-border: #121212`.

- Inline code uses an 18% tint of the current primary color as its background.

- Inline code text uses `--color-code-inline: #9A3412` in light mode and `#FFB199` in dark mode. This keeps the coral-orange identity while meeting readability needs.

- Code blocks scroll horizontally instead of overflowing the article layout.




### Article content




Article prose is constrained for comfortable reading, with clear heading hierarchy, generous paragraph spacing, bordered media, readable tables, and responsive horizontal scrolling for wide content. Images use a border, moderate radius, and hard shadow consistent with the card system.




## Responsive and Accessibility Rules




- Every primary workflow must remain usable at mobile widths.

- Text and controls must maintain readable contrast in both themes.

- Focus states must remain visible against the current surface.

- Motion should be short and functional, with reduced-motion support.

- Long tags, URLs, and code identifiers may wrap or scroll instead of expanding the viewport.

source main from .apkg file kaishi 1.5k

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ee59f591-9b44-46da-871c-27f622a557fd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
