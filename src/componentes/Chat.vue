<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, type Mensagem } from '../servicos/api'
import { usarSessao } from '../estado/sessao'
import Foto from './Foto.vue'

const props = defineProps<{
  contexto: 'grupo' | 'clubes' | 'campeonatos' | 'amistosos'
  id: string
}>()

const { t, locale } = useI18n()
const sessao = usarSessao()

const mensagens = ref<Mensagem[]>([])
const texto = ref('')
const carregando = ref(true)
const enviando = ref(false)
const erro = ref<string | null>(null)
const lista = useTemplateRef<HTMLElement>('lista')

/**
 * Recarrega a cada 15s enquanto a aba está visível.
 *
 * Não há websocket na API — é HTTP puro. Parar quando a aba some evita bater no
 * backend com aba esquecida aberta, que é o grosso do desperdício num intervalo
 * curto assim.
 */
const INTERVALO = 15_000
let timer: number | null = null

async function carregar(rolar = false) {
  try {
    mensagens.value = await api.chat(props.contexto, props.id)
    erro.value = null
    if (rolar) await irParaOFim()
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    carregando.value = false
  }
}

async function irParaOFim() {
  await nextTick()
  if (lista.value) lista.value.scrollTop = lista.value.scrollHeight
}

async function enviar() {
  const conteudo = texto.value.trim()
  if (!conteudo || enviando.value) return
  enviando.value = true
  try {
    const nova = await api.enviarMensagem(props.contexto, props.id, conteudo)
    mensagens.value = [...mensagens.value, nova]
    texto.value = ''
    await irParaOFim()
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    enviando.value = false
  }
}

function agendar() {
  parar()
  if (document.hidden) return
  timer = window.setInterval(() => carregar(), INTERVALO)
}
function parar() {
  if (timer !== null) window.clearInterval(timer)
  timer = null
}
const aoTrocarVisibilidade = () => (document.hidden ? parar() : agendar())

onMounted(async () => {
  await carregar(true)
  agendar()
  document.addEventListener('visibilitychange', aoTrocarVisibilidade)
})
onBeforeUnmount(() => {
  parar()
  document.removeEventListener('visibilitychange', aoTrocarVisibilidade)
})

const hora = (ms: number) =>
  ms ? new Date(ms).toLocaleString(locale.value, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
</script>

<template>
  <section class="painel overflow-hidden">
    <h2 class="border-b border-[var(--color-linha)] px-6 py-4 font-bold">{{ t('chat.titulo') }}</h2>

    <div ref="lista" class="max-h-96 space-y-4 overflow-y-auto p-6">
      <p v-if="carregando" class="text-center text-sm text-[var(--color-tinta-fraca)]">
        {{ t('comum.carregando') }}
      </p>
      <p v-else-if="!mensagens.length" class="text-center text-sm text-[var(--color-tinta-fraca)]">
        {{ t('chat.vazio') }}
      </p>

      <article
        v-for="m in mensagens"
        :key="m.mensagem_id"
        class="flex gap-3"
        :class="m.autor_id === sessao.jogador?.id ? 'flex-row-reverse' : ''"
      >
        <Foto pasta="perfil" :id="m.autor_id" :nome="m.autor_nome" classe="h-9 w-9" redonda />
        <div
          class="max-w-[75%] rounded-xl px-4 py-2.5"
          :class="m.autor_id === sessao.jogador?.id
            ? 'bg-[var(--color-marca)] text-white'
            : 'bg-[var(--color-papel)]'"
        >
          <p class="text-xs font-bold opacity-80">{{ m.autor_nome || '—' }}</p>
          <p class="whitespace-pre-line break-words">{{ m.texto }}</p>
          <p class="mt-1 text-[11px] opacity-70">{{ hora(m.created_at) }}</p>
        </div>
      </article>
    </div>

    <form class="flex gap-2 border-t border-[var(--color-linha)] p-4" @submit.prevent="enviar">
      <input
        v-model="texto"
        class="campo flex-1"
        maxlength="2000"
        :placeholder="t('chat.escreva')"
        :disabled="enviando"
      />
      <button type="submit" class="botao-primario" :disabled="enviando || !texto.trim()">
        {{ t('chat.enviar') }}
      </button>
    </form>

    <p v-if="erro" class="px-6 pb-4 text-sm font-semibold text-[var(--color-estado-erro)]">{{ erro }}</p>
  </section>
</template>
