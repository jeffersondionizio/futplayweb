<script setup lang="ts">
import { onMounted } from 'vue'
import Cabecalho from './componentes/Cabecalho.vue'
import Rodape from './componentes/Rodape.vue'
import { usarSessao } from './estado/sessao'

const sessao = usarSessao()

// Restaura a sessão uma vez, na abertura. As telas protegidas esperam por ela
// no guard do roteador, então aqui não há corrida.
onMounted(() => sessao.restaurar())
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <Cabecalho />
    <main class="flex-1">
      <RouterView v-slot="{ Component }">
        <component :is="Component" />
      </RouterView>
    </main>
    <Rodape />
  </div>
</template>
