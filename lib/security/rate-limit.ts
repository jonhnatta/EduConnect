import { query, queryOne } from "@/lib/db/query"

/**
 * Rate limit de janela deslizante, atômico (sem corrida).
 * Retorna true se a ação está PERMITIDA (dentro do limite), false se excedeu.
 *
 * @param bucket  chave única (ex.: `login:foo@bar.com`, `signup:1.2.3.4`, `comment:<uuid>`)
 * @param max     máximo de ações na janela
 * @param windowSeconds  duração da janela em segundos
 */
export async function checkRateLimit(
  bucket: string,
  max: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const row = await queryOne<{ count: number }>(
      `insert into public.rate_limits (bucket, window_started_at, count, updated_at)
       values ($1, timezone('utc'::text, now()), 1, timezone('utc'::text, now()))
       on conflict (bucket) do update set
         updated_at = timezone('utc'::text, now()),
         window_started_at = case
           when public.rate_limits.window_started_at <= timezone('utc'::text, now()) - ($2 || ' seconds')::interval
             then timezone('utc'::text, now())
           else public.rate_limits.window_started_at
         end,
         count = case
           when public.rate_limits.window_started_at <= timezone('utc'::text, now()) - ($2 || ' seconds')::interval
             then 1
           else public.rate_limits.count + 1
         end
       returning count`,
      [bucket, windowSeconds]
    )
    return (row?.count ?? 1) <= max
  } catch (err) {
    // Em caso de falha do limitador, não derruba o fluxo (fail-open), mas registra.
    console.error("[rate-limit]", err)
    return true
  }
}

/** Zera o contador (ex.: após login bem-sucedido). */
export async function resetRateLimit(bucket: string): Promise<void> {
  await query("delete from public.rate_limits where bucket = $1", [bucket]).catch(() => {})
}
