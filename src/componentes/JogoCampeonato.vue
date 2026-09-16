<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Jogo } from '../servicos/api'
import { nomeDoClube } from '../servicos/clubes'
import { finalizado } from '../servicos/estatisticas'
import { mensagensCampeonato } from '../servicos/idioma-campeonato'
import Foto from './Foto.vue'
import Etiqueta from './Etiqueta.vue'
defineProps<{ jogo: Jogo }>()
const { t, locale } = useI18n({ useScope: 'local', messages: mensagensCampeonato })
const quando = (data?: string) => {
  const valor = Date.parse(data ?? '')
  return Number.isFinite(valor) ? new Date(valor).toLocaleString(locale.value, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : t('aDefinir')
}
</script>

<template>
  <article class="jogo-card">
    <div class="jogo-meta"><span>{{ quando(jogo.data_hora) }}</span><Etiqueta :status="jogo.status" /></div>
    <div class="confronto">
      <div class="time-jogo"><Foto pasta="clube" :id="jogo.clube_a_id" :nome="nomeDoClube(jogo.clube_a_id)" classe="h-9 w-9" /><span>{{ nomeDoClube(jogo.clube_a_id) || t('aDefinir') }}</span></div>
      <strong class="placar">{{ finalizado(jogo) ? `${jogo.placar_a} – ${jogo.placar_b}` : '×' }}</strong>
      <div class="time-jogo"><Foto pasta="clube" :id="jogo.clube_b_id" :nome="nomeDoClube(jogo.clube_b_id)" classe="h-9 w-9" /><span>{{ nomeDoClube(jogo.clube_b_id) || t('aDefinir') }}</span></div>
    </div>
    <p class="jogo-local">{{ jogo.local || t('aDefinir') }}</p>
  </article>
</template>
