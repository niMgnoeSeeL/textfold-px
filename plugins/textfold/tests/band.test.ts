import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import { BESIDE_MIN_COLUMNS, KEEPWARM_KEY, liftKeepwarm } from '../hooks/register'

// The band above the prompt, as several mods share it: textfold's row on top, what the hooks beneath drew under
// it (the layout contract's C1 and C2), and in VS Code a row of outlined buttons with the current level inverted.

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} }
const BAND = { component: 'AbovePrompt', props: PROPS } as const
const SURVEY = { component: 'AbovePrompt', props: { ...PROPS, hasSurvey: true } } as const
const LEVELS = ['Full', 'Brief', 'Points', 'Outline', 'Gist'] as const
const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
const CLASSIC = ['terminal', 'desktop', 'mobile'] as const
// A VS Code button's line, in the band's lines (register.tsx's LINE)
const LINE = 0.88
// The space between the fold row's wrapped lines, in the band's lines (register.tsx's WRAP): under 7px, about 2.7px
const WRAP = 0.15
// VS Code's space around the fold row, in the band's lines (register.tsx's SPACE), measured by ink at 13px (C2): 7px
// from the host's title above it, and 5px to the box's edge under the last row
const SPACE = { above: 0.26, end: 0.06 } as const
const ROOT = { flexDirection: 'column', paddingTop: SPACE.above, paddingBottom: SPACE.end } as const
const isDivider = (el: Element) => el.type === 'Box' && el.props?.backgroundColor === 'promptBorder'

type Element = { type: string; props?: Record<string, unknown>; children?: unknown[]; part?: { plugin?: string } }
const isElement = (node: unknown): node is Element => typeof node === 'object' && node !== null && 'type' in node

// Every element of a tree, outermost first
const all = (node: unknown): Element[] =>
  isElement(node) ? [node, ...(node.children ?? []).flatMap(all)] : []

// A tree as plain data without the stamps the engine adds (whose part, whose press), to compare whole
const bare = (node: unknown): unknown => {
  if (!isElement(node)) return node
  const { type, props, children } = node
  return { type, ...(props && { props }), ...(children && { children: children.map(bare) }) }
}

const textOf = (node: unknown): string =>
  typeof node === 'string' ? node : isElement(node) ? (node.children ?? []).map(textOf).join('') : ''

// What the hooks beneath textfold draw, standing in for the other mods and for Claude Code itself. `spaced` brings
// its own space above it.
type Beneath = 'nothing' | 'text' | 'engine' | 'spaced'
const beneath = (on: On, kind: Beneath) =>
  on('ui.render', async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if (kind === 'engine') return { type: 'engine', ref: 0 } as never
    if (kind === 'text') return Text({ children: ['beneath'] })
    if (kind === 'spaced') return Box({ flexDirection: 'column', paddingTop: 0.3, children: [Text({ children: ['a rule'] })] })
    return Box({ children: [Box({ children: [] }), ' '] })
  })

// textfold's own row in the band: the drawing's root when it is the only row, else one of the list's rows
const own = (tree: unknown): Element =>
  (isElement(tree) && tree.part?.plugin === 'textfold'
    ? tree
    : (isElement(tree) ? tree.children ?? [] : []).find((c): c is Element => isElement(c) && c.part?.plugin === 'textfold')) as Element

// The fold row in a drawing: in VS Code the first row of textfold's root, elsewhere the root itself
const rowOf = async (band: { drawn: () => Promise<unknown> }) => own(await band.drawn()).children?.[0] as Element

describe('in VS Code', () => {
  test('every level but the current one is an outlined Button, with no hotkey, and no text is dim', async ($, on) => {
    beneath(on, 'nothing')
    const band = await $.ui.mount({ plugin: 'textfold', surface: 'vscode', ...BAND })
    for (const [step, k] of [1, 3, 5, 2, 4, 1].entries()) {
      if (step > 0) await band.press({ key: `level-${k}` })
      const buttons = await band.findAll({ type: 'Button' })
      expect(buttons.map((b) => b.props.label)).toEqual(LEVELS.filter((_, i) => i + 1 !== k))
      for (const b of buttons) {
        expect(b.props.dimColor).toBe(true)
        expect(b.props.hotkey).toBeUndefined()
        expect(b.props.plain).toBeUndefined()
        expect(b.props.variant).toBeUndefined()
      }
      for (const t of await band.findAll({ type: 'Text' })) expect(t.props.dimColor).toBeUndefined()
      expect((await band.find({ type: 'Text', text: 'fold' }))?.props.color).toBe('inactive')
    }
    await band.unmount()
  })

  test('the current level is an inverted box of the buttons’ border, not a Button', async ($, on) => {
    beneath(on, 'nothing')
    const band = await $.ui.mount({ plugin: 'textfold', surface: 'vscode', ...BAND })
    for (const k of [1, 4]) {
      if (k !== 1) await band.press({ key: `level-${k}` })
      const current = await band.find({ key: `level-${k}` })
      expect(current?.type).toBe('Box')
      expect(current?.props).toEqual({
        key: `level-${k}`,
        flexShrink: 0,
        flexWrap: 'nowrap',
        alignItems: 'center',
        height: LINE,
        overflow: 'hidden',
        paddingX: 1,
        backgroundColor: 'text',
        borderStyle: 'round',
        borderColor: 'text',
      })
      expect(bare(current?.children?.[0])).toEqual({ type: 'Text', props: { color: 'background' }, children: [LEVELS[k - 1]] })
      expect(await band.find({ type: 'Button', key: `level-${k}` })).toBeUndefined()
    }
    await band.unmount()
  })

  test('fold and the first level share a Box that never wraps', async ($, on) => {
    beneath(on, 'nothing')
    const band = await $.ui.mount({ plugin: 'textfold', surface: 'vscode', ...BAND })
    for (const k of [1, 3]) {
      if (k !== 1) await band.press({ key: `level-${k}` })
      const row = await rowOf(band)
      const head = row.children?.[0] as Element
      expect(head.type).toBe('Box')
      expect(head.props).toEqual({ flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', columnGap: 1 })
      expect(head.children).toHaveLength(2)
      expect(bare(head.children?.[0])).toEqual({
        type: 'Box',
        props: { flexWrap: 'nowrap', alignItems: 'center', height: LINE },
        children: [{ type: 'Text', props: { color: 'inactive' }, children: ['fold'] }],
      })
      expect((head.children?.[1] as Element).props?.key).toBe('level-1')
      expect((head.children?.[1] as Element).type).toBe(k === 1 ? 'Box' : 'Button')
      expect(row.children?.slice(1).map((c) => (c as Element).props?.key)).toEqual(['level-2', 'level-3', 'level-4', 'level-5'])
    }
    await band.unmount()
  })

  test('every row Box sets its wrap, and a wrapped line sits closer than the space between mods’ rows', async ($, on) => {
    beneath(on, 'nothing')
    const band = await $.ui.mount({ plugin: 'textfold', surface: 'vscode', ...BAND })
    for (const k of [1, 2, 5]) {
      if (k !== 1) await band.press({ key: `level-${k}` })
      const row = await rowOf(band)
      expect(row.props).toEqual({ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 1, rowGap: WRAP })
      // A Box with no direction is a row: the webview lays it out as one, and wraps it unless told otherwise
      const rows = all(row).filter((el) => el.type === 'Box' && String(el.props?.flexDirection ?? 'row').startsWith('row'))
      expect(rows.length).toBe(4)
      for (const box of rows) expect(box.props?.flexWrap).toBeDefined()
    }
    await band.unmount()
  })

  test('the current level and the fold label are held to a button’s line', async ($, on) => {
    // At the chat font's 13px a button is its 16px line of `line-height: normal` and a 1px border each side; the
    // band's lines are 1.4 × 13px, and a Box's border lies outside its height. Within a tenth of a pixel of 18px:
    expect(Math.abs(1 + LINE * 1.4 * 13 + 1 - 18)).toBeLessThan(0.1)
    expect(LINE * 1.4 * 13).toBeGreaterThanOrEqual(16)
    beneath(on, 'nothing')
    const band = await $.ui.mount({ plugin: 'textfold', surface: 'vscode', ...BAND })
    for (const k of [1, 3]) {
      if (k !== 1) await band.press({ key: `level-${k}` })
      const current = await band.find({ key: `level-${k}` })
      expect(current?.props).toMatchObject({ height: LINE, overflow: 'hidden', alignItems: 'center', borderStyle: 'round' })
      const label = all(await band.drawn()).find(
        (el) => el.type === 'Box' && el.children?.length === 1 && isElement(el.children[0]) && el.children[0].type === 'Text' && textOf(el) === 'fold',
      )
      expect(label?.props).toEqual({ flexWrap: 'nowrap', alignItems: 'center', height: LINE })
      // Only those two set a height, and every Text in the row is in one of them: no part is taller than a button's line
      const tall = all(await band.drawn()).filter((el) => el.props?.height !== undefined)
      expect(tall).toHaveLength(2)
    }
    await band.unmount()
  })

  test('alone, the row brings its own space above it and the box’s bottom edge, and no divider', async ($, on) => {
    beneath(on, 'nothing')
    const band = await $.ui.mount({ plugin: 'textfold', surface: 'vscode', ...BAND })
    for (const k of [1, 2]) {
      if (k !== 1) await band.press({ key: `level-${k}` })
      const drawn = own(await band.drawn())
      expect(drawn.props).toEqual(ROOT)
      expect(drawn.children).toHaveLength(1)
      expect((drawn.children?.[0] as Element).props?.flexWrap).toBe('wrap')
      expect(all(drawn).some(isDivider)).toBe(false)
    }
    await band.unmount()
  })

  // Stacking with rows beneath is drawn by box-layout under Claude Code 2.1.323 and is covered by its tests

  test('no divider over the fold row, under it when it is the last, or with only Claude Code’s placeholder beneath', async ($, on) => {
    beneath(on, 'engine')
    const band = await $.ui.mount({ plugin: 'textfold', surface: 'vscode', ...BAND })
    const drawn = (await band.drawn()) as Element
    expect(all(drawn).some(isDivider)).toBe(false)
    expect(drawn.children).toHaveLength(1)
    await band.unmount()
  })

  test('pressing a level makes it the current one', async ($, on) => {
    beneath(on, 'nothing')
    const band = await $.ui.mount({ plugin: 'textfold', surface: 'vscode', ...BAND })
    await band.press({ key: 'level-5' })
    expect((await band.find({ key: 'level-5' }))?.type).toBe('Box')
    await band.press({ key: 'level-1' })
    expect((await band.find({ key: 'level-1' }))?.type).toBe('Box')
    expect((await band.find({ key: 'level-5' }))?.type).toBe('Button')
    await band.unmount()
  })
})

describe('the band is shared', () => {
  // Stacking with rows beneath is drawn by box-layout under Claude Code 2.1.323 and is covered by its tests

  test('Claude Code’s own placeholder beneath is not nested: the row stands alone', async ($, on) => {
    beneath(on, 'engine')
    for (const surface of SURFACES) {
      const band = await $.ui.mount({ plugin: 'textfold', surface, ...BAND })
      const drawn = (await band.drawn()) as Element
      // In VS Code the row stands alone in the root that gives it its space; elsewhere it is the root
      if (surface === 'vscode') expect([drawn.props, drawn.children?.length]).toEqual([ROOT, 1])
      else expect(drawn.props?.flexDirection).toBe('row')
      expect(all(drawn).some((el) => el.type === 'engine')).toBe(false)
      expect(await band.find({ type: 'Text', text: 'fold' })).toBeDefined()
      await band.unmount()
    }
  })

  // Stacking with rows beneath is drawn by box-layout under Claude Code 2.1.323 and is covered by its tests

  test('a survey keeps the band: what is beneath passes through unchanged', async ($, on) => {
    on('ui.render', async ($, e) => {
      const { Text } = $.ui.resolve(e)
      return Text({ children: ['survey'] })
    })
    for (const surface of SURFACES) {
      const band = await $.ui.mount({ plugin: 'textfold', surface, ...SURVEY })
      expect(bare(await band.drawn())).toEqual({ type: 'Text', children: ['survey'] })
      expect(await band.find({ type: 'Button' })).toBeUndefined()
      await band.unmount()
    }
  })
})

for (const kind of ['nothing', 'text', 'spaced'] as const) {
  test(`the terminal, the desktop and mobile add no space around the row (${kind} beneath)`, async ($, on) => {
    beneath(on, kind)
    const spacing = ['paddingTop', 'paddingBottom', 'paddingY', 'padding', 'marginTop', 'marginBottom', 'marginY', 'margin', 'rowGap', 'gap']
    for (const surface of CLASSIC) {
      const band = await $.ui.mount({ plugin: 'textfold', surface, ...BAND })
      const row = own(await band.drawn())
      expect(row.props).toEqual({ flexDirection: 'row', columnGap: 2 })
      for (const el of all(row)) for (const k of spacing) expect(el.props?.[k]).toBeUndefined()
      // No divider, and the fold label and the five levels only
      expect(all(row).some((el) => el.props?.backgroundColor === 'promptBorder')).toBe(false)
      expect(row.children).toHaveLength(6)
      // Stacking with rows beneath is drawn by box-layout under Claude Code 2.1.323 and is covered by its tests
      await band.unmount()
    }
  })
}

test('the terminal, the desktop and mobile keep today’s row, hotkeys included', async ($, on) => {
  beneath(on, 'nothing')
  const today = (current: number) => ({
    type: 'Box',
    props: { flexDirection: 'row', columnGap: 2 },
    children: [
      { type: 'Text', props: { dimColor: true }, children: ['fold'] },
      ...LEVELS.map((label, i) => ({
        type: 'Button',
        props: { key: `level-${i + 1}`, label, hotkey: String(i + 1), plain: true, dimColor: current !== i + 1 },
      })),
    ],
  })
  for (const surface of CLASSIC) {
    const band = await $.ui.mount({ plugin: 'textfold', surface, ...BAND })
    expect(bare(own(await band.drawn()))).toEqual(today(1))
    await band.press({ key: 'level-3' })
    expect(bare(own(await band.drawn()))).toEqual(today(3))
    await band.press({ key: 'level-1' })
    expect(bare(own(await band.drawn()))).toEqual(today(1))
    await band.unmount()
  }
})

// cache-tax-px's keepwarm row beside the levels in VS Code
describe('the keepwarm row beside the levels', () => {
  const row = { type: 'Box', props: { flexDirection: 'row', flexWrap: 'nowrap' }, children: ['cache-tax warm'] }
  const block = { type: 'Box', props: { key: KEEPWARM_KEY, flexDirection: 'column', paddingTop: 0.195, paddingBottom: 0.005 }, children: [row], part: { plugin: 'cache-tax' } }
  const line = { type: 'Box', props: { flexDirection: 'column', height: 0, marginTop: 0.12 }, children: [{ type: 'Box', props: { height: 0.055, marginTop: 0.044, flexShrink: 0, backgroundColor: 'promptBorder' } }] }
  const reflect = { type: 'Box', props: { flexDirection: 'column', paddingTop: 0.05 }, children: ['reflect · rule'] }

  test('alone, the block is lifted whole but for its spacing, and nothing is left beneath', async () => {
    expect(liftKeepwarm(block)).toEqual({ status: { ...block, props: { flexDirection: 'column' } }, rest: null })
  })
  test('under rows beneath, the block and the divider over it leave cache-tax’s root, which keeps the rows', async () => {
    const root = { type: 'Box', props: { flexDirection: 'column' }, children: [reflect, line, block], part: { plugin: 'cache-tax' } }
    expect(liftKeepwarm(root)).toEqual({ status: block.children[0], rest: { ...root, children: [reflect] } })
  })
  test('a tree without the key, or in another shape, is left as it is', async () => {
    expect(liftKeepwarm(reflect)).toBe(null)
    expect(liftKeepwarm({ type: 'Box', props: { flexDirection: 'column' }, children: [reflect, block] })).toBe(null)
    expect(liftKeepwarm({ type: 'engine' })).toBe(null)
    expect(liftKeepwarm(null)).toBe(null)
  })
  test('the box must be wide enough for the levels and the row down to `cache-tax warm`', async () => {
    expect(BESIDE_MIN_COLUMNS).toBe(35)
  })

  // Stacking with rows beneath is drawn by box-layout under Claude Code 2.1.323 and is covered by its tests
})
