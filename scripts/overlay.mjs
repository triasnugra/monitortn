// Lapisan keputusan monitor. TIDAK mengubah mesin. Semua ambang = HIPOTESIS, diuji lewat audit.
import fs from 'node:fs';
const H=['https://data-api.binance.vision','https://api.binance.com'],DAY=864e5;
const STABLE=new Set(['USDC','FDUSD','TUSD','DAI','USDP','EUR','USD1','PYUSD','USDE','BUSD','USDS','USDT']);
export const TH={volRendah:.9,volEkstrem:6,trendTipis:.015,maxJarakPct:5,minKoin:15};
async function bj(p){let e;for(const h of H){try{const r=await fetch(h+'/api/v3/'+p,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json()}catch(x){e=x}}throw e}
const kl=async(s,iv,n)=>(await bj(`klines?symbol=${s}&interval=${iv}&limit=${n}`)).map(a=>({t:a[0],h:+a[2],l:+a[3],c:+a[4],v:+a[5]}));
const ema=(a,n)=>{const k=2/(n+1);let e=a[0];return a.map(v=>e=v*k+e*(1-k))};
const med=a=>{const s=a.filter(Number.isFinite).sort((x,y)=>x-y),n=s.length;return n?(n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2):null};

// Volume altcoin: per koin, rata-rata 7 hari terakhir dibagi MEDIAN 60 hari sebelumnya; lalu median lintas 30 koin.
// Median dipakai karena rata-rata 30 hari mudah terdongkrak satu lonjakan (akar masalah sebelumnya).
async function breadth(){
 const t=(await bj('ticker/24hr')).filter(x=>x.symbol.endsWith('USDT')&&!STABLE.has(x.symbol.slice(0,-4))).sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,30);
 const rs=[];
 for(let i=0;i<t.length;i+=6)await Promise.all(t.slice(i,i+6).map(async x=>{try{const k=(await kl(x.symbol,'1d',67)).slice(0,-1),qv=k.map(q=>q.v*q.c),base=med(qv.slice(0,-7)),last7=qv.slice(-7).reduce((a,b)=>a+b,0)/7;if(base>0)rs.push(last7/base)}catch{}}));
 return{n:rs.length,med:rs.length>=TH.minKoin?med(rs):null}}

// Rekonstruksi rasio volume harian ke belakang (21 hari) agar uji vs @eliz883 langsung terukur.
// Memakai 30 koin teratas SAAT INI (bias penyintas kecil); baris ditandai bf:true. Rumus sama dengan breadth().
async function volBackfill(days=21){
 const t=(await bj('ticker/24hr')).filter(x=>x.symbol.endsWith('USDT')&&!STABLE.has(x.symbol.slice(0,-4))).sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,30),S=[];
 for(let i=0;i<t.length;i+=6)await Promise.all(t.slice(i,i+6).map(async x=>{try{S.push(await kl(x.symbol,'1d',100))}catch{}}));
 const res=[],t0=Date.parse(new Date().toISOString().slice(0,10));
 for(let b=1;b<=days;b++){const D=t0-b*DAY,rs=[];
  for(const k of S){const c=k.filter(q=>q.t<D).slice(-66);if(c.length<66)continue;const qv=c.map(q=>q.v*q.c),base=med(qv.slice(0,-7)),l7=qv.slice(-7).reduce((a,x)=>a+x,0)/7;if(base>0)rs.push(l7/base)}
  if(rs.length>=TH.minKoin)res.push({d:new Date(D).toISOString().slice(0,10),vr:med(rs)})}
 return res}

async function regime(){
 const k=(await kl('BTCUSDT','1d',70)).slice(0,-1),c=k.map(q=>q.c),n=k.length,px=c[n-1];
 const e20=ema(c,20)[n-1],e50=ema(c,50)[n-1];
 const tr=k.slice(-14).map((q,i,a)=>Math.max(q.h-q.l,i?Math.abs(q.h-a[i-1].c):0)),atr=tr.reduce((x,y)=>x+y,0)/14/px*100;
 const ts=Math.abs(e20-e50)/px,range=(Math.max(...k.slice(-14).map(q=>q.h))-Math.min(...k.slice(-14).map(q=>q.l)))/px*100;
 const qv=k.map(q=>q.v*q.c),btcVr=qv.slice(-7).reduce((a,b)=>a+b,0)/7/med(qv.slice(0,-7));
 const br=await breadth();const fl=[];
 if(br.med!=null&&br.med<TH.volRendah)fl.push(`volume altcoin rendah (median 7 hari = ${br.med.toFixed(2)}x median 60 hari, ${br.n} koin)`);
 if(ts<TH.trendTipis||(px<Math.max(e20,e50)&&px>Math.min(e20,e50)))fl.push('tren tidak jelas (harga di antara EMA20 dan EMA50)');
 const st=fl.length>=2?'TIDAK TRADING':fl.length==1?'SELEKTIF':'NORMAL';
 return{status:st,flags:fl,volRatio:br.med,volN:br.n,btcVr,atrPct:atr,range14:range,trendStr:ts*100,btcTrend:px>e20&&e20>e50?1:px<e20&&e20<e50?-1:0,tunggu:atr>TH.volEkstrem?'Volatilitas ekstrem: jangan kejar harga, tunggu reda':null}}

async function eur(){const k=(await kl('EURUSDT','1d',6)).slice(0,-1),c=k.map(q=>q.c),n=c.length;const d1=(c[n-1]/c[n-2]-1)*100,d3=(c[n-1]/c[n-4]-1)*100;
 return{d1,d3,arah:d3>0.3?'menguat':d3<-0.3?'melemah':'datar',catatan:'EURUSDT (Binance) sebagai proksi EUR/USD. Informasi makro, BUKAN trigger.'}}

async function conf(r){const g=async iv=>(await kl(r.a+'USDT',iv,30)).slice(0,-1);const[a,b]=await Promise.all([g('4h'),g('12h')]);
 const s=r.d==='LONG'?1:-1,en=+r.en,sl=+r.sl,c4=a.at(-1).c,c12=b.at(-1).c;
 if(s==1?c12<sl:c12>sl)return['BATAL','close 12H melewati SL'];
 const held=a.slice(-8).some(q=>s==1?q.l<=en*1.003&&q.c>en:q.h>=en*.997&&q.c<en);
 if(s==1?c4>en:c4<en)return held?['SIAP','retest tertahan di 4H']:['TUNGGU','di sisi benar level, belum retest'];
 return['TUNGGU','tunggu close 4H '+(s==1?'di atas':'di bawah')+' entry']}

async function gapDiag(){const t=(await bj('ticker/24hr')).filter(x=>x.symbol.endsWith('USDT')).sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,40),bad=[];
 for(let i=0;i<t.length;i+=8)await Promise.all(t.slice(i,i+8).map(async x=>{try{const k=(await kl(x.symbol,'1d',130));for(let j=1;j<k.length;j++)if(k[j].t-k[j-1].t!==DAY){bad.push({s:x.symbol.slice(0,-4),gap:new Date(k[j].t).toISOString().slice(0,10)});return}}catch{}}));return{cek:t.length,gagal:bad}}

// Tag ringan dari teks @eliz883 (untuk dicocokkan, BUKAN untuk memicu keputusan)
export function tagEliz(t){const s=String(t).toLowerCase(),tg=[];
 if(/volume/.test(s)&&/(low|little|rendah|thin|weak|lack|pointless|without)/.test(s))tg.push('volume_rendah');
 if(/choppy|mess|pointless|no clear|unreliable|sideways|range-bound|directionless|no direction/.test(s))tg.push('choppy');
 return tg}

export async function overlay(out,C,RES,ALL){
 const today=new Date().toISOString().slice(0,10),cap=C.dailyCap||5;
 let reg=null,eu=null;
 try{reg=await regime()}catch(x){out.warnings.push({lvl:'kuning',e:'monitor',t:'Kondisi pasar tidak terambil: '+x.message,aksi:'Cek akses Binance dari Actions'})}
 try{eu=await eur()}catch{}
 out.regime=reg;out.eur=eu;
 const ez=out.eliz.lastPost?(Date.now()-new Date(out.eliz.lastPost))/DAY:null;out.elizAge=ez;

 // riwayat status pasar harian (agar bisa diuji terhadap postingan @eliz883 ke depan)
 let hist=[];
 if(!process.env.LOCAL_DIR){const r=await fetch(`https://${C.owner}.github.io/monitortn/regime-history.json`);if(r.ok)hist=await r.json();else if(r.status!==404)throw new Error('regime-history.json HTTP '+r.status+': build dihentikan agar riwayat tidak hilang')}
 if(reg)hist=hist.filter(h=>h.d!==today).concat({d:today,status:reg.status,vr:reg.volRatio,flags:reg.flags.length,t:new Date().toISOString()}).slice(-400);
 {const have=new Set(hist.map(h=>h.d)),miss=[...Array(21)].map((_,i)=>new Date(Date.now()-(i+1)*DAY).toISOString().slice(0,10)).filter(d=>!have.has(d));
  if(miss.length)try{for(const x of await volBackfill())if(!have.has(x.d))hist.push({d:x.d,status:null,vr:x.vr,flags:null,bf:true,t:new Date().toISOString()});hist=hist.sort((a,b)=>a.d<b.d?-1:1).slice(-400)}catch(x){out.warnings.push({lvl:'kuning',e:'monitor',t:'Rekonstruksi volume harian gagal: '+x.message,aksi:null})}}
 fs.mkdirSync('site',{recursive:true});fs.writeFileSync('site/regime-history.json',JSON.stringify(hist));

 // uji volume vs @eliz883
 let EZ=[];try{EZ=JSON.parse(fs.readFileSync('data/eliz-posts.json','utf8'))}catch{}
 const byDay=Object.fromEntries(hist.map(h=>[h.d,h]));
 const utcD=t=>{const x=String(t);if(x.length===10)return x;return new Date(/(Z|[+-]\d\d:\d\d)$/.test(x)?x:x+'+07:00').toISOString().slice(0,10)}; // tgl tanpa zona dianggap WIB
 const vrPosts=[...new Set(EZ.filter(p=>tagEliz(p.teks).includes('volume_rendah')).map(p=>utcD(p.tgl)))];
 const terukur=vrPosts.filter(d=>byDay[d]&&byDay[d].vr!=null).map(d=>({d,vr:byDay[d].vr,flag:byDay[d].vr<TH.volRendah,bf:!!byDay[d].bf}));
 const sb=hist.filter(h=>h.vr!=null).slice(-21).map(h=>h.vr);
 out.ujiEliz={postVolumeRendah:vrPosts.length,hariTerukur:terukur.length,cocok:terukur.filter(x=>x.flag).length,rinci:terukur,
  sebaran:sb.length?{n:sb.length,rendah:sb.filter(v=>v<TH.volRendah).length,min:Math.min(...sb),med:med(sb),max:Math.max(...sb)}:null,
  catatan:'Hari bertanda bf direkonstruksi dari kline (30 koin teratas saat ini). Tanggal postingan tanpa zona dianggap WIB lalu diubah ke hari UTC. Sampel kecil: jangan ubah ambang 0,9 sebelum puluhan hari terukur.'};

 // uji batas harian (hipotesis): sinyal ke-(cap+1) dst pada hari yang sama
 const rowsToday=ALL.filter(x=>x.d===today),lewat=rowsToday.filter(x=>x.rk>cap).length;
 const G={};for(const x of ALL){if(x.R==null)continue;const g=x.rk>cap?'lewat':'dalam';const s=G[g]??={n:0,tp:0,r:0};s.n++;if(x.h==='TP')s.tp++;s.r+=x.R}
 out.ujiHarian={cap,hariIni:rowsToday.length,lewatHariIni:lewat,grup:Object.entries(G).map(([g,s])=>({g:g==='lewat'?`lewat batas (sinyal ke-${cap+1} dst)`:`dalam batas (maks ${cap}/hari)`,n:s.n,tp:s.tp,r:s.r/s.n}))};
 if(lewat)out.warnings.push({lvl:'info',e:'monitor',t:`Hari ini ${lewat} sinyal melewati batas uji ${cap}/hari`,aksi:'Hanya label keputusan; mesin tidak diubah. Baca audit setelah data cukup'});
 if(reg&&reg.volRatio==null)out.warnings.push({lvl:'kuning',e:'pasar',t:'Volume altcoin tidak terukur (data koin kurang dari '+TH.minKoin+')',aksi:'Cek akses Binance dari Actions'});

 out.warnings.push({lvl:'info',e:'monitor',t:'Uji volume baru: median altcoin (bukan rata-rata BTC). Ambang 0,9 adalah hipotesis.',aksi:'Lihat "Uji volume vs @eliz883" di halaman sebelum mengubah ambang'});
 if(reg&&reg.status!=='NORMAL')out.warnings.push({lvl:reg.status==='TIDAK TRADING'?'merah':'kuning',e:'pasar',t:`Kondisi pasar ${reg.status}: ${reg.flags.join('; ')}`,aksi:'Sejalan dengan @eliz883: tidak harus trading tiap hari'});
 if(reg?.tunggu)out.warnings.push({lvl:'kuning',e:'pasar',t:reg.tunggu,aksi:null});
 if(eu&&eu.arah==='menguat')out.warnings.push({lvl:'info',e:'makro',t:`EUR/USD ${eu.arah} (${eu.d3.toFixed(2)}% 3 hari): hindari short BTC`,aksi:null});

 // keputusan per sinyal menunggu
 let old=[];if(!process.env.LOCAL_DIR){const r=await fetch(`https://${C.owner}.github.io/monitortn/decisions.json`);if(r.ok)old=await r.json();else if(r.status!==404)throw new Error('decisions.json HTTP '+r.status+': build dihentikan agar riwayat tidak hilang')}
 const seen=new Map(old.map(d=>[d.k,d])),today2=today,cache={};
 for(const e of out.engines)for(const r of e.pending){
  let kp='-',kn='';
  try{
   if(reg?.status==='TIDAK TRADING'){kp='HINDARI';kn='pasar tanpa volume/arah'}
   else{const c=cache[r.a+r.d+r.en]??=await conf(r);kp=c[0];kn=c[1];if(r.dist!=null&&Math.abs(r.dist)>TH.maxJarakPct&&kp==='SIAP'){kp='TUNGGU';kn='harga >'+TH.maxJarakPct+'% dari entry'}}
   if(r.a==='BTC'&&r.d==='SHORT'&&eu?.arah==='menguat')kn+=' | EUR/USD menguat: hati-hati short BTC'
  }catch{kn='konfirmasi gagal diambil'}
  if(r.rk>cap){kp='LEWAT BATAS';kn=`sinyal ke-${r.rk} pada ${r.w} (batas uji ${cap}); hanya diuji`}
  r.kp=kp;r.kn=kn;
  const k=`${e.id}|${r.a}|${r.w}|${r.d}`;if(kp!=='-'&&!seen.has(k))seen.set(k,{k,t:new Date().toISOString(),kp,rg:reg?.status||'?',bf:r.w<today2})}
 const dec=[...seen.values()].slice(-3000),G2={};
 for(const d of dec){const x=RES[d.k];if(d.bf||!x||x.R==null)continue;const g=d.kp==='SIAP'?'SIAP':d.kp==='LEWAT BATAS'?'LEWAT BATAS':'LAINNYA';const s=G2[g]??={n:0,tp:0,r:0};s.n++;if(x.h==='TP')s.tp++;s.r+=x.R}
 out.audit={catatan:'Keputusan dicatat saat sinyal pertama kali terlihat (tanpa backfill). Baca hanya bila tiap grup >= 30.',grup:Object.entries(G2).map(([g,s])=>({g,n:s.n,tp:s.tp,r:s.r/s.n})),total:dec.length};
 out.gapDiag=null;try{out.gapDiag=await gapDiag();if(out.gapDiag.gagal.length)out.warnings.push({lvl:'kuning',e:'tnv2c2',t:`${out.gapDiag.gagal.length}/${out.gapDiag.cek} koin top volume punya candle harian bolong: ${out.gapDiag.gagal.map(x=>x.s).join(', ')}`,aksi:'Cek apakah ini saham tokenisasi; jika ya, pertimbangkan toleransi bolong di checkBars'})}catch{}
 fs.writeFileSync('site/decisions.json',JSON.stringify(dec));

 let m=`\n## Kondisi pasar objektif\n`+(reg?`- Status: ${reg.status}${reg.flags.length?' ('+reg.flags.join('; ')+')':''}\n- Volume altcoin (median 7 hari / median 60 hari, ${reg.volN} koin): ${reg.volRatio==null?'-':reg.volRatio.toFixed(2)+'x'}; BTC: ${reg.btcVr.toFixed(2)}x\n- ATR14 BTC ${reg.atrPct.toFixed(1)}%, range 14 hari ${reg.range14.toFixed(1)}%\n`:'- tidak tersedia\n')+(eu?`- EUR/USD ${eu.arah} (1 hari ${eu.d1.toFixed(2)}%, 3 hari ${eu.d3.toFixed(2)}%)\n`:'');
 m+=`\n## Uji batas harian (hipotesis, bukan aturan mesin)\nBatas uji ${cap}/hari. Hari ini ${rowsToday.length} sinyal, ${lewat} melewati batas.\n`+(out.ujiHarian.grup.map(g=>`- ${g.g}: n=${g.n}, TP=${g.tp}, R/trade ${g.r.toFixed(2)}`).join('\n')||'- belum ada data')+'\n';
 m+=`\n## Uji volume vs @eliz883\n- Postingan yang menyebut volume rendah: ${out.ujiEliz.postVolumeRendah}; hari terukur: ${out.ujiEliz.hariTerukur}; cocok: ${out.ujiEliz.cocok}\n${out.ujiEliz.rinci.map(x=>`- ${x.d}: volume ${x.vr.toFixed(2)}x, ${x.flag?'ditandai rendah':'TIDAK ditandai'}${x.bf?' (rekonstruksi)':''}\n`).join('')}${out.ujiEliz.sebaran?`- Sebaran 21 hari terakhir: ${out.ujiEliz.sebaran.n} hari, ${out.ujiEliz.sebaran.rendah} di bawah ${TH.volRendah}; min ${out.ujiEliz.sebaran.min.toFixed(2)}, median ${out.ujiEliz.sebaran.med.toFixed(2)}, maks ${out.ujiEliz.sebaran.max.toFixed(2)}\n`:''}- ${out.ujiEliz.catatan}\n`;
 m+=`\n## Keputusan monitor untuk sinyal menunggu\n`;
 for(const e of out.engines)for(const r of e.pending)m+=`- ${e.id} ${r.a} ${r.d} entry ${r.en}: ${r.kp} ${r.kn}\n`;
 m+=`\n## Audit lapisan keputusan\n${out.audit.grup.map(g=>`- ${g.g}: n=${g.n}, TP=${g.tp}, R/trade ${g.r.toFixed(2)}`).join('\n')||'- belum ada sinyal selesai'}\n`;
 if(ez!=null&&ez>3)m=`\n> PENGINGAT: postingan @eliz883 terakhir di monitor ${ez.toFixed(0)} hari lalu. Lampirkan postingan terbaru di chat.\n`+m;
 return m}