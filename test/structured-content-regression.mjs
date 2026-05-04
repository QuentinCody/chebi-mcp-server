#!/usr/bin/env node
// interlinked-tdd: exempt

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assertContains(filePath, haystack, needle, testName) {
  totalTests++;
  if (haystack.includes(needle)) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    passedTests++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    console.log(`  Missing: ${needle}`);
    console.log(`  File: ${filePath}`);
    failedTests++;
  }
}

function readFile(relPath) {
  const absPath = path.resolve(SERVER_ROOT, relPath);
  return fs.readFileSync(absPath, 'utf8');
}

console.log(`${BLUE}🧪 ChEBI Structured Content Regression Tests${RESET}`);

const toolExpectations = [
  {
    path: 'src/tools/code-mode.ts',
    required: ['createSearchTool', 'createExecuteTool', 'chebi', 'chebiCatalog'],
  },
  {
    path: 'src/tools/query-data.ts',
    required: ['createQueryDataHandler', 'chebi_query_data'],
  },
  {
    path: 'src/tools/get-schema.ts',
    required: ['createGetSchemaHandler', 'chebi_get_schema'],
  },
];

for (const { path: filePath, required } of toolExpectations) {
  const content = readFile(filePath);
  for (const token of required) {
    assertContains(filePath, content, token, `${filePath} includes ${token}`);
  }
}

const indexContent = readFile('src/index.ts');
assertContains('src/index.ts', indexContent, 'ChebiDataDO', 'index.ts exports ChebiDataDO');
assertContains('src/index.ts', indexContent, 'McpAgent', 'index.ts uses McpAgent');
assertContains('src/index.ts', indexContent, 'registerCodeMode', 'index.ts wires registerCodeMode');
assertContains('src/index.ts', indexContent, 'registerQueryData', 'index.ts wires registerQueryData');
assertContains('src/index.ts', indexContent, 'registerGetSchema', 'index.ts wires registerGetSchema');

const catalogContent = readFile('src/spec/catalog.ts');
for (const category of ['search', 'ontology', 'terms', 'hierarchy']) {
  assertContains(
    'src/spec/catalog.ts',
    catalogContent,
    `category: "${category}"`,
    `catalog covers category "${category}"`,
  );
}
assertContains('src/spec/catalog.ts', catalogContent, 'ols4', 'catalog references OLS4 backing');
assertContains('src/spec/catalog.ts', catalogContent, 'database_cross_reference', 'catalog mentions cross-reference annotation field');

const adapterContent = readFile('src/lib/api-adapter.ts');
assertContains('src/lib/api-adapter.ts', adapterContent, 'withChebiScope', 'api-adapter pins ontology scope');
assertContains('src/lib/api-adapter.ts', adapterContent, 'CHEBI_ONTOLOGY', 'api-adapter declares chebi ontology constant');

const httpContent = readFile('src/lib/http.ts');
assertContains('src/lib/http.ts', httpContent, 'ols4', 'http.ts targets OLS4');

const wranglerContent = readFile('wrangler.jsonc');
assertContains('wrangler.jsonc', wranglerContent, 'CHEBI_DATA_DO', 'wrangler.jsonc binds CHEBI_DATA_DO');
assertContains('wrangler.jsonc', wranglerContent, 'ChebiDataDO', 'wrangler.jsonc migrates ChebiDataDO class');
assertContains('wrangler.jsonc', wranglerContent, '"port": 8899', 'wrangler.jsonc dev port is 8899');
assertContains('wrangler.jsonc', wranglerContent, 'CODE_MODE_LOADER', 'wrangler.jsonc binds CODE_MODE_LOADER');

console.log(`\n${BLUE}📊 Test Results Summary${RESET}`);
console.log(`Total tests: ${totalTests}`);
console.log(`${GREEN}Passed: ${passedTests}${RESET}`);
console.log(`${RED}Failed: ${failedTests}${RESET}`);

if (failedTests > 0) {
  console.log(`\n${RED}❌ Regression tests failed.${RESET}`);
  process.exit(1);
}

console.log(`\n${GREEN}✅ ChEBI structured content regression tests passed.${RESET}`);
