<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, publico, type Amistoso, type Clube } from '../servicos/api'
import { usarSessao } from '../estado/sessao'
import Estado from '../componentes/Estado.vue'
import Etiqueta from '../componentes/Etiqueta.vue'
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
    <header class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-3xl font-extrabold">{{ t('amistosos.titulo') }}</h1>
      <RouterLink v-if="sessao.autenticado" :to="{ name: 'criar-amistoso' }" class="botao-primario">
        + {{ t('criar.amistoso') }}
      </RouterLink>
    </header>

    <ConviteEntrar v-if="!sessao.autenticado" formato="aviso" />

    <div class="mb-6 flex flex-wrap gap-2" role="tablist">
      <button
        v-for="e in abas"
        :key="e"
        type="button"
        role="tab"
        :aria-selected="aba === e"
        class="rounded-lg px-4 py-2 text-sm font-bold"
        :class="aba === e
          ? 'bg-[var(--color-marca)] text-white'
          : 'border border-[var(--color-linha)] bg-white text-[var(--color-tinta-suave)]'"
        @click="aba = e; carregar()"
      >{{ t(`amistosos.${e}`) }}</button>
    </div>

    <Estado
      :carregando="carregando"
      :erro="erro"
      :vazio="!lista.length"
      :texto-vazio="t('amistosos.vazio')"
      @recarregar="carregar"
    >
      <ul class="grid gap-4 md:grid-cols-2">
        <li v-for="a in lista" :key="a.id" class="painel p-5">
          <div class="flex items-center justify-between gap-3">
            <Etiqueta :status="a.status" />
            <span class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ a.tipo }}</span>
          </div>

          <div class="mt-4 flex items-center justify-center gap-4 text-center">
            <p class="flex-1 font-bold">{{ nomeClube(a.clube_mandante_id) }}</p>
            <p class="shrink-0 rounded-lg bg-[var(--color-papel)] px-3 py-1 font-extrabold">
              {{ a.status === 'FINALIZADO'
                ? `${a.placar_mandante ?? 0} - ${a.placar_visitante ?? 0}`
                : t('amistosos.versus') }}
            </p>
            <p class="flex-1 font-bold">{{ nomeClube(a.clube_visitante_id) }}</p>
          </div>

          <dl class="mt-4 space-y-1 text-sm text-[var(--color-tinta-suave)]">
            <div class="flex justify-between gap-3">
              <dt>{{ t('peladas.quando') }}</dt>
              <dd>{{ quando(a.data_hora) }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt>{{ t('peladas.onde') }}</dt>
              <dd class="truncate">{{ a.local_nome || a.cidade || t('comum.naoInformado') }}</dd>
            </div>
          </dl>

          <button
            v-if="aba === 'abertos' && meusClubes.length"
            type="button"
            class="botao-primario mt-4 w-full"
            :disabled="enviados[a.id]"
            @click="candidatar(a)"
          >{{ enviados[a.id] ? t('amistosos.candidatado') : t('amistosos.candidatar') }}</button>
          <ConviteEntrar
            v-else-if="!sessao.autenticado && aba === 'abertos'"
            classe="mt-4 w-full"
            :texto="t('amistosos.candidatar')"
          />
        </li>
      </ul>
    </Estado>
  </section>
</template>
