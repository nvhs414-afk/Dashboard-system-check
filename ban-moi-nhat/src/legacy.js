import JSZip from 'jszip';
import CFB from 'cfb';
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

export {decoded, xmlParagraphs, officeZipText, legacyDocText, rtfText};
