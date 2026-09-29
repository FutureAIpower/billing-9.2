import React, { useState, useEffect } from 'react';
import { X, Download, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { format } from 'date-fns';
import { usePlateSizes } from '../hooks/usePlateSizes';
import { useSettings } from '../contexts/SettingsContext';
import { supabase } from '../utils/supabase';

interface ItemsData {
  [key: string]: any;
  main_note: string | null;
}

interface FormItems {
  [key: string]: any;
  main_note: string | null;
}

interface ChallanData {
  challanNumber: string;
  date: string;
  clientNicName: string;
  clientFullName: string;
  site: string;
  phone: string;
  driverName: string | null;
  driverMobile?: string | null;
  vehicleNumber?: string | null;
  loadingUnloadingCharges?: number;
  vehicleRent?: number;
  deposit?: number;
  isAlternativeSite: boolean;
  isSecondaryPhone: boolean;
  items: ItemsData;
  totalItems: number;
  clientId?: string;
  category?: 'shuttering' | 'jack' | 'cuplock' | 'other';
}

interface ChallanEditModalProps {
  challan: ChallanData | null;
  type: 'udhar' | 'jama';
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

const ChallanEditModal: React.FC<ChallanEditModalProps> = ({
  challan,
  type,
  isOpen,
  onClose,
  onSave,
}) => {
  const { t, language } = useLanguage();
  const { showExtraCost, enableCategorySeparation, activeCategory, jackMaterialType } = useSettings();
  const { sizes: rawPlateSizes } = usePlateSizes();

  const plateSizes = React.useMemo(() => {
    if (!enableCategorySeparation) return rawPlateSizes;
    const targetCategory = challan?.category || activeCategory || 'shuttering';
    return rawPlateSizes.filter(size => (size.category || 'shuttering') === targetCategory);
  }, [rawPlateSizes, enableCategorySeparation, challan?.category, activeCategory]);

  const getCategoryHeading = () => {
    if (enableCategorySeparation) {
      const targetCategory = challan?.category || activeCategory || 'shuttering';
      if (targetCategory === 'jack') return language === 'gu' ? (jackMaterialType === 'wooden' ? 'ટેકાની વિગતો' : 'જેકની વિગતો') : (jackMaterialType === 'wooden' ? 'Teka Details' : 'Jack Details');
      if (targetCategory === 'cuplock') return language === 'gu' ? 'કપલોકની વિગતો' : 'Cuplock Details';
      if (targetCategory === 'other') return language === 'gu' ? 'અન્ય આઈટમ્સની વિગતો' : 'Other Items Details';
      return language === 'gu' ? 'શટરિંગની વિગતો' : 'Shuttering Details';
    }
    return t('itemsDetails');
  };
  const [loading, setLoading] = useState(false);
  const [itemSearch, setItemSearch] = useState('');

  const displayedPlateSizes = React.useMemo(() => {
    if (!itemSearch.trim()) return plateSizes;
    const query = itemSearch.toLowerCase().replace(/[૦-૯]/g, d => String(['૦','૧','૨','૩','૪','૫','૬','૭','૮','૯'].indexOf(d))).replace(/[*×]/g, 'x').trim();
    return plateSizes.filter(ps => {
      const name = (ps.name || '').toLowerCase().replace(/[૦-૯]/g, d => String(['૦','૧','૨','૩','૪','૫','૬','૭','૮','૯'].indexOf(d))).replace(/[*×]/g, 'x');
      return name.includes(query) || name.replace(/\s+/g, '').includes(query.replace(/\s+/g, ''));
    });
  }, [plateSizes, itemSearch]);
  const [date, setDate] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverMobile, setDriverMobile] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [loadingUnloadingCharges, setLoadingUnloadingCharges] = useState('');
  const [vehicleRent, setVehicleRent] = useState('');
  const [deposit, setDeposit] = useState('');
  const [alternativeSite, setAlternativeSite] = useState('');
  const [secondaryPhone, setSecondaryPhone] = useState('');
  const [items, setItems] = useState<FormItems>({
    main_note: null,
  });
  const [originalItems, setOriginalItems] = useState<ItemsData>({
    main_note: null,
  });
  const [showExtraPortion, setShowExtraPortion] = useState(false);

  useEffect(() => {
    if (challan && isOpen) {
      setDate(challan.date || '');
      setDriverName(challan.driverName || '');
      setDriverMobile(challan.driverMobile || '');
      setVehicleNumber(challan.vehicleNumber || '');
      setLoadingUnloadingCharges(challan.loadingUnloadingCharges ? String(challan.loadingUnloadingCharges) : '');
      setVehicleRent(challan.vehicleRent ? String(challan.vehicleRent) : '');
      setDeposit(challan.deposit ? String(challan.deposit) : '');
      setAlternativeSite(challan.isAlternativeSite ? challan.site : '');
      setSecondaryPhone(challan.isSecondaryPhone ? challan.phone : '');
      setOriginalItems(challan.items);

      const mapped: FormItems = {
        main_note: challan.items.main_note || null,
      };

      if (challan.items.items) {
        Object.entries(challan.items.items).forEach(([sizeId, val]: [string, any]) => {
          mapped[`size_${sizeId}_qty`] = val.qty || null;
          mapped[`size_${sizeId}_borrowed`] = val.borrowed || null;
          mapped[`size_${sizeId}_lost`] = val.lost || null;
          mapped[`size_${sizeId}_damaged`] = val.damaged || null;
          mapped[`size_${sizeId}_note`] = val.note || null;
          mapped[`size_${sizeId}_extraPortion`] = val.extraPortion || null;
          mapped[`size_${sizeId}_extraQty`] = val.extraQty || null;
        });
      } else {
        Object.keys(challan.items).forEach((key) => {
          if (key.startsWith('size_')) {
            const val = challan.items[key];
            if (key.endsWith('_qty') || key.endsWith('_borrowed') || key.endsWith('_lost') || key.endsWith('_damaged') || key.endsWith('_extraQty')) {
              mapped[key] = val === 0 ? null : val;
            } else {
              mapped[key] = val || null;
            }
          }
        });
      }

      let hasExistingExtra = false;
      if (challan.items.items) {
        hasExistingExtra = Object.values(challan.items.items).some((val: any) => val.extraPortion || (val.extraQty || 0) > 0);
      } else {
        hasExistingExtra = Object.keys(challan.items).some(k => (k.endsWith('_extraPortion') && challan.items[k]) || (k.endsWith('_extraQty') && Number(challan.items[k]) > 0));
      }
      setShowExtraPortion(hasExistingExtra);

      setItems(mapped);
    }
  }, [challan, isOpen]);

  useEffect(() => {
    if (isOpen && challan) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen, challan]);

  const isJackIron = (ps: PlateSize) => ps.category === 'jack' && jackMaterialType === 'iron';
  const hasJackIronRows = React.useMemo(() => plateSizes.some(isJackIron), [plateSizes, jackMaterialType]);

  const handleItemChange = (size: number, field: 'qty' | 'borrowed' | 'lost' | 'damaged' | 'note' | 'extraQty', value: string | number) => {
    setItems(prev => ({
      ...prev,
      [`size_${size}_${field}`]: field === 'note' ? (value === '' ? null : value) : (value === '' ? null : Number(value)),
    } as unknown as FormItems));
  };

  const handleExtraPortionToggle = (size: number, portion: 'inner' | 'outer') => {
    const currentPortion = (items as any)[`size_${size}_extraPortion`];
    const isDeselecting = currentPortion === portion;
    setItems(prev => ({
      ...prev,
      [`size_${size}_extraPortion`]: isDeselecting ? null : portion,
      [`size_${size}_extraQty`]: isDeselecting ? null : (prev as any)[`size_${size}_extraQty`] || null,
    }));
  };

  if (!isOpen || !challan) return null;

  const handleSave = async () => {
    if (!challan?.clientId) {
      toast.error(t('clientIdNotFound'));
      return;
    }

    setLoading(true);
    try {
      const rpcFunction = type === 'udhar' ? 'update_udhar_challan_with_stock' : 'update_jama_challan_with_stock';
      const dateField = type === 'udhar' ? 'p_udhar_date' : 'p_jama_date';

      // Build old_items JSONB array
      const oldItems: any[] = [];
      rawPlateSizes.forEach((ps) => {
        let qty = 0, borrowed = 0, lost = 0, damaged = 0, note = '', extraPortion: any = null, extraQty = 0;
        if (originalItems.items && originalItems.items[ps.id]) {
          const item = originalItems.items[ps.id];
          qty = Number(item.qty) || 0;
          borrowed = Number(item.borrowed) || 0;
          lost = Number(item.lost) || 0;
          damaged = Number(item.damaged) || 0;
          note = item.note || '';
          extraPortion = item.extraPortion || null;
          extraQty = Number(item.extraQty) || 0;
        } else {
          qty = Number((originalItems as any)[`size_${ps.id}_qty`]) || 0;
          borrowed = Number((originalItems as any)[`size_${ps.id}_borrowed`]) || 0;
          lost = Number((originalItems as any)[`size_${ps.id}_lost`]) || 0;
          damaged = Number((originalItems as any)[`size_${ps.id}_damaged`]) || 0;
          note = (originalItems as any)[`size_${ps.id}_note`] || '';
          extraPortion = (originalItems as any)[`size_${ps.id}_extraPortion`] || null;
          extraQty = Number((originalItems as any)[`size_${ps.id}_extraQty`]) || 0;
        }
        if (qty > 0 || borrowed > 0 || lost > 0 || damaged > 0 || note || extraQty > 0) {
          oldItems.push({ size_id: ps.id, qty, borrowed, lost, damaged, note, extraPortion, extraQty });
        }
      });

      // Build new_items JSONB array from the form state
      const newItems: any[] = [];
      rawPlateSizes.forEach((ps) => {
        const isVisible = plateSizes.some(p => p.id === ps.id);
        const source = isVisible ? items : originalItems;
        let qty = 0, borrowed = 0, lost = 0, damaged = 0, note = '', extraPortion: any = null, extraQty = 0;
        if (!isVisible && (source as any).items && (source as any).items[ps.id]) {
          const item = (source as any).items[ps.id];
          qty = Number(item.qty) || 0;
          borrowed = Number(item.borrowed) || 0;
          lost = Number(item.lost) || 0;
          damaged = Number(item.damaged) || 0;
          note = item.note || '';
          extraPortion = item.extraPortion || null;
          extraQty = Number(item.extraQty) || 0;
        } else {
          qty = Number((source as any)[`size_${ps.id}_qty`]) || 0;
          borrowed = Number((source as any)[`size_${ps.id}_borrowed`]) || 0;
          lost = Number((source as any)[`size_${ps.id}_lost`]) || 0;
          damaged = Number((source as any)[`size_${ps.id}_damaged`]) || 0;
          note = (source as any)[`size_${ps.id}_note`] || '';
          extraPortion = (source as any)[`size_${ps.id}_extraPortion`] || null;
          extraQty = Number((source as any)[`size_${ps.id}_extraQty`]) || 0;
        }
        if (qty > 0 || borrowed > 0 || lost > 0 || damaged > 0 || note || extraQty > 0) {
          newItems.push({ size_id: ps.id, qty, borrowed, lost, damaged, note, extraPortion, extraQty });
        }
      });

      const targetTable = type === 'udhar' ? 'udhar_challans' : 'jama_challans';
      const targetItemsTable = type === 'udhar' ? 'udhar_items' : 'jama_items';
      const targetNumField = type === 'udhar' ? 'udhar_challan_number' : 'jama_challan_number';
      const dateCol = type === 'udhar' ? 'udhar_date' : 'jama_date';

      let rpcSuccess = false;

      // 1. Try RPC update first
      try {
        // Attempt with full parameters (with driver_mobile & vehicle_number)
        let rpcRes = await supabase.rpc(rpcFunction, {
          p_challan_number: challan.challanNumber,
          p_client_id: challan.clientId,
          p_alternative_site: alternativeSite || null,
          p_secondary_phone_number: secondaryPhone || null,
          [dateField]: date,
          p_driver_name: driverName || null,
          p_driver_mobile: driverMobile || null,
          p_vehicle_number: vehicleNumber || null,
          p_old_items: oldItems,
          p_new_items: newItems,
          p_new_main_note: items.main_note,
        });

        // If that failed due to param signature mismatch, try without driver_mobile & vehicle_number
        if (rpcRes.error) {
          rpcRes = await supabase.rpc(rpcFunction, {
            p_challan_number: challan.challanNumber,
            p_client_id: challan.clientId,
            p_alternative_site: alternativeSite || null,
            p_secondary_phone_number: secondaryPhone || null,
            [dateField]: date,
            p_driver_name: driverName || null,
            p_old_items: oldItems,
            p_new_items: newItems,
            p_new_main_note: items.main_note,
          });
        }

        if (!rpcRes.error) {
          const rpcData = rpcRes.data;
          if (!rpcData || typeof rpcData !== 'object' || !('success' in rpcData) || (rpcData as any).success) {
            rpcSuccess = true;
          }
        }
      } catch (rpcErr) {
        console.warn("RPC update attempt failed, falling back to direct table update:", rpcErr);
      }

      // 2. Direct Table Updates (Always updates challan metadata & extra costs, and handles items/stock if RPC didn't)
      const challanUpdatePayload: any = {
        client_id: challan.clientId,
        alternative_site: alternativeSite || null,
        secondary_phone_number: secondaryPhone || null,
        [dateCol]: date,
        driver_name: driverName || null,
        driver_mobile: driverMobile || null,
        vehicle_number: vehicleNumber || null,
        loading_unloading_charges: loadingUnloadingCharges ? parseFloat(loadingUnloadingCharges) || 0 : 0,
        vehicle_rent: vehicleRent ? parseFloat(vehicleRent) || 0 : 0,
        deposit: deposit ? parseFloat(deposit) || 0 : 0,
      };

      const { error: chUpdateError } = await supabase
        .from(targetTable)
        .update(challanUpdatePayload)
        .eq(targetNumField, challan.challanNumber);

      if (chUpdateError) throw chUpdateError;

      // Update Items table directly
      const { error: itemsUpdateError } = await supabase
        .from(targetItemsTable)
        .update({
          items: newItems,
          main_note: items.main_note || null,
        })
        .eq(targetNumField, challan.challanNumber);

      if (itemsUpdateError) console.warn("Notice: items table direct update:", itemsUpdateError);

      // If RPC was not used or failed, compute and apply stock deltas directly
      if (!rpcSuccess) {
        for (const ps of plateSizes) {
          const oldItem = oldItems.find(i => i.size_id === ps.id) || { qty: 0, borrowed: 0, lost: 0, damaged: 0 };
          const newItem = newItems.find(i => i.size_id === ps.id) || { qty: 0, borrowed: 0, lost: 0, damaged: 0 };

          if (type === 'udhar') {
            const deltaQty = (newItem.qty || 0) - (oldItem.qty || 0);
            const deltaBorrowed = (newItem.borrowed || 0) - (oldItem.borrowed || 0);

            if (deltaQty > 0 || deltaBorrowed > 0) {
              await supabase.rpc('increment_stock', {
                p_size: ps.id,
                p_on_rent_increment: Math.max(0, deltaQty),
                p_borrowed_increment: Math.max(0, deltaBorrowed),
              });
            }
            if (deltaQty < 0 || deltaBorrowed < 0) {
              await supabase.rpc('decrement_stock', {
                p_size: ps.id,
                p_on_rent_decrement: Math.max(0, -deltaQty),
                p_borrowed_decrement: Math.max(0, -deltaBorrowed),
              });
            }
          } else {
            // type === 'jama' (return items)
            const deltaQty = (newItem.qty || 0) - (oldItem.qty || 0);
            const deltaBorrowed = (newItem.borrowed || 0) - (oldItem.borrowed || 0);
            const deltaLost = (newItem.lost || 0) - (oldItem.lost || 0);
            const deltaDamaged = (newItem.damaged || 0) - (oldItem.damaged || 0);

            if (deltaQty > 0 || deltaBorrowed > 0) {
              await supabase.rpc('decrement_stock', {
                p_size: ps.id,
                p_on_rent_decrement: Math.max(0, deltaQty),
                p_borrowed_decrement: Math.max(0, deltaBorrowed),
              });
            }
            if (deltaQty < 0 || deltaBorrowed < 0) {
              await supabase.rpc('increment_stock', {
                p_size: ps.id,
                p_on_rent_increment: Math.max(0, -deltaQty),
                p_borrowed_increment: Math.max(0, -deltaBorrowed),
              });
            }
            if (deltaLost !== 0) {
              await supabase.rpc('adjust_lost_stock', {
                p_size: ps.id,
                p_lost_delta: deltaLost,
              });
            }
            if (deltaDamaged !== 0) {
              await supabase.rpc('adjust_damaged_stock', {
                p_size: ps.id,
                p_damaged_delta: deltaDamaged,
              });
            }
          }
        }
      }

      // Stock history for jama lost/damaged changes
      if (type === 'jama') {
        const lostDelta: { [key: number]: number } = {};
        const damagedDelta: { [key: number]: number } = {};
        plateSizes.forEach((ps) => {
          const oldItem = oldItems.find(i => i.size_id === ps.id);
          const newItem = newItems.find(i => i.size_id === ps.id);
          const oldLost = oldItem?.lost || 0;
          const newLost = newItem?.lost || 0;
          if (newLost !== oldLost) lostDelta[ps.id] = newLost - oldLost;
          const oldDamaged = oldItem?.damaged || 0;
          const newDamaged = newItem?.damaged || 0;
          if (newDamaged !== oldDamaged) damagedDelta[ps.id] = newDamaged - oldDamaged;
        });
        for (const delta of [
          { type: 'lost', items: lostDelta },
          { type: 'damaged', items: damagedDelta },
        ]) {
          if (Object.keys(delta.items).length > 0) {
            await supabase.from('stock_history').insert({
              type: delta.type,
              party_name: challan.clientNicName || '',
              note: `ચલણ #${challan.challanNumber} સુધારેલ`,
              amount: 0,
              items: delta.items,
              date: new Date().toISOString(),
            });
          }
        }
      }

      toast.success(t('challanUpdated') || 'ચલણ સફળતાપૂર્વક અપડેટ થયું');
      onSave();
      onClose();
    } catch (error: any) {
      console.error('Error updating challan:', error);
      toast.error(error?.message || t('errorUpdatingChallan'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-sm sm:p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between gap-2 px-4 py-3 bg-white border-b border-gray-200 sm:px-6 sm:py-4">
          <h2 className="flex-1 text-lg font-bold text-gray-900 sm:text-2xl">
            {t('edit')} {type === 'udhar' ? t('udharChallan') : t('jamaChallan')}
          </h2>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-gray-400 transition-colors hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-4 space-y-4 sm:p-6 sm:space-y-6">
          <div className="p-3 rounded-lg bg-gray-50 sm:p-4">
            <h3 className="mb-3 text-base font-semibold text-gray-900 sm:text-lg">{t('challanDetails')}</h3>
            <div className="space-y-3 sm:space-y-4">
              {/* Date and Driver Name Row */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-700 sm:text-sm">
                    {t('date')}
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-700 sm:text-sm">
                    {t('driverName')}
                  </label>
                  <input
                    type="text"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Driver Mobile and Vehicle Number Row */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-700 sm:text-sm">
                    {t('driverPhone') || 'Driver Mobile'}
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={driverMobile}
                    onChange={(e) => setDriverMobile(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-700 sm:text-sm">
                    {t('vehicleNumber') || 'Vehicle Number'}
                  </label>
                  <input
                    type="text"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Phone Number and Site Row */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-700 sm:text-sm">
                    {t('secondaryPhone')}
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={secondaryPhone}
                    onChange={(e) => setSecondaryPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-700 sm:text-sm">
                    {t('alternativeSite')}
                  </label>
                  <input
                    type="text"
                    value={alternativeSite}
                    onChange={(e) => setAlternativeSite(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Extra Cost Section (3 columns) */}
              {showExtraCost && (
                <div className="p-3 border border-amber-200 rounded-lg bg-amber-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-amber-900 sm:text-sm">
                      {t('extraCostOption') || 'Extra Cost'}
                    </label>
                    <span className="text-xs text-gray-500">{t('optional') || 'Optional'}</span>
                  </div>
                  <div className={`grid grid-cols-1 ${type === 'jama' ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-3`}>
                    <div>
                      <label className="block mb-1 text-xs font-medium text-gray-700">
                        1. {type === 'udhar' ? (t('loadingUnloadingChargesUdhar') || 'Loading') : (t('loadingUnloadingChargesJama') || 'Unloading')}
                      </label>
                      <div className="relative">
                        <span className="absolute text-gray-500 transform -translate-y-1/2 left-2.5 top-1/2 text-xs">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={loadingUnloadingCharges}
                          onChange={(e) => setLoadingUnloadingCharges(e.target.value)}
                          placeholder="0"
                          className="w-full py-1.5 pl-6 pr-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block mb-1 text-xs font-medium text-gray-700">
                        2. {t('vehicleRent') || 'Vehicle Rent'}
                      </label>
                      <div className="relative">
                        <span className="absolute text-gray-500 transform -translate-y-1/2 left-2.5 top-1/2 text-xs">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={vehicleRent}
                          onChange={(e) => setVehicleRent(e.target.value)}
                          placeholder="0"
                          className="w-full py-1.5 pl-6 pr-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                    {type !== 'jama' && (
                      <div>
                        <label className="block mb-1 text-xs font-medium text-gray-700">
                          3. {t('deposit') || 'Deposit'}
                        </label>
                        <div className="relative">
                          <span className="absolute text-gray-500 transform -translate-y-1/2 left-2.5 top-1/2 text-xs">₹</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={deposit}
                            onChange={(e) => setDeposit(e.target.value)}
                            placeholder="0"
                            className="w-full py-1.5 pl-6 pr-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 bg-white border border-gray-200 rounded-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <h3 className="text-lg font-semibold text-gray-900">{getCategoryHeading()}</h3>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute text-gray-400 transform -translate-y-1/2 left-2.5 top-1/2 w-4 h-4 pointer-events-none" />
                  <input
                    type="text"
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    placeholder={language === 'gu' ? 'આઈટમ શોધો...' : 'Search items...'}
                    className="w-full pl-8 pr-7 py-1.5 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {itemSearch && (
                    <button
                      type="button"
                      onClick={() => setItemSearch('')}
                      className="absolute transform -translate-y-1/2 right-2 top-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {hasJackIronRows && (
                  <button
                    type="button"
                    onClick={() => setShowExtraPortion(!showExtraPortion)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-600 transition-colors rounded-lg bg-blue-50 hover:bg-blue-100 touch-manipulation active:scale-95 border border-blue-100 shrink-0"
                    title={language === 'gu' ? 'વધારે (ઈનર/આઉટર)' : 'Extra (Inner/Outer)'}
                  >
                    {!showExtraPortion ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{language === 'gu' ? 'વધારે' : 'Extra'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-xs font-medium text-left text-gray-500 uppercase">
                      {t('size')}
                    </th>
                    <th className="px-4 py-2 text-xs font-medium text-left text-gray-500 uppercase">
                      {t('quantity')}
                    </th>
                    {hasJackIronRows && showExtraPortion && (
                      <th className="px-4 py-2 text-xs font-semibold text-center text-blue-700 uppercase bg-blue-50/50 min-w-[130px]">
                        {t('extraPortion') || 'ઈનર/આઉટર'}
                      </th>
                    )}
                    {type === 'jama' && (
                      <>
                        <th className="px-4 py-2 text-xs font-medium text-left text-amber-700 uppercase">
                          {t('lost')}
                        </th>
                        <th className="px-4 py-2 text-xs font-medium text-left text-rose-700 uppercase">
                          {t('damaged')}
                        </th>
                      </>
                    )}
                    <th className="px-4 py-2 text-xs font-medium text-left text-gray-500 uppercase">
                      {t('borrowedStock')}
                    </th>
                    <th className="px-4 py-2 text-xs font-medium text-left text-gray-500 uppercase">
                      {t('note')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {displayedPlateSizes.map((ps) => (
                    <tr key={ps.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm font-medium text-gray-900 whitespace-nowrap">
                        {ps.name}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={(items as FormItems)[`size_${ps.id}_qty` as keyof FormItems] ?? ''}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => handleItemChange(ps.id, 'qty', e.target.value)}
                          className="w-24 px-3 py-2.5 text-sm text-center font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px]"
                        />
                      </td>
                      {hasJackIronRows && showExtraPortion && (
                        <td className="px-3 py-2 text-center whitespace-nowrap bg-blue-50/20">
                          {isJackIron(ps) ? (
                            <div className="flex flex-col items-center gap-1">
                              <div className="inline-flex rounded-md shadow-xs border border-gray-300 text-xs font-bold overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => handleExtraPortionToggle(ps.id, 'inner')}
                                  className={`px-2 py-1 transition-colors ${(items as any)[`size_${ps.id}_extraPortion`] === 'inner'
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-white text-gray-500 hover:bg-gray-50'
                                    }`}
                                >
                                  {t('inner') || 'Inner'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleExtraPortionToggle(ps.id, 'outer')}
                                  className={`px-2 py-1 border-l border-gray-300 transition-colors ${(items as any)[`size_${ps.id}_extraPortion`] === 'outer'
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-white text-gray-500 hover:bg-gray-50'
                                    }`}
                                >
                                  {t('outer') || 'Outer'}
                                </button>
                              </div>
                              <input
                                type="number"
                                min="0"
                                inputMode="numeric"
                                disabled={!(items as any)[`size_${ps.id}_extraPortion`]}
                                value={(items as any)[`size_${ps.id}_extraQty`] ?? ''}
                                onChange={(e) => handleItemChange(ps.id, 'extraQty', e.target.value)}
                                placeholder="0"
                                className="w-16 px-2 py-1 text-xs text-center border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:opacity-50"
                              />
                            </div>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                      )}
                      {type === 'jama' && (
                        <>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              value={(items as FormItems)[`size_${ps.id}_lost` as keyof FormItems] ?? ''}
                              onChange={(e) => handleItemChange(ps.id, 'lost', e.target.value)}
                              className="w-24 px-3 py-2.5 text-sm text-center border border-amber-400 bg-amber-50/50 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent min-h-[44px]"
                            />
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              value={(items as FormItems)[`size_${ps.id}_damaged` as keyof FormItems] ?? ''}
                              onChange={(e) => handleItemChange(ps.id, 'damaged', e.target.value)}
                              className="w-24 px-3 py-2.5 text-sm text-center border border-rose-400 bg-rose-50/50 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent min-h-[44px]"
                            />
                          </td>
                        </>
                      )}
                      <td className="px-4 py-2 whitespace-nowrap">
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={(items as FormItems)[`size_${ps.id}_borrowed` as keyof FormItems] ?? ''}
                          onChange={(e) => handleItemChange(ps.id, 'borrowed', e.target.value)}
                          className="w-24 px-3 py-2.5 text-sm text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px]"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={(items as FormItems)[`size_${ps.id}_note` as keyof FormItems] || ''}
                          onChange={(e) => handleItemChange(ps.id, 'note', e.target.value)}
                          className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px]"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Responsive Layout - Horizontal Scroll Table */}
            <div className="-mx-4 md:hidden">
              <div className="overflow-x-auto">
                <div className="inline-block min-w-full align-middle">
                  <div className="overflow-hidden">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className="bg-gray-100 border-b-2 border-gray-300">
                          <th className="sticky left-0 z-5 px-1 py-1.5 text-xs font-bold text-center text-gray-700 bg-gray-100 border-r-2 border-gray-300 w-12 sm:px-2 sm:text-sm">
                            {t('size')}
                          </th>
                          <th className="px-1 py-1.5 text-[10px] sm:text-xs font-semibold text-center text-gray-700 border-r border-gray-200 min-w-[60px] sm:min-w-[70px]">
                            {t('quantity')}
                          </th>
                          {hasJackIronRows && showExtraPortion && (
                            <th className="px-1 py-1.5 text-xs sm:text-sm font-semibold text-center text-blue-700 bg-blue-50/50 border-r border-gray-200 min-w-[68px] sm:min-w-[76px]">
                              {language === 'gu' ? 'વધારાનું' : (t('extraPortion') || 'Extra')}
                            </th>
                          )}
                          {type === 'jama' && (
                            <>
                              <th className="px-1 py-1.5 text-[10px] sm:text-xs font-semibold text-center text-amber-700 border-r border-gray-200 min-w-[60px] sm:min-w-[70px]">
                                {t('lost')}
                              </th>
                              <th className="px-1 py-1.5 text-[10px] sm:text-xs font-semibold text-center text-rose-700 border-r border-gray-200 min-w-[60px] sm:min-w-[70px]">
                                {t('damaged')}
                              </th>
                            </>
                          )}
                          <th className="px-1 py-1.5 text-[10px] sm:text-xs font-semibold text-center text-gray-700 border-r border-gray-200 min-w-[60px] sm:min-w-[70px]">
                            {t('borrowedStock')}
                          </th>
                          <th className="px-1 py-1.5 text-[10px] sm:text-xs font-semibold text-center text-gray-700 min-w-[100px] sm:min-w-[120px]">
                            {t('note')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {displayedPlateSizes.map((ps, index) => (
                          <tr
                            key={ps.id}
                            className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                          >
                            <td className="sticky left-0 z-5 px-1 py-1.5 text-xs font-bold text-center text-gray-900 border-r-2 border-gray-300 sm:px-2 sm:text-sm bg-inherit">
                              {ps.name}
                            </td>
                            <td className="px-1 py-1.5 border-r border-gray-200">
                              <input
                                type="number"
                                min="0"
                                inputMode="numeric"
                                value={(items as FormItems)[`size_${ps.id}_qty` as keyof FormItems] ?? ''}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => handleItemChange(ps.id, 'qty', e.target.value)}
                                className="w-full px-2 py-2 text-[16px] sm:text-sm text-center font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[42px] sm:min-h-[44px] touch-manipulation active:scale-[0.97]"
                              />
                            </td>
                            {hasJackIronRows && showExtraPortion && (
                              <td className="px-1 py-1.5 text-center border-r border-gray-200 bg-blue-50/20 min-w-[68px] sm:min-w-[76px]">
                                {isJackIron(ps) ? (
                                  <div className="flex flex-col gap-1 items-center justify-center">
                                    <div className="inline-flex w-full rounded-md border border-gray-300 bg-gray-100 p-0.5 text-[10px] font-semibold">
                                      <button
                                        type="button"
                                        onClick={() => handleExtraPortionToggle(ps.id, 'inner')}
                                        className={`flex-1 py-0.5 rounded text-center transition-all ${(items as any)[`size_${ps.id}_extraPortion`] === 'inner'
                                            ? 'bg-blue-600 text-white shadow-xs font-bold'
                                            : 'text-gray-600 hover:text-gray-900'
                                          }`}
                                      >
                                        {language === 'gu' ? 'ઈનર' : 'In'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleExtraPortionToggle(ps.id, 'outer')}
                                        className={`flex-1 py-0.5 rounded text-center transition-all ${(items as any)[`size_${ps.id}_extraPortion`] === 'outer'
                                            ? 'bg-blue-600 text-white shadow-xs font-bold'
                                            : 'text-gray-600 hover:text-gray-900'
                                          }`}
                                      >
                                        {language === 'gu' ? 'આઉટર' : 'Out'}
                                      </button>
                                    </div>
                                    <input
                                      type="number"
                                      min="0"
                                      inputMode="numeric"
                                      disabled={!(items as any)[`size_${ps.id}_extraPortion`]}
                                      value={(items as any)[`size_${ps.id}_extraQty`] ?? ''}
                                      onChange={(e) => handleItemChange(ps.id, 'extraQty', e.target.value)}
                                      placeholder="0"
                                      className="w-full px-1 py-1 text-xs text-center font-semibold border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[30px] touch-manipulation disabled:bg-gray-100 disabled:text-gray-300"
                                    />
                                  </div>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                            )}
                            {type === 'jama' && (
                              <>
                                <td className="px-1 py-1.5 border-r border-gray-200">
                                  <input
                                    type="number"
                                    min="0"
                                    inputMode="numeric"
                                    value={(items as FormItems)[`size_${ps.id}_lost` as keyof FormItems] ?? ''}
                                    onChange={(e) => handleItemChange(ps.id, 'lost', e.target.value)}
                                    className="w-full px-2 py-2 text-[13px] sm:text-sm text-center border border-amber-400 bg-amber-50/50 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent min-h-[40px] sm:min-h-[44px] touch-manipulation active:scale-[0.97]"
                                  />
                                </td>
                                <td className="px-1 py-1.5 border-r border-gray-200">
                                  <input
                                    type="number"
                                    min="0"
                                    inputMode="numeric"
                                    value={(items as FormItems)[`size_${ps.id}_damaged` as keyof FormItems] ?? ''}
                                    onChange={(e) => handleItemChange(ps.id, 'damaged', e.target.value)}
                                    className="w-full px-2 py-2 text-[13px] sm:text-sm text-center border border-rose-400 bg-rose-50/50 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent min-h-[40px] sm:min-h-[44px] touch-manipulation active:scale-[0.97]"
                                  />
                                </td>
                              </>
                            )}
                            <td className="px-1 py-1.5 border-r border-gray-200">
                              <input
                                type="number"
                                min="0"
                                inputMode="numeric"
                                value={(items as FormItems)[`size_${ps.id}_borrowed` as keyof FormItems] ?? ''}
                                onChange={(e) => handleItemChange(ps.id, 'borrowed', e.target.value)}
                                className="w-full px-2 py-2 text-[13px] sm:text-sm text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[40px] sm:min-h-[44px] touch-manipulation active:scale-[0.97]"
                              />
                            </td>
                            <td className="px-1 py-1.5">
                              <input
                                type="text"
                                value={(items as FormItems)[`size_${ps.id}_note` as keyof FormItems] || ''}
                                onChange={(e) => handleItemChange(ps.id, 'note', e.target.value)}
                                className="w-full px-2 py-2 text-[13px] sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[40px] sm:min-h-[44px] touch-manipulation active:scale-[0.97]"
                                placeholder={t('optionalNote')}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>


            <div className="mt-3 sm:mt-4">
              <label className="block mb-1 text-xs font-medium text-gray-700 sm:text-sm">
                {t('mainNote')}
              </label>
              <textarea
                value={(items as FormItems).main_note || ''}
                onChange={(e) => setItems(prev => ({ ...prev, main_note: e.target.value || null } as FormItems))}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 z-20 flex flex-col-reverse justify-end gap-2 px-4 py-3 border-t border-gray-200 bg-gray-50 sm:px-6 sm:py-4 sm:flex-row sm:gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-800 transition-colors bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 text-sm text-white transition-colors bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChallanEditModal;
