<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api, publico, type Campeonato, type Participante, type Jogo, type EventoJogo } from '../servicos/api'
import { usarSessao } from '../estado/sessao'
import { nomeDoClube, registrar } from '../servicos/clubes'
import { resumoJogos, tabelasPorGrupo, ultimosResultados, rankingJogadores, agruparRodadas } from '../servicos/estatisticas'
import { mensagensCampeonato } from '../servicos/idioma-campeonato'
import Estado from '../componentes/Estado.vue'
import Etiqueta from '../componentes/Etiqueta.vue'
import Foto from '../componentes/Foto.vue'
import Chat from '../componentes/Chat.vue'
import JogoCampeonato from '../componentes/JogoCampeonato.vue'
import RankingCampeonato from '../componentes/RankingCampeonato.vue'
import ConviteEntrar from '../componentes/ConviteEntrar.vue'
import '../estilo/campeonato.css'

const { t, te, locale } = useI18n({ useScope: 'local', messages: mensagensCampeonato })
const sessao = usarSessao()
const rota = useRoute()
const campeonato = ref<Campeonato | null>(null)
const participantes = ref<Participante[]>([])
const jogos = ref<Jogo[]>([])
const eventos = ref<EventoJogo[]>([])
const carregando = ref(true)
const erro = ref<string | null>(null)
const erroEventos = ref(false)
const carregandoEventos = ref(false)
const atualizado = ref('')
const abas = ['classificacao', 'jogos', 'estatisticas', 'regulamento'] as const
const aba = ref<typeof abas[number]>('classificacao')
const clubeFiltro = ref('')
const rodada = ref('')
let versao = 0

const tabelas = computed(() => tabelasPorGrupo(participantes.value))
const resumo = computed(() => resumoJogos(jogos.value))
const rodadas = computed(() => agruparRodadas(jogos.value))
const indiceRodada = computed(() => rodadas.value.findIndex(r => r.chave === rodada.value))
const jogosRodada = computed(() => (rodadas.value.find(r => r.chave === rodada.value)?.jogos ?? [])
  .filter(j => !clubeFiltro.value || [j.clube_a_id, j.clube_b_id].includes(clubeFiltro.value)))
const clubesFiltro = computed(() => [...new Set(jogos.value.flatMap(j => [j.clube_a_id, j.clube_b_id]))].filter(Boolean))
const proximos = computed(() => jogos.value.filter(j => ['AGENDADO', 'CONFIRMADO', 'EM_ANDAMENTO'].includes(j.status.toUpperCase()))
  .sort((a, b) => (Date.parse(a.data_hora ?? '') || Infinity) - (Date.parse(b.data_hora ?? '') || Infinity)).slice(0, 3))
const artilharia = computed(() => rankingJogadores(eventos.value, jogos.value, 'GOL'))
const rankings = computed(() => [
  { titulo: t('artilharia'), lista: artilharia.value },
  { titulo: t('assistencias'), lista: rankingJogadores(eventos.value, jogos.value, 'ASSISTENCIA') },
  { titulo: t('amarelos'), lista: rankingJogadores(eventos.value, jogos.value, 'AMARELO') },
  { titulo: t('vermelhos'), lista: rankingJogadores(eventos.value, jogos.value, 'VERMELHO') },
])
const desempenhoClubes = computed(() => {
  const linhas = tabelas.value.flatMap(g => g.linhas).filter(p => p.jogos > 0)
  return [
    { titulo: t('ataque'), linhas: [...linhas].sort((a, b) => Number(b.gols_pro) - Number(a.gols_pro)).slice(0, 5).map(p => ({ id: p.clube_id, valor: p.gols_pro })) },
    { titulo: t('defesa'), linhas: [...linhas].sort((a, b) => Number(a.gols_contra) - Number(b.gols_contra)).slice(0, 5).map(p => ({ id: p.clube_id, valor: p.gols_contra })) },
  ]
})
const forma = computed(() => Object.fromEntries(participantes.value.map(p => [p.clube_id, ultimosResultados(jogos.value, p.clube_id)])))
const indicadores = computed(() => [
  { nome: t('clubes'), valor: tabelas.value.reduce((n, g) => n + g.linhas.length, 0) },
  { nome: t('encerrados'), valor: resumo.value.finalizados },
  { nome: t('gols'), valor: resumo.value.gols },
  { nome: t('media'), valor: resumo.value.media.toLocaleString(locale.value, { maximumFractionDigits: 2 }) },
])
const fase = (valor: string) => te(valor) ? t(valor) : valor.replaceAll('_', ' ')

async function carregarEventos(id = String(rota.params.id), atual = versao) {
  erroEventos.value = false
  carregandoEventos.value = true
  try {
    const lista = sessao.autenticado
      ? await api.eventosCampeonato(id)
      : await publico.eventos(id)
    if (atual === versao) eventos.value = lista
  } catch {
    if (atual === versao) erroEventos.value = true
  } finally {
    if (atual === versao) carregandoEventos.value = false
  }
}

async function carregar() {
  const atual = ++versao
  const id = String(rota.params.id)
  carregando.value = true
  erro.value = null
  eventos.value = []
  campeonato.value = null
  try {
    // A central inteira é a mesma para quem entrou e para quem só está olhando;
    // muda a origem dos dados, não o que a tela mostra.
    const fonte = sessao.autenticado ? api : publico
    const [c, p, j] = await Promise.all([fonte.campeonato(id), fonte.participantes(id), fonte.jogos(id)])
    if (atual !== versao) return
    campeonato.value = c
    participantes.value = p
    jogos.value = j
    const primeira = rodadas.value.find(r => r.jogos.some(j => ['AGENDADO', 'CONFIRMADO', 'EM_ANDAMENTO'].includes(j.status.toUpperCase())))
    if (!rodadas.value.some(r => r.chave === rodada.value)) rodada.value = primeira?.chave ?? rodadas.value.at(-1)?.chave ?? ''
    atualizado.value = new Date().toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' })
    if (sessao.autenticado) void api.meusClubes().then(registrar).catch(() => {})
    void carregarEventos(id, atual)
  } catch (e) {
    if (atual === versao) erro.value = (e as Error).message
  } finally {
    if (atual === versao) carregando.value = false
  }
}

function mudarRodada(delta: number) {
  const alvo = rodadas.value[indiceRodada.value + delta]
  if (alvo) rodada.value = alvo.chave
}
function navegarAbas(evento: KeyboardEvent, indice: number) {
  let proximo = indice
  if (evento.key === 'ArrowRight') proximo = (indice + 1) % abas.length
  else if (evento.key === 'ArrowLeft') proximo = (indice + abas.length - 1) % abas.length
  else if (evento.key === 'Home') proximo = 0
  else if (evento.key === 'End') proximo = abas.length - 1
  else return
  evento.preventDefault()
  aba.value = abas[proximo]!
  document.getElementById(`aba-${aba.value}`)?.focus()
}
watch(() => rota.params.id, () => { rodada.value = ''; clubeFiltro.value = ''; aba.value = 'classificacao'; void carregar() }, { immediate: true })
</script>

<template>
  <Estado :carregando="carregando" :erro="erro" @recarregar="carregar">
    <section v-if="campeonato" class="secao central-campeonato">
      <RouterLink :to="{ name: 'campeonatos' }" class="voltar-campeonato">← {{ t('voltar') }}</RouterLink>
      <header class="cabecalho-campeonato">
        <div class="identidade-campeonato">
          <Foto pasta="competicao" :id="campeonato.id" :nome="campeonato.nome" classe="h-16 w-16" />
          <div><p class="sobretitulo">{{ t('central') }}</p><h1>{{ campeonato.nome }}</h1><p>{{ [campeonato.cidade, fase(campeonato.formato ?? '')].filter(Boolean).join(' · ') }}</p></div>
        </div>
        <div class="acoes-campeonato"><Etiqueta :status="campeonato.status ?? ''" /><ConviteEntrar v-if="!sessao.autenticado" /><button type="button" class="botao-secundario" @click="carregar">↻ {{ t('atualizar') }}</button><small>{{ t('atualizado') }} {{ atualizado }}</small></div>
      </header>

      <dl class="indicadores-campeonato"><div v-for="item in indicadores" :key="item.nome"><dt>{{ item.nome }}</dt><dd>{{ item.valor }}</dd></div></dl>
      <nav class="abas-campeonato" role="tablist" :aria-label="t('central')">
        <button v-for="(opcao, indice) in abas" :id="`aba-${opcao}`" :key="opcao" type="button" role="tab" :aria-selected="aba === opcao" :aria-controls="`painel-${opcao}`" :tabindex="aba === opcao ? 0 : -1" @click="aba = opcao" @keydown="navegarAbas($event, indice)">{{ t(opcao) }}</button>
      </nav>

      <div :id="`painel-${aba}`" role="tabpanel" :aria-labelledby="`aba-${aba}`" tabindex="0" class="conteudo-campeonato">
        <template v-if="aba === 'classificacao'">
          <div class="grade-classificacao">
            <div class="min-w-0 space-y-5">
              <section v-for="tabela in tabelas" :key="tabela.grupo" class="painel tabela-painel">
                <h2 class="titulo-painel">{{ tabela.grupo ? `${t('grupo')} ${tabela.grupo}` : t('classificacao') }}</h2>
                <div class="rolagem-tabela" tabindex="0" :aria-label="t('classificacao')">
                  <table class="tabela-campeonato">
                    <caption class="sr-only">{{ campeonato.nome }} — {{ t('classificacao') }} {{ tabela.grupo }}</caption>
                    <thead><tr><th scope="col">#</th><th scope="col" class="coluna-clube">{{ t('clube') }}</th><th v-for="col in ['P', 'J', 'V', 'E', 'D', 'GP', 'GC', 'SG', '%']" :key="col" scope="col">{{ col }}</th><th scope="col">{{ t('ultimos') }}</th></tr></thead>
                    <tbody><tr v-for="(p, i) in tabela.linhas" :key="p.clube_id">
                      <td class="posicao-tabela">{{ i + 1 }}</td>
                      <th scope="row" class="coluna-clube"><div class="nome-tabela"><Foto pasta="clube" :id="p.clube_id" :nome="nomeDoClube(p.clube_id)" classe="h-7 w-7" /><span>{{ nomeDoClube(p.clube_id) }}</span></div></th>
                      <td class="pontos-tabela">{{ p.pontos }}</td><td>{{ p.jogos }}</td><td>{{ p.vitorias }}</td><td>{{ p.empates }}</td><td>{{ p.derrotas }}</td><td>{{ p.gols_pro }}</td><td>{{ p.gols_contra }}</td><td>{{ p.saldo_gols }}</td><td>{{ p.aproveitamento }}</td>
                      <td><div class="forma-time"><span v-for="(resultado, index) in forma[p.clube_id]" :key="index" :class="`resultado-${resultado}`" :title="t(resultado)" :aria-label="t(resultado)">{{ resultado }}</span><span v-if="!forma[p.clube_id]?.length">—</span></div></td>
                    </tr></tbody>
                  </table>
                </div>
              </section>
              <p v-if="!tabelas.length" class="painel vazio-campeonato">{{ t('semTabela') }}</p>
              <p class="legenda-tabela">{{ t('legenda') }}</p><p class="legenda-tabela">{{ t('ordem') }}</p>
            </div>
            <aside class="painel agenda-campeonato"><h2 class="titulo-painel">{{ t('proximos') }}</h2><JogoCampeonato v-for="j in proximos" :key="j.id" :jogo="j" /><p v-if="!proximos.length" class="vazio-campeonato">{{ t('semAgenda') }}</p><button type="button" class="link-todos" @click="aba = 'jogos'">{{ t('verJogos') }} →</button></aside>
          </div>
        </template>

        <section v-else-if="aba === 'jogos'" class="painel">
          <div class="filtros-jogos">
            <div class="controle-rodada"><button type="button" class="botao-secundario" :disabled="indiceRodada <= 0" :aria-label="t('anterior')" @click="mudarRodada(-1)">←</button>
              <select v-model="rodada" class="campo" :aria-label="t('rodada')"><option v-for="r in rodadas" :key="r.chave" :value="r.chave">{{ fase(r.fase) }} · {{ t('rodada') }} {{ r.rodada }}</option></select>
              <button type="button" class="botao-secundario" :disabled="indiceRodada < 0 || indiceRodada >= rodadas.length - 1" :aria-label="t('proxima')" @click="mudarRodada(1)">→</button>
            </div>
            <select v-model="clubeFiltro" class="campo filtro-clube" :aria-label="t('filtrar')"><option value="">{{ t('todos') }}</option><option v-for="cid in clubesFiltro" :key="cid" :value="cid">{{ nomeDoClube(cid) }}</option></select>
          </div>
          <div class="grade-jogos"><JogoCampeonato v-for="j in jogosRodada" :key="j.id" :jogo="j" /></div><p v-if="!jogosRodada.length" class="vazio-campeonato" role="status">{{ t('semJogos') }}</p>
        </section>

        <template v-else-if="aba === 'estatisticas'">
          <p class="nota-estatisticas">{{ t('fonte') }}</p>
          <div class="grade-rankings"><section v-for="ranking in desempenhoClubes" :key="ranking.titulo" class="painel"><h2 class="titulo-painel">{{ ranking.titulo }}</h2><ol class="ranking-lista"><li v-for="(p, i) in ranking.linhas" :key="p.id"><span class="ranking-posicao">{{ i + 1 }}</span><Foto pasta="clube" :id="p.id" :nome="nomeDoClube(p.id)" classe="h-9 w-9" /><strong class="ranking-nome">{{ nomeDoClube(p.id) }}</strong><strong class="ranking-valor">{{ p.valor }}</strong></li></ol><p v-if="!ranking.linhas.length" class="vazio-campeonato">{{ t('semEstatisticas') }}</p></section></div>
        </template>

        <section v-else class="painel p-6"><h2 class="titulo-regulamento">{{ t('regulamento') }}</h2><p class="whitespace-pre-line">{{ campeonato.regulamento || t('semRegulamento') }}</p></section>

        <div v-if="aba === 'classificacao' || aba === 'estatisticas'" class="area-artilharia" :aria-busy="carregandoEventos">
          <p v-if="carregandoEventos" class="painel vazio-campeonato" role="status">{{ t('carregando') }}</p>
          <div v-else-if="erroEventos" class="painel erro-ranking" role="alert"><p>{{ t('falhaEventos') }}</p><button type="button" class="botao-secundario" @click="carregarEventos()">{{ t('tentar') }}</button></div>
          <div v-else class="grade-rankings"><RankingCampeonato v-for="ranking in (aba === 'classificacao' ? rankings.slice(0, 2) : rankings)" :key="ranking.titulo" :titulo="ranking.titulo" :lista="ranking.lista" /></div>
          <p v-if="aba === 'classificacao'" class="nota-estatisticas">{{ t('fonte') }}</p>
        </div>
      </div>
      <Chat v-if="sessao.autenticado" class="mt-8" contexto="campeonatos" :id="campeonato.id" :key="campeonato.id" />
      <ConviteEntrar v-else formato="aviso" class="mt-8" :texto="t('entrarParaConversar')" />
    </section>
  </Estado>
</template>
