import type { AbilityDefinition, AbilityId } from '../types/game'

export const ABILITIES: AbilityDefinition[] = [
  {
    id: 'undo-three-seconds', name: '三秒撤回', emoji: '↩️',
    oneLiner: '把本回合的一张付费行动捞回来，返一点能量，重新安排时机。',
    passiveName: '三秒记录',
    passiveRule: '每回合首次打出的非消耗付费牌会被记录。记录会在回合结束时清除。',
    activeName: '撤回刚才',
    activeRule: '每关 1 次：把本回合记录且已进入弃牌堆的牌放回手牌，并返还 1 点能量（不超过 3）。重打仍需正常付费，不能回收消耗牌。',
    activeUses: 1,
    style: '先决定哪张牌值得再用一次，再利用返还的 1 点能量调整出牌顺序。基础推进和防御牌都能被记录。',
    exclusiveCards: ['undo-recall', 'undo-savepoint', 'undo-rebound'],
    growths: [
      { id: 'undo-cushion', name: '撤回缓冲', description: '重打被撤回的牌时获得 3 点护盾。', tradeoff: '提高容错，但不会增加撤回次数。' },
      { id: 'undo-buffer', name: '双份缓存', description: '每关主动能力次数增加到 2 次；每回合仍只记录一张牌。', tradeoff: '次数更多，但每次重打仍要正常付费。' },
    ],
  },
  {
    id: 'lighten', name: '临时减重', emoji: '🪶',
    oneLiner: '先打轻牌获得减费，再把沉重行动塞进同一回合。',
    passiveName: '轻装连拍',
    passiveRule: '每回合第一次打出实际费用不超过 1 的牌后，获得 1 层减重：下一张付费牌费用 -1，最低为 1；不可叠加。',
    activeName: '十秒失重',
    activeRule: '每关 1 次：若当前没有待用减费，使下一张付费牌费用变为 0。本回合未使用就消失。',
    activeUses: 1,
    style: '低费牌不只是便宜，还会为下一张重牌开路。基础牌同样能启动连拍。',
    exclusiveCards: ['light-feather', 'light-lift', 'light-balance'],
    growths: [
      { id: 'light-carry', name: '余重保留', description: '被动产生的 1 层减重可以跨回合保留。', tradeoff: '更稳健，但不会提高单回合爆发上限。' },
      { id: 'light-momentum', name: '借势滑行', description: '每回合首次消耗任意减费时获得 1 点机巧。', tradeoff: '资源循环更强，但要求按顺序连续出牌。' },
    ],
  },
  {
    id: 'object-talk', name: '物品翻译', emoji: '🗣️',
    oneLiner: '听见下一步麻烦和牌堆顶的动静，再安排现在的四张牌。',
    passiveName: '局部证词',
    passiveRule: '除当前公开意图外，额外显示下一回合意图和抽牌堆顶 1 张牌。信息只用于规划，不会暗改牌序。',
    activeName: '换个问法',
    activeRule: '每关 1 次：交换抽牌堆顶两张牌，并获得 1 点机巧。抽牌堆不足两张时不可用。',
    activeUses: 1,
    style: '利用未来意图和牌序决定保留机巧还是提前爆发，基础牌也会因信息而改变优先级。',
    exclusiveCards: ['talk-ask', 'talk-crosscheck', 'talk-testimony'],
    growths: [
      { id: 'talk-context', name: '补全上下文', description: '额外显示后续 2 个意图与抽牌堆顶 2 张牌。', tradeoff: '获得更多确定信息，但主动能力仍只有 1 次。' },
      { id: 'talk-editor', name: '采访编辑', description: '主动能力每关可用 2 次，且每次获得 2 点机巧。', tradeoff: '能改牌序和攒机巧，但远期预览范围不增加。' },
    ],
  },
]

export const ABILITY_BY_ID = new Map(ABILITIES.map((ability) => [ability.id, ability]))

export function getAbility(id: AbilityId | null) {
  return id ? ABILITY_BY_ID.get(id) : undefined
}
