import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Save,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  Sliders,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import { api } from '../services/api';
import { User, SystemConfig } from '../types';

interface SettingsViewProps {
  currentUser: User;
  config: SystemConfig;
  onUpdateConfig: (cfg: Partial<SystemConfig>) => void;
  onResetDemo: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentUser,
  config,
  onUpdateConfig,
  onResetDemo,
}) => {
  const [baseCurrency, setBaseCurrency] = useState(config.baseCurrency);
  const [timezone, setTimezone] = useState(config.businessTimezone);
  const [vatRate, setVatRate] = useState(String(config.defaultVatRatePercent));
  const [adjQtyThreshold, setAdjQtyThreshold] = useState(
    String(config.adjustmentApprovalThresholdQuantity)
  );
  const [adjValThreshold, setAdjValThreshold] = useState(
    String(config.adjustmentApprovalThresholdValueMinor / 100)
  );
  const [activePhase, setActivePhase] = useState(config.activeReleasePhase);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSaveSuccess(false);

    if (currentUser.role !== 'SUPER_ADMIN') {
      setErrorMsg('Access denied: Only Super Admin can modify system configuration (SRS S4, A.4.2).');
      return;
    }

    try {
      const updated: Partial<SystemConfig> = {
        baseCurrency,
        businessTimezone: timezone,
        defaultVatRatePercent: parseFloat(vatRate) || 20,
        adjustmentApprovalThresholdQuantity: parseInt(adjQtyThreshold, 10) || 10,
        adjustmentApprovalThresholdValueMinor: Math.round(parseFloat(adjValThreshold || '0') * 100),
        activeReleasePhase: activePhase,
      };

      await api.updateConfig(updated);
      onUpdateConfig(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update configuration');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">System & Operations Settings</h1>
        <p className="text-xs text-gray-500">
          Commercial parameters, threshold gates for adjustments, release phase controls, and seed data utilities.
        </p>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>System configuration successfully updated and audited to the database.</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5 text-xs">
        {/* Release Phase Roadmap Selector */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-2xs space-y-3">
          <div className="flex items-center space-x-2 border-b border-gray-100 pb-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-gray-900 text-sm">Release Roadmap Phase Governance</h3>
          </div>
          <p className="text-gray-600">
            Per PRD Section 6 & SRS Section 3: "Do not expose future-phase modules as fully operational features before their respective phases are implemented. Hide unreleased features or clearly label them as coming in a future phase."
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {[
              {
                id: 'P1',
                title: 'Phase 1: Core Operations Only',
                desc: 'eBay multi-account order sync, products, inventory with append-only ledger, adjustments, basic dashboard, and reports R-01 to R-06.',
              },
              {
                id: 'P2',
                title: 'Phase 2: Purchasing & Returns',
                desc: 'Adds supplier directory, PO partial receiving, warehouse locations, returns with multi-disposition, and reports R-07 to R-09.',
              },
              {
                id: 'P3',
                title: 'Phase 3: 3PL & Client Portal',
                desc: 'Adds 3PL client accounts, commercial rate cards, storage occupancy snapshots, live billing previews, and reports R-10 & R-11.',
              },
              {
                id: 'P4',
                title: 'Phase 4: Finance & Profitability',
                desc: 'Adds immutable invoices, multi-allocation payments, double-entry financial ledger, order unit economics, and reports R-12 to R-14.',
              },
              {
                id: 'ALL',
                title: 'All Phases Active (Full Enterprise Suite)',
                desc: 'Unlocks complete operational capabilities across all 5 phases for end-to-end testing and demonstration.',
              },
            ].map((p) => (
              <label
                key={p.id}
                className={`p-3 rounded-lg border cursor-pointer transition flex flex-col justify-between ${
                  activePhase === p.id
                    ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 font-medium shadow-2xs'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="font-bold text-xs">{p.title}</div>
                  <input
                    type="radio"
                    name="activeReleasePhase"
                    value={p.id}
                    checked={activePhase === p.id}
                    onChange={(e) => setActivePhase(e.target.value as any)}
                    className="mt-0.5 text-indigo-600"
                  />
                </div>
                <div className="text-[11px] text-gray-500 mt-1">{p.desc}</div>
              </label>
            ))}
          </div>
        </div>

        {/* Commercial & Approval Thresholds */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-2xs space-y-4">
          <div className="flex items-center space-x-2 border-b border-gray-100 pb-2">
            <Sliders className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-gray-900 text-sm">Commercial Rules & Approval Thresholds</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Base Currency Code</label>
              <input
                type="text"
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value.toUpperCase())}
                className="w-full border border-gray-300 rounded-md p-2 font-mono"
              />
              <span className="text-[11px] text-gray-500 mt-0.5 block">Default operational ledger currency</span>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">Business Timezone</label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2 font-mono"
              />
              <span className="text-[11px] text-gray-500 mt-0.5 block">e.g. Europe/London or America/New_York</span>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">Default Standard VAT Rate (%)</label>
              <input
                type="number"
                step="0.1"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2"
              />
              <span className="text-[11px] text-gray-500 mt-0.5 block">Standard VAT percentage applied to sales</span>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Stock Adjustment Max Quantity (Auto-Approval Limit)
              </label>
              <input
                type="number"
                value={adjQtyThreshold}
                onChange={(e) => setAdjQtyThreshold(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2"
              />
              <span className="text-[11px] text-gray-500 mt-0.5 block">
                Adjustments above this unit count require Operations Manager sign-off
              </span>
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-gray-700 mb-1">
                Stock Adjustment Max Value (£) (Auto-Approval Limit)
              </label>
              <input
                type="number"
                step="0.01"
                value={adjValThreshold}
                onChange={(e) => setAdjValThreshold(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2 max-w-sm"
              />
              <span className="text-[11px] text-gray-500 mt-0.5 block">
                Adjustments evaluated above this monetary threshold require Operations Manager sign-off
              </span>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md shadow-2xs transition"
            >
              <Save className="w-4 h-4" />
              <span>Save System Settings</span>
            </button>
          </div>
        </div>
      </form>

      {/* Demo Data Management */}
      <div className="bg-white border border-rose-200 rounded-lg p-4 shadow-2xs space-y-3">
        <div className="flex items-center space-x-2 border-b border-rose-100 pb-2">
          <RotateCcw className="w-4 h-4 text-rose-600" />
          <h3 className="font-bold text-gray-900 text-sm">Demo Data & Sandbox Reset</h3>
        </div>
        <p className="text-gray-600 text-xs">
          Complies with SRS FR-OPS-01 ("Seed and demo data are clearly labeled and never presented as evidence of a working integration"). Resetting reinstates all baseline eBay accounts, unmapped SKU exceptions, orders, and append-only ledgers to a verified starting state.
        </p>

        <div className="pt-1">
          <button
            onClick={() => {
              if (window.confirm('Reset database to clean baseline demo seed dataset?')) {
                onResetDemo();
              }
            }}
            className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md font-semibold text-xs transition"
          >
            Reset Database to Clean Demo Baseline
          </button>
        </div>
      </div>
    </div>
  );
};
