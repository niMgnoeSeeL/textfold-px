import { describe, expect, test } from 'claude-code/testing'

import { blocks, firstSentence, fold, words, worthFolding } from '../hooks/fold'

const REPLY = `The bug was in the cache key, and it is fixed. Two requests for the same paper shared one key.

## What changed
The key now includes the language. That makes each translation its own entry. Old entries stay valid.

- Updated \`store.key()\` to take a language. It falls back to English.
- Added a test for two languages.

\`\`\`python
def key(pid, lang="en"):
    return f"{pid}:{lang}"
\`\`\`

## What to check
Run the tests once. They take about a minute, e.g. on a laptop.`

describe('sentences', () => {
  test('a first sentence ends at a stop and a space, never inside code or after an abbreviation', async () => {
    expect(firstSentence('It works. Then more.').head).toBe('It works.')
    expect(firstSentence('Use e.g. this one. Next.').head).toBe('Use e.g. this one.')
    expect(firstSentence('Call `a.b()` first. Then go.').head).toBe('Call `a.b()` first.')
    expect(firstSentence('Version 3.5 is out. Upgrade.').head).toBe('Version 3.5 is out.')
    expect(firstSentence('**It is fixed.** The rest.').head).toBe('**It is fixed.**')
    expect(firstSentence('One sentence only').more).toBe(false)
  })

  test('a Chinese stop ends a sentence without a space', async () => {
    expect(firstSentence('缓存键有问题，已经修好。同一篇论文的两次请求共用了一个键。').head).toBe('缓存键有问题，已经修好。')
  })
})

describe('folding', () => {
  test('the blocks of a reply', async () => {
    expect(blocks(REPLY).map((b) => b.kind)).toEqual(['para', 'heading', 'para', 'list', 'code', 'heading', 'para'])
  })

  test('Full is the reply as written', async () => {
    expect(fold(REPLY, 1).text).toBe(REPLY)
  })

  test('Brief keeps two sentences a paragraph and short code', async () => {
    const t = fold(REPLY, 2).text
    expect(t).toContain('The key now includes the language. That makes each translation its own entry. …')
    expect(t).not.toContain('Old entries stay valid.')
    expect(t).toContain('def key(pid, lang="en"):')
  })

  test('Points keeps one sentence a paragraph and item, and short code', async () => {
    const t = fold(REPLY, 3).text
    expect(t).toContain('The bug was in the cache key, and it is fixed. …')
    expect(t).toContain('- Updated `store.key()` to take a language. …')
    expect(t).toContain('def key(pid, lang="en"):')
  })

  test('Outline keeps the headings and the first sentence under each', async () => {
    const t = fold(REPLY, 4).text
    expect(t).toBe(
      'The bug was in the cache key, and it is fixed. …\n\n## What changed\n\nThe key now includes the language. …\n\n## What to check\n\nRun the tests once. …',
    )
  })

  test('Gist is the reply’s first sentence', async () => {
    expect(fold(REPLY, 5).text).toBe('The bug was in the cache key, and it is fixed. …')
  })

  test('a table straight after a paragraph is its own block', async () => {
    const md = 'The options compare like this.\n| Option | Cost |\n| --- | --- |\n| A | free |\n| B | 5/mo |'
    expect(blocks(md).map((b) => b.kind)).toEqual(['para', 'table'])
  })

  test('a table without leading pipes is a table, not a paragraph joined into one line', async () => {
    const md = 'Option | Cost\n:-- | --:\nA | free\nB | 5/mo'
    expect(blocks(md)).toEqual([{ kind: 'table', lines: md.split('\n') }])
    expect(blocks('A heading\n---').map((b) => b.kind)).toEqual(['para'])
  })

  test('each level shows fewer words', async () => {
    const counts = [1, 2, 3, 4, 5].map((n) => fold(REPLY, n).shown)
    for (let i = 1; i < counts.length; i++) expect(counts[i]!).toBeLessThan(counts[i - 1]!)
    expect(words('缓存键 cache key')).toBe(5)
  })

  test('Outline of a reply without headings is Points, not Gist', async () => {
    const unheaded = [
      'The first paragraph states its point. It adds a detail or two.',
      'The second paragraph has a point of its own. It also explains it.',
      'The third paragraph closes the reply. Nothing else follows it.',
    ].join('\n\n')
    expect(fold(unheaded, 4).text).toBe(fold(unheaded, 3).text)
    expect(fold(unheaded, 4).text).toContain('The second paragraph has a point of its own. …')
    expect(fold(unheaded, 5).text).toBe('The first paragraph states its point. …')
  })
})

describe('tables and code', () => {
  const table = ['| Option | Cost |', '| --- | --- |', ...Array.from({ length: 10 }, (_, i) => `| ${i} | ${i}/mo |`)].join('\n')
  const md = `The options compare like this. The cheapest is not the best.\n\n${table}\n\nPick the second one. It is the best value.`

  test('a table is whole at Brief and Points, and gone at Gist', async () => {
    expect(fold(md, 2).text).toContain(table)
    expect(fold(md, 3).text).toContain(table)
    // no headings: Outline reads as Points, so the table is still part of the skeleton
    expect(fold(md, 4).text).toBe(fold(md, 3).text)
    expect(fold(md, 5).text).not.toContain('| Option')
  })

  test('code over Brief\'s 6 lines folds to its line at Brief and Points', async () => {
    const code = ['```sh', ...Array.from({ length: 10 }, (_, i) => `echo ${i}`), '```'].join('\n')
    const long = `Run this to see it. It prints ten lines.\n\n${code}`
    expect(fold(long, 2).text).toContain('`⋯ 10 lines of code`')
    expect(fold(long, 3).text).toContain('`⋯ 10 lines of code`')
    expect(fold(long, 3).text).not.toContain('echo 9')
  })
})

describe('the gate', () => {
  const long = Array.from({ length: 12 }, (_, i) => `Sentence ${i} has a few words in it.`).join(' ')

  test('a reply under 80 words is never folded', async () => {
    expect(worthFolding(REPLY, fold(REPLY, 5).text)).toBe(false)
  })

  test('a long reply is folded when the fold hides a quarter of it or more', async () => {
    expect(worthFolding(long, fold(long, 3).text)).toBe(true)
    expect(worthFolding(long, long.slice(0, Math.round(long.length * 0.8)))).toBe(false)
  })

  test('Chinese counts by reading effort, not by character', async () => {
    expect(worthFolding('缓'.repeat(140), '缓')).toBe(true)
    expect(worthFolding('缓'.repeat(120), '缓')).toBe(false)
  })
})

describe('drawings', () => {
  // Pi's mermaid renderer turns a mermaid block into these rows before any extension sees the reply.
  const art = ['`┌────┐    ┌──────────┐    ┌────────┐`  ', '`│ Pi ├───▶│ TextFold ├───▶│ Screen │`  ', '`└────┘    └──────────┘    └────────┘`'].join('\n')
  const md = `The reply goes through three steps. Each one changes it.\n\n${art}\n\nThe fold is the second step. It runs after the drawing.`

  test('a drawing is one block, kept row by row at Brief and Points, and gone at Gist', async () => {
    expect(blocks(md).map((b) => b.kind)).toEqual(['para', 'art', 'para'])
    expect(fold(md, 2).text).toContain(art)
    expect(fold(md, 3).text).toContain(art)
    // no headings: Outline reads as Points, so the drawing is still part of the skeleton
    expect(fold(md, 4).text).toBe(fold(md, 3).text)
    expect(fold(md, 5).text).not.toContain('TextFold ├')
  })

  test('a paragraph of one code span is still a paragraph', async () => {
    expect(blocks('`npm test`').map((b) => b.kind)).toEqual(['para'])
  })
})

// A Korean reply as Claude writes one: four paragraphs, each led by the sentence that states its point
const KO = "HTTP 캐싱은 저장된 응답을 재사용할지 판단할 때 먼저 그 응답이 \"신선한(fresh)\" 상태인지 확인합니다. 신선하다면 서버에 묻지 않고 바로\n캐시에서 돌려줍니다. 신선도는 응답이 저장된 뒤 지난 시간(age)과 신선 수명(freshness lifetime)을 비교해 정합니다. 신선 수명은\nCache-Control: max-age(공유 캐시는 s-maxage)가 가장 우선하고, 없으면 Expires 헤더를 쓰며, 둘 다 없으면 Last-Modified 시각을 바탕으로 한\n휴리스틱(보통 경과 시간의 10% 정도)으로 추정합니다.\n\n캐시 사용 자체가 허용되는지는 지시어가 먼저 결정합니다. no-store가 있으면 응답을 아예 저장하지 않습니다. private은 브라우저 같은 개인\n캐시에만 저장을 허용하고, 프록시나 CDN 같은 공유 캐시에는 저장하지 못하게 합니다. no-cache는 저장은 허용하지만 매번 서버에 재검증하도록\n요구합니다. 요청 쪽의 Cache-Control도 영향을 줍니다. 예를 들어 새로고침 시 브라우저가 보내는 no-cache나 max-age=0은 저장된 응답이 신선해도\n재검증을 강제합니다.\n\n또한 Vary 헤더가 있으면 저장된 응답이 지금 요청과 \"같은 변형\"이어야 재사용할 수 있습니다. 예를 들어 Vary: Accept-Encoding이면 저장 당시와\n같은 Accept-Encoding 값을 가진 요청에만 그 응답을 돌려줍니다. 기본 캐시 키는 메서드와 URL이므로, Vary에 적힌 요청 헤더 값이 다르면 별개의\n항목으로 취급합니다.\n\n응답이 오래되어 신선하지 않으면 캐시는 곧바로 버리지 않고 조건부 요청으로 재검증합니다. 저장해 둔 ETag는 If-None-Match로, Last-Modified는\nIf-Modified-Since로 서버에 보냅니다. 서버가 304 Not Modified로 답하면 본문을 다시 받지 않고 저장본의 신선 수명을 갱신해 재사용합니다.\n변경되었다면 200과 새 본문을 받아 교체합니다. 이 밖에 stale-while-revalidate는 만료 직후에도 백그라운드 재검증을 하는 동안 오래된 응답을\n쓰도록 허용합니다. stale-if-error는 서버 오류 시 오래된 응답을 쓰도록 허용합니다. immutable은 신선한 동안 재검증을 생략해도 된다고\n알립니다.\n\n"

describe('Korean', () => {
  test('a Korean word counts as one word, as an English one does, particles and all', async () => {
    expect(words('캐시는 저장된 응답을 재사용합니다.')).toBe(4)
    // A particle written onto an English word stays part of it; a parenthesis splits
    expect(words('Cache-Control도 영향을 줍니다. 신선한(fresh) 상태')).toBe(6)
    // Jamo and compatibility jamo count too
    expect(words('ㅋㅋ ᄒᄒ')).toBe(2)
    // Chinese and Japanese still count by character, beside Korean
    expect(words('缓存 캐시 キャッシュ cache')).toBe(2 + 1 + 5 + 1)
  })

  test('a Korean sentence ends at its stop and a space', async () => {
    expect(firstSentence('신선도는 시간으로 정합니다. 신선 수명은 max-age가 우선합니다.')).toEqual({
      head: '신선도는 시간으로 정합니다.',
      more: true,
      rest: '신선 수명은 max-age가 우선합니다.',
    })
  })

  test('a long Korean reply folds at Brief, Points and Gist', async () => {
    expect(words(KO)).toBe(228)
    const at = (n: number) => fold(KO, n)
    for (const n of [2, 3, 5]) expect(worthFolding(KO, at(n).text)).toBe(true)
    expect([at(2).shown, at(3).shown, at(5).shown]).toEqual([81, 46, 14])
    // Points keeps each paragraph's first sentence; Gist the reply's
    expect(at(3).text.split('\n\n').map((p) => p.slice(0, 2))).toEqual(['HT', '캐시', '또한', '응답'])
    expect(at(5).text).toBe('HTTP 캐싱은 저장된 응답을 재사용할지 판단할 때 먼저 그 응답이 "신선한(fresh)" 상태인지 확인합니다. …')
  })

  test('a reply mixing Korean and English counts both', async () => {
    const mixed = Array.from({ length: 12 }, (_, i) => `${i}번째 문장은 cache key를 설명합니다. It is short.`).join(' ')
    expect(words(mixed)).toBe(12 * 8)
    expect(worthFolding(mixed, fold(mixed, 3).text)).toBe(true)
  })

  test('a short Korean reply stays whole', async () => {
    const short = '테스트가 모두 통과했습니다. 변경 사항은 캐시 키에 언어를 넣은 것입니다.'
    expect(worthFolding(short, fold(short, 5).text)).toBe(false)
  })
})
