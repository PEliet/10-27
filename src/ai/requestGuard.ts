export interface RequestIdentity {
  id: string
  runId: string
}

export function shouldApplyResponse(
  active: RequestIdentity | null,
  response: RequestIdentity,
  currentRunId: string,
) {
  return active?.id === response.id && active.runId === response.runId && response.runId === currentRunId
}
