export function readBrainConfig(env = process.env) {
  return {
    host: env.BRAIN_HOST ?? '0.0.0.0',
    port: parsePort(env.BRAIN_PORT, 3101),
    tenant: env.ZENYA_TENANT ?? 'demo',
    chatwootBaseUrl: env.CHATWOOT_BASE_URL ?? 'http://localhost:3001',
    chatwootAccountId: env.CHATWOOT_ACCOUNT_ID ?? '',
    chatwootApiToken: env.CHATWOOT_API_TOKEN ?? '',
    supabaseUrl: env.SUPABASE_URL ?? '',
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    databaseUrl: env.DATABASE_URL ?? '',
    llmApiKey: env.ZENYA_LLM_API_KEY ?? '',
    model: env.ZENYA_MODEL ?? 'gpt-4.1-mini',
    systemPrompt: env.ZENYA_SYSTEM_PROMPT ?? 'Você é a Zenya. Responda com clareza, em português, como uma atendente humana.',
    memoryWindow: parsePositiveInteger(env.ZENYA_MEMORY_WINDOW, 50),
    debounceMs: parsePositiveInteger(env.ZENYA_DEBOUNCE_MS, 800),
    delivery: {
      wordsPerMinute: parsePositiveInteger(env.ZENYA_DELIVERY_WPM, 150),
      gapMs: parsePositiveInteger(env.ZENYA_DELIVERY_GAP_MS, 1000),
      capTextMs: parsePositiveInteger(env.ZENYA_DELIVERY_CAP_TEXT_MS, 25_000),
      capZapiMs: parsePositiveInteger(env.ZENYA_DELIVERY_CAP_ZAPI_MS, 15_000),
      capAudioMs: parsePositiveInteger(env.ZENYA_DELIVERY_CAP_AUDIO_MS, 12_000)
    },
    activeTools: parseList(env.ZENYA_ACTIVE_TOOLS)
  }
}

export function readiness(config) {
  const supabaseUrl = config.supabaseUrl ?? ''
  const supabaseServiceRoleKey = config.supabaseServiceRoleKey ?? ''
  const databaseUrl = config.databaseUrl ?? ''
  return {
    chatwootConfigured: config.chatwootAccountId.length > 0 && config.chatwootApiToken.length > 0,
    supabaseConfigured: (supabaseUrl.length > 0 && supabaseServiceRoleKey.length > 0) || databaseUrl.length > 0,
    llmConfigured: config.llmApiKey.length > 0
  }
}

function parsePort(value, fallback) {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid BRAIN_PORT: ${value}`)
  }
  return parsed
}

function parsePositiveInteger(value, fallback) {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid positive integer: ${value}`)
  }
  return parsed
}

function parseList(value) {
  if (value === undefined || value.trim().length === 0) return []
  return value.split(',').map((entry) => entry.trim()).filter(Boolean)
}
