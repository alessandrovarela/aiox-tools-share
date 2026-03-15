#!/usr/bin/env node
'use strict';

/**
 * Script de Migracao AIOS → AIOX
 * Migra um projeto de .aios-core para .aiox-core
 *
 * Uso:
 *   cd /seu/projeto
 *   node /caminho/para/migrate-aios-to-aiox.js [--dry-run]
 *
 * Opcoes:
 *   --dry-run    Apenas mostra o que seria feito, sem alterar nada
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { execSync } = require('child_process');

// ── Configuracao ────────────────────────────────────────────────────

const PROJECT_DIR = process.cwd();
const OLD_DIR = '.aios-core';
const NEW_DIR = '.aiox-core';
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const BACKUP_DIR = `.aios-backup-${TIMESTAMP}`;
const DRY_RUN = process.argv.includes('--dry-run');

const EXTENSIONS = [
  '.js', '.ts', '.jsx', '.tsx', '.md', '.json',
  '.yaml', '.yml', '.cjs', '.mjs', '.sh', '.py',
];

const EXCLUDE_DIRS = ['node_modules', '.git', BACKUP_DIR, NEW_DIR];

// ── Cores ───────────────────────────────────────────────────────────

const c = {
  red: (s) => `\x1b[0;31m${s}\x1b[0m`,
  green: (s) => `\x1b[0;32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[0;33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[0;36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  boldGreen: (s) => `\x1b[1;32m${s}\x1b[0m`,
  boldCyan: (s) => `\x1b[1;36m${s}\x1b[0m`,
  boldYellow: (s) => `\x1b[1;33m${s}\x1b[0m`,
};

const log = (msg) => console.log(`${c.green('[MIGRAR]')} ${msg}`);
const warn = (msg) => console.log(`${c.yellow('[AVISO]')} ${msg}`);
const err = (msg) => console.log(`${c.red('[ERRO]')} ${msg}`);
const info = (msg) => console.log(`${c.cyan('[INFO]')} ${msg}`);

// ── Funcoes utilitarias ─────────────────────────────────────────────

function walkDir(dir, callback) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.includes(entry.name)) continue;
      walkDir(fullPath, callback);
    } else if (entry.isFile()) {
      callback(fullPath);
    }
  }
}

function walkDirFiltered(dir, callback) {
  walkDir(dir, (filePath) => {
    const ext = path.extname(filePath);
    if (EXTENSIONS.includes(ext)) {
      callback(filePath);
    }
  });
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function sha256(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ── Deteccao de arquivos modificados ────────────────────────────────

/**
 * Estrategia 1: Usa install-manifest.yaml (funciona sem git)
 * Suporta dois formatos de manifest:
 *   - Com hash:  path: "caminho"  hash: "sha256:xxx"
 *   - Sem hash (lista simples):  files:\n  - caminho/arquivo.js
 * Quando nao ha hash, so consegue detectar arquivos novos (nao modificados)
 */
function getManifestModifiedFiles() {
  const manifestPath = path.join(PROJECT_DIR, OLD_DIR, 'install-manifest.yaml');
  if (!fs.existsSync(manifestPath)) return null; // manifest nao existe, fallback para git

  const modified = [];
  const newFiles = [];

  try {
    const content = fs.readFileSync(manifestPath, 'utf8');
    const lines = content.split('\n');

    // Detectar formato: se tem linhas "  - caminho" eh lista simples
    const isSimpleList = lines.some((l) => /^\s+-\s+\S/.test(l));

    const manifestPaths = new Set();

    if (isSimpleList) {
      // Formato lista simples nao tem caminhos completos nem hashes,
      // entao nao eh confiavel para detectar modificacoes/novos.
      // Cair no fallback do git.
      return null;
    } else {
      // Formato com hash: path: "caminho"  hash: "sha256:xxx"
      const fileEntries = [];
      let currentEntry = {};

      for (const line of lines) {
        const pathMatch = line.match(/^\s+path:\s*"?([^"]+)"?\s*$/);
        const hashMatch = line.match(/^\s+hash:\s*"?(sha256:[a-f0-9]+)"?\s*$/);

        if (pathMatch) {
          currentEntry.path = pathMatch[1];
        }
        if (hashMatch) {
          currentEntry.hash = hashMatch[1];
        }

        if (currentEntry.path && currentEntry.hash) {
          fileEntries.push({ ...currentEntry });
          currentEntry = {};
        }
      }

      for (const entry of fileEntries) {
        const fullPath = path.join(PROJECT_DIR, entry.path);
        manifestPaths.add(entry.path);

        if (!fs.existsSync(fullPath)) continue;

        const currentHash = sha256(fullPath);
        if (currentHash && currentHash !== entry.hash) {
          modified.push(entry.path);
        }
      }
    }

    // Arquivos novos (existem no disco mas nao no manifest)
    walkDir(path.join(PROJECT_DIR, OLD_DIR), (filePath) => {
      const relativePath = path.relative(PROJECT_DIR, filePath);
      if (!manifestPaths.has(relativePath) && !relativePath.includes('install-manifest')) {
        newFiles.push(relativePath);
      }
    });

    return { modified, newFiles };
  } catch {
    return null; // parse falhou, fallback para git
  }
}

/**
 * Estrategia 2: Usa git (fallback)
 */
function getGitModifiedFiles() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
  } catch {
    return { modified: [], newFiles: [] };
  }

  const modified = [];
  const newFiles = [];

  try {
    const diff = execSync(`git diff --name-only -- ${OLD_DIR}/`, { encoding: 'utf8' });
    diff.split('\n').filter(Boolean).forEach((f) => modified.push(f));
  } catch { /* ignore */ }

  try {
    const untracked = execSync(`git ls-files --others --exclude-standard -- ${OLD_DIR}/`, { encoding: 'utf8' });
    untracked.split('\n').filter(Boolean).forEach((f) => newFiles.push(f));
  } catch { /* ignore */ }

  return { modified, newFiles };
}

/**
 * Detecta arquivos modificados usando manifest (preferencial) ou git (fallback)
 */
function detectModifiedFiles() {
  // Tentar manifest primeiro (funciona sem git)
  const manifestResult = getManifestModifiedFiles();
  if (manifestResult) {
    return { ...manifestResult, source: 'manifest (install-manifest.yaml)' };
  }

  // Fallback para git
  const gitResult = getGitModifiedFiles();
  return { ...gitResult, source: 'git' };
}

// ── Funcoes de migracao ─────────────────────────────────────────────

function findAiosFiles() {
  const files = [];
  walkDirFiltered(PROJECT_DIR, (filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('aios-core') || content.includes('.aios-core') || content.includes('aios_core') || content.includes('AIOS')) {
        files.push(filePath);
      }
    } catch { /* skip unreadable */ }
  });
  return files;
}

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  content = content.replace(/\.aios-core/g, '.aiox-core');
  content = content.replace(/aios-core/g, 'aiox-core');
  content = content.replace(/aios_core/g, 'aiox_core');
  content = content.replace(/AIOS-FullStack/g, 'AIOX-FullStack');
  content = content.replace(/AIOS-Fullstack/g, 'AIOX-Fullstack');
  content = content.replace(/AIOS Core/g, 'AIOX Core');
  content = content.replace(/AIOS Squad/g, 'AIOX Squad');
  content = content.replace(/Synkra AIOS/g, 'Synkra AIOX');
  content = content.replace(/aios-fullstack/g, 'aiox-fullstack');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  return false;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const oldPath = path.join(PROJECT_DIR, OLD_DIR);
  const newPath = path.join(PROJECT_DIR, NEW_DIR);

  // Verificacoes iniciais
  if (!fs.existsSync(oldPath)) {
    err(`Pasta ${OLD_DIR} nao encontrada em ${PROJECT_DIR}`);
    err('Este script migra AIOS → AIOX. Voce esta no projeto correto?');
    process.exit(1);
  }

  if (fs.existsSync(newPath)) {
    err(`${NEW_DIR} ja existe. A migracao pode ja ter sido feita.`);
    err(`Remova ${NEW_DIR} primeiro se quiser executar novamente.`);
    process.exit(1);
  }

  // Detectar arquivos modificados
  log('Verificando arquivos modificados pelo usuario...');
  const { modified, newFiles, source } = detectModifiedFiles();
  info(`Metodo de deteccao: ${source}`);

  const hasChanges = modified.length > 0 || newFiles.length > 0;
  let discardUserChanges = false;

  if (hasChanges) {
    console.log('');
    console.log(c.red('═══════════════════════════════════════════════════════'));
    console.log(c.red('  ATENCAO: Arquivos do core modificados por voce!'));
    console.log(c.red('═══════════════════════════════════════════════════════'));
    console.log('');

    if (modified.length > 0) {
      warn('Arquivos MODIFICADOS (conteudo diferente do original):');
      console.log('');
      for (const f of modified) {
        console.log(`  ${c.yellow('⚠ [modificado] ' + f)}`);
      }
      console.log('');
    }

    if (newFiles.length > 0) {
      warn('Arquivos NOVOS (criados por voce, nao existiam na instalacao):');
      console.log('');
      for (const f of newFiles) {
        console.log(`  ${c.cyan('+ [novo] ' + f)}`);
      }
      console.log('');
    }

    info(`Este script vai criar um backup automatico da pasta ${OLD_DIR}/ em:`);
    info(`  ${BACKUP_DIR}/`);
    console.log('');
    info('Suas alteracoes ficam salvas no backup. Porem, ao rodar');
    info(`'npx aiox-core@latest install' depois da migracao, o framework`);
    info(`vai sobrescrever os arquivos da pasta ${NEW_DIR}/ com a versao`);
    info('mais recente. Se voce fez alteracoes no core, precisara');
    info('reaplicar manualmente a partir do backup.');
    console.log('');

    if (!DRY_RUN) {
      console.log('  Opcoes:');
      console.log(`  ${c.green('[1]')} Migrar TUDO (incluindo suas alteracoes e arquivos novos)`);
      console.log(`  ${c.red('[2]')} Migrar apenas o framework ${c.red('(PERDA DE DADOS: suas alteracoes e arquivos')}`);
      console.log(`       ${c.red('novos serao REMOVIDOS da pasta migrada. Ficam apenas no backup)')}`);
      console.log(`  ${c.red('[3]')} Cancelar`);
      console.log('');
      const choice = await ask(c.cyan('Escolha uma opcao (1/2/3): '));

      if (choice === '3') {
        info('Migracao cancelada.');
        process.exit(0);
      }

      if (choice === '2') {
        const confirm = await ask(c.red('Tem certeza? Seus arquivos modificados/novos serao removidos de ' + NEW_DIR + '/ (s/N): '));
        if (confirm !== 's' && confirm !== 'sim') {
          info('Migracao cancelada.');
          process.exit(0);
        }
        discardUserChanges = true;
        info('Migrando apenas o framework. Suas alteracoes ficam somente no backup.');
      }

      if (choice === '1') {
        info('Migrando tudo, incluindo suas alteracoes.');
      }

      if (choice !== '1' && choice !== '2' && choice !== '3') {
        info('Opcao invalida. Migracao cancelada.');
        process.exit(0);
      }
      console.log('');
    }
  } else {
    info('Nenhum arquivo modificado detectado. Migracao segura.');
    console.log('');
  }

  // Resumo
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Migracao AIOS → AIOX');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  info(`Projeto:    ${PROJECT_DIR}`);
  info(`De:         ${OLD_DIR} → ${NEW_DIR}`);
  info(`Simulacao:  ${DRY_RUN}`);
  console.log('');

  // Buscar arquivos com referencias
  log('Buscando arquivos com referencias ao AIOS...');
  const aiosFiles = findAiosFiles();
  info(`Encontrados ${aiosFiles.length} arquivos com referencias ao AIOS`);

  if (DRY_RUN) {
    console.log('');
    log('── SIMULACAO: Alteracoes que seriam feitas ──');
    console.log('');
    info(`1. Backup ${OLD_DIR} → ${BACKUP_DIR}`);
    info(`2. Renomear ${OLD_DIR} → ${NEW_DIR}`);
    info(`3. Atualizar referencias em ${aiosFiles.length} arquivos:`);
    for (const f of aiosFiles) {
      console.log(`     - ${path.relative(PROJECT_DIR, f)}`);
    }
    console.log('');
    info('4. Substituicoes:');
    console.log('     .aios-core  → .aiox-core');
    console.log('     aios-core   → aiox-core');
    console.log('     aios_core   → aiox_core');
    console.log('     AIOS        → AIOX  (em contexto: AIOS-FullStack, AIOS Core, etc.)');
    console.log('');
    if (hasChanges) {
      info('5. Arquivos com alteracoes do usuario:');
      for (const f of modified) {
        console.log(`     ${c.yellow('[modificado] ' + f)}`);
      }
      for (const f of newFiles) {
        console.log(`     ${c.cyan('[novo] ' + f)}`);
      }
      console.log('');
    }
    info(`${hasChanges ? '6' : '5'}. Proximo passo: npx aiox-core@latest install`);
    console.log('');
    warn('Execute sem --dry-run para aplicar as alteracoes.');
    process.exit(0);
  }

  // Passo 1: Backup (SEMPRE, independente da opcao escolhida)
  log(`Criando backup em ${BACKUP_DIR}...`);
  copyDirSync(oldPath, path.join(PROJECT_DIR, BACKUP_DIR));
  info(`Backup criado: ${BACKUP_DIR}`);

  // Passo 2: Renomear pasta
  log(`Renomeando ${OLD_DIR} → ${NEW_DIR}...`);
  fs.renameSync(oldPath, newPath);
  info('Pasta renomeada');

  // Passo 3: Descartar alteracoes do usuario (se opcao 2)
  if (discardUserChanges) {
    log('Removendo alteracoes do usuario da pasta migrada...');

    for (const f of modified) {
      const migratedPath = path.join(PROJECT_DIR, f.replace(OLD_DIR, NEW_DIR));
      try {
        fs.unlinkSync(migratedPath);
        console.log(`  ✗ ${c.yellow('removido: ' + path.relative(PROJECT_DIR, migratedPath))}`);
      } catch { /* arquivo ja nao existe */ }
    }

    for (const f of newFiles) {
      const migratedPath = path.join(PROJECT_DIR, f.replace(OLD_DIR, NEW_DIR));
      try {
        fs.unlinkSync(migratedPath);
        console.log(`  ✗ ${c.yellow('removido: ' + path.relative(PROJECT_DIR, migratedPath))}`);
      } catch { /* arquivo ja nao existe */ }
    }

    info('Alteracoes do usuario removidas. Use "npx aiox-core@latest install" para reinstalar os arquivos originais.');
  }

  // Passo 5: Atualizar conteudo dos arquivos
  log('Atualizando referencias nos arquivos...');
  let updatedCount = 0;

  const allFiles = [];
  walkDirFiltered(PROJECT_DIR, (filePath) => allFiles.push(filePath));

  for (const filePath of allFiles) {
    try {
      if (replaceInFile(filePath)) {
        updatedCount++;
        console.log(`  ✓ ${path.relative(PROJECT_DIR, filePath)}`);
      }
    } catch { /* skip */ }
  }

  // Passo 6: Atualizar .gitignore
  const gitignorePath = path.join(PROJECT_DIR, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    log('Atualizando .gitignore...');
    replaceInFile(gitignorePath);
    info('.gitignore atualizado');
  }

  // Passo 7: Atualizar package.json
  const pkgPath = path.join(PROJECT_DIR, 'package.json');
  if (fs.existsSync(pkgPath)) {
    log('Atualizando package.json...');
    replaceInFile(pkgPath);
    info('package.json atualizado');
  }

  // Passo 8: Verificacao
  log('Verificando migracao...');
  const remaining = [];
  walkDirFiltered(PROJECT_DIR, (filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('.aios-core')) {
        remaining.push(filePath);
      }
    } catch { /* skip */ }
  });

  console.log('');
  console.log(c.boldGreen('═══════════════════════════════════════════════════════'));
  console.log(c.boldGreen('  ✓ Migracao realizada com sucesso!'));
  console.log(c.boldGreen('═══════════════════════════════════════════════════════'));
  console.log('');

  if (remaining.length > 0) {
    warn(`${remaining.length} arquivos ainda contem referencias a .aios-core:`);
    for (const f of remaining) {
      console.log(`  ${c.yellow('⚠ ' + path.relative(PROJECT_DIR, f))}`);
    }
    console.log('');
    warn('Revise esses arquivos manualmente.');
    console.log('');
  }

  console.log(c.boldCyan('  Resumo:'));
  console.log(`  ${c.cyan('Arquivos atualizados:')} ${updatedCount}`);
  console.log(`  ${c.cyan('Pasta renomeada:')}      ${OLD_DIR} → ${c.boldGreen(NEW_DIR)}`);
  console.log('');

  console.log(c.boldYellow('  Backup:'));
  console.log(`  ${c.yellow('Seus arquivos originais foram salvos em:')}`);
  console.log(`  ${c.bold(path.join(PROJECT_DIR, BACKUP_DIR) + '/')}`);

  if (hasChanges) {
    console.log('');
    console.log(`  ${c.yellow('Seus arquivos modificados/novos tambem estao no backup.')}`);
    console.log(`  ${c.yellow('Para reaplicar suas alteracoes, compare:')}`);
    console.log(`    ${c.bold(BACKUP_DIR + '/')}  (original com suas alteracoes)`);
    console.log(`    ${c.bold(NEW_DIR + '/')}     (migrado para AIOX)`);
  }

  console.log('');
  console.log(`  ${c.yellow('Quando estiver satisfeito com a migracao, apague o backup:')}`);
  if (process.platform === 'win32') {
    console.log(`  ${c.bold('rmdir /s /q ' + BACKUP_DIR)}`);
  } else {
    console.log(`  ${c.bold('rm -rf ' + BACKUP_DIR)}`);
  }

  console.log('');
  console.log(c.boldCyan('  Proximo passo:'));
  console.log(`  ${c.bold('npx aiox-core@latest install')}`);
  console.log(`  ${c.cyan('(sincroniza com a versao mais recente do AIOX)')}`);
  console.log('');
}

main().catch((error) => {
  err(`Erro inesperado: ${error.message}`);
  process.exit(1);
});
