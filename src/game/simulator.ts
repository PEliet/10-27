import { getCard } from '../data/cards'
import { getAbility } from '../data/content'
import type { CampaignBlueprint, GameState } from '../types/game'
import {
  abilityUsability, cardPlayability, chooseAbilityGrowth, chooseCardReward, chooseHeal, chooseUpgrade,
  activateAbility, createInitialGame, currentIntent, endTurn, playCard, startChallenge,
} from './state'

export type SimulationStrategy = 'aggressive' | 'defensive' | 'synergy'
export interface SimulationResult {
  strategy: SimulationStrategy
  wins: number
  remainingHp: number
  totalTurns: number
  stuck: boolean
  levelAbilityUses: number[]
}

function cardScore(state: GameState, uid: string, strategy: SimulationStrategy) {
  const instance = state.deck.find((card) => card.uid === uid)!
  const card = getCard(instance.cardId)
  const intent = currentIntent(state)
  const incoming = intent?.kind === 'charge' ? 0 : (intent?.amount ?? 0) + (state.battle?.chargedBonus ?? 0)
  const needsShield = incoming > (state.battle?.shield ?? 0)
  let score = card.tags.includes('progress') || card.tags.includes('basic-progress') ? 8 : 1
  if (card.tags.includes('defense')) score += strategy === 'defensive' && needsShield ? 14 : 3
  if (card.tags.includes('ingenuity')) score += strategy === 'synergy' ? 9 : 2
  if (card.tags.includes('ingenuity-spend') && (state.battle?.ingenuity ?? 0) >= 1) score += strategy === 'synergy' ? 12 : 4
  if (card.abilityId === state.abilityId) score += strategy === 'synergy' ? 8 : 2
  if (strategy === 'aggressive' && card.tags.includes('progress')) score += 8
  const playability = cardPlayability(state, uid)
  return score - playability.cost * (strategy === 'aggressive' ? 1 : 2)
}

function shouldUseAbility(state: GameState, strategy: SimulationStrategy) {
  const usability = abilityUsability(state)
  if (!usability.usable || !state.battle || !state.abilityId) return false
  if (state.abilityId === 'object-talk') return state.battle.turn <= (strategy === 'defensive' ? 2 : 3)
  if (state.abilityId === 'lighten') {
    return state.battle.hand.some((uid) => {
      const instance = state.deck.find((card) => card.uid === uid)!
      return getCard(instance.cardId).cost >= 2
    })
  }
  return state.battle.energy >= (strategy === 'aggressive' ? 1 : 2)
}

function chooseGrowth(state: GameState, strategy: SimulationStrategy) {
  const ability = getAbility(state.abilityId)!
  return chooseAbilityGrowth(state, ability.growths[strategy === 'defensive' ? 0 : 1].id)
}

function leaveRewards(state: GameState, strategy: SimulationStrategy) {
  let next = state
  if (next.screen === 'reward-card') {
    const choice = strategy === 'defensive'
      ? next.rewardOptions.find((id) => getCard(id).tags.includes('defense')) ?? next.rewardOptions[0]
      : strategy === 'synergy'
        ? next.rewardOptions.find((id) => getCard(id).abilityId === next.abilityId) ?? next.rewardOptions[0]
        : next.rewardOptions.find((id) => getCard(id).tags.includes('progress')) ?? next.rewardOptions[0]
    next = chooseCardReward(next, choice ?? null)
  }
  if (next.screen === 'reward-growth') next = chooseGrowth(next, strategy)
  if (next.screen === 'reward-rest') {
    if (strategy === 'defensive' || next.hp <= 12) return chooseHeal(next)
    const target = next.deck.find((card) => !card.upgraded && getCard(card.cardId).tags.includes(strategy === 'aggressive' ? 'progress' : 'ingenuity'))
      ?? next.deck.find((card) => !card.upgraded)
    return target ? chooseUpgrade(next, target.uid) : chooseHeal(next)
  }
  return next
}

export function simulateCampaign(blueprint: CampaignBlueprint, strategy: SimulationStrategy): SimulationResult {
  const initial: GameState = {
    ...createInitialGame(), runId: `simulation-${strategy}-${blueprint.seed}`, screen: 'draw', offeredAbilityId: blueprint.abilityId,
  }
  let state = startChallenge(initial, blueprint)
  let totalTurns = 0
  let stagnantTurns = 0
  let stuck = false

  for (let safety = 0; safety < 48 && state.screen !== 'summary' && state.screen !== 'defeat'; safety += 1) {
    state = leaveRewards(state, strategy)
    if (state.screen !== 'battle' || !state.battle) continue
    const progressBefore = state.battle.progress
    for (let plays = 0; plays < 8 && state.screen === 'battle' && state.battle; plays += 1) {
      if (shouldUseAbility(state, strategy)) state = activateAbility(state)
      if (state.screen !== 'battle' || !state.battle) break
      const playable = state.battle.hand.filter((uid) => cardPlayability(state, uid).playable)
      if (!playable.length) break
      playable.sort((left, right) => cardScore(state, right, strategy) - cardScore(state, left, strategy))
      const next = playCard(state, playable[0])
      if (next === state) break
      state = next
    }
    if (state.screen !== 'battle' || !state.battle) continue
    state = endTurn(state)
    totalTurns += 1
    const progressAfter = state.battle?.progress
    if (state.screen === 'battle' && progressAfter !== undefined && progressAfter <= progressBefore) stagnantTurns += 1; else stagnantTurns = 0
    if (stagnantTurns >= 3 || totalTurns >= 30) { stuck = true; break }
  }
  return {
    strategy, wins: state.results.filter((result) => result.success).length, remainingHp: state.hp, totalTurns, stuck,
    levelAbilityUses: state.results.map((result) => result.abilityUses),
  }
}

export function checkBlueprintDifficulty(blueprint: CampaignBlueprint) {
  const results = (['aggressive', 'defensive', 'synergy'] as const).map((strategy) => simulateCampaign(blueprint, strategy))
  const errors: string[] = []
  if (Math.max(...results.map((result) => result.wins)) < 3) errors.push('三种基础策略都无法完成三关；至少需要一条无需特定抽牌的可行路线')
  if (results.every((result) => result.stuck)) errors.push('所有模拟策略都会连续三个回合无法推进，存在卡死风险')
  for (let levelIndex = 0; levelIndex < 3; levelIndex += 1) {
    if (!results.some((result) => (result.levelAbilityUses[levelIndex] ?? 0) > 0)) errors.push(`第 ${levelIndex + 1} 关的三种模拟路线都没有可用的主动能力机会`)
  }
  if (results.every((result) => result.wins === 3 && result.remainingHp === 24) && Math.max(...results.map((result) => result.totalTurns)) <= 6) {
    errors.push('三种策略都能在每关约两回合内无伤通关，关卡明显偏向必胜，请增加公开且可应对的取舍')
  }
  return { results, errors }
}
