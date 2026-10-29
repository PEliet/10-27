import { describe, expect, it } from 'vitest'
import { getOfflineBlueprint } from '../data/offlineBlueprints'
import { checkBlueprintDifficulty } from './simulator'
import { describeIntent, describeMechanic, validateBlueprint } from './blueprint'

describe('generated campaign blueprint protocol', () => {
  it('accepts a validated three-level snapshot and runs three local strategy simulations', () => {
    const blueprint = getOfflineBlueprint('undo-three-seconds')
    expect(validateBlueprint(blueprint, blueprint.abilityId).errors).toEqual([])
    const checked = checkBlueprintDifficulty(blueprint)
    expect(checked.results.map((result) => result.strategy)).toEqual(['aggressive', 'defensive', 'synergy'])
    expect(checked.errors).toEqual([])
  })

  it('rejects unsupported executable effects instead of silently treating them as story', () => {
    const blueprint = getOfflineBlueprint('lighten') as unknown as Record<string, unknown>
    const levels = blueprint.levels as Array<Record<string, unknown>>
    const mechanic = levels[0].mechanic as Record<string, unknown>
    mechanic.successEffects = [{ type: 'spawn-random-card', amount: 1, duration: 'instant' }]
    const checked = validateBlueprint(blueprint, 'lighten')
    expect(checked.blueprint).toBeNull()
    expect(checked.errors.join(' ')).toContain('successEffects')
  })

  it('rejects rules hidden inside narrative text', () => {
    const blueprint = getOfflineBlueprint('object-talk')
    blueprint.levels[0].scene += ' 每回合造成 9 点伤害。'
    const checked = validateBlueprint(blueprint, blueprint.abilityId)
    expect(checked.blueprint).toBeNull()
    expect(checked.errors.join(' ')).toContain('故事场景疑似夹带可执行规则')
  })

  it('rebuilds incomplete model rule copy from structured values instead of rejecting the run', () => {
    const blueprint = getOfflineBlueprint('object-talk')
    const level = blueprint.levels[1]
    level.mechanic.summary = '满足公开条件后获得收益，否则承担相应代价。'
    level.intents[0].description = '这段模型文案没有重复结构化数值。'
    const checked = validateBlueprint(blueprint, blueprint.abilityId)
    expect(checked.errors).toEqual([])
    expect(checked.blueprint).not.toBeNull()
    expect(checked.blueprint!.levels[1].mechanic.summary).toBe(describeMechanic(level.mechanic))
    expect(checked.blueprint!.levels[1].intents[0].description).toBe(describeIntent(level.intents[0]))
    expect(checked.blueprint!.levels[1].mechanic.summary).toContain(`${level.mechanic.condition.value}`)
    expect(checked.blueprint!.levels[1].mechanic.summary).toContain(`${level.mechanic.successEffects[0].amount}`)
  })

  it('accepts concise but substantial scenes because narrative length is not an executable rule', () => {
    const blueprint = getOfflineBlueprint('undo-three-seconds')
    blueprint.levels[0].scene = '售货机吞了硬币，豆奶卡在弹簧中间，维修员正拿小票量缝隙。'
    blueprint.levels[1].scene = '雨水顺着门框往里灌，保安抱着纸箱堵门，广播还在催人离场。'
    blueprint.levels[2].scene = '卷帘门只剩半米高，最后一辆推车歪在出口，钥匙却挂在车把上。'
    const checked = validateBlueprint(blueprint, blueprint.abilityId)
    expect(checked.errors).toEqual([])
    expect(checked.blueprint).not.toBeNull()
  })

  it('does not reject executable blueprints for short chapter labels or detailed internal notes', () => {
    const blueprint = getOfflineBlueprint('object-talk')
    blueprint.levels.forEach((level, index) => { level.chapter = `第${index + 1}关` })
    blueprint.levels[2].abilityOpportunity = '先利用被动查看更远的威胁和牌序，再判断是否保留机巧。主动调整牌序可以把防御牌移到危险回合前，也可以把推进牌留给打断窗口；两种安排都会改变风险，但都不是通关的唯一办法。'.repeat(2)
    const checked = validateBlueprint(blueprint, blueprint.abilityId)
    expect(checked.errors).toEqual([])
    expect(checked.blueprint).not.toBeNull()
  })

  it('rejects a first level that requires an advanced unannounced threat', () => {
    const blueprint = getOfflineBlueprint('undo-three-seconds')
    blueprint.levels[0].intents[0] = { kind: 'interrupt', amount: 7, breakProgress: 5, title: '突然封锁', description: '造成 7 点伤害；推进 5 点可以打断。' }
    const checked = validateBlueprint(blueprint, blueprint.abilityId)
    expect(checked.errors).toContain('第一关只允许基础伤害意图，先教学能力核心')
  })
})
