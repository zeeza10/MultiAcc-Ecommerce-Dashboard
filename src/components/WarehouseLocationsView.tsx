import React from 'react';
import { Warehouse, MapPin, Layers, CheckCircle } from 'lucide-react';
import { User, SystemConfig } from '../types';

interface WarehouseLocationsViewProps {
  currentUser: User;
  config: SystemConfig;
}

export const WarehouseLocationsView: React.FC<WarehouseLocationsViewProps> = () => {
  const warehouses = [
    {
      id: 'wh_main',
      name: 'Nexus Central Fulfillment Hub',
      code: 'WH-01',
      address: 'Unit 4, Gateway Logistics Park, Milton Keynes, MK17 8EB, UK',
      zones: [
        {
          name: 'Zone A - Fast-Pick Mezzanine',
          aisles: 'A1 - A4',
          type: 'SHELF / BIN',
          capacity: '12,000 units',
          description: 'High-velocity active pick locations for daily e-commerce parcel dispatch.',
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
  ];

  return (
    <div className="space-y-4">
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
            Multi-location structure supporting zones, aisles, shelves, and bin-level traceability (SRS FR-WH-01 to 04).
          </p>
        </div>
      </div>

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
                  <div className="text-gray-500 font-mono text-[11px]">Facility Code: {wh.code}</div>
                  <div className="text-gray-600 mt-0.5">{wh.address}</div>
                </div>
              </div>

              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                Operational
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
    </div>
  );
};
