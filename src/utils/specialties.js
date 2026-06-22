/**
 * Áreas de atuação do veterinário — fonte única de verdade.
 *
 * Dois grupos:
 *  1. Espécies / grupos de animais (definem QUE animal o vet atende —
 *     usadas para filtrar os pets do cliente no agendamento).
 *  2. Especialidades clínicas (NÃO restringem espécie).
 */

export const SPECIALTY_GROUPS = [
  {
    group: 'Espécies que atende',
    items: [
      'Cães e Gatos',
      'Bovinos',
      'Equinos',
      'Ovinos e Caprinos',
      'Suínos',
      'Aves',
      'Animais Exóticos',
      'Animais Silvestres',
    ],
  },
  {
    group: 'Especialidades clínicas',
    items: [
      'Clínica Geral',
      'Cirurgia',
      'Dermatologia',
      'Oftalmologia',
      'Odontologia',
      'Cardiologia',
      'Ortopedia',
      'Oncologia',
      'Neurologia',
      'Reprodução e Obstetrícia',
      'Nutrição Animal',
      'Diagnóstico por Imagem',
      'Comportamento Animal',
      'Emergência e UTI',
    ],
  },
]

// Lista plana (compatível com onde só se precisa de um array simples)
export const ALL_SPECIALTIES = SPECIALTY_GROUPS.flatMap(g => g.items)

// Mapa especialidade(espécie) → espécies cadastráveis no pet.
// Especialidades clínicas NÃO entram aqui (não restringem espécie).
export const SPECIALTY_TO_SPECIES = {
  'Cães e Gatos': ['Cão', 'Gato'],
  'Bovinos': ['Bovino'],
  'Equinos': ['Equino'],
  'Ovinos e Caprinos': ['Ovino/Caprino'],
  'Suínos': ['Suíno'],
  'Aves': ['Ave'],
  'Animais Exóticos': ['Outro'],
  'Animais Silvestres': ['Outro'],
  // compatibilidade com rótulos antigos
  'Pequenos animais': ['Cão', 'Gato'],
  'Exóticos': ['Outro'],
}
