import type { AuthContext } from '../types';
import { json } from '../http';

const DEFINITIONS: Record<string,{name:string;phase:string}> = {
 'R-01':{name:'Sales by Period',phase:'P1'},'R-02':{name:'Orders by Status',phase:'P1'},
 'R-03':{name:'Stock on Hand',phase:'P1'},'R-04':{name:'Stock Movement',phase:'P1'},
 'R-05':{name:'Low Stock',phase:'P1'},'R-06':{name:'Adjustments',phase:'P1'},
 'R-07':{name:'Inventory Valuation',phase:'P2'},'R-08':{name:'Purchase Orders & Receiving',phase:'P2'},
 'R-09':{name:'Returns & Dispositions',phase:'P2'},'R-10':{name:'3PL Client Activity',phase:'P3'},
 'R-11':{name:'Storage Billing',phase:'P3'},'R-12':{name:'Receivables & Payables Ageing',phase:'P4'},
 'R-13':{name:'Profitability',phase:'P4'},'R-14':{name:'Reconciliation',phase:'P4'},
};
const money = (n:number,currency='GBP') => new Intl.NumberFormat('en-GB',{style:'currency',currency}).format((Number(n)||0)/100);
const csv = (value:unknown) => '"' + String(value ?? '').replace(/"/g,'""') + '"';
async function rows(auth:AuthContext, table:string, columns:string, dateColumn?:string, url?:URL) {
 let query:any = auth.repositoryContext.supabase.from(table).select(columns).eq('organization_id',auth.organizationId);
 if(dateColumn&&url?.searchParams.get('startDate')) query=query.gte(dateColumn,url.searchParams.get('startDate')!);
 if(dateColumn&&url?.searchParams.get('endDate')) query=query.lte(dateColumn,url.searchParams.get('endDate')!);
 const {data,error}=await query.limit(5000);
 if(error) throw new Error(`Report source ${table} could not be read.`);
 return data||[];
}
const result=(id:string,summary:Record<string,unknown>,columns:string[],data:Record<string,unknown>[])=>({id,name:DEFINITIONS[id].name,phase:DEFINITIONS[id].phase,summary,columns,data});

async function getDataEnvironment(auth: AuthContext, accountId: string | null): Promise<'DEMO' | 'SANDBOX' | 'PRODUCTION'> {
 if (!accountId || accountId === 'ALL') return 'SANDBOX';
 const { data, error } = await auth.repositoryContext.supabase.from('marketplace_accounts')
  .select('id,is_demo,environment').eq('id', accountId).eq('organization_id', auth.organizationId).maybeSingle();
 if (error) throw new Error('The selected marketplace account could not be verified.');
 if (!data) throw new Error('The selected marketplace account was not found in this workspace.');
 if (data.is_demo) return 'DEMO';
 return data.environment === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';
}

export async function handleReportRoute(path:string,request:Request,url:URL,auth:AuthContext):Promise<Response|null>{
 const match=path.match(/^\/reports\/(R-\d{2})$/);
 if(!match||request.method!=='GET') return null;
 const id=match[1];
 if(!DEFINITIONS[id]) return json({error:'Report not found.'},404);
 const accountId=url.searchParams.get('accountId');
 const dataEnvironment = await getDataEnvironment(auth, accountId);
 const skuFilter=url.searchParams.get('sku')?.trim().toUpperCase();
 let report:any;

 if(id==='R-01'||id==='R-02'){
  let orders=await rows(auth,'orders','id,order_number,status,total_minor,currency,created_at,marketplace_account_id,data_environment','created_at',url);
  orders=orders.filter((x:any)=>x.data_environment===dataEnvironment);
  if(accountId&&accountId!=='ALL')orders=orders.filter((x:any)=>x.marketplace_account_id===accountId);
  if(id==='R-01'){
   const data=orders.map((x:any)=>({date:String(x.created_at).slice(0,10),order:x.order_number,status:x.status,revenue:money(x.total_minor,x.currency||'GBP'),account:x.marketplace_account_id||'Manual'}));
   report=result(id,{orders:orders.length,revenue:money(orders.reduce((s:number,x:any)=>s+Number(x.total_minor||0),0))},['Date','Order','Status','Revenue','Account'],data);
  }else{
   const grouped=new Map<string,{orders:number;value:number}>();
   for(const x of orders){const k=String(x.status||'UNKNOWN');const g=grouped.get(k)||{orders:0,value:0};g.orders++;g.value+=Number(x.total_minor||0);grouped.set(k,g);}
   const data=[...grouped].map(([status,v])=>({status,orders:v.orders,grossValue:money(v.value)}));
   report=result(id,{orders:orders.length,statuses:grouped.size},['Status','Orders','Gross Value'],data);
  }
 }else if(['R-03','R-05','R-07'].includes(id)){
  let [products,ledger]=await Promise.all([rows(auth,'products','id,sku,name,owner_type,client_3pl_id,cost_price_minor,low_stock_threshold,reorder_level,data_environment'),rows(auth,'stock_ledger','product_id,quantity_delta,stock_state')]);
  const balances=new Map<string,any>();
  if(accountId&&accountId!=='ALL'){
   const {data:allocations,error}=await auth.repositoryContext.supabase.from('marketplace_inventory_allocations')
    .select('product_id,allocated_quantity,reserved_quantity').eq('organization_id',auth.organizationId).eq('marketplace_account_id',accountId);
   if(error)throw new Error('Store inventory allocations could not be loaded.');
   const ids=[...new Set((allocations||[]).map((x:any)=>x.product_id))];
   products=products.filter((p:any)=>ids.includes(p.id));
   for(const p of products){balances.set(p.id,{product:p,onHand:0,reserved:0,incoming:0,damaged:0,quarantined:0,missing:0});}
   for(const a of allocations||[]){const b=balances.get(a.product_id);if(!b)continue;b.onHand=Number(a.allocated_quantity||0);b.reserved=Number(a.reserved_quantity||0);}
  }else{
   for(const p of products){balances.set(p.id,{product:p,onHand:0,reserved:0,incoming:0,damaged:0,quarantined:0,missing:0});}
   for(const l of ledger){const b=balances.get(l.product_id);if(!b)continue;const state=String(l.stock_state).toLowerCase();if(state==='on_hand')b.onHand+=Number(l.quantity_delta);else if(state==='reserved')b.reserved+=Number(l.quantity_delta);else if(state==='incoming')b.incoming+=Number(l.quantity_delta);else if(state==='damaged')b.damaged+=Number(l.quantity_delta);else if(state==='quarantined')b.quarantined+=Number(l.quantity_delta);else if(state==='missing')b.missing+=Number(l.quantity_delta);}
  }
  let items=[...balances.values()].filter((x:any)=>x.product.data_environment===dataEnvironment);
  if(skuFilter)items=items.filter(x=>String(x.product.sku).toUpperCase().includes(skuFilter));
  const data=items.map(x=>{const p=x.product,available=Math.max(0,x.onHand-x.reserved),value=x.onHand*Number(p.cost_price_minor||0);return {sku:p.sku,product:p.name,owner:p.owner_type,onHand:x.onHand,reserved:x.reserved,available,incoming:x.incoming,damaged:x.damaged,quarantined:x.quarantined,reorderLevel:p.reorder_level,unitCost:money(p.cost_price_minor),inventoryValue:money(value),status:available<=Number(p.reorder_level||0)?'LOW_STOCK':'HEALTHY'};});
  if(id==='R-03')report=result(id,{skus:data.length,units:data.reduce((s,x)=>s+Number(x.onHand),0)},['SKU','Product','Owner','On Hand','Reserved','Available','Incoming','Damaged','Quarantined','Reorder Level','Unit Cost','Inventory Value','Status'],data);
  if(id==='R-05'){const low=data.filter(x=>Number(x.available)<=Number(x.reorderLevel));report=result(id,{lowStockSkus:low.length},['SKU','Product','Available','Reorder Level','Status'],low.map(x=>({sku:x.sku,product:x.product,available:x.available,reorderLevel:x.reorderLevel,status:x.status})));}
  if(id==='R-07')report=result(id,{inventoryValue:money(data.reduce((s,x)=>s+Number(String(x.inventoryValue).replace(/[^0-9.-]/g,''))*100,0)),skus:data.length},['SKU','Product','On Hand','Unit Cost','Inventory Value'],data.map(x=>({sku:x.sku,product:x.product,onHand:x.onHand,unitCost:x.unitCost,inventoryValue:x.inventoryValue})));
 }else if(id==='R-04'){
  let [ledger,products]=await Promise.all([rows(auth,'stock_ledger','id,product_id,location_id,quantity_delta,stock_state,source_type,source_id,note,created_at,marketplace_account_id,data_environment','created_at',url),rows(auth,'products','id,sku,name,data_environment')]);
  ledger=ledger.filter((x:any)=>x.data_environment===dataEnvironment);
  if(accountId&&accountId!=='ALL')ledger=ledger.filter((x:any)=>x.marketplace_account_id===accountId);
  products=products.filter((x:any)=>x.data_environment===dataEnvironment);
  const pmap=new Map<string, any>(products.map((x:any)=>[String(x.id),x] as [string, any]));
  const data=ledger.map((x:any)=>({timestamp:x.created_at,sku:pmap.get(x.product_id)?.sku||'—',product:pmap.get(x.product_id)?.name||'—',delta:x.quantity_delta,state:x.stock_state,source:x.source_type,reference:x.source_id||'—',note:x.note||''}));
  report=result(id,{movements:data.length},['Timestamp','SKU','Product','Delta','State','Source','Reference','Note'],data);
 }else if(id==='R-06'){
  let [adjustments,products]=await Promise.all([rows(auth,'stock_adjustments','id,adjustment_number,product_id,quantity_delta,reason_code,status,note,created_at,data_environment','created_at',url),rows(auth,'products','id,sku,data_environment')]);
  products=products.filter((x:any)=>x.data_environment===dataEnvironment);
  const visibleProductIds=new Set(products.map((x:any)=>x.id));
  adjustments=adjustments.filter((x:any)=>x.data_environment===dataEnvironment && visibleProductIds.has(x.product_id));
  const pmap=new Map<string, string>(products.map((x:any)=>[String(x.id),String(x.sku)] as [string,string]));
  const data=adjustments.map((x:any)=>({adjustment:x.adjustment_number,sku:pmap.get(x.product_id)||'—',delta:x.quantity_delta,reason:x.reason_code,status:x.status,note:x.note||'',date:x.created_at}));
  report=result(id,{adjustments:data.length,pending:data.filter((x:any)=>x.status==='PENDING_APPROVAL').length},['Adjustment','SKU','Delta','Reason','Status','Note','Date'],data);
 }else if(id==='R-08'){
  let [pos,suppliers,items]=await Promise.all([rows(auth,'purchase_orders','id,po_number,supplier_id,status,total_minor,expected_date,created_at,data_environment','created_at',url),rows(auth,'suppliers','id,name,data_environment'),rows(auth,'purchase_order_items','purchase_order_id,ordered_qty,received_qty')]);
  pos=pos.filter((x:any)=>x.data_environment===dataEnvironment);
  const visiblePoIds=new Set(pos.map((x:any)=>x.id));
  suppliers=suppliers.filter((x:any)=>x.data_environment===dataEnvironment);
  items=items.filter((x:any)=>visiblePoIds.has(x.purchase_order_id));
  const smap=new Map<string, string>(suppliers.map((x:any)=>[String(x.id),String(x.name)] as [string,string]));
  const data=pos.map((p:any)=>{const lines=items.filter((x:any)=>x.purchase_order_id===p.id);return {po:p.po_number,supplier:smap.get(p.supplier_id)||'—',status:p.status,ordered:lines.reduce((s:number,x:any)=>s+Number(x.ordered_qty),0),received:lines.reduce((s:number,x:any)=>s+Number(x.received_qty),0),total:money(p.total_minor),expected:p.expected_date||'—'};});
  report=result(id,{purchaseOrders:data.length,totalValue:money(pos.reduce((s:number,x:any)=>s+Number(x.total_minor||0),0))},['PO','Supplier','Status','Ordered Units','Received Units','Total','Expected Date'],data);
 }else if(id==='R-09'){
  let [returns,items,orders]=await Promise.all([rows(auth,'returns','id,return_number,order_id,reason_code,status,refund_amount_minor,refund_status,created_at,data_environment','created_at',url),rows(auth,'return_items','return_id,sku,quantity,disposition'),rows(auth,'orders','id,marketplace_account_id,data_environment')]);
  returns=returns.filter((x:any)=>x.data_environment===dataEnvironment);
  if(accountId&&accountId!=='ALL'){
   const visibleOrderIds=new Set(orders.filter((x:any)=>x.marketplace_account_id===accountId).map((x:any)=>x.id));
   returns=returns.filter((x:any)=>visibleOrderIds.has(x.order_id));
  }
  const visibleReturnIds=new Set(returns.map((x:any)=>x.id));
  items=items.filter((x:any)=>visibleReturnIds.has(x.return_id));
  const data=returns.map((x:any)=>({return:x.return_number,order:x.order_id,reason:x.reason_code,status:x.status,refund:money(x.refund_amount_minor),refundStatus:x.refund_status,items:items.filter((i:any)=>i.return_id===x.id).map((i:any)=>i.sku+' × '+i.quantity+' ('+(i.disposition||'—')+')').join('; ')}));
  report=result(id,{returns:data.length,refundValue:money(returns.reduce((s:number,x:any)=>s+Number(x.refund_amount_minor||0),0))},['Return','Order ID','Reason','Status','Refund','Refund Status','Items'],data);
 }else if(id==='R-10'){
  let [clients,packaging,shipping,orders]=await Promise.all([rows(auth,'clients_3pl','id,company_name,code,data_environment'),rows(auth,'packaging_jobs','client_3pl_id,quantity,total_charge_minor,data_environment'),rows(auth,'shipping_jobs','client_3pl_id,total_charge_minor,data_environment'),rows(auth,'orders','client_3pl_id,id,data_environment')]);
  clients=clients.filter((x:any)=>x.data_environment===dataEnvironment);
  const visibleClientIds=new Set(clients.map((x:any)=>x.id));
  packaging=packaging.filter((x:any)=>x.data_environment===dataEnvironment && visibleClientIds.has(x.client_3pl_id));
  shipping=shipping.filter((x:any)=>x.data_environment===dataEnvironment && visibleClientIds.has(x.client_3pl_id));
  orders=orders.filter((x:any)=>x.data_environment===dataEnvironment && visibleClientIds.has(x.client_3pl_id));
  const data=clients.map((c:any)=>{const p=packaging.filter((x:any)=>x.client_3pl_id===c.id),s=shipping.filter((x:any)=>x.client_3pl_id===c.id);return {client:c.company_name,code:c.code,orders:orders.filter((x:any)=>x.client_3pl_id===c.id).length,packagingJobs:p.length,packedUnits:p.reduce((n:number,x:any)=>n+Number(x.quantity||0),0),shippingJobs:s.length,serviceCharges:money([...p,...s].reduce((n:number,x:any)=>n+Number(x.total_charge_minor||0),0))};});
  report=result(id,{clients:data.length,serviceCharges:money([...packaging,...shipping].reduce((n:number,x:any)=>n+Number(x.total_charge_minor||0),0))},['Client','Code','Orders','Packaging Jobs','Packed Units','Shipping Jobs','Service Charges'],data);
 }else if(id==='R-11'){
  let [snapshots,clients]=await Promise.all([rows(auth,'storage_snapshots','client_3pl_id,snapshot_date,occupied_pallets,occupied_shelves,occupied_bins,estimated_cost_minor,data_environment','snapshot_date',url),rows(auth,'clients_3pl','id,company_name,data_environment')]);
  clients=clients.filter((x:any)=>x.data_environment===dataEnvironment);
  const visibleClientIds=new Set(clients.map((x:any)=>x.id));
  snapshots=snapshots.filter((x:any)=>x.data_environment===dataEnvironment && visibleClientIds.has(x.client_3pl_id));
  const cmap=new Map<string, string>(clients.map((x:any)=>[String(x.id),String(x.company_name)] as [string,string]));
  const data=snapshots.map((x:any)=>({client:cmap.get(x.client_3pl_id)||'—',date:x.snapshot_date,pallets:x.occupied_pallets,shelves:x.occupied_shelves,bins:x.occupied_bins,estimatedCost:money(x.estimated_cost_minor)}));
  report=result(id,{snapshots:data.length,estimatedCost:money(snapshots.reduce((n:number,x:any)=>n+Number(x.estimated_cost_minor||0),0))},['Client','Snapshot Date','Pallets','Shelves','Bins','Estimated Cost'],data);
 }else if(id==='R-12'){
  let [invoices,pos]=await Promise.all([rows(auth,'invoices','id,invoice_number,recipient_name,total_minor,paid_amount_minor,due_date,status,data_environment'),rows(auth,'purchase_orders','po_number,supplier_id,total_minor,expected_date,status,data_environment')]);
  pos=pos.filter((x:any)=>x.data_environment===dataEnvironment);
  invoices=invoices.filter((x:any)=>x.data_environment===dataEnvironment);
  if(accountId&&accountId!=='ALL'){
   const {data:allocations,error}=await auth.repositoryContext.supabase.from('marketplace_finance_allocations')
    .select('source_id,amount_minor').eq('organization_id',auth.organizationId).eq('marketplace_account_id',accountId).eq('source_type','INVOICE');
   if(error)throw new Error('Store invoice allocations could not be loaded.');
   const amountById=new Map((allocations||[]).map((a:any)=>[a.source_id,Number(a.amount_minor)]));
   invoices=invoices.filter((x:any)=>amountById.has(x.id)).map((x:any)=>({...x,total_minor:Math.min(Number(x.total_minor||0),amountById.get(x.id)||0)}));
  }
  const data=[...invoices.map((x:any)=>({type:'Receivable',reference:x.invoice_number,party:x.recipient_name,balance:money(Math.max(0,Number(x.total_minor)-Number(x.paid_amount_minor||0))),dueDate:x.due_date||'—',status:x.status})),...pos.map((x:any)=>({type:'Purchase commitment',reference:x.po_number,party:x.supplier_id,balance:money(x.total_minor),dueDate:x.expected_date||'—',status:x.status}))];
  report=result(id,{receivables:invoices.length,payables:pos.length},['Type','Reference','Party','Balance','Due Date','Status'],data);
 }else if(id==='R-13'){
  let [orders,items,products,expenses]=await Promise.all([rows(auth,'orders','id,order_number,total_minor,currency,shipping_cost_minor,created_at,marketplace_account_id,data_environment','created_at',url),rows(auth,'order_items','order_id,product_id,quantity,data_environment'),rows(auth,'products','id,cost_price_minor,sku,data_environment'),rows(auth,'expenses','id,category,amount_minor,expense_date,data_environment','expense_date',url)]);
  products=products.filter((x:any)=>x.data_environment===dataEnvironment);
  expenses=expenses.filter((x:any)=>x.data_environment===dataEnvironment);
  orders=orders.filter((x:any)=>x.data_environment===dataEnvironment);
  let allocatedExpenseTotal=0;
  if(accountId&&accountId!=='ALL'){
   orders=orders.filter((o:any)=>o.marketplace_account_id===accountId);
   const {data:allocations,error}=await auth.repositoryContext.supabase.from('marketplace_finance_allocations')
    .select('source_id,amount_minor').eq('organization_id',auth.organizationId).eq('marketplace_account_id',accountId).eq('source_type','EXPENSE');
   if(error)throw new Error('Store expense allocations could not be loaded.');
   const amountById=new Map((allocations||[]).map((a:any)=>[a.source_id,Number(a.amount_minor)]));
   expenses=expenses.filter((e:any)=>amountById.has(e.id));
   allocatedExpenseTotal=expenses.reduce((s:number,e:any)=>s+Math.min(Number(e.amount_minor||0),amountById.get(e.id)||0),0);
  }else{
   allocatedExpenseTotal=expenses.reduce((s:number,e:any)=>s+Number(e.amount_minor||0),0);
  }
  const pmap=new Map<string, any>(products.map((x:any)=>[String(x.id),x] as [string, any]));
  const data=orders.map((o:any)=>{const lines=items.filter((x:any)=>x.order_id===o.id);const cogs=lines.reduce((s:number,l:any)=>s+Number(l.quantity||0)*Number(pmap.get(l.product_id)?.cost_price_minor||0),0);const shipping=Number(o.shipping_cost_minor||0);const fees=0;return {order:o.order_number,revenue:money(o.total_minor,o.currency||'GBP'),cogs:money(cogs,o.currency||'GBP'),fees:money(fees,o.currency||'GBP'),shipping:money(shipping,o.currency||'GBP'),grossProfit:money(Number(o.total_minor)-cogs-fees-shipping,o.currency||'GBP')};});
  report=result(id,{orders:data.length,revenue:money(orders.reduce((s:number,x:any)=>s+Number(x.total_minor||0),0)),expenses:money(allocatedExpenseTotal)},['Order','Revenue','COGS','Marketplace Fee','Postage Cost','Gross Profit'],data);
 }else if(id==='R-14'){
  let [lines,accounts,entries,recs]=await Promise.all([rows(auth,'journal_entry_lines','journal_entry_id,account_id,debit_minor,credit_minor,data_environment'),rows(auth,'chart_of_accounts','id,account_code,account_name'),rows(auth,'journal_entries','id,entry_number,entry_date,source_type,status,data_environment'),rows(auth,'financial_reconciliations','period,status,difference_minor,last_reconciled_at,marketplace_account_id,data_environment')]);
  entries=entries.filter((x:any)=>x.data_environment===dataEnvironment);
  recs=recs.filter((x:any)=>x.data_environment===dataEnvironment);
  const visibleEntryIds=new Set(entries.map((x:any)=>x.id));
  lines=lines.filter((x:any)=>x.data_environment===dataEnvironment && visibleEntryIds.has(x.journal_entry_id));
  if(accountId&&accountId!=='ALL'){
   const {data:allocations,error}=await auth.repositoryContext.supabase.from('marketplace_finance_allocations')
    .select('source_id').eq('organization_id',auth.organizationId).eq('marketplace_account_id',accountId).eq('source_type','JOURNAL_ENTRY');
   if(error)throw new Error('Store journal allocations could not be loaded.');
   const entryIds=new Set((allocations||[]).map((x:any)=>x.source_id));
   entries=entries.filter((x:any)=>entryIds.has(x.id));
   lines=lines.filter((x:any)=>entryIds.has(x.journal_entry_id));
   recs=recs.filter((x:any)=>x.marketplace_account_id===accountId);
  }
  const data=accounts.map((a:any)=>{const own=lines.filter((x:any)=>x.account_id===a.id);return {account:a.account_code+' '+a.account_name,debits:money(own.reduce((s:number,x:any)=>s+Number(x.debit_minor||0),0)),credits:money(own.reduce((s:number,x:any)=>s+Number(x.credit_minor||0),0))};});
  const debit=lines.reduce((s:number,x:any)=>s+Number(x.debit_minor||0),0),credit=lines.reduce((s:number,x:any)=>s+Number(x.credit_minor||0),0);
  report=result(id,{journalEntries:entries.length,totalDebits:money(debit),totalCredits:money(credit),variance:money(debit-credit),reconciliations:recs.length},['Account','Debits','Credits'],data);
  report.reconciliations=recs;
 }
 if(url.searchParams.get('format')==='csv'){
  if(!auth.permissions.has('*')&&!auth.permissions.has('reports.export')) return json({error:'You do not have permission to export reports.'},403);
  const body=[report.columns.map(csv).join(','),...report.data.map((row:any)=>Object.values(row).map(csv).join(','))].join('\n');
  return new Response(body,{status:200,headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${id}.csv"`,'Cache-Control':'no-store'}});
 }
 return json(report);
}
