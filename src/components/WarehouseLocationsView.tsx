import React, { useEffect, useMemo, useState } from 'react';
import { Warehouse, MapPin, CheckCircle, Search, Plus, X, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { User, SystemConfig } from '../types';

interface WarehouseLocationsViewProps {
  currentUser: User;
  config: SystemConfig;
  defaultTab?: 'WAREHOUSES' | 'LOCATIONS';
}

type WarehouseRow = {
  id: string; name: string; code: string; address: string; isActive: boolean;
  totalCapacity: number; occupiedQty: number;
  zones: Array<{ name: string; aisles: string; type: string; capacity: number; locationCount: number }>;
};
type LocationRow = {
  id: string; warehouseId: string; warehouseName: string; zone: string;
  aisle: string; shelf: string; bin: string; locationCode: string;
  locationType: string; capacityUnits: number; currentQty: number;
  occupiedQty: number; skuCount: number; isActive: boolean;
};

export const WarehouseLocationsView: React.FC<WarehouseLocationsViewProps> = ({
  currentUser,
  defaultTab = 'WAREHOUSES',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'WAREHOUSES' | 'LOCATIONS'>(defaultTab);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showWarehouseForm, setShowWarehouseForm] = useState(false);
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [warehouseForm, setWarehouseForm] = useState({ name: '', code: '', address: '' });
  const [locationForm, setLocationForm] = useState({
    warehouseId: '', locationCode: '', locationType: 'BIN',
    zone: '', aisle: '', shelf: '', bin: '', capacityUnits: '0',
  });

  useEffect(() => {
    if (defaultTab) setActiveSubTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    void loadData();
  }, [currentUser.id]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getWarehouseLayout();
      setWarehouses(result.warehouses || []);
      setLocations(result.locations || []);
      setLocationForm(current => ({
        ...current,
        warehouseId: current.warehouseId || result.warehouses?.[0]?.id || '',
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Warehouse data could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const filteredLocations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return locations;
    return locations.filter(location =>
      [location.locationCode, location.warehouseName, location.zone, location.aisle,
        location.shelf, location.bin, location.locationType]
        .some(value => value.toLowerCase().includes(term))
    );
  }, [locations, searchTerm]);

  const handleCreateWarehouse = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createWarehouse(warehouseForm);
      setWarehouseForm({ name: '', code: '', address: '' });
      setShowWarehouseForm(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Warehouse could not be created.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateLocation = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { warehouseId, capacityUnits, ...details } = locationForm;
      await api.createWarehouseLocation(warehouseId, {
        ...details,
        capacityUnits: Number(capacityUnits) || 0,
      });
      setLocationForm(current => ({
        ...current,
        locationCode: '', zone: '', aisle: '', shelf: '', bin: '', capacityUnits: '0',
      }));
      setShowLocationForm(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Warehouse location could not be created.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Warehouse Hubs & Bin Hierarchy</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">Live Database</span>
          </div>
          <p className="text-xs text-gray-500">
            Manage your organization's warehouses, zones, aisles, shelves, bins and receiving locations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void loadData()} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-gray-300 bg-white text-xs font-semibold text-gray-700 disabled:opacity-50">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={() => { setShowWarehouseForm(true); setShowLocationForm(false); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700">
            <Plus className="w-3.5 h-3.5" /> Add Warehouse
          </button>
          <button onClick={() => { setShowLocationForm(true); setShowWarehouseForm(false); }} disabled={warehouses.length === 0} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 disabled:opacity-40">
            <MapPin className="w-3.5 h-3.5" /> Add Location
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-rose-200 bg-rose-50 text-sm text-rose-800">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error"><X className="w-4 h-4" /></button>
        </div>
      )}

      {showWarehouseForm && (
        <form onSubmit={handleCreateWarehouse} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-bold text-sm text-gray-900">Create Warehouse</h2>
            <button type="button" onClick={() => setShowWarehouseForm(false)}><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-xs font-medium text-gray-600">Warehouse Name
              <input required maxLength={160} value={warehouseForm.name} onChange={e => setWarehouseForm({ ...warehouseForm, name: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="Main Fulfilment Warehouse" />
            </label>
            <label className="text-xs font-medium text-gray-600">Warehouse Code
              <input required maxLength={40} value={warehouseForm.code} onChange={e => setWarehouseForm({ ...warehouseForm, code: e.target.value.toUpperCase() })} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="WH-01" />
            </label>
            <label className="text-xs font-medium text-gray-600">Address
              <input maxLength={1000} value={warehouseForm.address} onChange={e => setWarehouseForm({ ...warehouseForm, address: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="Warehouse address" />
            </label>
          </div>
          <div className="flex justify-end">
            <button disabled={saving} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50">{saving ? 'Saving...' : 'Save Warehouse'}</button>
          </div>
        </form>
      )}

      {showLocationForm && (
        <form onSubmit={handleCreateLocation} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-bold text-sm text-gray-900">Create Warehouse Location</h2>
            <button type="button" onClick={() => setShowLocationForm(false)}><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="col-span-2 text-xs font-medium text-gray-600">Warehouse
              <select required value={locationForm.warehouseId} onChange={e => setLocationForm({ ...locationForm, warehouseId: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm">
                <option value="">Select warehouse</option>
                {warehouses.filter(warehouse => warehouse.isActive).map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} — {warehouse.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-gray-600">Location Code
              <input required maxLength={50} value={locationForm.locationCode} onChange={e => setLocationForm({ ...locationForm, locationCode: e.target.value.toUpperCase() })} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="A1-S01-B01" />
            </label>
            <label className="text-xs font-medium text-gray-600">Location Type
              <select value={locationForm.locationType} onChange={e => setLocationForm({ ...locationForm, locationType: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm">
                {['BIN', 'SHELF', 'PALLET', 'STAGING', 'QUARANTINE', 'RECEIVING'].map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            {(['zone', 'aisle', 'shelf', 'bin'] as const).map(field => (
              <label key={field} className="text-xs font-medium text-gray-600 capitalize">{field}
                <input value={locationForm[field]} onChange={e => setLocationForm({ ...locationForm, [field]: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm" />
              </label>
            ))}
            <label className="text-xs font-medium text-gray-600">Capacity (units)
              <input type="number" min="0" max="10000000" step="1" value={locationForm.capacityUnits} onChange={e => setLocationForm({ ...locationForm, capacityUnits: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm" />
            </label>
          </div>
          <div className="flex justify-end">
            <button disabled={saving} className="px-4 py-2 rounded-md bg-slate-800 text-white text-xs font-semibold disabled:opacity-50">{saving ? 'Saving...' : 'Save Location'}</button>
          </div>
        </form>
      )}

      <div className="flex items-center bg-gray-100 p-1 rounded-lg text-xs font-semibold w-fit">
        <button onClick={() => setActiveSubTab('WAREHOUSES')} className={`px-3 py-1.5 rounded-md transition ${activeSubTab === 'WAREHOUSES' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600 hover:text-gray-900'}`}>
          Facilities ({warehouses.length})
        </button>
        <button onClick={() => setActiveSubTab('LOCATIONS')} className={`px-3 py-1.5 rounded-md transition ${activeSubTab === 'LOCATIONS' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600 hover:text-gray-900'}`}>
          Location Bins & Aisles ({locations.length})
        </button>
      </div>

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">Loading warehouse data...</div>
      ) : activeSubTab === 'WAREHOUSES' ? (
        <div className="grid grid-cols-1 gap-4">
          {warehouses.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Warehouse className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-gray-900">No warehouses configured</h3>
              <p className="text-xs text-gray-500 mt-1">Create your first warehouse to start setting up receiving and storage locations.</p>
            </div>
          ) : warehouses.map(warehouse => {
            const occupancy = warehouse.totalCapacity > 0 ? Math.round(warehouse.occupiedQty / warehouse.totalCapacity * 100) : 0;
            return (
              <div key={warehouse.id} className="bg-white border border-gray-200 rounded-lg p-5 shadow-2xs space-y-4 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700"><Warehouse className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">{warehouse.name}</h3>
                      <div className="text-gray-500 font-mono text-[11px]">Facility Code: {warehouse.code} · {warehouse.zones.reduce((sum, zone) => sum + zone.locationCount, 0)} locations · Capacity: {warehouse.totalCapacity.toLocaleString()} units</div>
                      <div className="text-gray-600 mt-0.5">{warehouse.address || 'No address provided'}</div>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${warehouse.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>{warehouse.isActive ? 'Active' : 'Inactive'}</span>
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <h4 className="font-bold text-gray-800 mb-2 uppercase tracking-wide text-[11px]">Zonal Layout & Location Bins</h4>
                  {warehouse.zones.length === 0 ? <p className="text-gray-500">No zones or locations have been added yet.</p> : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {warehouse.zones.map(zone => (
                        <div key={zone.name} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                          <div className="font-bold text-gray-900 flex items-center justify-between"><span>{zone.name}</span><span className="text-[10px] font-mono px-1 rounded bg-gray-200 text-gray-700">{zone.type || '—'}</span></div>
                          <div className="text-gray-600 font-mono text-[11px]">Aisles: {zone.aisles}</div>
                          <div className="text-gray-600 font-medium">Capacity: {zone.capacity.toLocaleString()} units</div>
                          <p className="text-gray-500 text-[11px] pt-1">{zone.locationCount} configured location(s)</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-[11px] text-gray-500">Current occupancy: {warehouse.occupiedQty.toLocaleString()} / {warehouse.totalCapacity.toLocaleString()} units ({occupancy}%)</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="p-3 border-b border-gray-200 bg-slate-50 flex items-center justify-between gap-3 text-xs">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search location code, zone, aisle, warehouse..." className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
            <span className="text-gray-500 font-medium text-[11px]">Showing {filteredLocations.length} of {locations.length} database locations</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Location Code</th><th className="py-2.5 px-3">Warehouse</th><th className="py-2.5 px-3">Zone / Aisle / Shelf / Bin</th><th className="py-2.5 px-3">Type</th><th className="py-2.5 px-3">On-hand Qty</th><th className="py-2.5 px-3">Capacity</th><th className="py-2.5 px-3">SKUs</th><th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {filteredLocations.map(location => {
                  const pct = location.capacityUnits > 0 ? Math.round(location.occupiedQty / location.capacityUnits * 100) : 0;
                  return (
                    <tr key={location.id} className="hover:bg-gray-50 transition">
                      <td className="py-2.5 px-3 font-bold font-mono text-indigo-700">{location.locationCode}</td>
                      <td className="py-2.5 px-3 font-medium text-gray-900">{location.warehouseName}</td>
                      <td className="py-2.5 px-3 text-gray-600">{[location.zone, location.aisle, location.shelf, location.bin].filter(Boolean).join(' / ') || '—'}</td>
                      <td className="py-2.5 px-3"><span className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-[10px] text-gray-700">{location.locationType}</span></td>
                      <td className="py-2.5 px-3 font-bold text-gray-900">{location.currentQty.toLocaleString()} units</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center space-x-2">
                          <div className="w-20 bg-gray-200 rounded-full h-1.5 overflow-hidden"><div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} /></div>
                          <span className="text-[10px] text-gray-500 font-mono">{location.capacityUnits > 0 ? `${pct}%` : '—'}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">{location.skuCount}</td>
                      <td className="py-2.5 px-3">{location.isActive ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle className="w-3.5 h-3.5" />Active</span> : <span className="text-gray-500">Inactive</span>}</td>
                    </tr>
                  );
                })}
                {filteredLocations.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-gray-500">No locations found. Add a warehouse location to begin.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
