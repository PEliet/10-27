import { z } from 'zod'
import { CARD_DEFINITIONS, starterCardIds } from '../data/cards'
import type { AbilityId, CampaignBlueprint, LevelMechanic, MechanicEffect, MechanicEffectType, ThreatIntent } from '../types/game'

const abilityIdSchema = z.enum(['undo-three-seconds', 'lighten', 'object-talk'])
const cardTypeSchema = z.enum(['推进', '防御', '机巧', '能力'])
const effectTypeSchema = z.enum([
  'gain-progress', 'gain-shield', 'gain-ingenuity', 'discount-next',
  'take-damage', 'lose-progress', 'lose-ingenuity',
])

const effectSchema = z.object({
  type: effectTypeSchema,
  amount: z.number().int().min(1).max(4),
  duration: z.enum(['instant', 'until-used']),
}).superRefine((effect, context) => {
  const limits: Record<MechanicEffectType, number> = {
    'gain-progress': 3, 'gain-shield': 4, 'gain-ingenuity': 2, 'discount-next': 1,
    'take-damage': 3, 'lose-progress': 2, 'lose-ingenuity': 2,
  }
  if (effect.amount > limits[effect.type]) context.addIssue({ code: z.ZodIssueCode.custom, message: `${effect.type} 超出上限 ${limits[effect.type]}` })
  if (effect.type === 'discount-next' && effect.duration !== 'until-used') context.addIssue({ code: z.ZodIssueCode.custom, message: 'discount-next 的持续时间必须是 until-used' })
  if (effect.type !== 'discount-next' && effect.duration !== 'instant') context.addIssue({ code: z.ZodIssueCode.custom, message: `${effect.type} 的持续时间必须是 instant` })
})

const conditionSchema = z.object({
  type: z.enum(['card-type-is', 'turn-progress-at-least', 'shield-at-least', 'ingenuity-at-least', 'cards-played-at-least', 'turn-number-is']),
  value: z.number().int().min(1).max(8).optional(),
  cardType: cardTypeSchema.optional(),
}).superRefine((condition, context) => {
  if (condition.type === 'card-type-is' && !condition.cardType) context.addIssue({ code: z.ZodIssueCode.custom, message: 'card-type-is 必须提供 cardType' })
  if (condition.type !== 'card-type-is' && condition.value === undefined) context.addIssue({ code: z.ZodIssueCode.custom, message: `${condition.type} 必须提供 value` })
})

const mechanicSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,40}$/),
  name: z.string().trim().min(1).max(24),
  // summary 会在接纳蓝图时由结构化规则重建，只要求模型提供非空占位文本。
  summary: z.string().trim().min(1).max(240),
  trigger: z.enum(['after-card', 'end-turn', 'turn-start']),
  condition: conditionSchema,
  successEffects: z.array(effectSchema).min(1).max(2),
  failureEffects: z.array(effectSchema).max(1),
  frequency: z.enum(['once-per-turn', 'once-per-level']),
}).superRefine((mechanic, context) => {
  const condition = mechanic.condition.type
  if (mechanic.trigger === 'after-card' && condition !== 'card-type-is') context.addIssue({ code: z.ZodIssueCode.custom, message: 'after-card 只支持 card-type-is 条件' })
  if (mechanic.trigger === 'turn-start' && condition !== 'turn-number-is') context.addIssue({ code: z.ZodIssueCode.custom, message: 'turn-start 只支持 turn-number-is 条件' })
  if (mechanic.trigger === 'end-turn' && ['card-type-is', 'turn-number-is'].includes(condition)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'end-turn 不支持此条件' })
  if (mechanic.trigger !== 'end-turn' && mechanic.failureEffects.length) context.addIssue({ code: z.ZodIssueCode.custom, message: '只有 end-turn 机制可以设置失败效果' })
})

const intentSchema = z.object({
  kind: z.enum(['damage', 'charge', 'interrupt']),
  amount: z.number().int().min(0).max(9),
  breakProgress: z.number().int().min(3).max(7).optional(),
  title: z.string().trim().min(1).max(24),
  // description 同样会由 kind/amount/breakProgress 生成规范文本。
  description: z.string().trim().min(1).max(240),
}).superRefine((intent, context) => {
  if (intent.kind === 'interrupt' && intent.breakProgress === undefined) context.addIssue({ code: z.ZodIssueCode.custom, message: 'interrupt 必须提供 breakProgress' })
  if (intent.kind !== 'interrupt' && intent.breakProgress !== undefined) context.addIssue({ code: z.ZodIssueCode.custom, message: '非 interrupt 不得提供 breakProgress' })
  if (intent.kind === 'charge' && (intent.amount < 2 || intent.amount > 4)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'charge 数值必须在 2—4' })
  if (intent.kind !== 'charge' && (intent.amount < 3 || intent.amount > 9)) context.addIssue({ code: z.ZodIssueCode.custom, message: '伤害数值必须在 3—9' })
})

const strategySchema = z.object({
  route: z.string().trim().min(2).max(100), benefit: z.string().trim().min(2).max(160), cost: z.string().trim().min(2).max(160),
  abilityUse: z.string().trim().min(2).max(240), cardCoverage: z.array(z.string()).min(2).max(4),
})

const levelSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,48}$/),
  name: z.string().trim().min(1).max(32), chapter: z.string().trim().min(2).max(32),
  // 60—100 字是文风目标，不是可执行规则。短而具体的场景不应让整局蓝图报废；
  // 仍保留 24 字硬下限，拦截空标题或一句话占位内容。
  scene: z.string().trim().min(24).max(200), goal: z.string().trim().min(2).max(50), target: z.number().int().min(10).max(28),
  mechanic: mechanicSchema, intents: z.array(intentSchema).min(3).max(5),
  abilityHook: z.enum(['replay-window', 'discount-chain', 'planning-window']),
  abilityOpportunity: z.string().trim().min(4).max(240), strategyNotes: z.array(strategySchema).min(2).max(3),
  rewardCardIds: z.array(z.string()).max(3),
})

export const campaignBlueprintSchema = z.object({
  schemaVersion: z.literal(1), source: z.enum(['ai', 'offline-example']),
  id: z.string().min(3).max(80), seed: z.string().min(2).max(80), abilityId: abilityIdSchema,
  title: z.string().trim().min(2).max(40), premise: z.string().trim().min(6).max(200),
  levels: z.tuple([levelSchema, levelSchema, levelSchema]), endingFacts: z.array(z.string().trim().min(2).max(120)).min(2).max(5),
  generatedAt: z.number().int().nonnegative(),
})

const EXPECTED_HOOK: Record<AbilityId, CampaignBlueprint['levels'][number]['abilityHook']> = {
  'undo-three-seconds': 'replay-window', lighten: 'discount-chain', 'object-talk': 'planning-window',
}
const BANNED_PHRASES = [
  '命运的齿轮', '真正的挑战才刚刚开始', '空气中弥漫着', '你能否', '一场关于',
  '勇敢的冒险者', '智慧与勇气', '未知的旅程', '作为AI', '根据你的选择', '系统将为你生成', '你不禁感到',
]

export interface BlueprintCheck { blueprint: CampaignBlueprint | null; errors: string[] }

function describeEffect(effect: MechanicEffect) {
  const descriptions: Record<MechanicEffectType, string> = {
    'gain-progress': `推进 ${effect.amount} 点`,
    'gain-shield': `获得 ${effect.amount} 点护盾`,
    'gain-ingenuity': `获得 ${effect.amount} 点机巧`,
    'discount-next': `下一张付费牌费用减少 ${effect.amount}，最低为 1`,
    'take-damage': `受到 ${effect.amount} 点伤害`,
    'lose-progress': `失去 ${effect.amount} 点进度`,
    'lose-ingenuity': `失去 ${effect.amount} 点机巧`,
  }
  return descriptions[effect.type]
}

export function describeMechanic(mechanic: LevelMechanic) {
  const condition = mechanic.condition
  let prefix = ''
  switch (condition.type) {
    case 'card-type-is': prefix = `${mechanic.frequency === 'once-per-turn' ? '每回合首次' : '本关首次'}打出${condition.cardType}牌时`; break
    case 'turn-progress-at-least': prefix = `${mechanic.frequency === 'once-per-turn' ? '每回合结束时' : '本关首次在回合结束时'}，若本回合推进至少 ${condition.value} 点`; break
    case 'shield-at-least': prefix = `${mechanic.frequency === 'once-per-turn' ? '每回合结束时' : '本关首次在回合结束时'}，若护盾至少 ${condition.value} 点`; break
    case 'ingenuity-at-least': prefix = `${mechanic.frequency === 'once-per-turn' ? '每回合结束时' : '本关首次在回合结束时'}，若机巧至少 ${condition.value} 点`; break
    case 'cards-played-at-least': prefix = `${mechanic.frequency === 'once-per-turn' ? '每回合结束时' : '本关首次在回合结束时'}，若本回合打出至少 ${condition.value} 张牌`; break
    case 'turn-number-is': prefix = `第 ${condition.value} 回合开始时`; break
  }
  const success = mechanic.successEffects.map(describeEffect).join('，')
  const failure = mechanic.failureEffects.length ? `；否则${mechanic.failureEffects.map(describeEffect).join('，')}` : ''
  return `${prefix}：${success}${failure}。`
}

export function describeIntent(intent: ThreatIntent) {
  if (intent.kind === 'charge') return `本回合不攻击；下一次攻击额外造成 ${intent.amount} 点伤害。`
  if (intent.kind === 'interrupt') return `造成 ${intent.amount} 点伤害；本回合推进至少 ${intent.breakProgress} 点即可打断。`
  return `结束回合后造成 ${intent.amount} 点伤害。`
}

export function withCanonicalRuleText(blueprint: CampaignBlueprint): CampaignBlueprint {
  const levels = blueprint.levels.map((level) => ({
    ...level,
    mechanic: { ...level.mechanic, summary: describeMechanic(level.mechanic) },
    intents: level.intents.map((intent) => ({ ...intent, description: describeIntent(intent) })),
  })) as CampaignBlueprint['levels']
  return { ...blueprint, levels }
}

export function validateBlueprint(value: unknown, expectedAbility?: AbilityId): BlueprintCheck {
  const parsed = campaignBlueprintSchema.safeParse(value)
  if (!parsed.success) {
    return {
      blueprint: null,
      errors: parsed.error.issues.slice(0, 12).map((issue) => `${issue.path.join('.') || 'blueprint'}：${issue.message}`),
    }
  }
  const blueprint = parsed.data
  const errors: string[] = []
  if (expectedAbility && blueprint.abilityId !== expectedAbility) errors.push(`能力必须是 ${expectedAbility}`)
  const expectedHook = EXPECTED_HOOK[blueprint.abilityId]
  const targetRanges = [[11, 14], [16, 20], [21, 26]] as const
  const allowedCards = new Set(starterCardIds(blueprint.abilityId))
  const rewardableCards = new Set(CARD_DEFINITIONS.filter((card) => !card.abilityId || card.abilityId === blueprint.abilityId).map((card) => card.id))
  const ids = new Set<string>()
  const mechanics = new Set<string>()

  for (const phrase of BANNED_PHRASES) {
    if ([blueprint.title, blueprint.premise, ...blueprint.levels.flatMap((level) => [level.scene, level.goal])].some((text) => text.includes(phrase))) errors.push(`文案包含禁用套话「${phrase}」`)
  }

  blueprint.levels.forEach((level, index) => {
    const [min, max] = targetRanges[index]
    if (level.target < min || level.target > max) errors.push(`第 ${index + 1} 关目标必须在 ${min}—${max}`)
    if (ids.has(level.id)) errors.push(`关卡 id 重复：${level.id}`)
    ids.add(level.id)
    if (mechanics.has(level.mechanic.id)) errors.push(`每关应有不同机制 id：${level.mechanic.id}`)
    mechanics.add(level.mechanic.id)
    if (level.abilityHook !== expectedHook) errors.push(`第 ${index + 1} 关能力互动必须使用 ${expectedHook}`)
    if (/每回合|造成\s*\d|获得\s*\d+\s*点?(?:护盾|进度|机巧)|费用\s*(?:增加|减少|[-+]\d)|触发.{0,8}(?:效果|规则)/.test(level.scene)) errors.push(`第 ${index + 1} 关故事场景疑似夹带可执行规则，请只放在 mechanic 或 intents 字段`)
    if (index === 0 && level.intents.some((intent) => intent.kind !== 'damage')) errors.push('第一关只允许基础伤害意图，先教学能力核心')
    if (index < 2 && level.rewardCardIds.length !== 3) errors.push(`第 ${index + 1} 关必须提供 3 个关间卡牌候选`)
    if (index === 2 && level.rewardCardIds.length !== 0) errors.push('第三关结束后不再提供卡牌奖励')
    for (const cardId of level.rewardCardIds) {
      if (!rewardableCards.has(cardId)) errors.push(`奖励引用了不可用卡牌：${cardId}`)
    }
    for (const note of level.strategyNotes) {
      for (const cardId of note.cardCoverage) {
        if (!allowedCards.has(cardId)) errors.push(`第 ${index + 1} 关策略引用了尚不可用卡牌：${cardId}`)
      }
    }
    level.rewardCardIds.forEach((cardId) => allowedCards.add(cardId))
  })
  if (!(blueprint.levels[0].target < blueprint.levels[1].target && blueprint.levels[1].target < blueprint.levels[2].target)) errors.push('三关目标必须严格递增')
  return { blueprint: errors.length ? null : withCanonicalRuleText(blueprint), errors }
}

export function toAcceptedBlueprint(value: CampaignBlueprint, source: CampaignBlueprint['source'], seed: string): CampaignBlueprint {
  return { ...value, source, seed, id: `${source}-${Date.now().toString(36)}`, generatedAt: Date.now() }
}
