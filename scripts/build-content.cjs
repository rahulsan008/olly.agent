const { build } = require('esbuild');
const path = require('path');
const fs = require('fs');

async function main() {
  const outdir = path.resolve(__dirname, '../generated');
  if (!fs.existsSync(outdir)) {
    fs.mkdirSync(outdir, { recursive: true });
  }

  await build({
    entryPoints: [path.resolve(__dirname, '../src/content/index.ts')],
    bundle: true,
    format: 'iife',
    target: ['chrome110'],
    platform: 'browser',
    outfile: path.join(outdir, 'content.js'),
    sourcemap: false,
    logLevel: 'info'
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
