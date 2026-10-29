import type { AbilityId, CardDefinition, CardInstance } from '../types/game'

export const CARD_DEFINITIONS: CardDefinition[] = [
  { id: 'quick-fix', name: '顺手推进', type: '推进', cost: 1, description: '推进 3 点。', upgradedDescription: '推进 4 点。', flavor: '先把局面往前推一点。', tags: ['basic-progress'] },
  { id: 'brace', name: '先稳住', type: '防御', cost: 1, description: '获得 5 点护盾。', upgradedDescription: '获得 7 点护盾。', flavor: '能赢的前提是还站着。', tags: ['defense'] },
  { id: 'observe', name: '歪招观察', type: '机巧', cost: 0, description: '获得 1 点机巧；本关移除。', upgradedDescription: '获得 2 点机巧；本关移除。', flavor: '看起来没动，其实脑子在施工。', exhaust: true, tags: ['ingenuity'] },
  { id: 'clever-combo', name: '机巧连用', type: '机巧', cost: 1, description: '推进 2 点；若有机巧，消耗 1 点并额外推进 3 点。', upgradedDescription: '推进 3 点；若有机巧，消耗 1 点并额外推进 3 点。', flavor: '准备过的歪招比较像正解。', tags: ['progress', 'ingenuity-spend'] },
  { id: 'secure-push', name: '稳中求进', type: '推进', cost: 2, description: '推进 5 点并获得 3 点护盾。', upgradedDescription: '推进 6 点并获得 4 点护盾。', flavor: '一手推局面，一手扶住自己。', tags: ['progress', 'defense'] },
  { id: 'undo-recall', name: '回声草稿', type: '能力', abilityId: 'undo-three-seconds', cost: 1, description: '推进 2 点；若本回合已有记录牌，获得 3 点护盾。', upgradedDescription: '推进 3 点；若本回合已有记录牌，获得 4 点护盾。', flavor: '先留个底稿，再决定哪一步值得重来。', tags: ['progress', 'defense', 'record'] },
  { id: 'undo-savepoint', name: '存个档先', type: '能力', abilityId: 'undo-three-seconds', cost: 1, description: '获得 3 点护盾和 1 点机巧；本关移除。', upgradedDescription: '获得 5 点护盾和 2 点机巧；本关移除。', flavor: '把三秒钟折成一张保险单。', exhaust: true, tags: ['defense', 'ingenuity'] },
  { id: 'undo-rebound', name: '借错反推', type: '能力', abilityId: 'undo-three-seconds', cost: 2, description: '推进 4 点并获得 4 点护盾；若上回合受过伤，再推进 2 点。', upgradedDescription: '推进 5 点并获得 5 点护盾；若上回合受过伤，再推进 2 点。', flavor: '错误已经发生，那就拿它当跳板。', tags: ['progress', 'defense'] },
  { id: 'light-feather', name: '顺风起手', type: '能力', abilityId: 'lighten', cost: 0, description: '获得 1 点机巧和 2 点护盾；本关移除。', upgradedDescription: '获得 2 点机巧和 3 点护盾；本关移除。', flavor: '先用一张轻牌，把连招推上轨道。', exhaust: true, tags: ['ingenuity', 'defense', 'discount-starter'] },
  { id: 'light-lift', name: '轻装抬升', type: '能力', abilityId: 'lighten', cost: 2, upgradedCost: 1, description: '推进 6 点；若实际费用不超过 1，再推进 2 点。', upgradedDescription: '费用变为 1；推进 6 点，且再推进 2 点。', flavor: '够轻，就能把机会一口气抬起来。', tags: ['progress'] },
  { id: 'light-balance', name: '配重挪移', type: '能力', abilityId: 'lighten', cost: 1, description: '推进 2 点并获得 3 点护盾；支付后若仍有能量，获得 1 点机巧。', upgradedDescription: '推进 3 点并获得 4 点护盾；支付后若仍有能量，获得 1 点机巧。', flavor: '轻的那头走，重的那头稳。', tags: ['progress', 'defense'] },
  { id: 'talk-ask', name: '补问细节', type: '能力', abilityId: 'object-talk', cost: 0, description: '获得 1 点机巧和 2 点护盾；本关移除。', upgradedDescription: '获得 2 点机巧和 3 点护盾；本关移除。', flavor: '证物不会撒谎，只会说得很局部。', exhaust: true, tags: ['ingenuity', 'defense'] },
  { id: 'talk-crosscheck', name: '交叉证词', type: '能力', abilityId: 'object-talk', cost: 1, description: '推进 2 点；若有 2 点机巧，消耗 2 点并额外推进 5 点。', upgradedDescription: '推进 3 点；若有 2 点机巧，消耗 2 点并额外推进 6 点。', flavor: '两段局部记忆，拼出一条完整路线。', tags: ['progress', 'ingenuity-spend'] },
  { id: 'talk-testimony', name: '关键证言', type: '能力', abilityId: 'object-talk', cost: 1, description: '获得 4 点护盾；若当前是蓄力或可打断意图，推进 3 点。', upgradedDescription: '获得 6 点护盾；若当前是蓄力或可打断意图，推进 4 点。', flavor: '问在点上，沉默也能当答案。', tags: ['defense', 'progress'] },
]

export const CARD_BY_ID = new Map(CARD_DEFINITIONS.map((card) => [card.id, card]))
const STARTER_GENERIC_IDS = ['quick-fix', 'quick-fix', 'brace', 'brace', 'observe', 'clever-combo', 'secure-push']

export function starterCardIds(abilityId: AbilityId) {
  return [...new Set([...STARTER_GENERIC_IDS, ...CARD_DEFINITIONS.filter((card) => card.abilityId === abilityId).map((card) => card.id)])]
}

export function createStarterDeck(abilityId: AbilityId, uid: () => string): CardInstance[] {
  const abilityCards = CARD_DEFINITIONS.filter((card) => card.abilityId === abilityId).map((card) => card.id)
  return [...STARTER_GENERIC_IDS, ...abilityCards].map((cardId) => ({ uid: uid(), cardId, upgraded: false }))
}

export function getCard(cardId: string) {
  const card = CARD_BY_ID.get(cardId)
  if (!card) throw new Error(`未知卡牌：${cardId}`)
  return card
}

export function describeCard(instance: CardInstance) {
  const definition = getCard(instance.cardId)
  return instance.upgraded ? definition.upgradedDescription : definition.description
}

export function rewardChoices(abilityId: AbilityId, levelIndex: number) {
  const exclusive = CARD_DEFINITIONS.filter((card) => card.abilityId === abilityId)
  return levelIndex === 0 ? [exclusive[1].id, 'secure-push', 'observe'] : [exclusive[2].id, 'clever-combo', 'brace']
}
