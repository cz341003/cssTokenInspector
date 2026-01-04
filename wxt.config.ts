import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Element Style Inspector',
    permissions: ['activeTab', 'storage'],
    commands: {
      'toggle-inspector': {
        suggested_key: {
          default: 'Ctrl+Shift+X',
          mac: 'Command+Shift+X',
        },
        description: 'Toggle Element Style Inspector',
      },
    },
  },
});
