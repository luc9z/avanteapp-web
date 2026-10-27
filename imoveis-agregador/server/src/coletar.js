// Coleta manual pela linha de comando: npm run coletar
import * as armazenamento from './armazenamento.js';
import { coletarTudo } from './coletor.js';

await armazenamento.carregar();
await coletarTudo();
