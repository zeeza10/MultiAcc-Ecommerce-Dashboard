import type { AuthContext } from '../types';
import { json } from '../http';

export async function handleFinanceRoute(path: string, request: Request, url: URL, auth: AuthContext): Promise<Response | null> {
  if (path === '/finance/payments' && request.method === 'POST') {
    const body = await request.json() as Record<string, unknown>;
    const amountMinor = Number(body.amountMinor);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error('Payment amount must be a positive whole number of minor currency units.');
    const { data, error } = await auth.repositoryContext.supabase.rpc('record_finance_payment', {
      p_organization_id: auth.organizationId,
      p_invoice_id: String(body.invoiceId || ''),
      p_amount_minor: amountMinor,
      p_payment_method: String(body.paymentMethod || ''),
      p_payment_date: String(body.paymentDate || new Date().toISOString().slice(0, 10)),
      p_reference: body.reference == null ? null : String(body.reference),
      p_payer_name: body.payerName == null ? null : String(body.payerName),
    });
    if (error) throw new Error(error.message || 'Payment could not be recorded.');
    const row = data as Record<string, any>;
    return json({ payment: {
      id: row.id, paymentNumber: row.payment_number, amountMinor: Number(row.amount_minor),
      currency: String(row.currency || 'GBP').trim(), paymentMethod: row.payment_method,
      paymentDate: row.payment_date, reference: row.reference || undefined,
      payerName: row.payer_name || undefined, unallocatedCreditMinor: Number(row.unallocated_credit_minor || 0),
      recordedBy: row.recorded_by || '', createdAt: row.created_at,
    } }, 201);
  }

  const voidInvoiceMatch = path.match(/^\/finance\/invoices\/([^/]+)\/void$/);
  if (voidInvoiceMatch && request.method === 'POST') {
    const body = await request.json() as { reason?: string };
    const { data, error } = await auth.repositoryContext.supabase.rpc('void_finance_invoice', {
      p_organization_id: auth.organizationId,
      p_invoice_id: voidInvoiceMatch[1],
      p_reason: String(body.reason || ''),
    });
    if (error) throw new Error(error.message || 'Invoice could not be voided.');
    const row = data as Record<string, any>;
    return json({ success: true, invoice: {
      id: row.id, invoiceNumber: row.invoice_number, invoiceType: row.invoice_type,
      recipientType: row.recipient_type, recipientId: row.recipient_id || undefined,
      recipientName: row.recipient_name, issueDate: row.issue_date, dueDate: row.due_date,
      subtotalMinor: Number(row.subtotal_minor), vatRatePercent: Number(row.vat_rate_percent),
      vatAmountMinor: Number(row.vat_amount_minor), totalMinor: Number(row.total_minor),
      paidAmountMinor: Number(row.paid_amount_minor), currency: String(row.currency || 'GBP').trim(),
      status: row.status, voidReason: row.void_reason || undefined,
      isImmutable: Boolean(row.is_immutable), createdBy: row.created_by || '', createdAt: row.created_at,
    } });
  }

  const confirmPayoutMatch = path.match(/^\/payouts\/([^/]+)\/confirm-deposit$/);
  if (confirmPayoutMatch && request.method === 'POST') {
    const body = await request.json() as { bankReference?: string };
    const { data, error } = await auth.repositoryContext.supabase.rpc('confirm_payout_deposit', {
      p_organization_id: auth.organizationId,
      p_payout_id: confirmPayoutMatch[1],
      p_bank_reference: String(body.bankReference || ''),
    });
    if (error) throw new Error(error.message || 'Payout deposit confirmation failed.');
    const row = data as Record<string, any>;
    return json({ success: true, payout: {
      id: row.id, payoutId: row.payout_reference, marketplaceAccountId: row.marketplace_account_id,
      totalSalesMinor: Number(row.total_sales_minor || 0), totalFeesMinor: Number(row.total_fees_minor || 0),
      refundsMinor: Number(row.refunds_minor || 0), shippingAdjustmentsMinor: Number(row.shipping_adjustments_minor || 0),
      otherAdjustmentsMinor: Number(row.other_adjustments_minor || 0), netPayoutMinor: Number(row.net_payout_minor || 0),
      currency: String(row.currency || 'GBP').trim(), payoutDate: row.payout_date, status: row.status,
      transactionId: row.transaction_id || '', bankDepositStatus: row.bank_deposit_status,
      bankReference: row.bank_reference || undefined, notes: row.notes || undefined,
    } });
  }

  if (path === '/finance/invoices' && request.method === 'GET') {
    let invoicesQuery = auth.repositoryContext.supabase.from('invoices')
      .select('id,invoice_number,invoice_type,recipient_type,recipient_id,recipient_name,issue_date,due_date,subtotal_minor,vat_rate_percent,vat_amount_minor,total_minor,paid_amount_minor,currency,status,void_reason,is_immutable,created_at')
      .eq('organization_id', auth.organizationId).order('created_at', { ascending: false });
    if (auth.user.role === 'CLIENT_USER') {
      if (!auth.repositoryContext.client3plId) return json({ error: 'Client account is not linked.' }, 403);
      invoicesQuery = invoicesQuery.eq('recipient_type', 'CLIENT').eq('recipient_id', auth.repositoryContext.client3plId);
    }
    const { data: invoices, error } = await invoicesQuery;
    if (error) throw error;
    const ids = (invoices || []).map(row => row.id);
    const { data: items, error: itemError } = ids.length
      ? await auth.repositoryContext.supabase.from('invoice_items')
          .select('id,invoice_id,description,quantity,unit_price_minor,total_minor')
          .eq('organization_id', auth.organizationId).in('invoice_id', ids)
      : { data: [], error: null };
    if (itemError) throw itemError;
    const linesByInvoice = new Map<string, any[]>();
    for (const item of items || []) {
      const lines = linesByInvoice.get(item.invoice_id) || [];
      lines.push({ description: item.description, quantity: Number(item.quantity), unitPriceMinor: Number(item.unit_price_minor), totalMinor: Number(item.total_minor) });
      linesByInvoice.set(item.invoice_id, lines);
    }
    return json({ invoices: (invoices || []).map(row => ({
      id: row.id, invoiceNumber: row.invoice_number, type: row.invoice_type, recipientType: row.recipient_type,
      recipientId: row.recipient_id || '', recipientName: row.recipient_name, issueDate: row.issue_date, dueDate: row.due_date,
      subtotalMinor: Number(row.subtotal_minor), vatRatePercent: Number(row.vat_rate_percent), vatAmountMinor: Number(row.vat_amount_minor),
      totalMinor: Number(row.total_minor), paidAmountMinor: Number(row.paid_amount_minor), status: row.status,
      lines: linesByInvoice.get(row.id) || [], voidReason: row.void_reason || undefined,
      isImmutable: Boolean(row.is_immutable), createdAt: row.created_at,
    })) });
  }

  if (path === '/finance/payments' && request.method === 'GET') {
    let clientInvoiceIds: string[] | null = null;
    let clientRecipientName = '';
    if (auth.user.role === 'CLIENT_USER') {
      if (!auth.repositoryContext.client3plId) return json({ error: 'Client account is not linked.' }, 403);
      const { data: clientInvoices, error: clientInvoiceError } = await auth.repositoryContext.supabase.from('invoices')
        .select('id,recipient_name').eq('organization_id', auth.organizationId)
        .eq('recipient_type', 'CLIENT').eq('recipient_id', auth.repositoryContext.client3plId);
      if (clientInvoiceError) throw clientInvoiceError;
      clientInvoiceIds = (clientInvoices || []).map(row => row.id);
      clientRecipientName = clientInvoices?.[0]?.recipient_name || '';
      if (clientInvoiceIds.length === 0) return json({ payments: [] });
    }
    const { data: clientAllocations, error: clientAllocationError } = clientInvoiceIds
      ? await auth.repositoryContext.supabase.from('payment_allocations').select('payment_id')
          .eq('organization_id', auth.organizationId).in('invoice_id', clientInvoiceIds)
      : { data: [], error: null };
    if (clientAllocationError) throw clientAllocationError;
    const clientPaymentIds = clientInvoiceIds ? [...new Set((clientAllocations || []).map(row => row.payment_id))] : null;
    if (clientPaymentIds && clientPaymentIds.length === 0) return json({ payments: [] });
    let paymentsQuery = auth.repositoryContext.supabase.from('payments')
      .select('id,payment_number,amount_minor,currency,payment_method,payment_date,reference,payer_name,unallocated_credit_minor,recorded_by,created_at')
      .eq('organization_id', auth.organizationId).order('payment_date', { ascending: false });
    if (clientPaymentIds) paymentsQuery = paymentsQuery.in('id', clientPaymentIds);
    const { data: payments, error } = await paymentsQuery;
    if (error) throw error;
    const paymentIds = (payments || []).map(row => row.id);
    let allocationsQuery = auth.repositoryContext.supabase.from('payment_allocations')
      .select('id,payment_id,invoice_id,amount_minor').eq('organization_id', auth.organizationId);
    if (paymentIds.length) allocationsQuery = allocationsQuery.in('payment_id', paymentIds);
    else allocationsQuery = allocationsQuery.in('payment_id', ['00000000-0000-0000-0000-000000000000']);
    if (clientInvoiceIds) allocationsQuery = allocationsQuery.in('invoice_id', clientInvoiceIds);
    const { data: allocations, error: allocationError } = await allocationsQuery;
    if (allocationError) throw allocationError;
    const invoiceIds = [...new Set((allocations || []).map(row => row.invoice_id))];
    const { data: invoices, error: invoiceError } = invoiceIds.length
      ? await auth.repositoryContext.supabase.from('invoices').select('id,invoice_number')
          .eq('organization_id', auth.organizationId).in('id', invoiceIds)
      : { data: [], error: null };
    if (invoiceError) throw invoiceError;
    const invoiceNumbers = new Map((invoices || []).map(row => [row.id, row.invoice_number]));
    const allocationsByPayment = new Map<string, any[]>();
    for (const allocation of allocations || []) {
      const rows = allocationsByPayment.get(allocation.payment_id) || [];
      rows.push({ invoiceId: allocation.invoice_id, invoiceNumber: invoiceNumbers.get(allocation.invoice_id) || '', amountMinor: Number(allocation.amount_minor) });
      allocationsByPayment.set(allocation.payment_id, rows);
    }
    return json({ payments: (payments || []).map(row => ({
      id: row.id, paymentNumber: row.payment_number, amountMinor: auth.user.role === 'CLIENT_USER' ? (allocationsByPayment.get(row.id) || []).reduce((sum: number, allocation: any) => sum + Number(allocation.amountMinor || 0), 0) : Number(row.amount_minor), paymentMethod: row.payment_method,
      paymentDate: row.payment_date, reference: row.reference || '', payerName: auth.user.role === 'CLIENT_USER' ? clientRecipientName : (row.payer_name || ''),
      allocations: allocationsByPayment.get(row.id) || [], unallocatedCreditMinor: Number(row.unallocated_credit_minor),
      recordedBy: row.recorded_by || '', createdAt: row.created_at,
    })) });
  }

  if (path === '/finance/expenses' && request.method === 'GET') {
    const { data, error } = await auth.repositoryContext.supabase
      .from('expenses')
      .select('id,expense_number,category,supplier_name,expense_date,amount_minor,vat_minor,currency,allocated_to,status,approved_by,note')
      .eq('organization_id', auth.organizationId)
      .order('expense_date', { ascending: false });
    if (error) throw error;
    return json({ expenses: (data || []).map(row => ({
      id: row.id, expenseNumber: row.expense_number, category: row.category, supplierName: row.supplier_name || '',
      date: row.expense_date, amountMinor: Number(row.amount_minor), vatMinor: Number(row.vat_minor),
      allocatedTo: row.allocated_to || undefined, status: row.status, approvedBy: row.approved_by || undefined, note: row.note || undefined,
    })) });
  }

  if (path === '/finance/ledger' && request.method === 'GET') {
    const { data: entries, error } = await auth.repositoryContext.supabase
      .from('journal_entries')
      .select('id,source_type,source_id,description,created_at,status')
      .eq('organization_id', auth.organizationId)
      .eq('status', 'POSTED')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const entryIds = (entries || []).map(row => row.id);
    const { data: lines, error: lineError } = entryIds.length
      ? await auth.repositoryContext.supabase.from('journal_entry_lines')
          .select('id,journal_entry_id,account_id,debit_minor,credit_minor,description')
          .eq('organization_id', auth.organizationId).in('journal_entry_id', entryIds)
      : { data: [], error: null };
    if (lineError) throw lineError;
    const accountIds = [...new Set((lines || []).map(row => row.account_id))];
    const { data: accounts, error: accountError } = accountIds.length
      ? await auth.repositoryContext.supabase.from('chart_of_accounts')
          .select('id,account_code,account_name').eq('organization_id', auth.organizationId).in('id', accountIds)
      : { data: [], error: null };
    if (accountError) throw accountError;
    const entryById = new Map((entries || []).map(row => [row.id, row]));
    const accountById = new Map((accounts || []).map(row => [row.id, row]));
    return json({ ledger: (lines || []).map(line => {
      const entry = entryById.get(line.journal_entry_id);
      const account = accountById.get(line.account_id);
      return {
        id: line.id, accountId: account?.account_code || line.account_id, accountName: account?.account_name || 'Unknown account',
        debitMinor: Number(line.debit_minor), creditMinor: Number(line.credit_minor),
        sourceType: entry?.source_type || 'EXPENSE', sourceId: entry?.source_id || '',
        note: line.description || entry?.description || undefined, createdAt: entry?.created_at || '',
      };
    }) });
  }

  if (path === '/payouts' && request.method === 'GET') {
    if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.view')) {
      return json({ error: 'Marketplace account access is required to view payout account details.' }, 403);
    }
    let query = auth.repositoryContext.supabase
      .from('marketplace_payouts')
      .select('id,payout_reference,marketplace_account_id,total_sales_minor,total_fees_minor,refunds_minor,shipping_adjustments_minor,other_adjustments_minor,net_payout_minor,currency,payout_date,status,transaction_id,bank_deposit_status,bank_reference,notes')
      .eq('organization_id', auth.organizationId).order('payout_date', { ascending: false });
    const accountId = url.searchParams.get('accountId');
    if (accountId && accountId !== 'ALL') query = query.eq('marketplace_account_id', accountId);
    const { data: payouts, error } = await query;
    if (error) throw error;
    const accountIds = [...new Set((payouts || []).map(row => row.marketplace_account_id))];
    const { data: accounts, error: accountError } = accountIds.length
      ? await auth.repositoryContext.supabase.from('marketplace_accounts').select('id,name')
          .eq('organization_id', auth.organizationId).in('id', accountIds)
      : { data: [], error: null };
    if (accountError) throw accountError;
    const payoutIds = (payouts || []).map(row => row.id);
    const { data: payoutOrders, error: orderError } = payoutIds.length
      ? await auth.repositoryContext.supabase.from('payout_orders').select('payout_id,order_id')
          .eq('organization_id', auth.organizationId).in('payout_id', payoutIds)
      : { data: [], error: null };
    if (orderError) throw orderError;
    const accountNames = new Map((accounts || []).map(row => [row.id, row.name]));
    const ordersByPayout = new Map<string, string[]>();
    for (const row of payoutOrders || []) {
      const ids = ordersByPayout.get(row.payout_id) || [];
      ids.push(row.order_id);
      ordersByPayout.set(row.payout_id, ids);
    }
    const payoutRows = payouts || [];
    const balances = {
      totalSalesMinor: payoutRows.reduce((sum, row) => sum + Number(row.total_sales_minor || 0), 0),
      totalFeesMinor: payoutRows.reduce((sum, row) => sum + Number(row.total_fees_minor || 0), 0),
      confirmedMinor: payoutRows.filter(row => ['RECONCILED','CLEARED','BANK_CONFIRMED'].includes(row.bank_deposit_status)).reduce((sum, row) => sum + Number(row.net_payout_minor || 0), 0),
      pendingDepositMinor: payoutRows.filter(row => !['RECONCILED','CLEARED','BANK_CONFIRMED'].includes(row.bank_deposit_status)).reduce((sum, row) => sum + Number(row.net_payout_minor || 0), 0),
    };
    return json({ balances, payouts: payoutRows.map(row => ({
      id: row.id, payoutId: row.payout_reference, marketplaceAccountId: row.marketplace_account_id,
      accountName: accountNames.get(row.marketplace_account_id) || '', totalSalesMinor: Number(row.total_sales_minor),
      totalFeesMinor: Number(row.total_fees_minor), refundsMinor: Number(row.refunds_minor),
      shippingAdjustmentsMinor: Number(row.shipping_adjustments_minor), otherAdjustmentsMinor: Number(row.other_adjustments_minor),
      netPayoutMinor: Number(row.net_payout_minor), currency: row.currency.trim(), payoutDate: row.payout_date,
      status: row.status, transactionId: row.transaction_id || '', bankDepositStatus: row.bank_deposit_status,
      bankReference: row.bank_reference || undefined, orderIds: ordersByPayout.get(row.id) || [], notes: row.notes || undefined,
    })) });
  }

  if (path === '/reconciliation' && request.method === 'GET') {
    if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.view')) {
      return json({ error: 'Marketplace account access is required to view reconciliation account details.' }, 403);
    }
    let query = auth.repositoryContext.supabase
      .from('financial_reconciliations')
      .select('id,period,marketplace_account_id,expected_payout_minor,actual_payout_minor,difference_minor,unmatched_transactions_count,status,last_reconciled_at,reconciled_by,audit_notes,breakdown')
      .eq('organization_id', auth.organizationId).order('created_at', { ascending: false });
    const accountId = url.searchParams.get('accountId');
    if (accountId && accountId !== 'ALL') query = query.eq('marketplace_account_id', accountId);
    const { data: reconciliations, error } = await query;
    if (error) throw error;
    const accountIds = [...new Set((reconciliations || []).map(row => row.marketplace_account_id).filter(Boolean))];
    const { data: accounts, error: accountError } = accountIds.length
      ? await auth.repositoryContext.supabase.from('marketplace_accounts').select('id,name')
          .eq('organization_id', auth.organizationId).in('id', accountIds)
      : { data: [], error: null };
    if (accountError) throw accountError;
    const accountNames = new Map((accounts || []).map(row => [row.id, row.name]));
    return json({ reconciliations: (reconciliations || []).map(row => ({
      id: row.id, period: row.period, marketplaceAccountId: row.marketplace_account_id || '',
      accountName: accountNames.get(row.marketplace_account_id) || '', expectedPayoutMinor: Number(row.expected_payout_minor),
      actualPayoutMinor: Number(row.actual_payout_minor), differenceMinor: Number(row.difference_minor),
      unmatchedTransactionsCount: Number(row.unmatched_transactions_count), status: row.status,
      lastReconciledAt: row.last_reconciled_at || '', reconciledBy: row.reconciled_by || '',
      auditNotes: row.audit_notes || '', breakdown: row.breakdown,
    })) });
  }


  return null;
}
