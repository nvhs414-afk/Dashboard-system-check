import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import {createWorker} from 'tesseract.js';
import {getDocument, GlobalWorkerOptions, OPS} from 'pdfjs-dist/build/pdf.mjs';
import {decoded, xmlParagraphs, officeZipText, legacyDocText, rtfText} from './legacy.js';
import {textUnit, unitText, extractDocument} from './extraction.js';
import {sourceType, titleType} from './schema.js';

GlobalWorkerOptions.workerSrc=new URL('./pdf.worker.min.mjs',import.meta.url).href;
export const sheetExtensions=new Set(['xls','xlsx','xlsm','xlsb','ods','csv','tsv']);
const imageExtensions=new Set(['png','jpg','jpeg','webp','bmp','tif','tiff']);
export const allowedExt=new Set(['pdf','doc','docx','odt','rtf','pptx','txt','md','eml','log','json','xml','html','htm','zip',...sheetExtensions,...imageExtensions]);
export const extension=name=>name.toLowerCase().split('.').pop();

let ocrWorker;
function getOcrWorker() {
  if(!ocrWorker) {
    const base=new URL('./ocr/',import.meta.url);
    ocrWorker=createWorker('eng+vie',1,{
      workerPath:new URL('worker.min.js',base).href, corePath:new URL('core.wasm.js',base).href,
      langPath:base.href, workerBlobURL:false, cacheMethod:'none',errorHandler:()=>{}
    }).catch(err=>{ocrWorker=null;throw err;});
  }
  return ocrWorker;
}
export async function releaseOcr() {
  const current=ocrWorker;ocrWorker=null;
  if(current)await current.then(w=>w.terminate()).catch(()=>{});
}
// Preserve blank columns, cell references and cached numeric values. Merged cells are read once, at their anchor.
export async function readSpreadsheetSheets(file) {
  const ext=extension(file.name);
  const input=new Uint8Array(await file.arrayBuffer());
  const opts={cellNF:true,cellFormula:true,cellText:true};
  const wb=(ext==='csv'||ext==='tsv')?XLSX.read(decoded(input),{...opts,type:'string',raw:true,FS:ext==='tsv'?'\t':undefined}):XLSX.read(input,{...opts,type:'array'});
  return wb.SheetNames.map(name=>{
    const sheet=wb.Sheets[name], byRow=new Map();
    for(const [ref,cell] of Object.entries(sheet)) {
      if(!/^[A-Z]+\d+$/.test(ref)||!cell)continue;
      let value=String(cell.w??cell.v??'').trim(),number;
      if(cell.t==='n'&&typeof cell.v==='number'){
        if(cell.z&&XLSX.SSF.is_date(cell.z)){
          const d=XLSX.SSF.parse_date_code(cell.v,{date1904:!!wb.Workbook?.WBProps?.date1904});
          if(d){value=[d.y,String(d.m).padStart(2,'0'),String(d.d).padStart(2,'0')].join('-');if(d.H||d.M)value+=' '+String(d.H).padStart(2,'0')+':'+String(d.M).padStart(2,'0');}
        }else number=cell.v;
      }
      if(!value&&!cell.f)continue;
      const address=XLSX.utils.decode_cell(ref),index=address.r+1;
      if(!byRow.has(index))byRow.set(index,{index,cells:[]});
      byRow.get(index).cells.push({col:address.c,text:value,ref,number,formula:!!cell.f,error:cell.t==='e'});
    }
    const rows=[...byRow.values()].sort((a,b)=>a.index-b.index);
    for(const row of rows)row.cells.sort((a,b)=>a.col-b.col);
    return {name,kind:'sheet',rows};
  });
}
function xmlParts(el,tag) {return Array.from(el.getElementsByTagNameNS('*',tag));}
function paragraph(el) {
  return Array.from(el.getElementsByTagNameNS('*','*')).map(n=>{
    if(n.localName==='t')return n.textContent;
    if(n.localName==='tab')return '\\t';
    return n.localName==='br'||n.localName==='cr'?'\\n':'';
  }).join('').trim();
}
function parseOfficeTable(tbl,section) {
  const rows=[];
  const trElements=Array.from(tbl.children).filter(el=>el.localName==='tr');
  for(const [r,tr] of trElements.entries()){
    let col=Number(xmlParts(tr,'gridBefore')[0]?.getAttribute('w:val')||0);
    const cells=[];
    for(const tc of Array.from(tr.children).filter(el=>el.localName==='tc')){
      const text=xmlParts(tc,'p').map(paragraph).filter(Boolean).join('\n');
      if(text)cells.push({text,col,ref:'hàng '+(r+1)+', cột '+(col+1)});
      col+=Number(xmlParts(tc,'gridSpan')[0]?.getAttribute('w:val'))||1;
    }
    if(cells.length)rows.push({index:r+1,cells});
  }
  return {name:section,kind:'word',rows};
}
async function readWord(file) {
  const archive=await JSZip.loadAsync(await file.arrayBuffer());
  const entry=archive.file('word/document.xml');
  if(!entry)throw Error('Thiếu nội dung trong tệp Word.');
  const xml=new DOMParser().parseFromString(await entry.async('string'),'application/xml');
  const body=xmlParts(xml,'body')[0];if(!body)throw Error('Tệp Word không có phần văn bản.');
  const units=[];let lines=[],block=0,table=0,area='';
  const flush=()=>{if(lines.length){units.push(textUnit(lines.join('\n'),area+'Văn bản '+(++block)));lines=[];}};
  function visit(node){
    if(node.localName==='p'){
      const text=paragraph(node);if(text)lines.push(text);
    }else if(node.localName==='tbl'){flush();units.push(parseOfficeTable(node,area+'Bảng '+(++table)));}
    else for(const child of node.children)visit(child);
  }
  visit(body);flush();
  for(const path of Object.keys(archive.files).filter(n=>/^word\/(?:header|footer)\d+\.xml$/.test(n))){
    area=(path.includes('header')?'Đầu trang ':'Chân trang ')+path.match(/\d+/)[0]+' · ';
    const extra=new DOMParser().parseFromString(await archive.file(path).async('string'),'application/xml');
    visit(extra.documentElement);flush();
  }
  if(!units.some(u=>u.rows.length)){
    for(const path of Object.keys(archive.files).filter(n=>/^word\/media\/.*\.(?:png|jpe?g|bmp|tiff?)$/i.test(n))){
      const u=await recognize(await archive.file(path).async('uint8array'),'Ảnh '+(units.length+1));
      if(u.rows.length)units.push(u);
    }
  }
  return units;
}
function positionedRows(items,bottomUp=false) {
  const atoms=items.filter(t=>t.text?.trim()).sort((a,b)=>(bottomUp?b.y-a.y:a.y-b.y)||a.x-b.x);
  const lines=[];
  for(const atom of atoms){
    let line=lines.at(-1);
    if(!line || Math.abs(line.y-atom.y)>Math.max(2,Math.min(line.h,atom.h)*.45)){
      line={y:atom.y,h:atom.h,atoms:[]};lines.push(line);
    }
    line.atoms.push(atom);
  }
  return lines.map((line,i)=>{
    const cells=[];
    for(const a of line.atoms.sort((a,b)=>a.x-b.x)){
      const previous=cells.at(-1),gap=previous?a.x-previous.end:Infinity;
      if(previous && gap<Math.max(6,line.h*.93)){
        const spacer=gap<line.h*.08 && previous.join && !/^\s/.test(a.text)?'':' ';
        previous.text=(previous.text+spacer+a.text.trim()).trim();
        previous.join=!/\s$/.test(a.text);previous.end=Math.max(previous.end,a.x+a.w);
        if(a.conf!=null)previous.conf=Math.min(previous.conf??100,a.conf);
      }else cells.push({text:a.text.trim(),col:a.x,end:a.x+a.w,join:!/\s$/.test(a.text),conf:a.conf,ref:'dòng '+(i+1)});
    }
    return {index:i+1,cells};
  });
}
async function recognize(image,name){
  const worker=await getOcrWorker();
  const out=await worker.recognize(image,{rotateAuto:true},{text:true,blocks:true});
  const items=[];
  for(const block of out.data.blocks||[])for(const para of block.paragraphs||[])for(const line of para.lines||[])for(const word of line.words||[]){
    const {x0,y0,x1,y1}=word.bbox;
    items.push({text:word.text+' ',x:x0,y:(y0+y1)/2,w:x1-x0,h:y1-y0,conf:word.confidence});
  }
  const rows=items.length?positionedRows(items):textUnit(out.data.text).rows;
  return {name,kind:'ocr',spatial:!!items.length,rows};
}
async function recognizeImage(file) {
  let image;
  try{image=await createImageBitmap(file);}catch{return recognize(new Uint8Array(await file.arrayBuffer()),'Ảnh OCR');}
  try{
    const scale=Math.min(3,2400/Math.max(image.width,image.height));
    if(scale<=1)return await recognize(file,'Ảnh OCR');
    const c=document.createElement('canvas');c.width=Math.round(image.width*scale);c.height=Math.round(image.height*scale);
    const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,0,0,c.width,c.height);
    return await recognize(c,'Ảnh OCR');
  } finally{image.close();}
}
async function pdfUnits(file,onProgress) {
  const task=getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});
  const pdf=await task.promise;
  const units=[],notes=[];
  try {
    for(let n=1;n<=pdf.numPages;n++){
      const name='Trang '+n;onProgress(name+' / '+pdf.numPages);
      let page;
      try{
        page=await pdf.getPage(n);
        let rows=[], matrix=[];
        try{
          const content=await page.getTextContent();
          const viewport=page.getViewport({scale:1});
          for(const item of content.items)if(item.str?.trim()){
            const [x,y]=viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
            matrix.push({text:item.str,x,y,w:item.width||0,h:Math.max(item.height||0,Math.abs(item.transform[3]),3)});
          }
          rows=positionedRows(matrix);
        }catch{ /* A page can still be rendered for OCR. */ }
        const unit={name,page:n,kind:'pdf',spatial:true,rows},text=unitText(unit);
        if(rows.length)units.push(unit);
        const type=sourceType(file.name,text);
        let useOcr=text.replace(/\s/g,'').length<36 || (text.match(/[\uFFFD\uE000-\uF8FF]/g)||[]).length>Math.max(2,text.length*.04);
        if(!useOcr && Object.keys(extractDocument(type,[unit])).length<3){
          const ops=await page.getOperatorList();
          useOcr=ops.fnArray.some(op=>[OPS.paintImageXObject,OPS.paintInlineImageXObject].includes(op));
        }
        if(useOcr){
          onProgress('OCR · '+name+' / '+pdf.numPages);
          const base=page.getViewport({scale:1}),scale=Math.min(3,2700/Math.max(base.width,base.height)),v=page.getViewport({scale});
          const canvas=document.createElement('canvas');canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);
          try {
            await page.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;
            const o=await recognize(canvas,name+' · OCR');o.page=n;if(o.rows.length)units.push(o);
            else notes.push(name+' chưa đọc được chữ.');
          }finally{canvas.width=canvas.height=0;}
        }
      }catch{notes.push(name+' cần kiểm tra lại bản gốc.');}finally{page?.cleanup();}
    }
  }finally{await task.destroy();}
  return {units,notes};
}
async function simpleText(file,ext) {
  if(ext==='doc')return legacyDocText(await file.arrayBuffer());
  if(ext==='odt'||ext==='pptx')return officeZipText(file,ext);
  const raw=decoded(new Uint8Array(await file.arrayBuffer()));
  if(ext==='rtf')return rtfText(raw);
  if(ext==='xml')return xmlParagraphs(raw);
  if(ext==='html'||ext==='htm'){
    const html=new DOMParser().parseFromString(raw,'text/html');
    html.querySelectorAll('script,style').forEach(n=>n.remove());
    return Array.from(html.body.querySelectorAll('tr,p,div')).filter(el=>!el.querySelector('tr,p,div')).map(el=>el.localName==='tr'?Array.from(el.cells,c=>c.textContent).join('\t'):el.textContent).join('\n')||html.body.textContent;
  }
  if(ext==='json'){
    const lines=[];
    const walk=(obj,key='')=>{if(obj&&typeof obj==='object')for(const [k,v] of Object.entries(obj))walk(v,k);else lines.push(key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ')+': '+obj);};
    try{walk(JSON.parse(raw));return lines.join('\n');}catch{return raw;}
  }
  return raw;
}
function partition(units,fileName) {
  const all=units.map(unitText).join('\n'), fallback=sourceType(fileName,all);
  const groups=[];let current;
  for(const u of units){
    const heading=unitText(u).split('\n').slice(0,10).map(titleType).find(Boolean);
    const type=heading||current?.type||fallback;
    if(!current || current.type!==type){current={type,units:[]};groups.push(current);}
    current.units.push(u);
  }
  return groups;
}
export async function readParts(file,onProgress=()=>{}) {
  if(file.size>60*1024*1024)throw Error('Tệp vượt 60 MB. Hãy chia nhỏ để quét.');
  const ext=extension(file.name);
  if(sheetExtensions.has(ext)){
    const sheets=await readSpreadsheetSheets(file);
    const fileType=sourceType(file.name);
    return {parts:sheets.map(u=>{
      const text=unitText(u),type=sourceType(u.name,text);
      const excluded=/(?:^|\b)(?:dm|dinh muc|bctt|hao hut|material consumption)/i.test((u.name+' '+text.slice(0,140)).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d'));
      return {name:u.name,type:type==='other'&&!excluded?fileType:type,units:[u]};
    }),notes:[]};
  }
  let units=[],notes=[];
  if(ext==='pdf')({units,notes}=await pdfUnits(file,onProgress));
  else if(ext==='docx')units=await readWord(file);
  else if(imageExtensions.has(ext))units=[await recognizeImage(file)];
  else if(allowedExt.has(ext))units=[textUnit(await simpleText(file,ext),'Văn bản')];
  else throw Error('Định dạng chưa có bộ đọc.');
  if(!units.some(u=>u.rows.length))throw Error(notes.join(' ')||'Không đọc được chữ trong tệp.');
  return {parts:partition(units,file.name),notes};
}
export async function unzipDocuments(file){
  const archive=await JSZip.loadAsync(await file.arrayBuffer()),files=[],skipped=[];
  for(const entry of Object.values(archive.files)){
    if(entry.dir||/(?:^|\/)(?:__MACOSX\/|~\$|\._)/.test(entry.name))continue;
    if(!allowedExt.has(extension(entry.name))||entry._data?.uncompressedSize>60*1024*1024){skipped.push(entry.name);continue;}
    const bytes=await entry.async('uint8array');
    if(bytes.byteLength>60*1024*1024){skipped.push(entry.name);continue;}
    files.push({entry:entry.name,file:new File([bytes],entry.name.split('/').pop(),{lastModified:file.lastModified})});
  }
  return {files,skipped};
}
