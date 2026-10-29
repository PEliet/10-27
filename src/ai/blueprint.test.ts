import { afterEach, describe, expect, it, vi } from 'vitest'
import { getOfflineBlueprint } from '../data/offlineBlueprints'
import type { CampaignBlueprint, ModelConfig } from '../types/game'
import { BlueprintGenerationError, generateCampaignBlueprint } from './blueprint'

const config: ModelConfig = {
  provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', useJsonMode: true, rememberKey: false,
}

function completion(blueprint: CampaignBlueprint) {
  return new Response(JSON.stringify({
    model: 'deepseek-flash', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(blueprint) } }],
  }), { status: 200 })
}

function modelBlueprint() {
  const blueprint = getOfflineBlueprint('undo-three-seconds')
  blueprint.levels[1].mechanic.summary = '模型只概括机制取舍，没有逐个复述结构化数字。'
  return { ...blueprint, source: 'ai' as const, id: 'draft', generatedAt: 0 }
}

afterEach(() => vi.unstubAllGlobals())

describe('whole-campaign AI generation pipeline', () => {
  it('accepts the model response only after protocol and simulation checks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion(modelBlueprint()))
    vi.stubGlobal('fetch', fetchMock)
    const stages: string[] = []
    const result = await generateCampaignBlueprint({
      config, apiKey: 'sk-test', abilityId: 'undo-three-seconds', recentThemes: ['上局：旧电影院'],
      onStage: (update) => stages.push(update.stage),
    })
    expect(result.blueprint.source).toBe('ai')
    expect(result.blueprint.levels).toHaveLength(3)
    expect(result.blueprint.levels[1].mechanic.summary).toContain(`${result.blueprint.levels[1].mechanic.condition.value}`)
    expect(result.simulations).toHaveLength(3)
    expect(stages).toEqual(['conceiving', 'checking-rules', 'checking-difficulty'])
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(requestBody.messages[1].content).toContain('最近主题摘要')
    expect(requestBody.messages[1].content).toContain('旧电影院')
  })

  it('returns concrete validation errors to the model and repairs at most through a new full blueprint', async () => {
    const invalid = modelBlueprint() as unknown as Record<string, unknown>
    const levels = invalid.levels as Array<Record<string, unknown>>
    levels[0].target = 99
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(completion(invalid as unknown as CampaignBlueprint))
      .mockResolvedValueOnce(completion(modelBlueprint()))
    vi.stubGlobal('fetch', fetchMock)
    const stages: string[] = []
    const result = await generateCampaignBlueprint({
      config, apiKey: 'sk-test', abilityId: 'undo-three-seconds', recentThemes: [], onStage: (update) => stages.push(update.stage),
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(stages).toContain('repairing')
    const repairBody = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    expect(repairBody.messages[1].content).toContain('未通过检查')
    expect(result.blueprint.levels[0].target).toBeLessThanOrEqual(14)
  })

  it('stops after two failed repairs instead of waiting or retrying forever', async () => {
    const invalid = modelBlueprint() as unknown as Record<string, unknown>
    const levels = invalid.levels as Array<Record<string, unknown>>
    levels[0].target = 99
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(completion(invalid as unknown as CampaignBlueprint)))
    vi.stubGlobal('fetch', fetchMock)
    await expect(generateCampaignBlueprint({
      config, apiKey: 'sk-test', abilityId: 'undo-three-seconds', recentThemes: [],
    })).rejects.toBeInstanceOf(BlueprintGenerationError)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
