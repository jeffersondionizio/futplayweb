<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { urlAssinada, type Pasta } from '../servicos/imagens'

const props = withDefaults(
  defineProps<{
    pasta: Pasta
    id?: string
    nome?: string
    /** Classes de tamanho e forma; o componente não decide layout. */
    classe?: string
    redonda?: boolean
  }>(),
  { classe: 'h-12 w-12', redonda: false },
)

const src = ref<string | null>(null)
const falhou = ref(false)

// Enquanto a URL não chega — ou se a foto não existe — mostra a inicial do
// nome. É melhor que um quadrado quebrado, e a maioria dos perfis não tem foto.
const inicial = computed(() => (props.nome ?? '?').trim().charAt(0).toUpperCase() || '?')

watch(
  () => [props.pasta, props.id] as const,
  async ([pasta, id]) => {
    src.value = null
    falhou.value = false
    if (!id) return
    src.value = await urlAssinada(pasta, id)
  },
  { immediate: true },
)
</script>

<template>
  <img
    v-if="src && !falhou"
    :src="src"
    :alt="nome ?? ''"
    loading="lazy"
    class="shrink-0 border border-[var(--color-linha)] object-cover"
    :class="[classe, redonda ? 'rounded-full' : 'rounded-lg']"
    @error="falhou = true"
  />
  <span
    v-else
    aria-hidden="true"
    class="grid shrink-0 place-items-center border border-[var(--color-linha)]
           bg-[var(--color-marca-claro)] font-extrabold text-[var(--color-marca)]"
    :class="[classe, redonda ? 'rounded-full' : 'rounded-lg']"
  >{{ inicial }}</span>
</template>
