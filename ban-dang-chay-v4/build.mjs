import {build} from 'esbuild';
import {copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
await build({entryPoints:['src/app.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/app.js',minify:true,loader:{'.png':'dataurl','.svg':'dataurl'}});
copyFileSync(resolve('node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),resolve('dist/pdf.worker.min.mjs'));
