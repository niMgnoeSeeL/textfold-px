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

// Where the keepwarm row drawn beside the levels ends: this far inside the right edge, in `ch`, as the band's crab
// above it ends (2px at the 13px chat font)
export const RIGHT_INSET = 0.25

// cache-tax-px's keepwarm row beside the levels, in VS Code. cache-tax-px keys the VS Code block
// that holds its row with KEEPWARM_KEY; it comes back in this row's `next(e)` tree, as that tree's root when nothing
// else is beneath, or as the last child of `[rows, divider, block]`. Where the box is wide enough, the row is lifted
// out of that tree, with the divider over it, and drawn at the right end of the fold row's line. A tree without the
// key, or a box too narrow, is drawn as it is (C1: nothing hidden).
export const KEEPWARM_KEY = 'cache-tax:keepwarm'
// The box's width in the webview's columns (its content width over the width of `─`, 1em) from which both fit on one
// line: the fold row (about 23.8em at the 13px chat font), a column's gap and the keepwarm row down to its icon and
// `cache-tax warm` (about 9.4em). Under it the row stays at the box's foot.
export const BESIDE_MIN_COLUMNS = 35

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
const keyOf = (n: unknown) => (typeof n === 'object' && n !== null ? (n as Node).props?.key : undefined)
const isDivider = (n: unknown) => {
  const d = n as Node
  const line = d?.children?.[0] as Node | undefined
  return d?.type === 'Box' && d.props?.height === 0 && line?.props?.backgroundColor === 'promptBorder'
}
// The keepwarm row and what is left of the tree once it is lifted out, or null when the tree does not hold it
export const liftKeepwarm = (tree: unknown): { status: unknown; rest: unknown } | null => {
  const t = tree as Node
  // Alone, the block is cache-tax's root: its spacing goes (this row's line has its own) and the rest of it, the mark
  // that credits its plugin with it, stays
  if (keyOf(t) === KEEPWARM_KEY) return t.children?.length === 1 ? { status: { ...t, props: { flexDirection: 'column' } }, rest: null } : null
  const kids = t?.type === 'Box' && t.props?.flexDirection === 'column' ? (t.children ?? []) : []
  const last = kids[kids.length - 1] as Node | undefined
  if (kids.length < 3 || keyOf(last) !== KEEPWARM_KEY || last?.children?.length !== 1 || !isDivider(kids[kids.length - 2])) return null
  // The rest keeps cache-tax's root, and with it the mark that credits its plugin
  return { status: last.children[0], rest: { ...t, children: kids.slice(0, -2) } }
}

// The same in the terminal, where `bodyColumns` counts the slot's cells. There the keepwarm row is cache-tax-px's
// row itself, keyed, alone or the last of `[rows, row]`, and rows stack with no gap or divider. The fold row takes
// `fold`, five `n: Level` buttons and their gaps; the keepwarm row needs `[>] cache-tax · warm`; one cell is left at the
// right edge, as Claude Code leaves one right of its `[-]`.
const TERMINAL_FOLD_CELLS = 4 + LEVELS.reduce((n, name, i) => n + `${i + 1}: ${name}`.length, 0) + 2 * LEVELS.length
const TERMINAL_STATUS_MIN = '[>] cache-tax · warm'.length
export const TERMINAL_BESIDE_MIN_COLUMNS = TERMINAL_FOLD_CELLS + 2 + TERMINAL_STATUS_MIN + 1

// The terminal's keepwarm row and what is left of the tree once it is lifted out, or null when the tree does not hold it
export const liftKeepwarmTerminal = (tree: unknown): { status: unknown; rest: unknown } | null => {
  const t = tree as Node
  if (keyOf(t) === KEEPWARM_KEY) return { status: t, rest: null }
  const kids = t?.type === 'Box' && t.props?.flexDirection === 'column' ? (t.children ?? []) : []
  if (kids.length < 2 || keyOf(kids[kids.length - 1]) !== KEEPWARM_KEY) return null
  return { status: kids[kids.length - 1], rest: { ...t, children: kids.slice(0, -1) } }
}

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
  // what the hooks beneath drew stays under it (in VS Code, past a divider line); a survey keeps the band alone. The
  // surfaces name every plugin whose hook drew part of the band (VS Code heads its one frame "From the … plugins"),
  // so the rows beneath stay credited to their own plugins.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const n = await read($, level)
    const pick = (i: number) => () => update($, level, () => (i + 1) as Level)
    const drawnBeneath = await next(e)
    const lifted =
      e.surface === 'vscode' ? (e.props.bodyColumns >= BESIDE_MIN_COLUMNS ? liftKeepwarm(drawnBeneath) : null)
      : e.surface === 'terminal' ? (e.props.bodyColumns >= TERMINAL_BESIDE_MIN_COLUMNS ? liftKeepwarmTerminal(drawnBeneath) : null)
      : null
    const theirs = lifted ? lifted.rest : drawnBeneath
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
      const head = (
        <Box flexDirection="row" flexWrap="nowrap" alignItems="center" columnGap={1}>
          <Box flexWrap="nowrap" alignItems="center" height={LINE}>
            <Text color="inactive">fold</Text>
          </Box>
          {first}
        </Box>
      )
      // The keepwarm row, when lifted, takes what the levels leave on their line, at its right end: a status beside a
      // control, in its own quiet type and no button's frame. It truncates as it narrows and never pushes the levels.
      const status = lifted && (
        <Box
          key="keepwarm"
          flexDirection="row"
          flexWrap="nowrap"
          flexGrow={1}
          width={0}
          justifyContent="flex-end"
          paddingRight={RIGHT_INSET}
        >
          {lifted.status as never}
        </Box>
      )
      row = (
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={1} rowGap={WRAP}>
          {head}
          {rest}
          {status || null}
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
          {lifted && (
            // The keepwarm row, lifted, takes what the levels leave on their line, at its right end, and truncates
            <Box key="keepwarm" flexDirection="row" flexGrow={1} width={0} justifyContent="flex-end" paddingRight={1}>
              {lifted.status as never}
            </Box>
          )}
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
    // VS Code's box (layout contract C2): the fold row brings its own space above it, which puts its ink 7px under
    // the host's title. A block beneath is joined to it by a divider line in the middle of the 7px between them:
    // this root adds the space from the row to the divider, and the block beneath brings its own space under it, or,
    // if it brings none, gets this root's. The lowest block owns the box's bottom edge: the space under the last row
    // is this root's unless the rows beneath end with space of their own.
    return (
      <Box
        flexDirection="column"
        paddingTop={SPACE.above}
        {...(below && endsSpaced(below) ? {} : { paddingBottom: SPACE.end })}
      >
        {row}
        {below && (
          <Box
            flexDirection="column"
            height={0}
            marginTop={SPACE.between}
            {...(startsSpaced(below) ? {} : { marginBottom: SPACE.unspaced })}
          >
            <Box height={DIVIDER.line} marginTop={DIVIDER.hang} flexShrink={0} backgroundColor="promptBorder" />
          </Box>
        )}
        {below}
      </Box>
    )
  })
}

// VS Code's space around the fold row, in the band's lines (1.4 × 13px at the chat font's default), measured by ink in
// the host's frame (1px under the title, 4px at the bottom), layout contract C2:
// - above the row: 7px from the host's title to the row's top border, its first ink, which leaves the divider over a
//   block 3px over it;
// - between the row and a block beneath: from the row's bottom border, its last ink, to the divider's join, so that
//   the divider's line is 3px under the row;
// - under the divider, before a block beneath that brings no space of its own above it: a text row's, whose ink starts
//   3.75 to 4.3px under its top;
// - under the last row: 5px to the box's edge.
const SPACE = { above: 0.26, between: 0.12, unspaced: 0.06, end: 0.06 } as const

// The line between two mods' blocks in VS Code's box (C2): 1px of the theme's prompt border color across the
// content's width, in the band's lines. Its Box takes no height: the line hangs DIVIDER.hang under the join, into
// the top space of the block beneath, which every block sizes to sit 7px under the host's title; there the line sits
// 3px over that block's ink.
const DIVIDER = { line: 0.055, hang: 0.044 } as const

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
// under the 7px between mods' rows, so a wrapped line reads as part of this row (proximity)
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
