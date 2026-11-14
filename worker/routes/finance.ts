import type { AuthContext } from '../types';
import { json } from '../http';

export async function handleFinanceRoute(path: string, request: Request, url: URL, auth: AuthContext): Promise<Response | null> {
  // Client finance views are not yet scoped to a single 3PL client across every ledger relation.
  // Deny them until invoice/payment/expense/ledger queries share a verified client boundary.
  if (auth.user.role === 'CLIENT_USER') {
    return json({ error: 'Client-scoped finance access is not available yet.' }, 403);
  }
  if (path === '/finance/invoices' && request.method === 'GET') {
    const { data: invoices, error } = await auth.repositoryContext.supabase
      .from('invoices')
      .select('id,invoice_number,invoice_type,recipient_type,recipient_id,recipient_name,issue_date,due_date,subtotal_minor,vat_rate_percent,vat_amount_minor,total_minor,paid_amount_minor,currency,status,void_reason,is_immutable,created_at')
      .eq('organization_id', auth.organizationId)
      .order('created_at', { ascending: false });
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
    const { data: payments, error } = await auth.repositoryContext.supabase
      .from('payments')
      .select('id,payment_number,amount_minor,currency,payment_method,payment_date,reference,payer_name,unallocated_credit_minor,recorded_by,created_at')
      .eq('organization_id', auth.organizationId)
      .order('payment_date', { ascending: false });
    if (error) throw error;
    const paymentIds = (payments || []).map(row => row.id);
    const { data: allocations, error: allocationError } = paymentIds.length
      ? await auth.repositoryContext.supabase.from('payment_allocations')
          .select('id,payment_id,invoice_id,amount_minor')
          .eq('organization_id', auth.organizationId).in('payment_id', paymentIds)
      : { data: [], error: null };
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
      id: row.id, paymentNumber: row.payment_number, amountMinor: Number(row.amount_minor), paymentMethod: row.payment_method,
      paymentDate: row.payment_date, reference: row.reference || '', payerName: row.payer_name || '',
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
    return json({ payouts: (payouts || []).map(row => ({
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
