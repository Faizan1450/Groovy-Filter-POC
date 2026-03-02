'use strict';

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const EXTRACT_DIR = path.resolve(__dirname, '..', 'temp_extracted');

/**
 * Finds the first .zip file inside the data/ folder.
 * @returns {string} Absolute path to the zip file.
 */
function findZipFile() {
  const files = fs.readdirSync(DATA_DIR);
  const zipFile = files.find((f) => f.toLowerCase().endsWith('.zip'));

  if (!zipFile) {
    throw new Error(`No .zip file found in the data/ folder (${DATA_DIR})`);
  }

  return path.join(DATA_DIR, zipFile);
}

/**
 * Extracts the zip file into temp_extracted/ and resolves paths
 * to the script folder and .iflw file inside the expected directory structure.
 *
 * Expected structure inside zip:
 *   <anything>/src/main/resources/script/         ← groovy scripts
 *   <anything>/src/main/resources/scenarioflows/integrationflow/*.iflw
 *
 * @returns {{ scriptDir: string, iflwPath: string, zipName: string }}
 */
function extractAndResolvePaths() {
  const zipPath = findZipFile();
  const zipName = path.basename(zipPath, '.zip');

  console.log(`\n📦 Found zip: ${path.basename(zipPath)}`);
  console.log(`📂 Extracting to: ${EXTRACT_DIR}`);

  // Clean up previous extraction if exists
  if (fs.existsSync(EXTRACT_DIR)) {
    fs.rmSync(EXTRACT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(EXTRACT_DIR, { recursive: true });

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(EXTRACT_DIR, true);

  // Walk the extracted directory to find the resources folder
  const resourcesDir = findDirectory(EXTRACT_DIR, 'resources');
  if (!resourcesDir) {
    throw new Error('Could not find the "resources" folder inside the extracted zip.');
  }

  const scriptDir = path.join(resourcesDir, 'script');
  if (!fs.existsSync(scriptDir)) {
    throw new Error(`Could not find the "script" folder at: ${scriptDir}`);
  }

  // Find .iflw file inside scenarioflows/integrationflow/
  const integrationflowDir = findDirectory(resourcesDir, 'integrationflow');
  if (!integrationflowDir) {
    throw new Error('Could not find "integrationflow" folder inside extracted zip.');
  }

  const iflwFiles = fs.readdirSync(integrationflowDir).filter((f) => f.endsWith('.iflw'));
  if (iflwFiles.length === 0) {
    throw new Error(`No .iflw file found in: ${integrationflowDir}`);
  }

  const iflwPath = path.join(integrationflowDir, iflwFiles[0]);

  return { scriptDir, iflwPath, zipName };
}

/**
 * Recursively searches for a directory by name.
 * @param {string} baseDir
 * @param {string} targetName
 * @returns {string|null}
 */
function findDirectory(baseDir, targetName) {
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const fullPath = path.join(baseDir, entry.name);
      if (entry.name === targetName) return fullPath;
      const found = findDirectory(fullPath, targetName);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Cleans up the temp_extracted directory after processing.
 */
function cleanup() {
  if (fs.existsSync(EXTRACT_DIR)) {
    fs.rmSync(EXTRACT_DIR, { recursive: true, force: true });
  }
}

module.exports = { extractAndResolvePaths, cleanup };
