/**
 * Cliente da API do FutPlay.
 *
 * Toda chamada leva o ID token do Firebase no cabeçalho `Authorization`, que é o
 * que o autorizador do API Gateway valida. O token expira em uma hora, então ele
 * é pedido ao SDK a cada requisição — o Firebase devolve o de memória enquanto
 * estiver válido e renova sozinho quando não estiver.
 *
 * As rotas de lista devolvem array nu, não `{items:[...]}`. Isso é contrato do
 * backend, alinhado com o que o app Android declara; quem consumir aqui pode
 * confiar no array direto.
 */

import { API_BASE } from './configuracao'
import { tokenAtual } from './firebase'

export class ErroApi extends Error {
  // Campos declarados e atribuídos no corpo, e não como parâmetros do
  // construtor: o tsconfig do Vite usa `erasableSyntaxOnly`, que recusa
  // qualquer sintaxe que gere código em tempo de execução.
  readonly status: number
  readonly rota: string

  constructor(status: number, rota: string, mensagem: string) {
    super(mensagem)
    this.name = 'ErroApi'
    this.status = status
    this.rota = rota
  }
}

type Opcoes = {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  corpo?: unknown
  /** Rotas /publico/* dispensam o token — é o que permite navegar deslogado. */
  semAutenticacao?: boolean
}

async function requisitar<T>(rota: string, opcoes: Opcoes = {}): Promise<T> {
  const cabecalhos: Record<string, string> = { 'content-type': 'application/json' }

  if (!opcoes.semAutenticacao) {
    const token = await tokenAtual()
    if (!token) throw new ErroApi(401, rota, 'Sessão expirada. Entre novamente.')
    cabecalhos.authorization = `Bearer ${token}`
  }

  const resposta = await fetch(`${API_BASE}${rota}`, {
    method: opcoes.metodo ?? 'GET',
    headers: cabecalhos,
    body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
  })

  // 204 não tem corpo; tentar ler JSON aqui estoura sem motivo.
  if (resposta.status === 204) return undefined as T

  const texto = await resposta.text()
  let dados: unknown = null
  if (texto) {
    try {
      dados = JSON.parse(texto)
    } catch {
      throw new ErroApi(resposta.status, rota, 'Resposta inválida do servidor.')
    }
  }

  if (!resposta.ok) {
    const mensagem =
      (dados as { message?: string } | null)?.message ?? `Falha na requisição (${resposta.status})`
    throw new ErroApi(resposta.status, rota, mensagem)
  }

  return dados as T
}

const consulta = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

/* --------------------------------- tipos ---------------------------------- */

export type Jogador = {
  id: string
  nome: string
  username?: string
  imagem?: string
  posicao?: string
  /** O banco guarda `posicao_jogador`; a API manda as duas grafias. */
  posicao_jogador?: string
  idade?: string
  peso?: string
  pe_dominante?: string
  overal?: string
  finalizacao?: string
  passe?: string
  defesa?: string
  forca?: string
  velocidade?: string
  drible?: string
  gols?: string
  assistencias?: string
  seguidores_count?: number
  seguindo_count?: number
  /** Presente em GET /grupo/{id}/membros: dono, admin, membro ou pendente. */
  papel?: string
}

export type Grupo = {
  id: string
  nome: string
  cidade?: string
  imagem_url?: string
  dia_semana?: string
  hora_inicio?: string
  hora_fim?: string
  local?: string
  valor?: string
  tipo_pelada?: string
  qtde_jogadores?: string
  inscritos?: string
  participantes?: string
  pelada_proxima?: string
  data_peladaproxima?: string
  criado_por?: string
  pedido_pendente?: boolean
  rank_temporada?: string
  podio_temporada?: string
  temp_atual?: string
  /** Uids de quem administra, separados por virgula. Vem de grupoParaResposta. */
  admin?: string
  jogadores_por_time?: string
  latitude?: string
  longitude?: string
}

export type Clube = {
  id: string
  nome: string
  cidade?: string
  estado?: string
  escudo_url?: string
  descricao?: string
  owner_user_id?: string
  total_membros?: string
  meu_papel?: string
  privacidade?: string
}

export type Campeonato = {
  id: string
  nome: string
  imagem_url?: string
  formato?: string
  status?: string
  fase_atual?: string
  cidade?: string
  regulamento?: string
  clube_organizador_id?: string
  criado_por?: string
  qtd_grupos?: number
  classificados_por_grupo?: number
  data_inicio?: string
  data_fim?: string
}

export type Amistoso = {
  id: string
  clube_mandante_id: string
  clube_visitante_id: string
  status: string
  tipo: string
  data_hora?: string
  local_nome?: string
  cidade?: string
  estado?: string
  observacoes?: string
  placar_mandante?: string
  placar_visitante?: string
}

export type Participante = {
  campeonato_id: string
  clube_id: string
  status: string
  grupo_fase?: string
  pontos: string
  vitorias: string
  empates: string
  derrotas: string
  gols_pro: string
  gols_contra: string
  saldo_gols: string
}

export type Jogo = {
  id: string
  campeonato_id: string
  rodada: string
  fase: string
  grupo_id: string | null
  clube_a_id: string
  clube_b_id: string
  status: string
  placar_a: string
  placar_b: string
  /** No mata-mata, quem passou depois de empate no tempo normal. */
  vencedor_penaltis_id?: string
  data_hora?: string
  local?: string
}

export type EventoJogo = {
  id: string
  jogo_id: string
  jogador_id: string
  jogador_nome: string
  clube_id: string
  tipo: string
  minuto?: string
}

/** Uma solicitacao de entrada pendente, de GET /grupo/{id}/pedidos. */
export type PedidoEntrada = {
  grupoId: string
  jogadorId: string
  nome: string
  username: string
  imagem: string
  idade: string
  peso: string
  posicao: string
  criadoEmMillis: number
}

export type Mensagem = {
  mensagem_id: string
  autor_id: string
  autor_nome: string
  autor_imagem: string
  texto: string
  created_at: number
}

/* -------------------------------- chamadas -------------------------------- */

export const api = {
  /** Cria a sessão no backend e devolve o perfil, criando-o se for o 1º acesso. */
  sessao: () => requisitar<{ jogador: Jogador; novo_cadastro?: boolean }>('/auth/sessao', { metodo: 'POST' }),

  perfil: (id: string) => requisitar<Jogador>(`/jogador/${id}`),
  atualizarPerfil: (id: string, campos: Record<string, unknown>) =>
    requisitar<void>(`/jogador/${id}`, { metodo: 'PUT', corpo: campos }),

  meusGrupos: () => requisitar<Grupo[]>('/grupo'),
  criarGrupo: (corpo: Record<string, unknown>) => requisitar<void>('/grupo', { metodo: 'POST', corpo }),
  gruposPorCidade: (cidade: string) => requisitar<Grupo[]>(`/grupo${consulta({ cidade })}`),
  grupo: (id: string) => requisitar<Grupo>(`/grupo/${id}`),
  membrosDoGrupo: (id: string) => requisitar<Jogador[]>(`/grupo/${id}/membros`),
  solicitarEntradaGrupo: (id: string) =>
    requisitar<void>(`/grupo/${id}/solicitacao`, { metodo: 'POST', corpo: {} }),

  /**
   * Gestao da pelada. Tudo passa pela mesma rota de participacao, que decide a
   * permissao pelo papel de quem chama: `entrar` e `sair` valem para si mesmo,
   * o resto exige dono ou admin e responde 403 caso contrario.
   */
  pedidosDoGrupo: (id: string) => requisitar<PedidoEntrada[]>(`/grupo/${id}/pedidos`),
  entrarNoGrupo: (id: string) =>
    requisitar<void>(`/grupo/${id}/participacao`, { metodo: 'POST', corpo: { acao: 'entrar' } }),
  aceitarNoGrupo: (id: string, jogadorId: string) =>
    requisitar<void>(`/grupo/${id}/participacao`, {
      metodo: 'POST', corpo: { acao: 'aceitar', jogador_id: jogadorId },
    }),
  removerDoGrupo: (id: string, jogadorId: string) =>
    requisitar<void>(`/grupo/${id}/participacao`, {
      metodo: 'POST', corpo: { acao: 'remover', jogador_id: jogadorId },
    }),
  promoverNoGrupo: (id: string, jogadorId: string) =>
    requisitar<void>(`/grupo/${id}/participacao`, {
      metodo: 'POST', corpo: { acao: 'promover', jogador_id: jogadorId },
    }),
  atualizarGrupo: (id: string, campos: Record<string, unknown>) =>
    requisitar<void>(`/grupo/${id}`, { metodo: 'PUT', corpo: campos }),
  sairDoGrupo: (id: string, jogadorId: string) =>
    requisitar<void>(`/grupo/${id}/participacao`, { metodo: 'POST', corpo: { jogador_id: jogadorId, acao: 'sair' } }),

  meusClubes: () => requisitar<Clube[]>('/clubes'),
  clubesPorCidade: (cidade: string) => requisitar<Clube[]>(`/clubes${consulta({ cidade })}`),
  clube: (id: string) => requisitar<Clube>(`/clubes/${id}`),
  membrosDoClube: (id: string) => requisitar<unknown[]>(`/clubes/${id}/membros`),
  entrarNoClube: (id: string) =>
    requisitar<void>(`/clubes/${id}/membros`, { metodo: 'POST', corpo: { acao: 'entrar' } }),

  meusCampeonatos: () => requisitar<Campeonato[]>('/campeonatos'),
  criarCampeonato: (corpo: Record<string, unknown>) =>
    requisitar<Campeonato>('/campeonatos', { metodo: 'POST', corpo }),
  todosCampeonatos: () => requisitar<Campeonato[]>('/campeonatos?scope=all'),
  campeonato: (id: string) => requisitar<Campeonato>(`/campeonatos/${id}`),
  participantes: (id: string) => requisitar<Participante[]>(`/campeonatos/${id}/participantes`),
  jogos: (id: string) => requisitar<Jogo[]>(`/campeonatos/${id}/jogos`),
  eventosCampeonato: (id: string) => requisitar<EventoJogo[]>(`/campeonatos/${id}/eventos`),
  inscreverClube: (id: string, clubeId: string) =>
    requisitar<Participante>(`/campeonatos/${id}/participantes`, {
      metodo: 'POST',
      corpo: { clube_id: clubeId },
    }),

  amistosos: (scope: 'meus' | 'recebidos' | 'abertos' | 'historico', filtros: Record<string, string> = {}) =>
    requisitar<Amistoso[]>(`/amistosos${consulta({ scope, ...filtros })}`),
  amistoso: (id: string) => requisitar<Amistoso>(`/amistosos/${id}`),
  criarAmistoso: (corpo: Record<string, unknown>) =>
    requisitar<Amistoso>('/amistosos', { metodo: 'POST', corpo }),
  candidatarAmistoso: (id: string, clubeVisitanteId: string) =>
    requisitar<Amistoso>(`/amistosos/${id}/candidatura`, {
      metodo: 'PUT',
      corpo: { acao: 'CANDIDATAR', clube_visitante_id: clubeVisitanteId },
    }),

  chat: (contexto: 'grupo' | 'clubes' | 'campeonatos' | 'amistosos', id: string) =>
    requisitar<Mensagem[]>(`/${contexto}/${id}/chat`),
  enviarMensagem: (contexto: 'grupo' | 'clubes' | 'campeonatos' | 'amistosos', id: string, texto: string) =>
    requisitar<Mensagem>(`/${contexto}/${id}/chat`, { metodo: 'POST', corpo: { texto } }),
}

/**
 * Leitura aberta, em /publico/*.
 *
 * Devolve só campos de vitrine e nunca exige sessão. As telas usam estas
 * chamadas enquanto ninguém entrou, e trocam para as autenticadas depois do
 * login — que trazem o que é seu: participação, pedido pendente, chat.
 */
export const publico = {
  destaques: () =>
    requisitar<{ campeonatos: Campeonato[]; peladas: Grupo[] }>('/publico/destaques', { semAutenticacao: true }),

  campeonatos: (cidade?: string) =>
    requisitar<Campeonato[]>(`/publico/campeonatos${consulta({ cidade })}`, { semAutenticacao: true }),
  campeonato: (id: string) =>
    requisitar<Campeonato>(`/publico/campeonatos/${id}`, { semAutenticacao: true }),
  participantes: (id: string) =>
    requisitar<Participante[]>(`/publico/campeonatos/${id}/participantes`, { semAutenticacao: true }),
  jogos: (id: string) =>
    requisitar<Jogo[]>(`/publico/campeonatos/${id}/jogos`, { semAutenticacao: true }),
  eventos: (id: string) =>
    requisitar<EventoJogo[]>(`/publico/campeonatos/${id}/eventos`, { semAutenticacao: true }),

  amistosos: (abertos = true, cidade?: string) =>
    requisitar<Amistoso[]>(
      `/publico/amistosos${consulta({ abertos: abertos ? 'true' : undefined, cidade })}`,
      { semAutenticacao: true },
    ),

  clubes: (cidade: string) =>
    requisitar<Clube[]>(`/publico/clubes${consulta({ cidade })}`, { semAutenticacao: true }),
  clube: (id: string) => requisitar<Clube>(`/publico/clubes/${id}`, { semAutenticacao: true }),

  peladas: (cidade: string) =>
    requisitar<Grupo[]>(`/publico/peladas${consulta({ cidade })}`, { semAutenticacao: true }),
  pelada: (id: string) => requisitar<Grupo>(`/publico/peladas/${id}`, { semAutenticacao: true }),

  /** Cartao do atleta, por lista branca: sem email, sem uid do Firebase, sem scout. */
  jogador: (id: string) =>
    requisitar<Jogador>(`/publico/jogador/${id}`, { semAutenticacao: true }),
}

/** Escudo ou capa servida sem token. Foto de jogador continua exigindo sessão. */
export const urlImagemPublica = (pasta: 'clube' | 'grupo' | 'competicao', id: string) =>
  (id ? `${API_BASE}/publico/imagem/${pasta}/${id}` : '')
