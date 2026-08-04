import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';
import noSecrets from 'eslint-plugin-no-secrets';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const noRestrictedSyntax = [
  {
    message:
      'La API D1 no ofrece método de transacción con callback (AGENTS §2): usar db.batch([...]).',
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.object.type='Identifier'][callee.object.name='db'][callee.property.name='transaction']",
  },
  {
    message: 'UPSERT INTO prohibido (AGENTS §2): usar ON CONFLICT explícito dentro de db.batch().',
    selector: "CallExpression[callee.name='raw'][arguments.0.type='TemplateLiteral'][arguments.0.quasis.0.value.raw=/[\\s\\S]*UPSERT\\s+INTO/i]",
  },
  {
    message: 'toFixed() prohibido para montos (DAT-09): redondear con Math.round en el servidor.',
    selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='toFixed']",
  },
  {
    message: 'parseFloat() prohibido para montos (DAT-09): dinero siempre como INTEGER cents.',
    selector: "CallExpression[callee.name='parseFloat']",
  },
  {
    message: 'fork por vertical prohibido (ADR-ARCH-002): las capabilities se habilitan por flags.',
    selector: "SwitchStatement[discriminant.type='Identifier'][discriminant.name='vertical']",
  },
];

const domainOverrides = {
  files: ['packages/domain-*/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          'cloudflare:*',
          '@cloudflare/*',
          'hono*',
          'miniflare*',
          'svelte*',
          'wrangler',
        ],
        paths: [
          'd1', 'r2', 'kv', 'queues',
        ],
      },
    ],
    complexity: ['error', { max: 12 }],
  },
};

const adapterOverrides = {
  files: ['packages/adapters-*/**/*.ts'],
  rules: {
    complexity: ['error', { max: 18 }],
  },
};

const testOverrides = {
  files: ['**/*.test.ts', '**/*.spec.ts', '**/*.test.tsx', '**/*.spec.tsx'],
  rules: {
    'security/detect-non-literal-fs-filename': 'off',
    'no-secrets/no-secrets': ['error', { tolerance: 3.9 }],
  },
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.svelte-kit/**',
      '**/.wrangler/**',
      '**/coverage/**',
      // Tipado cloudflare:workers / cloudflare:test solo resuelve bajo pool-workers
      '**/*.integration.test.ts',
      '**/test/apply-migrations.ts',
      '**/test/env.d.ts',
      'apps/worker-api/src/auth/tenant-state.ts',
      'apps/worker-api/src/worker.ts',
    ],
  },
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      security.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.es2022,
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'no-secrets': noSecrets,
    },
    rules: {
      'no-secrets/no-secrets': ['error', { tolerance: 3.9 }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-restricted-syntax': ['error', ...noRestrictedSyntax],      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      'security/detect-object-injection': 'off',
      'security/detect-unsafe-regex': 'error',
      complexity: ['warn', { max: 15 }],
    },
  },
  domainOverrides,
  adapterOverrides,
  testOverrides,
  prettier,
);
