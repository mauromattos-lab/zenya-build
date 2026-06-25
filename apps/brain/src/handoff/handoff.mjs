export const AGENTE_OFF_LABEL = 'agente-off'

export async function getConversationLabels(chatwoot, conversationId) {
  if (chatwoot?.getConversationLabels === undefined) return []
  const labels = await chatwoot.getConversationLabels(conversationId)
  return Array.isArray(labels) ? labels.map(String) : []
}

export async function isBotPaused(chatwoot, conversationId) {
  const labels = await getConversationLabels(chatwoot, conversationId)
  return labels.includes(AGENTE_OFF_LABEL)
}

export async function escalateToHuman({ chatwoot, conversationId }) {
  if (chatwoot?.setLabels === undefined || chatwoot?.assignConversation === undefined) {
    throw new Error('Chatwoot handoff client is not configured')
  }

  const currentLabels = await getConversationLabels(chatwoot, conversationId)
  const labels = currentLabels.includes(AGENTE_OFF_LABEL)
    ? currentLabels
    : [...currentLabels, AGENTE_OFF_LABEL]

  await chatwoot.setLabels(conversationId, labels)
  await chatwoot.assignConversation(conversationId, null)

  return {
    conversationId,
    labels,
    assigneeId: null
  }
}
