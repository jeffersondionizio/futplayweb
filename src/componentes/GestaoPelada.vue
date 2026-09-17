<script setup lang="ts">
/**
 * Painel do organizador, dentro da página da pelada.
 *
 * Só monta para quem é dono ou admin — a checagem real continua no backend, que
 * responde 403 em `participacao` para quem não é. Aqui a verificação é só para
 * não mostrar botão que vai falhar.
 */
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, type Grupo, type Jogador, type PedidoEntrada } from '../servicos/api'
import { mensagensGestao } from '../servicos/idioma-gestao'
import Foto from './Foto.vue'

const props = defineProps<{ grupo: Grupo; membros: Jogador[] }>()
const emit = defineEmits<{ (e: 'mudou'): void }>()

const { t } = useI18n({ useScope: 'local', messages: mensagensGestao })

const pedidos = ref<PedidoEntrada[]>([])
const carregandoPedidos = ref(true)
const ocupado = ref('')
const erro = ref<string | null>(null)
const aviso = ref<string | null>(null)

const editando = ref(false)
const form = ref({
  local: '', dia_semana: '', hora_inicio: '', hora_fim: '',
  valor: '', qtde_jogadores: '', jogadores_por_time: '', tipo_pelada: '',
})

const DIAS = ['Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado', 'Domingo']
const TIPOS = ['Campo', 'Society', 'Quadra', 'Areia']

/** O papel vem de GET /grupo/{id}/membros; pendente não aparece no elenco. */
const elenco = computed(() => props.membros.filter((m) => m.papel !== 'pendente'))

const rotulo = (papel?: string) =>
  papel === 'dono' ? t('dono') : papel === 'admin' ? t('admin') : t('membro')

async function carregarPedidos() {
  carregandoPedidos.value = true
  try {
    pedidos.value = await api.pedidosDoGrupo(props.grupo.id)
  } catch {
    // 403 aqui é esperado se o papel mudou entre o render e a chamada; a lista
    // some em vez de virar erro de tela.
    pedidos.value = []
  } finally {
    carregandoPedidos.value = false
  }
}

async function agir(chave: string, acao: () => Promise<void>) {
  ocupado.value = chave
  erro.value = null
  aviso.value = null
  try {
    await acao()
    await carregarPedidos()
    emit('mudou')
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    ocupado.value = ''
  }
}

const aprovar = (p: PedidoEntrada) =>
  agir('ap-' + p.jogadorId, () => api.aceitarNoGrupo(props.grupo.id, p.jogadorId))

const recusar = (p: PedidoEntrada) =>
  agir('re-' + p.jogadorId, () => api.removerDoGrupo(props.grupo.id, p.jogadorId))

function remover(m: Jogador) {
  if (!confirm(t('confirmarRemover', { nome: m.nome }))) return
  agir('rm-' + m.id, () => api.removerDoGrupo(props.grupo.id, m.id))
}

const promover = (m: Jogador) =>
  agir('pr-' + m.id, () => api.promoverNoGrupo(props.grupo.id, m.id))

function abrirEdicao() {
  form.value = {
    local: props.grupo.local ?? '',
    dia_semana: props.grupo.dia_semana ?? '',
    hora_inicio: props.grupo.hora_inicio ?? '',
    hora_fim: props.grupo.hora_fim ?? '',
    valor: props.grupo.valor ?? '',
    qtde_jogadores: props.grupo.qtde_jogadores ?? '',
    jogadores_por_time: props.grupo.jogadores_por_time ?? '',
    tipo_pelada: props.grupo.tipo_pelada ?? '',
  }
  editando.value = true
}

function salvar() {
  agir('salvar', async () => {
    await api.atualizarGrupo(props.grupo.id, { ...form.value })
    editando.value = false
    aviso.value = t('salvo')
  })
}

onMounted(carregarPedidos)
</script>

<template>
  <section class="painel mt-6 overflow-hidden">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-linha)] px-6 py-4">
      <div>
        <h2 class="font-bold">{{ t('gestao') }}</h2>
        <p class="text-xs text-[var(--color-tinta-fraca)]">{{ t('gestaoSub') }}</p>
      </div>
      <button v-if="!editando" class="botao-secundario" @click="abrirEdicao">{{ t('editar') }}</button>
    </header>

    <p v-if="erro" class="border-b border-[var(--color-linha)] bg-[var(--color-erro-fundo,#fdeaea)] px-6 py-3 text-sm font-semibold text-[var(--color-erro,#ba1a1a)]">
      {{ erro }}
    </p>
    <p v-if="aviso" class="border-b border-[var(--color-linha)] px-6 py-3 text-sm font-semibold text-[var(--color-marca)]">
      {{ aviso }}
    </p>

    <!-- edição -->
    <form v-if="editando" class="grid gap-4 p-6 sm:grid-cols-2" @submit.prevent="salvar">
      <label class="block">
        <span class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ t('campoLocal') }}</span>
        <input v-model="form.local" class="campo mt-1" />
      </label>
      <label class="block">
        <span class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ t('campoDia') }}</span>
        <select v-model="form.dia_semana" class="campo mt-1">
          <option v-for="d in DIAS" :key="d" :value="d">{{ d }}</option>
        </select>
      </label>
      <label class="block">
        <span class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ t('campoInicio') }}</span>
        <input v-model="form.hora_inicio" type="time" class="campo mt-1" />
      </label>
      <label class="block">
        <span class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ t('campoFim') }}</span>
        <input v-model="form.hora_fim" type="time" class="campo mt-1" />
      </label>
      <label class="block">
        <span class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ t('campoTipo') }}</span>
        <select v-model="form.tipo_pelada" class="campo mt-1">
          <option v-for="p in TIPOS" :key="p" :value="p">{{ p }}</option>
        </select>
      </label>
      <label class="block">
        <span class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ t('campoValor') }}</span>
        <input v-model="form.valor" inputmode="numeric" class="campo mt-1" />
      </label>
      <label class="block">
        <span class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ t('campoVagas') }}</span>
        <input v-model="form.qtde_jogadores" inputmode="numeric" class="campo mt-1" />
      </label>
      <label class="block">
        <span class="text-xs font-bold uppercase text-[var(--color-tinta-fraca)]">{{ t('campoPorTime') }}</span>
        <input v-model="form.jogadores_por_time" inputmode="numeric" class="campo mt-1" />
      </label>
      <div class="flex gap-3 sm:col-span-2">
        <button type="submit" class="botao" :disabled="ocupado === 'salvar'">{{ t('salvar') }}</button>
        <button type="button" class="botao-secundario" @click="editando = false">{{ t('cancelar') }}</button>
      </div>
    </form>

    <!-- pedidos pendentes -->
    <div class="border-t border-[var(--color-linha)] p-6">
      <h3 class="mb-3 text-sm font-bold uppercase text-[var(--color-tinta-fraca)]">
        {{ t('pedidos') }}<span v-if="pedidos.length"> · {{ pedidos.length }}</span>
      </h3>
      <p v-if="!carregandoPedidos && !pedidos.length" class="text-sm text-[var(--color-tinta-fraca)]">
        {{ t('semPedidos') }}
      </p>
      <ul v-else class="grid gap-2">
        <li v-for="p in pedidos" :key="p.jogadorId"
            class="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-linha)] p-3">
          <Foto pasta="perfil" :id="p.jogadorId" :nome="p.nome" classe="h-10 w-10" redonda />
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold">{{ p.nome }}</p>
            <p class="truncate text-xs text-[var(--color-tinta-fraca)]">
              {{ [p.posicao, p.idade && p.idade + ' anos'].filter(Boolean).join(' · ') || '—' }}
            </p>
          </div>
          <button class="botao" :disabled="!!ocupado" @click="aprovar(p)">{{ t('aprovar') }}</button>
          <button class="botao-secundario" :disabled="!!ocupado" @click="recusar(p)">{{ t('recusar') }}</button>
        </li>
      </ul>
    </div>

    <!-- elenco -->
    <div class="border-t border-[var(--color-linha)] p-6">
      <h3 class="mb-3 text-sm font-bold uppercase text-[var(--color-tinta-fraca)]">
        {{ t('elenco') }} · {{ elenco.length }}
      </h3>
      <ul class="grid gap-2">
        <li v-for="m in elenco" :key="m.id"
            class="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-linha)] p-3">
          <Foto pasta="perfil" :id="m.id" :nome="m.nome" classe="h-10 w-10" redonda />
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold">{{ m.nome }}</p>
            <p class="text-xs text-[var(--color-tinta-fraca)]">{{ rotulo(m.papel) }}</p>
          </div>
          <template v-if="m.papel !== 'dono'">
            <button v-if="m.papel !== 'admin'" class="botao-secundario" :disabled="!!ocupado" @click="promover(m)">
              {{ t('promover') }}
            </button>
            <button class="botao-secundario" :disabled="!!ocupado" @click="remover(m)">{{ t('remover') }}</button>
          </template>
        </li>
      </ul>
    </div>
  </section>
</template>
