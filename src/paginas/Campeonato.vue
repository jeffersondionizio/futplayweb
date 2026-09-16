<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api, urlImagem, type Campeonato, type Participante, type Jogo, type Clube } from '../servicos/api'
import Estado from '../componentes/Estado.vue'
import Etiqueta from '../componentes/Etiqueta.vue'

const { t, locale } = useI18n()
const rota = useRoute()
const id = String(rota.params.id)

const campeonato = ref<Campeonato | null>(null)
const participantes = ref<Participante[]>([])
const jogos = ref<Jogo[]>([])
const clubes = ref<Record<string, Clube>>({})
const carregando = ref(true)
const erro = ref<string | null>(null)
const aba = ref<'classificacao' | 'jogos' | 'regulamento'>('classificacao')

const nomeClube = (cid: string) => clubes.value[cid]?.nome ?? cid ?? '—'

/** Ordenação clássica: pontos, saldo, gols pró. */
const classificacao = computed(() =>
  [...participantes.value].sort(
    (a, b) =>
      Number(b.pontos) - Number(a.pontos) ||
      Number(b.saldo_gols) - Number(a.saldo_gols) ||
      Number(b.gols_pro) - Number(a.gols_pro),
  ),
)

const jogosPorRodada = computed(() => {
  const mapa = new Map<string, Jogo[]>()
  for (const j of jogos.value) {
    const chave = `${t('campeonatos.rodada')} ${j.rodada}`
    if (!mapa.has(chave)) mapa.set(chave, [])
    mapa.get(chave)!.push(j)
  }
  return [...mapa.entries()]
})

async function carregar() {
  carregando.value = true
  erro.value = null
  try {
    const [c, p, g, meus] = await Promise.all([
      api.campeonato(id),
      api.participantes(id),
      api.jogos(id),
      api.meusClubes().catch(() => [] as Clube[]),
    ])
    campeonato.value = c
    participantes.value = p
    jogos.value = g
    for (const cl of meus) clubes.value[cl.id] = cl
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    carregando.value = false
  }
}

const quando = (iso?: string) => {
  if (!iso) return '-'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(locale.value, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

onMounted(carregar)
</script>

<template>
  <Estado :carregando="carregando" :erro="erro" @recarregar="carregar">
    <section v-if="campeonato" class="secao py-10">
      <RouterLink :to="{ name: 'campeonatos' }" class="text-sm font-bold text-[var(--color-tinta-fraca)] hover:text-[var(--color-marca)]">
        ← {{ t('comum.voltar') }}
      </RouterLink>

      <header class="painel mt-4 flex flex-wrap items-center gap-4 p-6">
        <img :src="urlImagem('competicao', campeonato.id)" :alt="campeonato.nome" loading="lazy"
             class="h-16 w-16 rounded-xl border border-[var(--color-linha)] object-cover" />
        <div class="min-w-0 flex-1">
          <h1 class="text-2xl font-extrabold">{{ campeonato.nome }}</h1>
          <p class="text-sm text-[var(--color-tinta-fraca)]">
            {{ [campeonato.cidade, campeonato.formato].filter(Boolean).join(' · ') }}
          </p>
        </div>
        <Etiqueta :status="campeonato.status ?? ''" />
      </header>

      <nav class="mt-6 flex flex-wrap gap-2" role="tablist">
        <button v-for="opcao in (['classificacao', 'jogos', 'regulamento'] as const)" :key="opcao"
                type="button" role="tab" :aria-selected="aba === opcao"
                class="rounded-lg px-4 py-2 text-sm font-bold"
                :class="aba === opcao
                  ? 'bg-[var(--color-marca)] text-white'
                  : 'border border-[var(--color-linha)] bg-white text-[var(--color-tinta-suave)]'"
                @click="aba = opcao">{{ t(`campeonatos.${opcao}`) }}</button>
      </nav>

      <!-- classificação -->
      <div v-if="aba === 'classificacao'" class="painel mt-4 overflow-x-auto">
        <table class="w-full min-w-[640px] text-sm">
          <thead>
            <tr class="border-b border-[var(--color-linha)] text-left text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">
              <th class="px-4 py-3">{{ t('tabela.posicao') }}</th>
              <th class="px-4 py-3">{{ t('tabela.clube') }}</th>
              <th class="px-3 py-3 text-center">{{ t('tabela.pontos') }}</th>
              <th class="px-3 py-3 text-center">{{ t('tabela.vitorias') }}</th>
              <th class="px-3 py-3 text-center">{{ t('tabela.empates') }}</th>
              <th class="px-3 py-3 text-center">{{ t('tabela.derrotas') }}</th>
              <th class="px-3 py-3 text-center">{{ t('tabela.golsPro') }}</th>
              <th class="px-3 py-3 text-center">{{ t('tabela.golsContra') }}</th>
              <th class="px-3 py-3 text-center">{{ t('tabela.saldo') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, i) in classificacao" :key="p.clube_id"
                class="border-b border-[var(--color-linha)] last:border-0"
                :class="i % 2 ? 'bg-[var(--color-zebra)]' : ''">
              <td class="px-4 py-3 font-bold">{{ i + 1 }}</td>
              <td class="px-4 py-3">
                <span class="font-semibold">{{ nomeClube(p.clube_id) }}</span>
                <span v-if="p.grupo_fase" class="ml-2 text-xs text-[var(--color-tinta-fraca)]">
                  {{ t('campeonatos.grupo') }} {{ p.grupo_fase }}
                </span>
              </td>
              <td class="px-3 py-3 text-center font-extrabold text-[var(--color-marca)]">{{ p.pontos }}</td>
              <td class="px-3 py-3 text-center">{{ p.vitorias }}</td>
              <td class="px-3 py-3 text-center">{{ p.empates }}</td>
              <td class="px-3 py-3 text-center">{{ p.derrotas }}</td>
              <td class="px-3 py-3 text-center">{{ p.gols_pro }}</td>
              <td class="px-3 py-3 text-center">{{ p.gols_contra }}</td>
              <td class="px-3 py-3 text-center">{{ p.saldo_gols }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- jogos -->
      <div v-else-if="aba === 'jogos'" class="mt-4 space-y-6">
        <div v-for="[rodada, lista] in jogosPorRodada" :key="rodada">
          <h2 class="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-tinta-fraca)]">{{ rodada }}</h2>
          <ul class="painel divide-y divide-[var(--color-linha)]">
            <li v-for="j in lista" :key="j.id" class="flex flex-wrap items-center gap-3 p-4">
              <p class="flex-1 text-right font-semibold">{{ nomeClube(j.clube_a_id) }}</p>
              <p class="shrink-0 rounded-lg bg-[var(--color-papel)] px-3 py-1 font-extrabold">
                {{ j.status === 'FINALIZADO' ? `${j.placar_a} - ${j.placar_b}` : t('amistosos.versus') }}
              </p>
              <p class="flex-1 font-semibold">{{ nomeClube(j.clube_b_id) }}</p>
              <div class="w-full text-center text-xs text-[var(--color-tinta-fraca)]">
                {{ quando(j.data_hora) }} · {{ j.local || '-' }}
              </div>
            </li>
          </ul>
        </div>
        <p v-if="!jogos.length" class="painel p-10 text-center text-[var(--color-tinta-fraca)]">
          {{ t('campeonatos.vazio') }}
        </p>
      </div>

      <!-- regulamento -->
      <div v-else class="painel mt-4 p-6">
        <p class="whitespace-pre-line text-[var(--color-tinta-suave)]">
          {{ campeonato.regulamento || t('comum.naoInformado') }}
        </p>
      </div>
    </section>
  </Estado>
</template>
