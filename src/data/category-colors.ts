export const CATEGORY_COLOR_TOKENS = [
  'var(--category-1)',
  'var(--category-2)',
  'var(--category-3)',
  'var(--category-4)',
  'var(--category-5)',
  'var(--category-6)',
  'var(--category-7)',
  'var(--category-8)',
  'var(--category-9)',
  'var(--category-10)',
  'var(--category-11)',
  'var(--category-12)',
] as const

export function firstUnusedCategoryColor(usedColors: Iterable<string | null>): string {
  const used = new Set(usedColors)
  return CATEGORY_COLOR_TOKENS.find((color) => !used.has(color)) ?? CATEGORY_COLOR_TOKENS[0]
}

export function isCategoryPaletteColor(color: string | null): boolean {
  return color !== null && CATEGORY_COLOR_TOKENS.some((token) => token === color)
}
