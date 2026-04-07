import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

/**
 * Chakra UI v3 theme system for AgentMeme V2.
 * Brand color: #00C389 (green, matching the v1 success/primary color).
 */
const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        brand: {
          50:  { value: '#e6fff7' },
          100: { value: '#b3ffe8' },
          200: { value: '#80ffd9' },
          300: { value: '#4dffca' },
          400: { value: '#1affbb' },
          500: { value: '#00C389' },  // primary brand
          600: { value: '#009e6f' },
          700: { value: '#007a55' },
          800: { value: '#00573c' },
          900: { value: '#003322' },
        },
      },
      fonts: {
        body:    { value: 'Inter, system-ui, sans-serif' },
        heading: { value: 'Inter, system-ui, sans-serif' },
        mono:    { value: 'JetBrains Mono, Menlo, monospace' },
      },
    },
    semanticTokens: {
      colors: {
        'brand.solid': {
          value: { base: '{colors.brand.500}', _dark: '{colors.brand.400}' },
        },
        'brand.muted': {
          value: { base: '{colors.brand.100}', _dark: '{colors.brand.900}' },
        },
        'brand.subtle': {
          value: { base: '{colors.brand.50}', _dark: '{colors.brand.950}' },
        },
        'brand.emphasized': {
          value: { base: '{colors.brand.300}', _dark: '{colors.brand.200}' },
        },
        'brand.fg': {
          value: { base: '{colors.brand.700}', _dark: '{colors.brand.200}' },
        },
        'brand.focusRing': {
          value: { base: '{colors.brand.600}', _dark: '{colors.brand.500}' },
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
