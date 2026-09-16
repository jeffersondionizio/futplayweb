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
      <ul class="grid gap-4 md:grid-cols-2">
        <li v-for="a in visiveis" :key="a.id" class="cartao">
          <div class="cartao-selos items-center justify-between pb-0">
            <Etiqueta :status="a.status" />
            <span class="selo selo-neutro">{{ a.tipo }}</span>
          </div>

          <div class="cartao-confronto">
            <div class="cartao-lado">
              <Foto pasta="clube" :id="a.clube_mandante_id" :nome="nomeClube(a.clube_mandante_id)" classe="h-11 w-11" />
              <span>{{ nomeClube(a.clube_mandante_id) }}</span>
            </div>
            <p :class="a.status === 'FINALIZADO' ? 'cartao-placar' : 'cartao-versus'">
              {{ a.status === 'FINALIZADO'
                ? `${a.placar_mandante ?? 0} - ${a.placar_visitante ?? 0}`
                : t('amistosos.versus') }}
            </p>
            <div class="cartao-lado" :class="{ indefinido: !a.clube_visitante_id }">
              <Foto
                v-if="a.clube_visitante_id"
                pasta="clube"
                :id="a.clube_visitante_id"
                :nome="nomeClube(a.clube_visitante_id)"
                classe="h-11 w-11"
              />
              <span v-else aria-hidden="true" class="grid h-11 w-11 place-items-center rounded-lg border border-dashed border-[var(--color-linha)] text-lg">?</span>
              <span>{{ nomeClube(a.clube_visitante_id) }}</span>
            </div>
          </div>

          <dl class="cartao-dados border-t border-[var(--color-linha)]">
            <div>
              <dt>{{ t('peladas.quando') }}</dt>
              <dd>{{ quando(a.data_hora) }}</dd>
            </div>
            <div>
              <dt>{{ t('peladas.onde') }}</dt>
              <dd class="truncate">{{ a.local_nome || a.cidade || t('comum.naoInformado') }}</dd>
            </div>
          </dl>

          <div class="cartao-rodape">
            <button
              v-if="aba === 'abertos' && meusClubes.length"
              type="button"
              class="botao-primario"
              :disabled="enviados[a.id]"
              @click="candidatar(a)"
            >{{ enviados[a.id] ? t('amistosos.candidatado') : t('amistosos.candidatar') }}</button>
            <ConviteEntrar
              v-else-if="!sessao.autenticado && aba === 'abertos'"
              :texto="t('amistosos.candidatar')"
            />
            <span v-else class="botao-secundario pointer-events-none opacity-60">
              {{ t(`status.${a.status}`) }}
            </span>
          </div>
        </li>
      </ul>
    </Estado>
  </section>
</template>
