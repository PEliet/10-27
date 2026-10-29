import type { AbilityId, CampaignBlueprint, CampaignLevel, ThreatIntent } from '../types/game'

const damage = (amount: number, title: string): ThreatIntent => ({
  kind: 'damage', amount, title, description: `结束回合后造成 ${amount} 点伤害。`,
})
const interrupt = (amount: number, threshold: number, title: string): ThreatIntent => ({
  kind: 'interrupt', amount, breakProgress: threshold, title,
  description: `造成 ${amount} 点伤害；本回合推进至少 ${threshold} 点即可打断。`,
})
const charge = (amount: number, title: string): ThreatIntent => ({
  kind: 'charge', amount, title, description: `本回合不攻击；下一次攻击额外造成 ${amount} 点伤害。`,
})

const undoLevels: [CampaignLevel, CampaignLevel, CampaignLevel] = [
  {
    id: 'offline-undo-1', name: '自动售货机的最后一罐', chapter: '第一关 · 留好重来的那一步',
    scene: '地铁站的售货机吞了硬币，又把最后一罐豆奶卡在半空。维修员正拿购物小票量缝隙，你得在列车进站前让罐子落下来，还不能把机器摇倒。',
    goal: '让豆奶安全落入取货口', target: 14,
    mechanic: {
      id: 'receipt-cushion', name: '垫好再推', summary: '结束回合时护盾至少 4：获得 1 点机巧；否则受到 1 点伤害。',
      trigger: 'end-turn', condition: { type: 'shield-at-least', value: 4 },
      successEffects: [{ type: 'gain-ingenuity', amount: 1, duration: 'instant' }],
      failureEffects: [{ type: 'take-damage', amount: 1, duration: 'instant' }], frequency: 'once-per-turn',
    },
    intents: [damage(4, '机器晃动'), damage(5, '罐子反弹'), damage(4, '列车进站风')],
    abilityHook: 'replay-window', abilityOpportunity: '先记录一张基础防御或推进牌，再决定是否用撤回应对本回合的护盾门槛。',
    strategyNotes: [
      { route: '稳妥垫护盾', benefit: '持续获得机巧并少受伤', cost: '推进较慢', abilityUse: '撤回防御牌补足门槛', cardCoverage: ['brace', 'quick-fix'] },
      { route: '快速推进', benefit: '更早结束关卡', cost: '接受机制的小额伤害', abilityUse: '撤回推进牌加速', cardCoverage: ['quick-fix', 'secure-push'] },
    ], rewardCardIds: ['undo-savepoint', 'secure-push', 'observe'],
  },
  {
    id: 'offline-undo-2', name: '被盖两次的请假条', chapter: '第二关 · 现在重来还是留到以后',
    scene: '办公室的碎纸机咬住了请假条，行政同事还在上面补盖第三个章。滚轴每转一圈，纸就短一点。你可以抢进度，也可以先留住能重复利用的动作。',
    goal: '在纸条碎完前完整取出它', target: 20,
    mechanic: {
      id: 'clean-combo', name: '成套动作', summary: '结束回合时打出至少 2 张牌：获得 2 点护盾；否则失去 1 点进度。',
      trigger: 'end-turn', condition: { type: 'cards-played-at-least', value: 2 },
      successEffects: [{ type: 'gain-shield', amount: 2, duration: 'instant' }],
      failureEffects: [{ type: 'lose-progress', amount: 1, duration: 'instant' }], frequency: 'once-per-turn',
    },
    intents: [damage(5, '滚轴收紧'), interrupt(7, 5, '碎纸加速'), damage(5, '行政补章')],
    abilityHook: 'replay-window', abilityOpportunity: '撤回一张低费基础牌可以补齐两张牌门槛，也可以留给打断回合重复推进。',
    strategyNotes: [
      { route: '每回合凑两张', benefit: '稳定获得额外护盾', cost: '能量分配受限', abilityUse: '撤回低费牌补足张数', cardCoverage: ['quick-fix', 'observe'] },
      { route: '蓄力打断', benefit: '避开一次高伤害', cost: '前一回合可能少触发护盾', abilityUse: '把撤回留给高推进牌', cardCoverage: ['secure-push', 'clever-combo'] },
    ], rewardCardIds: ['undo-rebound', 'clever-combo', 'brace'],
  },
  {
    id: 'offline-undo-3', name: '会反锁的道具柜', chapter: '第三关 · 把记录用在真正要紧的地方',
    scene: '演出服锁在舞台边的道具柜里，柜门每次弹回都会顺手反锁。场务拿着衣架当撬棍，离开场只剩几分钟。你得控制反弹，再把关键动作做第二次。',
    goal: '不损坏柜门取出演出服', target: 26,
    mechanic: {
      id: 'precise-replay', name: '精确复现', summary: '打出能力牌时，每回合首次额外推进 2 点。',
      trigger: 'after-card', condition: { type: 'card-type-is', cardType: '能力' },
      successEffects: [{ type: 'gain-progress', amount: 2, duration: 'instant' }], failureEffects: [], frequency: 'once-per-turn',
    },
    intents: [damage(5, '柜门回弹'), charge(3, '锁舌蓄力'), damage(7, '柜体猛震'), interrupt(8, 6, '最后反锁')],
    abilityHook: 'replay-window', abilityOpportunity: '能力牌能触发额外推进，但撤回基础防御或推进牌仍可走另一条路线。',
    strategyNotes: [
      { route: '能力牌节奏', benefit: '稳定吃到额外推进', cost: '要安排能力牌出现的回合', abilityUse: '撤回基础牌补足剩余资源', cardCoverage: ['undo-savepoint', 'undo-rebound'] },
      { route: '防住蓄力击', benefit: '生命更安全', cost: '通关回合更多', abilityUse: '重复防御牌抵消重击', cardCoverage: ['brace', 'secure-push'] },
    ], rewardCardIds: [],
  },
]

const lightLevels: [CampaignLevel, CampaignLevel, CampaignLevel] = [
  {
    id: 'offline-light-1', name: '堵住楼梯的共享单车', chapter: '第一关 · 轻牌带动重牌',
    scene: '共享单车横在楼梯口，车锁还把扶手一起圈住了。抱着蛋糕的邻居已经腾不出手。先用轻动作找落点，再把最重的那一步塞进同一回合。',
    goal: '把单车移到墙边并清出通道', target: 12,
    mechanic: {
      id: 'gentle-start', name: '轻手起步', summary: '打出机巧牌时，每回合首次获得 2 点护盾。',
      trigger: 'after-card', condition: { type: 'card-type-is', cardType: '机巧' },
      successEffects: [{ type: 'gain-shield', amount: 2, duration: 'instant' }], failureEffects: [], frequency: 'once-per-turn',
    },
    intents: [damage(4, '车把回摆'), damage(5, '蛋糕盒失衡'), damage(4, '车轮滑动')],
    abilityHook: 'discount-chain', abilityOpportunity: '0 费或 1 费基础牌会启动减重，接着使用重牌能在一回合完成更多动作。',
    strategyNotes: [
      { route: '轻牌后接重牌', benefit: '同回合推进更高', cost: '出牌顺序受限', abilityUse: '主动失重留给 2 费牌', cardCoverage: ['observe', 'secure-push'] },
      { route: '先防后推', benefit: '生命稳定', cost: '推进较慢', abilityUse: '用基础防御启动被动减费', cardCoverage: ['brace', 'quick-fix'] },
    ], rewardCardIds: ['light-balance', 'secure-push', 'observe'],
  },
  {
    id: 'offline-light-2', name: '钢琴脚下的节目单', chapter: '第二关 · 爆发还是留一层减重',
    scene: '节目单滑进电子琴支架下面，琴手正用节拍器垫桌脚。抬得太早会让支架歪，拖得太久彩排就要开始。你得在连打和保留资源之间选一次。',
    goal: '完整取出节目单并稳住电子琴', target: 18,
    mechanic: {
      id: 'three-step-lift', name: '三步抬升', summary: '结束回合时打出至少 3 张牌：获得 2 点进度；否则受到 1 点伤害。',
      trigger: 'end-turn', condition: { type: 'cards-played-at-least', value: 3 },
      successEffects: [{ type: 'gain-progress', amount: 2, duration: 'instant' }],
      failureEffects: [{ type: 'take-damage', amount: 1, duration: 'instant' }], frequency: 'once-per-turn',
    },
    intents: [damage(5, '支架偏斜'), interrupt(7, 5, '琴盖滑落'), damage(5, '节拍器弹开')],
    abilityHook: 'discount-chain', abilityOpportunity: '被动减费和主动零费都能帮助凑出三张，但也可以少打牌并用护盾承担代价。',
    strategyNotes: [
      { route: '三牌连打', benefit: '得到额外进度', cost: '需要规划手牌费用', abilityUse: '主动把重牌变为零费', cardCoverage: ['quick-fix', 'observe', 'secure-push'] },
      { route: '稳住支架', benefit: '不依赖抽到特定组合', cost: '接受机制伤害或较慢推进', abilityUse: '被动减费用于防御牌', cardCoverage: ['brace', 'light-balance'] },
    ], rewardCardIds: ['light-lift', 'clever-combo', 'brace'],
  },
  {
    id: 'offline-light-3', name: '屋顶的气球绳卷', chapter: '第三关 · 连招之后还要站稳',
    scene: '广告架压住气球绳卷，屋顶风把气球吹得像一群急着下班的水母。减轻架子能取绳，但重量恢复前还得固定落点，不能只顾着多出一张牌。',
    goal: '固定气球并安全取出绳卷', target: 24,
    mechanic: {
      id: 'stable-finish', name: '稳住落点', summary: '结束回合时护盾至少 5：获得 2 点进度；否则失去 1 点机巧。',
      trigger: 'end-turn', condition: { type: 'shield-at-least', value: 5 },
      successEffects: [{ type: 'gain-progress', amount: 2, duration: 'instant' }],
      failureEffects: [{ type: 'lose-ingenuity', amount: 1, duration: 'instant' }], frequency: 'once-per-turn',
    },
    intents: [damage(5, '风向突变'), charge(3, '气球拉紧'), damage(7, '广告架回落'), interrupt(8, 6, '绳结脱手')],
    abilityHook: 'discount-chain', abilityOpportunity: '减费让推进与防御能在同回合并存，而非只把全部能量换成伤害。',
    strategyNotes: [
      { route: '减费后补防御', benefit: '同时获得额外进度与护盾', cost: '需要先打轻牌', abilityUse: '主动零费给推进牌，余下能量防御', cardCoverage: ['quick-fix', 'brace', 'secure-push'] },
      { route: '机巧爆发', benefit: '快速跨过蓄力阶段', cost: '可能失去未用机巧', abilityUse: '被动串联低费机巧牌', cardCoverage: ['observe', 'clever-combo'] },
    ], rewardCardIds: [],
  },
]

const talkLevels: [CampaignLevel, CampaignLevel, CampaignLevel] = [
  {
    id: 'offline-talk-1', name: '拿错伞的咖啡店', chapter: '第一关 · 用已知信息安排顺序',
    scene: '咖啡店只剩一把相同黑伞，伞架说它最后见过湿伞柄，门垫只记得一双红鞋。两件东西都只知道局部，你得边核对边处理门口的积水。',
    goal: '确认雨伞归属并找到联系线索', target: 12,
    mechanic: {
      id: 'useful-question', name: '问到点上', summary: '结束回合时机巧至少 1：获得 2 点护盾；否则受到 1 点伤害。',
      trigger: 'end-turn', condition: { type: 'ingenuity-at-least', value: 1 },
      successEffects: [{ type: 'gain-shield', amount: 2, duration: 'instant' }],
      failureEffects: [{ type: 'take-damage', amount: 1, duration: 'instant' }], frequency: 'once-per-turn',
    },
    intents: [damage(4, '门口积水'), damage(5, '伞架倾倒'), damage(4, '咖啡洒出')],
    abilityHook: 'planning-window', abilityOpportunity: '根据下一意图和抽牌堆顶牌，决定现在花掉机巧还是保留它换护盾。',
    strategyNotes: [
      { route: '保留一份机巧', benefit: '每回合更安全', cost: '组合牌爆发较慢', abilityUse: '交换牌序寻找防御或推进', cardCoverage: ['observe', 'brace'] },
      { route: '立刻交叉验证', benefit: '快速推进', cost: '失去机制护盾', abilityUse: '提前看伤害较低的窗口', cardCoverage: ['talk-crosscheck', 'quick-fix'] },
    ], rewardCardIds: ['talk-testimony', 'secure-push', 'observe'],
  },
  {
    id: 'offline-talk-2', name: '消失的数字蜡烛', chapter: '第二关 · 信息能省下哪一种资源',
    scene: '数字蜡烛从准备室消失，蛋糕盒记得一次碰撞，清洁推车听见塑料滚动。客人快进门了。你可以花机巧加速核对，也可以留着它抵住下一轮混乱。',
    goal: '在客人进门前找回数字蜡烛', target: 18,
    mechanic: {
      id: 'cross-check-threshold', name: '交叉核对', summary: '结束回合时推进至少 4：获得 1 点机巧；否则失去 1 点进度。',
      trigger: 'end-turn', condition: { type: 'turn-progress-at-least', value: 4 },
      successEffects: [{ type: 'gain-ingenuity', amount: 1, duration: 'instant' }],
      failureEffects: [{ type: 'lose-progress', amount: 1, duration: 'instant' }], frequency: 'once-per-turn',
    },
    intents: [damage(5, '推车滑动'), interrupt(7, 5, '客人提前到门口'), damage(5, '蛋糕盒倾斜')],
    abilityHook: 'planning-window', abilityOpportunity: '看到下一张牌后，可调整牌序确保推进门槛，也可接受退 1 点换取本回合防御。',
    strategyNotes: [
      { route: '稳定过推进门槛', benefit: '机巧会持续积累', cost: '防御投入减少', abilityUse: '交换牌顶确保下回合有推进牌', cardCoverage: ['quick-fix', 'secure-push'] },
      { route: '保守调查', benefit: '生命更安全', cost: '偶尔损失进度', abilityUse: '用预告判断何时可以慢一回合', cardCoverage: ['brace', 'observe'] },
    ], rewardCardIds: ['talk-crosscheck', 'clever-combo', 'brace'],
  },
  {
    id: 'offline-talk-3', name: '走音的固定一拍', chapter: '第三关 · 把未来两步变成现在的取舍',
    scene: '电子琴每到同一小节就卡顿，踏板说自己被踩得很冤，插线板则坚持只听见一次火花。彩排还在继续，你得按未来的故障节奏安排调查和防护。',
    goal: '定位卡顿原因并恢复彩排', target: 24,
    mechanic: {
      id: 'hold-evidence', name: '保留证据', summary: '结束回合时机巧至少 2：获得 2 点进度；否则受到 1 点伤害。',
      trigger: 'end-turn', condition: { type: 'ingenuity-at-least', value: 2 },
      successEffects: [{ type: 'gain-progress', amount: 2, duration: 'instant' }],
      failureEffects: [{ type: 'take-damage', amount: 1, duration: 'instant' }], frequency: 'once-per-turn',
    },
    intents: [damage(5, '音箱啸叫'), charge(3, '电流积聚'), damage(7, '插线板跳火'), interrupt(8, 6, '整段伴奏卡死')],
    abilityHook: 'planning-window', abilityOpportunity: '远期意图和牌堆顶信息决定机巧应保留过门槛，还是在安全回合换成大推进。',
    strategyNotes: [
      { route: '保留两点证据', benefit: '稳定获得额外进度', cost: '组合牌暂时少爆发', abilityUse: '调整牌序把机巧牌提前', cardCoverage: ['observe', 'talk-ask'] },
      { route: '看准窗口爆发', benefit: '能打断最终高伤害', cost: '机制可能追加小额伤害', abilityUse: '根据预告选择花机巧的回合', cardCoverage: ['talk-crosscheck', 'clever-combo', 'brace'] },
    ], rewardCardIds: [],
  },
]

const SNAPSHOTS: Record<AbilityId, CampaignBlueprint> = {
  'undo-three-seconds': { schemaVersion: 1, source: 'offline-example', id: 'offline-undo', seed: '售货机-请假条-道具柜', abilityId: 'undo-three-seconds', title: '三次差一点来得及', premise: '一连串小事故都差一步收场，幸好那一步可以重新安排。', levels: undoLevels, endingFacts: ['豆奶落进取货口', '请假条保住完整签章', '演出服赶上开场'], generatedAt: 1 },
  lighten: { schemaVersion: 1, source: 'offline-example', id: 'offline-light', seed: '单车-钢琴-气球', abilityId: 'lighten', title: '十秒钟的搬运公司', premise: '三件不该堵路的重东西，把短暂减重变成了一份临时工作。', levels: lightLevels, endingFacts: ['楼梯恢复通行', '节目单没有折角', '屋顶气球全部固定'], generatedAt: 1 },
  'object-talk': { schemaVersion: 1, source: 'offline-example', id: 'offline-talk', seed: '雨伞-蜡烛-电子琴', abilityId: 'object-talk', title: '物证只肯说半句话', premise: '三件小麻烦留下的东西都会说话，只是每件都只掌握一小段事实。', levels: talkLevels, endingFacts: ['黑伞回到主人手里', '蜡烛赶上生日歌', '伴奏恢复到正确小节'], generatedAt: 1 },
}

export function getOfflineBlueprint(abilityId: AbilityId): CampaignBlueprint {
  return structuredClone(SNAPSHOTS[abilityId])
}
