/**
 * Áreas de atuação do veterinário - fonte única de verdade.
 *
 * Dois grupos:
 *  1. Espécies / grupos de animais (definem QUE animal o vet atende -
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

// Mapa inverso espécie → especialidades que a atendem (derivado do acima).
export const SPECIES_TO_SPECIALTIES = Object.entries(SPECIALTY_TO_SPECIES)
  .reduce((acc, [specialty, species]) => {
    species.forEach(s => {
      if (!acc[s]) acc[s] = []
      if (!acc[s].includes(specialty)) acc[s].push(specialty)
    })
    return acc
  }, {})

/**
 * Um veterinário atende a espécie informada?
 * Usado para direcionar emergências/consultas só a quem selecionou a
 * área de atuação correspondente. Sem espécie definida → atende (não filtra).
 * Vet sem NENHUMA espécie cadastrada → não recebe (evita spam a perfis vazios).
 */
export function vetCoversSpecies(vetSpecialties, species) {
  if (!species) return true
  if (!Array.isArray(vetSpecialties) || vetSpecialties.length === 0) return false
  const wanted = SPECIES_TO_SPECIALTIES[species] || []
  if (wanted.length === 0) return true // espécie desconhecida → não bloqueia
  return vetSpecialties.some(s => wanted.includes(s))
}
