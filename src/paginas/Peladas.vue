<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, urlImagem, type Grupo } from '../servicos/api'
import { usarSessao } from '../estado/sessao'
import Estado from '../componentes/Estado.vue'

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
    if (aba.value === 'minhas') {
      lista.value = sessao.autenticado ? await api.meusGrupos() : []
    } else if (cidade.value.trim()) {
      lista.value = await api.gruposPorCidade(cidade.value.trim())
    } else {
      // Sem cidade informada, mostra os grupos de que a pessoa participa —
      // não existe rota de "todos os grupos", e nem deveria: seria um Scan.
      lista.value = sessao.autenticado ? await api.meusGrupos() : []
    }
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

onMounted(carregar)
</script>

<template>
  <section class="secao py-10">
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl font-extrabold">{{ t('peladas.titulo') }}</h1>
        <p class="text-[var(--color-tinta-suave)]">{{ t('home.subtitulo') }}</p>
      </div>

      <div class="flex gap-2" role="tablist">
        <button
          v-for="opcao in (['proximas', 'minhas'] as const)"
          :key="opcao"
          type="button"
          role="tab"
          :aria-selected="aba === opcao"
          class="rounded-lg px-4 py-2 text-sm font-bold"
          :class="aba === opcao
            ? 'bg-[var(--color-marca)] text-white'
            : 'border border-[var(--color-linha)] bg-white text-[var(--color-tinta-suave)]'"
          @click="aba = opcao; carregar()"
        >{{ t(`peladas.${opcao}`) }}</button>
      </div>
    </header>

    <form class="mb-6 flex flex-wrap gap-2" @submit.prevent="carregar">
      <input v-model="cidade" class="campo max-w-xs" :placeholder="t('peladas.buscarCidade')" />
      <button type="submit" class="botao-primario">{{ t('comum.buscar') }}</button>
      <button v-if="cidade" type="button" class="botao-secundario" @click="cidade = ''; carregar()">
        {{ t('comum.limpar') }}
      </button>
    </form>

    <Estado
      :carregando="carregando"
      :erro="erro"
      :vazio="!lista.length"
      :texto-vazio="t('peladas.vazio')"
      @recarregar="carregar"
    >
      <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="g in lista" :key="g.id" class="painel flex flex-col overflow-hidden">
          <div class="flex items-start gap-3 p-5">
            <img
              :src="urlImagem('grupo', g.id)"
              :alt="g.nome"
              class="h-12 w-12 shrink-0 rounded-lg border border-[var(--color-linha)] object-cover"
              loading="lazy"
            />
            <div class="min-w-0">
              <h2 class="truncate font-bold">{{ g.nome }}</h2>
              <p class="truncate text-sm text-[var(--color-tinta-fraca)]">
                {{ g.cidade || t('comum.naoInformado') }}
              </p>
            </div>
          </div>

          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--color-linha)] px-5 py-4 text-sm">
            <div>
              <dt class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ t('peladas.quando') }}</dt>
              <dd>{{ g.data_peladaproxima ? dataLegivel(g.data_peladaproxima) : (g.dia_semana || '-') }}</dd>
            </div>
            <div>
              <dt class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ t('peladas.onde') }}</dt>
              <dd class="truncate">{{ g.local || t('comum.naoInformado') }}</dd>
            </div>
            <div>
              <dt class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ t('peladas.valor') }}</dt>
              <dd>{{ g.valor ? `R$ ${g.valor}` : '-' }}</dd>
            </div>
            <div>
              <dt class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ t('peladas.jogadores') }}</dt>
              <dd>{{ g.inscritos ?? '0' }} {{ t('peladas.inscritos') }}</dd>
            </div>
          </dl>

          <div class="mt-auto flex gap-2 border-t border-[var(--color-linha)] p-4">
            <RouterLink :to="{ name: 'pelada', params: { id: g.id } }" class="botao-secundario flex-1">
              {{ t('comum.ver') }}
            </RouterLink>
            <button
              v-if="sessao.autenticado && !meusIds.has(g.id)"
              type="button"
              class="botao-primario flex-1"
              :disabled="pedidos[g.id] || g.pedido_pendente"
              @click="pedirEntrada(g)"
            >
              {{ pedidos[g.id] || g.pedido_pendente ? t('peladas.pedidoEnviado') : t('peladas.pedirEntrada') }}
            </button>
          </div>
        </li>
      </ul>
    </Estado>
  </section>
</template>
