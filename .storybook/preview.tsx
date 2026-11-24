import type { Preview } from '@storybook/react-vite';
import '../src/renderer/styles/globals.css';

const preview: Preview = {
  parameters: {
    controls: { expanded: true },
    actions: { argTypesRegex: '^on[A-Z].*' },
    backgrounds: { disable: true },
    layout: 'padded',
  },
  globalTypes: {
    theme: {
      description: 'DevLedger theme',
      defaultValue: 'light',
      toolbar: {
        title: 'Theme',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme === 'dark' ? 'dark' : 'light';
      return (
        <div className={theme} style={{ minHeight: 180, padding: 24, background: 'var(--background)', color: 'var(--foreground)' }}>
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
