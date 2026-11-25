#!/usr/bin/env node
// Build server code for Vercel deployment
// Uses esbuild for fast, lenient compilation

import { build } from 'esbuild';
import { glob } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function buildServer() {
  console.log('🚀 Building server code for Vercel deployment...');

  try {
    // Build 1: Compile all server files to dist/ (for local development)
    const serverFiles = await glob('server/**/*.ts', {
      cwd: rootDir,
      ignore: ['**/*.test.ts', '**/*.spec.ts']
    });

    const sharedFiles = await glob('shared/**/*.ts', {
      cwd: rootDir,
      ignore: ['**/*.test.ts', '**/*.spec.ts']
    });

    const entryPoints = [...serverFiles, ...sharedFiles].map(file =>
      path.resolve(rootDir, file)
    );

    console.log(`📦 Found ${entryPoints.length} TypeScript files to compile`);

    // Build unbundled version to dist/
    await build({
      entryPoints,
      outdir: path.resolve(rootDir, 'dist'),
      bundle: false,
      platform: 'node',
      target: 'es2020',
      format: 'esm',
      sourcemap: true,
      logLevel: 'info',
      keepNames: true,
      outExtension: { '.js': '.js' }
    });

    console.log('✅ Unbundled build complete (dist/)');

    // Build 2: Bundle serverless-app.ts for Vercel (resolves all imports)
    console.log('📦 Building bundled serverless function for Vercel...');

    await build({
      entryPoints: [path.resolve(rootDir, 'server/serverless-app.ts')],
      outfile: path.resolve(rootDir, 'api/_lib/serverless-app.js'),
      bundle: true,
      platform: 'node',
      target: 'es2020',
      format: 'esm',
      sourcemap: true,
      logLevel: 'info',
      keepNames: true,
      external: [
        // External packages that should NOT be bundled
        '@neondatabase/serverless',
        'firebase-admin',
        'openai',
        'jsonwebtoken',
        'fs-extra',
        '@pinecone-database/pinecone',
        '@supabase/supabase-js',
        '@google/genai',
        '@roamhq/wrtc',
        'wrtc',
        'drizzle-orm',
        'express',
        'pg',
        'postgres',
        'ws'
      ],
      minify: false, // Keep readable for debugging
      treeShaking: true
    });

    console.log('✅ Bundled serverless function created (api/_lib/serverless-app.js)');

    // Build the WebSocket upgrade handler separately so Vercel can load it
    // from the dedicated /api/voice/webrtc Function.
    await build({
      entryPoints: [path.resolve(rootDir, 'server/services/voice-webrtc.service.ts')],
      outfile: path.resolve(rootDir, 'api/_lib/voice-webrtc.js'),
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'esm',
      sourcemap: true,
      logLevel: 'info',
      keepNames: true,
      external: ['ws', '@google/genai', '@roamhq/wrtc', 'wrtc'],
    });

    console.log('✅ Bundled WebSocket handler created (api/_lib/voice-webrtc.js)');
    console.log('📁 Output directories: dist/ and api/');
  } catch (error) {
    console.error('❌ Server build failed:', error);
    process.exit(1);
  }
}

buildServer();
