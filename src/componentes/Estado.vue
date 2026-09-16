<script setup lang="ts">
import { useI18n } from 'vue-i18n'
defineProps<{ carregando?: boolean; erro?: string | null; vazio?: boolean; textoVazio?: string }>()
defineEmits<{ recarregar: [] }>()
const { t } = useI18n()
</script>

<template>
  <div v-if="carregando" class="grid place-items-center py-16 text-[var(--color-tinta-fraca)]">
    <div class="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-linha)] border-t-[var(--color-marca)]" />
    <p class="mt-3 text-sm">{{ t('comum.carregando') }}</p>
  </div>

  <div v-else-if="erro" class="painel p-8 text-center">
    <p class="font-semibold text-[var(--color-estado-erro)]">{{ erro }}</p>
    <button type="button" class="botao-secundario mt-4" @click="$emit('recarregar')">
      {{ t('comum.tentarNovamente') }}
    </button>
  </div>

  <div v-else-if="vazio" class="painel p-10 text-center text-[var(--color-tinta-fraca)]">
    {{ textoVazio ?? t('comum.erro') }}
  </div>

  <slot v-else />
</template>
