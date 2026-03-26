import { defineConfig } from 'vitest/config';
import { readFileSync } from 'fs';

export default defineConfig({
  plugins: [
    {
      name: 'yaml-text-import',
      transform(_, id) {
        if (id.endsWith('.example.yaml')) {
          const content = readFileSync(id, 'utf-8');
          return { code: `export default ${JSON.stringify(content)};`, map: null };
        }
      },
    },
  ],
});
