import { readFileSync } from 'node:fs'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

// Vitest runs with `css: false`, so the stylesheet is read from disk instead of imported.
// `npm test` runs from the frontend root. Comments are dropped so they are not taken for rules.
const css = readFileSync(`${cwd()}/src/index.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

// Spec section 5 (Sistema visual): "solo la regla del límite se anima al cargar y el formulario
// modal al abrir; se respeta prefers-reduced-motion". jsdom does not apply media queries, so this
// checks the stylesheet itself: the rule that removes an animation must win over the one that sets it.

interface Rule {
  selectors: string[]
  body: string
}

/** Rules of a flat block of CSS (no nested at-rules). */
function parseRules(block: string): Rule[] {
  const rules: Rule[] = []
  for (const match of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1]
      .split(',')
      .map((selector) => selector.trim())
      .filter((selector) => selector !== '')
    rules.push({ selectors, body: match[2] })
  }
  return rules
}

/** Body of the first `@media` block whose condition contains `condition`. */
function mediaBlock(source: string, condition: string): string {
  const start = source.indexOf(condition)
  if (start === -1) return ''
  const open = source.indexOf('{', start)
  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(open + 1, index)
  }
  return ''
}

/** [ids, classes + attributes + pseudo-classes, elements + pseudo-elements]. */
function specificity(selector: string): [number, number, number] {
  const withoutPseudoElements = selector.replace(/::[\w-]+/g, ' ')
  const ids = (withoutPseudoElements.match(/#[\w-]+/g) ?? []).length
  const classes = (withoutPseudoElements.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g) ?? []).length
  const elements =
    (withoutPseudoElements.replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|:[\w-]+/g, ' ').match(/[a-z][\w-]*/gi) ?? []).length +
    (selector.match(/::[\w-]+/g) ?? []).length
  return [ids, classes, elements]
}

function atLeast(a: [number, number, number], b: [number, number, number]): boolean {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index]
  }
  return true
}

function baseClass(selector: string): string {
  return selector.match(/\.[\w-]+/)?.[0] ?? selector
}

const reducedMotion = mediaBlock(css, 'prefers-reduced-motion: reduce')
const withoutMedia = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
const animated = parseRules(withoutMedia).filter((rule) => /animation\s*:/.test(rule.body))
const stilled = parseRules(reducedMotion).filter((rule) => /animation\s*:\s*none/.test(rule.body))

function animatedSelectors(className: string): string[] {
  return animated.flatMap((rule) => rule.selectors).filter((selector) => baseClass(selector) === className)
}

function isStilled(selector: string): boolean {
  return stilled
    .flatMap((rule) => rule.selectors)
    .some((candidate) => baseClass(candidate) === baseClass(selector) && atLeast(specificity(candidate), specificity(selector)))
}

describe('index.css: prefers-reduced-motion', () => {
  it('reads the stylesheet', () => {
    expect(css).toContain('.modal')
    expect(reducedMotion).toContain('animation: none')
  })

  it.each(['.ruler-fill', '.ruler-over'])('removes the animation of %s', (className) => {
    const selectors = animatedSelectors(className)

    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors) expect(isStilled(selector), selector).toBe(true)
  })

  it('removes the opening animation of the modal', () => {
    const selectors = animatedSelectors('.modal')

    expect(selectors.length).toBeGreaterThan(0)
    // `.modal[open]` sets the animation; a plain `.modal { animation: none }` is less specific and loses.
    for (const selector of selectors) expect(isStilled(selector), `${selector} keeps its animation`).toBe(true)
  })
})

describe('index.css: narrow screens', () => {
  const narrow = mediaBlock(css, 'max-width: 40em')

  it('uses em breakpoints, so they follow the text size', () => {
    const conditions = [...css.matchAll(/@media\s*\(([^)]*width[^)]*)\)/g)].map((match) => match[1])

    expect(conditions.length).toBeGreaterThan(0)
    for (const condition of conditions) expect(condition).toMatch(/:\s*[\d.]+em$/)
  })

  it('stacks the expenses table and replaces its header row with a label per cell', () => {
    const rules = parseRules(narrow)
    const thead = rules.find((rule) => rule.selectors.includes('.responsive-table thead'))
    const label = rules.find((rule) => rule.selectors.includes('.responsive-table td[data-label]::before'))

    expect(thead?.body).toMatch(/display\s*:\s*none/)
    expect(label?.body).toMatch(/content\s*:\s*attr\(data-label\)/)
  })

  it('does not fix the root font size, so the text follows the user setting', () => {
    const root = parseRules(withoutMedia).filter((rule) => rule.selectors.some((selector) => /^(:root|html)$/.test(selector)))

    for (const rule of root) expect(rule.body).not.toMatch(/(^|[;\s])font-size\s*:/)
  })
})
