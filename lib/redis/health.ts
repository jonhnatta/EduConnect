import Redis from "ioredis"

export async function pingRedis(urlValue: string): Promise<void> {
  const client = new Redis(urlValue, {
    lazyConnect: true,
    connectTimeout: 1_500,
    commandTimeout: 1_000,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
  })
  client.on("error", () => {})
  try {
    await client.connect()
    const response = await client.ping()
    if (response !== "PONG") throw new Error("Redis did not answer PONG")
  } finally {
    client.disconnect(false)
  }
}
