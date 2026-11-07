import React, { useState, useEffect } from 'react';
import { Warehouse, MapPin, Layers, CheckCircle, Search, Box } from 'lucide-react';
import { User, SystemConfig } from '../types';

interface WarehouseLocationsViewProps {
  currentUser: User;
  config: SystemConfig;
  defaultTab?: 'WAREHOUSES' | 'LOCATIONS';
}

export const WarehouseLocationsView: React.FC<WarehouseLocationsViewProps> = ({
  currentUser,
  config,
  defaultTab = 'WAREHOUSES',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'WAREHOUSES' | 'LOCATIONS'>(defaultTab);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (defaultTab) {
      setActiveSubTab(defaultTab);
    }
  }, [defaultTab]);

  const warehouses = [
    {
      id: 'wh_main',
      name: 'Nexus Central Fulfillment Hub',
      code: 'WH-01',
      address: 'Unit 4, Gateway Logistics Park, Milton Keynes, MK17 8EB, UK',
      status: 'Operational',
      totalCapacity: '45,000 units',
      occupancy: '72%',
      zones: [
        {
          name: 'Zone A - Fast-Pick Mezzanine',
          aisles: 'A1 - A4',
          type: 'SHELF / BIN',
          capacity: '12,000 units',
          description: 'High-velocity active pick locations for daily parcel dispatch.',
        },
        {
          name: 'Zone B - High-Bay Pallet Racks',
          aisles: 'B1 - B8',
          type: 'PALLET BAY',
          capacity: '850 pallet positions',
          description: 'Bulk reserve stock and dedicated 3PL client storage footprint.',
        },
        {
          name: 'Quarantine & Returns Bay',
          aisles: 'Q1',
          type: 'INSPECTION BIN',
          capacity: '500 units',
          description: 'Secure holding area for customer returns awaiting technical inspection.',
        },
      ],
    },
    {
      id: 'wh_north',
      name: 'Nexus Northern Distribution Centre',
      code: 'WH-02',
      address: 'Bay 12, Trafford Industrial Estate, Manchester, M17 1TN, UK',
      status: 'Operational',
      totalCapacity: '30,000 units',
      occupancy: '58%',
      zones: [
        {
          name: 'Zone M - Bulk Mezzanine',
          aisles: 'M1 - M4',
          type: 'SHELF / BULK',
          capacity: '15,000 units',
          description: 'Overstock storage for high-volume accessories and cables.',
        },
        {
          name: 'Zone P - Pallet Storage',
          aisles: 'P1 - P6',
          type: 'PALLET BAY',
          capacity: '400 pallet positions',
          description: 'Regional dispatch buffer for North UK and Scotland delivery.',
        },
      ],
    },
    {
      id: 'wh_south',
      name: 'Nexus Express London Cross-Dock',
      code: 'WH-03',
      address: 'Heathrow Cargo Point, Hounslow, TW6 3RT, UK',
      status: 'Operational',
      totalCapacity: '15,000 units',
      occupancy: '41%',
      zones: [
        {
          name: 'Zone CD - Cross-Dock Staging',
          aisles: 'CD1 - CD3',
          type: 'SORTATION',
          capacity: '5,000 parcels/day',
          description: 'Same-day sorting and courier tender point for Greater London.',
        },
      ],
    },
  ];

  const bins = [
    { id: 'loc_a1', wh: 'WH-01 (Milton Keynes)', zone: 'Zone A', aisle: 'A1', shelf: 'S01', bin: 'B01', type: 'SHELF', sku: 'NX-AUD-001', qty: 65, cap: 600 },
    { id: 'loc_a2', wh: 'WH-01 (Milton Keynes)', zone: 'Zone A', aisle: 'A1', shelf: 'S02', bin: 'B02', type: 'SHELF', sku: 'NX-CAM-002', qty: 18, cap: 600 },
    { id: 'loc_a3', wh: 'WH-01 (Milton Keynes)', zone: 'Zone A', aisle: 'A2', shelf: 'S01', bin: 'B03', type: 'SHELF', sku: 'NX-MOU-003', qty: 85, cap: 800 },
    { id: 'loc_a4', wh: 'WH-01 (Milton Keynes)', zone: 'Zone A', aisle: 'A2', shelf: 'S02', bin: 'B04', type: 'SHELF', sku: 'NX-KEY-004', qty: 24, cap: 800 },
    { id: 'loc_b1', wh: 'WH-01 (Milton Keynes)', zone: 'Zone B', aisle: 'B1', shelf: 'S01', bin: 'P01', type: 'PALLET', sku: 'NX-HUB-005', qty: 120, cap: 2500 },
    { id: 'loc_b2', wh: 'WH-01 (Milton Keynes)', zone: 'Zone B', aisle: 'B2', shelf: 'S01', bin: 'P02', type: 'PALLET', sku: 'APX-SPK-100', qty: 45, cap: 2500 },
    { id: 'loc_b3', wh: 'WH-01 (Milton Keynes)', zone: 'Zone B', aisle: 'B3', shelf: 'S01', bin: 'P03', type: 'PALLET', sku: 'BLT-SND-10', qty: 20, cap: 3000 },
    { id: 'loc_c1', wh: 'WH-02 (Manchester)', zone: 'Bulk Mezzanine', aisle: 'M1', shelf: 'S01', bin: 'BM01', type: 'SHELF', sku: 'NX-CHG-008', qty: 110, cap: 1500 },
    { id: 'loc_c2', wh: 'WH-02 (Manchester)', zone: 'Bulk Mezzanine', aisle: 'M2', shelf: 'S01', bin: 'BM02', type: 'SHELF', sku: 'NX-CAB-009', qty: 150, cap: 1500 },
    { id: 'loc_dmg', wh: 'WH-01 (Milton Keynes)', zone: 'Quarantine', aisle: 'Q1', shelf: 'S01', bin: 'Q-DMG', type: 'BIN', sku: 'NX-AUD-001 (Damaged)', qty: 2, cap: 200 },
    { id: 'loc_ret', wh: 'WH-01 (Milton Keynes)', zone: 'Returns Bay', aisle: 'R1', shelf: 'S01', bin: 'R-INSP', type: 'BIN', sku: 'Awaiting QA Test', qty: 3, cap: 300 },
  ];

  const filteredBins = bins.filter((b) =>
    b.bin.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.wh.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.zone.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              Warehouse Hubs & Bin Hierarchy
            </h1>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">
              Phase 2 Active
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Multi-location structure supporting 3 regional facilities, zones, aisles, and bin-level traceability (SRS FR-WH-01 to 04).
          </p>
        </div>

        {/* Sub-tab navigation */}
        <div className="flex items-center bg-gray-100 p-1 rounded-lg text-xs font-semibold">
          <button
            onClick={() => setActiveSubTab('WAREHOUSES')}
            className={`px-3 py-1.5 rounded-md transition ${
              activeSubTab === 'WAREHOUSES' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Facilities ({warehouses.length})
          </button>
          <button
            onClick={() => setActiveSubTab('LOCATIONS')}
            className={`px-3 py-1.5 rounded-md transition ${
              activeSubTab === 'LOCATIONS' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Location Bins & Aisles ({bins.length})
          </button>
        </div>
      </div>

      {activeSubTab === 'WAREHOUSES' ? (
        <div className="grid grid-cols-1 gap-4">
          {warehouses.map((wh) => (
            <div key={wh.id} className="bg-white border border-gray-200 rounded-lg p-5 shadow-2xs space-y-4 text-xs">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
                    <Warehouse className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{wh.name}</h3>
                    <div className="text-gray-500 font-mono text-[11px]">Facility Code: {wh.code} | Total Capacity: {wh.totalCapacity} (Occupancy: {wh.occupancy})</div>
                    <div className="text-gray-600 mt-0.5">{wh.address}</div>
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                  {wh.status}
                </span>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <h4 className="font-bold text-gray-800 mb-2 uppercase tracking-wide text-[11px]">
                  Zonal Layout & Location Bins
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {wh.zones.map((z, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                      <div className="font-bold text-gray-900 flex items-center justify-between">
                        <span>{z.name}</span>
                        <span className="text-[10px] font-mono px-1 rounded bg-gray-200 text-gray-700">
                          {z.type}
                        </span>
                      </div>
                      <div className="text-gray-600 font-mono text-[11px]">Aisles: {z.aisles}</div>
                      <div className="text-gray-600 font-medium">Capacity: {z.capacity}</div>
                      <p className="text-gray-500 text-[11px] pt-1">{z.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="p-3 border-b border-gray-200 bg-slate-50 flex items-center justify-between gap-3 text-xs">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search bin (e.g. B01, P02), SKU, warehouse..."
                className="w-full pl-8 pr-3 py-1 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <span className="text-gray-500 font-medium text-[11px]">
              Showing {filteredBins.length} of {bins.length} mapped warehouse locations
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Bin Identifier</th>
                  <th className="py-2.5 px-3">Warehouse Hub</th>
                  <th className="py-2.5 px-3">Zone & Aisle</th>
                  <th className="py-2.5 px-3">Storage Type</th>
                  <th className="py-2.5 px-3">Assigned SKU</th>
                  <th className="py-2.5 px-3">Current Qty</th>
                  <th className="py-2.5 px-3">Capacity Utilization</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {filteredBins.map((b) => {
                  const pct = Math.round((b.qty / b.cap) * 100);
                  return (
                    <tr key={b.id} className="hover:bg-gray-50 transition">
                      <td className="py-2.5 px-3 font-bold font-mono text-indigo-700">
                        {b.bin}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-gray-900">
                        {b.wh}
                      </td>
                      <td className="py-2.5 px-3 text-gray-600">
                        {b.zone} ({b.aisle})
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-[10px] text-gray-700">
                          {b.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-medium text-gray-900">
                        {b.sku}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-gray-900">
                        {b.qty} units
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center space-x-2">
                          <div className="w-24 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${Math.min(100, pct)}%` }}></div>
                          </div>
                          <span className="text-[10px] text-gray-500 font-mono">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
