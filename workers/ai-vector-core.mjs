import { createHash } from "node:crypto"

export const DENSE_VECTOR_NAME = "dense"
export const SPARSE_VECTOR_NAME = "sparse"
export const SPARSE_VECTOR_SCHEMA = "hashed-tf-v1"
export const REQUIRED_VECTOR_SCHEMA_VERSION = 2

const MAX_SPARSE_BUCKET = 2 ** 31 - 1

function sparseIndex(token) {
  return createHash("sha256").update(`${SPARSE_VECTOR_SCHEMA}:${token}`).digest().readUInt32BE(0) % MAX_SPARSE_BUCKET
}

export function sparseVectorForText(input) {
  if (typeof input !== "string" || !input.trim()) throw new Error("invalid_sparse_text")
  const tokens = input.normalize("NFKC").toLocaleLowerCase("pt-BR").match(/[\p{L}\p{N}]+/gu) ?? []
  if (!tokens.length) throw new Error("invalid_sparse_text")
  const counts = new Map()
  for (const token of tokens) {
    const index = sparseIndex(token)
    counts.set(index, (counts.get(index) ?? 0) + 1)
  }
  const entries = [...counts.entries()].sort(([left], [right]) => left - right)
  const rawValues = entries.map(([, count]) => 1 + Math.log(count))
  const magnitude = Math.sqrt(rawValues.reduce((sum, value) => sum + value * value, 0))
  if (!Number.isFinite(magnitude) || magnitude <= 0) throw new Error("invalid_sparse_vector")
  return {
    indices: entries.map(([index]) => index),
    values: rawValues.map((value) => value / magnitude),
  }
}

export function validSparseVector(vector) {
  if (!vector || !Array.isArray(vector.indices) || !Array.isArray(vector.values) ||
      vector.indices.length === 0 || vector.indices.length !== vector.values.length) return false
  let previous = -1
  for (let index = 0; index < vector.indices.length; index += 1) {
    const position = vector.indices[index]
    const value = vector.values[index]
    if (!Number.isInteger(position) || position < 0 || position <= previous || !Number.isFinite(value) || value <= 0) return false
    previous = position
  }
  return true
}

export function validateHybridCollection(collection, expectedDimensions) {
  const params = collection?.config?.params
  const dense = params?.vectors?.[DENSE_VECTOR_NAME]
  const sparse = params?.sparse_vectors?.[SPARSE_VECTOR_NAME]
  if (!dense || dense.size !== expectedDimensions || String(dense.distance).toLowerCase() !== "cosine" ||
      !sparse || typeof sparse !== "object") {
    throw new Error("qdrant_collection_incompatible")
  }
}
