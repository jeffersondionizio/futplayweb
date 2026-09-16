import type { EventoJogo, Jogo, Participante } from './api'

const numero = (valor: unknown) => Number.isFinite(Number(valor)) ? Number(valor) : 0
const placarValido = (valor: unknown) => typeof valor === 'string' && /^\d+$/.test(valor.trim())
export const finalizado = (j: Jogo) => j.status.toUpperCase() === 'FINALIZADO' && placarValido(j.placar_a) && placarValido(j.placar_b)
const data = (j: Jogo) => Date.parse(j.data_hora ?? '') || Infinity

export function resumoJogos(jogos: Jogo[]) {
  const encerrados = jogos.filter(finalizado)
  const gols = encerrados.reduce((s, j) => s + numero(j.placar_a) + numero(j.placar_b), 0)
  return { finalizados: encerrados.length, gols, media: encerrados.length ? gols / encerrados.length : 0,
    empates: encerrados.filter(j => numero(j.placar_a) === numero(j.placar_b)).length }
}

export function tabelasPorGrupo(participantes: Participante[]) {
  const grupos = new Map<string, (Participante & { jogos: number; aproveitamento: number })[]>()
  // A API aplica confronto direto e fair play. Preservar a ordem oficial.
  for (const p of participantes.filter(p => p.status.toUpperCase() === 'CONFIRMADO')) {
    const grupo = p.grupo_fase?.trim() ?? ''
    const jogos = numero(p.vitorias) + numero(p.empates) + numero(p.derrotas)
    if (!grupos.has(grupo)) grupos.set(grupo, [])
    grupos.get(grupo)!.push({ ...p, jogos, aproveitamento: jogos ? Math.round(numero(p.pontos) / (jogos * 3) * 100) : 0 })
  }
  return [...grupos].map(([grupo, linhas]) => ({ grupo, linhas }))
}

export type Zona = 'classificado' | 'repescagem' | 'rebaixamento' | null

/**
 * A faixa colorida da linha, no papel que ela tem na tabela do Brasileirão: a
 * posição sozinha não diz nada, o que informa é o que ela garante.
 *
 * Só as zonas que o campeonato realmente define aparecem. `classificados` vem do
 * cadastro; quando a competição tem grupos, quem passa é o topo de cada grupo e
 * não existe rebaixamento — grupo não rebaixa ninguém, elimina. Em pontos
 * corridos com gente suficiente, as duas últimas colocações são a zona de baixo,
 * e a linha seguinte à de classificação é a repescagem.
 */
export function zonaDaPosicao(
  posicao: number,
  total: number,
  classificados: number,
  temGrupos: boolean,
): Zona {
  if (total < 3) return null
  if (classificados > 0 && posicao <= classificados) return 'classificado'
  if (temGrupos) return null
  if (classificados > 0 && posicao === classificados + 1) return 'repescagem'
  if (total >= 6 && posicao > total - 2) return 'rebaixamento'
  return null
}

export function ultimosResultados(jogos: Jogo[], clube: string): ('V' | 'E' | 'D')[] {
  return jogos.filter(j => finalizado(j) && [j.clube_a_id, j.clube_b_id].includes(clube))
    .sort((a, b) => data(a) - data(b) || numero(a.rodada) - numero(b.rodada))
    .slice(-5).map(j => {
      const saldo = (numero(j.placar_a) - numero(j.placar_b)) * (j.clube_a_id === clube ? 1 : -1)
      return saldo > 0 ? 'V' : saldo < 0 ? 'D' : 'E'
    })
}

export function agruparRodadas(jogos: Jogo[]) {
  const fases = ['PONTOS_CORRIDOS', 'GRUPOS', 'FASE_GRUPOS', 'MATA_MATA', 'OITAVAS', 'QUARTAS', 'SEMIFINAL', 'FINAL']
  const grupos = new Map<string, { chave: string; fase: string; rodada: string; jogos: Jogo[] }>()
  for (const j of jogos) {
    const chave = `${j.fase}:${j.rodada}`
    if (!grupos.has(chave)) grupos.set(chave, { chave, fase: j.fase, rodada: j.rodada, jogos: [] })
    grupos.get(chave)!.jogos.push(j)
  }
  return [...grupos.values()].sort((a, b) => fases.indexOf(a.fase) - fases.indexOf(b.fase) || numero(a.rodada) - numero(b.rodada))
    .map(g => ({ ...g, jogos: g.jogos.sort((a, b) => data(a) - data(b)) }))
}

export function rankingJogadores(eventos: EventoJogo[], jogos: Jogo[], tipo: string) {
  const validos = new Set(jogos.filter(finalizado).map(j => j.id))
  const vistos = new Set<string>()
  const jogadores = new Map<string, { id: string; nome: string; clube: string; total: number }>()
  for (const e of eventos) {
    if (!validos.has(e.jogo_id) || e.tipo.toUpperCase() !== tipo || !e.jogador_nome.trim()) continue
    const chaveEvento = `${e.jogo_id}:${e.id}`
    if (e.id && vistos.has(chaveEvento)) continue
    if (e.id) vistos.add(chaveEvento)
    const chave = e.jogador_id || `${e.clube_id}:${e.jogador_nome.trim()}`
    const jogador = jogadores.get(chave) ?? { id: e.jogador_id, nome: e.jogador_nome.trim(), clube: e.clube_id, total: 0 }
    jogador.total++
    jogadores.set(chave, jogador)
  }
  const lista = [...jogadores.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome))
  let posicao = 0
  return lista.map((j, i) => {
    if (!i || lista[i - 1]!.total !== j.total) posicao = i + 1
    return { ...j, posicao }
  })
}
