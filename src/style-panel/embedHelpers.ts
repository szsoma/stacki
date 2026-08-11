import type { AtRule } from 'postcss'
import type { ParsedDeclaration } from './lib/types'
import type { EmbedDoc } from './lib/webflow'
import { listAtRuleBlocks } from './lib/css'
import { webflowClassToCss } from './lib/webflow'
import type { ElementSnapshot } from './lib/types'

export function fullValue(decl: ParsedDeclaration): string {
  return decl.important ? `${decl.value} !important` : decl.value
}

export function parseImportant(input: string): { value: string; important: boolean } {
  const match = input.match(/!\s*important\s*$/i)
  if (match) return { value: input.slice(0, match.index).trim(), important: true }
  return { value: input.trim(), important: false }
}

export function headerLabel(snapshot: ElementSnapshot | undefined): string {
  if (!snapshot) return 'None'
  const tag = snapshot.tag ?? snapshot.webflowType.toLowerCase()
  const id = snapshot.id ? `#${snapshot.id}` : ''
  const formatted = [...new Set(snapshot.classes.map(webflowClassToCss).filter(Boolean))]
  const classes = formatted.length ? `.${formatted.slice(0, 5).join('.')}` : ''
  return `${tag}${id}${classes}` || tag
}

export function standaloneNativeClass(selector: string): string | null {
  const match = selector.trim().match(/^\.([_a-z-][\w-]*)(?::(?:hover|focus|active))?$/i)
  return match ? webflowClassToCss(match[1]) : null
}

export type Placeholder = {
  key: string
  atContext: string[]
  selector: string
  embedKey: string
  atRuleNode: AtRule
}

export function normalizeSelector(selector: string): string {
  return selector.replace(/\s+/g, ' ').trim()
}

export function computePlaceholders(docs: EmbedDoc[], classList: string[]): Placeholder[] {
  if (!classList.length) return []
  const primary = `.${classList[0]}`
  const full = `.${classList.join('.')}`
  const candidates = full === primary ? [primary] : [primary, full]

  const out: Placeholder[] = []
  for (const doc of docs) {
    doc.regions.forEach((region, regionIndex) => {
      for (const block of listAtRuleBlocks(region)) {
        const existing = new Set(block.selectors.map(normalizeSelector))
        for (const selector of candidates) {
          if (existing.has(normalizeSelector(selector))) continue
          out.push({
            key: `${doc.source.key}:${regionIndex}:${block.atContext.join('>')}:${selector}`,
            atContext: block.atContext,
            selector,
            embedKey: doc.source.key,
            atRuleNode: block.node,
          })
        }
      }
    })
  }
  return out
}
