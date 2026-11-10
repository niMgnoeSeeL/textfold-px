// A reply folded to fewer words, from its own sentences: no model call, nothing rewritten.
//
// It works because the style section asks Claude to open every paragraph and list item with the sentence that
// states its point. Folding then keeps a prefix of what Claude wrote: the first sentence or two of each
// paragraph, the first sentence of each item, the headings, and at the last level the reply's first sentence.

export const LEVELS = ['Full', 'Brief', 'Points', 'Outline', 'Gist'] as const

type Kind = 'heading' | 'code' | 'list' | 'table' | 'quote' | 'para' | 'rule' | 'art'
type Block = { kind: Kind; lines: string[] }

const FENCE = /^\s*(`{3,}|~{3,})/
const HEADING = /^\s{0,3}#{1,6}\s/
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+/
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

/** A GFM table starts at a row with a pipe followed by its delimiter row, with or without leading pipes, and
 *  may come straight after a paragraph. The delimiter needs a pipe, or `Title` over `---` would be one.
 *  shortcut: the header's cell count is not matched against the delimiter's, as GFM asks; add it if a reply ever
 *  folds a paragraph that only looks like a table. */
const tableAt = (lines: string[], i: number) =>
  (lines[i] ?? '').includes('|') && (lines[i + 1] ?? '').includes('|') && DELIM.test(lines[i + 1] ?? '')

/** A markdown text as blocks: headings, code, lists, tables, quotes, paragraphs. */
export function blocks(md: string): Block[] {
  const out: Block[] = []
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (!line.trim()) {
      i++
      continue
    }
    const fence = FENCE.exec(line)
    if (fence) {
      const mark = fence[1] ?? '```'
      const buf = [line]
      i++
      while (i < lines.length) {
        const l = lines[i] ?? ''
        buf.push(l)
        i++
        if (l.trim().startsWith(mark)) break
      }
      out.push({ kind: 'code', lines: buf })
      continue
    }
    if (HEADING.test(line)) {
      out.push({ kind: 'heading', lines: [line] })
      i++
      continue
    }
    if (RULE.test(line)) {
      out.push({ kind: 'rule', lines: [line] })
      i++
      continue
    }
    const kind: Kind = /^\s*\|/.test(line) || tableAt(lines, i) ? 'table' : /^\s*>/.test(line) ? 'quote' : ITEM.test(line) ? 'list' : 'para'
    const buf = [line]
    i++
    while (i < lines.length) {
      const l = lines[i] ?? ''
      if (!l.trim() || FENCE.test(l) || HEADING.test(l)) break
      if (kind === 'para' && (ITEM.test(l) || tableAt(lines, i))) break   // a paragraph that runs into a list or a table
      buf.push(l)
      i++
    }
    const art = kind === 'para' && buf.length > 1 && buf.slice(0, -1).every((l) => ART_ROW.test(l))
    out.push({ kind: art ? 'art' : kind, lines: buf })
  }
  return out
}

// A row of a drawing, as Pi draws a mermaid block before the fold sees it: one inline code span, then a hard break.
const ART_ROW = /^(`+).*\1 {2}$/

const ABBREV = /\b(?:e\.g|i\.e|etc|vs|cf|al|approx|Dr|Mr|Ms|Fig|Eq|No)\.$/i

/** The text's first sentence, and whether more follows it. Inline code is never cut; a Chinese or Japanese stop
 *  ends a sentence without a space after it. */
export function firstSentence(text: string): { head: string; more: boolean; rest: string } {
  let inCode = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? ''
    if (c === '`') {
      inCode = !inCode
      continue
    }
    if (inCode) continue
    if ('。！？'.includes(c)) return cut(text, i + 1)
    if (!'.!?'.includes(c)) continue
    const after = /^([*_)"'”’\]]*)(\s+|$)/.exec(text.slice(i + 1))
    if (!after) continue   // "3.5", "a.b", "...": not a sentence's end
    if (ABBREV.test(text.slice(0, i + 1))) continue
    return cut(text, i + 1 + (after[1] ?? '').length)
  }
  return { head: text.trim(), more: false, rest: '' }
}

function cut(text: string, at: number) {
  const rest = text.slice(at).trim()
  return { head: balance(text.slice(0, at).trim()), more: rest.length > 0, rest }
}

/** Closes the bold or code span a cut left open. */
function balance(s: string) {
  if ((s.match(/\*\*/g) ?? []).length % 2) s += '**'
  if ((s.match(/`/g) ?? []).length % 2) s += '`'
  return s
}

function sentences(text: string, n: number) {
  let rest = text.trim()
  const out: string[] = []
  let more = false
  for (let k = 0; k < n && rest; k++) {
    const s = firstSentence(rest)
    out.push(s.head)
    rest = s.rest
    more = s.more
  }
  return { text: out.join(' '), more }
}

/** A list's items: the marker, the indent and the item's text (its continuation lines joined). */
function items(b: Block) {
  const out: { indent: number; marker: string; text: string }[] = []
  for (const line of b.lines) {
    const m = ITEM.exec(line)
    if (m) out.push({ indent: (m[1] ?? '').length, marker: m[2] ?? '-', text: line.slice(m[0].length) })
    else if (out.length) out[out.length - 1]!.text += ' ' + line.trim()
  }
  return out
}

// Chinese and Japanese characters, each read as a word of its own: kana (U+3040–30FF), the unified ideographs
// (U+3400–9FFF) and the compatibility ideographs (U+F900–FAFF). One class for both counts, so the two cannot drift.
const CJK_CHAR = /[\u3040-\u30FF\u3400-\u9FFF\uF900-\uFAFF]/g

// Hangul: the jamo (U+1100–11FF), their compatibility forms (U+3130–318F), jamo extended A (U+A960–A97F), the
// syllables (U+AC00–D7AF) and jamo extended B (U+D7B0–D7FF). Korean spaces its words as English does, so a run of
// Hangul counts as one word, as a run of Latin letters does, and a particle written onto a Latin word
// (`Cache-Control도`) stays part of that word.
const HANGUL = '\\u1100-\\u11FF\\u3130-\\u318F\\uA960-\\uA97F\\uAC00-\\uD7AF\\uD7B0-\\uD7FF'
const WORD = new RegExp(`[A-Za-z0-9${HANGUL}][\\w'’${HANGUL}-]*`, 'g')

/** Words: each Chinese or Japanese character, and each run of Latin letters, digits or Hangul. */
export function words(md: string) {
  const plain = md.replace(/```[\s\S]*?```/g, ' ')
  const cjk = (plain.match(CJK_CHAR) ?? []).length
  const spaced = (plain.replace(CJK_CHAR, ' ').match(WORD) ?? []).length
  return cjk + spaced
}

/** Below this many words a reply is read whole: there is nothing in "Done, the tests pass." to fold. */
export const MIN_WORDS = 80
/** A fold must hide at least this share of a reply, or the reader would not see that anything changed. */
export const MIN_HIDDEN = 0.25

/** Words as reading effort: a Chinese or Japanese character reads as about 1/1.6 of an English word; a Korean
 *  word, spaced as an English one, reads as one. */
function reading(md: string) {
  const plain = md.replace(/```[\s\S]*?```/g, ' ')
  const cjk = (plain.match(CJK_CHAR) ?? []).length
  return words(md) - cjk + cjk / 1.6
}

/** Whether a reply is worth showing folded: long enough to need it, and the fold hides enough of it. */
export function worthFolding(md: string, folded: string) {
  const all = reading(md)
  return all >= MIN_WORDS && 1 - reading(folded) / all >= MIN_HIDDEN
}

const MORE = ' …'

/** The text at a level: 1 Full (as written), 2 Brief, 3 Points, 4 Outline, 5 Gist. */
export function fold(md: string, level: number): { text: string; total: number; shown: number } {
  const total = words(md)
  if (level <= 1) return { text: md, total, shown: total }
  const bs = blocks(md)
  // Outline is a reply's headings and the first sentence under each. A reply written without
  // headings has no sections to outline, so it reads as Points: the first sentence of each
  // paragraph, nothing dropped. Without this it fell to the reply's first sentence, which is
  // exactly what Gist shows, and level 4 stopped being a level of its own.
  if (level === 4 && !bs.some((b) => b.kind === 'heading')) level = 3
  const out: string[] = []
  let underHeading = true   // at Outline, a section shows its heading and its first sentence
  let first = true          // at Gist, the reply shows its first sentence
  for (const b of bs) {
    if (level === 5 && !first) break
    switch (b.kind) {
      case 'rule':
        break
      case 'art':
        if (level <= 3) out.push(b.lines.join('\n'))   // a picture: kept whole, never joined into one line
        break
      case 'heading':
        if (level <= 4) out.push(b.lines[0] ?? '')
        underHeading = true
        break
      case 'code':
      case 'table':
        if (level > 3) break
        // a table is kept whole like a list's items: its rows are already short, and it is often the answer;
        // code is kept up to Brief's 6 lines, the command a reply is about, and a longer listing folds to its line
        if (b.kind === 'table' || b.lines.length <= 8) out.push(b.lines.join('\n'))
        else out.push(`\`⋯ ${b.lines.length - 2} lines of code\``)   // less the fences
        break
      case 'list': {
        const its = items(b).filter((it) => level === 2 || it.indent === 0)
        if (level <= 3) {
          out.push(its.map((it) => {
            const s = firstSentence(it.text)
            return `${' '.repeat(it.indent)}${it.marker} ${s.head}${s.more ? MORE : ''}`
          }).join('\n'))
        } else if (underHeading || (level === 5 && first)) {
          const it = its[0]
          if (it) {
            const s = firstSentence(it.text)
            out.push(s.head + (s.more || its.length > 1 ? MORE : ''))
          }
          underHeading = false
          first = false
        }
        break
      }
      case 'quote':
      case 'para': {
        const raw = b.lines.map((l) => (b.kind === 'quote' ? l.replace(/^\s*>\s?/, '') : l).trim()).join(' ')
        if (level >= 4 && !underHeading) break
        const s = sentences(raw, level === 2 ? 2 : 1)
        out.push((b.kind === 'quote' ? '> ' : '') + s.text + (s.more ? MORE : ''))
        underHeading = false
        first = false
        break
      }
    }
  }
  const text = out.join('\n\n')
  return { text, total, shown: words(text) }
}
