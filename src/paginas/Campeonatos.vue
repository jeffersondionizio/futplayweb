<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, publico, type Campeonato } from '../servicos/api'
import { usarSessao } from '../estado/sessao'
import Estado from '../componentes/Estado.vue'
import ConviteEntrar from '../componentes/ConviteEntrar.vue'
import Etiqueta from '../componentes/Etiqueta.vue'
import Foto from '../componentes/Foto.vue'

const { t, te, locale } = useI18n()
const sessao = usarSessao()
const aba = ref<'descobrir' | 'meus'>('descobrir')
const lista = ref<Campeonato[]>([])
const carregando = ref(false)
const erro = ref<string | null>(null)

/** Filtro local, por nome ou cidade, sobre o que já veio. */
const termo = ref('')
const visiveis = computed(() => {
  const busca = termo.value.trim().toLowerCase()
  if (!busca) return lista.value
  return lista.value.filter((c) =>
    [c.nome, c.cidade, c.formato, c.status].some((campo) => campo?.toLowerCase().includes(busca)))
})

/** `GRUPOS_E_MATA_MATA` não é texto de card; vira "Grupos e mata-mata". */
const formato = (valor: string) => {
  const chave = `status.${valor.toUpperCase()}`
  if (te(chave)) return t(chave)
  const limpo = valor.replaceAll('_', ' ').toLowerCase()
  return limpo.charAt(0).toUpperCase() + limpo.slice(1)
}

const dia = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale.value, { day: '2-digit', month: 'short' })
}

/** "12 set – 30 nov", ou só o que existir. */
const periodo = (c: Campeonato) => [dia(c.data_inicio), dia(c.data_fim)].filter(Boolean).join(' – ')

async function carregar() {
  carregando.value = true
  erro.value = null
  try {
    if (!sessao.autenticado) { lista.value = await publico.campeonatos(); return }
    lista.value = aba.value === 'meus' ? await api.meusCampeonatos() : await api.todosCampeonatos()
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)
</script>

<template>
  <section class="secao py-10">
    <header class="capa-lista">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{{ t('campeonatos.h1') }}</h1>
          <p>{{ t('campeonatos.lead') }}</p>
        </div>
        <RouterLink v-if="sessao.autenticado" :to="{ name: 'criar-campeonato' }" class="botao-primario shrink-0">
          + {{ t('criar.campeonato') }}
        </RouterLink>
      </div>

      <div v-if="sessao.autenticado" class="abas-lista" role="tablist">
        <button
          v-for="opcao in (['descobrir', 'meus'] as const)" :key="opcao" type="button" role="tab"
          class="aba-lista"
          :aria-selected="aba === opcao"
          @click="aba = opcao; carregar()"
        >{{ t(`campeonatos.${opcao}`) }}</button>
      </div>
    </header>

    <ConviteEntrar v-if="!sessao.autenticado" formato="aviso" />

    <div v-if="lista.length" class="barra-filtros">
      <input v-model="termo" class="campo" type="search" :placeholder="t('comum.filtrarNaLista')" />
      <span class="contagem-resultado">{{ t('comum.resultados', visiveis.length) }}</span>
    </div>

    <Estado :carregando="carregando" :erro="erro" :vazio="!visiveis.length"
            :texto-vazio="t('campeonatos.vazio')" @recarregar="carregar">
      <ul class="grade-cartoes">
        <li v-for="c in visiveis" :key="c.id">
          <!-- O card inteiro é o link: um campeonato só tem um destino. -->
          <RouterLink :to="{ name: 'campeonato', params: { id: c.id } }" class="cartao cartao-link">
            <div class="cartao-topo">
              <Foto pasta="competicao" :id="c.id" :nome="c.nome" classe="h-9 w-9" />
              <div class="cartao-identidade">
                <h2 class="cartao-titulo">{{ c.nome }}</h2>
                <p class="cartao-local">
                  <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" />
                  </svg>
                  <span class="truncate">{{ c.cidade || t('comum.naoInformado') }}</span>
                </p>
              </div>
            </div>

            <div class="cartao-selos">
              <Etiqueta :status="c.status ?? ''" />
              <span v-if="c.formato" class="selo selo-neutro">{{ formato(c.formato) }}</span>
            </div>

            <p v-if="c.fase_atual" class="cartao-linha">
              <svg class="icone-linha" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M6 4h12v3a6 6 0 0 1-12 0V4Zm6 9v4m-3 3h6" />
              </svg>
              <span class="truncate">{{ t('campeonatos.fase') }}: {{ formato(c.fase_atual) }}</span>
            </p>
            <p v-if="periodo(c)" class="cartao-linha">
              <svg class="icone-linha" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
              <span class="truncate">{{ periodo(c) }}</span>
            </p>

            <span class="cartao-chamada">{{ t('comum.ver') }} <span aria-hidden="true">→</span></span>
          </RouterLink>
        </li>
      </ul>
    </Estado>
    <article class="painel mt-8 p-6">
      <h2 class="text-2xl font-extrabold">Como organizar um campeonato de futebol</h2>
      <p class="mt-3 text-[var(--color-tinta-suave)]">Comece definindo clubes, formato e datas. Em seguida, publique os confrontos e mantenha resultados e classificação atualizados para que todos acompanhem a competição.</p>
    </article>
  </section>
</template>
