export const LAYOUT_CONTROL_PROPS = new Set([
  'display', 'vertical-align', 'flex-flow', 'flex-direction', 'flex-wrap',
  'gap', 'row-gap', 'column-gap', 'grid-gap', 'grid-row-gap', 'grid-column-gap',
])

export const EMBED_ONLY_PROPS = new Set(['transition', 'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay'])

export const EFFECTS_CONTROL_PROPS = new Set([
  'mix-blend-mode', 'opacity', 'outline-style', 'outline-width', 'outline-offset', 'outline-color', 'box-shadow',
  'transform', 'filter', 'backdrop-filter', 'clip-path', '-webkit-clip-path', 'cursor', 'pointer-events',
  'transition', 'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay', 'transition-behavior',
])

export const TYPOGRAPHY_CONTROL_PROPS = new Set([
  'font-family', 'font-weight', 'font-size', 'line-height', 'color',
  'text-align', 'letter-spacing', 'text-indent', 'column-count',
  'font-style', 'text-transform', 'direction',
  'text-decoration', 'text-decoration-line', 'text-decoration-style', 'text-decoration-color',
  'text-decoration-thickness', 'text-decoration-skip-ink',
  'word-break', 'white-space', 'overflow-wrap',
  'column-gap', 'column-rule-style', 'column-rule-width', 'column-rule-color', 'column-span',
  'text-overflow', '-webkit-text-stroke', '-webkit-text-stroke-width', '-webkit-text-stroke-color', 'text-shadow',
])

export const ALIGN_PROPS = new Set(['justify-content', 'align-items'])

export const GRID_CONTROL_PROPS = new Set([
  'grid-template-columns', 'grid-template-rows', 'grid-template-areas',
  'grid-auto-flow', 'grid-auto-columns', 'grid-auto-rows',
  'justify-items', 'align-items', 'justify-content', 'align-content',
])
