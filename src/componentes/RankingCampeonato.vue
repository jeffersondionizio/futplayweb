<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { rankingJogadores } from '../servicos/estatisticas'
import { nomeDoClube } from '../servicos/clubes'
import { mensagensCampeonato } from '../servicos/idioma-campeonato'
import Foto from './Foto.vue'
defineProps<{ titulo: string; lista: ReturnType<typeof rankingJogadores> }>()
const { t } = useI18n({ useScope: 'local', messages: mensagensCampeonato })
</script>

<template>
  <section class="painel ranking-painel">
    <h2 class="titulo-painel">{{ titulo }}</h2>
    <p v-if="!lista.length" class="vazio-campeonato">{{ t('semEventos') }}</p>
    <ol v-else class="ranking-lista">
      <li v-for="p in lista" :key="`${p.id}:${p.clube}:${p.nome}`">
        <span class="ranking-posicao">{{ p.posicao }}</span>
        <Foto pasta="perfil" :id="p.id" :nome="p.nome" classe="h-11 w-11" redonda />
        <div class="ranking-nome"><strong>{{ p.nome }}</strong><span>{{ nomeDoClube(p.clube) }}</span></div>
        <strong class="ranking-valor">{{ p.total }}<span>{{ t('total') }}</span></strong>
      </li>
    </ol>
  </section>
</template>
