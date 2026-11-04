# TextFold for Claude Code

## Local fork changes (0.2.3-px.5)

This is a local fork of textfold 0.2.3 (upstream commit 3046733). It changes only the row above the prompt; the folding and the system-prompt section are upstream's.

- **The row shares the band.** The fold row is drawn on top, and what the mods beneath draw stays under it. An earlier local patch dropped one or the other whenever something was beneath. A survey still has the band to itself, and Claude Code's own placeholder is never nested.
- **Space in VS Code's box** (0.2.3-px.3, layout contract C2): 5px of visible space above the fold row, between it and the rows beneath, and under the last row to the box's edge (`paddingTop 0.21`, `rowGap 0.06`, `paddingBottom 0.06`, in lines of 1.4 × 13px). Rows beneath that bring their own space above them get no gap added, and rows beneath that end with their own space under them own the box's bottom edge: the fold row's root then adds none (0.2.3-px.5). When the fold row wraps in a narrow box, its lines sit about 2.7px apart (`rowGap 0.15`, 0.2.3-px.4), a clear step under the 5px between mods, so the wrapped line reads as part of the row. The terminal, the desktop and mobile stack the rows with no gap.
- **VS Code gets its own row.** Every level but the current one is an outlined button. The current level is an inverted box with the same border, not a button. `fold` is in the theme's secondary text color, not dim, and stays with the first level when the row wraps. The editor has no digit keys.
- **In VS Code the current level is a button's height** (0.2.3-px.2). The inverted box and the `fold` label are held to a button's line (`height 0.88`, in the band's lines of 1.4), so the box's top and bottom meet the buttons' and the label's text lines up with theirs at the default 13px chat font; at larger chat fonts the box can be up to about 1.7px taller.
- **The terminal, the desktop and mobile** keep the row as it was, digit keys included.
- Tests for all of this are in `tests/band.test.ts`.

Your agent writes more than you have time to read. TextFold folds every Claude Code reply to the level you need, from every word to the answer in one sentence, with one key. A [mod](https://code.claude.com/docs/en/plugins/mods/overview) for Claude Code, from [TextFold](../../README.md).

<img src="../../docs/assets/textfold.gif" width="880" alt="A reply in Claude Code folding from the full text to two sentences a paragraph, then one, and back, one key at a time">

| Key | Level | What you get |
|:-:|---|---|
| **1** | **Full** | every word Claude wrote |
| **2** | **Brief** | each point, with the reason behind it |
| **3** | **Points** | just the points, at a glance |
| **4** | **Outline** | the map of a long reply: its sections, and what each one says (a reply without headings shows its points) |
| **5** | **Gist** | the answer, in one sentence |

Type the digit while the prompt is empty, or pick a level in the row above the prompt. A folded reply tells you how much of it you are seeing, and `1` brings back every word. Short replies stay whole: one under about 80 words, or one a fold would barely shorten, always shows as written.

**Start folded.** A session starts at Full. To start at another level, run `/config` and set **Starting level**; in the session, the row above the prompt and the keys 1 to 5 still change it.

## Why you can trust a fold

Nothing is paraphrased. TextFold adds a short section to the system prompt that asks Claude to lead with the point: the answer first in every reply, and the sentence that states its point first in every paragraph and list item. A fold keeps what Claude put first. There is no second model and no summary, so a fold costs nothing, takes no time, and never puts words in Claude's mouth.

## Install

It needs Claude Code 2.1.287 or later, in the terminal or in the Code tab of the Desktop app.

```bash
claude plugin marketplace add chenxiachan/textfold
claude plugin install textfold@textfold
```

To try it from a clone without installing it, start Claude Code with `claude --plugin-dir textfold/plugins/textfold`.

## Good to know

- The section changes the order of what Claude writes, not what it says or how much. Check on your own work that Claude does it as well as before.
- Turning the mod on changes the system prompt, so the prompt cache starts over once in that session.
- The VS Code extension and `claude -p` draw nothing of a mod; there the section still applies and the replies are not folded.

The tests run with `claude plugin test plugins/textfold`.
