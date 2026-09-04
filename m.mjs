import postgres from 'postgres'; import bcrypt from 'bcryptjs'; import { chromium } from 'playwright';
const BASE='http://localhost:3001', EMAIL='zz-perf@example.invalid', PW='perf-check-1';
const sql=postgres(process.env.DATABASE_URL,{max:3,prepare:false,idle_timeout:8});
const cleanup=async()=>{ for(const u of await sql`select id from ld_erp_core.users where email=${EMAIL}`){
    await sql`delete from ld_erp_core.system_access where user_id=${u.id}`;
    await sql`delete from ld_erp_core.audit_logs where user_id=${u.id}`;
    await sql`delete from ld_erp_core.users where id=${u.id}`; }
  await sql`delete from ld_order_entry.users where email=${EMAIL}`; };
try{
  await cleanup();
  const [u]=await sql`insert into ld_erp_core.users (name,email,status,role,password_hash,password_set_at)
    values ('ZZ Perf',${EMAIL},'active','admin',${await bcrypt.hash(PW,10)},now()) returning id`;
  for (const s of await sql`select id from ld_erp_core.systems`)
    await sql`insert into ld_erp_core.system_access (user_id,system_id,can_view) values (${u.id},${s.id},true) on conflict do nothing`;
  await sql`insert into ld_order_entry.users (email,name,role,is_active) values (${EMAIL},'ZZ Perf','ADMIN',true)`;
  const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1440,height:900}});
  const p=await ctx.newPage();
  await p.goto(`${BASE}/login`,{waitUntil:'domcontentloaded'});
  await p.click('summary:has-text("Sign in with email")'); await p.waitForTimeout(300);
  await p.fill('#auth-email',EMAIL); await p.fill('#auth-password',PW);
  await Promise.all([p.waitForURL(x=>!x.pathname.startsWith('/login'),{timeout:25000}).catch(()=>{}),
                     p.click('button[type=submit]:has-text("Sign in")')]);
  await p.waitForTimeout(1500);

  // SERVER time for the HTML document = what every page load pays before
  // anything renders. Measured in-page so it excludes browser paint.
  console.log('PRODUCTION MODE, warm, local — server time for the page document\n');
  console.log('route                            server ms');
  for (const r of ['/','/order-entry','/order-entry/orders','/order-entry/order-status','/crm','/help-slip','/settings']) {
    const ms = await p.evaluate(async (u)=>{
      await fetch(u).then(x=>x.text());                       // warm
      const o=[];
      for (let i=0;i<5;i++){ const s=performance.now();
        const res=await fetch(u,{cache:'no-store'}); await res.text(); o.push(performance.now()-s); }
      return o.sort((a,b)=>a-b)[2];
    }, r);
    console.log(`${r.padEnd(32)} ${ms.toFixed(0).padStart(6)}ms`);
  }
  await b.close();
} finally { await cleanup();
  console.log('\ncleanup ok:',(await sql`select 1 from ld_erp_core.users where email=${EMAIL}`).length===0);
  await sql.end(); }
