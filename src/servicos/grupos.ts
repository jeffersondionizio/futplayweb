type GrupoParticipacao = { criado_por?: string; participantes?: string }

/** O backend ainda serializa participantes como CSV; comparar por item evita falsos positivos. */
export function jogadorEstaNoGrupo(grupo: GrupoParticipacao, jogadorId: string): boolean {
  if (!jogadorId) return false
  if (grupo.criado_por === jogadorId) return true
  return (grupo.participantes ?? '').split(',').some((id) => id.trim() === jogadorId)
}
