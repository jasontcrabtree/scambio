# Scambio 2.3.0

A local-only Chrome extension for Italian vocabulary reinforcement while browsing.

## Files

- `vocabulary.csv` is the master vocabulary list. The supplied file is not rewritten. CSV export preserves row order, duplicates and field values (including whitespace), with standard CSV quoting. Popup additions are stored locally and included in export.
- `grammar.csv` is separate grammar metadata for a limited, explicit set of Italian nouns and adjectives. Edit it independently; it does not rewrite or curate the master vocabulary.
- `grammar-engine.js` performs conservative, local phrase replacement and basic agreement.
- No server, LLM, external API, telemetry, or remote dependency is used.

## Grammar-aware behaviour

- Recognises supported patterns such as `the city`, `a city`, `the difficult city`, and applies a known noun's article and a known adjective's agreement together.
- Handles common definite articles (`il`, `lo`, `la`, `l'`, `i`, `gli`, `le`) and indefinite articles (`un`, `uno`, `una`, `un'`) for dictionary entries.
- Does not translate isolated English articles, prepositions, or conjunctions such as `the`, `a`, `in`, `to`, `for`, `and`, or `with`; these are too context-dependent for reliable word-for-word substitution.
- Adjectives that require agreement are only replaced in a supported noun phrase. Unknown grammar is left alone rather than guessed.
- Skips code, preformatted text, form controls, buttons, and editable areas to protect technical work content.
- Grammar coverage is deliberately limited. This is not a sentence translator; supported phrases will be translated and other text may remain partly English.
- Supports explicit adjective + noun phrases without an article. Grammar rows are active only when their English/Italian mapping matches the first winning vocabulary row. Generated articles and inflected words must occur as words in the Italian vocabulary fields; unavailable forms leave the matched phrase unchanged. Case may be adapted to the source text.

## Practice and site history

Requires Chrome 116 or later. Reload the extension, refresh existing browsing tabs once to load the new content script, then choose **Open practice panel** in the popup.

- Recall English → Italian, reveal the answer, then choose **Again** or **Knew it**. Cards use only vocabulary rows and popup additions. Exact duplicate pairs share progress; distinct mappings remain separate cards. IDs use the pair's field values, so reordering the CSV preserves progress. Editing either field starts a new card.
- Due cards appear before new cards. Again schedules 10 minutes later and resets the interval; successive successful reviews use 1, 3, 7, 14, 30 and 60 days, capped at 60. This is a simple fixed schedule, not an adaptive memory model. All new cards are available; there is no daily limit yet.
- Optional site history records vocabulary actually replaced in the top-level page, deduplicated per document. Only hostnames, vocabulary IDs and last-seen times are stored locally, for the 50 most recent sites. No page paths, titles or text are stored. Incognito and embedded-frame encounters are ignored. An encounter means a replacement occurred, not that the user read it.
- **This page** is the default: new/due words replaced in the active tab, never the full vocabulary as a fallback. The panel follows tab changes and polls every three seconds for dynamic content. Removed or externally changed replacement nodes are excluded. Paused/restricted/unrefreshed pages show an empty state.
- **Due for review** shows only previously encountered words with a saved review that is due. **All vocabulary** is the explicit manual practice mode. Reviewing a word only in All vocabulary does not make it eligible for the encountered-word queue until it is encountered while browsing.
- Encountered word IDs and last-seen times are saved locally even with site history disabled; page addresses are not persisted. Existing site history is migrated into this eligibility set. Site history remains opt-in and supplies site labels on cards. Clearing site history keeps encountered-word eligibility and review progress; disabling site recording keeps existing history.
- No sync or server is involved. Removing the extension clears local review progress. CSV export exports vocabulary, not review history.

## Learning the implementation

`learning.js` contains pure CSV and scheduling functions. `service-worker.js` owns review/history writes and serializes updates from multiple extension pages. `sidepanel.js` renders cards and sends review decisions to the worker. `grammar-engine.js` reports only accepted replacements to `content.js`, which batches encounter IDs. Settings changes restore retained original text before applying the updated rules.

Run `node --test tests/*.test.cjs` (Node 20+) for CSV, scheduling, vocabulary guards and worker messaging/storage tests.

Manual Chrome check: open the panel on a page with supported words and confirm only those appear. Switch to a different tab or a restricted page and verify the old cards disappear. Reveal/rate a card, close/reopen the panel, and verify progress persists. Due for review should contain the encountered card once its interval expires, but exclude cards only practised manually. Verify private windows do not add encounter or site history. Disable webpage replacements to restore original text. Exercise both light and dark mode and a narrow panel.

## Install or update

1. Unzip the archive.
2. Open `chrome://extensions` and enable Developer mode.
3. Click **Load unpacked** and select the `scambio` folder. For an existing unpacked installation, select **Reload** on its extension card.
4. Reload the extension itself after editing bundled CSV files. Open webpages do not need to be manually refreshed for popup vocabulary/settings changes.

## Vocabulary

`vocabulary.csv` uses `Italian,English` columns. The extension preserves all rows in the popup and export. When duplicate English meanings exist, the first row wins at runtime. Download CSV includes bundled rows plus popup additions.

## Known limitation

This version uses explicit rules rather than an Italian NLP package. I assessed `it-compromise`; it is a small, basic rule-based POS tagger, not a reliable agreement or syntax engine. It is not bundled until its incremental value can be demonstrated against a test corpus. Grammar metadata and the replacement rules are kept local and auditable.
