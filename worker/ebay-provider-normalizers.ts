type JsonRecord = Record<string, any>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function safeAmount(value: unknown): JsonRecord | null {
  const amount = record(value);
  if (amount.value === undefined && amount.currency === undefined) return null;
  return {
    ...(amount.value !== undefined && (typeof amount.value === 'number' || typeof amount.value === 'string') ? { value: amount.value } : {}),
    ...(typeof amount.currency === 'string' ? { currency: amount.currency } : {}),
  };
}

export function normalizeEbaySellerAccountResource(resourceType: string, payloadValue: unknown, marketplaceId: string): JsonRecord {
  const payload = record(payloadValue);
  if (resourceType === 'SELLER_PRIVILEGE') {
    return {
      source: 'EBAY_ACCOUNT_API',
      marketplaceId,
      sellerRegistrationCompleted: typeof payload.sellerRegistrationCompleted === 'boolean' ? payload.sellerRegistrationCompleted : null,
      sellingLimit: record(payload.sellingLimit).quantity !== undefined || record(payload.sellingLimit).amount !== undefined
        ? {
            ...(record(payload.sellingLimit).quantity !== undefined ? { quantity: record(payload.sellingLimit).quantity } : {}),
            ...(safeAmount(record(payload.sellingLimit).amount) ? { amount: safeAmount(record(payload.sellingLimit).amount) } : {}),
          }
        : null,
    };
  }
  if (resourceType === 'SELLER_SUBSCRIPTION') {
    const subscriptions = Array.isArray(payload.subscriptions) ? payload.subscriptions : [];
    return {
      source: 'EBAY_ACCOUNT_API',
      marketplaceId,
      subscriptions: subscriptions.map((entry: unknown) => {
        const item = record(entry);
        return {
          subscriptionLevel: textValue(item.subscriptionLevel),
          subscriptionType: textValue(item.subscriptionType),
          status: textValue(item.status),
          startDate: textValue(item.startDate),
          endDate: textValue(item.endDate),
        };
      }),
    };
  }
  const policyKey = resourceType === 'SELLER_PAYMENT_POLICY' ? 'paymentPolicies'
    : resourceType === 'SELLER_FULFILLMENT_POLICY' ? 'fulfillmentPolicies'
      : resourceType === 'SELLER_RETURN_POLICY' ? 'returnPolicies' : '';
  const policies = policyKey && Array.isArray(payload[policyKey]) ? payload[policyKey] : [];
  return {
    source: 'EBAY_ACCOUNT_API',
    marketplaceId,
    policies: policies.map((entry: unknown) => {
      const policy = record(entry);
      const normalized: JsonRecord = {
        policyId: textValue(policy.paymentPolicyId) || textValue(policy.fulfillmentPolicyId) || textValue(policy.returnPolicyId),
        name: textValue(policy.name),
        marketplaceId: textValue(policy.marketplaceId),
      };
      if (resourceType === 'SELLER_PAYMENT_POLICY') {
        normalized.immediatePay = typeof policy.immediatePay === 'boolean' ? policy.immediatePay : null;
        normalized.paymentMethods = Array.isArray(policy.paymentMethods)
          ? policy.paymentMethods.map((method: unknown) => {
              const item = record(method);
              return { paymentMethodType: textValue(item.paymentMethodType), brands: Array.isArray(item.brands) ? item.brands.filter((v: unknown) => typeof v === 'string') : [] };
            })
          : [];
      }
      if (resourceType === 'SELLER_FULFILLMENT_POLICY') {
        normalized.handlingTime = policy.handlingTime && typeof policy.handlingTime === 'object'
          ? { value: record(policy.handlingTime).value ?? null, unit: record(policy.handlingTime).unit ?? null }
          : null;
        normalized.shippingOptions = Array.isArray(policy.shippingOptions)
          ? policy.shippingOptions.map((option: unknown) => {
              const item = record(option);
              const cost = record(item.shippingCost);
              return {
                optionType: textValue(item.optionType),
                costType: textValue(item.costType),
                shippingCost: safeAmount(cost),
                shippingServices: Array.isArray(item.shippingServices)
                  ? item.shippingServices.map((service: unknown) => {
                      const serviceItem = record(service);
                      return { shippingServiceCode: textValue(serviceItem.shippingServiceCode), shippingServiceName: textValue(serviceItem.shippingServiceName) };
                    })
                  : [],
              };
            })
          : [];
      }
      if (resourceType === 'SELLER_RETURN_POLICY') {
        normalized.returnsAccepted = typeof policy.returnsAccepted === 'boolean' ? policy.returnsAccepted : null;
        normalized.returnPeriod = policy.returnPeriod && typeof policy.returnPeriod === 'object'
          ? { value: record(policy.returnPeriod).value ?? null, unit: record(policy.returnPeriod).unit ?? null }
          : null;
        normalized.refundMethod = textValue(policy.refundMethod);
        normalized.returnShippingCostPayer = textValue(policy.returnShippingCostPayer);
      }
      return normalized;
    }),
  };
}

export function normalizeEbayAnalyticsResource(resourceType: string, payloadValue: unknown, marketplaceId: string): JsonRecord {
  const payload = record(payloadValue);
  if (resourceType === 'ANALYTICS_TRAFFIC') {
    const header = record(payload.header);
    const dimensionKeys = Array.isArray(header.dimensionKeys) ? header.dimensionKeys
      : Array.isArray(payload.dimensionKeys) ? payload.dimensionKeys : [];
    const metrics = Array.isArray(header.metrics) ? header.metrics
      : Array.isArray(payload.metrics) ? payload.metrics : [];
    return {
      source: 'EBAY_ANALYTICS_API',
      marketplaceId,
      reportType: textValue(payload.reportType),
      startDate: textValue(payload.startDate),
      endDate: textValue(payload.endDate),
      lastUpdatedDate: textValue(payload.lastUpdatedDate),
      dimensionKeys: dimensionKeys.map((value: unknown) => {
        if (typeof value === 'string') return value;
        const dimension = record(value);
        return {
          key: textValue(dimension.key),
          localizedName: textValue(dimension.localizedName),
          dataType: textValue(dimension.dataType),
        };
      }),
      metrics: metrics.map((value: unknown) => {
        if (typeof value === 'string') return value;
        const metric = record(value);
        return {
          key: textValue(metric.key),
          localizedName: textValue(metric.localizedName),
          dataType: textValue(metric.dataType),
        };
      }),
      records: Array.isArray(payload.records) ? payload.records.map((entry: unknown) => {
        const item = record(entry);
        return {
          dimensionValues: Array.isArray(item.dimensionValues) ? item.dimensionValues.map((value: unknown) => {
            if (typeof value === 'string') return value;
            const dimension = record(value);
            return {
              ...(textValue(dimension.dimension) || textValue(dimension.name) ? { dimension: textValue(dimension.dimension) || textValue(dimension.name) } : {}),
              value: dimension.value ?? null,
              ...(typeof dimension.applicable === 'boolean' ? { applicable: dimension.applicable } : {}),
            };
          }) : [],
          metricValues: Array.isArray(item.metricValues) ? item.metricValues.map((value: unknown) => {
            if (typeof value === 'number' || typeof value === 'string') return value;
            const metric = record(value);
            return {
              ...(textValue(metric.metricType) || textValue(metric.metricName) || textValue(metric.name)
                ? { metricType: textValue(metric.metricType) || textValue(metric.metricName) || textValue(metric.name) } : {}),
              value: metric.value ?? metric.metricValue ?? null,
              ...(typeof metric.applicable === 'boolean' ? { applicable: metric.applicable } : {}),
            };
          }) : [],
        };
      }) : [],
    };
  }
  return {
    source: 'EBAY_ANALYTICS_API',
    marketplaceId,
    program: textValue(payload.program),
    cycle: textValue(payload.cycle),
    metricType: textValue(payload.metricType),
    evaluationType: textValue(payload.evaluationType),
    rating: textValue(payload.rating),
    metric: record(payload.metric),
    benchmark: record(payload.benchmark),
    sellerLevel: textValue(payload.sellerLevel),
    standardsProfile: Array.isArray(payload.standardsProfile) ? payload.standardsProfile : Array.isArray(payload.sellerStandardsProfiles) ? payload.sellerStandardsProfiles.map((entry: unknown) => {
      const item = record(entry);
      return { metric: textValue(item.metric), rating: textValue(item.rating), evaluationDate: textValue(item.evaluationDate) };
    }) : [],
  };
}

const FINANCE_SAFE_KEYS = new Set([
  'totalFunds','availableFunds','processingFunds','fundsOnHold','payoutCount','payoutAmount',
  'transactionCount','totalAmount','totalFeeAmount','amount','currency','value','count',
  'status','payoutStatus','totalPayoutAmount','totalPayoutCount','totalTransactionCount',
  'totalFees','feeAmount','totalRefundAmount','totalSalesAmount','totalCreditsAmount',
  'creditCount','creditAmount','creditBookingEntry','debitCount','debitAmount','debitBookingEntry',
  'refundCount','refundAmount','refundBookingEntry','purchaseCount','purchaseAmount','purchaseBookingEntry',
  'adjustmentCount','adjustmentAmount','adjustmentBookingEntry','nonSaleChargeCount','nonSaleChargeAmount','nonSaleChargeBookingEntry',
  'shippingLabelCount','shippingLabelAmount','shippingLabelBookingEntry','transferCount','transferAmount','transferBookingEntry',
  'paymentDisputeCount','paymentDisputeAmount','paymentDisputeBookingEntry',
  'payoutSummary','transactionSummary','sellerFundsSummary',
]);

function safeFinanceValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeFinanceValue);
  if (value && typeof value === 'object') {
    const source = record(value);
    const result: JsonRecord = {};
    for (const [key, child] of Object.entries(source)) {
      if (FINANCE_SAFE_KEYS.has(key)) result[key] = safeFinanceValue(child);
    }
    return result;
  }
  return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean' ? value : null;
}

export function normalizeEbayFinanceSummary(summaryKey: string, payloadValue: unknown, marketplaceId: string): JsonRecord {
  const payload = record(payloadValue);
  const safe: JsonRecord = {};
  for (const [key, value] of Object.entries(payload)) {
    if (FINANCE_SAFE_KEYS.has(key)) safe[key] = safeFinanceValue(value);
  }
  return { source: 'EBAY_FINANCES_API', marketplaceId, summaryKey, summary: safe };
}
