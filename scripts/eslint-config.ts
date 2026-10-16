import type { Linter } from 'eslint';

import { defineEslintConfigs } from '@mnaoumov/obsidian-dev-toolkit/linters/eslint-config';
import { defineConfig } from 'eslint/config';

export const configs: Linter.Config[] = defineEslintConfigs({
  customConfigs() {
    return defineConfig({
      rules: {
        'obsidianmd/ui/sentence-case': [
          'error',
          {
            brands: [
              'React',
              'Svelte'
            ]
          }
        ]
      }
    });
  },
  editContext(context) {
    // The published contract sits at the repo root beside `api.d.ts`, so a consumer can copy it; lint it as source.
    context.sourceFiles.push('api-contract.ts');
  }
});
