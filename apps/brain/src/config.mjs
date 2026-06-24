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
    llmApiKey: env.ZENYA_LLM_API_KEY ?? ''
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
