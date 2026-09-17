import test from 'node:test'
import assert from 'node:assert/strict'
import { resumoJogos, rankingJogadores, ultimosResultados, agruparRodadas, tabelasPorGrupo, zonaDaPosicao } from '../src/servicos/estatisticas.ts'
import { proximoHorario, ordenarAgenda } from '../src/servicos/agenda.ts'
import { extrairNomes, sortearTimes } from '../src/servicos/sorteio.ts'
import { registrarVisita } from '../src/servicos/visitas.ts'
import { jogadorEstaNoGrupo } from '../src/servicos/grupos.ts'

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
test('zona da tabela só existe quando o campeonato define o que ela vale', () => {
  // Pontos corridos com 10 clubes e 4 classificados: G-4, repescagem no 5º, Z-2.
  const zonas = Array.from({ length: 10 }, (_, i) => zonaDaPosicao(i + 1, 10, 4, false))
  assert.deepEqual(zonas, [
    'classificado', 'classificado', 'classificado', 'classificado', 'repescagem',
    null, null, null, 'rebaixamento', 'rebaixamento',
  ])
  // Grupo elimina, não rebaixa: só o corte de classificação aparece.
  assert.deepEqual(
    Array.from({ length: 4 }, (_, i) => zonaDaPosicao(i + 1, 4, 2, true)),
    ['classificado', 'classificado', null, null],
  )
  // Tabela curta demais não tem zona nenhuma, e sem classificados não há corte.
  assert.equal(zonaDaPosicao(1, 2, 1, false), null)
  assert.equal(zonaDaPosicao(1, 8, 0, false), null)
  assert.equal(zonaDaPosicao(8, 8, 0, false), 'rebaixamento')
})

test('agenda aceita data explícita e recorrência semanal em português, inclusive terça com acento', () => {
  const agora = new Date('2026-09-16T18:00:00')
  const explicito = proximoHorario('20/09/2026', '19:30', agora)
  const terca = proximoHorario('terça-feira', '19:30', agora)
  const quarta = proximoHorario('quarta', '17:00', agora)
  assert.deepEqual([explicito?.getDate(), explicito?.getHours(), explicito?.getMinutes()], [20, 19, 30])
  assert.deepEqual([terca?.getDay(), terca?.getHours()], [2, 19])
  assert.deepEqual([quarta?.getDay(), quarta?.getHours()], [3, 17])
  assert.equal(proximoHorario('dia inválido', '17:00', agora), null)
  assert.equal(proximoHorario('quarta', '25:00', agora), null)
})

test('agenda ordena próximos compromissos e deixa horários desconhecidos no fim', () => {
  const agora = new Date('2026-09-16T18:00:00')
  const agenda = ordenarAgenda([
    { id: 'sem-hora', dia_semana: 'quarta', nome: 'Sem hora' },
    { id: 'sabado', dia_semana: 'sábado', hora_inicio: '09:00', nome: 'Sábado' },
    { id: 'sexta', dia_semana: 'sexta', hora_inicio: '20:00', nome: 'Sexta' },
  ], agora)
  assert.deepEqual(agenda.map((item) => item.grupo.id), ['sexta', 'sabado', 'sem-hora'])
})

test('sorteio respeita o limite e numera a sobra como mais um time normal', () => {
  assert.deepEqual(extrairNomes('1. Ana\n• Bruno\nANA\nPix: 123\n\nCarlos'), ['Ana', 'Bruno', 'Carlos'])
  const times = sortearTimes(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'], 5, () => 0.5)
  assert.deepEqual(times.map((time) => time.jogadores.length), [5, 5, 1])
  assert.deepEqual(times.map((time) => time.numero), [1, 2, 3])
  assert.equal(times.some((time) => 'reserva' in time), false)
  assert.equal(times.every((time) => time.jogadores.length <= 5), true)
  assert.equal(new Set(times.flatMap((time) => time.jogadores)).size, 11)
})

test('contador registra uma visita por sessão e mantém o total deste navegador', () => {
  const armazenamento = new Map()
  const sessao = new Map()
  assert.equal(registrarVisita(armazenamento, sessao), 1)
  assert.equal(registrarVisita(armazenamento, sessao), 1)
  assert.equal(registrarVisita(armazenamento, new Map()), 2)
})

test('participação reconhece criador e inscritos, sem confundir IDs parecidos', () => {
  assert.equal(jogadorEstaNoGrupo({ criado_por: 'criador', participantes: 'ana, bruno, carlos' }, 'bruno'), true)
  assert.equal(jogadorEstaNoGrupo({ criado_por: 'criador', participantes: 'ana,bruno' }, 'bru'), false)
  assert.equal(jogadorEstaNoGrupo({ criado_por: 'criador' }, 'criador'), true)
  assert.equal(jogadorEstaNoGrupo({ participantes: '' }, 'ana'), false)
})
