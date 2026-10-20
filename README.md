# Scambio 2.2.3

A local-only Chrome extension for Italian vocabulary reinforcement while browsing.

## Files

- `vocabulary.csv` is the master vocabulary list. Every row in the latest supplied file, including duplicates and unusual mappings, is preserved exactly. Popup additions are stored locally and included in CSV export. The exported CSV includes the bundled rows plus popup additions. The master CSV is the latest user-supplied vocabulary file (144 rows in version 2.2.3). Its row order, duplicates, capitalization, whitespace, and mappings are preserved as supplied.
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

## Install or update

1. Unzip the archive.
2. Open `chrome://extensions` and enable Developer mode.
3. Click **Load unpacked** and select the `scambio` folder. For an existing unpacked installation, select **Reload** on its extension card.
4. Reload the extension itself after editing bundled CSV files. Open webpages do not need to be manually refreshed for popup vocabulary/settings changes.

## Vocabulary

`vocabulary.csv` uses `Italian,English` columns. The extension preserves all rows in the popup and export. When duplicate English meanings exist, the first row wins at runtime. Download CSV includes bundled rows plus popup additions.

## Known limitation

This version uses explicit rules rather than an Italian NLP package. I assessed `it-compromise`; it is a small, basic rule-based POS tagger, not a reliable agreement or syntax engine. It is not bundled until its incremental value can be demonstrated against a test corpus. Grammar metadata and the replacement rules are kept local and auditable.
