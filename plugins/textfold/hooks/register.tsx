import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Level } from '../types'
import { fold, LEVELS, worthFolding } from './fold'

// The level a session starts at: the setting's (/config, "Starting level"), Full when it has none
const startOf = (options: Readonly<Record<string, unknown>>) => {
  const i = LEVELS.indexOf(String(options.level) as (typeof LEVELS)[number])
  return (i >= 0 ? i + 1 : 1) as Level
}

// What Claude is asked, so that a fold of its reply still reads: the point first, at every scale. It changes
// the order of what Claude says, not what it says or how much.
const STYLE = `# Replies that fold
The person reading this session can fold your replies with one key: to each paragraph's first sentence or two, to the headings, or to the reply's first sentence. Write so that every fold still reads:
- Open the reply with one sentence that answers, or that says what you did.
- Open every paragraph and every list item with a sentence that states its point and reads on its own; reasons, details and caveats come after it.
- Give a reply longer than four paragraphs a few short headings.
This changes the order of what you write, not its content or its length.`

export const register: Register = (on, options) => {
  // The level every reply is read at: 1 Full (as written) to 5 Gist, from the setting until the reader picks another.
  // A session keeps the one it has when the setting changes (the module reloads; the value is the host's).
  const level = atom({ plugin: 'textfold', key: 'level' } as const, startOf(options))

  // Approach B: Claude writes foldable replies, so folding needs no model call
  on('prompt.compose', async ($, e, next) => {
    const { sections } = await next(e)
    return { sections: [...sections, { id: 'textfold:style', text: STYLE, scope: 'session' }] }
  })

  // Each text block of a reply, drawn by Claude Code at the chosen level, with a line saying how much is folded;
  // a short block, or one the fold would barely shorten, as written
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const n = await read($, level)
    if (n <= 1) return next(e)
    const f = fold(e.props.text, n)
    if (!worthFolding(e.props.text, f.text)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const theirs = await next({ ...e, props: { ...e.props, text: f.text || '…' } })
    return (
      <Box flexDirection="column">
        {theirs}
        <Text dimColor>{`  ${LEVELS[n - 1]} · ${f.shown} of ${f.total} words · 1 unfolds`}</Text>
      </Box>
    )
  })

  // Above the prompt: the five levels. The band is one slot that several mods share, so this row goes on top and
  // what the hooks beneath drew stays under it (5px apart in VS Code); a survey keeps the band alone. The surfaces
  // name every plugin whose hook drew part of the band (VS Code heads its one frame "From the … plugins"), so
  // the rows beneath stay credited to their own plugins.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const n = await read($, level)
    const pick = (i: number) => () => update($, level, () => (i + 1) as Level)
    const theirs = await next(e)
    let row
    if (e.surface === 'vscode') {
      // VS Code draws a Button's label alone, ignores `plain` and has no hotkeys. Every level but the current one
      // is an outlined Button (`dimColor`), never the editor's filled blue; the current one is an inverted box of
      // the buttons' height, no Button since pressing it would do nothing. `fold` keeps to the first level when
      // the row wraps, and a wrapped line sits closer than the space between mods' rows.
      //
      // The box and the `fold` label are held to a button's line. A button keeps the browser's `line-height:
      // normal`, 16px for the chat font at 13px, inside a 1px border and no vertical padding; a Text sits at the
      // band's `line-height: 1.4`, 18.2px, and a Box's height is counted in those lines, its border outside it
      // (no rule makes it border-box). So LINE lines, 16/18.2 rounded up, give the box a button's 18px and the
      // label a button's text line, and the row's line stays a button's: the box's top meets the buttons' and
      // the label's text lines up with theirs. `normal` is the font's own and not a fixed share of its size, so
      // at another chat font size the box is up to about 1.7px taller or 0.2px shorter than a button.
      const { Box, Button, Text } = $.ui.resolve(e)
      const [first, ...rest] = LEVELS.map((name, i) =>
        n === i + 1 ? (
          <Box
            key={`level-${i + 1}`}
            flexShrink={0}
            flexWrap="nowrap"
            alignItems="center"
            height={LINE}
            overflow="hidden"
            paddingX={1}
            backgroundColor="text"
            borderStyle="round"
            borderColor="text"
          >
            <Text color="background">{name}</Text>
          </Box>
        ) : (
          <Button key={`level-${i + 1}`} label={name} dimColor onPress={pick(i)} />
        ),
      )
      row = (
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={1} rowGap={WRAP}>
          <Box flexDirection="row" flexWrap="nowrap" alignItems="center" columnGap={1}>
            <Box flexWrap="nowrap" alignItems="center" height={LINE}>
              <Text color="inactive">fold</Text>
            </Box>
            {first}
          </Box>
          {rest}
        </Box>
      )
    } else {
      // With the prompt empty, a digit picks a level
      const { Box, Button, Text } = $.ui.resolve(e)
      row = (
        <Box flexDirection="row" columnGap={2}>
          <Text dimColor>fold</Text>
          {LEVELS.map((name, i) => (
            <Button
              key={`level-${i + 1}`}
              label={name}
              hotkey={String(i + 1)}
              plain
              dimColor={n !== i + 1}
              onPress={pick(i)}
            />
          ))}
        </Box>
      )
    }
    // Claude Code's own placeholder is never nested: the desktop drops a band that nests it
    const below = isEngine(theirs) || !draws(theirs) ? null : theirs
    const { Box } = $.ui.resolve(e)
    if (e.surface !== 'vscode') {
      // The terminal, the desktop and mobile stack the rows with no gap: the terminal has no half rows
      return below ? (
        <Box flexDirection="column">
          {row}
          {below}
        </Box>
      ) : (
        row
      )
    }
    // VS Code's box: 5px of visible space between one mod's rows and the next and under the last row (layout
    // contract C2). This row brings its own space above it. Before rows beneath that bring none of their own it
    // adds the rest, and before rows that do, nothing. The lowest block owns the box's bottom edge: the space under
    // the last row is this root's unless the rows beneath end with space of their own.
    return (
      <Box
        flexDirection="column"
        paddingTop={SPACE.above}
        {...(below && endsSpaced(below) ? {} : { paddingBottom: SPACE.end })}
        {...(below && !startsSpaced(below) ? { rowGap: SPACE.between } : {})}
      >
        {row}
        {below}
      </Box>
    )
  })
}

// VS Code's space around the fold row, in the band's lines (1.4 × 13px at the chat font's default), measured in the
// host's frame (1px under the title, 4px at the bottom) so that each visible gap is 5px: above the row, whose top
// border sits 1 to 1.2px under the band's last ink with nothing added; before a text row beneath, whose ink starts
// 3.75 to 4.3px under the row's bottom border; and under the last row, 4px from the box's edge.
const SPACE = { above: 0.21, between: 0.06, end: 0.06 } as const

// Whether a tree starts with space of its own above it: a top padding or margin on its root, or on the first of a
// column's children, as far down as the first row goes
const startsSpaced = (node: unknown): boolean => spaced(node, 'top')

// Whether a tree ends with space of its own under it: a bottom padding or margin on its root, or on the last of a
// column's children, as far down as the last row goes
const endsSpaced = (node: unknown): boolean => spaced(node, 'bottom')

const SIDES = {
  top: ['paddingTop', 'paddingY', 'padding', 'marginTop', 'marginY', 'margin'],
  bottom: ['paddingBottom', 'paddingY', 'padding', 'marginBottom', 'marginY', 'margin'],
} as const

const spaced = (node: unknown, side: keyof typeof SIDES): boolean => {
  if (typeof node !== 'object' || node === null || (node as { type?: unknown }).type !== 'Box') return false
  const { props = {}, children = [] } = node as { props?: Record<string, unknown>; children?: unknown[] }
  const has = SIDES[side].some((k) => {
    const v = props[k]
    return (typeof v === 'number' && v > 0) || (typeof v === 'string' && v !== '' && v !== '0')
  })
  if (has) return true
  const rows = children.filter((c) => c != null && c !== false && c !== '')
  return props.flexDirection === 'column' && spaced(side === 'top' ? rows[0] : rows[rows.length - 1], side)
}

// The space between the fold row's wrapped lines in VS Code, in the band's lines: about 2.7px at 13px, a clear step
// under the 5px between mods' rows, so a wrapped line reads as part of this row (proximity)
const WRAP = 0.15

// A VS Code button's line in the band's lines: its 16px of `line-height: normal` over 1.4 × 13px, rounded up
const LINE = 0.88

// Whether a tree is Claude Code's own drawing, `{ type: 'engine' }`, which stands only at the root
const isEngine = (node: unknown): boolean =>
  typeof node === 'object' && node !== null && (node as { type?: unknown }).type === 'engine'

// Whether a tree shows anything: a Box that holds nothing but empty Boxes and blank strings shows nothing. A drawn
// element keeps its children beside its props, not in them.
const draws = (node: unknown): boolean => {
  if (node == null || typeof node === 'boolean') return false
  if (typeof node === 'string') return node.trim() !== ''
  if (Array.isArray(node)) return node.some(draws)
  if (typeof node !== 'object') return true
  const { type, children, props } = node as { type?: string; children?: unknown; props?: { children?: unknown } }
  if (type !== 'Box') return true
  return draws(children) || draws(props?.children)
}
