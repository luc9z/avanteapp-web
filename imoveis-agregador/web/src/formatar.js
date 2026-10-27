const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export const reais = (valor) => (valor ? moeda.format(valor) : null);
export const inteiro = (valor) => numero.format(valor);

export function plural(n, singular, pluralTexto = `${singular}s`) {
  return `${inteiro(n)} ${n === 1 ? singular : pluralTexto}`;
}

export function haQuantoTempo(iso) {
  if (!iso) return 'nunca';
  const minutos = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutos < 1) return 'agora há pouco';
  if (minutos < 60) return `há ${plural(minutos, 'minuto')}`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${plural(horas, 'hora')}`;
  return `há ${plural(Math.round(horas / 24), 'dia')}`;
}

/**
 * Anúncio que apareceu nas últimas 48 horas. O que já existia na primeira
 * coleta do sistema não conta como novo.
 */
export function ehNovo(anuncio, primeiraColetaEm) {
  if (!primeiraColetaEm || anuncio.primeiraVezEm <= primeiraColetaEm) return false;
  return Date.now() - Date.parse(anuncio.primeiraVezEm) < 48 * 3600_000;
}
