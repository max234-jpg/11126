// Compile src/ en un seul fichier jeu/js/game.js (chargeable depuis file://).
import * as esbuild from 'esbuild';
const watch = process.argv.includes('--watch');
const opts = {
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: ['safari15', 'chrome100'],
  outfile: 'Battle Royale.app/Contents/Resources/jeu/js/game.js',
  minify: !process.argv.includes('--dev'),
  sourcemap: false,
  legalComments: 'eof',
  logLevel: 'info',
};
if (watch) await (await esbuild.context(opts)).watch();
else await esbuild.build(opts);
