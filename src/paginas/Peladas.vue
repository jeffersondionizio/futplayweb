<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, publico, type Grupo } from '../servicos/api'
import { jogadorEstaNoGrupo } from '../servicos/grupos'
import { usarSessao } from '../estado/sessao'
import Estado from '../componentes/Estado.vue'
import Foto from '../componentes/Foto.vue'
import ConviteEntrar from '../componentes/ConviteEntrar.vue'
import { pontoDe, distanciaKm, formatarDistancia, minhaPosicao, type Ponto } from '../servicos/geo'
import { mensagensGestao } from '../servicos/idioma-gestao'

const { t, locale } = useI18n()
const { t: tg } = useI18n({ useScope: 'local', messages: mensagensGestao })
const sessao = usarSessao()

const aba = ref<'proximas' | 'minhas'>('proximas')
const cidade = ref('')
const lista = ref<Grupo[]>([])
const carregando = ref(false)
const erro = ref<string | null>(null)
const pedidos = ref<Record<string, boolean>>({})
const saindo = ref<Record<string, boolean>>({})

/* ------------------------------ por perto ------------------------------- */

const posicao = ref<Ponto | null>(null)
const buscandoPosicao = ref(false)
const raioKm = ref(25)
const filtroTipo = ref('')
const filtroDia = ref('')
const precoMax = ref('')
const soComVaga = ref(false)

const TIPOS = ['Campo', 'Society', 'Quadra', 'Areia']
const DIAS = ['Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado', 'Domingo']

async function usarMinhaLocalizacao() {
  buscandoPosicao.value = true
  try {
    posicao.value = await minhaPosicao()
  } finally {
    buscandoPosicao.value = false
  }
}

/** Distância até a pelada, ou null quando falta a minha posição ou a dela. */
function distanciaAte(g: Grupo): number | null {
  const destino = pontoDe(g.latitude, g.longitude)
  if (!posicao.value || !destino) return null
  return distanciaKm(posicao.value, destino)
}

const rotuloDistancia = (g: Grupo) => {
  const km = distanciaAte(g)
  return km === null ? '' : formatarDistancia(km, locale.value)
}

const limparFiltros = () => {
  filtroTipo.value = ''
  filtroDia.value = ''
  precoMax.value = ''
  soComVaga.value = false
  raioKm.value = 25
}

const temFiltro = computed(() =>
  Boolean(filtroTipo.value || filtroDia.value || precoMax.value || soComVaga.value))

const jaParticipo = (grupo: Grupo) =>
  aba.value === 'minhas' || jogadorEstaNoGrupo(grupo, sessao.jogador?.id ?? '')

async function carregar() {
  carregando.value = true
  erro.value = null
  try {
    const busca = cidade.value.trim()

    // Deslogado só existe a vitrine pública, e é o que a aba "minhas" nem chega
    // a oferecer — ela some do template nesse caso.
    if (!sessao.autenticado) {
      lista.value = await publico.peladas(busca)
      return
    }

    if (aba.value === 'minhas') lista.value = await api.meusGrupos()
    else if (busca) lista.value = await api.gruposPorCidade(busca)
    // Sem cidade, "próximas" passa pela vitrine pública mesmo logado: ela é a
    // única que enxerga a base inteira, e só devolve campo de vitrine — nada de
    // pessoa. É o que permite ordenar por distância sem pedir a cidade antes.
    else lista.value = await publico.peladas('')
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    carregando.value = false
  }
}

async function pedirEntrada(g: Grupo) {
  try {
    await api.solicitarEntradaGrupo(g.id)
    pedidos.value[g.id] = true
  } catch (e) {
    erro.value = (e as Error).message
  }
}

async function sairDaPelada(g: Grupo) {
  const jogadorId = sessao.jogador?.id
  if (!jogadorId) return
  saindo.value[g.id] = true
  erro.value = null
  try {
    await api.sairDoGrupo(g.id, jogadorId)
    await carregar()
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    saindo.value[g.id] = false
  }
}

const dataLegivel = (iso?: string) => {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(locale.value, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/**
 * Busca local, por cima do que já está carregado.
 *
 * A busca por cidade vai ao servidor porque é o índice que decide o conjunto;
 * esta aqui só afunila o que já está na tela, por nome ou local, e por isso
 * responde a cada tecla sem custo nenhum.
 */
const termo = ref('')
const visiveis = computed(() => {
  const busca = termo.value.trim().toLowerCase()
  const teto = Number(precoMax.value)

  const filtradas = lista.value.filter((g) => {
    if (busca && ![g.nome, g.local, g.cidade, g.dia_semana].some((c) => c?.toLowerCase().includes(busca))) return false
    if (filtroTipo.value && g.tipo_pelada !== filtroTipo.value) return false
    if (filtroDia.value && g.dia_semana !== filtroDia.value) return false
    if (precoMax.value && Number.isFinite(teto) && Number(g.valor ?? 0) > teto) return false
    if (soComVaga.value) {
      const o = ocupacao(g)
      if (o && o.dentro >= o.total) return false
    }
    // O raio só corta quando dá para medir: pelada sem coordenada continua
    // visível, senão o filtro esconderia justamente quem não preencheu o mapa.
    if (posicao.value) {
      const km = distanciaAte(g)
      if (km !== null && km > raioKm.value) return false
    }
    return true
  })

  if (!posicao.value) return filtradas
  // Com posição conhecida, perto primeiro; sem coordenada vai para o fim.
  return [...filtradas].sort((a, b) => {
    const da = distanciaAte(a) ?? Number.POSITIVE_INFINITY
    const db = distanciaAte(b) ?? Number.POSITIVE_INFINITY
    return da - db
  })
})

/** Quanto da pelada já está preenchido, para a barra de vagas. */
const ocupacao = (g: Grupo) => {
  const total = Number(g.qtde_jogadores ?? 0)
  const dentro = Number(g.inscritos ?? 0)
  if (!Number.isFinite(total) || total <= 0) return null
  return { dentro, total, porcento: Math.min(100, Math.round((dentro / total) * 100)) }
}

onMounted(carregar)
</script>

<template>
  <section class="secao py-10">
    <header class="capa-lista">
      <h1>{{ t('peladas.h1') }}</h1>
      <p>{{ t('peladas.lead') }}</p>

      <div v-if="sessao.autenticado" class="abas-lista" role="tablist">
        <button
          v-for="opcao in (['proximas', 'minhas'] as const)"
          :key="opcao"
          type="button"
          role="tab"
          class="aba-lista"
          :aria-selected="aba === opcao"
          @click="aba = opcao; carregar()"
        >{{ t(`peladas.${opcao}`) }}</button>
      </div>
    </header>

    <ConviteEntrar v-if="!sessao.autenticado" formato="aviso" />

    <form class="barra-filtros" @submit.prevent="carregar">
      <input v-model="cidade" class="campo" :placeholder="t('peladas.buscarCidade')" />
      <button type="submit" class="botao-primario">{{ t('comum.buscar') }}</button>
      <button v-if="cidade" type="button" class="botao-secundario" @click="cidade = ''; carregar()">
        {{ t('comum.limpar') }}
      </button>
      <input v-model="termo" class="campo" type="search" :placeholder="t('comum.filtrarNaLista')" />
      <button type="button" class="botao-secundario" :disabled="buscandoPosicao" @click="usarMinhaLocalizacao">
        {{ buscandoPosicao ? tg('buscandoLocal') : tg('perto') }}
      </button>
      <span v-if="lista.length" class="contagem-resultado">
        {{ t('comum.resultados', visiveis.length) }}
      </span>
    </form>

    <div class="painel mt-3 flex flex-wrap items-end gap-4 p-4">
      <label class="block">
        <span class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ tg('filtroTipo') }}</span>
        <select v-model="filtroTipo" class="campo mt-1">
          <option value="">{{ tg('todos') }}</option>
          <option v-for="tp in TIPOS" :key="tp" :value="tp">{{ tp }}</option>
        </select>
      </label>
      <label class="block">
        <span class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ tg('filtroDia') }}</span>
        <select v-model="filtroDia" class="campo mt-1">
          <option value="">{{ tg('todos') }}</option>
          <option v-for="d in DIAS" :key="d" :value="d">{{ d }}</option>
        </select>
      </label>
      <label class="block">
        <span class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ tg('precoAte') }}</span>
        <input v-model="precoMax" inputmode="numeric" class="campo mt-1 w-24" placeholder="—" />
      </label>
      <label v-if="posicao" class="block">
        <span class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">
          {{ tg('raio') }}: {{ raioKm }} km
        </span>
        <input v-model.number="raioKm" type="range" min="1" max="100" step="1" class="mt-2 block w-40" />
      </label>
      <label class="flex items-center gap-2 pb-2">
        <input v-model="soComVaga" type="checkbox" class="h-4 w-4" />
        <span class="text-sm font-semibold">{{ tg('comVaga') }}</span>
      </label>
      <button v-if="temFiltro" type="button" class="botao-secundario" @click="limparFiltros">
        {{ tg('limparFiltros') }}
      </button>
      <p v-if="!posicao" class="w-full text-xs text-[var(--color-tinta-fraca)]">{{ tg('semLocalizacao') }}</p>
    </div>

    <Estado
      :carregando="carregando"
      :erro="erro"
      :vazio="!visiveis.length"
      :texto-vazio="t('peladas.vazio')"
      @recarregar="carregar"
    >
      <ul class="grade-cartoes">
        <li v-for="g in visiveis" :key="g.id" class="cartao">
          <div class="cartao-topo">
            <Foto pasta="grupo" :id="g.id" :nome="g.nome" classe="h-9 w-9" />
            <div class="cartao-identidade">
              <h2 class="cartao-titulo">{{ g.nome }}</h2>
              <p class="cartao-local">
                <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" />
                </svg>
                <span class="truncate">{{ g.cidade || t('comum.naoInformado') }}</span>
                <span v-if="rotuloDistancia(g)" class="shrink-0 rounded-full bg-[var(--color-marca-claro)] px-2 py-0.5 text-xs font-bold text-[var(--color-marca)]">
                  {{ rotuloDistancia(g) }}
                </span>
              </p>
            </div>
          </div>

          <div v-if="g.tipo_pelada || g.pelada_proxima === 'true'" class="cartao-selos">
            <span v-if="g.pelada_proxima === 'true'" class="selo">● {{ t('peladas.jogoMarcado') }}</span>
            <span v-if="g.tipo_pelada" class="selo selo-neutro">{{ g.tipo_pelada }}</span>
          </div>

          <!--
            Quando, onde, quanto e quantos numa linha só.
            Quatro pares rótulo/valor em grade davam ao card a altura de uma
            ficha, e cada um deles cabe em duas palavras.
          -->
          <p class="cartao-linha">
            <svg class="icone-linha" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            <span>{{ g.data_peladaproxima ? dataLegivel(g.data_peladaproxima) : (g.dia_semana || '-') }}</span>
          </p>
          <p class="cartao-linha">
            <svg class="icone-linha" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" />
            </svg>
            <span class="truncate">{{ g.local || t('comum.naoInformado') }}</span>
          </p>

          <div class="cartao-medidores">
            <span class="valor-pelada" :class="{ gratis: !g.valor || g.valor === '0' }">
              {{ g.valor && g.valor !== '0' ? `R$ ${g.valor}` : t('peladas.gratis') }}
            </span>
            <span class="vagas-texto">
              {{ g.inscritos ?? '0' }}<template v-if="ocupacao(g)">/{{ ocupacao(g)!.total }}</template>
              {{ t('peladas.inscritos') }}
            </span>
            <div v-if="ocupacao(g)" class="barra-vagas" :class="{ cheia: ocupacao(g)!.porcento >= 100 }">
              <i :style="{ width: `${ocupacao(g)!.porcento}%` }" />
            </div>
          </div>

          <div class="cartao-rodape">
            <RouterLink :to="{ name: 'pelada', params: { id: g.id } }" class="botao-secundario">
              {{ t('comum.ver') }}
            </RouterLink>
            <button
              v-if="sessao.autenticado && jaParticipo(g)"
              type="button"
              class="botao-secundario"
              :disabled="saindo[g.id]"
              @click="sairDaPelada(g)"
            >
              {{ saindo[g.id] ? t('peladas.saindo') : t('peladas.sair') }}
            </button>
            <button
              v-else-if="sessao.autenticado"
              type="button"
              class="botao-primario"
              :disabled="pedidos[g.id] || g.pedido_pendente"
              @click="pedirEntrada(g)"
            >
              {{ pedidos[g.id] || g.pedido_pendente ? t('peladas.pedidoEnviado') : t('peladas.pedirEntrada') }}
            </button>
            <ConviteEntrar v-else-if="!sessao.autenticado" />
          </div>
        </li>
      </ul>
    </Estado>
    <article class="painel mt-8 p-6">
      <h2 class="text-2xl font-extrabold">Organize sua pelada sem deixar ninguém de fora</h2>
      <p class="mt-3 text-[var(--color-tinta-suave)]">Defina local, horário e quantidade de vagas. Peça confirmação dos jogadores antes do jogo e use o sorteador de times quando a lista estiver fechada.</p>
      <RouterLink :to="{ name: 'sorteio' }" class="mt-4 inline-block font-bold text-[var(--color-marca)]">Abrir sorteador de times →</RouterLink>
    </article>
  </section>
</template>
