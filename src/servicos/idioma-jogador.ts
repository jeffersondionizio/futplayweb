/**
 * Textos do perfil de atleta, em escopo local.
 *
 * Os nomes de prêmio caem num fallback quando a chave não existe aqui: o perfil
 * traz um contador por troféu, e a lista cresce no app sem passar por este
 * arquivo. É melhor mostrar a chave crua do que sumir com o troféu.
 */
export const mensagensJogador = {
  'pt-BR': {
    semNome: 'Atleta',
    anos: 'anos',
    overall: 'Overall',
    seguidores: 'seguidores',
    seguindo: 'seguindo',
    atributosTitulo: 'Atributos',
    carreiraTitulo: 'Carreira',
    trofeusTitulo: 'Troféus',
    semCarreira: 'Ainda sem números de carreira.',
    esteSouEu: 'Este é o seu perfil, como as outras pessoas veem.',
    entrarParaSeguir: 'Entre para seguir este atleta e ver o histórico completo.',
    atributos: {
      finalizacao: 'Finalização', passe: 'Passe', defesa: 'Defesa',
      forca: 'Força', velocidade: 'Velocidade', drible: 'Drible',
    },
    carreira: {
      gols: 'Gols', assistencias: 'Assistências', peladas_jogadas: 'Peladas',
      partidas_jogadas: 'Partidas', roubadas: 'Roubadas', defesas: 'Defesas',
      chutes_a_gol: 'Chutes a gol', defesas_penaltis: 'Pênaltis defendidos',
    },
    premios: {
      artilheiro: 'Artilheiro', maestro: 'Maestro', muralha: 'Muralha',
      ladrao: 'Ladrão', mvp: 'MVP', thebest: 'The Best',
      manofthematch: 'Craque da partida', bola: 'Bola de ouro',
      artilheiro_pelada: 'Artilheiro da pelada', maestro_pelada: 'Maestro da pelada',
      muralha_pelada: 'Muralha da pelada', ladrao_pelada: 'Ladrão da pelada',
    },
  },
  en: {
    semNome: 'Player',
    anos: 'years old',
    overall: 'Overall',
    seguidores: 'followers',
    seguindo: 'following',
    atributosTitulo: 'Attributes',
    carreiraTitulo: 'Career',
    trofeusTitulo: 'Trophies',
    semCarreira: 'No career numbers yet.',
    esteSouEu: 'This is your profile, as other people see it.',
    entrarParaSeguir: 'Sign in to follow this player and see the full history.',
    atributos: {
      finalizacao: 'Finishing', passe: 'Passing', defesa: 'Defending',
      forca: 'Strength', velocidade: 'Pace', drible: 'Dribbling',
    },
    carreira: {
      gols: 'Goals', assistencias: 'Assists', peladas_jogadas: 'Matchdays',
      partidas_jogadas: 'Games', roubadas: 'Tackles', defesas: 'Saves',
      chutes_a_gol: 'Shots on target', defesas_penaltis: 'Penalties saved',
    },
    premios: {
      artilheiro: 'Top scorer', maestro: 'Playmaker', muralha: 'Wall',
      ladrao: 'Ball winner', mvp: 'MVP', thebest: 'The Best',
      manofthematch: 'Man of the match', bola: 'Ballon d’Or',
      artilheiro_pelada: 'Matchday top scorer', maestro_pelada: 'Matchday playmaker',
      muralha_pelada: 'Matchday wall', ladrao_pelada: 'Matchday ball winner',
    },
  },
}
