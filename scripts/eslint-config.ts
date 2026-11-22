import type { Linter } from 'eslint';

import { defineEslintConfigs } from '@mnaoumov/obsidian-dev-toolkit/linters/eslint-config';
import { defineConfig } from 'eslint/config';

export const configs: Linter.Config[] = defineEslintConfigs({
  customConfigs(context) {
    return defineConfig(
      {
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
      },
      {
        /**
         * The toolkit registers the `typescript-dev-toolkit` plugin for the context's TypeScript files alone, so a rule
         * of that plugin turned on without `files` reaches `package.json` and the other non-TypeScript files too,
         * and ESLint aborts the whole run on the missing plugin.
         */
        files: context.allFiles(),
        rules: {
          'typescript-dev-toolkit/no-undefined-return-type': 'error'
        }
      },
      {
        files: ['src/**/*.integration.test.ts'],
        rules: {
          /**
           * An integration suite's `evalInObsidian` and `pollInObsidian` closures run inside the Obsidian renderer,
           * where `window` always exists.
           * The rule reads the file's Node test environment, which does not declare it,
           * so it reports every `window.x?.` in those closures although none of them can throw.
           */
          'unicorn/no-optional-chaining-on-undeclared-variable': 'off'
        }
      }
    );
  },
  editContext(context) {
    // The published contract sits at the repo root beside `api.d.ts`, so a consumer can copy it; lint it as source.
    context.sourceFiles.push('api-contract.ts');
  }
});
