import { requestBlueprintCompletion, type Message } from './api'
import { CARD_DEFINITIONS, starterCardIds } from '../data/cards'
import { getAbility } from '../data/content'
import { checkBlueprintDifficulty } from '../game/simulator'
import { toAcceptedBlueprint, validateBlueprint } from '../game/blueprint'
import type { AbilityId, ModelConfig } from '../types/game'

export type GenerationStage = 'conceiving' | 'checking-rules' | 'checking-difficulty' | 'repairing'
export interface GenerationUpdate { stage: GenerationStage; label: string; attempt: number }

export class BlueprintGenerationError extends Error {
  constructor(message: string, public readonly details: string[]) { super(message); this.name = 'BlueprintGenerationError' }
}

const PLACES = ['末班公交站', '社区活动室', '商场仓库', '旧电影院后台', '雨天菜市场', '图书馆还书口', '小区天台', '深夜便利店']
const OBJECTS = ['折叠梯', '蛋糕盒', '坏掉的号码牌', '一卷胶带', '借来的电风扇', '失踪的门卡', '会漏水的花盆', '装反的广告牌']
const PRESSURES = ['三分钟后关门', '下一拨人马上到', '临时检查正在上楼', '雨势越来越大', '广播已经催了两次', '负责人正在找钥匙']

function randomItem(values: string[]) {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return values[array[0] % values.length]
}

export function createThemeSeed() {
  return `${randomItem(PLACES)}｜${randomItem(OBJECTS)}｜${randomItem(PRESSURES)}｜${crypto.randomUUID().slice(0, 8)}`
}

function jsonContract() {
  return `{
  "schemaVersion": 1,
  "source": "ai",
  "id": "draft",
  "seed": "原样复制主题种子",
  "abilityId": "固定能力ID",
  "title": "4-24字",
  "premise": "12-100字",
  "levels": [恰好三个关卡对象],
  "endingFacts": ["2-5条具体事实"],
  "generatedAt": 0
}
关卡对象字段：id(小写英文/数字/连字符)、name、chapter(可直接写“第一关/第二关/第三关”)、scene(目标60-100字；硬下限24字、上限200字)、goal、target、mechanic、intents、abilityHook、abilityOpportunity(建议12-100字，硬上限240字)、strategyNotes、rewardCardIds。
mechanic字段：id、name、summary、trigger、condition、successEffects、failureEffects、frequency。summary写一句简短说明即可；前端会从condition与effects重新生成最终玩家说明，结构化字段才是数值真源。
trigger只能是 after-card/end-turn/turn-start。after-card只能搭配 condition={"type":"card-type-is","cardType":"推进|防御|机巧|能力"}；end-turn只能搭配 turn-progress-at-least/shield-at-least/ingenuity-at-least/cards-played-at-least 并提供 value；turn-start只能搭配 turn-number-is 并提供 value。
effect={"type":"gain-progress|gain-shield|gain-ingenuity|discount-next|take-damage|lose-progress|lose-ingenuity","amount":整数,"duration":"instant|until-used"}。只有 discount-next 使用 until-used 且 amount=1；其余使用 instant。推进奖励≤3、护盾≤4、机巧≤2、伤害≤3、扣进度/机巧≤2。successEffects 1-2个，failureEffects最多1个且仅end-turn可用。frequency只能 once-per-turn/once-per-level。
intent字段：kind=damage|charge|interrupt、amount、title、description；字段名必须严格使用 camelCase。每一个 interrupt 都必须同时提供 breakProgress 3-7，其他类型不得有。示例：{"kind":"interrupt","amount":7,"breakProgress":5,"title":"滚轮猛转","description":"造成 7 点伤害；本回合推进至少 5 点即可打断。"}。普通伤害示例：{"kind":"damage","amount":5,"title":"纸箱滑落","description":"结束回合后造成 5 点伤害。"}。前端会从kind、amount与breakProgress重新生成最终意图说明。
strategyNotes至少2条，每条字段：route、benefit、cost、abilityUse、cardCoverage(2-4个真实卡牌ID)。这些内部说明不会展示给玩家。
第一、二关 rewardCardIds 恰好3个，第三关必须为空数组。`
}

function styleRules() {
  return `文风：像会讲故事的人描述眼前发生的事，不像助手介绍功能或营销文案。先写具体动作、物件和麻烦，再写要解决什么；短句、自然中文、轻微荒诞但内部讲得通。每关开场约60—100字。不要堆形容词，不替玩家表达情绪，不重复界面数值，不强行升华。
禁用套话：命运的齿轮开始转动、真正的挑战才刚刚开始、空气中弥漫着、你能否、一场关于……的考验、勇敢的冒险者、智慧与勇气、未知的旅程、作为AI、根据你的选择、系统将为你生成、你不禁感到。
故事描述不得添加结构化字段之外的规则；关键机制必须完整写入 condition、effects、kind、amount 与 breakProgress 等结构化字段。最终玩家说明由前端从这些字段生成。`
}

function buildPrompt(abilityId: AbilityId, seed: string, recentThemes: string[]) {
  const ability = getAbility(abilityId)!
  const allowedCards = CARD_DEFINITIONS.filter((card) => !card.abilityId || card.abilityId === abilityId).map((card) => ({
    id: card.id, name: card.name, type: card.type, cost: card.cost, upgradedCost: card.upgradedCost,
    description: card.description, upgradedDescription: card.upgradedDescription, tags: card.tags,
  }))
  const hook = abilityId === 'undo-three-seconds' ? 'replay-window' : abilityId === 'lighten' ? 'discount-chain' : 'planning-window'
  return `请一次性设计一局前后连贯的三关短篇冒险，并且只输出一个JSON对象。

固定超能力（程序已经实现，禁止改写或发明新规则）：
${JSON.stringify({
    id: ability.id, name: ability.name, passive: `${ability.passiveName}：${ability.passiveRule}`,
    active: `${ability.activeName}：${ability.activeRule}`, growths: ability.growths,
  }, null, 2)}
每关 abilityHook 必须是 ${hook}，且必须设计一个值得使用主动能力的公开机会；同时保留不依赖专属牌的可行路线。scene 按中文字符计数，建议 60—100 字；短句也必须至少 24 个字符。

初始资源：24生命、每回合3能量、4张手牌、机巧上限5、护盾回合结束后清零。目标进度达标立即过关。敌方当前意图始终公开。
初始牌ID：${starterCardIds(abilityId).join(', ')}
允许的卡牌与升级：${JSON.stringify(allowedCards)}

难度预算：第一关target 11-14且只用damage意图；第二关target 16-20，可加入interrupt；第三关target 21-26，可组合charge与interrupt。意图3-5个循环，普通伤害3-9，蓄力2-4。新手友好，一次普通失误不能必败，不得要求抽到某张特定牌。
每关只设置一个 mechanic。至少两条真实不同的路线，例如快速推进并承伤、先防御积累、花费或保留机巧、现在使用主动或留待后续。不能只在文案里声称两难；路线必须由数值条件产生不同收益与代价。所有重要条件提前公开，禁止隐藏惩罚、临时加规则、动态提高目标和无解封锁。

主题种子：${seed}
最近主题摘要（避免重复；为空则忽略）：${recentThemes.length ? recentThemes.join('；') : '无'}

${styleRules()}

JSON协议：
${jsonContract()}
只输出JSON，不要Markdown代码块，不要解释，不要输出可执行代码。`
}

function parseJsonObject(content: string) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new BlueprintGenerationError('模型没有返回JSON对象。', ['响应中找不到完整的 { ... } 对象'])
  try { return JSON.parse(cleaned.slice(start, end + 1)) as unknown } catch (error) {
    throw new BlueprintGenerationError('模型返回的JSON无法解析。', [error instanceof Error ? error.message : 'JSON解析失败'])
  }
}

export async function generateCampaignBlueprint(options: {
  config: ModelConfig
  apiKey: string
  abilityId: AbilityId
  recentThemes: string[]
  signal?: AbortSignal
  onStage?: (update: GenerationUpdate) => void
}) {
  const { config, apiKey, abilityId, recentThemes, signal, onStage } = options
  const seed = createThemeSeed()
  const basePrompt = buildPrompt(abilityId, seed, recentThemes)
  let lastContent = ''
  let lastErrors: string[] = []

  for (let attempt = 0; attempt < 3; attempt += 1) {
    onStage?.({
      stage: attempt === 0 ? 'conceiving' : 'repairing', attempt,
      label: attempt === 0 ? '正在构思三关' : `正在按检查结果修复（${attempt}/2）`,
    })
    const messages: Message[] = [
      { role: 'system', content: '你是策略卡牌关卡设计器。严格遵守有限机制协议，只输出有效JSON；叙事不能替代规则字段。' },
      { role: 'user', content: attempt === 0 ? basePrompt : `${basePrompt}\n\n上一次输出未通过检查。请针对以下错误完整重写JSON，不要只解释：\n- ${lastErrors.join('\n- ')}\n\n上次输出供定位（可能不完整）：\n${lastContent.slice(0, 12000)}\n\n输出前逐项核对上述错误已经修复。尤其是每个 interrupt 都必须使用精确字段名 breakProgress，并让 description 同时写出伤害值和打断阈值。仍然只输出一个完整JSON对象。` },
    ]
    const response = await requestBlueprintCompletion(config, apiKey, messages, signal)
    lastContent = response.content
    let value: unknown
    try {
      value = parseJsonObject(response.content)
    } catch (error) {
      if (!(error instanceof BlueprintGenerationError)) throw error
      lastErrors = error.details
      if (attempt === 2) throw error
      continue
    }

    onStage?.({ stage: 'checking-rules', attempt, label: '正在检查规则' })
    const checked = validateBlueprint(value, abilityId)
    if (!checked.blueprint) {
      lastErrors = checked.errors
      if (attempt === 2) throw new BlueprintGenerationError('本局生成未通过规则检查。', lastErrors)
      continue
    }
    const accepted = toAcceptedBlueprint(checked.blueprint, 'ai', seed)
    onStage?.({ stage: 'checking-difficulty', attempt, label: '正在检查难度' })
    const difficulty = checkBlueprintDifficulty(accepted)
    if (difficulty.errors.length) {
      lastErrors = difficulty.errors
      if (attempt === 2) throw new BlueprintGenerationError('本局生成未通过难度检查。', lastErrors)
      lastContent = JSON.stringify(accepted)
      continue
    }
    return { blueprint: accepted, diagnostic: response.diagnostic, simulations: difficulty.results }
  }
  throw new BlueprintGenerationError('本局生成未通过规则检查。', lastErrors)
}
