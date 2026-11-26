import {build} from 'esbuild';
import {copyFileSync,mkdirSync} from 'node:fs';
await build({entryPoints:['src/app.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/app.js',minify:true,loader:{'.png':'dataurl','.svg':'dataurl'}});
copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs','dist/pdf.worker.min.mjs');
mkdirSync('dist/ocr',{recursive:true});
copyFileSync('node_modules/tesseract.js/dist/worker.min.js','dist/ocr/worker.min.js');
copyFileSync('node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js','dist/ocr/core.wasm.js');
for(const lang of ['eng','vie']){
  copyFileSync('node_modules/@tesseract.js-data/'+lang+'/4.0.0_best_int/'+lang+'.traineddata.gz','dist/ocr/'+lang+'.traineddata.gz');
}
