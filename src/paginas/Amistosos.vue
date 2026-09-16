<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, publico, type Amistoso, type Clube } from '../servicos/api'
import { usarSessao } from '../estado/sessao'
import Estado from '../componentes/Estado.vue'
import Etiqueta from '../componentes/Etiqueta.vue'
import Foto from '../componentes/Foto.vue'
import ConviteEntrar from '../componentes/ConviteEntrar.vue'
import { nomeDoClube, registrar } from '../servicos/clubes'

const { t, locale } = useI18n()
const sessao = usarSessao()

const ESCOPOS = ['meus', 'recebidos', 'abertos', 'historico'] as const
/** Quem não entrou não tem "meus" nem "recebidos" — só o que é de todos. */
const ESCOPOS_VISITANTE = ['abertos', 'todos'] as const
type Escopo = (typeof ESCOPOS)[number] | 'todos'

const abas = computed<readonly Escopo[]>(() =>
  (sessao.autenticado ? ESCOPOS : ESCOPOS_VISITANTE))

const aba = ref<Escopo>('meus')
const lista = ref<Amistoso[]>([])
const meusClubes = ref<Clube[]>([])
const carregando = ref(false)
const erro = ref<string | null>(null)
const enviados = ref<Record<string, boolean>>({})

const nomeClube = (id: string) =>
  id ? nomeDoClube(id) : t('amistosos.aguardandoAdversario')

async function carregar() {
  carregando.value = true
  erro.value = null
  try {
    if (!sessao.autenticado) {
      lista.value = await publico.amistosos(aba.value === 'abertos')
      return
    }
    // Os clubes vêm primeiro: a lista mostra nomes e a API devolve só ids.
    if (!meusClubes.value.length) {
      meusClubes.value = await api.meusClubes()
      registrar(meusClubes.value)
    }
    lista.value = await api.amistosos(aba.value as Exclude<Escopo, 'todos'>)
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    carregando.value = false
  }
}

async function candidatar(a: Amistoso) {
  const clube = meusClubes.value[0]
  if (!clube) return
  try {
    await api.candidatarAmistoso(a.id, clube.id)
    enviados.value[a.id] = true
  } catch (e) {
    erro.value = (e as Error).message
  }
}

/** Filtro local: o nome do clube já está resolvido em memória pelo cache. */
const termo = ref('')
const visiveis = computed(() => {
  const busca = termo.value.trim().toLowerCase()
  if (!busca) return lista.value
  return lista.value.filter((a) => [
    nomeClube(a.clube_mandante_id), nomeClube(a.clube_visitante_id),
    a.cidade, a.local_nome, a.status,
  ].some((campo) => campo?.toLowerCase().includes(busca)))
})

/**
 * Quem venceu, para o card ler como resultado e não como duas linhas soltas.
 * Empate não destaca ninguém, e jogo não encerrado não tem vencedor.
 */
function vencedor(a: Amistoso): 'mandante' | 'visitante' | null {
  if (a.status !== 'FINALIZADO') return null
  const casa = Number(a.placar_mandante ?? 0)
  const fora = Number(a.placar_visitante ?? 0)
  if (casa === fora) return null
  return casa > fora ? 'mandante' : 'visitante'
}

const quando = (iso?: string) => {
  if (!iso) return '-'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(locale.value, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// A sessão é restaurada depois da montagem; quando ela chega, a aba padrão do
// visitante deixa de existir e a lista precisa ser refeita com as rotas certas.
watch(
  () => sessao.autenticado,
  (entrou) => {
    aba.value = entrou ? 'meus' : 'abertos'
    carregar()
  },
)

onMounted(() => {
  if (!sessao.autenticado) aba.value = 'abertos'
  carregar()
})
</script>

<template>
  <section class="secao py-10">
    <header class="capa-lista">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{{ t('amistosos.titulo') }}</h1>
          <p>{{ t('amistosos.chamada') }}</p>
        </div>
        <RouterLink v-if="sessao.autenticado" :to="{ name: 'criar-amistoso' }" class="botao-primario shrink-0">
          + {{ t('criar.amistoso') }}
        </RouterLink>
      </div>

      <div class="abas-lista" role="tablist">
        <button
          v-for="e in abas"
          :key="e"
          type="button"
          role="tab"
          class="aba-lista"
          :aria-selected="aba === e"
          @click="aba = e; carregar()"
        >{{ t(`amistosos.${e}`) }}</button>
      </div>
    </header>

    <ConviteEntrar v-if="!sessao.autenticado" formato="aviso" />

    <div v-if="lista.length" class="barra-filtros">
      <input v-model="termo" class="campo" type="search" :placeholder="t('comum.filtrarNaLista')" />
      <span class="contagem-resultado">{{ t('comum.resultados', visiveis.length) }}</span>
    </div>

    <Estado
      :carregando="carregando"
      :erro="erro"
      :vazio="!visiveis.length"
      :texto-vazio="t('amistosos.vazio')"
      @recarregar="carregar"
    >
      <ul class="grade-cartoes">
        <li v-for="a in visiveis" :key="a.id" class="cartao">
          <!-- Mesma anatomia dos outros cards: a identidade aqui é o confronto. -->
          <div class="cartao-topo">
            <Foto pasta="clube" :id="a.clube_mandante_id" :nome="nomeClube(a.clube_mandante_id)" classe="h-9 w-9" />
            <div class="cartao-identidade">
              <h2 class="cartao-titulo">
                {{ nomeClube(a.clube_mandante_id) }} × {{ nomeClube(a.clube_visitante_id) }}
              </h2>
              <p class="cartao-local">
                <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" />
                </svg>
                <span class="truncate">{{ a.cidade || t('comum.naoInformado') }}</span>
              </p>
            </div>
          </div>

          <div class="cartao-selos">
            <Etiqueta :status="a.status" />
            <span v-if="a.tipo" class="selo selo-neutro">{{ a.tipo }}</span>
          </div>

          <!-- Uma linha por clube: o escudo à esquerda, o gol à direita. -->
          <div class="amistoso-confronto">
            <div class="amistoso-lado" :class="{ venceu: vencedor(a) === 'mandante', perdeu: vencedor(a) === 'visitante' }">
              <Foto pasta="clube" :id="a.clube_mandante_id" :nome="nomeClube(a.clube_mandante_id)" classe="h-7 w-7" />
              <span class="amistoso-nome">{{ nomeClube(a.clube_mandante_id) }}</span>
              <span v-if="a.status === 'FINALIZADO'" class="amistoso-gols">{{ a.placar_mandante ?? 0 }}</span>
            </div>
            <div
              class="amistoso-lado"
              :class="{
                indefinido: !a.clube_visitante_id,
                venceu: vencedor(a) === 'visitante',
                perdeu: vencedor(a) === 'mandante',
              }"
            >
              <Foto
                v-if="a.clube_visitante_id"
                pasta="clube"
                :id="a.clube_visitante_id"
                :nome="nomeClube(a.clube_visitante_id)"
                classe="h-7 w-7"
              />
              <span v-else aria-hidden="true" class="amistoso-vago">?</span>
              <span class="amistoso-nome">{{ nomeClube(a.clube_visitante_id) }}</span>
              <span v-if="a.status === 'FINALIZADO'" class="amistoso-gols">{{ a.placar_visitante ?? 0 }}</span>
            </div>
          </div>

          <p class="cartao-linha">
            <svg class="icone-linha" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            <span>{{ quando(a.data_hora) }}</span>
          </p>
          <p class="cartao-linha">
            <svg class="icone-linha" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" />
            </svg>
            <span class="truncate">{{ a.local_nome || a.cidade || t('comum.naoInformado') }}</span>
          </p>

          <!--
            O rodapé só existe quando há o que fazer. Antes ele repetia o status
            num botão morto, logo abaixo da etiqueta que já dizia a mesma coisa.
          -->
          <div v-if="aba === 'abertos' && (meusClubes.length || !sessao.autenticado)" class="cartao-rodape">
            <button
              v-if="meusClubes.length"
              type="button"
              class="botao-primario"
              :disabled="enviados[a.id]"
              @click="candidatar(a)"
            >{{ enviados[a.id] ? t('amistosos.candidatado') : t('amistosos.candidatar') }}</button>
            <ConviteEntrar v-else :texto="t('amistosos.candidatar')" />
          </div>
        </li>
      </ul>
    </Estado>
  </section>
</template>
