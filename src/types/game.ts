export type AbilityId = 'undo-three-seconds' | 'lighten' | 'object-talk'
export type AbilityGrowthId =
  | 'undo-cushion' | 'undo-buffer'
  | 'light-carry' | 'light-momentum'
  | 'talk-context' | 'talk-editor'
export type CampaignMode = 'ai' | 'offline-example'
export type GameScreen = 'home' | 'draw' | 'generating' | 'battle' | 'reward-card' | 'reward-growth' | 'reward-rest' | 'defeat' | 'summary'
export type CardType = '推进' | '防御' | '机巧' | '能力'
export type ThreatKind = 'damage' | 'charge' | 'interrupt'
export type MechanicTrigger = 'after-card' | 'end-turn' | 'turn-start'
export type MechanicConditionType =
  | 'card-type-is' | 'turn-progress-at-least' | 'shield-at-least'
  | 'ingenuity-at-least' | 'cards-played-at-least' | 'turn-number-is'
export type MechanicEffectType =
  | 'gain-progress' | 'gain-shield' | 'gain-ingenuity' | 'discount-next'
  | 'take-damage' | 'lose-progress' | 'lose-ingenuity'

export interface CardDefinition {
  id: string
  name: string
  type: CardType
  abilityId?: AbilityId
  cost: number
  upgradedCost?: number
  description: string
  upgradedDescription: string
  flavor: string
  exhaust?: boolean
  tags: string[]
}

export interface CardInstance { uid: string; cardId: string; upgraded: boolean }

export interface ThreatIntent {
  kind: ThreatKind
  amount: number
  breakProgress?: number
  title: string
  description: string
}

export interface MechanicCondition {
  type: MechanicConditionType
  value?: number
  cardType?: CardType
}

export interface MechanicEffect {
  type: MechanicEffectType
  amount: number
  duration: 'instant' | 'until-used'
}

export interface LevelMechanic {
  id: string
  name: string
  summary: string
  trigger: MechanicTrigger
  condition: MechanicCondition
  successEffects: MechanicEffect[]
  failureEffects: MechanicEffect[]
  frequency: 'once-per-turn' | 'once-per-level'
}

export interface StrategyNote {
  route: string
  benefit: string
  cost: string
  abilityUse: string
  cardCoverage: string[]
}

export interface CampaignLevel {
  id: string
  name: string
  chapter: string
  scene: string
  goal: string
  target: number
  mechanic: LevelMechanic
  intents: ThreatIntent[]
  abilityHook: 'replay-window' | 'discount-chain' | 'planning-window'
  abilityOpportunity: string
  strategyNotes: StrategyNote[]
  rewardCardIds: string[]
}

export interface CampaignBlueprint {
  schemaVersion: 1
  source: CampaignMode
  id: string
  seed: string
  abilityId: AbilityId
  title: string
  premise: string
  levels: [CampaignLevel, CampaignLevel, CampaignLevel]
  endingFacts: string[]
  generatedAt: number
}

export interface AbilityGrowth {
  id: AbilityGrowthId
  name: string
  description: string
  tradeoff: string
}

export interface AbilityDefinition {
  id: AbilityId
  name: string
  emoji: string
  oneLiner: string
  passiveName: string
  passiveRule: string
  activeName: string
  activeRule: string
  activeUses: number
  style: string
  exclusiveCards: [string, string, string]
  growths: [AbilityGrowth, AbilityGrowth]
}

export interface BattleLog { id: string; kind: 'card' | 'threat' | 'system' | 'ai' | 'ability' | 'mechanic'; text: string }

export interface BattleState {
  levelIndex: number
  progress: number
  target: number
  turn: number
  energy: number
  shield: number
  ingenuity: number
  hand: string[]
  drawPile: string[]
  discardPile: string[]
  exhaustPile: string[]
  playedThisTurn: string[]
  turnProgress: number
  intentIndex: number
  chargedBonus: number
  discountCharges: number
  activeDiscountReady: boolean
  activeUsesRemaining: number
  passiveTriggeredThisTurn: boolean
  growthTriggeredThisTurn: boolean
  recordedCardUid: string | null
  reclaimedCardUid: string | null
  mechanicTriggersThisTurn: number
  mechanicTriggered: boolean
  forecastTurns: number
  lastThreatDamage: number
  sceneText: string
  logs: BattleLog[]
}

export interface LevelEntrySnapshot { hp: number; deck: CardInstance[]; abilityGrowth: AbilityGrowthId | null }

export interface LevelResult {
  levelId: string
  levelName: string
  success: boolean
  turns: number
  hpAfter: number
  cardsPlayed: number
  abilityUses: number
  excerpt: string
}

export interface GameState {
  version: 3
  screen: GameScreen
  runId: string
  mode: CampaignMode | null
  blueprint: CampaignBlueprint | null
  abilityId: AbilityId | null
  abilityGrowth: AbilityGrowthId | null
  offeredAbilityId: AbilityId | null
  rerollsRemaining: number
  hp: number
  maxHp: number
  deck: CardInstance[]
  battle: BattleState | null
  levelEntry: LevelEntrySnapshot | null
  retryUsed: [boolean, boolean, boolean]
  rewardsClaimed: [boolean, boolean]
  growthClaimed: boolean
  rewardOptions: string[]
  results: LevelResult[]
  totalCardsPlayed: number
  totalAbilityUses: number
  startedAt: number
}

export interface CardPlayability { playable: boolean; reason: string; cost: number; badge?: string }
export interface AbilityUsability { usable: boolean; reason: string; preview: string }

export interface ModelConfig {
  provider: 'deepseek' | 'custom'
  baseUrl: string
  model: string
  useJsonMode: boolean
  rememberKey: boolean
}

export interface UiPreferences { abilityExpanded: boolean; soundEnabled: boolean }

export interface ConnectionDiagnostic {
  ok: boolean
  host: string
  path: string
  model: string
  httpStatus?: number
  durationMs: number
  finishReason?: string | null
  contentLength?: number
  summary: string
}
