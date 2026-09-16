<script setup lang="ts">
/**
 * O convite que ocupa o lugar do botão de ação para quem não entrou.
 *
 * Ele leva o caminho atual em `destino`, então depois do login a pessoa volta
 * exatamente para a tela onde clicou — e não para uma home genérica.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

withDefaults(
  defineProps<{
    /** `botao` ocupa a linha de ação do card; `aviso` é a faixa do topo da tela. */
    formato?: 'botao' | 'aviso'
    texto?: string
    classe?: string
  }>(),
  { formato: 'botao', classe: '' },
)

const { t } = useI18n()
const rota = useRoute()
const destino = computed(() => ({ name: 'entrar', query: { destino: rota.fullPath } }))
</script>

<template>
  <RouterLink v-if="formato === 'botao'" :to="destino" class="botao-secundario" :class="classe">
    {{ texto ?? t('comum.entrarParaParticipar') }}
  </RouterLink>

  <RouterLink
    v-else
    :to="destino"
    class="mb-6 flex items-center justify-between gap-4 rounded-xl border border-[var(--color-marca)]
           bg-[var(--color-marca-claro)] px-5 py-3 text-sm font-semibold text-[var(--color-marca)]"
    :class="classe"
  >
    <span>{{ texto ?? t('comum.visitando') }}</span>
    <span class="shrink-0 font-extrabold" aria-hidden="true">→</span>
  </RouterLink>
</template>
