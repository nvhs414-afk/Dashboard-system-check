import JSZip from 'jszip';
import mammoth from 'mammoth/mammoth.browser.js';
import * as XLSX from 'xlsx';
import CFB from 'cfb';
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/build/pdf.mjs';
import 'pdfjs-dist/build/pdf.worker.min.mjs';

GlobalWorkerOptions.workerSrc=new URL('./pdf.worker.min.mjs',import.meta.url).href;
export const allowedExt=new Set(['pdf','png','jpg','jpeg','webp','bmp','tif','tiff','doc','docx','xls','xlsx','xlsm','csv','txt','rtf','odt','pptx','zip','json','xml','html','htm','md','eml','log']);
export const extension=name=>name.toLowerCase().split('.').pop();

async function ocr(source){
 if(!window.Tesseract)throw Error('Bộ OCR chưa tải được. Kiểm tra internet rồi thử lại.');
 const worker=await window.Tesseract.createWorker('eng+vie');
 try{return (await worker.recognize(source)).data.text||''}finally{await worker.terminate()}
}
async function pdfText(file,{forceOcr=false,onPdfPage}={}){
 const pdf=await getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
 let text='',worker;
 try{
  for(let n=1;n<=pdf.numPages;n++){
   const page=await pdf.getPage(n),content=await page.getTextContent();let pageText='',lastY=null;
   if(onPdfPage)onPdfPage(content.items);
   for(const item of content.items){const y=item.transform?.[5];if(lastY!==null&&Math.abs(y-lastY)>2)pageText+='\n';pageText+=(item.str||'')+' ';lastY=y}
   if(forceOcr||pageText.replace(/\s/g,'').length<40){
    if(!window.Tesseract)throw Error(`Trang ${n}: chưa tải được bộ OCR. Kiểm tra internet và thử lại.`);
    worker ||= await window.Tesseract.createWorker('eng+vie');
    const v=page.getViewport({scale:1.65}),canvas=document.createElement('canvas');
    canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;
    pageText=(await worker.recognize(canvas)).data.text||pageText;
   }
   text+=`\n[Trang ${n}]\n${pageText}\n`;
  }
  return text;
 }finally{if(worker)await worker.terminate()}
}
function decoded(bytes){let t=new TextDecoder('utf-8').decode(bytes);if((t.match(/�/g)||[]).length>3)t=new TextDecoder('windows-1252').decode(bytes);return t}
function xmlParagraphs(xml){const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw Error('Cấu trúc XML trong tệp bị lỗi.');const ps=[...doc.getElementsByTagNameNS('*','p')];return ps.map(el=>el.textContent).filter(Boolean).join('\n')||doc.documentElement.textContent||''}
async function officeZipText(file,ext){const z=await JSZip.loadAsync(file);if(ext==='odt'){const entry=z.file('content.xml');if(!entry)throw Error('Không tìm thấy nội dung văn bản ODT.');return xmlParagraphs(await entry.async('string'))}
 let slides=Object.keys(z.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));if(!slides.length)throw Error('Bản trình chiếu không có slide để đọc.');return (await Promise.all(slides.map(async n=>xmlParagraphs(await z.file(n).async('string'))))).join('\n')}
function legacyDocText(buffer){
 const doc=CFB.read(new Uint8Array(buffer),{type:'array'}),stream=CFB.find(doc,'WordDocument');
 if(!stream)throw Error('Tệp DOC không có luồng WordDocument hợp lệ.');
 const word=new Uint8Array(stream.content),w=new DataView(word.buffer,word.byteOffset,word.byteLength),tableName=(w.getUint16(0xA,true)&0x0200)?'1Table':'0Table',tableStream=CFB.find(doc,tableName);
 if(!tableStream)throw Error('Không tìm thấy bảng văn bản trong DOC.');
 const table=new Uint8Array(tableStream.content),t=new DataView(table.buffer,table.byteOffset,table.byteLength),fcClx=w.getUint32(0x1A2,true),lcb=w.getUint32(0x1A6,true);let p=fcClx,limit=Math.min(table.length,fcClx+lcb),parts=[];
 while(p+5<limit){let kind=table[p++];if(kind===1){p+=2;continue}if(kind!==2)break;let len=t.getUint32(p,true);p+=4;let n=(len-4)/12;if(!Number.isInteger(n)||n<0||p+len>table.length)break;
  for(let i=0;i<n;i++){let from=t.getUint32(p+i*4,true),to=t.getUint32(p+(i+1)*4,true),piece=p+4*(n+1)+i*8,raw=t.getUint32(piece+2,true),compressed=!!(raw&0x40000000),offset=(raw&0x3fffffff)/(compressed?2:1),size=(to-from)*(compressed?1:2);if(size<=0||offset+size>word.length)continue;parts.push(new TextDecoder(compressed?'windows-1252':'utf-16le').decode(word.subarray(offset,offset+size)))}break;
 }
 const text=parts.join('').replace(/[\x00-\x08\x0b-\x1f]/g,'\n');if(text.trim().length<25)throw Error('DOC cũ không có văn bản trích được; hãy lưu lại thành DOCX hoặc PDF.');return text;
}
function rtfText(s){return s.replace(/\\par\b/g,'\n').replace(/\\u(-?\d+)\??/g,(_,n)=>String.fromCharCode((Number(n)+65536)%65536)).replace(/\\'([0-9a-f]{2})/gi,(_,h)=>new TextDecoder('windows-1252').decode(Uint8Array.of(parseInt(h,16)))).replace(/\\[a-z]+-?\d* ?/gi,'').replace(/\\[^a-z]/gi,'').replace(/[{}]/g,'')}
export async function readSpreadsheetSheets(file){
 const wb=XLSX.read(new Uint8Array(await file.arrayBuffer()),{type:'array',cellDates:false});
 return wb.SheetNames.map(name=>{
  const sheet=wb.Sheets[name],rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:'',blankrows:false});
  const lines=[`Tên sheet: ${name}`],header=rows[0]||[];
  for(const row of rows){
   const cells=row.map(v=>String(v??'').trim()),nonempty=cells.filter(Boolean);
   if(!nonempty.length)continue;
   lines.push(nonempty.length===2?`${nonempty[0]}: ${nonempty[1]}`:nonempty.join(' · '));
   if(row!==header&&header.filter(v=>String(v??'').trim()).length>1)for(let i=0;i<header.length;i++)if(header[i]&&cells[i])lines.push(`${String(header[i]).trim()}: ${cells[i]}`);
   if(nonempty.length>2)for(let i=0;i+1<cells.length;i+=2)if(cells[i]&&cells[i+1])lines.push(`${cells[i]}: ${cells[i+1]}`);
  }
  for(const cell of Object.values(sheet))if(cell&&typeof cell==='object'&&cell.t==='e'&&cell.w)lines.push(String(cell.w));
  return {name,rows,text:lines.join('\n')};
 });
}
export async function readDocument(file,ext=extension(file.name),options={}){
 if(file.size>60*1024*1024)throw Error('Tệp vượt 60 MB; hãy chia nhỏ trước khi quét.');
 if(ext==='pdf')return pdfText(file,options);
 if(['png','jpg','jpeg','webp','bmp','tif','tiff'].includes(ext))return ocr(file);
 if(ext==='docx'){const out=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});return out.value}
 if(ext==='doc')return legacyDocText(await file.arrayBuffer());
 if(['xlsx','xls','xlsm','csv'].includes(ext))return (await readSpreadsheetSheets(file)).map(s=>s.text).join('\n');
 if(ext==='odt'||ext==='pptx')return officeZipText(file,ext);
 if(['txt','md','eml','log'].includes(ext))return decoded(new Uint8Array(await file.arrayBuffer()));
 if(ext==='json'){const raw=decoded(new Uint8Array(await file.arrayBuffer()));try{const obj=JSON.parse(raw),lines=[];const walk=(v,path='')=>{if(v&&typeof v==='object')for(const [k,x] of Object.entries(v))walk(x,k);else if(path)lines.push(`${path.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ')}: ${v}`)};walk(obj);return lines.join('\n')||raw}catch{return raw}}
 if(ext==='xml')return xmlParagraphs(decoded(new Uint8Array(await file.arrayBuffer())));
 if(['html','htm'].includes(ext)){const doc=new DOMParser().parseFromString(decoded(new Uint8Array(await file.arrayBuffer())),'text/html');doc.querySelectorAll('script,style').forEach(el=>el.remove());return doc.body.textContent||''}
 if(ext==='rtf')return rtfText(decoded(new Uint8Array(await file.arrayBuffer())));
 throw Error('Định dạng này chưa được hỗ trợ đọc nội dung.');
}
export async function unzipDocuments(file){const z=await JSZip.loadAsync(file),files=[],skipped=[];for(const entry of Object.values(z.files)){if(entry.dir)continue;const bytes=await entry.async('uint8array');if(bytes.byteLength>60*1024*1024){skipped.push(entry.name+' (vượt 60 MB)');continue}files.push({entry:entry.name,file:new File([bytes],entry.name.split('/').pop(),{lastModified:file.lastModified})})}return{files,skipped}}
