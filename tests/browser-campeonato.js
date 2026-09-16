// Autenticação e API são interceptadas apenas neste navegador de teste.
export default async function testarCampeonato(page) {
  const erros = []
  page.on('pageerror', e => erros.push(e.message))
  let falharEventos = false
  let vazio = false
  const nomes = { a: 'Unidos da Vila', b: 'Atlético do Bairro', c: 'Estrela do Norte' }
  const participante = (id, pontos, v, e, d, gp, gc) => ({ campeonato_id: 'teste', clube_id: id, status: 'CONFIRMADO', grupo_fase: '', pontos: String(pontos), vitorias: String(v), empates: String(e), derrotas: String(d), gols_pro: String(gp), gols_contra: String(gc), saldo_gols: String(gp - gc) })
  const partidas = [
    { id: 'j1', campeonato_id: 'teste', rodada: '1', fase: 'PONTOS_CORRIDOS', clube_a_id: 'a', clube_b_id: 'b', status: 'FINALIZADO', placar_a: '2', placar_b: '1', data_hora: '2026-09-14T19:00:00-04:00', local: 'Arena da Vila' },
    { id: 'j2', campeonato_id: 'teste', rodada: '2', fase: 'PONTOS_CORRIDOS', clube_a_id: 'b', clube_b_id: 'c', status: 'AGENDADO', placar_a: '0', placar_b: '0', data_hora: '2026-09-20T19:00:00-04:00', local: 'Campo Municipal' },
  ]
  await page.route('**/src/servicos/firebase.ts', route => route.fulfill({ contentType: 'application/javascript', body: `export const auth = { currentUser: { uid: 'teste' } }; export const aguardarSessao = async () => auth.currentUser; export const tokenAtual = async () => 'local-test-only'; export const entrarComGoogle = async () => {}; export const sair = async () => {};` }))
  await page.route('https://zamxi44hx6.execute-api.us-east-1.amazonaws.com/**', async route => {
    const path = route.request().url().replace('https://zamxi44hx6.execute-api.us-east-1.amazonaws.com', '').split('?')[0]
    let body = []
    if (path === '/auth/sessao') body = { jogador: { id: 'teste', nome: 'Teste' } }
    else if (path === '/campeonatos/teste') body = { id: 'teste', nome: 'Copa dos Bairros', cidade: 'Cuiabá', formato: 'PONTOS_CORRIDOS', status: 'EM_ANDAMENTO', regulamento: 'Vitória vale três pontos.' }
    else if (path.endsWith('/participantes')) body = vazio ? [] : [participante('a', 3, 1, 0, 0, 2, 1), participante('c', 0, 0, 0, 0, 0, 0), participante('b', 0, 0, 0, 1, 1, 2)]
    else if (path.endsWith('/jogos')) body = vazio ? [] : partidas
    else if (path.endsWith('/eventos')) {
      if (falharEventos) return route.fulfill({ status: 503, json: { message: 'Teste indisponível' } })
      body = vazio ? [] : [1, 2].map(i => ({ id: `e${i}`, jogo_id: 'j1', jogador_id: 'p1', jogador_nome: 'Rafael Silva', clube_id: 'a', tipo: 'GOL' }))
    } else if (path === '/clubes') body = Object.entries(nomes).map(([id, nome]) => ({ id, nome }))
    else if (path.startsWith('/clubes/')) body = { id: path.split('/').at(-1), nome: nomes[path.split('/').at(-1)] }
    else if (path === '/imagem/urls') body = { urls: {} }
    await route.fulfill({ json: body })
  })
  await page.setViewportSize({ width: 1440, height: 1050 })
  await page.goto('/campeonatos/teste')
  await page.getByRole('heading', { name: 'Copa dos Bairros' }).waitFor()
  await page.getByText('Rafael Silva', { exact: true }).waitFor()
  if (await page.getByRole('table').count() !== 1) throw Error('Tabela ausente')
  await page.screenshot({ path: 'test-results/campeonato-desktop.png', fullPage: true })
  await page.getByRole('tab', { name: 'Jogos', exact: true }).click()
  await page.getByText('Campo Municipal', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Rodada anterior', exact: true }).click()
  await page.getByText('Arena da Vila', { exact: true }).waitFor()
  await page.getByLabel('Filtrar jogos por clube').selectOption('c')
  await page.getByText('Nenhum jogo nesta seleção.').waitFor()
  await page.getByRole('tab', { name: 'Estatísticas', exact: true }).click()
  await page.getByRole('heading', { name: 'Defesas menos vazadas' }).waitFor()
  await page.getByRole('tab', { name: 'Estatísticas', exact: true }).press('ArrowRight')
  await page.getByText('Vitória vale três pontos.').waitFor()
  await page.getByRole('tab', { name: 'Classificação', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Overflow da página no celular')
  await page.screenshot({ path: 'test-results/campeonato-mobile.png', fullPage: true })
  falharEventos = true
  await page.getByRole('button', { name: 'Atualizar', exact: false }).click()
  await page.getByText('Não foi possível carregar os rankings de jogadores.').waitFor()
  falharEventos = false
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click()
  await page.getByText('Rafael Silva', { exact: true }).waitFor()
  vazio = true
  await page.getByRole('button', { name: 'Atualizar', exact: false }).click()
  await page.getByText('A classificação aparece quando os clubes forem confirmados.').waitFor()
  await page.getByRole('button', { name: 'Idioma', exact: true }).click()
  await page.getByRole('option', { name: 'English' }).click()
  await page.getByRole('tab', { name: 'Statistics', exact: true }).waitFor()
  if (erros.length) throw Error(erros.join('\n'))
  return 'PASS: classificação, artilharia, rodadas, filtro, estatísticas, teclado, mobile, erro/retry, vazio, idioma; API e sessão simuladas.'
}
