import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('backend rejeita novas entradas quando a lista da pelada está fechada', async () => {
  const codigo = await readFile(new URL('../backend/aws-source/cadepelada_grupos/grupo/index.js', import.meta.url), 'utf8')

  assert.match(codigo, /lista_fechada/)
  assert.match(codigo, /lista da pelada esta fechada/)
})

test('backend expõe pedidos do grupo somente ao organizador pelo Gateway', async () => {
  const codigo = await readFile(new URL('../backend/aws-source/cadepelada_grupos/grupo/index.js', import.meta.url), 'utf8')

  assert.match(codigo, /sub === 'pedidos' && metodo === 'GET'/)
})
