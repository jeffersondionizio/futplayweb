<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ status: string }>()
const { t, te } = useI18n()

/** Mesmas famílias de cor do app: comp_status_* e friendly_status_*. */
const CORES: Record<string, string> = {
  RASCUNHO: 'estado-rascunho', INSCRICOES_ABERTAS: 'estado-agendado',
  GERACAO_TABELA: 'estado-gerando', EM_ANDAMENTO: 'estado-ativo', ATIVO: 'estado-ativo',
  FASE_GRUPOS: 'estado-ativo', MATA_MATA: 'estado-ativo', OITAVAS: 'estado-ativo',
  QUARTAS: 'estado-ativo', SEMIFINAL: 'estado-ativo', FINAL: 'estado-ativo',
  CONCLUIDO: 'estado-encerrado', FINALIZADO: 'estado-sucesso', CANCELADO: 'estado-erro',
  PROPOSTO: 'estado-gerando', EM_NEGOCIACAO: 'estado-negociando', ACEITO: 'estado-agendado',
  PLACAR_PENDENTE: 'estado-gerando', RECUSADO: 'estado-erro',
  AGENDADO: 'estado-agendado', CONFIRMADO: 'estado-sucesso', PENDENTE: 'estado-gerando',
}

const chave = computed(() => (props.status || '').toUpperCase())
const cor = computed(() => CORES[chave.value] ?? 'estado-rascunho')
const texto = computed(() =>
  te(`status.${chave.value}`) ? t(`status.${chave.value}`) : props.status || '-',
)
</script>

<template>
  <span
    class="etiqueta"
    :style="{ color: `var(--color-${cor})`, background: `color-mix(in srgb, var(--color-${cor}) 12%, white)` }"
  >{{ texto }}</span>
</template>
