import { useEffect, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import {
  ArrowLeft, Bot, BrainCircuit, CheckCircle2, ChevronRight, Clipboard, Download, Eye,
  Heart, Layers3, LoaderCircle, RefreshCw, RotateCcw, Settings, Shield, Sparkles, Trophy, X, Zap,
} from 'lucide-react'
import { BlueprintGenerationError, generateCampaignBlueprint, type GenerationStage } from './ai/blueprint'
import { ApiClientError, generateTurnNarration, messageForApiError } from './ai/api'
import { ModelSettings } from './components/ModelSettings'
import { describeCard, getCard } from './data/cards'
import { getAbility } from './data/content'
import { getOfflineBlueprint } from './data/offlineBlueprints'
import {
  abilityUsability, appendAiNarration, beginGeneration, cardPlayability, chooseAbilityGrowth, chooseCardReward,
  chooseHeal, chooseUpgrade, createInitialGame, currentIntent, currentLevel, drawAbility, endTurn, finishDefeat,
  activateAbility, playCard, rerollAbility, retryCurrentLevel, returnToDraw, startChallenge,
} from './game/state'
import {
  clearAllManagedData, clearCredential, clearGame, DEFAULT_CONFIG, DEFAULT_UI, hasLegacyGame,
  loadGame, loadModelConfig, loadRecentThemes, loadRememberedKey, loadUi, rememberTheme, saveGame,
  saveModelConfig, saveRememberedKey, saveUi,
} from './storage'
import type { AbilityGrowthId, GameState, LevelResult, ModelConfig, UiPreferences } from './types/game'

type AiStatus = { tone: 'demo' | 'loading' | 'ok' | 'fallback'; text: string }
type GenerationView = { stage: GenerationStage | null; label: string; attempt: number; error: string; details: string[] }
const EMPTY_GENERATION: GenerationView = { stage: null, label: '', attempt: 0, error: '', details: [] }

function BrandButton({ aiMode, busy, onSettings }: { aiMode: boolean; busy: boolean; onSettings: () => void }) {
  return <button className="button-secondary !min-h-10 !px-3 !py-2" onClick={onSettings} disabled={busy} aria-label="打开模型设置">
    <Settings size={17} /><span className="hidden sm:inline">模型</span><span className={`size-2 rounded-full ${aiMode ? 'bg-emerald-500' : 'bg-ink/25'}`} />
  </button>
}

function SiteHeader({ aiMode, busy, onSettings }: { aiMode: boolean; busy: boolean; onSettings: () => void }) {
  return <header className="site-header">
    <div className="flex items-center gap-3"><div className="brand-mark"><Zap size={19} fill="currentColor" /></div><div><b className="block text-sm sm:text-base">这破能力也能赢？</b><span className="hidden text-[11px] text-ink/45 sm:block">动态蓝图 · 本地规则结算</span></div></div>
    <BrandButton aiMode={aiMode} busy={busy} onSettings={onSettings} />
  </header>
}

function Home({ saved, legacy, aiMode, onStart, onContinue, onSettings }: {
  saved: GameState | null; legacy: boolean; aiMode: boolean; onStart: () => void; onContinue: () => void; onSettings: () => void
}) {
  return <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-4 sm:px-6 sm:pt-10 lg:px-8">
    <section className="home-hero p-6 sm:p-12 lg:grid lg:grid-cols-[1.1fr_.9fr] lg:gap-16 lg:p-16">
      <div className="relative z-10">
        <span className="sticker bg-grape text-white"><Layers3 size={15} />AI 一次设计三关</span>
        <h1 className="mt-6 text-[2.65rem] font-black leading-[1.06] sm:text-7xl">能力很破，<br /><span className="marker">规则得真能玩。</span></h1>
        <p className="mt-6 max-w-2xl text-base font-medium leading-8 text-ink/65 sm:text-lg">抽到超能力后，模型会一次设计三关。故事、公开威胁和机制会变化，数值与胜负始终由本地规则引擎执行。</p>
        {legacy && !saved && <div className="notice mt-5 border-tangerine bg-orange-50">检测到旧版存档；v3 动态蓝图规则不兼容，请开始新局。</div>}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row"><button className="button-primary text-lg" onClick={onStart}><Sparkles size={20} />抽取超能力</button>{saved && <button className="button-secondary text-lg" onClick={onContinue}><RotateCcw size={19} />继续「{saved.blueprint?.title ?? '三关存档'}」</button>}</div>
        <button className="mt-5 inline-flex items-center gap-2 text-sm font-black text-emerald-800 underline decoration-2 underline-offset-4" onClick={onSettings}><Bot size={17} />{aiMode ? '模型已配置，可生成正式局' : '配置模型生成正式局'}</button>
      </div>
      <div className="relative z-10 mt-10 lg:mt-0 lg:self-center lg:border-l lg:border-ink/10 lg:pl-12">
        {[['01', '蓝图先定', '三关一次生成并校验，后两关不会根据表现偷偷变难。'], ['02', '规则公开', '目标、意图、阈值和机制都摆在界面上，故事不参与结算。'], ['03', '能力贯穿', '被动、独立主动、卡牌协同和成长方向共同影响整局。']].map(([number, title, text]) => <div key={number} className="home-step"><span className="step-number">{number}</span><div><h2 className="font-black">{title}</h2><p className="mt-1 text-sm leading-6 text-ink/55">{text}</p></div></div>)}
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-ink/40"><span>每回合四张牌</span><span>三点能量</span><span>离线可玩</span></div>
      </div>
    </section>
  </main>
}

function DrawScreen({ state, aiMode, onReroll, onGenerate, onOffline, onSettings }: {
  state: GameState; aiMode: boolean; onReroll: () => void; onGenerate: () => void; onOffline: () => void; onSettings: () => void
}) {
  const ability = getAbility(state.offeredAbilityId)
  if (!ability) return null
  return <main className="mx-auto grid min-h-[calc(100dvh-80px)] max-w-5xl place-items-center px-4 pb-16"><section className="w-full text-center">
    <span className="sticker bg-white">本局规则核心</span>
    <div className="ability-card mx-auto mt-6 max-w-3xl">
      <div className="text-7xl">{ability.emoji}</div><h1 className="mt-4 text-4xl font-black sm:text-6xl">{ability.name}</h1><p className="mt-3 text-lg font-bold">{ability.oneLiner}</p>
      <div className="mt-6 grid gap-3 text-left sm:grid-cols-2"><div className="info-tile p-4"><p className="text-xs font-black text-emerald-800">常驻被动 · {ability.passiveName}</p><p className="mt-2 text-sm leading-relaxed text-ink/70">{ability.passiveRule}</p></div><div className="info-tile p-4"><p className="text-xs font-black text-emerald-800">独立主动 · {ability.activeName}</p><p className="mt-2 text-sm leading-relaxed text-ink/70">{ability.activeRule}</p></div></div>
      <p className="mt-4 text-sm font-bold text-ink/60">{ability.style}</p>
      <details className="secondary-panel mt-4 text-left"><summary>查看两种关间成长方向</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{ability.growths.map((growth) => <div key={growth.id} className="rounded-xl bg-paper p-3"><b>{growth.name}</b><p className="mt-1 text-xs text-ink/60">{growth.description}</p><p className="mt-1 text-xs font-bold text-emerald-800">取舍：{growth.tradeoff}</p></div>)}</div></details>
    </div>
    <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><button className="button-secondary" onClick={onReroll} disabled={state.rerollsRemaining <= 0}><RefreshCw size={18} />重抽（{state.rerollsRemaining}）</button>{aiMode ? <button className="button-primary" onClick={onGenerate}><Bot size={18} />AI 生成三关冒险</button> : <button className="button-primary" onClick={onSettings}><Settings size={18} />配置模型后生成正式局</button>}</div>
    <button className="mt-5 text-sm font-black text-ink/55 underline decoration-2 underline-offset-4" onClick={onOffline}>进入离线示例局（固定蓝图快照，不会请求 AI）</button>
  </section></main>
}

function GenerationScreen({ state, view, busy, onCancel, onRetry, onOffline, onBack }: {
  state: GameState; view: GenerationView; busy: boolean; onCancel: () => void; onRetry: () => void; onOffline: () => void; onBack: () => void
}) {
  const ability = getAbility(state.abilityId)
  const order: GenerationStage[] = ['conceiving', 'checking-rules', 'checking-difficulty']
  const activeIndex = view.stage === 'repairing' ? 0 : view.stage ? order.indexOf(view.stage) : -1
  return <main className="mx-auto grid min-h-[calc(100dvh-80px)] max-w-3xl place-items-center px-4 pb-16"><section className="screen-card w-full p-6 sm:p-9">
    <span className="sticker bg-grape text-white"><Bot size={15} />正式 AI 模式</span><h1 className="mt-5 text-3xl font-black sm:text-5xl">为「{ability?.name}」设计整局</h1><p className="mt-3 font-bold text-ink/60">模型一次生成三关；规则检查和本地策略模拟通过后才会写入存档。</p>
    <div className="mt-7 divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-white/60 px-4">{order.map((stage, index) => { const current = view.stage === stage; const done = activeIndex > index; return <div key={stage} className={`flex items-center gap-3 py-4 ${current ? 'text-emerald-800' : 'text-ink/60'}`}>{done ? <CheckCircle2 className="text-emerald-600" /> : current ? <LoaderCircle className="animate-spin text-emerald-700" /> : <span className="grid size-6 place-items-center rounded-full bg-ink/5 text-xs font-black">{index + 1}</span>}<b>{stage === 'conceiving' ? '正在构思三关' : stage === 'checking-rules' ? '检查规则' : '检查难度'}</b></div> })}</div>
    {view.stage === 'repairing' && <div className="notice mt-4 border-tangerine bg-orange-50"><RefreshCw className="shrink-0" size={18} />{view.label}。只会针对校验失败最多修复两次。</div>}
    {view.error && <div className="mt-5 rounded-2xl border-2 border-red-700 bg-red-50 p-4"><b className="text-red-800">{view.error}</b>{view.details.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-900">{view.details.slice(0, 8).map((detail) => <li key={detail}>{detail}</li>)}</ul>}</div>}
    <p className="mt-5 text-xs font-bold text-ink/45">没有虚假百分比：上方阶段由实际生成、Zod/语义检查和本地模拟推进。</p>
    <div className="mt-7 flex flex-col gap-3 sm:flex-row">{busy ? <button className="button-secondary flex-1" onClick={onCancel}><X size={18} />取消生成</button> : <><button className="button-primary flex-1" onClick={onRetry}><RefreshCw size={18} />重新生成</button><button className="button-secondary flex-1" onClick={onOffline}>进入离线示例</button><button className="button-secondary" onClick={onBack}><ArrowLeft size={18} />返回</button></>}</div>
  </section></main>
}

function BattleTopbar({ state, aiMode, aiStatus, busy, onSettings, onCancel }: { state: GameState; aiMode: boolean; aiStatus: AiStatus; busy: boolean; onSettings: () => void; onCancel: () => void }) {
  const battle = state.battle!
  return <header className="battle-topbar"><div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 sm:px-6 lg:px-8"><div className="mr-auto min-w-0"><b className="block truncate text-sm sm:text-base">{state.blueprint?.title}</b><span className="text-[11px] text-ink/45">第 {battle.levelIndex + 1} / 3 关 · 回合 {battle.turn} · {state.mode === 'ai' ? 'AI 蓝图' : '离线示例'}</span></div><div className="resource-pill text-red-700"><Heart size={15} fill="currentColor" /><b>{state.hp}</b><span className="hidden sm:inline">/{state.maxHp}</span></div><div className="resource-pill text-amber-700"><Zap size={15} fill="currentColor" /><b>{battle.energy}</b><span className="hidden sm:inline">/3</span></div>{busy ? <button className="small-button" onClick={onCancel}><X size={14} />取消旁白</button> : <BrandButton aiMode={aiMode} busy={false} onSettings={onSettings} />}</div><div className={`mx-auto max-w-7xl px-3 pb-2 text-[11px] font-medium sm:px-6 lg:px-8 ${aiStatus.tone === 'fallback' ? 'text-tangerine' : 'text-ink/40'}`}>{aiStatus.tone === 'loading' && <LoaderCircle className="mr-1 inline animate-spin" size={13} />}{aiStatus.text}</div></header>
}

function ActionCard({ state, cardUid, onPlay }: { state: GameState; cardUid: string; onPlay: (uid: string) => void }) {
  const instance = state.deck.find((card) => card.uid === cardUid)!
  const definition = getCard(instance.cardId)
  const playable = cardPlayability(state, cardUid)
  const battle = state.battle!
  const typeClass = definition.type === '防御' ? 'card-defense' : definition.type === '机巧' ? 'card-clever' : definition.type === '能力' ? 'card-ability' : 'card-progress'
  const stateBadge = battle.recordedCardUid === cardUid ? '已记录' : battle.reclaimedCardUid === cardUid ? '已撤回' : playable.badge
  return <button className={`action-card ${typeClass}`} disabled={!playable.playable} onClick={() => onPlay(cardUid)} aria-label={`${definition.name}，${playable.cost} 能量，${describeCard(instance)}`}><span className="energy-cost">{playable.cost}</span><span className="card-type">{definition.type}{instance.upgraded ? ' · 已升级' : ''}</span>{stateBadge && <span className="card-state-badge">{stateBadge}</span>}<b className="mt-7 block text-lg sm:text-xl">{definition.name}{instance.upgraded ? '+' : ''}</b><span className="mt-3 block text-sm font-bold leading-relaxed">{describeCard(instance)}</span><span className="mt-auto block pt-4 text-xs text-ink/45">{playable.playable ? definition.flavor : playable.reason}</span></button>
}

function AbilityStrip({ state, expanded, onExpanded, onUse }: { state: GameState; expanded: boolean; onExpanded: (value: boolean) => void; onUse: () => void }) {
  const ability = getAbility(state.abilityId)!
  const battle = state.battle!
  const usability = abilityUsability(state)
  const growth = ability.growths.find((item) => item.id === state.abilityGrowth)
  return <details className="ability-strip" open={expanded} onToggle={(event) => onExpanded(event.currentTarget.open)}><summary><span className="text-2xl">{ability.emoji}</span><span className="min-w-0 flex-1"><span className="block text-[10px] font-black uppercase tracking-[.14em] text-emerald-800">本局超能力</span><b className="block truncate">{ability.name} · {ability.passiveName}</b><span className="block truncate text-xs text-ink/55">{ability.passiveRule}</span></span><span className="ability-count">主动 {battle.activeUsesRemaining} 次</span></summary><div className="mt-4 grid gap-3 border-t border-emerald-900/10 pt-4 sm:grid-cols-[1fr_auto]"><div className="text-sm"><b>{ability.activeName}</b><p className="mt-1 text-xs leading-relaxed text-ink/60">{ability.activeRule}</p><p className={`mt-2 text-xs font-black ${usability.usable ? 'text-emerald-700' : 'text-tangerine'}`}>{usability.preview}{!usability.usable && usability.reason ? ` · ${usability.reason}` : ''}</p>{growth && <p className="mt-2 rounded-lg bg-white/60 p-2 text-xs"><b>成长 · {growth.name}</b>：{growth.description}</p>}</div><button className="button-primary self-center" disabled={!usability.usable} onClick={(event) => { event.preventDefault(); onUse() }}>{ability.activeName}<Zap size={17} /></button></div></details>
}

function BattleScreen({ state, aiStatus, aiMode, busy, expanded, onExpanded, onSettings, onCancelAi, onPlay, onAbility, onEndTurn }: {
  state: GameState; aiStatus: AiStatus; aiMode: boolean; busy: boolean; expanded: boolean; onExpanded: (value: boolean) => void; onSettings: () => void; onCancelAi: () => void; onPlay: (uid: string) => void; onAbility: () => void; onEndTurn: () => void
}) {
  const battle = state.battle!
  const ability = getAbility(state.abilityId)!
  const level = currentLevel(state)!
  const intent = currentIntent(state)!
  const futureCount = ability.id === 'object-talk' ? (state.abilityGrowth === 'talk-context' ? 2 : 1) : 0
  const futureIntents = Array.from({ length: futureCount }, (_, index) => currentIntent(state, index + 1)!).filter(Boolean)
  const topCount = ability.id === 'object-talk' ? (state.abilityGrowth === 'talk-context' ? 2 : 1) : 0
  const topCards = [...battle.drawPile].slice(-topCount).reverse().map((uid) => getCard(state.deck.find((card) => card.uid === uid)!.cardId).name)
  const slots: Array<string | null> = [...battle.hand]; while (slots.length < 4) slots.push(null)
  return <div className="min-h-dvh"><BattleTopbar state={state} aiMode={aiMode} aiStatus={aiStatus} busy={busy} onSettings={onSettings} onCancel={onCancelAi} /><main className="mx-auto max-w-7xl px-3 pb-10 pt-4 sm:px-6 sm:pt-6 lg:px-8">
    <section className="battle-brief p-4 sm:p-6"><div className="flex flex-col gap-5 lg:grid lg:grid-cols-[1fr_330px] lg:gap-7"><div><span className="text-[11px] font-black uppercase tracking-[.14em] text-emerald-800">{level.chapter}</span><h1 className="mt-2 text-2xl font-black sm:text-4xl">{level.goal}</h1><div className="mt-4 flex items-center gap-3"><div className="progress-track flex-1"><div className="progress-fill" style={{ width: `${Math.min(100, battle.progress / battle.target * 100)}%` }} /></div><b className="whitespace-nowrap text-base">{battle.progress} / {battle.target}</b></div><h2 className="mt-5 text-sm font-black text-ink/80">{level.name}</h2><p className="mt-1 max-w-3xl text-sm font-medium leading-7 text-ink/65 sm:text-base">{battle.sceneText}</p><div className="mechanic-callout mt-4"><span className="sticker shrink-0">{battle.turn === 1 ? '新机制' : '本关机制'}</span><div><b className="text-sm">{level.mechanic.name}</b><p>{level.mechanic.summary}</p></div></div></div><div className={`threat-panel p-4 ${intent.kind === 'charge' || intent.amount >= 7 ? 'threat-panel-danger' : ''}`}><p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.13em] text-red-700"><Eye size={15} />本回合威胁</p><h2 className="mt-3 text-xl font-black">{intent.title}</h2><p className="mt-1 text-sm font-medium leading-6">{intent.description}</p>{battle.chargedBonus > 0 && <p className="mt-3 rounded-lg bg-red-700 px-2 py-1 text-xs font-black text-white">已蓄力：下一击额外 +{battle.chargedBonus}</p>}{futureIntents.length > 0 && <div className="mt-3 border-t border-red-900/15 pt-3 text-xs text-ink/60"><b>物品翻译 · 后续意图</b>{futureIntents.map((item, index) => <p key={`${item.title}-${index}`} className="mt-1">+{index + 1} 回合：{item.title}</p>)}</div>}{topCards.length > 0 && <p className="mt-3 rounded-lg bg-white/60 p-2 text-xs"><b>牌堆顶：</b>{topCards.join(' → ')}</p>}</div></div></section>
    <section className="hand-panel mt-4 p-4 sm:mt-5 sm:p-6"><AbilityStrip state={state} expanded={expanded} onExpanded={onExpanded} onUse={onAbility} /><div className="mb-4 mt-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[.13em] text-ink/40">选择行动 · 不自动补牌</p><h2 className="mt-1 text-xl font-black">四张行动卡</h2></div><div className="flex gap-2"><span className="status-pill"><Shield className="mr-1" size={14} />护盾 {battle.shield}</span><span className="status-pill"><BrainCircuit className="mr-1" size={14} />机巧 {battle.ingenuity}/5</span></div></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{slots.map((cardUid, index) => cardUid ? <ActionCard key={cardUid} state={state} cardUid={cardUid} onPlay={onPlay} /> : <div key={`empty-${index}`} className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-ink/15 text-sm font-bold text-ink/25">已打出</div>)}</div><div className="mt-5 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center"><p className="text-xs leading-5 text-ink/45">主动能力不占手牌位；威胁只在结束回合后行动。</p><button className="button-primary shrink-0" onClick={onEndTurn}>结束回合<ChevronRight size={18} /></button></div></section>
    <section className="mt-5 grid gap-3 lg:grid-cols-2"><details className="secondary-panel"><summary>行动记录</summary><div className="mt-3 max-h-48 space-y-2 overflow-auto">{battle.logs.slice(-14).map((entry) => <p key={entry.id} className={`rounded-lg p-2 text-xs ${entry.kind === 'threat' ? 'bg-red-50' : entry.kind === 'ai' ? 'bg-emerald-50' : entry.kind === 'ability' || entry.kind === 'mechanic' ? 'bg-amber-50' : 'bg-white'}`}>{entry.text}</p>)}</div></details><details className="secondary-panel"><summary>牌堆</summary><p>抽牌堆 {battle.drawPile.length} · 弃牌堆 {battle.discardPile.length} · 本关移除 {battle.exhaustPile.length}</p><div className="mt-2 flex flex-wrap gap-1">{state.deck.map((card) => <span key={card.uid} className="rounded bg-white px-2 py-1 text-xs">{getCard(card.cardId).name}{card.upgraded ? '+' : ''}</span>)}</div></details></section>
  </main></div>
}

function RewardCardScreen({ state, onChoose }: { state: GameState; onChoose: (cardId: string | null) => void }) {
  return <main className="mx-auto grid min-h-[calc(100dvh-80px)] max-w-5xl place-items-center px-4 pb-16"><section className="w-full text-center"><span className="sticker bg-mint">蓝图奖励</span><h1 className="mt-5 text-4xl font-black">选择一张卡加入牌组</h1><p className="mt-2 text-ink/55">候选来自生成并校验通过的整局蓝图，只能引用已实现卡牌。</p><div className="mt-8 grid gap-4 sm:grid-cols-3">{state.rewardOptions.map((cardId) => { const card = getCard(cardId); return <button key={cardId} className="reward-card" onClick={() => onChoose(cardId)}><span className="energy-cost">{card.cost}</span><span className="card-type">{card.type}</span><b className="mt-8 block text-xl">{card.name}</b><p className="mt-3 text-sm font-bold">{card.description}</p><span className="mt-auto pt-5 text-xs text-ink/45">点击加入牌组</span></button> })}</div><button className="mt-6 text-sm font-black text-ink/55 underline" onClick={() => onChoose(null)}>跳过卡牌奖励</button></section></main>
}

function RewardGrowthScreen({ state, onChoose }: { state: GameState; onChoose: (id: AbilityGrowthId) => void }) {
  const ability = getAbility(state.abilityId)!
  return <main className="mx-auto grid min-h-[calc(100dvh-80px)] max-w-4xl place-items-center px-4 pb-16"><section className="w-full text-center"><span className="sticker">能力成长 · 二选一</span><h1 className="mt-5 text-4xl font-black">让「{ability.name}」往哪边长？</h1><p className="mt-2 text-ink/55">本局只能选择一个方向，不是单纯增加伤害。</p><div className="mt-8 grid gap-4 sm:grid-cols-2">{ability.growths.map((growth) => <button key={growth.id} className="reward-card min-h-64" onClick={() => onChoose(growth.id)}><b className="text-2xl">{growth.name}</b><p className="mt-4 font-bold">{growth.description}</p><p className="mt-auto rounded-xl bg-white p-3 text-xs text-emerald-800"><b>取舍：</b>{growth.tradeoff}</p></button>)}</div></section></main>
}

function RewardRestScreen({ state, onHeal, onUpgrade }: { state: GameState; onHeal: () => void; onUpgrade: (uid: string) => void }) {
  const growth = getAbility(state.abilityId)!.growths.find((item) => item.id === state.abilityGrowth)
  return <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6"><section className="screen-card p-5 sm:p-8"><span className="sticker">关间整备</span><h1 className="mt-4 text-3xl font-black">恢复 6 点生命，或升级一张牌</h1>{growth && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm"><b>本局能力成长：{growth.name}</b> · {growth.description}</p>}<button className="info-tile mt-6 flex w-full items-center justify-between p-4 text-left transition hover:border-red-900/30 hover:bg-red-50" onClick={onHeal}><span><b className="text-lg">休息一下</b><span className="block text-sm text-ink/55">生命 {state.hp} → {Math.min(state.maxHp, state.hp + 6)}</span></span><Heart className="text-red-700" fill="currentColor" /></button><h2 className="mb-3 mt-7 font-black">或选择一张未升级卡</h2><div className="grid gap-3 sm:grid-cols-2">{state.deck.filter((card) => !card.upgraded).map((instance) => { const card = getCard(instance.cardId); return <button key={instance.uid} className="info-tile bg-white p-3 text-left transition hover:border-ink/30" onClick={() => onUpgrade(instance.uid)}><b>{card.name}</b><span className="mt-1 block text-xs text-ink/50">升级前：{card.description}</span><span className="mt-1 block text-xs font-bold text-emerald-800">升级后：{card.upgradedDescription}</span></button> })}</div></section></main>
}

function DefeatScreen({ state, onRetry, onFinish }: { state: GameState; onRetry: () => void; onFinish: () => void }) {
  const canRetry = !!state.battle && !state.retryUsed[state.battle.levelIndex]
  return <main className="mx-auto grid min-h-[calc(100dvh-80px)] max-w-2xl place-items-center px-4 pb-16"><section className="screen-card w-full p-8 text-center"><div className="text-6xl">🧯</div><h1 className="mt-4 text-4xl font-black">具体后果：这件事没收住</h1><p className="mt-3 font-medium leading-7 text-ink/60">{canRetry ? '可完整重试当前关一次，生命、牌组与能力成长恢复到进关时；蓝图规则保持不变。' : '本关重试已经用完，本次挑战停在这里。'}</p><div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">{canRetry && <button className="button-primary" onClick={onRetry}><RotateCcw size={18} />重试当前关</button>}<button className="button-secondary" onClick={onFinish}>查看本局结果</button></div></section></main>
}

function summaryFor(results: LevelResult[]) { const wins = results.filter((item) => item.success).length; if (wins === 3) return ['荒诞解法架构师', '三关规则没有让步，你只是把能力、牌序和风险安排到了同一张桌上。']; if (wins === 2) return ['歪招牌手', '两件麻烦已经收拾妥当，剩下那件至少留下了明确的失败原因。']; return ['危机试牌员', '事情没全解决，但每一次结算都说明了是哪一步出了问题。'] }

function SummaryScreen({ state, onAgain }: { state: GameState; onAgain: () => void }) {
  const ability = getAbility(state.abilityId)!
  const cardRef = useRef<HTMLDivElement>(null)
  const [note, setNote] = useState(''); const [manual, setManual] = useState('')
  const [title, review] = summaryFor(state.results); const wins = state.results.filter((item) => item.success).length
  const report = `《这破能力也能赢？》战报\n冒险：${state.blueprint?.title}\n模式：${state.mode === 'ai' ? 'AI动态蓝图' : '离线示例局'}\n能力：${ability.name}\n称号：${title}\n通过：${wins}/3\n剩余生命：${state.hp}/${state.maxHp}\n主动能力：${state.totalAbilityUses}次\n打出卡牌：${state.totalCardsPlayed}\n评价：${review}`
  return <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6"><div ref={cardRef} className="report-card p-6 sm:p-10"><span className="sticker"><Trophy size={15} />{state.mode === 'ai' ? 'AI 动态蓝图' : '离线示例局'}</span><p className="mt-4 text-sm font-black text-emerald-800">{state.blueprint?.title}</p><div className="mt-2 flex items-start justify-between gap-4"><div><h1 className="text-4xl font-black sm:text-6xl">{title}</h1><p className="mt-3 max-w-2xl font-medium leading-7 text-ink/60">{review}</p></div><span className="text-6xl">{ability.emoji}</span></div><div className="mt-8 grid grid-cols-3 gap-3"><div className="result-stat"><b>{wins}/3</b><span>通过</span></div><div className="result-stat"><b>{state.hp}</b><span>生命</span></div><div className="result-stat"><b>{state.totalAbilityUses}</b><span>主动次数</span></div></div><div className="mt-6 divide-y divide-ink/10 rounded-xl border border-ink/10 bg-white/60 px-3">{state.results.map((item) => <div key={item.levelId} className="flex justify-between py-3"><b>{item.levelName}</b><span className="text-sm font-black">{item.success ? `${item.turns} 回合通过` : '失败'}</span></div>)}</div>{wins === 3 && <p className="mt-5 rounded-xl bg-white/70 p-3 text-sm"><b>事情最后变成：</b>{state.blueprint?.endingFacts.join('；')}。</p>}<p className="mt-6 text-center text-xs font-black tracking-widest text-ink/30">蓝图固定 · 本地规则结算</p></div><div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row"><button className="button-primary" onClick={async () => { try { const url = await toPng(cardRef.current!, { pixelRatio: 2, backgroundColor: '#f8f5ed' }); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `卡牌战绩-${title}.png`; anchor.click(); setNote('战绩卡已生成。') } catch { setNote('图片生成失败，可使用系统截图。') } }}><Download size={18} />下载战绩卡</button><button className="button-secondary" onClick={async () => { try { await navigator.clipboard.writeText(report); setNote('战报已复制。') } catch { setManual(report); setNote('请手动复制下方战报。') } }}><Clipboard size={18} />复制战报</button><button className="button-secondary" onClick={onAgain}><RotateCcw size={18} />再玩一次</button></div>{note && <p className="mt-4 text-center text-sm font-bold">{note}</p>}{manual && <textarea className="input mt-3" readOnly rows={8} value={manual} />}</main>
}

export default function App() {
  const [game, setGame] = useState<GameState>(() => createInitialGame())
  const [saved, setSaved] = useState<GameState | null>(() => loadGame())
  const [legacy, setLegacy] = useState(() => hasLegacyGame())
  const [config, setConfig] = useState<ModelConfig>(() => loadModelConfig())
  const [apiKey, setApiKey] = useState(() => loadRememberedKey())
  const [ui, setUi] = useState<UiPreferences>(() => loadUi())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aiStatus, setAiStatus] = useState<AiStatus>({ tone: apiKey ? 'ok' : 'demo', text: apiKey ? '模型已配置；正式局由 AI 生成，数值由本地结算。' : '未配置模型；可进入明确标注的离线示例局。' })
  const [generation, setGeneration] = useState<GenerationView>(EMPTY_GENERATION)
  const [aiBusy, setAiBusy] = useState(false)
  const requestRef = useRef<{ id: string; runId: string; levelIndex: number; kind: 'blueprint' | 'narration'; controller: AbortController } | null>(null)
  const playLockRef = useRef(false)
  const aiMode = !!apiKey.trim()

  useEffect(() => { if (game.blueprint && !['home', 'draw', 'generating'].includes(game.screen)) { saveGame(game); setSaved(game) } }, [game])
  useEffect(() => saveUi(ui), [ui])
  useEffect(() => () => requestRef.current?.controller.abort(), [])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }) }, [game.screen, game.battle?.levelIndex])
  useEffect(() => { if (game.screen === 'battle' || game.screen === 'generating' || !requestRef.current) return; requestRef.current.controller.abort(); requestRef.current = null; setAiBusy(false) }, [game.screen])

  const cancelRequest = (message = '请求已取消。') => {
    const kind = requestRef.current?.kind
    requestRef.current?.controller.abort(); requestRef.current = null; setAiBusy(false)
    if (kind === 'blueprint') setGeneration((current) => ({ ...current, error: message, details: [], stage: null, label: '' }))
    else if (message) setAiStatus({ tone: 'fallback', text: message })
  }

  const startNew = () => { cancelRequest(''); setLegacy(false); setGeneration(EMPTY_GENERATION); setGame(drawAbility(createInitialGame())) }

  const startOffline = () => {
    cancelRequest('')
    setGame((current) => {
      const abilityId = current.offeredAbilityId ?? current.abilityId
      return abilityId ? startChallenge(current, getOfflineBlueprint(abilityId)) : current
    })
    setAiStatus({ tone: 'demo', text: '离线示例局：使用经过验证的固定蓝图快照，没有假装实时生成。' })
  }

  const runGeneration = (source: GameState) => {
    if (!apiKey.trim()) { setSettingsOpen(true); return }
    const pending = source.screen === 'draw' ? beginGeneration(source) : source
    if (!pending.abilityId || pending.screen !== 'generating') return
    setGame(pending); setGeneration({ stage: 'conceiving', label: '正在构思三关', attempt: 0, error: '', details: [] })
    requestRef.current?.controller.abort()
    const controller = new AbortController()
    const request = { id: crypto.randomUUID(), runId: pending.runId, levelIndex: -1, kind: 'blueprint' as const, controller }
    requestRef.current = request; setAiBusy(true)
    generateCampaignBlueprint({
      config, apiKey, abilityId: pending.abilityId, recentThemes: loadRecentThemes(), signal: controller.signal,
      onStage: (update) => { if (requestRef.current?.id === request.id) setGeneration({ ...update, error: '', details: [] }) },
    }).then(({ blueprint }) => {
      if (requestRef.current?.id !== request.id) return
      rememberTheme(`${blueprint.title}：${blueprint.premise}`)
      setGame((current) => current.runId === request.runId && current.screen === 'generating' ? startChallenge(current, blueprint) : current)
      setAiStatus({ tone: 'ok', text: '三关蓝图已通过规则与难度检查，并固定写入本地存档。' })
    }).catch((error) => {
      if (requestRef.current?.id !== request.id) return
      const details = error instanceof BlueprintGenerationError
        ? error.details
        : error instanceof ApiClientError && error.diagnostic
          ? [
              `模型：${error.diagnostic.model}`,
              `请求：${error.diagnostic.host}${error.diagnostic.path}`,
              `HTTP：${error.diagnostic.httpStatus ?? '未收到'}`,
              `耗时：${error.diagnostic.durationMs} ms`,
              `结束原因：${error.diagnostic.finishReason ?? '未提供'}`,
              `摘要：${error.diagnostic.summary}`,
              '请求没有自动重试；可检查后手动点击重新生成。',
            ]
          : []
      setGeneration({ stage: null, label: '', attempt: 0, error: error instanceof BlueprintGenerationError ? error.message : messageForApiError(error), details })
    }).finally(() => { if (requestRef.current?.id === request.id) { requestRef.current = null; setAiBusy(false) } })
  }

  const play = (cardUid: string) => { if (playLockRef.current) return; playLockRef.current = true; setGame((current) => playCard(current, cardUid)); queueMicrotask(() => { playLockRef.current = false }) }
  const useAbility = () => { if (playLockRef.current) return; playLockRef.current = true; setGame((current) => activateAbility(current)); queueMicrotask(() => { playLockRef.current = false }) }

  const finishTurn = () => {
    if (game.screen !== 'battle' || !game.battle || !game.abilityId) return
    if (requestRef.current?.kind === 'narration') cancelRequest('')
    const before = game; const battleBefore = game.battle; const next = endTurn(before); setGame(next)
    if (game.mode !== 'ai' || !apiKey.trim() || next.screen !== 'battle' || !next.battle) { setAiStatus({ tone: game.mode === 'ai' ? 'fallback' : 'demo', text: game.mode === 'ai' ? '蓝图已固定；本回合只使用本地结算，未请求旁白。' : '离线示例局：回合已由本地规则结算。' }); return }
    const controller = new AbortController(); const request = { id: crypto.randomUUID(), runId: before.runId, levelIndex: battleBefore.levelIndex, kind: 'narration' as const, controller }
    requestRef.current = request; setAiBusy(true)
    const level = currentLevel(before)!
    const cardSummary = battleBefore.playedThisTurn.map((uid) => getCard(before.deck.find((card) => card.uid === uid)!.cardId).name).join('、') || '本回合未出牌'
    const threatSummary = next.battle.logs.filter((entry) => entry.kind === 'threat' || entry.kind === 'mechanic').at(-1)?.text ?? '威胁没有行动'
    setAiStatus({ tone: 'loading', text: '正在写一句已结算旁白；下一回合已经可以操作。' })
    generateTurnNarration(config, apiKey, { level: level.name, cardSummary, threatSummary, hp: next.hp, progress: `${next.battle.progress}/${next.battle.target}` }, controller.signal)
      .then((result) => { if (requestRef.current?.id !== request.id) return; setGame((current) => appendAiNarration(current, request.runId, request.levelIndex, result.content)); setAiStatus({ tone: 'ok', text: '回合旁白已加入记录；它不会改变结构化规则。' }) })
      .catch((error) => { if (requestRef.current?.id !== request.id) return; setAiStatus({ tone: 'fallback', text: `旁白请求失败，不影响结算：${messageForApiError(error)}` }) })
      .finally(() => { if (requestRef.current?.id === request.id) { requestRef.current = null; setAiBusy(false) } })
  }

  const page = (() => {
    switch (game.screen) {
      case 'home': return <Home saved={saved} legacy={legacy} aiMode={aiMode} onStart={startNew} onContinue={() => { if (saved) { setGame(saved); setAiStatus({ tone: saved.mode === 'ai' ? 'ok' : 'demo', text: saved.mode === 'ai' ? '已恢复固定的 AI 蓝图存档。' : '已恢复离线示例局存档。' }) } }} onSettings={() => setSettingsOpen(true)} />
      case 'draw': return <DrawScreen state={game} aiMode={aiMode} onReroll={() => setGame((current) => rerollAbility(current))} onGenerate={() => runGeneration(game)} onOffline={startOffline} onSettings={() => setSettingsOpen(true)} />
      case 'generating': return <GenerationScreen state={game} view={generation} busy={aiBusy} onCancel={() => cancelRequest('已取消生成；原有存档没有被覆盖。')} onRetry={() => runGeneration(game)} onOffline={startOffline} onBack={() => setGame((current) => returnToDraw(current))} />
      case 'battle': return <BattleScreen state={game} aiStatus={aiStatus} aiMode={aiMode} busy={aiBusy} expanded={ui.abilityExpanded} onExpanded={(value) => setUi((current) => ({ ...current, abilityExpanded: value }))} onSettings={() => setSettingsOpen(true)} onCancelAi={() => cancelRequest('旁白请求已取消；本地结算保留。')} onPlay={play} onAbility={useAbility} onEndTurn={finishTurn} />
      case 'reward-card': return <RewardCardScreen state={game} onChoose={(cardId) => setGame((current) => chooseCardReward(current, cardId))} />
      case 'reward-growth': return <RewardGrowthScreen state={game} onChoose={(id) => setGame((current) => chooseAbilityGrowth(current, id))} />
      case 'reward-rest': return <RewardRestScreen state={game} onHeal={() => setGame((current) => chooseHeal(current))} onUpgrade={(uid) => setGame((current) => chooseUpgrade(current, uid))} />
      case 'defeat': return <DefeatScreen state={game} onRetry={() => setGame((current) => retryCurrentLevel(current))} onFinish={() => setGame((current) => finishDefeat(current))} />
      case 'summary': return <SummaryScreen state={game} onAgain={startNew} />
    }
  })()

  return <div className="min-h-dvh">{game.screen !== 'battle' && <SiteHeader aiMode={aiMode} busy={aiBusy} onSettings={() => setSettingsOpen(true)} />}{page}<ModelSettings open={settingsOpen} busy={aiBusy} config={config} apiKey={apiKey} onClose={() => setSettingsOpen(false)} onSave={(nextConfig, nextKey) => { setConfig(nextConfig); setApiKey(nextKey); saveModelConfig(nextConfig); if (nextConfig.rememberKey) saveRememberedKey(nextKey); else clearCredential(); setAiStatus({ tone: nextKey ? 'ok' : 'demo', text: nextKey ? '模型已配置；正式开局会生成并校验三关蓝图。' : '未配置模型；只能进入明确标注的离线示例局。' }) }} onClearKey={() => { clearCredential(); setApiKey(''); setAiStatus({ tone: 'demo', text: '凭证已清除；现有蓝图仍可本地继续。' }) }} onClearGame={() => { cancelRequest(''); clearGame(); setSaved(null); setLegacy(false); setGame(createInitialGame()) }} onClearAll={() => { cancelRequest(''); clearAllManagedData(); setConfig(DEFAULT_CONFIG); setApiKey(''); setUi(DEFAULT_UI); setSaved(null); setLegacy(false); setGame(createInitialGame()) }} /></div>
}
