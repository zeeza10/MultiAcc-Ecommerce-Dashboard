export type EbayOrderLineException = {
  referenceId: string;
  details: string;
  rawPayload: Record<string, unknown>;
};

export type NormalizedEbayOrderLine = {
  product_id: string | null;
  sku: string;
  product_name: string;
  quantity: number;
  unit_price_minor: number;
  tax_amount_minor: number;
  total_price_minor: number;
  raw_item: Record<string, unknown>;
};

export function parseEbayMoneyMinor(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function safeLinePayload(lineValue: unknown): Record<string, unknown> {
  const line = record(lineValue);
  return {
    lineItemId: typeof line.lineItemId === 'string' ? line.lineItemId : null,
    legacyItemId: typeof line.legacyItemId === 'string' ? line.legacyItemId : null,
    sku: typeof line.sku === 'string' ? line.sku : null,
    title: typeof line.title === 'string' ? line.title : null,
    quantity: line.quantity ?? null,
    lineItemCost: line.lineItemCost ?? null,
    discountedLineItemCost: line.discountedLineItemCost ?? null,
    total: line.total ?? null,
    taxes: Array.isArray(line.taxes) ? line.taxes : [],
    ebayCollectAndRemitTaxes: Array.isArray(line.ebayCollectAndRemitTaxes) ? line.ebayCollectAndRemitTaxes : [],
  };
}

function lineTaxMinor(lineValue: unknown): number {
  const line = record(lineValue);
  const taxes = Array.isArray(line.taxes) && line.taxes.length
    ? line.taxes
    : Array.isArray(line.ebayCollectAndRemitTaxes) ? line.ebayCollectAndRemitTaxes : [];
  return taxes.reduce((sum: number, taxValue: unknown) => {
    const tax = record(taxValue);
    return sum + (parseEbayMoneyMinor(record(tax.amount).value) ?? 0);
  }, 0);
}

export function normalizeEbayOrderHeader(orderValue: unknown): {
  totalMinor: number | null;
  currency: string | null;
  createdAt: string | null;
  missingFields: string[];
} {
  const order = record(orderValue);
  const total = record(record(order.pricingSummary).total);
  const totalMinor = parseEbayMoneyMinor(total.value);
  const rawCurrency = total.currency;
  const currency = typeof rawCurrency === 'string' && /^[A-Z]{3}$/i.test(rawCurrency.trim())
    ? rawCurrency.trim().toUpperCase() : null;
  const parsedDate = typeof order.creationDate === 'string' ? Date.parse(order.creationDate) : NaN;
  const createdAt = Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString() : null;
  const missingFields: string[] = [];
  if (totalMinor === null) missingFields.push('order total');
  if (!currency) missingFields.push('order currency');
  if (!createdAt) missingFields.push('provider creation date');
  return { totalMinor, currency, createdAt, missingFields };
}

export function normalizeEbayOrderLines(
  externalOrderId: string,
  lineItemsValue: unknown,
  orderCurrency: string,
  productIdForSku: (sku: string) => string | null,
): { items: NormalizedEbayOrderLine[]; exceptions: EbayOrderLineException[] } {
  const lineItems = Array.isArray(lineItemsValue) ? lineItemsValue : [];
  const items: NormalizedEbayOrderLine[] = [];
  const exceptions: EbayOrderLineException[] = [];

  if (lineItems.length === 0) {
    exceptions.push({
      referenceId: `${externalOrderId}:line-items`,
      details: 'The eBay order response did not contain any line items. No placeholder item was created.',
      rawPayload: { orderId: externalOrderId, lineItems: [] },
    });
    return { items, exceptions };
  }

  lineItems.forEach((lineValue: unknown, index: number) => {
    const line = record(lineValue);
    const sku = typeof line.sku === 'string' ? line.sku.trim().slice(0, 128) : '';
    const productName = typeof line.title === 'string' ? line.title.trim().slice(0, 250) : '';
    const quantity = Number(line.quantity);
    // eBay lineItemCost/discountedLineItemCost represent the whole line amount,
    // not a per-unit amount. Divide for unit price, but preserve the exact line total.
    const lineCost = record(line.discountedLineItemCost ?? line.lineItemCost);
    const lineTotalMinor = parseEbayMoneyMinor(lineCost.value);
    const lineCurrency = typeof lineCost.currency === 'string' ? lineCost.currency.trim().toUpperCase() : '';
    const lineReference = typeof line.lineItemId === 'string' && line.lineItemId
      ? line.lineItemId
      : typeof line.legacyItemId === 'string' && line.legacyItemId
        ? line.legacyItemId : `line-${index + 1}`;
    const missing: string[] = [];

    if (!sku) missing.push('provider SKU');
    if (!productName) missing.push('provider item title');
    if (!Number.isSafeInteger(quantity) || quantity <= 0) missing.push('positive provider quantity');
    if (lineTotalMinor === null) missing.push('provider line item price');
    if (!lineCurrency || lineCurrency !== orderCurrency) missing.push('line item currency matching the order');

    if (missing.length) {
      exceptions.push({
        referenceId: `${externalOrderId}:${lineReference}`,
        details: `The eBay order line is incomplete (${missing.join(', ')}). It was not imported with substitute values.`,
        rawPayload: safeLinePayload(line),
      });
      return;
    }

    items.push({
      product_id: productIdForSku(sku),
      sku,
      product_name: productName,
      quantity,
      unit_price_minor: Math.round((lineTotalMinor as number) / quantity),
      tax_amount_minor: lineTaxMinor(line),
      total_price_minor: lineTotalMinor as number,
      raw_item: safeLinePayload(line),
    });
  });

  return { items, exceptions };
}

export function ebayOrderTaxMinor(orderValue: unknown): number {
  const order = record(orderValue);
  const summaryTax = parseEbayMoneyMinor(record(record(order.pricingSummary).tax).value);
  if (summaryTax !== null) return summaryTax;
  const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
  return lineItems.reduce((sum: number, line: unknown) => sum + lineTaxMinor(line), 0);
}

export function ebayOrderShippingMinor(orderValue: unknown): number {
  const order = record(orderValue);
  const pricing = record(order.pricingSummary);
  const deliveryCost = parseEbayMoneyMinor(record(pricing.deliveryCost).value);
  if (deliveryCost !== null) return deliveryCost + (parseEbayMoneyMinor(record(pricing.deliveryDiscount).value) ?? 0);
  const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
  return lineItems.reduce((sum: number, lineValue: unknown) => {
    const line = record(lineValue);
    return sum + (parseEbayMoneyMinor(record(record(line.deliveryCost).shippingCost).value) ?? 0);
  }, 0);
}
