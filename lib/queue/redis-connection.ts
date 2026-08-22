export function bullmqConnection(urlValue: string) {
  const url = new URL(urlValue)
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    db: Number(url.pathname.slice(1) || 0),
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null as null,
  }
}
