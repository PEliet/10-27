import { z } from 'zod'
import { ABILITIES, getAbility } from '../data/content'
import { createStarterDeck, getCard } from '../data/cards'
import { campaignBlueprintSchema, withCanonicalRuleText } from './blueprint'
import type {
  AbilityGrowthId, AbilityUsability, BattleLog, BattleState, CampaignBlueprint, CampaignLevel,
  CardInstance, CardPlayability, CardType, GameState, LevelResult, MechanicEffect,
} from '../types/game'

const cardInstanceSchema = z.object({ uid: z.string(), cardId: z.string(), upgraded: z.boolean() })
const battleLogSchema = z.object({ id: z.string(), kind: z.enum(['card', 'threat', 'system', 'ai', 'ability', 'mechanic']), text: z.string() })
const battleSchema = z.object({
  levelIndex: z.number().int().min(0).max(2), progress: z.number().min(0), target: z.number().positive(),
  turn: z.number().int().positive(), energy: z.number().int().min(0).max(3), shield: z.number().int().min(0),
  ingenuity: z.number().int().min(0).max(5), hand: z.array(z.string()).max(4), drawPile: z.array(z.string()),
  discardPile: z.array(z.string()), exhaustPile: z.array(z.string()), playedThisTurn: z.array(z.string()),
  turnProgress: z.number().min(0), intentIndex: z.number().int().min(0), chargedBonus: z.number().min(0),
  discountCharges: z.number().int().min(0).max(1), activeDiscountReady: z.boolean(),
  activeUsesRemaining: z.number().int().min(0).max(2), passiveTriggeredThisTurn: z.boolean(), growthTriggeredThisTurn: z.boolean(),
  recordedCardUid: z.string().nullable(), reclaimedCardUid: z.string().nullable(),
  mechanicTriggersThisTurn: z.number().int().min(0).max(8), mechanicTriggered: z.boolean(),
  forecastTurns: z.number().int().min(0).max(2), lastThreatDamage: z.number().min(0), sceneText: z.string(),
  logs: z.array(battleLogSchema).max(100),
})
const resultSchema = z.object({
  levelId: z.string(), levelName: z.string(), success: z.boolean(), turns: z.number().int().positive(),
  hpAfter: z.number().int().min(0), cardsPlayed: z.number().int().min(0), abilityUses: z.number().int().min(0), excerpt: z.string(),
})
const growthSchema = z.enum(['undo-cushion', 'undo-buffer', 'light-carry', 'light-momentum', 'talk-context', 'talk-editor'])

export const gameStateSchema = z.object({
  version: z.literal(3), screen: z.enum(['home', 'draw', 'generating', 'battle', 'reward-card', 'reward-growth', 'reward-rest', 'defeat', 'summary']),
  runId: z.string(), mode: z.enum(['ai', 'offline-example']).nullable(), blueprint: campaignBlueprintSchema.nullable(),
  abilityId: z.enum(['undo-three-seconds', 'lighten', 'object-talk']).nullable(), abilityGrowth: growthSchema.nullable(),
  offeredAbilityId: z.enum(['undo-three-seconds', 'lighten', 'object-talk']).nullable(), rerollsRemaining: z.number().int().min(0).max(2),
  hp: z.number().int().min(0).max(24), maxHp: z.literal(24), deck: z.array(cardInstanceSchema).max(20), battle: battleSchema.nullable(),
  levelEntry: z.object({ hp: z.number().int().min(1).max(24), deck: z.array(cardInstanceSchema), abilityGrowth: growthSchema.nullable() }).nullable(),
  retryUsed: z.tuple([z.boolean(), z.boolean(), z.boolean()]), rewardsClaimed: z.tuple([z.boolean(), z.boolean()]), growthClaimed: z.boolean(),
  rewardOptions: z.array(z.string()).max(3), results: z.array(resultSchema).max(3), totalCardsPlayed: z.number().int().min(0),
  totalAbilityUses: z.number().int().min(0), startedAt: z.number(),
})

function uid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
function newLog(kind: BattleLog['kind'], text: string): BattleLog { return { id: uid(), kind, text } }
function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619) }
  return hash >>> 0
}
function shuffle(values: string[], initialSeed: number) {
  const result = [...values]
  let seed = initialSeed >>> 0
  for (let index = result.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const target = Math.floor((seed / 4294967296) * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return { values: result, seed }
}
function instanceByUid(deck: CardInstance[], cardUid: string) { return deck.find((card) => card.uid === cardUid) }
function hasTag(deck: CardInstance[], cardUid: string, tag: string) {
  const instance = instanceByUid(deck, cardUid)
  return instance ? getCard(instance.cardId).tags.includes(tag) : false
}
function ensureTag(hand: string[], draw: string[], discard: string[], deck: CardInstance[], tag: string) {
  if (hand.some((cardUid) => hasTag(deck, cardUid, tag))) return
  const source = [draw, discard].find((pile) => pile.some((cardUid) => hasTag(deck, cardUid, tag)))
  if (!source) return
  const candidateIndex = source.findIndex((cardUid) => hasTag(deck, cardUid, tag))
  const [candidate] = source.splice(candidateIndex, 1)
  const replaceIndex = hand.findIndex((cardUid) => !hasTag(deck, cardUid, 'basic-progress') && !hasTag(deck, cardUid, 'defense'))
  const index = replaceIndex >= 0 ? replaceIndex : hand.length - 1
  const [replaced] = hand.splice(index, 1, candidate)
  if (replaced) discard.push(replaced)
}
function drawHand(deck: CardInstance[], drawSource: string[], discardSource: string[], seed: number, firstTurn: boolean) {
  let draw = [...drawSource]
  let discard = [...discardSource]
  const hand: string[] = []
  let currentSeed = seed
  while (hand.length < 4) {
    if (!draw.length) {
      if (!discard.length) break
      const shuffled = shuffle(discard, currentSeed)
      draw = shuffled.values; currentSeed = shuffled.seed; discard = []
    }
    const card = draw.pop()
    if (card) hand.push(card)
  }
  ensureTag(hand, draw, discard, deck, 'basic-progress')
  if (firstTurn) ensureTag(hand, draw, discard, deck, 'defense')
  return { hand, drawPile: draw, discardPile: discard }
}

function activeUses(state: GameState) {
  const ability = getAbility(state.abilityId)!
  if (state.abilityGrowth === 'undo-buffer' || state.abilityGrowth === 'talk-editor') return 2
  return ability.activeUses
}

export function currentLevel(state: GameState): CampaignLevel | null {
  if (!state.blueprint || !state.battle) return null
  return state.blueprint.levels[state.battle.levelIndex]
}

function createBattle(state: GameState, levelIndex: number): BattleState {
  if (!state.abilityId || !state.blueprint) throw new Error('缺少能力或关卡蓝图')
  const level = state.blueprint.levels[levelIndex]
  const seed = hashString(`${state.runId}:${state.blueprint.seed}:${level.id}:${state.deck.length}`)
  const shuffled = shuffle(state.deck.map((card) => card.uid), seed)
  const drawn = drawHand(state.deck, shuffled.values, [], shuffled.seed, true)
  return {
    levelIndex, progress: 0, target: level.target, turn: 1, energy: 3, shield: 0, ingenuity: 0,
    hand: drawn.hand, drawPile: drawn.drawPile, discardPile: drawn.discardPile, exhaustPile: [], playedThisTurn: [],
    turnProgress: 0, intentIndex: 0, chargedBonus: 0, discountCharges: 0, activeDiscountReady: false,
    activeUsesRemaining: activeUses(state), passiveTriggeredThisTurn: false, growthTriggeredThisTurn: false,
    recordedCardUid: null, reclaimedCardUid: null, mechanicTriggersThisTurn: 0, mechanicTriggered: false,
    forecastTurns: 0, lastThreatDamage: 0, sceneText: level.scene,
    logs: [newLog('system', `进入「${level.name}」。目标进度：${level.target}。`)],
  }
}

export function createInitialGame(): GameState {
  return {
    version: 3, screen: 'home', runId: uid(), mode: null, blueprint: null, abilityId: null, abilityGrowth: null,
    offeredAbilityId: null, rerollsRemaining: 2, hp: 24, maxHp: 24, deck: [], battle: null, levelEntry: null,
    retryUsed: [false, false, false], rewardsClaimed: [false, false], growthClaimed: false, rewardOptions: [], results: [],
    totalCardsPlayed: 0, totalAbilityUses: 0, startedAt: Date.now(),
  }
}

export function drawAbility(state: GameState, random = Math.random): GameState {
  const pool = ABILITIES.filter((ability) => ability.id !== state.offeredAbilityId)
  const selected = pool[Math.floor(random() * pool.length)] ?? pool[0]
  return { ...state, screen: 'draw', offeredAbilityId: selected.id, abilityId: null }
}
export function rerollAbility(state: GameState, random = Math.random): GameState {
  if (state.screen !== 'draw' || state.rerollsRemaining <= 0) return state
  return { ...drawAbility(state, random), rerollsRemaining: state.rerollsRemaining - 1 }
}
export function beginGeneration(state: GameState): GameState {
  if (state.screen !== 'draw' || !state.offeredAbilityId) return state
  return { ...state, screen: 'generating', abilityId: state.offeredAbilityId }
}
export function returnToDraw(state: GameState): GameState {
  if (state.screen !== 'generating') return state
  return { ...state, screen: 'draw', abilityId: null }
}

function mechanicAvailable(battle: BattleState, level: CampaignLevel) {
  return level.mechanic.frequency === 'once-per-level' ? !battle.mechanicTriggered : battle.mechanicTriggersThisTurn === 0
}
function conditionMet(battle: BattleState, level: CampaignLevel, cardType?: CardType) {
  const condition = level.mechanic.condition
  switch (condition.type) {
    case 'card-type-is': return cardType === condition.cardType
    case 'turn-progress-at-least': return battle.turnProgress >= (condition.value ?? Infinity)
    case 'shield-at-least': return battle.shield >= (condition.value ?? Infinity)
    case 'ingenuity-at-least': return battle.ingenuity >= (condition.value ?? Infinity)
    case 'cards-played-at-least': return battle.playedThisTurn.length >= (condition.value ?? Infinity)
    case 'turn-number-is': return battle.turn === condition.value
  }
}
function effectText(effect: MechanicEffect) {
  const labels = {
    'gain-progress': `推进 +${effect.amount}`, 'gain-shield': `护盾 +${effect.amount}`, 'gain-ingenuity': `机巧 +${effect.amount}`,
    'discount-next': '下一张付费牌 -1 费', 'take-damage': `生命 -${effect.amount}`,
    'lose-progress': `进度 -${effect.amount}`, 'lose-ingenuity': `机巧 -${effect.amount}`,
  }
  return labels[effect.type]
}
function applyEffects(battle: BattleState, hp: number, effects: MechanicEffect[]) {
  let nextHp = hp
  for (const effect of effects) {
    switch (effect.type) {
      case 'gain-progress': battle.progress = Math.min(battle.target, battle.progress + effect.amount); battle.turnProgress += effect.amount; break
      case 'gain-shield': battle.shield += effect.amount; break
      case 'gain-ingenuity': battle.ingenuity = Math.min(5, battle.ingenuity + effect.amount); break
      case 'discount-next': battle.discountCharges = 1; break
      case 'take-damage': nextHp = Math.max(0, nextHp - effect.amount); break
      case 'lose-progress': battle.progress = Math.max(0, battle.progress - effect.amount); break
      case 'lose-ingenuity': battle.ingenuity = Math.max(0, battle.ingenuity - effect.amount); break
    }
  }
  return nextHp
}
function resolveMechanic(state: GameState, battle: BattleState, trigger: CampaignLevel['mechanic']['trigger'], cardType?: CardType) {
  const level = state.blueprint!.levels[battle.levelIndex]
  if (level.mechanic.trigger !== trigger || !mechanicAvailable(battle, level)) return { hp: state.hp, triggered: false }
  const success = conditionMet(battle, level, cardType)
  if (!success && trigger !== 'end-turn') return { hp: state.hp, triggered: false }
  const effects = success ? level.mechanic.successEffects : level.mechanic.failureEffects
  if (!effects.length) return { hp: state.hp, triggered: false }
  const hp = applyEffects(battle, state.hp, effects)
  battle.mechanicTriggersThisTurn += 1
  if (level.mechanic.frequency === 'once-per-level') battle.mechanicTriggered = true
  battle.logs.push(newLog('mechanic', `${level.mechanic.name}${success ? '触发' : '未满足'}：${effects.map(effectText).join('，')}。`))
  return { hp, triggered: true }
}
function resolveTurnStart(state: GameState): GameState {
  if (!state.battle || !state.blueprint) return state
  const battle = structuredClone(state.battle)
  const result = resolveMechanic(state, battle, 'turn-start')
  if (!result.triggered) return state
  if (result.hp <= 0) return { ...state, hp: 0, battle, screen: 'defeat' }
  if (battle.progress >= battle.target) return completeLevel({ ...state, hp: result.hp, battle }, battle)
  return { ...state, hp: result.hp, battle }
}

export function startChallenge(state: GameState, blueprint: CampaignBlueprint): GameState {
  const abilityId = state.offeredAbilityId ?? state.abilityId
  if (!abilityId || blueprint.abilityId !== abilityId) return state
  const acceptedBlueprint = withCanonicalRuleText(blueprint)
  const deck = createStarterDeck(abilityId, uid)
  const base: GameState = {
    ...state, screen: 'battle', mode: acceptedBlueprint.source, blueprint: acceptedBlueprint, abilityId, abilityGrowth: null, hp: 24, deck,
    results: [], totalCardsPlayed: 0, totalAbilityUses: 0, retryUsed: [false, false, false], rewardsClaimed: [false, false],
    growthClaimed: false, rewardOptions: [], levelEntry: { hp: 24, deck: structuredClone(deck), abilityGrowth: null },
  }
  const withBattle = { ...base, battle: createBattle(base, 0) }
  return resolveTurnStart(withBattle)
}

export function currentIntent(state: GameState, offset = 0) {
  if (!state.blueprint || !state.battle) return null
  const level = state.blueprint.levels[state.battle.levelIndex]
  return level.intents[(state.battle.intentIndex + offset) % level.intents.length]
}

export function cardPlayability(state: GameState, cardUid: string): CardPlayability {
  if (state.screen !== 'battle' || !state.battle) return { playable: false, reason: '当前不在行动阶段。', cost: 0 }
  const instance = instanceByUid(state.deck, cardUid)
  if (!instance || !state.battle.hand.includes(cardUid)) return { playable: false, reason: '这张牌已不在手中。', cost: 0 }
  const definition = getCard(instance.cardId)
  const baseCost = instance.upgraded && definition.upgradedCost !== undefined ? definition.upgradedCost : definition.cost
  const activeFree = baseCost > 0 && state.battle.activeDiscountReady
  const reduced = baseCost > 0 && !activeFree && state.battle.discountCharges > 0
  const cost = activeFree ? 0 : reduced ? Math.max(1, baseCost - 1) : baseCost
  const badge = activeFree ? '主动失重 · 费用变 0' : reduced ? '减重 · 费用 -1' : undefined
  if (cost > state.battle.energy) return { playable: false, reason: `需要 ${cost} 点能量，当前只有 ${state.battle.energy} 点。`, cost, badge }
  return { playable: true, reason: '', cost, badge }
}

export function abilityUsability(state: GameState): AbilityUsability {
  if (state.screen !== 'battle' || !state.battle || !state.abilityId) return { usable: false, reason: '当前不能使用能力。', preview: '' }
  const battle = state.battle
  if (battle.activeUsesRemaining <= 0) return { usable: false, reason: '本关主动次数已用完。', preview: '剩余 0 次' }
  if (state.abilityId === 'undo-three-seconds') {
    const card = battle.recordedCardUid ? instanceByUid(state.deck, battle.recordedCardUid) : null
    const inDiscard = !!card && battle.discardPile.includes(card.uid)
    const preview = card ? `可撤回：${getCard(card.cardId).name}，返还 1 点能量` : '本回合还没有记录牌'
    if (!card || !inDiscard) return { usable: false, reason: '先打出一张非消耗付费牌。', preview }
    if (battle.hand.length >= 4) return { usable: false, reason: '手牌已满，先打出一张牌。', preview }
    return { usable: true, reason: '', preview }
  }
  if (state.abilityId === 'lighten') {
    if (battle.activeDiscountReady || battle.discountCharges > 0) return { usable: false, reason: '已有减费等待使用，不能叠加。', preview: '下一张付费牌费用变为 0' }
    return { usable: true, reason: '', preview: '下一张付费牌费用变为 0' }
  }
  const top = [...battle.drawPile].slice(-2).reverse().map((uidValue) => getCard(instanceByUid(state.deck, uidValue)!.cardId).name)
  if (top.length < 2) return { usable: false, reason: '抽牌堆不足两张，暂时无法调整。', preview: top.length ? `牌堆顶：${top[0]}` : '抽牌堆为空' }
  return { usable: true, reason: '', preview: `交换：${top.join(' ↔ ')}` }
}

export function activateAbility(state: GameState): GameState {
  const usable = abilityUsability(state)
  if (!usable.usable || !state.battle || !state.abilityId) return state
  const battle = structuredClone(state.battle)
  const ability = getAbility(state.abilityId)!
  if (state.abilityId === 'undo-three-seconds') {
    const cardUid = battle.recordedCardUid!
    battle.discardPile = battle.discardPile.filter((value) => value !== cardUid)
    battle.hand.push(cardUid)
    battle.energy = Math.min(3, battle.energy + 1)
    battle.reclaimedCardUid = cardUid
    battle.recordedCardUid = null
  } else if (state.abilityId === 'lighten') {
    battle.activeDiscountReady = true
  } else {
    const last = battle.drawPile.length - 1
    ;[battle.drawPile[last], battle.drawPile[last - 1]] = [battle.drawPile[last - 1], battle.drawPile[last]]
    battle.ingenuity = Math.min(5, battle.ingenuity + (state.abilityGrowth === 'talk-editor' ? 2 : 1))
  }
  battle.activeUsesRemaining -= 1
  battle.logs.push(newLog('ability', `使用主动能力「${ability.activeName}」：${usable.preview}。`))
  return { ...state, battle, totalAbilityUses: state.totalAbilityUses + 1 }
}

function addProgress(battle: BattleState, amount: number) {
  battle.progress = Math.min(battle.target, battle.progress + amount)
  battle.turnProgress += amount
}
function completeLevel(state: GameState, battle: BattleState): GameState {
  const level = state.blueprint!.levels[battle.levelIndex]
  const previousCards = state.results.reduce((sum, item) => sum + item.cardsPlayed, 0)
  const previousUses = state.results.reduce((sum, item) => sum + item.abilityUses, 0)
  const cardLogs = battle.logs.filter((item) => item.kind === 'card' || item.kind === 'ability')
  const result: LevelResult = {
    levelId: level.id, levelName: level.name, success: true, turns: battle.turn, hpAfter: state.hp,
    cardsPlayed: state.totalCardsPlayed - previousCards, abilityUses: state.totalAbilityUses - previousUses,
    excerpt: cardLogs.at(-1)?.text ?? '靠一套干净的连招完成目标。',
  }
  const results = [...state.results, result]
  if (battle.levelIndex >= 2) return { ...state, screen: 'summary', battle, results }
  return { ...state, screen: 'reward-card', battle, results, rewardOptions: level.rewardCardIds }
}

export function playCard(state: GameState, cardUid: string): GameState {
  if (state.screen !== 'battle' || !state.battle || !state.abilityId) return state
  const playable = cardPlayability(state, cardUid)
  if (!playable.playable) return state
  const instance = instanceByUid(state.deck, cardUid)
  if (!instance) return state
  const definition = getCard(instance.cardId)
  const battle = structuredClone(state.battle)
  const hadRecord = !!battle.recordedCardUid
  const consumedDiscount = definition.cost > 0 && (battle.activeDiscountReady || battle.discountCharges > 0)
  battle.hand = battle.hand.filter((value) => value !== cardUid)
  battle.energy -= playable.cost
  if (definition.cost > 0 && battle.activeDiscountReady) battle.activeDiscountReady = false
  else if (definition.cost > 0 && battle.discountCharges > 0) battle.discountCharges = 0
  let progress = 0; let shield = 0; let detail = ''

  switch (definition.id) {
    case 'quick-fix': progress = instance.upgraded ? 4 : 3; break
    case 'brace': shield = instance.upgraded ? 7 : 5; break
    case 'observe': battle.ingenuity = Math.min(5, battle.ingenuity + (instance.upgraded ? 2 : 1)); detail = '积累机巧。'; break
    case 'clever-combo': progress = instance.upgraded ? 3 : 2; if (battle.ingenuity >= 1) { battle.ingenuity -= 1; progress += 3; detail = '消耗 1 点机巧触发额外推进。' } break
    case 'secure-push': progress = instance.upgraded ? 6 : 5; shield = instance.upgraded ? 4 : 3; break
    case 'undo-recall': progress = instance.upgraded ? 3 : 2; if (hadRecord) shield = instance.upgraded ? 4 : 3; break
    case 'undo-savepoint': shield = instance.upgraded ? 5 : 3; battle.ingenuity = Math.min(5, battle.ingenuity + (instance.upgraded ? 2 : 1)); break
    case 'undo-rebound': progress = (instance.upgraded ? 5 : 4) + (battle.lastThreatDamage > 0 ? 2 : 0); shield = instance.upgraded ? 5 : 4; break
    case 'light-feather': shield = instance.upgraded ? 3 : 2; battle.ingenuity = Math.min(5, battle.ingenuity + (instance.upgraded ? 2 : 1)); detail = '启动轻装连拍。'; break
    case 'light-lift': progress = 6 + (playable.cost <= 1 ? 2 : 0); if (playable.cost <= 1) detail = '低费条件触发，额外推进 2 点。'; break
    case 'light-balance': progress = instance.upgraded ? 3 : 2; shield = instance.upgraded ? 4 : 3; if (battle.energy >= 1) { battle.ingenuity = Math.min(5, battle.ingenuity + 1); detail = '保留能量，获得 1 点机巧。' } break
    case 'talk-ask': shield = instance.upgraded ? 3 : 2; battle.ingenuity = Math.min(5, battle.ingenuity + (instance.upgraded ? 2 : 1)); detail = '补全一段局部证词。'; break
    case 'talk-crosscheck': progress = instance.upgraded ? 3 : 2; if (battle.ingenuity >= 2) { battle.ingenuity -= 2; progress += instance.upgraded ? 6 : 5; detail = '消耗 2 点机巧拼出完整证词。' } break
    case 'talk-testimony': { shield = instance.upgraded ? 6 : 4; const intent = currentIntent({ ...state, battle }); if (intent && intent.kind !== 'damage') { progress = instance.upgraded ? 4 : 3; detail = '特殊意图露出破绽。' } break }
  }

  if (state.abilityId === 'undo-three-seconds' && !battle.passiveTriggeredThisTurn && playable.cost >= 1 && !definition.exhaust) {
    battle.recordedCardUid = cardUid; battle.passiveTriggeredThisTurn = true; detail = `${detail}${detail ? ' ' : ''}已记录，可用主动能力收回。`
  }
  if (state.abilityId === 'lighten' && !battle.passiveTriggeredThisTurn && playable.cost <= 1) {
    battle.discountCharges = 1; battle.passiveTriggeredThisTurn = true; detail = `${detail}${detail ? ' ' : ''}获得 1 层减重。`
  }
  if (consumedDiscount && state.abilityGrowth === 'light-momentum' && !battle.growthTriggeredThisTurn) {
    battle.ingenuity = Math.min(5, battle.ingenuity + 1); battle.growthTriggeredThisTurn = true; detail = `${detail}${detail ? ' ' : ''}借势获得 1 点机巧。`
  }
  if (battle.reclaimedCardUid === cardUid) {
    if (state.abilityGrowth === 'undo-cushion') shield += 3
    battle.reclaimedCardUid = null
  }
  addProgress(battle, progress)
  battle.shield += shield
  battle.playedThisTurn.push(cardUid)
  if (definition.exhaust) battle.exhaustPile.push(cardUid); else battle.discardPile.push(cardUid)
  const effects = [progress ? `推进 ${progress}` : '', shield ? `护盾 +${shield}` : '', detail].filter(Boolean).join('，')
  battle.logs.push(newLog('card', `打出「${definition.name}」：${effects || '效果已结算'}。`))
  let hp = state.hp
  const mechanic = resolveMechanic({ ...state, battle }, battle, 'after-card', definition.type)
  if (mechanic.triggered) hp = mechanic.hp
  const next = { ...state, hp, battle, totalCardsPlayed: state.totalCardsPlayed + 1 }
  if (hp <= 0) return { ...next, screen: 'defeat' }
  return battle.progress >= battle.target ? completeLevel(next, battle) : next
}

export function endTurn(state: GameState): GameState {
  if (state.screen !== 'battle' || !state.battle || !state.abilityId || !state.blueprint) return state
  const battle = structuredClone(state.battle)
  let hp = state.hp
  const mechanic = resolveMechanic({ ...state, battle }, battle, 'end-turn')
  if (mechanic.triggered) hp = mechanic.hp
  if (hp <= 0) return { ...state, hp: 0, battle, screen: 'defeat' }
  if (battle.progress >= battle.target) return completeLevel({ ...state, hp, battle }, battle)

  const intent = currentIntent({ ...state, battle })
  if (!intent) return state
  let rawDamage = 0; let threatText = ''
  if (intent.kind === 'charge') {
    battle.chargedBonus += intent.amount; threatText = `威胁完成蓄力：下一次攻击额外 +${intent.amount}。`
  } else if (intent.kind === 'interrupt' && battle.turnProgress >= (intent.breakProgress ?? Infinity)) {
    threatText = `本回合推进 ${battle.turnProgress} 点，成功打断「${intent.title}」。`
  } else {
    rawDamage = intent.amount + battle.chargedBonus; battle.chargedBonus = 0; threatText = `「${intent.title}」发动，造成 ${rawDamage} 点伤害。`
  }
  const absorbed = Math.min(battle.shield, rawDamage)
  const damage = Math.max(0, rawDamage - absorbed)
  hp = Math.max(0, hp - damage)
  if (rawDamage) threatText += absorbed ? `护盾抵消 ${absorbed}，实际失去 ${damage} 点生命。` : `实际失去 ${damage} 点生命。`
  battle.logs.push(newLog('threat', threatText))
  battle.lastThreatDamage = damage
  if (hp <= 0) return { ...state, hp, battle, screen: 'defeat' }

  battle.discardPile.push(...battle.hand)
  const seed = hashString(`${state.runId}:${state.blueprint.seed}:${battle.levelIndex}:${battle.turn}:${state.totalCardsPlayed}`)
  const drawn = drawHand(state.deck, battle.drawPile, battle.discardPile, seed, false)
  battle.hand = drawn.hand; battle.drawPile = drawn.drawPile; battle.discardPile = drawn.discardPile
  battle.turn += 1; battle.energy = 3; battle.shield = 0; battle.turnProgress = 0; battle.playedThisTurn = []
  battle.intentIndex += 1; battle.activeDiscountReady = false; battle.passiveTriggeredThisTurn = false; battle.growthTriggeredThisTurn = false
  battle.recordedCardUid = null; battle.reclaimedCardUid = null; battle.mechanicTriggersThisTurn = 0
  if (!(state.abilityId === 'lighten' && state.abilityGrowth === 'light-carry')) battle.discountCharges = 0
  return resolveTurnStart({ ...state, hp, battle })
}

export function chooseCardReward(state: GameState, cardId: string | null): GameState {
  if (state.screen !== 'reward-card' || !state.battle || state.battle.levelIndex >= 2) return state
  const levelIndex = state.battle.levelIndex as 0 | 1
  if (state.rewardsClaimed[levelIndex] || (cardId && !state.rewardOptions.includes(cardId))) return state
  const deck = cardId ? [...state.deck, { uid: uid(), cardId, upgraded: false }] : state.deck
  const rewardsClaimed: [boolean, boolean] = [...state.rewardsClaimed]
  rewardsClaimed[levelIndex] = true
  const screen = !state.growthClaimed && levelIndex === 0 ? 'reward-growth' : 'reward-rest'
  return { ...state, deck, rewardsClaimed, screen, rewardOptions: [] }
}

export function chooseAbilityGrowth(state: GameState, growthId: AbilityGrowthId): GameState {
  if (state.screen !== 'reward-growth' || !state.abilityId || state.growthClaimed) return state
  const allowed = getAbility(state.abilityId)!.growths.some((growth) => growth.id === growthId)
  if (!allowed) return state
  return { ...state, abilityGrowth: growthId, growthClaimed: true, screen: 'reward-rest' }
}

function startNextLevel(state: GameState, deck: CardInstance[], hp: number) {
  const nextIndex = (state.battle?.levelIndex ?? 0) + 1
  const base = { ...state, hp, deck, screen: 'battle' as const, levelEntry: { hp, deck: structuredClone(deck), abilityGrowth: state.abilityGrowth } }
  const withBattle = { ...base, battle: createBattle(base, nextIndex) }
  return resolveTurnStart(withBattle)
}
export function chooseHeal(state: GameState): GameState {
  if (state.screen !== 'reward-rest') return state
  return startNextLevel(state, state.deck, Math.min(state.maxHp, state.hp + 6))
}
export function chooseUpgrade(state: GameState, cardUid: string): GameState {
  if (state.screen !== 'reward-rest') return state
  const target = state.deck.find((card) => card.uid === cardUid)
  if (!target || target.upgraded) return state
  const deck = state.deck.map((card) => card.uid === cardUid ? { ...card, upgraded: true } : card)
  return startNextLevel(state, deck, state.hp)
}
export function retryCurrentLevel(state: GameState): GameState {
  if (state.screen !== 'defeat' || !state.battle || !state.levelEntry || state.retryUsed[state.battle.levelIndex]) return state
  const retryUsed: [boolean, boolean, boolean] = [...state.retryUsed]
  retryUsed[state.battle.levelIndex] = true
  const base = { ...state, hp: state.levelEntry.hp, deck: structuredClone(state.levelEntry.deck), abilityGrowth: state.levelEntry.abilityGrowth, retryUsed, screen: 'battle' as const }
  return resolveTurnStart({ ...base, battle: createBattle(base, state.battle.levelIndex) })
}
export function finishDefeat(state: GameState): GameState {
  if (state.screen !== 'defeat' || !state.battle || !state.blueprint) return state
  const level = state.blueprint.levels[state.battle.levelIndex]
  const previousCards = state.results.reduce((sum, item) => sum + item.cardsPlayed, 0)
  const previousUses = state.results.reduce((sum, item) => sum + item.abilityUses, 0)
  const result: LevelResult = {
    levelId: level.id, levelName: level.name, success: false, turns: state.battle.turn, hpAfter: 0,
    cardsPlayed: state.totalCardsPlayed - previousCards, abilityUses: state.totalAbilityUses - previousUses, excerpt: '局面失控，计划停在这一关。',
  }
  return { ...state, results: [...state.results, result], screen: 'summary' }
}
export function appendAiNarration(state: GameState, runId: string, levelIndex: number, text: string) {
  if (state.runId !== runId || state.screen !== 'battle' || state.battle?.levelIndex !== levelIndex) return state
  const battle = structuredClone(state.battle)
  battle.logs.push(newLog('ai', text.slice(0, 160)))
  return { ...state, battle }
}
export function parseSavedGame(value: unknown): GameState | null {
  const parsed = gameStateSchema.safeParse(value)
  if (!parsed.success) return null
  return parsed.data.blueprint ? { ...parsed.data, blueprint: withCanonicalRuleText(parsed.data.blueprint) } : parsed.data
}
