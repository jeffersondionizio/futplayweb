<script setup lang="ts">
/**
 * O mata-mata em colunas, uma por fase.
 *
 * A tabela de pontos responde "quem está na frente"; o chaveamento responde
 * "quem enfrenta quem para chegar ao fim", que é outra pergunta e não cabe numa
 * lista de rodadas. As colunas rolam na horizontal porque uma chave de oitavas
 * tem quatro fases e nenhuma tela de celular comporta isso empilhado.
 */
import { useI18n } from 'vue-i18n'
import type { Jogo } from '../servicos/api'
import { nomeDoClube } from '../servicos/clubes'
import { finalizado } from '../servicos/estatisticas'
import { mensagensCampeonato } from '../servicos/idioma-campeonato'
import Foto from './Foto.vue'

const props = defineProps<{ fases: { fase: string; jogos: Jogo[] }[] }>()
const { t, te } = useI18n({ useScope: 'local', messages: mensagensCampeonato })

const rotulo = (fase: string) => (te(fase) ? t(fase) : fase.replaceAll('_', ' '))

/** Quem venceu, para destacar a linha. Empate no mata-mata vai aos pênaltis. */
function vencedor(jogo: Jogo): 'a' | 'b' | null {
  if (jogo.vencedor_penaltis_id) {
    return jogo.vencedor_penaltis_id === jogo.clube_a_id ? 'a' : 'b'
  }
  if (!finalizado(jogo)) return null
  const a = Number(jogo.placar_a)
  const b = Number(jogo.placar_b)
  if (a === b) return null
  return a > b ? 'a' : 'b'
}

const lados = (jogo: Jogo) => [
  { chave: 'a' as const, clube: jogo.clube_a_id, placar: jogo.placar_a },
  { chave: 'b' as const, clube: jogo.clube_b_id, placar: jogo.placar_b },
]

defineExpose({ fases: props.fases })
</script>

<template>
  <div class="chaveamento" role="group" :aria-label="t('chaveamento')">
    <section v-for="etapa in fases" :key="etapa.fase" class="chave-fase">
      <h3 class="chave-titulo">{{ rotulo(etapa.fase) }}</h3>
      <article v-for="jogo in etapa.jogos" :key="jogo.id" class="chave-jogo">
        <div
          v-for="lado in lados(jogo)"
          :key="lado.chave"
          class="chave-lado"
          :class="{
            venceu: vencedor(jogo) === lado.chave,
            perdeu: vencedor(jogo) && vencedor(jogo) !== lado.chave,
          }"
        >
          <Foto pasta="clube" :id="lado.clube" :nome="nomeDoClube(lado.clube)" classe="h-6 w-6" />
          <span class="chave-nome">{{ lado.clube ? nomeDoClube(lado.clube) : t('aDefinir') }}</span>
          <span class="chave-placar">{{ finalizado(jogo) ? lado.placar : '–' }}</span>
        </div>
        <p v-if="jogo.vencedor_penaltis_id" class="chave-nota">{{ t('penaltis') }}</p>
      </article>
      <p v-if="!etapa.jogos.length" class="chave-vazio">{{ t('aDefinir') }}</p>
    </section>
  </div>
</template>
