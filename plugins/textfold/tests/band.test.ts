import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import { BESIDE_MIN_COLUMNS, KEEPWARM_KEY, liftKeepwarm, RIGHT_INSET, TERMINAL_BESIDE_MIN_COLUMNS } from '../hooks/register'

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
// from the host's title above it, 3px from it to the divider, a text row's under the divider before rows beneath
// that bring no space of their own, and 5px to the box's edge under the last row
const SPACE = { above: 0.26, between: 0.12, unspaced: 0.06, end: 0.06 } as const
const ROOT = { flexDirection: 'column', paddingTop: SPACE.above, paddingBottom: SPACE.end } as const
// The divider between two mods' blocks (register.tsx's DIVIDER): a line of 1px at 13px that hangs under its join
const DIVIDER = { line: 0.055, hang: 0.044 } as const
// The band's line at the chat font's default, in CSS px
const LINE_PX = 1.4 * 13

// The divider at the join under the fold row: SPACE.between above it, and `under` when the rows beneath bring no space
// of their own above them. Its Box takes no height; the line in it hangs DIVIDER.hang under the join.
const divider = (under?: number) => ({
  type: 'Box',
  props: { flexDirection: 'column', height: 0, marginTop: SPACE.between, ...(under !== undefined ? { marginBottom: under } : {}) },
  children: [{ type: 'Box', props: { height: DIVIDER.line, marginTop: DIVIDER.hang, flexShrink: 0, backgroundColor: 'promptBorder' } }],
})
const isDivider = (el: Element) => el.type === 'Box' && el.props?.backgroundColor === 'promptBorder'

type Element = { type: string; props?: Record<string, unknown>; children?: unknown[] }
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

// What the hooks beneath textfold draw, standing in for the other mods and for Claude Code itself. `spaced` and
// `spacedFirst` bring their own space above them: on their root, or on the first of a column's rows.
type Beneath = 'nothing' | 'text' | 'rows' | 'engine' | 'spaced' | 'spacedFirst' | 'endSpaced' | 'endSpacedLast'
const beneath = (on: On, kind: Beneath) =>
  on('ui.render', async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if (kind === 'engine') return { type: 'engine', ref: 0 } as never
    if (kind === 'text') return Text({ children: ['beneath'] })
    if (kind === 'rows')
      return Box({ flexDirection: 'column', children: [Text({ children: ['a rule'] }), Text({ children: ['a status'] })] })
    if (kind === 'spaced') return Box({ flexDirection: 'column', paddingTop: 0.3, children: [Text({ children: ['a rule'] })] })
    // `endSpaced` and `endSpacedLast` own the box's bottom edge: space under their root, or under a column's last row
    if (kind === 'endSpaced') return Box({ flexDirection: 'column', paddingBottom: 0.2, children: [Text({ children: ['a status'] })] })
    if (kind === 'endSpacedLast')
      return Box({
        flexDirection: 'column',
        children: [Text({ children: ['a rule'] }), Box({ marginBottom: 0.3, children: [Text({ children: ['a status'] })] })],
      })
    if (kind === 'spacedFirst')
      return Box({
        flexDirection: 'column',
        children: [Box({ marginTop: 0.5, children: [Text({ children: ['a rule'] })] }), Text({ children: ['a status'] })],
      })
    return Box({ children: [Box({ children: [] }), ' '] })
  })

// The fold row in a drawing: in VS Code the first row of textfold's root, elsewhere the root itself when alone
const rowOf = async (band: { drawn: () => Promise<unknown> }) => ((await band.drawn()) as Element).children?.[0] as Element

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
      const drawn = (await band.drawn()) as Element
      expect(drawn.props).toEqual(ROOT)
      expect(drawn.children).toHaveLength(1)
      expect((drawn.children?.[0] as Element).props?.flexWrap).toBe('wrap')
      expect(all(drawn).some(isDivider)).toBe(false)
    }
    await band.unmount()
  })

  for (const kind of ['spaced', 'spacedFirst'] as const) {
    test(`rows beneath with their own space above them (${kind === 'spaced' ? 'on their root' : 'on their first row'}) get the divider and no space under it`, async ($, on) => {
      beneath(on, kind)
      const band = await $.ui.mount({ plugin: 'textfold', surface: 'vscode', ...BAND })
      const drawn = (await band.drawn()) as Element
      expect(drawn.props).toEqual(ROOT)
      expect(drawn.children).toHaveLength(3)
      expect(bare(drawn.children?.[1])).toEqual(divider())
      expect(textOf(drawn.children?.[2])).toBe(kind === 'spaced' ? 'a rule' : 'a rulea status')
      await band.unmount()
    })
  }

  for (const kind of ['endSpaced', 'endSpacedLast'] as const) {
    test(`rows beneath that end with their own space (${kind === 'endSpaced' ? 'on their root' : 'on their last row'}) own the bottom edge: no space added under them`, async ($, on) => {
      beneath(on, kind)
      const band = await $.ui.mount({ plugin: 'textfold', surface: 'vscode', ...BAND })
      const drawn = (await band.drawn()) as Element
      expect(drawn.props).toEqual({ flexDirection: 'column', paddingTop: SPACE.above })
      expect(drawn.children).toHaveLength(3)
      // They bring no space above them, so the divider brings a text row's under it
      expect(bare(drawn.children?.[1])).toEqual(divider(SPACE.unspaced))
      expect(textOf(drawn.children?.[2])).toBe(kind === 'endSpaced' ? 'a status' : 'a rulea status')
      await band.unmount()
    })
  }

  test('rows beneath with no space of their own at the bottom leave it to the fold row’s root', async ($, on) => {
    beneath(on, 'spaced')
    const band = await $.ui.mount({ plugin: 'textfold', surface: 'vscode', ...BAND })
    // Space above them but none below: no gap before them, and the root keeps the space under the last row
    expect(((await band.drawn()) as Element).props).toEqual(ROOT)
    await band.unmount()
  })

  test('the divider is a 1px line of the prompt’s border color whose Box takes no height', async ($, on) => {
    // At the chat font's 13px the line is a pixel, within a twentieth; it hangs under its join by less than its gap
    expect(Math.abs(DIVIDER.line * LINE_PX - 1)).toBeLessThan(0.05)
    expect(DIVIDER.hang * LINE_PX).toBeLessThan(SPACE.between * LINE_PX)
    beneath(on, 'spaced')
    const band = await $.ui.mount({ plugin: 'textfold', surface: 'vscode', ...BAND })
    const drawn = (await band.drawn()) as Element
    const lines = all(drawn).filter(isDivider)
    expect(lines).toHaveLength(1)
    // The line spans the content's width: no width of its own, in a column that stretches it, and it does not shrink
    // in its Box of no height
    expect(lines[0]?.props).toEqual({ height: DIVIDER.line, marginTop: DIVIDER.hang, flexShrink: 0, backgroundColor: 'promptBorder' })
    expect((drawn.children?.[1] as Element).props).toMatchObject({ flexDirection: 'column', height: 0 })
    await band.unmount()
  })

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
  for (const kind of ['text', 'rows'] as const) {
    test(`with ${kind === 'text' ? 'a Text' : 'a Box of rows'} beneath, both are drawn: the fold row on top, a divider between them in VS Code and no gap elsewhere`, async ($, on) => {
      beneath(on, kind)
      for (const surface of SURFACES) {
        const band = await $.ui.mount({ plugin: 'textfold', surface, ...BAND })
        const drawn = (await band.drawn()) as Element
        expect(drawn.type).toBe('Box')
        expect(drawn.props).toEqual(surface === 'vscode' ? ROOT : { flexDirection: 'column' })
        expect(drawn.children).toHaveLength(surface === 'vscode' ? 3 : 2)
        if (surface === 'vscode') expect(bare(drawn.children?.[1])).toEqual(divider(SPACE.unspaced))
        else expect(all(drawn).some(isDivider)).toBe(false)
        const [row, theirs] = (drawn.children as Element[]).filter((c) => !all(c).some(isDivider))
        expect(all(row).some((el) => el.type === 'Text' && textOf(el) === 'fold')).toBe(true)
        expect(textOf(theirs)).toBe(kind === 'text' ? 'beneath' : 'a rulea status')
        await band.unmount()
      }
    })
  }

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

  test('a band beneath that draws nothing leaves the row alone', async ($, on) => {
    beneath(on, 'nothing')
    for (const surface of SURFACES) {
      const band = await $.ui.mount({ plugin: 'textfold', surface, ...BAND })
      const drawn = (await band.drawn()) as Element
      if (surface === 'vscode') expect([drawn.props, drawn.children?.length]).toEqual([ROOT, 1])
      else expect(drawn.props?.flexDirection).toBe('row')
      expect(await band.find({ type: 'Text', text: 'fold' })).toBeDefined()
      await band.unmount()
    }
  })

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
      const drawn = (await band.drawn()) as Element
      const row = kind === 'nothing' ? drawn : (drawn.children?.[0] as Element)
      if (kind !== 'nothing') expect(drawn.props).toEqual({ flexDirection: 'column' })
      expect(row.props).toEqual({ flexDirection: 'row', columnGap: 2 })
      for (const el of all(row)) for (const k of spacing) expect(el.props?.[k]).toBeUndefined()
      // No divider: the rows stack as they did, the fold row and then what is beneath
      expect(all(drawn).some((el) => el.props?.backgroundColor === 'promptBorder')).toBe(false)
      expect(drawn.children).toHaveLength(kind === 'nothing' ? 6 : 2)
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
    expect(bare(await band.drawn())).toEqual(today(1))
    await band.press({ key: 'level-3' })
    expect(bare(await band.drawn())).toEqual(today(3))
    await band.press({ key: 'level-1' })
    expect(bare(await band.drawn())).toEqual(today(1))
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

  // cache-tax-px's tree as it hands it up: its rows beneath (reflect's), a divider, and its keyed block
  const handed = (on: On) =>
    on('ui.render', async ($, e) => {
      const { Box, Text } = $.ui.resolve(e)
      const line = Box({ flexDirection: 'column', height: 0, marginTop: 0.12, children: [Box({ height: 0.055, marginTop: 0.044, flexShrink: 0, backgroundColor: 'promptBorder' })] })
      const block = Box({ key: KEEPWARM_KEY, flexDirection: 'column', paddingTop: 0.195, paddingBottom: 0.005, children: [Box({ flexDirection: 'row', flexWrap: 'nowrap', children: [Text({ children: ['cache-tax warm'] })] })] })
      return Box({ flexDirection: 'column', children: [Box({ flexDirection: 'column', paddingTop: 0.05, children: [Text({ children: ['reflect · rule'] })] }), line, block] })
    })
  const mountAt = ($: any, columns: number) =>
    $.ui.mount({ plugin: 'textfold', surface: 'vscode', component: 'AbovePrompt', props: { ...PROPS, bodyColumns: columns } })

  test('wide enough, the row sits at the right end of the fold row’s line, and the divider over it is gone', async ($, on) => {
    handed(on)
    const band = await mountAt($, BESIDE_MIN_COLUMNS)
    const row = await rowOf(band)
    const status = row.children?.[row.children.length - 1] as Element
    expect(status.props).toEqual({ key: 'keepwarm', flexDirection: 'row', flexWrap: 'nowrap', flexGrow: 1, width: 0, justifyContent: 'flex-end', paddingRight: RIGHT_INSET })
    const all = JSON.stringify(await band.drawn())
    expect(all.match(/cache-tax warm/g)?.length).toBe(1)
    // one divider: textfold's own, between the fold row and reflect's rows
    expect(all.match(/promptBorder/g)?.length).toBe(1)
    expect(all.indexOf('cache-tax warm')).toBeLessThan(all.indexOf('reflect · rule'))
    await band.unmount()
  })

  test('narrower, the tree is drawn as it was handed, the row at the box’s foot', async ($, on) => {
    handed(on)
    const band = await mountAt($, BESIDE_MIN_COLUMNS - 1)
    const all = JSON.stringify(await band.drawn())
    expect(all.match(/promptBorder/g)?.length).toBe(2)
    expect(all.indexOf('cache-tax warm')).toBeGreaterThan(all.indexOf('reflect · rule'))
    await band.unmount()
  })

  // cache-tax-px's terminal tree: its rows beneath (reflect's), then its keyed row, with no gap or divider
  const handedTerminal = (on: On) =>
    on('ui.render', async ($, e) => {
      const { Box, Text } = $.ui.resolve(e)
      const row = Box({ key: KEEPWARM_KEY, flexWrap: 'nowrap', flexDirection: 'row', children: [Text({ wrap: 'truncate-end', children: ['[>] cache-tax · warm · keepwarm 3h00m left'] })] })
      return Box({ flexDirection: 'column', children: [Text({ children: ['reflect · rule'] }), row] })
    })
  const terminalAt = ($: any, columns: number) =>
    $.ui.mount({ plugin: 'textfold', surface: 'terminal', component: 'AbovePrompt', props: { ...PROPS, bodyColumns: columns } })

  test('in the terminal, wide enough, the row sits at the right end of the fold row’s line', async ($, on) => {
    handedTerminal(on)
    expect(TERMINAL_BESIDE_MIN_COLUMNS).toBe(4 + 41 + 10 + 2 + 20 + 1)
    const band = await terminalAt($, TERMINAL_BESIDE_MIN_COLUMNS)
    const drawn = (await band.drawn()) as Element
    const row = drawn.children?.[0] as Element
    const status = row.children?.[row.children.length - 1] as Element
    expect(status.props).toEqual({ key: 'keepwarm', flexDirection: 'row', flexGrow: 1, width: 0, justifyContent: 'flex-end', paddingRight: 1 })
    const all = JSON.stringify(drawn)
    expect(all.match(/cache-tax · warm/g)?.length).toBe(1)
    expect(all.indexOf('cache-tax · warm')).toBeLessThan(all.indexOf('reflect · rule'))
    // no gap and no divider in the terminal
    expect(all).not.toContain('promptBorder')
    await band.unmount()
  })

  test('in the terminal, narrower, the tree is drawn as it was handed', async ($, on) => {
    handedTerminal(on)
    const band = await terminalAt($, TERMINAL_BESIDE_MIN_COLUMNS - 1)
    const all = JSON.stringify(await band.drawn())
    expect(all.indexOf('cache-tax · warm')).toBeGreaterThan(all.indexOf('reflect · rule'))
    await band.unmount()
  })
})
