# Italian Immersion 2.1

A local-only Chrome extension for contextual reinforcement of Italian vocabulary you have already studied.

## Vocabulary model

`vocabulary.csv` is the canonical master vocabulary file. It intentionally contains every entry supplied by the user, including phrases and repeated meanings. The extension does not curate, correct, or silently remove entries.

You can:

- edit `vocabulary.csv` manually;
- add entries from the popup, which are saved immediately;
- click **Download CSV** to export the complete current list, including popup additions;
- transfer the CSV between computers.

When you manually change the bundled CSV, click **Reload** for the extension on `chrome://extensions`. You do not need to refresh individual webpages.

## Behaviour

- Enabled by default.
- New pages are processed automatically.
- Existing open pages receive vocabulary/settings changes without a page refresh.
- Dynamically inserted page content is observed and processed.
- Highlighting/learning hints are optional and off by default.
- The first CSV entry wins when multiple rows have exactly the same English meaning for runtime replacement. All rows remain visible/exportable.
- Inputs, textareas, contenteditable areas, scripts, styles, code and preformatted blocks are skipped.
- No LLM, backend, account, external API or telemetry.

## Install

1. Unzip this folder.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `italian-immersion-best` folder.
6. The extension starts enabled.

## Updating the master CSV

Edit `vocabulary.csv`, save it, then click **Reload** on the extension in `chrome://extensions`. The extension will load the updated file on new pages and apply it to existing pages without requiring those pages to be refreshed.
