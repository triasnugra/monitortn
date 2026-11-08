import fs from 'node:fs';
import {overlay} from './overlay.mjs';
const C=JSON.parse(fs.readFileSync('config.json','utf8')),LOCAL=process.env.LOCAL_DIR,TOK=process.env.MONITOR_TOKEN;
const now=Date.now(),DAY=864e5,fin=r=>['TP','SL','kedaluwarsa'].includes(r.hasil);
async function getJ(e){
 if(LOCAL)return JSON.parse(fs.readFileSync(`${LOCAL}/${e.repo}-main/data/journal.json`,'utf8'));
 const r=await fetch(`https://raw.githubusercontent.com/${C.owner}/${e.repo}/main/data/journal.json`,{headers:TOK?{Authorization:'token '+TOK}:{}});
 if(!r.ok)throw new Error(`${e.id}: HTTP ${r.status} (repo privat? isi secret MONITOR_TOKEN)`);return r.json()}
const wil=(k,n)=>{if(!n)return null;const z=1.96,p=k/n,d=1+z*z/n,c=p+z*z/(2*n),m=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n));return[(c-m)/d,(c+m)/d]};
const wk=r=>{const d=new Date(r.waktu.slice(0,10));const t=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));t.setUTCDate(t.getUTCDate()+4-(t.getUTCDay()||7));return t.getUTCFullYear()+'-'+Math.ceil(((t-Date.UTC(t.getUTCFullYear(),0,1))/DAY+1)/7)};
const net=r=>{const e=+r.entry,s=+r.sl;return +r.R-(C.costPct/100)/(Math.abs(e-s)/e)};
const sum=a=>a.reduce((x,y)=>x+y,0);
function stats(rows){const f=rows.filter(fin),tp=f.filter(r=>r.hasil==='TP').length,sl=f.filter(r=>r.hasil==='SL').length,n=f.map(net);
 const gp=sum(n.filter(x=>x>0)),gl=-sum(n.filter(x=>x<0)),Wk=new Set(f.map(wk)),days=new Set(rows.map(r=>r.waktu.slice(0,10)));
 let ci=null;if(Wk.size>=12){const g={};f.forEach(r=>(g[wk(r)]??=[]).push(net(r)));const v=Object.values(g),b=[];for(let i=0;i<2000;i++){let s=0,c=0;for(let j=0;j<v.length;j++){const x=v[Math.floor(Math.random()*v.length)];s+=sum(x);c+=x.length}b.push(s/c)}b.sort((a,c)=>a-c);ci=[b[50],b[1950]]}
 return{sinyal:rows.length,terisi:f.length,tp,sl,exp:f.length-tp-sl,tdkIsi:rows.filter(r=>r.hasil==='tidak terisi').length,menunggu:rows.filter(r=>r.hasil==='menunggu').length,
  win:tp+sl?tp/(tp+sl):null,winCI:wil(tp,tp+sl),netR:f.length?sum(n)/f.length:null,totalR:sum(n),pf:gl?gp/gl:null,minggu:Wk.size,hari:days.size,sinyalPerHari:days.size?rows.length/days.size:0,ci}}
const out={updated:new Date().toISOString(),cfg:{minTrades:C.minTrades,minWeeks:C.minWeeks},engines:[],warnings:[]};
const W=(lvl,e,t,aksi)=>out.warnings.push({lvl,e,t,aksi});
const RES={};const px={};async function price(a){if(a in px)return px[a];try{const r=await fetch(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${a}USDT`,{signal:AbortSignal.timeout(8000)});px[a]=r.ok?+(await r.json()).price:null}catch{px[a]=null}return px[a]}
for(const e of C.engines){
 let J;try{J=await getJ(e)}catch(x){W('merah',e.id,'Jurnal tidak terbaca: '+x.message,'Periksa nama repo di config.json atau secret MONITOR_TOKEN');continue}
 const all=J.filter(r=>r.agen===e.agen&&r.waktu>=e.start),com=all.filter(r=>r.waktu>=C.commonStart),last=all.at(-1);
 if(!last){W('merah',e.id,'Tidak ada baris jurnal untuk agen '+e.agen,'Periksa config.json');continue}
 for(const r of all)RES[e.id+'|'+r.aset+'|'+r.waktu.slice(0,10)+'|'+r.arah]={h:r.hasil,R:fin(r)?net(r):null};const dir={};for(const s of['LONG','SHORT'])dir[s]=stats(all.filter(r=>r.arah===s));
 const st=stats(all),sc=stats(com),s7=stats(all.filter(r=>r.waktu>=new Date(now-7*DAY).toISOString().slice(0,10)));
 const pend=(()=>{const s=new Set();return all.filter(r=>r.hasil==='menunggu').reverse().filter(r=>{const k=r.aset+'|'+r.arah+'|'+r.entry;if(s.has(k))return false;s.add(k);return true}).reverse()})();
 const dupN=all.filter(r=>r.hasil==='menunggu').length-pend.length;if(dupN>0)W('info',e.id,dupN+' sinyal menunggu duplikat (koin, arah, entry sama dengan analisis lebih baru) disembunyikan',null);for(const r of pend){const p=await price(r.aset);r.px=p;r.dist=p?(p-+r.entry)/+r.entry*100:null}
 const ready=[[st.terisi>=C.minTrades,`Trade terisi ${st.terisi}/${C.minTrades}`],[st.minggu>=C.minWeeks,`Minggu ${st.minggu}/${C.minWeeks}`],[!!st.ci&&st.ci[0]>0,'CI95 bawah R/trade > 0'],[st.pf>=1.2,'Profit factor >= 1,2']];
 out.engines.push({id:e.id,nama:e.nama,start:e.start,all:st,sejakBersama:sc,tujuhHari:s7,dir,ready,layak:ready.every(x=>x[0]),
  jurnal:all.slice(-120).reverse().map(r=>({w:r.waktu.slice(0,16),a:r.aset,d:r.arah,en:r.entry,sl:r.sl,tp:r.tp,h:r.hasil,R:r.R,al:r.alasan,sk:r.score??null,gr:r.grade??null})),
  pending:pend.map(r=>({a:r.aset,d:r.arah,en:r.entry,sl:r.sl,tp:r.tp,px:r.px,dist:r.dist,w:r.waktu.slice(0,10)}))});
 const lastAny=J.at(-1),age=(now-new Date(lastAny.waktu.replace(' UTC','Z').replace(' ','T')))/36e5;
 if(age>36)W('merah',e.id,`Jurnal terakhir ${age.toFixed(0)} jam lalu: workflow jurnal mungkin mati`,'Cek Actions di repo mesin');
 if(st.sinyalPerHari>10)W('kuning',e.id,`Overtrading: ${st.sinyalPerHari.toFixed(0)} sinyal/hari. @eliz883: tidak harus trading tiap hari`,'Tambah batas harian dan skor minimum (seperti tnv2c2)');
 if(st.terisi<30)W('info',e.id,`Sampel kecil (${st.terisi} trade terisi): hasil belum bermakna`,'Tunggu data; jangan ubah mesin');
 const L=dir.LONG,S=dir.SHORT;
 if(L.terisi>=15&&S.terisi>=15&&(L.netR??0)<0&&(S.netR??0)>0.3)W('kuning',e.id,`Hasil bertumpu pada satu arah: LONG ${f2(L.netR)}R (n=${L.terisi}) vs SHORT ${f2(S.netR)}R (n=${S.terisi}). Kemungkinan bergantung rezim pasar`,'Pertimbangkan filter searah tren makro; uji lintas rezim');
 if(st.sinyal&&st.tdkIsi/st.sinyal>.3)W('kuning',e.id,`${(100*st.tdkIsi/st.sinyal).toFixed(0)}% sinyal tidak terisi: entry limit terlalu jauh`,'Batasi jarak entry ke harga (tnv2c2: maks 0,75R)');
 if(st.minggu<12)W('info',e.id,`Hanya ${st.minggu} minggu data: CI per minggu belum dapat dihitung`,'Syarat 20 minggu tetap penentu')}
function f2(x){return x==null?'-':x.toFixed(2)}
W('kuning','monitor','Penilaian monitor memakai hasil jurnal mesin (masa order 7 hari), bukan penilaian candle sendiri, sehingga tidak ada EXPIRED 3 hari yang menutup sinyal pemenang','Bila angka monitor berbeda dari jurnal mesin, itu bug monitor: laporkan');
for(const e of out.engines)if(!e.layak)W('merah',e.id,'BELUM LAYAK uang sungguhan: '+e.ready.filter(x=>!x[0]).map(x=>x[1]).join('; '),'Jika tetap trading di Binance, risiko maks 0,25% per trade');
let EZ=[];try{EZ=JSON.parse(fs.readFileSync('data/eliz-posts.json','utf8'))}catch{}
const tick=new Set();EZ.slice(-30).forEach(p=>[...p.teks.matchAll(/\$([A-Z]{2,10})/g)].forEach(m=>tick.add(m[1])));
out.eliz={posts:EZ.slice(-10).reverse(),tickers:[...tick],lastPost:EZ.at(-1)?.tgl||null,cocok:[...tick].map(t=>({t,sinyal:out.engines.map(e=>({e:e.id,n:e.jurnal.filter(r=>r.a===t).slice(0,3).map(r=>r.d+' '+r.w.slice(5,10)+' '+r.h)}))}))};
if(!EZ.length)W('kuning','eliz','data/eliz-posts.json kosong','Tambahkan postingan terbaru @eliz883');
else if((now-new Date(EZ.at(-1).tgl))/DAY>3)W('kuning','eliz',`Postingan @eliz883 terakhir di monitor sudah ${((now-new Date(EZ.at(-1).tgl))/DAY).toFixed(0)} hari`,'Perbarui data/eliz-posts.json');
fs.mkdirSync('site',{recursive:true});const OV=await overlay(out,C,RES,fs);const f=(x,d=2)=>x==null?'-':x.toFixed(d),pc=x=>x==null?'-':(100*x).toFixed(0)+'%';
let md=`# Laporan monitor untuk Claude (${out.updated})\n\n## Kinerja (hasil jurnal mesin, biaya ${C.costPct}% pulang-pergi)\n| Mesin | Sinyal | Terisi | TP/SL | Win | R/trade | PF | Minggu | Sejak ${C.commonStart}: terisi / R/trade |\n|---|---|---|---|---|---|---|---|---|\n`;
for(const e of out.engines)md+=`| ${e.nama} | ${e.all.sinyal} | ${e.all.terisi} | ${e.all.tp}/${e.all.sl} | ${pc(e.all.win)} | ${f(e.all.netR)} | ${f(e.all.pf)} | ${e.all.minggu} | ${e.sejakBersama.terisi} / ${f(e.sejakBersama.netR)} |\n`;
md+=`\n## LONG vs SHORT\n`;for(const e of out.engines)md+=`- ${e.id}: LONG n=${e.dir.LONG.terisi} R/trade ${f(e.dir.LONG.netR)}; SHORT n=${e.dir.SHORT.terisi} R/trade ${f(e.dir.SHORT.netR)}\n`;
md+=`\n## Warning\n`;for(const w of out.warnings)md+=`- [${w.lvl}] ${w.e}: ${w.t}${w.aksi?' -> '+w.aksi:''}\n`;
md+=`\n## Postingan terbaru @eliz883 (tickers: ${out.eliz.tickers.join(', ')||'-'})\n`;for(const p of out.eliz.posts.slice(0,5))md+=`- ${p.tgl}: ${p.teks.slice(0,400)}\n`;
md+=OV;md+=`\n## Permintaan\nEvaluasi laporan ini, cocokkan dengan postingan @eliz883 di atas, lalu buatkan full coding perbaikan (zip utuh siap commit lewat GitHub web UI). Prinsip: jangan ubah core.mjs/trade-sim.mjs selama forward test tanpa memulai protokol baru; jujur soal sampel kecil dan rezim pasar. Unggah zip repo mesin terbaru bila perlu diverifikasi.\n`;
out.laporan=md;
let LG=[];if(!LOCAL){const r=await fetch(`https://${C.owner}.github.io/monitortn/laporan-log.json`);if(r.ok)LG=await r.json();else if(r.status!==404)throw new Error('laporan-log.json HTTP '+r.status+': build dihentikan agar riwayat tidak hilang')}
if(!LG.length||now-new Date(LG.at(-1).t).getTime()>=3*DAY)LG.push({id:out.updated.slice(0,16).replace(/[-:T]/g,''),t:out.updated,md});
LG=LG.slice(-3);out.log=LG;fs.mkdirSync('site',{recursive:true});fs.writeFileSync('site/laporan-log.json',JSON.stringify(LG));
fs.mkdirSync('site',{recursive:true});fs.copyFileSync('index.html','site/index.html');fs.writeFileSync('site/data.json',JSON.stringify(out));fs.writeFileSync('site/laporan.md',md);console.log('OK',out.engines.length,'mesin,',out.warnings.length,'warning')
