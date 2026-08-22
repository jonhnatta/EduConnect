export type SessionAccountState = {
  sessionVersion: string | number
  emailVerifiedAt: string | null
  deletedAt: string | null
  accountStatus: string | null
}

export function isSessionAccountStateValid(
  expectedVersion: unknown,
  state: SessionAccountState | null | undefined
): boolean {
  const expected = Number(expectedVersion)
  const current = Number(state?.sessionVersion)
  return Boolean(
    state &&
    state.emailVerifiedAt &&
    !state.deletedAt &&
    state.accountStatus === "active" &&
    Number.isSafeInteger(expected) &&
    Number.isSafeInteger(current) &&
    current === expected
  )
}
