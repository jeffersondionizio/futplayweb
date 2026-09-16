import { test } from '@playwright/test'
import testarCampeonato from './browser-campeonato.js'

test('central do campeonato: tabelas, navegação, rankings e recuperação', async ({ page }) => {
  await testarCampeonato(page)
})
