import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('símbolo F usa verde escuro com contraste no cabeçalho', async () => {
  const cabecalho = await readFile(new URL('../src/componentes/Cabecalho.vue', import.meta.url), 'utf8')

  assert.match(cabecalho, /linear-gradient\(135deg, #075537, #064c42\)/)
})
