import test from 'node:test'
import assert from 'node:assert/strict'
import { resumoJogos, rankingJogadores, ultimosResultados, agruparRodadas, tabelasPorGrupo } from '../src/servicos/estatisticas.ts'

const jogo = (id, extra = {}) => ({ id, campeonato_id: 'c', rodada: '1', fase: 'GRUPOS', grupo_id: null, clube_a_id: 'a', clube_b_id: 'b', status: 'FINALIZADO', placar_a: '2', placar_b: '1', ...extra })
test('resumo só conta placares válidos de partidas finalizadas, incluindo zero a zero', () => {
  assert.deepEqual(resumoJogos([jogo('1'), jogo('2', { placar_a: '0', placar_b: '0' }), jogo('3', { status: 'AGENDADO' }), jogo('4', { placar_a: '' }), jogo('5', { placar_a: '-1' })]), { finalizados: 2, gols: 3, media: 1.5, empates: 1 })
  assert.deepEqual(resumoJogos([]), { finalizados: 0, gols: 0, media: 0, empates: 0 })
})
test('artilharia separa homônimos, ignora eventos duplicados e partidas não encerradas', () => {
  const evento = (id, jogador_id, extra = {}) => ({ id, jogo_id: '1', jogador_id, jogador_nome: 'João', clube_id: 'a', tipo: 'GOL', ...extra })
  const ranking = rankingJogadores([evento('e1', 'p1'), evento('e1', 'p1'), evento('e2', 'p2'), evento('e3', 'p1'), evento('e4', 'p1', { tipo: 'ASSISTENCIA' }), evento('e5', 'p1', { jogo_id: '2' }), evento('e6', 'p1', { tipo: 'GOL_CONTRA' })], [jogo('1'), jogo('2', { status: 'AGENDADO' })], 'GOL')
  assert.deepEqual(ranking.map(p => [p.id, p.total, p.posicao]), [['p1', 2, 1], ['p2', 1, 2]])
})
test('ranking mantém empate e suporta nomes sem ID sem juntar clubes diferentes', () => {
  const eventos = ['a', 'b'].map(clube_id => ({ id: clube_id, jogo_id: '1', jogador_id: '', jogador_nome: 'Alex', clube_id, tipo: 'AMARELO' }))
  assert.deepEqual(rankingJogadores(eventos, [jogo('1')], 'AMARELO').map(p => p.posicao), [1, 1])
})
test('últimos resultados respeitam mando, data e limite de cinco', () => {
  const jogos = Array.from({ length: 7 }, (_, i) => jogo(String(i), { data_hora: `2026-09-${10 + i}T12:00:00Z` }))
  assert.deepEqual(ultimosResultados(jogos.reverse(), 'b'), ['D', 'D', 'D', 'D', 'D'])
  assert.deepEqual(ultimosResultados([jogo('1', { placar_a: '1' }), jogo('2', { status: 'CANCELADO' })], 'a'), ['E'])
  assert.deepEqual(ultimosResultados(jogos, 'desconhecido'), [])
})
test('rodadas são numéricas e separadas por fase; jogos sem data ficam no fim', () => {
  const grupos = agruparRodadas([jogo('10', { rodada: '10' }), jogo('2', { rodada: '2' }), jogo('f', { fase: 'FINAL', rodada: '1' })])
  assert.deepEqual(grupos.map(g => g.jogos[0].id), ['2', '10', 'f'])
  assert.deepEqual(agruparRodadas([jogo('sem-data'), jogo('datado', { data_hora: '2026-09-10T12:00:00Z' })])[0].jogos.map(j => j.id), ['datado', 'sem-data'])
})
test('tabela conserva desempate oficial da API e separa grupos, excluindo pendentes', () => {
  const p = (clube_id, grupo_fase, status = 'CONFIRMADO') => ({ clube_id, grupo_fase, status, vitorias: '1', empates: '1', derrotas: '0', pontos: '4' })
  const tabelas = tabelasPorGrupo([p('b', 'A'), p('a', 'A'), p('c', 'B'), p('d', 'A', 'PENDENTE')])
  assert.deepEqual(tabelas.map(g => g.linhas.map(l => l.clube_id)), [['b', 'a'], ['c']])
  assert.equal(tabelas[0].linhas[0].aproveitamento, 67)
  assert.equal(tabelas[0].linhas[0].jogos, 2)
  assert.equal(tabelasPorGrupo([{ ...p('z', ''), vitorias: '0', empates: '0', derrotas: '0', pontos: '0' }])[0].linhas[0].aproveitamento, 0)
})
