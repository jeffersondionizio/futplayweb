<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api, type Clube } from '../servicos/api'

const { t } = useI18n()
const roteador = useRouter()

const FORMATOS = ['PONTOS_CORRIDOS', 'MATA_MATA', 'PONTOS_CORRIDOS_E_MATA_MATA', 'GRUPOS_E_MATA_MATA']

const clubes = ref<Clube[]>([])
const salvando = ref(false)
const erro = ref<string | null>(null)

const form = ref({
  nome: '',
  formato: 'PONTOS_CORRIDOS',
  cidade: '',
  clube_organizador_id: '',
  regulamento: '',
  qtd_grupos: 2,
  classificados_por_grupo: 2,
  data_inscricao_inicio: '',
  data_inscricao_fim: '',
  data_inicio: '',
  data_fim: '',
})

onMounted(async () => {
  try {
    clubes.value = await api.meusClubes()
    if (clubes.value[0]) form.value.clube_organizador_id = clubes.value[0].id
  } catch {
    // Sem clube dá para criar mesmo assim; o campo fica vazio.
  }
})

async function criar() {
  salvando.value = true
  erro.value = null
  try {
    // O id é gerado aqui no mesmo formato que o app usa: prefixo do nome mais
    // o fim do timestamp, para o campeonato ser reconhecível na listagem crua.
    const prefixo = form.value.nome.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(6, '0')
    const id = prefixo + String(Date.now()).slice(-8)

    const criado = await api.criarCampeonato({ ...form.value, id })
    roteador.push({ name: 'campeonato', params: { id: criado.id } })
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <section class="secao grid place-items-center py-10">
    <form class="painel w-full max-w-2xl p-8" @submit.prevent="criar">
      <h1 class="text-2xl font-extrabold">{{ t('criar.campeonato') }}</h1>

      <div class="mt-6 grid gap-4 sm:grid-cols-2">
        <label class="block sm:col-span-2">
          <span class="text-sm font-bold">{{ t('criar.nome') }}</span>
          <input v-model="form.nome" required maxlength="60" class="campo mt-1" />
        </label>

        <label class="block">
          <span class="text-sm font-bold">{{ t('criar.formato') }}</span>
          <select v-model="form.formato" class="campo mt-1">
            <option v-for="f in FORMATOS" :key="f" :value="f">
              {{ f.replaceAll('_', ' ').toLowerCase() }}
            </option>
          </select>
        </label>

        <label class="block">
          <span class="text-sm font-bold">{{ t('criar.cidade') }}</span>
          <input v-model="form.cidade" required class="campo mt-1" />
        </label>

        <label v-if="clubes.length" class="block sm:col-span-2">
          <span class="text-sm font-bold">{{ t('criar.clubeOrganizador') }}</span>
          <select v-model="form.clube_organizador_id" class="campo mt-1">
            <option v-for="c in clubes" :key="c.id" :value="c.id">{{ c.nome }}</option>
          </select>
        </label>

        <label class="block">
          <span class="text-sm font-bold">{{ t('criar.grupos') }}</span>
          <input v-model.number="form.qtd_grupos" type="number" min="1" max="8" class="campo mt-1" />
        </label>
        <label class="block">
          <span class="text-sm font-bold">{{ t('criar.classificados') }}</span>
          <input v-model.number="form.classificados_por_grupo" type="number" min="1" max="8" class="campo mt-1" />
        </label>

        <label class="block">
          <span class="text-sm font-bold">{{ t('criar.inscricaoInicio') }}</span>
          <input v-model="form.data_inscricao_inicio" type="date" class="campo mt-1" />
        </label>
        <label class="block">
          <span class="text-sm font-bold">{{ t('criar.inscricaoFim') }}</span>
          <input v-model="form.data_inscricao_fim" type="date" class="campo mt-1" />
        </label>
        <label class="block">
          <span class="text-sm font-bold">{{ t('criar.inicio') }}</span>
          <input v-model="form.data_inicio" type="date" class="campo mt-1" />
        </label>
        <label class="block">
          <span class="text-sm font-bold">{{ t('criar.fim') }}</span>
          <input v-model="form.data_fim" type="date" class="campo mt-1" />
        </label>

        <label class="block sm:col-span-2">
          <span class="text-sm font-bold">{{ t('criar.regulamento') }}</span>
          <textarea v-model="form.regulamento" rows="5" class="campo mt-1" />
        </label>
      </div>

      <p v-if="erro" class="mt-4 text-sm font-semibold text-[var(--color-estado-erro)]">{{ erro }}</p>

      <div class="mt-6 flex gap-3">
        <button type="submit" class="botao-primario" :disabled="salvando">
          {{ salvando ? t('criar.salvando') : t('criar.salvar') }}
        </button>
        <RouterLink :to="{ name: 'campeonatos' }" class="botao-secundario">{{ t('comum.voltar') }}</RouterLink>
      </div>
    </form>
  </section>
</template>
