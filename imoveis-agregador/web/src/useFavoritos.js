import { useCallback, useState } from 'react';

const CHAVE = 'aluga-canoas:favoritos';

function ler() {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHAVE) ?? '[]'));
  } catch {
    return new Set();
  }
}

/** Favoritos ficam salvos só neste navegador. */
export function useFavoritos() {
  const [favoritos, setFavoritos] = useState(ler);

  const alternar = useCallback((id) => {
    setFavoritos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      try {
        localStorage.setItem(CHAVE, JSON.stringify([...novo]));
      } catch {
        // navegador sem armazenamento: favoritos valem só nesta aba
      }
      return novo;
    });
  }, []);

  return { favoritos, alternar };
}
