import React from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { usePlateSizes } from "../hooks/usePlateSizes";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { useSettings } from "../contexts/SettingsContext";

export interface PlateSize {
  id: number;
  name: string;
  sort_order: number;
  category?: 'shuttering' | 'jack' | 'cuplock' | 'other';
}

export interface ItemDetail {
  size_id: number;
  qty: number;
  borrowed: number;
  lost?: number;
  damaged?: number;
  note: string;
  // Extra pieces returned beyond what was on record as outstanding for
  // this size — computed automatically at save time (see JamaChallan's
  // handleSave), never entered directly by a user.
  extraReturned?: number;
  // Iron jacks only: a jack is issued/returned as a pair (qty above is the
  // pair count). extraPortion/extraQty record loose, unpaired Inner or
  // Outer pieces that came with this transaction on top of the pairs —
  // e.g. 100 full pairs plus 2 spare Outer pieces. Entered directly by
  // the user (one portion at a time, kept simple on purpose).
  extraPortion?: 'inner' | 'outer';
  extraQty?: number;
}

export interface ItemsData {
  items: {
    [key: number]: {
      qty: number;
      borrowed: number;
      lost?: number;
      damaged?: number;
      note: string;
      extraReturned?: number;
      extraPortion?: 'inner' | 'outer';
      extraQty?: number;
    };
  };
  main_note: string;
}




interface StockData {
  size: number;
  total_stock: number;
  on_rent_stock: number;
  borrowed_stock: number;
  lost_stock: number;
  damaged_stock?: number;
  available_stock: number;
  updated_at: string;
}

interface ItemsTableProps {
  plateSizes?: PlateSize[];
  items: ItemsData;
  onChange: (items: ItemsData) => void;
  outstandingBalances?: { [key: number]: number };
  borrowedOutstanding?: { [key: number]: number };
  // Iron-jack-only breakdown of outstandingBalances into its two portions.
  // Optional — only JamaChallan supplies these (Udhar has no outstanding).
  innerOutstandingBalances?: { [key: number]: number };
  outerOutstandingBalances?: { [key: number]: number };
  hideColumns?: boolean;
  stockData?: StockData[];
  showAvailable?: boolean;
  showLost?: boolean;
  showExtraPortion?: boolean;
  enableItemSearch?: boolean;
}

const ItemsTable: React.FC<ItemsTableProps> = ({
  plateSizes: propPlateSizes,
  items,
  onChange,
  outstandingBalances,
  borrowedOutstanding,
  innerOutstandingBalances,
  outerOutstandingBalances,
  hideColumns = false,
  stockData = [],
  showAvailable = false,
  showLost = false,
  showExtraPortion = false,
  enableItemSearch = false,
}) => {
  const { t, language } = useLanguage();
  const { sizes: hookPlateSizes } = usePlateSizes();
  const { activeCategory: globalActiveCategory, enableCategorySeparation, jackMaterialType } = useSettings();
  const isJackIron = (ps: PlateSize) => ps.category === 'jack' && jackMaterialType === 'iron';
  const plateSizes = React.useMemo(() => {
    const rawSizes = propPlateSizes || hookPlateSizes || [];
    if (!enableCategorySeparation) return rawSizes;
    const cat = globalActiveCategory || 'shuttering';
    return rawSizes.filter(ps => (ps.category || 'shuttering') === cat);
  }, [propPlateSizes, hookPlateSizes, enableCategorySeparation, globalActiveCategory]);

  // Whether the "Extra" column (loose Inner/Outer jack pieces) should be
  // shown at all — only relevant when at least one visible row is an Iron
  // jack, and toggled on via showExtraPortion.
  const hasJackIronRows = React.useMemo(() => plateSizes.some(isJackIron), [plateSizes, jackMaterialType]);
  const isExtraPortionVisible = React.useMemo(() => {
    return Boolean(hasJackIronRows && showExtraPortion);
  }, [hasJackIronRows, showExtraPortion]);

  const [collapsedSections, setCollapsedSections] = React.useState<Record<string, boolean>>({
    shuttering: false,
    jack: false,
    cuplock: false,
    other: false,
  });

  React.useEffect(() => {
    if (enableCategorySeparation) {
      setCollapsedSections({
        shuttering: false,
        jack: false,
        cuplock: false,
        other: false,
      });
      return;
    }

    if (outstandingBalances || borrowedOutstanding || innerOutstandingBalances || outerOutstandingBalances) {
      const categoriesWithOutstanding = new Set<string>();

      plateSizes.forEach(size => {
        const rentOut = outstandingBalances ? outstandingBalances[size.id] || 0 : 0;
        const borrowOut = borrowedOutstanding ? borrowedOutstanding[size.id] || 0 : 0;
        const innerOut = innerOutstandingBalances ? innerOutstandingBalances[size.id] || 0 : 0;
        const outerOut = outerOutstandingBalances ? outerOutstandingBalances[size.id] || 0 : 0;
        if (rentOut > 0 || borrowOut > 0 || innerOut !== 0 || outerOut !== 0) {
          categoriesWithOutstanding.add(size.category || 'shuttering');
        }
      });

      setCollapsedSections({
        shuttering: !categoriesWithOutstanding.has('shuttering'),
        jack: !categoriesWithOutstanding.has('jack'),
        cuplock: !categoriesWithOutstanding.has('cuplock'),
        other: !categoriesWithOutstanding.has('other'),
      });
    }
  }, [outstandingBalances, borrowedOutstanding, innerOutstandingBalances, outerOutstandingBalances, plateSizes, enableCategorySeparation]);

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const [searchQuery, setSearchQuery] = React.useState('');
  const [filterMode, setFilterMode] = React.useState<'all' | 'entered'>('all');

  const isSearchEligible = React.useMemo(() => {
    if (!enableItemSearch) return false;
    if (enableCategorySeparation) {
      const cat = globalActiveCategory || 'shuttering';
      return cat === 'jack' || cat === 'cuplock';
    }
    return plateSizes.some(ps => ps.category === 'jack' || ps.category === 'cuplock');
  }, [enableItemSearch, enableCategorySeparation, globalActiveCategory, plateSizes]);

  const enteredItemsCount = React.useMemo(() => {
    return plateSizes.filter(ps => {
      if (!enableCategorySeparation && ps.category !== 'jack' && ps.category !== 'cuplock') {
        return false;
      }
      const item = items.items[ps.id];
      return item && ((item.qty || 0) > 0 || (item.borrowed || 0) > 0 || (item.extraQty || 0) > 0);
    }).length;
  }, [plateSizes, items.items, enableCategorySeparation]);

  const normalizeSearchText = (text: string) => {
    const gujDigits = ['૦','૧','૨','૩','૪','૫','૬','૭','૮','૯'];
    return text
      .toLowerCase()
      .replace(/[૦-૯]/g, d => String(gujDigits.indexOf(d)))
      .trim();
  };

  const matchesSearch = React.useCallback((ps: PlateSize) => {
    if (!isSearchEligible) return true;

    if (filterMode === 'entered') {
      const item = items.items[ps.id];
      const hasQty = item && ((item.qty || 0) > 0 || (item.borrowed || 0) > 0 || (item.extraQty || 0) > 0);
      if (!hasQty) return false;
    }

    if (ps.category !== 'jack' && ps.category !== 'cuplock') {
      return !searchQuery.trim();
    }

    if (!searchQuery.trim()) return true;

    const normalizedQuery = normalizeSearchText(searchQuery);
    const normalizedName = normalizeSearchText(ps.name || '');
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return terms.every(term => normalizedName.includes(term));
  }, [isSearchEligible, searchQuery, filterMode, items.items]);

  React.useEffect(() => {
    if (searchQuery.trim() && !enableCategorySeparation) {
      setCollapsedSections(prev => ({
        ...prev,
        jack: false,
        cuplock: false,
      }));
    }
  }, [searchQuery, enableCategorySeparation]);

  const searchBarRef = React.useRef<HTMLDivElement>(null);

  const visibleItemsCount = React.useMemo(() => {
    if (!isSearchEligible) return plateSizes.length;
    if (enableCategorySeparation) {
      return plateSizes.filter(matchesSearch).length;
    }
    return plateSizes.filter(ps => ps.category === 'jack' || ps.category === 'cuplock').filter(matchesSearch).length;
  }, [isSearchEligible, enableCategorySeparation, plateSizes, matchesSearch]);

  const scrollToSearchTop = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    const isMobile = window.innerWidth < 1024;
    if (!isMobile || !searchBarRef.current) return;

    setTimeout(() => {
      if (!searchBarRef.current) return;
      const rect = searchBarRef.current.getBoundingClientRect();
      const headerOffset = 64; // 56px fixed header + 8px margin
      const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
      if (Math.abs(rect.top - headerOffset) > 10) {
        window.scrollTo({
          top: Math.max(0, currentScroll + rect.top - headerOffset),
          behavior: 'smooth'
        });
      }
    }, 100);
  }, []);

  React.useEffect(() => {
    if (searchQuery.trim() && typeof window !== 'undefined' && window.innerWidth < 1024) {
      scrollToSearchTop();
    }
  }, [searchQuery, scrollToSearchTop]);

  const getSearchPlaceholder = () => {
    if (enableCategorySeparation) {
      if (globalActiveCategory === 'jack') {
        return jackMaterialType === 'wooden'
          ? (language === 'gu' ? 'ટેકા શોધો... (દા.ત. 12, 14, પ્લાઇ)' : 'Search Teka (e.g. 12, 14, Ply)...')
          : (language === 'gu' ? 'જેક શોધો... (દા.ત. 12, 14, પ્લાઇ)' : 'Search Jack (e.g. 12, 14, Ply)...');
      }
      if (globalActiveCategory === 'cuplock') {
        return language === 'gu' ? 'કપલોક આઈટમ શોધો...' : 'Search Cuplock items...';
      }
    }
    return language === 'gu' ? 'જેક / કપલોક આઈટમ શોધો... (દા.ત. 12, 14)' : 'Search Jack / Cuplock items...';
  };


  const handleChange = (sizeId: number, field: 'qty' | 'borrowed' | 'lost' | 'damaged' | 'note' | 'extraQty', value: number | string) => {
    const currentItem = items.items[sizeId] || { qty: 0, borrowed: 0, lost: 0, damaged: 0, note: '' };

    let newValue: any = value;
    if (field !== 'note') {
      if (typeof value === 'string') {
        if (value === '' || value === '-') {
          newValue = value;
        } else {
          const parsed = parseInt(value, 10);
          newValue = isNaN(parsed) ? 0 : parsed;
        }
      }
    }

    const updatedItem: any = { ...currentItem, [field]: newValue };

    onChange({
      ...items,
      items: {
        ...items.items,
        [sizeId]: updatedItem
      }
    });
  };

  // Iron jacks only — picks which loose portion (Inner/Outer) the Extra
  // column's count belongs to for this size. Clicking the already-selected
  // portion clears it (and its count), acting as a simple toggle-off.
  const handleExtraPortionToggle = (sizeId: number, portion: 'inner' | 'outer') => {
    const currentItem = items.items[sizeId] || { qty: 0, borrowed: 0, lost: 0, damaged: 0, note: '' };
    const isDeselecting = currentItem.extraPortion === portion;
    onChange({
      ...items,
      items: {
        ...items.items,
        [sizeId]: {
          ...currentItem,
          extraPortion: isDeselecting ? undefined : portion,
          extraQty: isDeselecting ? 0 : currentItem.extraQty,
        }
      }
    });
  };

  const handleMainNoteChange = (value: string) => {
    onChange({ ...items, main_note: value });
  };


  const renderDesktopRow = (ps: PlateSize) => (
    <tr key={ps.id}>
      <td className="px-4 py-4 text-sm font-bold text-center text-gray-900 whitespace-nowrap">
        {ps.name}
      </td>
      {outstandingBalances && (
        <td className="px-4 py-4 text-center whitespace-nowrap">
          <div
            className={`px-3 py-2 text-sm font-semibold rounded-lg inline-block ${outstandingBalances[ps.id] > 0
              ? "bg-red-100 text-red-700"
              : "bg-gray-100 text-gray-700"
              }`}
          >
            {outstandingBalances[ps.id] || 0}
          </div>
          {isJackIron(ps) && innerOutstandingBalances && outerOutstandingBalances && (() => {
            const inner = innerOutstandingBalances[ps.id] || 0;
            const outer = outerOutstandingBalances[ps.id] || 0;
            if (inner === outer) return null;
            if (inner > outer) {
              return (
                <div className="mt-1">
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                    +{inner - outer} {t('inner') || 'ઈનર'}
                  </span>
                </div>
              );
            } else {
              return (
                <div className="mt-1">
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-purple-50 text-purple-800 border border-purple-200 whitespace-nowrap">
                    +{outer - inner} {t('outer') || 'આઉટર'}
                  </span>
                </div>
              );
            }
          })()}
        </td>
      )}
      {showAvailable && (
        <td className="px-4 py-4 text-center whitespace-nowrap">
          <div
            className={`px-3 py-2 text-sm font-semibold rounded-lg inline-block ${stockData.find((s) => s.size === ps.id)
              ?.available_stock === 0
              ? "bg-red-100 text-red-700"
              : "bg-emerald-100 text-emerald-700"
              }`}
          >
            {stockData.find((s) => s.size === ps.id)
              ?.available_stock || 0}
          </div>
        </td>
      )}
      <td className="px-4 py-4 text-center whitespace-nowrap">
        <input
          type="number"
          value={
            items.items[ps.id]?.qty === 0 || items.items[ps.id]?.qty === undefined ? "" : items.items[ps.id]?.qty
          }
          onChange={(e) => handleChange(ps.id, 'qty', e.target.value)}
          className="w-24 px-3 py-2 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </td>
      {isExtraPortionVisible && (
        <td className="px-4 py-4 text-center whitespace-nowrap">
          {isJackIron(ps) ? (
            <div className="flex flex-col gap-1 items-center">
              <div className="flex rounded-lg overflow-hidden border border-gray-300 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => handleExtraPortionToggle(ps.id, 'inner')}
                  className={`px-2 py-1 transition-colors ${items.items[ps.id]?.extraPortion === 'inner' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  {t('inner') || 'Inner'}
                </button>
                <button
                  type="button"
                  onClick={() => handleExtraPortionToggle(ps.id, 'outer')}
                  className={`px-2 py-1 border-l border-gray-300 transition-colors ${items.items[ps.id]?.extraPortion === 'outer' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  {t('outer') || 'Outer'}
                </button>
              </div>
              <input
                type="number"
                min="0"
                disabled={!items.items[ps.id]?.extraPortion}
                value={items.items[ps.id]?.extraQty || ""}
                onChange={(e) => handleChange(ps.id, 'extraQty', e.target.value)}
                placeholder="0"
                className="w-16 px-2 py-1.5 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-300"
              />
            </div>
          ) : (
            <span className="text-gray-300">—</span>
          )}
        </td>
      )}
      {showLost && (
        <>
          <td className="px-4 py-4 text-center whitespace-nowrap">
            <input
              type="number"
              min="0"
              value={
                items.items[ps.id]?.lost || ""
              }
              onChange={(e) => handleChange(ps.id, 'lost', e.target.value)}
              className="w-24 px-3 py-2 text-center border border-amber-400 bg-amber-50/50 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </td>
          <td className="px-4 py-4 text-center whitespace-nowrap">
            <input
              type="number"
              min="0"
              value={
                items.items[ps.id]?.damaged || ""
              }
              onChange={(e) => handleChange(ps.id, 'damaged', e.target.value)}
              className="w-24 px-3 py-2 text-center border border-rose-400 bg-rose-50/50 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent"
            />
          </td>
        </>
      )}
      {outstandingBalances && !hideColumns && (
        <td className="px-4 py-4 text-center whitespace-nowrap">
          <div
            className={`px-3 py-2 text-sm font-semibold rounded-lg inline-block ${borrowedOutstanding &&
              borrowedOutstanding[ps.id] > 0
              ? "bg-orange-100 text-orange-700"
              : "bg-gray-100 text-gray-700"
              }`}
          >
            {borrowedOutstanding
              ? borrowedOutstanding[ps.id] || 0
              : 0}
          </div>
        </td>
      )}
      {!hideColumns && (
        <>
          <td className="px-4 py-4 text-center whitespace-nowrap">
            <input
              type="number"
              min="0"
              value={
                items.items[ps.id]?.borrowed || ""
              }
              onChange={(e) => handleChange(ps.id, 'borrowed', e.target.value)}
              className="w-24 px-3 py-2 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </td>
          <td className="px-4 py-4">
            <input
              type="text"
              value={
                items.items[ps.id]?.note || ""
              }
              onChange={(e) => handleChange(ps.id, 'note', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </td>
        </>
      )}
    </tr>
  );

  const renderMobileRow = (ps: PlateSize, index: number) => (
    <tr
      key={ps.id}
      className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}
    >
      <td className={`sticky left-0 z-10 px-1 py-1.5 text-xs font-bold text-center text-gray-900 border-r-2 border-gray-300 w-12 min-w-[48px] sm:w-16 sm:min-w-[64px] sm:px-2 sm:text-sm ${index % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
        {ps.name}
      </td>
      {outstandingBalances && (
        <td className="px-1 py-1.5 text-center border-r border-gray-200">
          <div
            className={`px-1.5 py-1 text-xs sm:text-sm font-semibold rounded whitespace-nowrap ${outstandingBalances[ps.id] > 0
              ? "bg-red-100 text-red-700"
              : "bg-gray-200 text-gray-600"
              }`}
          >
            {outstandingBalances[ps.id] || 0}
          </div>
          {isJackIron(ps) && innerOutstandingBalances && outerOutstandingBalances && (() => {
            const inner = innerOutstandingBalances[ps.id] || 0;
            const outer = outerOutstandingBalances[ps.id] || 0;
            if (inner === outer) return null;
            if (inner > outer) {
              return (
                <div className="mt-0.5">
                  <span className="px-1 py-0.5 text-[9px] font-bold rounded bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                    +{inner - outer} {t('inner') || 'ઈનર'}
                  </span>
                </div>
              );
            } else {
              return (
                <div className="mt-0.5">
                  <span className="px-1 py-0.5 text-[9px] font-bold rounded bg-purple-50 text-purple-800 border border-purple-200 whitespace-nowrap">
                    +{outer - inner} {t('outer') || 'આઉટર'}
                  </span>
                </div>
              );
            }
          })()}
        </td>
      )}
      {showAvailable && (
        <td className="px-1 py-1.5 text-center border-r border-gray-200">
          <div
            className={`px-1.5 py-1 text-xs sm:text-sm font-semibold rounded whitespace-nowrap ${stockData.find((s) => s.size === ps.id)
              ?.available_stock === 0
              ? "bg-red-100 text-red-700"
              : "bg-emerald-100 text-emerald-700"
              }`}
          >
            {stockData.find((s) => s.size === ps.id)
              ?.available_stock || 0}
          </div>
        </td>
      )}
      <td className="px-1 py-1.5 border-r border-gray-200">
        <input
          type="number"
          inputMode="numeric"
          value={
            items.items[ps.id]?.qty === 0 || items.items[ps.id]?.qty === undefined ? "" : items.items[ps.id]?.qty
          }
          onChange={(e) =>
            handleChange(ps.id, 'qty', e.target.value)
          }
          className="w-full px-2 py-2 text-[13px] sm:text-sm text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[40px] sm:min-h-[44px] touch-manipulation active:scale-[0.97]"
        />
      </td>
      {isExtraPortionVisible && (
        <td className="px-1 py-1.5 border-r border-gray-200 min-w-[68px] sm:min-w-[76px]">
          {isJackIron(ps) ? (
            <div className="flex flex-col gap-1 items-center justify-center">
              <div className="inline-flex w-full rounded-md border border-gray-300 bg-gray-100 p-0.5 text-[10px] font-semibold">
                <button
                  type="button"
                  onClick={() => handleExtraPortionToggle(ps.id, 'inner')}
                  className={`flex-1 py-0.5 rounded text-center transition-all ${
                    items.items[ps.id]?.extraPortion === 'inner'
                      ? 'bg-blue-600 text-white shadow-xs font-bold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {language === 'gu' ? 'ઈનર' : 'In'}
                </button>
                <button
                  type="button"
                  onClick={() => handleExtraPortionToggle(ps.id, 'outer')}
                  className={`flex-1 py-0.5 rounded text-center transition-all ${
                    items.items[ps.id]?.extraPortion === 'outer'
                      ? 'bg-blue-600 text-white shadow-xs font-bold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {language === 'gu' ? 'આઉટર' : 'Out'}
                </button>
              </div>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                disabled={!items.items[ps.id]?.extraPortion}
                value={items.items[ps.id]?.extraQty === 0 || items.items[ps.id]?.extraQty === undefined ? "" : items.items[ps.id]?.extraQty}
                onChange={(e) => handleChange(ps.id, 'extraQty', e.target.value)}
                placeholder="0"
                className="w-full px-1 py-1 text-xs text-center font-semibold border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[30px] touch-manipulation disabled:bg-gray-100 disabled:text-gray-300"
              />
            </div>
          ) : (
            <span className="text-gray-300 text-xs">—</span>
          )}
        </td>
      )}
      {showLost && (
        <>
          <td className="px-1 py-1.5 border-r border-gray-200">
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={
                items.items[ps.id]?.lost || ""
              }
              onChange={(e) =>
                handleChange(ps.id, 'lost', e.target.value)
              }
              className="w-full px-2 py-2 text-[13px] sm:text-sm text-center border border-amber-400 bg-amber-50/50 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent min-h-[40px] sm:min-h-[44px] touch-manipulation active:scale-[0.97]"
            />
          </td>
          <td className="px-1 py-1.5 border-r border-gray-200">
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={
                items.items[ps.id]?.damaged || ""
              }
              onChange={(e) =>
                handleChange(ps.id, 'damaged', e.target.value)
              }
              className="w-full px-2 py-2 text-[13px] sm:text-sm text-center border border-rose-400 bg-rose-50/50 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent min-h-[40px] sm:min-h-[44px] touch-manipulation active:scale-[0.97]"
            />
          </td>
        </>
      )}
      {outstandingBalances && !hideColumns && (
        <td className="px-1 py-1.5 text-center border-r border-gray-200">
          <div
            className={`px-1.5 py-1 text-xs sm:text-sm font-semibold rounded whitespace-nowrap ${borrowedOutstanding &&
              borrowedOutstanding[ps.id] > 0
              ? "bg-orange-100 text-orange-700"
              : "bg-gray-200 text-gray-600"
              }`}
          >
            {borrowedOutstanding
              ? borrowedOutstanding[ps.id] || 0
              : 0}
          </div>
        </td>
      )}
      {!hideColumns && (
        <>
          <td className="px-1 py-1.5 border-r border-gray-200">
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={
                items.items[ps.id]?.borrowed || ""
              }
              onChange={(e) =>
                handleChange(ps.id, 'borrowed', e.target.value)
              }
              className="w-full px-2 py-2 text-[13px] sm:text-sm text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[40px] sm:min-h-[44px] touch-manipulation active:scale-[0.97]"
            />
          </td>
          <td className="px-1 py-1.5">
            <input
              type="text"
              value={
                items.items[ps.id]?.note || ""
              }
              onChange={(e) => handleChange(ps.id, 'note', e.target.value)}
              className="w-full px-2 py-2 text-[13px] sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[40px] sm:min-h-[44px] touch-manipulation active:scale-[0.97]"
              placeholder={t("optionalNote")}
            />
          </td>
        </>
      )}
    </tr>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Item Search Bar for Jack & Cuplock in Udhar Challan */}
      {isSearchEligible && (
        <div
          ref={searchBarRef}
          className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] lg:static z-30 p-2.5 sm:p-3 bg-white/95 backdrop-blur-md border border-blue-200/80 rounded-xl space-y-2 shadow-sm transition-all"
        >
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute text-blue-500 transform -translate-y-1/2 left-3 top-1/2 w-4 h-4" />
              <input
                type="text"
                value={searchQuery}
                onFocus={scrollToSearchTop}
                onClick={scrollToSearchTop}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value) {
                    scrollToSearchTop();
                  }
                }}
                placeholder={getSearchPlaceholder()}
                className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 shadow-xs transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute transform -translate-y-1/2 right-2.5 top-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                  title={language === 'gu' ? 'સાફ કરો' : 'Clear'}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Filter: All vs Entered */}
            <div className="inline-flex rounded-lg border border-gray-300 p-0.5 bg-white text-xs shadow-xs flex-shrink-0">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1.5 rounded-md font-semibold transition-colors ${
                  filterMode === 'all'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {language === 'gu' ? 'બધા' : 'All'}
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('entered')}
                className={`px-2.5 py-1.5 rounded-md font-semibold transition-colors flex items-center gap-1.5 ${
                  filterMode === 'entered'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span>{language === 'gu' ? 'ભરેલ' : 'Entered'}</span>
                {enteredItemsCount > 0 && (
                  <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold leading-tight ${
                    filterMode === 'entered'
                      ? 'bg-white text-blue-700'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {enteredItemsCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Search Result Info when search is active */}
          {searchQuery && (
            <div className="flex items-center justify-between text-[11px] sm:text-xs bg-blue-50/90 px-2.5 py-1.5 rounded-lg border border-blue-100">
              <div className="flex items-center gap-1.5 truncate">
                <Search className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="text-gray-700">
                  {language === 'gu' ? 'શોધેલ:' : 'Searched:'}{' '}
                  <strong className="text-blue-700 font-bold">"{searchQuery}"</strong>
                </span>
                <span className="text-gray-400">|</span>
                <span className="text-gray-600 font-semibold">
                  {visibleItemsCount} {language === 'gu' ? 'આઈટમ' : 'items'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-blue-600 hover:text-blue-800 hover:underline font-bold text-xs shrink-0 ml-2"
              >
                {language === 'gu' ? 'સાફ કરો' : 'Clear'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-xs font-medium tracking-wider text-center text-gray-500 uppercase">
                {t("size")}
              </th>
              {outstandingBalances && (
                <th className="px-4 py-3 text-xs font-medium tracking-wider text-center text-gray-500 uppercase">
                  {t("outstanding")}
                </th>
              )}
              {showAvailable && (
                <th className="px-4 py-3 text-xs font-medium tracking-wider text-center text-gray-500 uppercase">
                  {t("available")}
                </th>
              )}
              <th className="px-4 py-3 text-xs font-medium tracking-wider text-center text-gray-500 uppercase">
                {t("quantity")}
              </th>
              {isExtraPortionVisible && (
                <th className="px-4 py-3 text-xs font-medium tracking-wider text-center text-blue-600 uppercase">
                  {t("extra") || 'Extra'} ({t('inner') || 'In'}/{t('outer') || 'Out'})
                </th>
              )}
              {showLost && (
                <>
                  <th className="px-4 py-3 text-xs font-medium tracking-wider text-center text-amber-700 uppercase">
                    {t("lost")}
                  </th>
                  <th className="px-4 py-3 text-xs font-medium tracking-wider text-center text-rose-700 uppercase">
                    {t("damaged")}
                  </th>
                </>
              )}
              {outstandingBalances && !hideColumns && (
                <th className="px-4 py-3 text-xs font-medium tracking-wider text-center text-gray-500 uppercase">
                  {t("borrowedOutstanding")}
                </th>
              )}
              {!hideColumns && (
                <>
                  <th className="px-4 py-3 text-xs font-medium tracking-wider text-center text-gray-500 uppercase">
                    {t("borrowed")}
                  </th>
                  <th className="px-4 py-3 text-xs font-medium tracking-wider text-center text-gray-500 uppercase">
                    {t("notes")}
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {/* Shuttering Plates Section */}
            {(!enableCategorySeparation || (globalActiveCategory || 'shuttering') === 'shuttering') && (
              <>
                {!enableCategorySeparation && (
                <tr
                  onClick={() => toggleSection('shuttering')}
                  className="font-semibold border-y select-none transition-colors bg-blue-50/70 text-blue-800 hover:bg-blue-100/70 border-blue-100 cursor-pointer"
                >
                  <td colSpan={10} className="px-4 py-2 text-xs sm:text-sm font-bold text-left">
                    <div className="flex items-center gap-2">
                      {collapsedSections.shuttering ? (
                        <ChevronRight className="w-4 h-4 text-blue-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-blue-600" />
                      )}
                      <span>શટરિંગ પ્લેટો (Shuttering Plates)</span>
                    </div>
                  </td>
                </tr>
                )}
                {(!enableCategorySeparation ? !collapsedSections.shuttering : true) && plateSizes.filter(ps => (ps.category || 'shuttering') === 'shuttering').filter(matchesSearch).map(renderDesktopRow)}
              </>
            )}

            {/* Jacks Section */}
            {(!enableCategorySeparation || globalActiveCategory === 'jack') && (
              <>
                {!enableCategorySeparation && (
                <tr
                  onClick={() => toggleSection('jack')}
                  className="font-semibold border-y select-none transition-colors bg-purple-50/70 text-purple-800 hover:bg-purple-100/70 border-purple-100 cursor-pointer"
                >
                  <td colSpan={10} className="px-4 py-2 text-xs sm:text-sm font-bold text-left">
                    <div className="flex items-center gap-2">
                      {collapsedSections.jack ? (
                        <ChevronRight className="w-4 h-4 text-purple-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-purple-600" />
                      )}
                      <span>{jackMaterialType === 'wooden' ? 'ટેકા (Teka)' : 'લોખંડના જેક (Iron Jacks)'}</span>
                    </div>
                  </td>
                </tr>
                )}
                {(!enableCategorySeparation ? !collapsedSections.jack : true) && (() => {
                  const jackSizes = plateSizes.filter(ps => ps.category === 'jack').filter(matchesSearch);
                  if (jackSizes.length === 0 && (searchQuery.trim() || filterMode === 'entered')) {
                    return (
                      <tr>
                        <td colSpan={10} className="px-4 py-8 text-center text-xs sm:text-sm text-gray-500 bg-gray-50">
                          <p className="font-medium">{language === 'gu' ? 'કોઈ જેક/ટેકા મળ્યા નથી' : 'No matching Jack / Teka items'}</p>
                        </td>
                      </tr>
                    );
                  }
                  return jackSizes.map(renderDesktopRow);
                })()}
              </>
            )}

            {/* Cuplock Section */}
            {(!enableCategorySeparation || globalActiveCategory === 'cuplock') && plateSizes.some(ps => ps.category === 'cuplock') && (
              <>
                {!enableCategorySeparation && (
                <tr
                  onClick={() => toggleSection('cuplock')}
                  className="font-semibold border-y select-none transition-colors bg-orange-50/70 text-orange-800 hover:bg-orange-100/70 border-orange-100 cursor-pointer"
                >
                  <td colSpan={10} className="px-4 py-2 text-xs sm:text-sm font-bold text-left">
                    <div className="flex items-center gap-2">
                      {collapsedSections.cuplock ? (
                        <ChevronRight className="w-4 h-4 text-orange-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-orange-600" />
                      )}
                      <span>કપલોક આઈટમ્સ (Cuplock Items)</span>
                    </div>
                  </td>
                </tr>
                )}
                {(!enableCategorySeparation ? !collapsedSections.cuplock : true) && (() => {
                  const cuplockSizes = plateSizes.filter(ps => ps.category === 'cuplock').filter(matchesSearch);
                  if (cuplockSizes.length === 0 && (searchQuery.trim() || filterMode === 'entered')) {
                    return (
                      <tr>
                        <td colSpan={10} className="px-4 py-8 text-center text-xs sm:text-sm text-gray-500 bg-gray-50">
                          <p className="font-medium">{language === 'gu' ? 'કોઈ કપલોક આઈટમ મળી નથી' : 'No matching Cuplock items'}</p>
                        </td>
                      </tr>
                    );
                  }
                  return cuplockSizes.map(renderDesktopRow);
                })()}
              </>
            )}

            {/* Other Section */}
            {(!enableCategorySeparation || globalActiveCategory === 'other') && plateSizes.some(ps => ps.category === 'other') && (
              <>
                {!enableCategorySeparation && (
                <tr
                  onClick={() => toggleSection('other')}
                  className="font-semibold border-y select-none transition-colors bg-green-50/70 text-green-800 hover:bg-green-100/70 border-green-100 cursor-pointer"
                >
                  <td colSpan={10} className="px-4 py-2 text-xs sm:text-sm font-bold text-left">
                    <div className="flex items-center gap-2">
                      {collapsedSections.other ? (
                        <ChevronRight className="w-4 h-4 text-green-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-green-600" />
                      )}
                      <span>અન્ય આઈટમ્સ (Other Items)</span>
                    </div>
                  </td>
                </tr>
                )}
                {(!enableCategorySeparation ? !collapsedSections.other : true) && plateSizes.filter(ps => ps.category === 'other').filter(matchesSearch).map(renderDesktopRow)}
              </>
            )}
          </tbody>
          <tfoot className="bg-gray-100 border-t-2 border-gray-300">
            <tr>
              <td className="px-4 py-3 text-xs sm:text-sm font-bold text-center text-gray-900">
                {language === 'gu' ? 'કુલ' : 'Total'}
              </td>
              {outstandingBalances && <td className="px-4 py-3 text-center">-</td>}
              {showAvailable && <td className="px-4 py-3 text-center">-</td>}
              <td className="px-4 py-3 text-xs sm:text-sm font-bold text-center">
                <div className="px-3 py-1.5 bg-blue-100 rounded-lg text-blue-800 inline-block font-bold">
                  {Object.values(items.items || {}).reduce((sum, item) => sum + (item.qty || 0) + (item.borrowed || 0), 0)} {language === 'gu' ? 'કુલ' : 'Total'}
                </div>
              </td>
              {isExtraPortionVisible && <td className="px-4 py-3 text-center">-</td>}
              {showLost && (
                <>
                  <td className="px-4 py-3 text-xs sm:text-sm font-bold text-center">
                    <div className="px-2 py-1 rounded-lg bg-amber-50 text-amber-800 inline-block">
                      {Object.values(items.items || {}).reduce((sum, item) => sum + (item.lost || 0), 0)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs sm:text-sm font-bold text-center">
                    <div className="px-2 py-1 rounded-lg bg-rose-50 text-rose-800 inline-block">
                      {Object.values(items.items || {}).reduce((sum, item) => sum + (item.damaged || 0), 0)}
                    </div>
                  </td>
                </>
              )}
              {outstandingBalances && !hideColumns && <td className="px-4 py-3 text-center">-</td>}
              {!hideColumns && (
                <>
                  <td className="px-4 py-3 text-xs sm:text-sm font-bold text-center">
                    <div className="px-2 py-1 rounded-lg bg-orange-50 text-orange-800 inline-block">
                      {Object.values(items.items || {}).reduce((sum, item) => sum + (item.borrowed || 0), 0)}
                    </div>
                  </td>
                  <td className="px-4 py-3"></td>
                </>
              )}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile Table-Like Form - Horizontal Scroll with Fixed Size Column */}
      <div className="lg:hidden">
        <div className="-mx-3 overflow-x-auto sm:-mx-4">
          <div className="inline-block min-w-full align-middle">
            <div className="overflow-hidden">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-b-2 border-gray-300">
                    <th className="sticky left-0 z-10 px-1 py-1.5 text-xs font-bold text-center text-gray-700 bg-gray-100 border-r-2 border-gray-300 w-12 min-w-[48px] sm:w-16 sm:min-w-[64px] sm:px-2 sm:text-xs">
                      {t("size")}
                    </th>
                    {outstandingBalances && (
                      <th className="px-1 py-1.5 text-xs sm:text-sm font-semibold text-center text-gray-700 border-r border-gray-200 min-w-[70px] sm:min-w-[80px]">
                        {t("outstanding")}
                      </th>
                    )}
                    {showAvailable && (
                      <th className="px-1 py-1.5 text-xs sm:text-sm font-semibold text-center text-gray-700 border-r border-gray-200 min-w-[70px] sm:min-w-[90px]">
                        {t("available")}
                      </th>
                    )}
                    <th className="px-1 py-1.5 text-xs sm:text-sm font-semibold text-center text-gray-700 border-r border-gray-200 min-w-[70px] sm:min-w-[80px]">
                      {t("quantity")}
                    </th>
                    {isExtraPortionVisible && (
                      <th className="px-1 py-1.5 text-xs sm:text-sm font-semibold text-center text-blue-700 border-r border-gray-200 min-w-[68px] sm:min-w-[76px]">
                        {language === 'gu' ? 'વધારાનું' : (t('extra') || 'Extra')}
                      </th>
                    )}
                    {showLost && (
                      <>
                        <th className="px-1 py-1.5 text-xs sm:text-sm font-semibold text-center text-amber-700 border-r border-gray-200 min-w-[70px] sm:min-w-[80px]">
                          {t("lost")}
                        </th>
                        <th className="px-1 py-1.5 text-xs sm:text-sm font-semibold text-center text-rose-700 border-r border-gray-200 min-w-[70px] sm:min-w-[80px]">
                          {t("damaged")}
                        </th>
                      </>
                    )}
                    {outstandingBalances && !hideColumns && (
                      <th className="px-1 py-1.5 text-xs sm:text-sm font-semibold text-center text-gray-700 border-r border-gray-200 min-w-[70px] sm:min-w-[80px]">
                        {t("borrowedOutstanding")}
                      </th>
                    )}
                    {!hideColumns && (
                      <>
                        <th className="px-1 py-1.5 text-xs sm:text-sm font-semibold text-center text-gray-700 border-r border-gray-200 min-w-[70px] sm:min-w-[80px]">
                          {t("borrowed")}
                        </th>
                        <th className="px-1 py-1.5 text-xs sm:text-sm font-semibold text-center text-gray-700 min-w-[120px] sm:min-w-[150px]">
                          {t("notes")}
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {/* Shuttering Plates Section */}
                  {(!enableCategorySeparation || (globalActiveCategory || 'shuttering') === 'shuttering') && (
                    <>
                      {!enableCategorySeparation && (
                      <tr
                        onClick={() => toggleSection('shuttering')}
                        className="font-semibold border-y select-none transition-colors bg-blue-50/70 text-blue-800 border-blue-100 cursor-pointer"
                      >
                        <td colSpan={10} className="px-2 py-1 text-xs font-bold sticky left-0 z-10 text-left transition-colors bg-blue-50/70">
                          <div className="flex items-center gap-1.5">
                            {collapsedSections.shuttering ? (
                              <ChevronRight className="w-3.5 h-3.5 text-blue-600" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-blue-600" />
                            )}
                            <span>શટરિંગ પ્લેટો (Shuttering Plates)</span>
                          </div>
                        </td>
                      </tr>
                      )}
                      {(!enableCategorySeparation ? !collapsedSections.shuttering : true) && plateSizes.filter(ps => (ps.category || 'shuttering') === 'shuttering').filter(matchesSearch).map((ps, idx) => renderMobileRow(ps, idx))}
                    </>
                  )}

                  {/* Jacks Section */}
                  {(!enableCategorySeparation || globalActiveCategory === 'jack') && (
                    <>
                      {!enableCategorySeparation && (
                      <tr
                        onClick={() => toggleSection('jack')}
                        className="font-semibold border-y select-none transition-colors bg-purple-50/70 text-purple-800 border-purple-100 cursor-pointer"
                      >
                        <td colSpan={10} className="px-2 py-1 text-xs font-bold sticky left-0 z-10 text-left transition-colors bg-purple-50/70">
                          <div className="flex items-center gap-1.5">
                            {collapsedSections.jack ? (
                              <ChevronRight className="w-3.5 h-3.5 text-purple-600" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-purple-600" />
                            )}
                            <span>{jackMaterialType === 'wooden' ? 'ટેકા (Teka)' : 'લોખંડના જેક (Iron Jacks)'}</span>
                          </div>
                        </td>
                      </tr>
                      )}
                      {(!enableCategorySeparation ? !collapsedSections.jack : true) && (() => {
                        const jackSizes = plateSizes.filter(ps => ps.category === 'jack').filter(matchesSearch);
                        if (jackSizes.length === 0 && (searchQuery.trim() || filterMode === 'entered')) {
                          return (
                            <tr>
                              <td colSpan={10} className="px-2 py-6 text-center text-xs text-gray-500 bg-gray-50">
                                <p className="font-medium">{language === 'gu' ? 'કોઈ જેક/ટેકા મળ્યા નથી' : 'No matching Jack / Teka items'}</p>
                              </td>
                            </tr>
                          );
                        }
                        return jackSizes.map((ps, idx) => renderMobileRow(ps, idx));
                      })()}
                    </>
                  )}

                  {/* Cuplock Section */}
                  {(!enableCategorySeparation || globalActiveCategory === 'cuplock') && plateSizes.some(ps => ps.category === 'cuplock') && (
                    <>
                      {!enableCategorySeparation && (
                      <tr
                        onClick={() => toggleSection('cuplock')}
                        className="font-semibold border-y select-none transition-colors bg-orange-50/70 text-orange-800 border-orange-100 cursor-pointer"
                      >
                        <td colSpan={10} className="px-2 py-1 text-xs font-bold sticky left-0 z-10 text-left transition-colors bg-orange-50/70">
                          <div className="flex items-center gap-1.5">
                            {collapsedSections.cuplock ? (
                              <ChevronRight className="w-3.5 h-3.5 text-orange-600" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-orange-600" />
                            )}
                            <span>કપલોક આઈટમ્સ (Cuplock Items)</span>
                          </div>
                        </td>
                      </tr>
                      )}
                      {(!enableCategorySeparation ? !collapsedSections.cuplock : true) && (() => {
                        const cuplockSizes = plateSizes.filter(ps => ps.category === 'cuplock').filter(matchesSearch);
                        if (cuplockSizes.length === 0 && (searchQuery.trim() || filterMode === 'entered')) {
                          return (
                            <tr>
                              <td colSpan={10} className="px-2 py-6 text-center text-xs text-gray-500 bg-gray-50">
                                <p className="font-medium">{language === 'gu' ? 'કોઈ કપલોક આઈટમ મળી નથી' : 'No matching Cuplock items'}</p>
                              </td>
                            </tr>
                          );
                        }
                        return cuplockSizes.map((ps, idx) => renderMobileRow(ps, idx));
                      })()}
                    </>
                  )}

                  {/* Other Section */}
                  {(!enableCategorySeparation || globalActiveCategory === 'other') && plateSizes.some(ps => ps.category === 'other') && (
                    <>
                      {!enableCategorySeparation && (
                      <tr
                        onClick={() => toggleSection('other')}
                        className="font-semibold border-y select-none transition-colors bg-green-50/70 text-green-800 border-green-100 cursor-pointer"
                      >
                        <td colSpan={10} className="px-2 py-1 text-xs font-bold sticky left-0 z-10 text-left transition-colors bg-green-50/70">
                          <div className="flex items-center gap-1.5">
                            {collapsedSections.other ? (
                              <ChevronRight className="w-3.5 h-3.5 text-green-600" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-green-600" />
                            )}
                            <span>અન્ય આઈટમ્સ (Other Items)</span>
                          </div>
                        </td>
                      </tr>
                      )}
                      {(!enableCategorySeparation ? !collapsedSections.other : true) && plateSizes.filter(ps => ps.category === 'other').filter(matchesSearch).map((ps, idx) => renderMobileRow(ps, idx))}
                    </>
                  )}
                  {/* Totals Summary Row */}
                  <tr className="bg-gray-100 border-t-2 border-gray-300">
                    <td className="sticky left-0 z-10 px-1 py-3 text-xs font-bold text-center text-gray-900 border-r-2 border-gray-300 w-12 min-w-[48px] sm:w-16 sm:min-w-[64px] sm:text-sm bg-gray-100">
                      કુલ
                    </td>
                    {outstandingBalances && (
                      <td className="px-1 py-3 text-center border-r border-gray-200">
                        -
                      </td>
                    )}
                    {showAvailable && (
                      <td className="px-1 py-3 text-center border-r border-gray-200">
                        -
                      </td>
                    )}
                    <td className="px-1 py-3 text-xs font-bold text-center border-r border-gray-200 sm:text-sm">
                      <div className="px-3 py-1.5 bg-blue-100 rounded-lg text-blue-800">
                        {Object.values(items.items || {}).reduce((sum, item) => sum + (item.qty || 0) + (item.borrowed || 0), 0)} કુલ
                      </div>
                    </td>
                    {isExtraPortionVisible && (
                      <td className="px-1 py-3 text-center border-r border-gray-200">
                        -
                      </td>
                    )}
                    {showLost && (
                      <>
                        <td className="px-1 py-3 text-xs font-bold text-center border-r border-gray-200 sm:text-sm">
                          <div className="px-2 py-1 rounded-lg bg-amber-50 text-amber-800">
                            {Object.values(items.items || {}).reduce((sum, item) => sum + (item.lost || 0), 0)} ગુમ
                          </div>
                        </td>
                        <td className="px-1 py-3 text-xs font-bold text-center border-r border-gray-200 sm:text-sm">
                          <div className="px-2 py-1 rounded-lg bg-rose-50 text-rose-800">
                            {Object.values(items.items || {}).reduce((sum, item) => sum + (item.damaged || 0), 0)} નુકસાન
                          </div>
                        </td>
                      </>
                    )}
                    {outstandingBalances && !hideColumns && (
                      <td className="px-1 py-3 text-center border-r border-gray-200">
                        -
                      </td>
                    )}
                    {!hideColumns && (
                      <>
                        <td className="px-1 py-3 text-xs font-bold text-center border-r border-gray-200 sm:text-sm">
                          <div className="px-2 py-1 rounded-lg bg-orange-50">
                            {Object.values(items.items || {}).reduce((sum, item) => sum + (item.borrowed || 0), 0)} બીજો ડેપો
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Main Note - Mobile Optimized */}
      <div>
        <label className="block mb-1.5 sm:mb-2 text-xs sm:text-sm font-semibold text-gray-700">
          {t("mainNote")}
        </label>
        <textarea
          value={items.main_note}
          onChange={(e) => handleMainNoteChange(e.target.value)}
          rows={3}
          placeholder={t("optionalGeneralNotes")}
          className="w-full px-2.5 py-2 sm:px-3 sm:py-2.5 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    </div>
  );
};

export default ItemsTable;
