<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usarSessao } from '../estado/sessao'

const { t } = useI18n()
const sessao = usarSessao()
const roteador = useRouter()

const POSICOES = ['Goleiro', 'Zagueiro', 'Lateral', 'Volante', 'Meia', 'Atacante']
const PES = ['Direito', 'Esquerdo', 'Ambos']

const form = ref({
  nome: sessao.jogador?.nome ?? '',
  posicao: sessao.jogador?.posicao ?? '',
  idade: sessao.jogador?.idade ?? '',
  peso: sessao.jogador?.peso ?? '',
  pe_dominante: sessao.jogador?.pe_dominante ?? 'Direito',
})
const salvando = ref(false)
const erro = ref<string | null>(null)

async function salvar() {
  salvando.value = true
  erro.value = null
  try {
    await sessao.atualizar({ ...form.value })
    roteador.replace({ name: 'peladas' })
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <section class="secao grid place-items-center py-12">
    <form class="painel w-full max-w-lg p-8" @submit.prevent="salvar">
      <h1 class="text-2xl font-extrabold">{{ t('cadastro.titulo') }}</h1>
      <p class="mt-1 text-sm text-[var(--color-tinta-suave)]">{{ t('cadastro.texto') }}</p>

      <div class="mt-6 space-y-4">
        <label class="block">
          <span class="text-sm font-bold">{{ t('cadastro.nome') }}</span>
          <input v-model="form.nome" required class="campo mt-1" />
        </label>

        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block">
            <span class="text-sm font-bold">{{ t('cadastro.posicao') }}</span>
            <select v-model="form.posicao" required class="campo mt-1">
              <option value="" disabled>—</option>
              <option v-for="p in POSICOES" :key="p" :value="p">{{ p }}</option>
            </select>
          </label>

          <label class="block">
            <span class="text-sm font-bold">{{ t('cadastro.peDominante') }}</span>
            <select v-model="form.pe_dominante" class="campo mt-1">
              <option v-for="p in PES" :key="p" :value="p">{{ p }}</option>
            </select>
          </label>

          <label class="block">
            <span class="text-sm font-bold">{{ t('cadastro.idade') }}</span>
            <input v-model="form.idade" type="number" min="10" max="90" required class="campo mt-1" />
          </label>

          <label class="block">
            <span class="text-sm font-bold">{{ t('cadastro.peso') }}</span>
            <input v-model="form.peso" type="number" min="30" max="200" required class="campo mt-1" />
          </label>
        </div>
      </div>

      <p v-if="erro" class="mt-4 text-sm font-semibold text-[var(--color-estado-erro)]">{{ erro }}</p>

      <button type="submit" class="botao-primario mt-6 w-full" :disabled="salvando">
        {{ salvando ? t('cadastro.salvando') : t('cadastro.salvar') }}
      </button>
    </form>
  </section>
</template>
