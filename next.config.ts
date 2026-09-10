import type { NextConfig } from 'next';

const config: NextConfig = {
  // exceljs is CommonJS with optional native-ish deps; keep it out of the bundle.
  serverExternalPackages: ['exceljs'],
};

export default config;
