# TextFold for Claude Code

## Local fork changes (0.2.3-px.9)

This is a local fork of textfold 0.2.3 (upstream commit 3046733). It changes the row above the prompt and how Korean is counted; the folding and the system-prompt section are otherwise upstream's.

- **Korean is counted, so a Korean reply folds.** A run of Hangul counts as one word, as a run of Latin letters does, and a particle written onto an English word (`Cache-Control도`) stays part of it; a Korean word weighs as one word, not as Chinese characters do. Upstream counted only the Latin words of a Korean reply, and its reading-effort count took Hangul for Chinese characters (its class began at U+8C48, a lookalike of U+F900), so a Korean reply never reached 80 words and never folded. Chinese and Japanese count as before.

- **In VS Code, cache-tax-px's keepwarm row sits at the right end of the fold row's line** where the box is 35 columns wide or more (`bodyColumns`, the webview's content width over the width of `─`, 1em: about 473px at the 13px chat font). The fold row takes about 23.8em and the keepwarm row needs its icon and `cache-tax warm`, about 9.4em, so both fit on one line from there.
  - The handoff: cache-tax-px keys the block that holds its row `cache-tax:keepwarm`. It comes back in this row's `next(e)` tree, as the tree's root when nothing else is beneath, or as the last child of `[rows, divider, block]`. Only those two places are read. The block is lifted out with the divider over it; cache-tax's root stays with the rows it holds (reflect-mod's, the built-in notice), so they keep their place and their plugin's credit.
  - Beside the levels, the row takes what they leave on their line, right-aligned (`flexGrow 1`, `width 0`, `justifyContent flex-end`), and ends `0.25ch` inside the right edge, where the band's crab ends. Its width starts at 0, so it truncates with `…` as the box narrows and never pushes or wraps the levels; the levels stay packed at the left.
  - The fold row's root then owns the box's bottom edge, or the rows beneath do (C2's rules, as without the keepwarm row).
  - **Fallback:** narrower than 35 columns, with no keyed block, or with the tree in another shape, everything is drawn as it was handed: the keepwarm row stays at the box's foot under its own divider.
- **In the terminal, the keepwarm row sits at the right end of the fold row's line** where `bodyColumns` (the slot's cells) is 78 or more: the fold row's 55 cells (`fold`, five `n: Level` and their gaps), a 2-cell gap, `[>] cache-tax · warm` (20) and 1 cell at the right, where the usage row above ends.
  - cache-tax-px keys its terminal row `cache-tax:keepwarm`; it comes back as the tree's root, or as the last of `[rows, row]`. The row is lifted out of that tree; the rows beneath stay as they are, with no gap or divider.
  - Beside the levels it is right-aligned (`flexGrow 1`, `width 0`, `justifyContent flex-end`, `paddingRight 1`) and truncates with `…` before it could push the levels. Under 78 columns (an 80-column terminal reports 75), or without the key, the tree is drawn as it was handed. The desktop and mobile are unchanged.
- **The row shares the band.** The fold row is drawn on top, and what the mods beneath draw stays under it. An earlier local patch dropped one or the other whenever something was beneath. A survey still has the band to itself, and Claude Code's own placeholder is never nested.
- **Space in VS Code's box** (layout contract C2), measured by ink at the 13px chat font, in lines of 1.4 × 13px:
  - **Above the fold row**, its own space (`paddingTop 0.26`): 7px under the host's title when it is the box's first row, and 3px under the divider when a block is above it.
  - **A divider joins the fold row to a block beneath**, in the middle of the 7px between them: a 1px line in the theme's prompt border color (`promptBorder`) across the content's width. The root adds `marginTop 0.12` from the row to the divider's join, so the line sits 3px under the row. The divider's Box takes no height; its line hangs `0.044` lines under the join, into the top space the block beneath brings, and sits 3px over that block's ink. A block beneath that brings no space of its own above it gets `marginBottom 0.06` under the join, a text row's.
  - **No divider** sits under the host's title, under the last row, or over Claude Code's own placeholder.
  - **The lowest block owns the box's bottom edge**: 5px under the last row (`paddingBottom 0.06`), unless the rows beneath end with space of their own, and then the fold row's root adds none.
  - **A wrapped fold row** in a narrow box has its lines about 2.7px apart (`rowGap 0.15`), a clear step under the 7px between mods, so the wrapped line reads as part of the row.
  - **The terminal, the desktop and mobile** stack the rows with no gap and no divider.
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
