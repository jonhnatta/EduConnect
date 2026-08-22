export function redisConnection(urlValue) {
  const url = new URL(urlValue)
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    db: Number(url.pathname.slice(1) || 0),
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  }
}

export function log(event, fields = {}) {
  console.info(JSON.stringify({ event, ...fields }))
}

export function logError(event, error, fields = {}) {
  console.error(JSON.stringify({ event, message: error instanceof Error ? error.message : String(error), ...fields }))
}
