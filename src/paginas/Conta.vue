<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usarSessao } from '../estado/sessao'
import Foto from '../componentes/Foto.vue'

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
const salvo = ref(false)
const erro = ref<string | null>(null)

/** Atributos são calculados pelo app a partir dos scouts; aqui só se mostra. */
const ATRIBUTOS = ['finalizacao', 'passe', 'defesa', 'forca', 'velocidade', 'drible'] as const

async function salvar() {
  salvando.value = true
  salvo.value = false
  erro.value = null
  try {
    await sessao.atualizar({ ...form.value })
    salvo.value = true
  } catch (e) {
    erro.value = (e as Error).message
  } finally {
    salvando.value = false
  }
}

async function sair() {
  await sessao.sair()
  roteador.replace({ name: 'inicio' })
}
</script>

<template>
  <section class="secao py-10">
    <h1 class="mb-6 text-3xl font-extrabold">{{ t('conta.titulo') }}</h1>

    <div class="grid gap-6 lg:grid-cols-3">
      <div class="painel p-6 text-center">
        <Foto v-if="sessao.jogador" pasta="perfil" :id="sessao.jogador.id" :nome="sessao.jogador.nome" classe="mx-auto h-24 w-24" redonda />
        <h2 class="mt-4 text-xl font-extrabold">{{ sessao.jogador?.nome }}</h2>
        <p class="text-sm text-[var(--color-tinta-fraca)]">{{ sessao.jogador?.posicao || t('comum.naoInformado') }}</p>

        <p class="mt-4 text-5xl font-extrabold text-[var(--color-marca)]">
          {{ sessao.jogador?.overal ?? '—' }}
        </p>
        <p class="text-xs font-bold uppercase tracking-wide text-[var(--color-tinta-fraca)]">Overall</p>

        <button type="button" class="botao-secundario mt-6 w-full" @click="sair">{{ t('conta.sair') }}</button>
      </div>

      <form class="painel p-6 lg:col-span-2" @submit.prevent="salvar">
        <h2 class="font-bold">{{ t('conta.dados') }}</h2>

        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <label class="block sm:col-span-2">
            <span class="text-sm font-bold">{{ t('cadastro.nome') }}</span>
            <input v-model="form.nome" required class="campo mt-1" />
          </label>
          <label class="block">
            <span class="text-sm font-bold">{{ t('cadastro.posicao') }}</span>
            <select v-model="form.posicao" class="campo mt-1">
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
            <input v-model="form.idade" type="number" class="campo mt-1" />
          </label>
          <label class="block">
            <span class="text-sm font-bold">{{ t('cadastro.peso') }}</span>
            <input v-model="form.peso" type="number" class="campo mt-1" />
          </label>
        </div>

        <h2 class="mt-8 font-bold">{{ t('conta.atributos') }}</h2>
        <dl class="mt-3 grid grid-cols-3 gap-3">
          <div v-for="a in ATRIBUTOS" :key="a" class="rounded-lg bg-[var(--color-papel)] p-3 text-center">
            <dt class="text-[11px] font-bold uppercase text-[var(--color-tinta-fraca)]">{{ a }}</dt>
            <dd class="text-lg font-extrabold">{{ (sessao.jogador as Record<string, unknown> | null)?.[a] ?? '—' }}</dd>
          </div>
        </dl>

        <p v-if="salvo" class="mt-4 text-sm font-semibold text-[var(--color-estado-sucesso)]">{{ t('conta.salvo') }}</p>
        <p v-if="erro" class="mt-4 text-sm font-semibold text-[var(--color-estado-erro)]">{{ erro }}</p>

        <button type="submit" class="botao-primario mt-6" :disabled="salvando">
          {{ salvando ? t('cadastro.salvando') : t('conta.salvar') }}
        </button>
      </form>
    </div>
  </section>
</template>
