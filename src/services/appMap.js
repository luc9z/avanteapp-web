/**
 * appMap.js - o mapa do app que a IA conhece.
 *
 * Por que existir: perguntam "onde eu faço X?" o tempo todo, e um modelo
 * sem mapa responde inventando tela, botão e caminho com toda a
 * confiança. Quem já estava perdido fica pior. Aqui está o que EXISTE,
 * e o prompt recebe só isto.
 *
 * CADA CAMINHO FOI CONFERIDO no código, não suposto. Vale reparar que
 * várias telas NÃO são abas da barra inferior:
 *   - abas do cliente: Buscar, Pedidos, IA, Favoritos, Perfil
 *   - abas do veterinário: Início, Agenda, IA, Desempenho, Perfil
 * Animais, Solicitações, Planos, Indicação e Avaliações ficam dentro de
 * outras telas. Escrever "aba Animais" mandaria a pessoa procurar uma
 * aba que não está lá.
 *
 * Campos:
 *   chave    identificador que a IA devolve em [IR:chave]
 *   papel    'client' | 'vet' | 'ambos'
 *   titulo   nome do destino em linguagem de usuário
 *   aba      de qual aba da barra inferior a jornada começa
 *   rota     caminho real (conferido em App.jsx)
 *   alvo     seletor data-coach para acender o elemento na chegada
 *   passos   o caminho, um toque por item
 *   resumo   uma frase sobre o que dá para fazer ali
 *
 * Tela nova precisa entrar aqui. Se esquecer, a IA não inventa: ela
 * responde que não conhece, que é o jeito certo de falhar.
 */

export const MAPA = [
  /* ── Cliente ─────────────────────────────────────────────── */
  {
    chave: 'buscar_vet', papel: 'client', titulo: 'Buscar veterinário',
    aba: 'Buscar', rota: '/home', alvo: '[data-coach="vet-card"]',
    passos: ['Abra a aba Buscar', 'Use os filtros de espécie ou o campo de busca', 'Toque no cartão do veterinário'],
    resumo: 'Ver quem atende sua região e sua espécie.',
  },
  {
    chave: 'agendar', papel: 'client', titulo: 'Pedir um atendimento',
    aba: 'Buscar', rota: '/home', alvo: '[data-coach="vet-card"]',
    passos: ['Abra a aba Buscar', 'Toque no veterinário', 'Toque em Solicitar atendimento',
             'Responda serviço, animal, data e local'],
    resumo: 'O app pergunta uma coisa de cada vez.',
  },
  {
    chave: 'emergencia', papel: 'client', titulo: 'Chamar emergência',
    aba: 'Buscar', rota: '/home',
    passos: ['Abra a aba Buscar', 'Toque no botão vermelho Emergência veterinária, no topo'],
    resumo: 'O chamado vai para todos os veterinários que atendem a espécie do seu animal.',
  },
  {
    chave: 'meus_pedidos', papel: 'client', titulo: 'Acompanhar pedidos',
    aba: 'Pedidos', rota: '/my-requests', alvo: '[data-coach="req-filters"]',
    passos: ['Abra a aba Pedidos', 'Use os filtros do topo para separar por situação'],
    resumo: 'O filtro Precisa de você mostra o que espera uma ação sua.',
  },
  {
    chave: 'aprovar_orcamento', papel: 'client', titulo: 'Aprovar ou recusar orçamento',
    aba: 'Pedidos', rota: '/my-requests', alvo: '[data-coach="req-filters"]',
    passos: ['Abra a aba Pedidos', 'Toque no filtro Precisa de você', 'Abra o pedido',
             'Use Aprovar ou Recusar no orçamento'],
    resumo: 'O orçamento aparece no pedido assim que o veterinário envia.',
  },
  {
    chave: 'avaliar', papel: 'client', titulo: 'Avaliar o atendimento',
    aba: 'Pedidos', rota: '/my-requests', alvo: '[data-coach="req-filters"]',
    passos: ['Abra a aba Pedidos', 'Toque no filtro Precisa de você',
             'Abra o atendimento finalizado', 'Toque em Avaliar'],
    resumo: 'Sua nota é o que ajuda outros tutores a escolher.',
  },
  {
    chave: 'meus_animais', papel: 'client', titulo: 'Cadastrar animal',
    aba: 'Perfil', rota: '/pets', alvo: '[data-coach="pet-add"]',
    passos: ['Abra a aba Perfil', 'Toque em Meus animais', 'Toque em Adicionar animal'],
    resumo: 'Cadastre uma vez e ele aparece na hora de pedir atendimento.',
  },
  {
    chave: 'prontuario', papel: 'client', titulo: 'Prontuário do animal',
    aba: 'Perfil', rota: '/pets', alvo: '[data-coach="pet-card"]',
    passos: ['Abra a aba Perfil', 'Toque em Meus animais', 'Toque no animal'],
    resumo: 'Vacinas, exames, consultas, medicamentos e o peso ficam ali.',
  },
  {
    chave: 'enderecos', papel: 'client', titulo: 'Cadastrar endereço ou propriedade',
    aba: 'Perfil', rota: '/edit-profile', alvo: '[data-coach="perfil-propriedades"]',
    passos: ['Abra a aba Perfil', 'Desça até Minhas Propriedades',
             'Toque em Adicionar propriedade', 'Marque o ponto no mapa'],
    resumo: 'Com o ponto marcado, o veterinário chega sem ligar pedindo referência.',
  },
  {
    chave: 'favoritos', papel: 'client', titulo: 'Veterinários favoritos',
    aba: 'Favoritos', rota: '/favorites',
    passos: ['Abra a aba Favoritos'],
    resumo: 'Para favoritar, toque no coração no cartão do veterinário.',
  },

  /* ── Veterinário ─────────────────────────────────────────── */
  {
    chave: 'ficar_online', papel: 'vet', titulo: 'Ficar online',
    aba: 'Início', rota: '/dashboard', alvo: '[data-coach="vet-online"]',
    passos: ['Abra a aba Início', 'Toque no botão de status, no topo'],
    resumo: 'Só quem está online aparece na busca dos clientes.',
  },
  {
    chave: 'solicitacoes', papel: 'vet', titulo: 'Aceitar ou recusar solicitações',
    aba: 'Início', rota: '/dashboard', alvo: '[data-coach="vet-pending"]',
    passos: ['Abra a aba Início', 'Vá em Solicitações Pendentes',
             'Toque em Ver todas para a lista completa', 'Abra o pedido e use Aceitar ou Recusar'],
    resumo: 'Os pedidos que esperam sua resposta ficam aqui.',
  },
  {
    chave: 'orcamento', papel: 'vet', titulo: 'Enviar orçamento',
    aba: 'Início', rota: '/dashboard', alvo: '[data-coach="vet-pending"]',
    passos: ['Abra a solicitação já aceita', 'Toque em Enviar Orçamento',
             'Use Sugerir com IA para montar os itens', 'Confira os valores e envie'],
    resumo: 'A IA monta a proposta; o valor final é sempre seu.',
  },
  {
    chave: 'areas_atuacao', papel: 'vet', titulo: 'Áreas de atuação',
    aba: 'Perfil', rota: '/edit-profile', alvo: '[data-coach="perfil-areas"]',
    passos: ['Abra a aba Perfil', 'Desça até Áreas de atuação', 'Marque as espécies que você atende'],
    resumo: 'É o que decide quais emergências chegam até você.',
  },
  {
    chave: 'area_atendimento', papel: 'vet', titulo: 'Onde você atende',
    aba: 'Perfil', rota: '/edit-profile', alvo: '[data-coach="perfil-area-atend"]',
    passos: ['Abra a aba Perfil', 'Desça até Área de atendimento',
             'Marque sua base no mapa', 'Escolha o raio que cobre'],
    resumo: 'O cliente vê a distância até você na busca.',
  },
  {
    chave: 'apresentacao', papel: 'vet', titulo: 'Escrever sua apresentação (bio)',
    aba: 'Perfil', rota: '/edit-profile', alvo: '[data-coach="perfil-bio"]',
    passos: ['Abra a aba Perfil', 'Toque em Editar perfil', 'Escreva no campo Apresentação', 'Toque em Salvar alterações'],
    resumo: 'Aparece para o cliente na sua página, antes de ele te chamar.',
  },
  {
    chave: 'horarios', papel: 'vet', titulo: 'Definir horários de atendimento',
    aba: 'Agenda', rota: '/agenda', alvo: '[data-coach="agenda-tabs"]',
    passos: ['Abra a aba Agenda', 'Toque em Disponibilidade', 'Marque os dias e as faixas de horário'],
    resumo: 'É daqui que sai a lista de horários livres que o cliente vê.',
  },
  {
    chave: 'ativar_horarios', papel: 'vet', titulo: 'Ativar meus horários',
    aba: 'Agenda', rota: '/agenda', alvo: '[data-coach="disp-toggle"]',
    passos: ['Abra a aba Agenda', 'Toque em Disponibilidade',
             'Ligue a chave Definir meus horários de atendimento',
             'Escolha a duração de cada atendimento',
             'Ligue os dias e informe de que horas até que horas',
             'Toque em Salvar'],
    resumo: 'Sem ligar a chave, o cliente pode pedir qualquer dia e hora.',
  },
  {
    chave: 'agenda', papel: 'vet', titulo: 'Ver a agenda',
    aba: 'Agenda', rota: '/agenda', alvo: '[data-coach="agenda-legend"]',
    passos: ['Abra a aba Agenda', 'Fique em Calendário'],
    resumo: 'A cor do dia mostra a situação: amarelo pendente, azul em andamento, verde finalizado.',
  },
  {
    chave: 'desempenho', papel: 'vet', titulo: 'Ver desempenho e receita',
    aba: 'Desempenho', rota: '/reports', alvo: '[data-coach="perf-kpis"]',
    passos: ['Abra a aba Desempenho', 'Escolha o período no topo'],
    resumo: 'Tocar num mês do gráfico abre a lista daquele mês.',
  },
  {
    chave: 'meta', papel: 'vet', titulo: 'Definir meta de receita',
    aba: 'Desempenho', rota: '/reports',
    passos: ['Abra a aba Desempenho', 'Vá ao cartão de meta', 'Toque em Definir meta',
             'Escolha meta que zera todo mês ou valor fixo'],
    resumo: 'A meta fixa vai sendo abatida pela receita de todos os meses.',
  },
  {
    chave: 'prontuario_vet', papel: 'vet', titulo: 'Prontuário durante o atendimento',
    aba: 'Início', rota: '/pending-requests',
    passos: ['Abra o atendimento', 'No bloco do animal, toque em Prontuário'],
    resumo: 'As últimas entradas aparecem ali mesmo, sem sair do atendimento.',
  },
  {
    chave: 'planos', papel: 'vet', titulo: 'Assinar um plano',
    aba: 'Início', rota: '/plans',
    passos: ['Abra a aba Início', 'Toque no cartão de plano'],
    resumo: 'O Premium coloca você no topo da busca e dá o selo de destaque.',
  },
  {
    chave: 'trocar_plano', papel: 'vet', titulo: 'Assinar, trocar ou cancelar plano',
    aba: 'Perfil', rota: '/plans',
    passos: ['Abra a aba Perfil', 'Toque em Meu plano', 'Escolha o plano'],
    resumo: 'Também dá para chegar pelo cartão de plano na aba Início.',
  },
  {
    chave: 'indicacao', papel: 'vet', titulo: 'Indicar outro veterinário',
    aba: 'Perfil', rota: '/referral',
    passos: ['Abra a aba Perfil', 'Desça até Indicação', 'Compartilhe seu código'],
    resumo: 'Cada veterinário que assinar rende um mês para você.',
  },
  {
    chave: 'avaliacoes', papel: 'vet', titulo: 'Ver minhas avaliações',
    aba: 'Início', rota: '/ratings',
    passos: ['Abra a aba Início', 'Toque na sua nota média'],
    resumo: 'A nota vem das avaliações dos clientes atendidos.',
  },
  {
    chave: 'conversas_vet', papel: 'vet', titulo: 'Conversas',
    aba: 'Início', rota: '/chats',
    passos: ['Abra a aba Início', 'Toque em Conversas'],
    resumo: 'Todas as conversas com clientes ficam nessa lista.',
  },

  /* ── Os dois ─────────────────────────────────────────────── */
  {
    chave: 'perfil', papel: 'ambos', titulo: 'Editar perfil',
    aba: 'Perfil', rota: '/edit-profile', alvo: '[data-coach="perfil-dados"]',
    passos: ['Abra a aba Perfil', 'Ajuste foto, nome e telefone', 'Toque em Salvar alterações'],
    resumo: 'Telefone certo é o que permite te acharem na hora do atendimento.',
  },
  {
    chave: 'tema', papel: 'ambos', titulo: 'Trocar entre tema claro e escuro',
    aba: 'Início', rota: '/edit-profile',
    passos: ['Toque no ícone de sol ou lua, no topo da tela inicial'],
    resumo: 'O app abre no escuro por padrão.',
  },
]

/* ── Consulta ──────────────────────────────────────────────── */

/** Só o que interessa ao papel de quem está perguntando. */
export function mapaDoPapel(papel) {
  const p = papel === 'vet' ? 'vet' : 'client'
  return MAPA.filter(m => m.papel === p || m.papel === 'ambos')
}

/** O caminho em uma linha, do jeito que a IA responde. */
export function caminhoEmTexto(m) {
  return `${m.passos.join('. ')}. ${m.resumo}`
}

/**
 * O mapa em texto para o prompt. Formato enxuto de propósito: cada
 * linha custa tokens em toda pergunta que a pessoa faz.
 */
export function mapaParaPrompt(papel) {
  // Sem o resumo: ele existe para o cartão na tela, não para o modelo.
  // Cortar essa linha economiza cerca de um terço do custo do mapa.
  return mapaDoPapel(papel)
    .map(m => `- ${m.chave}: ${m.titulo} = ${m.passos.join(' > ')}`)
    .join('\n')
}

/** Destino pela chave que a IA devolveu. */
export function destinoPorChave(chave) {
  return MAPA.find(m => m.chave === chave) || null
}

/**
 * Perguntas prontas para os atalhos do chat. Saem do mapa, então nunca
 * apontam para tela inexistente e não custam nada da IA até serem
 * tocadas.
 */
export function atalhosDeAjuda(papel) {
  const ordem = papel === 'vet'
    ? ['ficar_online', 'solicitacoes', 'horarios', 'orcamento']
    : ['agendar', 'meus_animais', 'aprovar_orcamento', 'enderecos']
  return ordem.map(destinoPorChave).filter(Boolean)
}

/**
 * Lê os marcadores [IR:chave] da resposta e devolve o texto limpo mais
 * os destinos citados. Chave inexistente é descartada em silêncio: se a
 * IA inventar um nome, o marcador some em vez de virar botão quebrado.
 */
export function extrairDestinos(texto) {
  const encontrados = []
  const limpo = String(texto || '')
    .replace(/\[IR:([a-z_]+)\]/gi, (_, chave) => {
      const destino = destinoPorChave(chave.toLowerCase())
      if (destino && !encontrados.some(d => d.chave === destino.chave)) {
        encontrados.push(destino)
      }
      return ''
    })
    .replace(/[ \t]+\n/g, '\n')
    .trim()

  return { texto: limpo, destinos: encontrados }
}
