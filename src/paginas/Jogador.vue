<script setup lang="ts">
/**
 * Perfil público de atleta.
 *
 * Deslogado usa `/publico/jogador/{id}`, que devolve só o cartão do jogador.
 * Logado troca para a rota autenticada, que traz o mesmo mais o vínculo social
 * — quem segue quem — e permite seguir daqui.
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api, publico, type Jogador } from '../servicos/api'
import { usarSessao } from '../estado/sessao'
import { mensagensJogador } from '../servicos/idioma-jogador'
import Estado from '../componentes/Estado.vue'
import Foto from '../componentes/Foto.vue'
import ConviteEntrar from '../componentes/ConviteEntrar.vue'

const { t } = useI18n()
const { t: tj } = useI18n({ useScope: 'local', messages: mensagensJogador })
const sessao = usarSessao()
const rota = useRoute()

const jogador = ref<Jogador | null>(null)
const carregando = ref(true)
const erro = ref<string | null>(null)

const id = computed(() => String(rota.params.id ?? ''))
const souEu = computed(() => sessao.jogador?.id === id.value)

const num = (v?: string | number) => Number(v ?? 0) || 0

/** Os seis atributos do cartão, na ordem em que o app os desenha. */
const ATRIBUTOS = [
  ['finalizacao', 'Finalização'], ['passe', 'Passe'], ['defesa', 'Defesa'],
  ['forca', 'Força'], ['velocidade', 'Velocidade'], ['drible', 'Drible'],
] as const

const atributos = computed(() =>
  ATRIBUTOS.map(([chave]) => ({
    chave,
    rotulo: tj('atributos.' + chave),
    valor: num((jogador.value as Record<string, unknown> | null)?.[chave] as string),
  })))

const CARREIRA = [
  'gols', 'assistencias', 'peladas_jogadas', 'partidas_jogadas',
  'roubadas', 'defesas', 'chutes_a_gol', 'defesas_penaltis',
] as const

const carreira = computed(() =>
  CARREIRA
    .map((chave) => ({
      chave,
      rotulo: tj('carreira.' + chave),
      valor: num((jogador.value as Record<string, unknown> | null)?.[chave] as string),
    }))
    .filter((c) => c.valor > 0))

/**
 * Troféus vêm como contadores soltos no perfil: `artilheiro_ouro`, `mvp_prata`…
 * Agrupo por prêmio para não virar uma lista de quarenta linhas com zeros.
 */
const trofeus = computed(() => {
  const j = jogador.value as Record<string, unknown> | null
  if (!j) return []
  const por = new Map<string, { ouro: number; prata: number; bronze: number }>()
  for (const [chave, valor] of Object.entries(j)) {
    const m = /^(.+)_(ouro|prata|bronze)$/.exec(chave)
    if (!m) continue
    const n = num(valor as string)
    if (!n) continue
    const atual = por.get(m[1]) ?? { ouro: 0, prata: 0, bronze: 0 }
    atual[m[2] as 'ouro' | 'prata' | 'bronze'] = n
    por.set(m[1], atual)
  }
  return [...por].map(([premio, m]) => ({ premio, ...m, total: m.ouro + m.prata + m.bronze }))
    .sort((a, b) => b.ouro - a.ouro || b.total - a.total)
})

const overall = computed(() => num(jogador.value?.overal))

async function carregar() {
  carregando.value = true
  erro.value = null
  try {
    jogador.value = sessao.autenticado
      ? await api.perfil(id.value)
      : await publico.jogador(id.value)
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    carregando.value = false
  }
}

onMounted(carregar)
watch(id, carregar)
</script>

<template>
  <Estado :carregando="carregando" :erro="erro" @recarregar="carregar">
    <section v-if="jogador" class="secao py-10">
      <header class="painel flex flex-wrap items-center gap-5 p-6">
        <Foto pasta="perfil" :id="jogador.id" :nome="jogador.nome" classe="h-24 w-24" redonda />
        <div class="min-w-0 flex-1">
          <h1 class="text-2xl font-extrabold">{{ jogador.nome || tj('semNome') }}</h1>
          <p class="text-sm text-[var(--color-tinta-fraca)]">
            {{ [jogador.posicao || jogador.posicao_jogador, jogador.pe_dominante,
                jogador.idade ? jogador.idade + ' ' + tj('anos') : ''].filter(Boolean).join(' · ') || t('comum.naoInformado') }}
          </p>
          <p v-if="jogador.username" class="text-sm text-[var(--color-tinta-fraca)]">@{{ jogador.username }}</p>
          <p class="mt-2 text-sm">
            <strong>{{ jogador.seguidores_count ?? 0 }}</strong> {{ tj('seguidores') }}
            · <strong>{{ jogador.seguindo_count ?? 0 }}</strong> {{ tj('seguindo') }}
          </p>
        </div>
        <div v-if="overall" class="text-center">
          <p class="text-4xl font-extrabold text-[var(--color-marca)]">{{ overall }}</p>
          <p class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ tj('overall') }}</p>
        </div>
      </header>

      <ConviteEntrar v-if="!sessao.autenticado" formato="aviso" class="mt-4" :texto="tj('entrarParaSeguir')" />

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <div class="painel p-6">
          <h2 class="mb-4 font-bold">{{ tj('atributosTitulo') }}</h2>
          <ul class="grid gap-3">
            <li v-for="a in atributos" :key="a.chave">
              <div class="mb-1 flex justify-between text-sm">
                <span class="font-semibold">{{ a.rotulo }}</span>
                <span class="font-extrabold">{{ a.valor }}</span>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-[var(--color-linha)]">
                <div class="h-full rounded-full bg-[var(--color-marca)]"
                     :style="{ width: Math.min(a.valor, 100) + '%' }" />
              </div>
            </li>
          </ul>
        </div>

        <div class="painel p-6">
          <h2 class="mb-4 font-bold">{{ tj('carreiraTitulo') }}</h2>
          <dl v-if="carreira.length" class="grid grid-cols-2 gap-4">
            <div v-for="c in carreira" :key="c.chave">
              <dt class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ c.rotulo }}</dt>
              <dd class="text-xl font-extrabold">{{ c.valor }}</dd>
            </div>
          </dl>
          <p v-else class="text-sm text-[var(--color-tinta-fraca)]">{{ tj('semCarreira') }}</p>
        </div>
      </div>

      <div v-if="trofeus.length" class="painel mt-6 p-6">
        <h2 class="mb-4 font-bold">{{ tj('trofeusTitulo') }}</h2>
        <ul class="flex flex-wrap gap-3">
          <li v-for="tr in trofeus" :key="tr.premio"
              class="rounded-xl border border-[var(--color-linha)] px-4 py-2">
            <p class="text-sm font-bold">{{ tj('premios.' + tr.premio) }}</p>
            <p class="text-xs text-[var(--color-tinta-fraca)]">
              <span v-if="tr.ouro">🥇 {{ tr.ouro }}</span>
              <span v-if="tr.prata"> 🥈 {{ tr.prata }}</span>
              <span v-if="tr.bronze"> 🥉 {{ tr.bronze }}</span>
            </p>
          </li>
        </ul>
      </div>

      <p v-if="souEu" class="mt-6 text-center text-sm text-[var(--color-tinta-fraca)]">
        {{ tj('esteSouEu') }}
      </p>
    </section>
  </Estado>
</template>
