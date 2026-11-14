import type { AuthContext } from '../types';
import { json } from '../http';

const COLUMNS = 'id,organization_id,product_id,sku,product_name,supplier_name,purchase_cost_minor,supplier_cost_minor,shipping_cost_minor,packaging_cost_minor,additional_expenses_minor,selling_price_minor,marketplace_fee_percent,marketplace_fee_minor,other_costs_minor,shipping_option,shipping_charged_to_customer_minor,total_cost_minor,gross_profit_minor,margin_percent,net_profit_minor,currency,updated_by,updated_at';

const mapCalculation = (row: any) => ({
  id: row.id, sku: row.sku, productName: row.product_name, supplierName: row.supplier_name,
  purchaseCostMinor: Number(row.purchase_cost_minor || 0), supplierCostMinor: Number(row.supplier_cost_minor || 0),
  shippingCostMinor: Number(row.shipping_cost_minor || 0), packagingCostMinor: Number(row.packaging_cost_minor || 0),
  additionalExpensesMinor: Number(row.additional_expenses_minor || 0), sellingPriceMinor: Number(row.selling_price_minor || 0),
  marketplaceFeePercent: Number(row.marketplace_fee_percent || 0), marketplaceFeeMinor: Number(row.marketplace_fee_minor || 0),
  otherCostsMinor: Number(row.other_costs_minor || 0), shippingOption: row.shipping_option,
  shippingChargedToCustomerMinor: Number(row.shipping_charged_to_customer_minor || 0),
  totalCostMinor: Number(row.total_cost_minor || 0), grossProfitMinor: Number(row.gross_profit_minor || 0),
  marginPercent: Number(row.margin_percent || 0), netProfitMinor: Number(row.net_profit_minor || 0),
  currency: row.currency, updatedBy: row.updated_by || '', updatedAt: row.updated_at,
});

export async function handleDropshippingRoute(path: string, request: Request, auth: AuthContext): Promise<Response | null> {
  if (path === '/dropshipping/calculations' && request.method === 'GET') {
    const { data, error } = await auth.repositoryContext.supabase.from('dropshipping_calculations')
      .select(COLUMNS).eq('organization_id', auth.organizationId)
      .order('updated_at', { ascending: false }).limit(500);
    if (error) throw new Error('Dropshipping calculations could not be loaded.');
    return json({ calculations: (data || []).map(mapCalculation) });
  }

  if (path === '/dropshipping/calculations' && request.method === 'POST') {
    if (auth.user.role === 'CLIENT_USER') return json({ error: 'Client users cannot save workspace simulations.' }, 403);
    const body = await request.json() as Record<string, unknown>;
    const sku = String(body.sku || '').trim().toUpperCase();
    const productName = String(body.productName || '').trim();
    const supplierName = String(body.supplierName || '').trim();
    const currency = String(body.currency || 'GBP').toUpperCase();
    const option = body.shippingOption === 'SHIPPING_EXCLUDED' ? 'SHIPPING_EXCLUDED' : 'SHIPPING_INCLUDED';
    const amount = (key: string) => {
      const value = Number(body[key] ?? 0);
      if (!Number.isFinite(value) || value < 0 || value > 100000000000) throw new Error(`Invalid ${key} amount.`);
      return Math.round(value);
    };
    if (!sku || !productName || !supplierName) throw new Error('SKU, product name and supplier are required.');
    if (!['GBP', 'USD', 'EUR'].includes(currency)) throw new Error('Choose a supported currency.');
    const purchase = amount('purchaseCostMinor');
    const shipping = amount('shippingCostMinor');
    const packaging = amount('packagingCostMinor');
    const additional = amount('additionalExpensesMinor');
    const selling = amount('sellingPriceMinor');
    const customerShipping = amount('shippingChargedToCustomerMinor');
    const other = amount('otherCostsMinor');
    const feePercent = Number(body.marketplaceFeePercent ?? 0);
    if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100) throw new Error('Marketplace fee percentage must be between 0 and 100.');
    const totalCost = option === 'SHIPPING_INCLUDED' ? purchase + shipping + packaging + additional : purchase + packaging + additional;
    const revenue = option === 'SHIPPING_INCLUDED' ? selling : selling + customerShipping;
    const grossProfit = option === 'SHIPPING_INCLUDED' ? selling - totalCost : revenue - (totalCost + shipping);
    const feeMinor = Math.round(revenue * feePercent / 100);
    const netProfit = grossProfit - feeMinor - other;
    const marginPercent = revenue > 0 ? Number((grossProfit / revenue * 100).toFixed(2)) : 0;
    const { data: product, error: productError } = await auth.repositoryContext.supabase.from('products')
      .select('id').eq('organization_id', auth.organizationId).eq('sku', sku).maybeSingle();
    if (productError) throw new Error('Product reference could not be verified.');
    const { data, error } = await auth.repositoryContext.supabase.from('dropshipping_calculations').insert({
      organization_id: auth.organizationId, product_id: product?.id || null, sku, product_name: productName,
      supplier_name: supplierName, purchase_cost_minor: purchase, supplier_cost_minor: purchase,
      shipping_cost_minor: shipping, packaging_cost_minor: packaging, additional_expenses_minor: additional,
      selling_price_minor: selling, marketplace_fee_percent: feePercent, marketplace_fee_minor: feeMinor,
      other_costs_minor: other, shipping_option: option, shipping_charged_to_customer_minor: customerShipping,
      total_cost_minor: totalCost, gross_profit_minor: grossProfit, margin_percent: marginPercent,
      net_profit_minor: netProfit, currency, updated_by: auth.user.id,
    }).select(COLUMNS).single();
    if (error) throw new Error('Dropshipping calculation could not be saved.');
    return json({ calculation: mapCalculation(data) }, 201);
  }
  return null;
}
