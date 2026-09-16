<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, publico, type Grupo } from '../servicos/api'
import { usarSessao } from '../estado/sessao'
import Estado from '../componentes/Estado.vue'
import Foto from '../componentes/Foto.vue'
import ConviteEntrar from '../componentes/ConviteEntrar.vue'

const { t, locale } = useI18n()
const sessao = usarSessao()

const aba = ref<'proximas' | 'minhas'>('proximas')
const cidade = ref('')
const lista = ref<Grupo[]>([])
const carregando = ref(false)
const erro = ref<string | null>(null)
const pedidos = ref<Record<string, boolean>>({})

const meusIds = computed(() => new Set(lista.value.filter((g) => g.criado_por === sessao.jogador?.id).map((g) => g.id)))

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
    // Sem cidade informada, mostra os grupos de que a pessoa participa — não
    // existe rota autenticada de "todos os grupos", e nem deveria: seria um Scan.
    else lista.value = await api.meusGrupos()
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
  if (!busca) return lista.value
  return lista.value.filter((g) =>
    [g.nome, g.local, g.cidade, g.dia_semana].some((c) => c?.toLowerCase().includes(busca)))
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
      <h1>{{ t('peladas.titulo') }}</h1>
      <p>{{ t('home.subtitulo') }}</p>

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
      <span v-if="lista.length" class="contagem-resultado">
        {{ t('comum.resultados', visiveis.length) }}
      </span>
    </form>

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
              v-if="sessao.autenticado && !meusIds.has(g.id)"
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
  </section>
</template>
