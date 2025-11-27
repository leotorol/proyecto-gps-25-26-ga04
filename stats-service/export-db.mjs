import 'dotenv/config';
import { exec } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { MongoClient } from 'mongodb';
import readline from 'node:readline';

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('Error: MONGO_URI no está definido en el archivo .env');
  process.exit(1);
}

const dataDumpPath = path.join(process.cwd(), 'data-dump');
if (!fs.existsSync(dataDumpPath)) {
  fs.mkdirSync(dataDumpPath, { recursive: true });
}
const dbmetaFile = path.join(process.cwd(), 'config', 'dbmeta.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function extractDbName(mongoUri) {
  const urlPath = new URL(mongoUri).pathname;
  return urlPath.substring(1) || 'undersounds';
}

async function filterNonEmptyCollections(db, collections) {
  const results = await Promise.all(
    collections.map(async (col) => {
      const count = await db.collection(col.name).estimatedDocumentCount();
      return { name: col.name, count };
    })
  );
  return results.filter(col => col.count > 0).map(col => col.name);
}

async function listCollections() {
  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  try {
    await client.connect();
    const dbName = extractDbName(uri);
    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();
    return await filterNonEmptyCollections(db, collections);
  } catch (error) {
    console.error("Error listando colecciones de forma dinámica:", error.message);
    return [];
  } finally {
    await client.close();
  }
}

function readUserInput(timeoutMs = 60000) {
  return new Promise((resolve) => {
    let data = '';
    const stdinListener = (chunk) => {
      data += chunk.toString();
      if (data.includes('\n')) {
        cleanup();
        resolve(data.trim());
      }
    };
    const timeout = setTimeout(() => {
      cleanup();
      resolve('');
    }, timeoutMs);
    function cleanup() {
      process.stdin.removeListener('data', stdinListener);
      clearTimeout(timeout);
    }
    process.stdin.setRawMode(false);
    process.stdin.resume();
    process.stdin.on('data', stdinListener);
  });
}

function cleanUserInput(answer) {
  console.log(`\nEntrada recibida (raw): "${answer}", longitud: ${answer.length}`);
  console.log(`Bytes recibidos: ${[...answer].map(c => c.codePointAt(0)).join(', ')}`);
  const cleanAnswer = answer.replaceAll(/\s+/g, '');
  console.log(`Entrada limpiada: "${cleanAnswer}", longitud: ${cleanAnswer.length}`);
  return cleanAnswer;
}

function validateAndLogIndex(fragment, maxIndex) {
  const trimmed = fragment.trim();
  if (trimmed === '') return null;
  const index = Number.parseInt(trimmed, 10);
  const isValid = !Number.isNaN(index) && index >= 0 && index < maxIndex;
  console.log(isValid ? `    ✓ Índice válido: ${index}` : `    ✗ Índice inválido: ${trimmed}`);
  return isValid ? index : null;
}

function parseMultipleIndices(fragments, maxIndex) {
  const validIndices = [];
  console.log(`Procesando ${fragments.length} índices:`);
  for (const [i, fragment] of fragments.entries()) {
    console.log(`  ${i + 1}. Fragmento: "${fragment.trim()}"`);
    const index = validateAndLogIndex(fragment, maxIndex);
    if (index !== null) validIndices.push(index);
  }
  return validIndices;
}

function parseSingleIndex(cleanAnswer, maxIndex) {
  console.log(`Procesando como único índice: ${cleanAnswer}`);
  const index = validateAndLogIndex(cleanAnswer, maxIndex);
  return index == null ? [] : [index];
}

function parseIndices(cleanAnswer, maxIndex) {
  if (cleanAnswer.includes(',')) {
    return parseMultipleIndices(cleanAnswer.split(','), maxIndex);
  }
  return parseSingleIndex(cleanAnswer, maxIndex);
}

function displayAvailableCollections(collections) {
  console.log("\n===== EXPORTACIÓN DE COLECCIONES =====");
  console.log("\nColecciones disponibles:");
  for (const [index, name] of collections.entries()) {
    console.log(`${index}: ${name}`);
  }
}

async function selectCollections() {
  const dynamicChoices = await listCollections();
  if (dynamicChoices.length === 0) {
    console.log("No se encontraron colecciones (con datos) en la base de datos.");
    rl.close();
    process.exit(1);
  }

  displayAvailableCollections(dynamicChoices);

  process.stdout.write("\nEscribe los índices de las colecciones a exportar separados por coma (ej. 0,1) o presiona Enter para exportar todas: ");

  const answer = await readUserInput();
  const cleanAnswer = cleanUserInput(answer);

  if (cleanAnswer === "") {
    console.log("Entrada vacía detectada. Se exportarán TODAS las colecciones.");
    return { collections: dynamicChoices };
  }

  const validIndices = parseIndices(cleanAnswer, dynamicChoices.length);

  if (validIndices.length === 0) {
    console.log("No se encontraron índices válidos. Se exportarán TODAS las colecciones.");
    return { collections: dynamicChoices };
  }

  const selectedCollections = validIndices.map(idx => dynamicChoices[idx]);

  console.log("\nCOLECCIONES SELECCIONADAS PARA EXPORTAR:");
  for (const [i, name] of selectedCollections.entries()) {
    console.log(`${i + 1}. ${name}`);
  }

  return { collections: selectedCollections };
}

async function exportSingleCollection(col) {
  const tempFile = path.join(dataDumpPath, `temp_${col}.json`);
  const outputFile = path.join(dataDumpPath, `${col}.json`);

  const exportCommand = `mongoexport --uri "${uri}" --collection ${col} --out "${tempFile}"`;
  console.log(`Ejecutando: ${exportCommand}`);

  return new Promise((resolve, reject) => {
    exec(exportCommand, (error) => {
      if (error) {
        console.error(`Error exportando la colección ${col}:`, error.message);
        return reject(error);
      }
      try {
        const content = fs.readFileSync(tempFile, 'utf8');
        const documents = content.split('\n').filter(line => line.trim() !== '');
        const jsonArray = `[\n${documents.join(',\n')}\n]`;
        fs.writeFileSync(outputFile, jsonArray);
        fs.unlinkSync(tempFile);
        console.log(`Colección ${col} exportada exitosamente en: ${outputFile}`);
        resolve();
      } catch (err) {
        console.error(`Error procesando la colección ${col}:`, err.message);
        reject(err);
      }
    });
  });
}

function updateMetadata(collectionsToExport) {
  let meta = {};
  try {
    if (fs.existsSync(dbmetaFile)) {
      const metaContent = fs.readFileSync(dbmetaFile, 'utf8');
      meta = JSON.parse(metaContent);
    }
  } catch (err) {
    console.error(`Error leyendo ${dbmetaFile}:`, err.message);
  }

  meta.colecciones = collectionsToExport;

  try {
    fs.writeFileSync(dbmetaFile, JSON.stringify(meta, null, 2));
    console.log(`Archivo de metadata actualizado en: ${dbmetaFile}`);
  } catch (err) {
    console.error(`Error actualizando ${dbmetaFile}:`, err.message);
  }
}

async function exportCollections() {
  const { collections: collectionsToExport } = await selectCollections();

  if (!collectionsToExport || collectionsToExport.length === 0) {
    console.log('No se seleccionó ninguna colección para exportar.');
    rl.close();
    process.exit(0);
  }

  for (const col of collectionsToExport) {
    await exportSingleCollection(col);
  }

  updateMetadata(collectionsToExport);

  console.log('Exportación completa para las colecciones seleccionadas.');
  rl.close();
  process.exit(0);
}

// Top-level await (ESM)
try {
  await exportCollections();
} catch (err) {
  console.error('Error en la exportación:', err);
  rl.close();
  process.exit(1);
}