/**
 * Component SDK service stub — Wave 8 §S8.10.
 *
 * Wraps the tenant's SDK install surface:
 *   - listSDKPackages         — npm/pnpm/yarn/maven/pip/go/cargo metadata
 *   - listComponentTemplates  — TypeScript+React / JS+React / Python starters
 *   - downloadComponentTemplate — placeholder zip Blob (text "Hello from …")
 *   - publishComponentToOrg   — publishes a custom component to org library
 *
 * Real endpoints (TBD):
 *   GET    /v1/admin/component-sdk/packages
 *   GET    /v1/admin/component-sdk/templates
 *   GET    /v1/admin/component-sdk/templates/:id/download
 *   POST   /v1/admin/component-sdk/publish
 *
 * Until they land we fall back to deterministic local seed data, mirroring
 * the pattern used by custom-domain-service / scim-service.
 */

import type {
  SDKPackageInfo,
  ComponentTemplate,
} from './types';

const SEED_PACKAGES: readonly SDKPackageInfo[] = [
  {
    id: 'sdk-npm',
    package: 'npm',
    package_name: '@domio/component-sdk',
    install_command: 'npm install @domio/component-sdk',
    version: '1.4.2',
    status: 'stable',
    docs_url: 'https://docs.domio.app/sdk/npm',
  },
  {
    id: 'sdk-pnpm',
    package: 'pnpm',
    package_name: '@domio/component-sdk',
    install_command: 'pnpm add @domio/component-sdk',
    version: '1.4.2',
    status: 'stable',
    docs_url: 'https://docs.domio.app/sdk/pnpm',
  },
  {
    id: 'sdk-yarn',
    package: 'yarn',
    package_name: '@domio/component-sdk',
    install_command: 'yarn add @domio/component-sdk',
    version: '1.4.2',
    status: 'stable',
    docs_url: 'https://docs.domio.app/sdk/yarn',
  },
  {
    id: 'sdk-maven',
    package: 'maven',
    package_name: 'app.domio:component-sdk',
    install_command:
      '<dependency>\n  <groupId>app.domio</groupId>\n  <artifactId>component-sdk</artifactId>\n  <version>1.4.2</version>\n</dependency>',
    version: '1.4.2',
    status: 'beta',
    docs_url: 'https://docs.domio.app/sdk/maven',
  },
  {
    id: 'sdk-pip',
    package: 'pip',
    package_name: 'domio-component-sdk',
    install_command: 'pip install domio-component-sdk',
    version: '0.9.7',
    status: 'beta',
    docs_url: 'https://docs.domio.app/sdk/python',
  },
  {
    id: 'sdk-go',
    package: 'go',
    package_name: 'github.com/domio/component-sdk-go',
    install_command: 'go get github.com/domio/component-sdk-go@v0.3.1',
    version: '0.3.1',
    status: 'stable',
    docs_url: 'https://docs.domio.app/sdk/go',
  },
];

const SEED_TEMPLATES: readonly ComponentTemplate[] = [
  {
    id: 'tpl-ts-react-starter',
    name: 'TypeScript + React Starter',
    description:
      'Minimal Vite + React 19 + TypeScript project scaffolded for the Domio editor. Includes a HelloWorld component, hot reload, and a sample plugin manifest.',
    language: 'typescript',
    framework: 'react',
    zip_url: '/sdk/templates/tpl-ts-react-starter.zip',
    preview_url: '/sdk/templates/preview/tpl-ts-react-starter.png',
  },
  {
    id: 'tpl-js-react-starter',
    name: 'JavaScript + React Starter',
    description:
      'JavaScript (no TS) + React 19 starter. Same plugin manifest as the TS template but with plain .jsx files for teams that prefer minimum tooling.',
    language: 'javascript',
    framework: 'react',
    zip_url: '/sdk/templates/tpl-js-react-starter.zip',
    preview_url: '/sdk/templates/preview/tpl-js-react-starter.png',
  },
  {
    id: 'tpl-python-starter',
    name: 'Python Starter',
    description:
      'Server-side Python component. Exposes a FastAPI handler that the Domio editor can invoke for data-bound blocks and live computations.',
    language: 'python',
    framework: 'no-framework',
    zip_url: '/sdk/templates/tpl-python-starter.zip',
    preview_url: '/sdk/templates/preview/tpl-python-starter.png',
  },
];

export async function listSDKPackages(): Promise<ReadonlyArray<SDKPackageInfo>> {
  return SEED_PACKAGES.slice();
}

export async function listComponentTemplates(): Promise<ReadonlyArray<ComponentTemplate>> {
  return SEED_TEMPLATES.slice();
}

export async function downloadComponentTemplate(id: string): Promise<Blob> {
  const tpl = SEED_TEMPLATES.find((t) => t.id === id);
  if (!tpl) {
    throw new Error(`Template ${id} not found`);
  }
  // Placeholder zip — we return a Blob with plain text content. In the
  // real backend this will be the streamed zip archive.
  const content = `Hello from ${tpl.name}\n`;
  return new Blob([content], { type: 'application/zip' });
}

export interface PublishComponentInput {
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly tags: ReadonlyArray<string>;
}

export interface PublishComponentResult {
  readonly id: string;
  readonly status: 'published';
}

export async function publishComponentToOrg(
  input: PublishComponentInput,
): Promise<PublishComponentResult> {
  if (!input.name.trim()) {
    throw new Error('Component name is required');
  }
  if (!input.version.trim()) {
    throw new Error('Version is required');
  }
  const id = `cmp-${Math.random().toString(36).slice(2, 10)}`;
  return { id, status: 'published' };
}

export const SDK_STATUS_TONES: Readonly<Record<SDKPackageInfo['status'], 'green' | 'amber' | 'grey'>> = {
  stable: 'green',
  beta: 'amber',
  deprecated: 'grey',
};