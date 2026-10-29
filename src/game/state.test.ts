import { describe, expect, it } from 'vitest'
import {
  abilityUsability, cardPlayability, chooseAbilityGrowth, chooseCardReward, createInitialGame, drawAbility,
  activateAbility, endTurn, playCard, retryCurrentLevel, startChallenge,
} from './state'
import { getCard } from '../data/cards'
import { getAbility } from '../data/content'
import { getOfflineBlueprint } from '../data/offlineBlueprints'
import type { AbilityId, GameState } from '../types/game'

const ABILITY_INDEX: Record<AbilityId, number> = { 'undo-three-seconds': 0, lighten: 1, 'object-talk': 2 }

function start(abilityId: AbilityId = 'undo-three-seconds') {
  const drawn = drawAbility(createInitialGame(), () => ABILITY_INDEX[abilityId] / 3)
  return startChallenge(drawn, getOfflineBlueprint(abilityId))
}

function findInHand(state: GameState, cardId: string) {
  return state.battle!.hand.find((uid) => state.deck.find((card) => card.uid === uid)?.cardId === cardId)
}

function putInHand(state: GameState, cardId: string) {
  const target = state.deck.find((card) => card.cardId === cardId)!
  if (state.battle!.hand.includes(target.uid)) return state
  const battle = structuredClone(state.battle!)
  battle.drawPile = battle.drawPile.filter((uid) => uid !== target.uid)
  battle.discardPile = battle.discardPile.filter((uid) => uid !== target.uid)
  const replaced = battle.hand[0]
  battle.hand[0] = target.uid
  if (replaced) battle.discardPile.push(replaced)
  return { ...state, battle }
}

describe('blueprint-driven local rules engine', () => {
  it('opens a fixed blueprint level with exactly four cards and public resources', () => {
    const state = start()
    expect(state.blueprint?.source).toBe('offline-example')
    expect(state.battle?.hand).toHaveLength(4)
    const cards = state.battle!.hand.map((uid) => getCard(state.deck.find((card) => card.uid === uid)!.cardId))
    expect(cards.some((card) => card.tags.includes('basic-progress'))).toBe(true)
    expect(cards.some((card) => card.tags.includes('defense'))).toBe(true)
  })

  it('records, refunds one energy, and safely replays a paid card without a loop', () => {
    let state = putInHand(start('undo-three-seconds'), 'quick-fix')
    const quick = findInHand(state, 'quick-fix')!
    state = playCard(state, quick)
    expect(state.battle).toMatchObject({ energy: 2, recordedCardUid: quick, activeUsesRemaining: 1 })
    expect(abilityUsability(state).preview).toContain('返还 1 点能量')
    state = activateAbility(state)
    expect(state.battle?.hand).toContain(quick)
    expect(state.battle?.energy).toBe(3)
    expect(state.battle?.activeUsesRemaining).toBe(0)
    state = playCard(state, quick)
    expect(state.battle?.energy).toBe(2)
    expect(abilityUsability(state).usable).toBe(false)
  })

  it('uses light cards for capped discount and keeps the active zero-cost effect separate', () => {
    let state = putInHand(start('lighten'), 'quick-fix')
    state = playCard(state, findInHand(state, 'quick-fix')!)
    expect(state.battle?.discountCharges).toBe(1)
    state = putInHand(state, 'secure-push')
    const heavy = findInHand(state, 'secure-push')!
    expect(cardPlayability(state, heavy)).toMatchObject({ cost: 1, badge: '减重 · 费用 -1' })
    state = playCard(state, heavy)
    expect(state.battle?.discountCharges).toBe(0)
    state = activateAbility(state)
    state = putInHand(state, 'brace')
    expect(cardPlayability(state, findInHand(state, 'brace')!)).toMatchObject({ cost: 0, badge: '主动失重 · 费用变 0' })
  })

  it('lets object translation reorder the actual draw pile and gain ingenuity', () => {
    let state = start('object-talk')
    const before = state.battle!.drawPile.slice(-2)
    expect(before).toHaveLength(2)
    state = activateAbility(state)
    expect(state.battle!.drawPile.slice(-2)).toEqual([before[1], before[0]])
    expect(state.battle?.ingenuity).toBe(1)
    expect(state.battle?.activeUsesRemaining).toBe(0)
  })

  it('executes the structured level mechanic before the public threat', () => {
    let state = putInHand(start(), 'brace')
    state = playCard(state, findInHand(state, 'brace')!)
    const next = endTurn(state)
    expect(next.hp).toBe(24)
    expect(next.battle).toMatchObject({ turn: 2, energy: 3, shield: 0, ingenuity: 1 })
    expect(next.battle?.logs.some((log) => log.kind === 'mechanic')).toBe(true)
  })

  it('completes immediately, grants blueprint rewards once, then asks for one growth path', () => {
    let state = putInHand(start(), 'quick-fix')
    const quick = findInHand(state, 'quick-fix')!
    state = { ...state, battle: { ...state.battle!, progress: state.battle!.target - 3 } }
    state = playCard(state, quick)
    expect(state.screen).toBe('reward-card')
    const reward = state.rewardOptions[0]
    state = chooseCardReward(state, reward)
    expect(state.deck).toHaveLength(11)
    expect(state.screen).toBe('reward-growth')
    const growth = getAbility(state.abilityId)!.growths[0].id
    state = chooseAbilityGrowth(state, growth)
    expect(state.screen).toBe('reward-rest')
    expect(state.abilityGrowth).toBe(growth)
    expect(chooseCardReward(state, state.rewardOptions[0] ?? null)).toBe(state)
  })

  it('restores level-entry state on the single retry without changing the blueprint', () => {
    const state = start()
    const failed = { ...state, screen: 'defeat' as const, hp: 0, deck: state.deck.slice(0, 8) }
    const retried = retryCurrentLevel(failed)
    expect(retried.hp).toBe(24)
    expect(retried.deck).toHaveLength(10)
    expect(retried.blueprint).toEqual(state.blueprint)
    expect(retried.retryUsed[0]).toBe(true)
    const failedAgain = { ...retried, screen: 'defeat' as const }
    expect(retryCurrentLevel(failedAgain)).toBe(failedAgain)
  })
})
