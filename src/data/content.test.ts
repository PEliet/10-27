import { describe, expect, it } from 'vitest'
import { createStarterDeck, getCard } from './cards'
import { ABILITIES } from './content'
import { getOfflineBlueprint } from './offlineBlueprints'
import { validateBlueprint } from '../game/blueprint'
import { checkBlueprintDifficulty } from '../game/simulator'

describe('ability system and offline snapshots', () => {
  it('defines three whole-run abilities with passive, active, cards and two growth paths', () => {
    expect(ABILITIES).toHaveLength(3)
    for (const ability of ABILITIES) {
      expect(ability.passiveRule.length).toBeGreaterThan(12)
      expect(ability.activeRule.length).toBeGreaterThan(12)
      expect(ability.growths).toHaveLength(2)
      expect(ability.exclusiveCards).toHaveLength(3)
      ability.exclusiveCards.forEach((id) => expect(getCard(id).abilityId).toBe(ability.id))
    }
  })

  it('keeps offline examples separate and valid for every ability', () => {
    for (const ability of ABILITIES) {
      const snapshot = getOfflineBlueprint(ability.id)
      const checked = validateBlueprint(snapshot, ability.id)
      expect(checked.errors).toEqual([])
      expect(checked.blueprint?.source).toBe('offline-example')
      expect(checked.blueprint?.levels).toHaveLength(3)
      expect(new Set(checked.blueprint?.levels.map((level) => level.mechanic.id)).size).toBe(3)
      const difficulty = checkBlueprintDifficulty(snapshot)
      expect(difficulty.errors, ability.id).toEqual([])
      expect(difficulty.results.some((result) => result.wins === 3)).toBe(true)
    }
  })

  it('builds a ten-card deck with progression, defense and ingenuity roles', () => {
    for (const ability of ABILITIES) {
      let index = 0
      const deck = createStarterDeck(ability.id, () => `card-${index++}`)
      expect(deck).toHaveLength(10)
      const definitions = deck.map((instance) => getCard(instance.cardId))
      expect(definitions.some((card) => card.tags.includes('basic-progress'))).toBe(true)
      expect(definitions.some((card) => card.tags.includes('defense'))).toBe(true)
      expect(definitions.some((card) => card.tags.includes('ingenuity'))).toBe(true)
    }
  })
})
