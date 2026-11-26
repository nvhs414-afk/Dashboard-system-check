// Each role is shared by the readers. The field map is the boundary between documents.
export const fieldMap = {
  invoice: {invoice:'invoiceNo', date:'invoiceDate', exporter:'exporter', importer:'importer', hs:'hs', qty:'invoiceQty', unit:'invoiceUnit', net:'invoiceNet', gross:'invoiceGross', amount:'invoiceValue', goods:'description'},
  packing: {invoice:'plInvoiceNo', exporter:'plExporter', importer:'plImporter', qty:'plQty', unit:'plUnit', net:'plNet', gross:'plGross', container:'plContainer', seal:'plSeal'},
  customs: {declaration:'decNo', invoice:'decInvoiceNo', exporter:'decExporter', importer:'decImporter', hs:'decHs', qty:'decQty', unit:'decUnit', net:'decNet', gross:'decGross', amount:'decValue', channel:'decChannel', container:'decContainer', seal:'decSeal'},
  booking: {booking:'bookingNo', etd:'etd', eta:'etaFirst', connection:'etdConnect', pickup:'pickupDate', free:'freeDays', cy:'cyCutoff', icd:'icdCutoff', si:'siCutoff', pol:'bookingPol', pod:'bookingPod', container:'bookingContainer', seal:'bookingSeal', planned:'plannedWeight', final:'finalWeight'},
  bl: {bill:'blNo', booking:'blBookingNo', invoice:'blInvoiceNo', exporter:'blExporter', importer:'blImporter', pol:'blPol', pod:'blPod', container:'blContainer', seal:'blSeal', gross:'blGross'},
  co: {certificate:'coNo', invoice:'coInvoiceNo', exporter:'coExporter', importer:'coImporter', hs:'coHs', origin:'coOrigin'}
};
export const aliases = {
  invoice:'commercial invoice number|commercial invoice no|commercial invoice #|invoice number|invoice no|invoice #|inv no|invoice reference|số invoice|hóa đơn số|no of invoice|số hóa đơn thương mại|số hóa đơn|hóa đơn số|số invoice|invoice',
  date:'invoice date|date of invoice|inv date|ngày hóa đơn|ngày lập hóa đơn|ngày invoice|date',
  exporter:'goods consigned from|name of exporter|exporter|consignor|shipper|seller|sold by|người xuất khẩu|người gửi hàng|đơn vị xuất khẩu|bên bán',
  importer:'goods consigned to|name of importer|consignee|importer|buyer|sold to|bill to|người nhập khẩu|người nhận hàng|đơn vị nhập khẩu|bên mua',
  hs:'hs tariff code|harmonized system code|commodity code|tariff code|h s code|hs code|hs codes|hs number|mã số hàng hóa|mã hàng hóa|mã hs|hs',
  qty:'total quantity|total qty|quantity shipped|shipped qty|quantity|qty|q ty|tổng số lượng|số lượng hàng|lượng hàng hóa thực tế|số lượng|lượng hàng',
  packages:'number of packages|no of packages|no of cartons|total cartons|carton qty|cartons|ctns|tổng số kiện|số kiện',
  unit:'unit of measurement|unit of measure|sales unit|đơn vị tính|đơn vị|uom|u m|unit',
  net:'total net weight|net weight|net wt|net wgt|net mass|n w|nw|net|tổng trọng lượng tịnh|trọng lượng tịnh|khối lượng tịnh|t l tịnh',
  gross:'total gross weight|gross weight|gross wt|gross wgt|gross mass|g w|gw|gross|tổng trọng lượng hàng|trọng lượng cả bì|khối lượng cả bì|trọng lượng hàng cả bì',
  currency:'invoice currency|currency code|currency|mã đồng tiền|mã tiền tệ|loại tiền|đồng tiền',
  amount:'total invoice amount|total invoice value|total fob value|total fob|invoice total|grand total amount|total amount|total value|fob value|fob amount|trị giá hóa đơn|tổng trị giá|trị giá fob|trị giá|thành tiền|amount|value|fob',
  goods:'description of goods|goods description|description of merchandise|commodity description|tên hàng hóa|mô tả hàng hóa|tên hàng|description|commodity',
  container:'container number|container no|container #|cntr no|cont no|số container|số công ten nơ|số cont|container',
  seal:'seal number|seal no|seal #|seal nos|số niêm phong|số seal|seal',
  declaration:'customs declaration number|customs declaration no|declaration number|declaration no|số tờ khai hải quan|số tờ khai|declaration',
  channel:'kết quả phân luồng|mã phân loại kiểm tra|phân luồng|inspection channel|customs channel|channel',
  bill:'ocean bill of lading no|bill of lading number|bill of lading no|sea waybill no|b l number|b l no|bl no|waybill no|số vận đơn|vận đơn số',
  certificate:'certificate of origin number|certificate of origin no|certificate no|reference no|c o no|co no|số chứng nhận|số c o',
  booking:'booking reference number|booking reference|booking number|booking no|booking #|bkg no|số booking|số đặt chỗ',
  etd:'estimated time of departure|estimated departure date|vessel etd|ngày khởi hành|ngày tàu chạy|etd',
  eta:'eta first leg|first leg eta|eta yangshan|eta chặng 1|eta chặng một|eta',
  connection:'connection etd|transshipment etd|connecting vessel etd|etd connecting|etd tàu nối',
  pickup:'empty container pickup date|empty container pick up|empty pick up|empty pickup|ngày nhận container rỗng|ngày lấy rỗng',
  free:'free time|free days|số ngày miễn phí',
  cy:'cy closing time|cy cut off|cy cutoff|cy closing', icd:'icd cut off|icd cutoff', si:'si cut off|si cutoff|si closing',
  pol:'port of loading|loading port|port of shipment|cảng xếp hàng|cảng xếp|pol',
  pod:'port of discharge|discharge port|cảng dỡ hàng|cảng dỡ|pod',
  planned:'planned gross weight|planned weight|estimated weight|trọng lượng kế hoạch',
  final:'final gross weight|final weight|verified gross mass|trọng lượng thực tế|vgm',
  origin:'origin criterion|origin criteria|origin rule|tiêu chí xuất xứ'
};

export const fold = value => String(value ?? '').normalize('NFC').replace(/[Đđ]/g,'d').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const words = value => fold(value).replace(/[^a-z0-9]+/g,' ').trim();
export const metricRoles = new Set(['qty','packages','net','gross','amount','planned','final','free']);
const dateRoles = new Set(['date','etd','eta','connection','pickup','cy','icd','si']);
const roleAliases = Object.entries(aliases).flatMap(([role, list]) => list.split('|').map(label => {
  const pattern = fold(label).split(' ').join('[\\s./_-]*');
  return {role,pattern,length:label.length};
})).sort((a,b)=>b.length-a.length);
const patterns = roleAliases.map(a=>({...a, re:new RegExp('^'+a.pattern+'(?![a-z0-9])','i')}));
const headerUnits = /^\s*(?:\(\s*([^)]{1,48})\s*\)|\[\s*([^\]]{1,48})\s*\]|((?:kgs?|lbs?|usd|eur|vnd|pcs|ctns|mt))\b)/i;
export function labelOf(text) {
  const original = String(text ?? '').normalize('NFC').trim().replace(/^(?:\[\d{1,2}\]|\(?\d{1,2}[.)])\s*/, '');
  const f = fold(original);
  for (const def of patterns) {
    const m = f.match(def.re);
    if (!m) continue;
    let rest=original.slice(m[0].length).replace(/^\.\s*/, '').trim();
    const unit = rest.match(headerUnits);
    if(unit) rest=rest.slice(unit[0].length);
    rest=rest.replace(/^[\s:：=#.–—-]+/, '').trim();
    // A unit price or weight per item is not a shipment total.
    if (/\b(per|each|price)\b|\/\s*(pcs?|ctns?|carton|unit|piece)\b/.test(f) && (metricRoles.has(def.role)||def.role==='unit')) return null;
    return {role:def.role, value:rest, label:original.slice(0,original.length-rest.length).trim(), unit:unit?.slice(1).find(Boolean)||''};
  }
  return null;
}
export function titleType(text) {
  const f=words(text).replace(/^\d+ /,'');
  if (/^(?:original |copy |draft |ocean |clean |combined transport |non negotiable )*(?:bill of lading|sea waybill|seawaybill|van don duong bien|van don)(?:$| )/.test(f) && !/ (?:no|number|so)\b/.test(f)) return 'bl';
  if (/^(?:preferential |non preferential |economic |asean )*(?:certificate of origin|certification of origin|chung nhan xuat xu|giay chung nhan xuat xu)(?: |$)/.test(f)) return 'co';
  if (/^(?:to khai(?: hang hoa| hai quan| xuat khau| nhap khau)|customs declaration|danh sach (?:container|hang hoa|giam sat))/.test(f)) return 'customs';
  if (/^(?:export |detailed )?(?:packing list|packing details|phieu dong goi|bang ke dong goi)(?: |$)/.test(f)) return 'packing';
  if (/^(?:commercial invoice|hoa don thuong mai|export invoice)(?: |$)/.test(f)) return 'invoice';
  if (/^(?:booking confirmation|booking acknowledgement|booking advice|shipping order|xac nhan dat cho)(?: |$)/.test(f)) return 'booking';
  return '';
}
export function sourceType(name,text='') {
  const file=words(String(name).split(/[\\/]/).pop().replace(/\.[a-z\d]{2,5}$/i,''));
  const lines=String(text).split(/\r?\n/).filter(s=>s.trim()).slice(0,40);
  const ignore=/(?:^| )(?:dinh muc|dm\d*|bctt\d*|material consumption)(?: |$)/;
  if(ignore.test(file) || lines.slice(0,4).some(s=>ignore.test(words(s)))) return 'other';
  const matchName=(re)=>re.test(file.replace(/\bco (?:ltd|limited|inc)\b/g,''));
  const hint=matchName(/\b(?:bill|bl|b l|hbl|mbl|waybill|van don)\b/)?'bl':
   matchName(/\b(?:c o|co|certificate of origin|chung nhan xuat xu)\b/)?'co':
   matchName(/\b(?:to khai|declaration|giam sat|vnaccs|tkhq|tkxk|tk)\b/)?'customs':
   matchName(/\b(?:packing|pack list|p l|pl|phieu dong goi)\b/)?'packing':
   matchName(/\b(?:invoice|hoa don|ci)\b/)?'invoice':
   matchName(/\b(?:booking|bkg|xac nhan dat cho)\b/)?'booking':'';
  const titles=lines.map(titleType).filter(Boolean);
  if(titles.length) return titles[0];
  if(hint) return hint;
  const roles=new Set(lines.flatMap(s=>s.split(/\t+| {3,}/)).map(c=>labelOf(c)?.role).filter(Boolean));
  if(roles.has('declaration')||roles.has('channel')) return 'customs';
  if(roles.has('bill')) return 'bl';
  if(roles.has('origin')||roles.has('certificate')) return 'co';
  if(roles.has('booking')&&(roles.has('etd')||roles.has('pol')||roles.has('pod'))) return 'booking';
  if(roles.has('net')&&roles.has('gross')&&roles.has('packages')) return 'packing';
  if(roles.has('invoice')&&(roles.has('amount')||roles.has('date'))) return 'invoice';
  return 'other';
}
export function canonicalUnit(text) {
  const s=words(text);
  if(/^(?:pcs?|pieces?|pce|pces|cai|chiec)$/.test(s))return 'PCS';
  if(/^(?:ctns?|cartons?|thung)$/.test(s))return 'CARTON';
  if(/^(?:sets?|bo)$/.test(s))return 'SET';
  if(/^(?:pkgs?|packages?|kien)$/.test(s))return 'PKG';
  if(/^(?:pal(?:let)?s?|plt[s]?)$/.test(s))return 'PALLET';
  if(/^(?:pairs?|doi)$/.test(s))return 'PAIR';
  if(/^(?:kgs?|kilograms?)$/.test(s))return 'KG';
  if(/^(?:units?|ea|each|rolls?|bags?|boxes|box|meters?|metres?|m2|m3|cbm|litres?|liters?|tan|mt)$/.test(s))return s.toUpperCase();
  return '';
}
export function quantityUnit(text) {
  const end=String(text).match(/[\d)]\s*([a-zA-ZÀ-ỹ][a-zA-ZÀ-ỹ0-9 ]{0,18})\s*$/);
  return end ? canonicalUnit(end[1]) : '';
}
export function numericValue(raw) {
  if(typeof raw==='number')return Number.isFinite(raw)?raw:NaN;
  let s=String(raw??'').trim().replace(/[\u00a0\u202f]/g,' ');
  if(!/^\+?\d+(?:[\s.,]\d+)*$/.test(s))return NaN;
  s=s.replace(/\s/g,'').replace(/^\+/,'');
  if(s.includes('.')&&s.includes(',')) {
    const decimal=s.lastIndexOf('.')>s.lastIndexOf(',')?'.':',';
    s=s.split(decimal==='.'?',':'.').join('').replace(decimal,'.');
  } else if(s.includes(',')){
    s=/^\d{1,3}(?:,\d{3})+$/.test(s) && !s.startsWith('0,') ? s.replace(/,/g,'') : s.replace(',','.');
  } else if(/^\d{1,3}(?:\.\d{3}){2,}$/.test(s))s=s.replace(/\./g,'');
  return Number(s);
}
function dateValue(text,withTime) {
  const f=fold(text).trim(),months='jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
  let m,y,mo,d;
  if((m=f.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/))) [,y,mo,d]=m;
  else if((m=f.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/))) {[,d,mo,y]=m; if(+mo>12&&+d<=12)[mo,d]=[d,mo];}
  else if((m=f.match(/^(\d{1,2})[\s./-]*([a-z]{3})[a-z]*[,\s./-]*(\d{4}|\d{2})\b/))) {[,d,,y]=m;mo=months.indexOf(m[2])+1;}
  else if((m=f.match(/^([a-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b/))) {[, ,d,y]=m;mo=months.indexOf(m[1])+1;}
  else return withTime && /^\d{1,2}:\d{2}$/.test(f) ? f : '';
  y=+y<100?2000+(+y):+y;mo=+mo;d=+d;
  const test=new Date(Date.UTC(y,mo-1,d));
  if(y<1900||y>2150||test.getUTCMonth()!==mo-1||test.getUTCDate()!==d||mo<1||mo>12)return '';
  const iso=[y,String(mo).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
  const time=withTime && f.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return iso+(time?' '+time[0]:'');
}
export function normalize(role,cell,hint='') {
  const s=String(cell?.text??'').normalize('NFC').replace(/^[\s:：=]+|[\s;,]+$/g,'').trim();
  if(!s||/^#(?:REF!|N\/A|VALUE!|DIV\/0!)$/i.test(s))return '';
  if(dateRoles.has(role))return dateValue(s,['cy','icd','si'].includes(role));
  if(role==='unit')return canonicalUnit(s);
  if(role==='currency')return /^[A-Z]{3}$/i.test(s)?s.toUpperCase():'';
  if(['exporter','importer','goods','pol','pod','origin'].includes(role) && (/^(?:ma|ten|dia chi|address|name|code|mst|tax id|id|fax|tel)(?:$|\s*[:：])/i.test(words(s)) || !/[\p{L}]/u.test(s)))return '';
  if(role==='channel')return ({1:'Xanh',2:'Vàng',3:'Đỏ',xanh:'Xanh',vang:'Vàng',do:'Đỏ',green:'Xanh',yellow:'Vàng',red:'Đỏ'})[words(s).replace(/^luong /,'').split(' ')[0]]||'';
  if(role==='hs')return /^\d{4}(?:[.\s]?\d{2}){1,3}$/.test(s)?s.replace(/[.\s]/g,''):'';
  if(role==='container') {
    const m=s.toUpperCase().match(/^[A-Z]{3}[UJZ][ -]?\d{6}[ -]?\d$/);
    return m?m[0].replace(/[ -]/g,''):'';
  }
  if(['invoice','booking','bill','certificate','declaration','seal'].includes(role)) {
    if(role==='seal'&&/^(?:n\/?a|nil|none)$/i.test(s))return 'NA';
    return /^[A-Z0-9][A-Z0-9/_\-.]{1,69}$/i.test(s) && /\d/.test(s) ? s : '';
  }
  if(metricRoles.has(role)) {
    const context=fold(hint+' '+s);
    const isWeight=['net','gross','planned','final'].includes(role);
    if(role==='amount'&&/\b(vnd|eur|jpy|cny|hkd|gbp|cad|aud)\b|[€¥£₫]/i.test(context))return '';
    const m=fold(s).match(/^(?:usd\s*|\$\s*)?(\+?\d+(?:[ .,]\d+)*)(?:\s*([a-z][a-z0-9 ]*))?$/);
    if(!m && !Number.isFinite(cell.number))return '';
    const suffix=m?.[2]||'';
    if(suffix && ((role==='qty'||role==='packages') ? !canonicalUnit(suffix) : isWeight ? !/^(?:kgs?|kilograms?|g|grams?|mt|tonnes?|tan|lbs?|pounds?)$/.test(suffix) : role==='amount' ? suffix!=='usd' : !/^(?:days?|ngay)$/.test(suffix)))return '';
    let n=Number.isFinite(cell.number)?cell.number:numericValue(m[1]);
    if(!Number.isFinite(n)||n<0)return '';
    if(isWeight){
      if(/\b(lbs?|pounds?)\b/.test(context))n*=0.45359237;
      else if(/\b(mt|tonnes?|tan)\b/.test(context))n*=1000;
      else if(/\b(g|grams?)\b/.test(words(hint).replace(/^g w\b/,'')+' '+suffix))n/=1000;
    }
    return String(+n.toFixed(6));
  }
  if(/^(?:n\/a|na|address|dia chi|name|ten|no|usd|kgs?|total|tong cong)$/i.test(fold(s)) || !/[A-Za-zÀ-ỹ]/.test(s))return '';
  if(labelOf(s) || /^(?:[0-9]+[., ]+[0-9]+|[=:#])/.test(s))return '';
  return s.slice(0,200);
}
