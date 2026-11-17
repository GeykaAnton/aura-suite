// Convierte el certificado de Supabase (prod-ca-2021.crt) en una línea lista para .env / Railway,
// y la guarda en backend/.env (crea el archivo desde .env.example si no existe).
//   npm run db:cert -- "C:\Users\TU-USUARIO\Downloads\prod-ca-2021.crt"
import { readFile, writeFile, access, copyFile } from 'node:fs/promises';

const certPath = process.argv[2];
if (!certPath) {
  console.error('Uso: npm run db:cert -- "ruta\\al\\prod-ca-2021.crt"');
  process.exit(1);
}

const pem = (await readFile(certPath, 'utf8')).trim();
if (!pem.startsWith('-----BEGIN CERTIFICATE-----')) {
  console.error('Ese archivo no parece un certificado PEM (debe empezar con -----BEGIN CERTIFICATE-----)');
  process.exit(1);
}
const oneLine = pem.replace(/\r?\n/g, '\\n');
const envLine = `DATABASE_CA_CERT="${oneLine}"`;

const envUrl = new URL('../.env', import.meta.url);
try {
  await access(envUrl);
} catch {
  await copyFile(new URL('../.env.example', import.meta.url), envUrl);
  console.log('📄 Creé backend/.env a partir de .env.example');
}
let env = await readFile(envUrl, 'utf8');
env = /^DATABASE_CA_CERT=.*$/m.test(env)
  ? env.replace(/^DATABASE_CA_CERT=.*$/m, () => envLine)
  : `${env.trimEnd()}\n${envLine}\n`;
await writeFile(envUrl, env);

console.log('✅ DATABASE_CA_CERT guardado en backend/.env');
console.log('\nPara Railway, copia este valor (sin las comillas) en la variable DATABASE_CA_CERT:\n');
console.log(oneLine);
