import { describe, expect, it } from 'vitest'
import {
  CATEGORY_COLOR_TOKENS,
  firstUnusedCategoryColor,
  isCategoryPaletteColor,
} from './category-colors'

describe('category colors', () => {
  it('assigns the first palette color not already in use', () => {
    expect(firstUnusedCategoryColor([CATEGORY_COLOR_TOKENS[0], CATEGORY_COLOR_TOKENS[1]])).toBe(
      CATEGORY_COLOR_TOKENS[2],
    )
  })

  it('reuses the first palette color after all colors are assigned', () => {
    expect(firstUnusedCategoryColor(CATEGORY_COLOR_TOKENS)).toBe(CATEGORY_COLOR_TOKENS[0])
  })

  it('recognizes palette tokens without rewriting legacy colors', () => {
    expect(isCategoryPaletteColor(CATEGORY_COLOR_TOKENS[3])).toBe(true)
    expect(isCategoryPaletteColor('#3d8b8b')).toBe(false)
    expect(firstUnusedCategoryColor(['#3d8b8b'])).toBe(CATEGORY_COLOR_TOKENS[0])
  })
})
