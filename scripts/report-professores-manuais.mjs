#!/usr/bin/env node
// Relatório diário: professores aguardando análise MANUAL.
// Uso:
//   node scripts/report-professores-manuais.mjs            # tabela no terminal
//   node scripts/report-professores-manuais.mjs --csv      # saída CSV
//   node scripts/report-professores-manuais.mjs --csv > fila.csv
//
// Lê DATABASE_URL do ambiente (mesmo do app). Localmente, exporte a URL do Postgres do Docker.

import pg from "pg"

const { Pool } = pg
const asCsv = process.argv.includes("--csv")

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://app_user:app_password@localhost:5432/appdb",
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
})

const SQL = `
  SELECT p.id, u.email, p.full_name, p.interests,
         p.professor_verification_doc_url AS documento,
         p.professor_verification_ai_reason AS motivo_ia,
         p.professor_verification_manual_requested_at AS solicitado_em
  FROM public.profiles p
  JOIN public.users u ON u.id = p.id
  WHERE p.user_type = 'professor'
    AND p.professor_verification_status = 'pending'
    AND p.professor_verification_manual_requested_at IS NOT NULL
  ORDER BY p.professor_verification_manual_requested_at ASC
`

function csvCell(v) {
  const s = v == null ? "" : Array.isArray(v) ? v.join("; ") : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

try {
  const { rows } = await pool.query(SQL)

  if (asCsv) {
    const cols = ["id", "email", "full_name", "interests", "documento", "motivo_ia", "solicitado_em"]
    console.log(cols.join(","))
    for (const r of rows) console.log(cols.map((c) => csvCell(r[c])).join(","))
  } else {
    console.log(`\n📋 Professores aguardando análise manual: ${rows.length}\n`)
    for (const r of rows) {
      console.log(`• ${r.full_name ?? "(sem nome)"}  <${r.email}>`)
      console.log(`  id:        ${r.id}`)
      console.log(`  disciplinas: ${(r.interests ?? []).join(", ") || "-"}`)
      console.log(`  documento: ${r.documento ?? "-"}`)
      console.log(`  motivo IA: ${r.motivo_ia ?? "-"}`)
      console.log(`  solicitado em: ${r.solicitado_em?.toISOString?.() ?? r.solicitado_em}`)
      console.log("")
    }
    if (rows.length > 0) {
      console.log("Para aprovar:  UPDATE public.profiles SET professor_verification_status='approved', professor_verification_reviewed_at=now() WHERE id='<UUID>';")
      console.log("Para reprovar: UPDATE public.profiles SET professor_verification_status='rejected', professor_verification_reviewed_at=now() WHERE id='<UUID>';")
    }
  }
} catch (err) {
  console.error("Erro ao gerar relatório:", err.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
