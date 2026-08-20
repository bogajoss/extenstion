import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT_DIR = process.cwd();
const DIST_DIR = join(ROOT_DIR, 'dist');
const SRC_DIR = join(ROOT_DIR, 'src');

async function build() {
  console.log('🧹 Cleaning dist directory...');
  if (existsSync(DIST_DIR)) {
    await rm(DIST_DIR, { recursive: true, force: true });
  }
  await mkdir(DIST_DIR, { recursive: true });

  console.log('⚡ Bundling TypeScript files...');
  const tsResult = await Bun.build({
    entrypoints: [
      join(SRC_DIR, 'background.ts'),
      join(SRC_DIR, 'content.ts'),
      join(SRC_DIR, 'popup.ts')
    ],
    outdir: DIST_DIR,
    target: 'browser',
    minify: false
  });

  if (!tsResult.success) {
    console.error('❌ TypeScript build failed:');
    for (const message of tsResult.logs) {
      console.error(message);
    }
    process.exit(1);
  }

  console.log('🎨 Compiling Tailwind CSS...');
  const tailwindProc = Bun.spawn([
    'bunx',
    '@tailwindcss/cli',
    '-i',
    join(ROOT_DIR, 'input.css'),
    '-o',
    join(DIST_DIR, 'styles.css'),
    '--minify'
  ]);
  const tailwindExit = await tailwindProc.exited;
  if (tailwindExit !== 0) {
    console.error('❌ Tailwind build failed');
    process.exit(tailwindExit);
  }

  console.log('📋 Copying static assets (manifest.json, popup.html)...');
  await cp(join(ROOT_DIR, 'manifest.json'), join(DIST_DIR, 'manifest.json'));
  await cp(join(ROOT_DIR, 'popup.html'), join(DIST_DIR, 'popup.html'));

  console.log('✨ Build complete in dist/ directory!');
}

build().catch(err => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
