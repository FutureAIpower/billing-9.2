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
  defaultFilterMode?: 'all' | 'entered' | 'outstanding';
  hideEnteredFilter?: boolean;
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
  enableItemSearch = true,
  defaultFilterMode = 'all',
  hideEnteredFilter = false,
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
    // Keep all item sections open/expanded by default
    setCollapsedSections({
      shuttering: false,
      jack: false,
      cuplock: false,
      other: false,
    });
  }, [enableCategorySeparation]);

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const [searchQuery, setSearchQuery] = React.useState('');
  const [filterMode, setFilterMode] = React.useState<'all' | 'entered' | 'outstanding'>(() => {
    return defaultFilterMode || 'all';
  });
  const [categoryFilter, setCategoryFilter] = React.useState<'all' | 'shuttering' | 'jack' | 'cuplock' | 'other'>('all');

  // Search is eligible whenever enabled and items exist
  const isSearchEligible = React.useMemo(() => {
    if (!enableItemSearch) return false;
    return plateSizes.length > 0;
  }, [enableItemSearch, plateSizes.length]);

  // Outstanding items count (especially useful for Jama Challan return entry)
  const outstandingItemsCount = React.useMemo(() => {
    if (!outstandingBalances && !borrowedOutstanding && !innerOutstandingBalances && !outerOutstandingBalances) return 0;
    return plateSizes.filter(ps => {
      const rentOut = outstandingBalances ? outstandingBalances[ps.id] || 0 : 0;
      const borrowOut = borrowedOutstanding ? borrowedOutstanding[ps.id] || 0 : 0;
      const innerOut = innerOutstandingBalances ? innerOutstandingBalances[ps.id] || 0 : 0;
      const outerOut = outerOutstandingBalances ? outerOutstandingBalances[ps.id] || 0 : 0;
      return rentOut > 0 || borrowOut > 0 || innerOut !== 0 || outerOut !== 0;
    }).length;
  }, [plateSizes, outstandingBalances, borrowedOutstanding, innerOutstandingBalances, outerOutstandingBalances]);

  // Auto-switch to 'outstanding' (pending) when in Jama Challan mode once outstanding items are loaded
  const hasInitializedOutstandingFilter = React.useRef(false);
  React.useEffect(() => {
    if (defaultFilterMode === 'outstanding' && !hasInitializedOutstandingFilter.current) {
      if (outstandingItemsCount > 0) {
        setFilterMode('outstanding');
        hasInitializedOutstandingFilter.current = true;
      }
    }
  }, [defaultFilterMode, outstandingItemsCount]);

  const enteredItemsCount = React.useMemo(() => {
    return plateSizes.filter(ps => {
      const item = items.items[ps.id];
      return item && (
        (item.qty || 0) > 0 ||
        (item.borrowed || 0) > 0 ||
        (item.extraQty || 0) > 0 ||
        (item.lost || 0) > 0 ||
        (item.damaged || 0) > 0
      );
    }).length;
  }, [plateSizes, items.items]);

  const totalEnteredQty = React.useMemo(() => {
    return Object.values(items.items || {}).reduce((sum, item) => sum + (item.qty || 0) + (item.borrowed || 0), 0);
  }, [items.items]);

  const availableCategories = React.useMemo(() => {
    if (enableCategorySeparation) return [];
    const cats = new Set<string>();
    plateSizes.forEach(ps => {
      cats.add(ps.category || 'shuttering');
    });
    return ['shuttering', 'jack', 'cuplock', 'other'].filter(c => cats.has(c));
  }, [plateSizes, enableCategorySeparation]);

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'shuttering':
        return language === 'gu' ? 'શટરિંગ પ્લેટો' : 'Shuttering Plates';
      case 'jack':
        return jackMaterialType === 'wooden'
          ? (language === 'gu' ? 'ટેકા' : 'Teka')
          : (language === 'gu' ? 'જેક' : 'Jack');
      case 'cuplock':
        return language === 'gu' ? 'કપલોક' : 'Cuplock';
      case 'other':
        return language === 'gu' ? 'અન્ય' : 'Other';
      default:
        return cat;
    }
  };

  const normalizeSearchText = (text: string) => {
    if (!text) return '';
    const gujDigits = ['૦','૧','૨','૩','૪','૫','૬','૭','૮','૯'];
    return text
      .toLowerCase()
      .replace(/[૦-૯]/g, d => String(gujDigits.indexOf(d)))
      .replace(/[*×]/g, 'x')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const matchesSearch = React.useCallback((ps: PlateSize) => {
    if (!isSearchEligible) return true;

    // Filter by selected category (when multiple categories exist in one view)
    if (!enableCategorySeparation && categoryFilter !== 'all') {
      if ((ps.category || 'shuttering') !== categoryFilter) {
        return false;
      }
    }

    // Only restrict to entered/outstanding when NOT actively typing a search query
    // When typing a search query, any item in inventory matching the query can be found
    if (!searchQuery.trim()) {
      if (filterMode === 'entered') {
        const item = items.items[ps.id];
        const hasQty = item && (
          (item.qty || 0) > 0 ||
          (item.borrowed || 0) > 0 ||
          (item.extraQty || 0) > 0 ||
          (item.lost || 0) > 0 ||
          (item.damaged || 0) > 0
        );
        if (!hasQty) return false;
      } else if (filterMode === 'outstanding') {
        const rentOut = outstandingBalances ? outstandingBalances[ps.id] || 0 : 0;
        const borrowOut = borrowedOutstanding ? borrowedOutstanding[ps.id] || 0 : 0;
        const innerOut = innerOutstandingBalances ? innerOutstandingBalances[ps.id] || 0 : 0;
        const outerOut = outerOutstandingBalances ? outerOutstandingBalances[ps.id] || 0 : 0;
        const hasOut = rentOut > 0 || borrowOut > 0 || innerOut !== 0 || outerOut !== 0;
        if (!hasOut) return false;
      }
      return true;
    }

    const normalizedQuery = normalizeSearchText(searchQuery);
    const normalizedName = normalizeSearchText(ps.name || '');

    // 1. Direct substring match
    if (normalizedName.includes(normalizedQuery)) return true;

    // 2. Compact spaces/punctuation stripped (e.g. "3x2" vs "3 x 2")
    const compactQuery = normalizedQuery.replace(/[\s\-_.*×]/g, '');
    const compactName = normalizedName.replace(/[\s\-_.*×]/g, '');
    if (compactQuery && compactName.includes(compactQuery)) return true;

    // 3. Multi-word tokens (all words must appear)
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return terms.every(term => {
      const cleanTerm = term.replace(/[\s\-_.*×]/g, '');
      return normalizedName.includes(term) || (cleanTerm && compactName.includes(cleanTerm));
    });
  }, [
    isSearchEligible,
    searchQuery,
    filterMode,
    categoryFilter,
    enableCategorySeparation,
    items.items,
    outstandingBalances,
    borrowedOutstanding,
    innerOutstandingBalances,
    outerOutstandingBalances,
  ]);

  // Auto-expand all sections when searching or filtering
  React.useEffect(() => {
    if (searchQuery.trim() || filterMode !== 'all' || categoryFilter !== 'all') {
      if (!enableCategorySeparation) {
        setCollapsedSections({
          shuttering: false,
          jack: false,
          cuplock: false,
          other: false,
        });
      }
    }
  }, [searchQuery, filterMode, categoryFilter, enableCategorySeparation]);

  const searchBarRef = React.useRef<HTMLDivElement>(null);

  const shutteringSizes = React.useMemo(() => {
    return plateSizes.filter(ps => (ps.category || 'shuttering') === 'shuttering').filter(matchesSearch);
  }, [plateSizes, matchesSearch]);

  const jackSizes = React.useMemo(() => {
    return plateSizes.filter(ps => ps.category === 'jack').filter(matchesSearch);
  }, [plateSizes, matchesSearch]);

  const cuplockSizes = React.useMemo(() => {
    return plateSizes.filter(ps => ps.category === 'cuplock').filter(matchesSearch);
  }, [plateSizes, matchesSearch]);

  const otherSizes = React.useMemo(() => {
    return plateSizes.filter(ps => ps.category === 'other').filter(matchesSearch);
  }, [plateSizes, matchesSearch]);

  const totalVisibleCount = shutteringSizes.length + jackSizes.length + cuplockSizes.length + otherSizes.length;

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
          ? (language === 'gu' ? 'ટેકા શોધો...' : 'Search Teka...')
          : (language === 'gu' ? 'જેક શોધો...' : 'Search Jack...');
      }
      if (globalActiveCategory === 'cuplock') {
        return language === 'gu' ? 'કપલોક શોધો...' : 'Search Cuplock...';
      }
      if (globalActiveCategory === 'shuttering') {
        return language === 'gu' ? 'સાઇઝ શોધો...' : 'Search size...';
      }
      if (globalActiveCategory === 'other') {
        return language === 'gu' ? 'અન્ય શોધો...' : 'Search other...';
      }
    }
    return language === 'gu' ? 'આઈટમ શોધો...' : 'Search items...';
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

  const renderDesktopRow = (ps: PlateSize) => {
    const isEntered = Boolean(
      (items.items[ps.id]?.qty || 0) > 0 ||
      (items.items[ps.id]?.borrowed || 0) > 0 ||
      (items.items[ps.id]?.extraQty || 0) > 0 ||
      (items.items[ps.id]?.lost || 0) > 0 ||
      (items.items[ps.id]?.damaged || 0) > 0
    );

    return (
      <tr key={ps.id} className={isEntered ? "bg-emerald-50/50 hover:bg-emerald-50" : "hover:bg-gray-50"}>
        <td className="px-4 py-3.5 text-sm font-bold text-center text-gray-900 whitespace-nowrap">
          <div className="flex items-center justify-center gap-1.5">
            {isEntered && <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />}
            <span>{ps.name}</span>
          </div>
        </td>
        {outstandingBalances && (
          <td className="px-4 py-3.5 text-center whitespace-nowrap">
            <button
              type="button"
              onClick={() => {
                if (outstandingBalances[ps.id] > 0) {
                  const currentQty = items.items[ps.id]?.qty || 0;
                  if (currentQty === 0) {
                    handleChange(ps.id, 'qty', outstandingBalances[ps.id]);
                  }
                }
              }}
              disabled={!outstandingBalances[ps.id] || outstandingBalances[ps.id] <= 0}
              title={outstandingBalances[ps.id] > 0 ? (language === 'gu' ? 'જમા રકમ ભરવા ક્લિક કરો' : 'Click to fill return qty') : undefined}
              className={`px-3 py-1.5 text-sm font-semibold rounded-lg inline-block transition-transform active:scale-95 ${
                outstandingBalances[ps.id] > 0
                  ? "bg-red-100 text-red-700 hover:bg-red-200 cursor-pointer border border-red-200"
                  : "bg-gray-100 text-gray-700 cursor-default"
              }`}
            >
              {outstandingBalances[ps.id] || 0}
            </button>
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
          <td className="px-4 py-3.5 text-center whitespace-nowrap">
            <div
              className={`px-3 py-1.5 text-sm font-semibold rounded-lg inline-block ${
                stockData.find((s) => s.size === ps.id)?.available_stock === 0
                  ? "bg-red-100 text-red-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {stockData.find((s) => s.size === ps.id)?.available_stock || 0}
            </div>
          </td>
        )}
        <td className="px-4 py-3.5 text-center whitespace-nowrap">
          <input
            type="number"
            inputMode="numeric"
            value={
              items.items[ps.id]?.qty === 0 || items.items[ps.id]?.qty === undefined ? "" : items.items[ps.id]?.qty
            }
            onFocus={(e) => e.target.select()}
            onChange={(e) => handleChange(ps.id, 'qty', e.target.value)}
            className="w-24 px-3 py-2 text-center font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </td>
        {isExtraPortionVisible && (
          <td className="px-4 py-3.5 text-center whitespace-nowrap">
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
                  inputMode="numeric"
                  disabled={!items.items[ps.id]?.extraPortion}
                  value={items.items[ps.id]?.extraQty || ""}
                  onFocus={(e) => e.target.select()}
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
            <td className="px-4 py-3.5 text-center whitespace-nowrap">
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={items.items[ps.id]?.lost || ""}
                onFocus={(e) => e.target.select()}
                onChange={(e) => handleChange(ps.id, 'lost', e.target.value)}
                className="w-24 px-3 py-2 text-center border border-amber-400 bg-amber-50/50 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </td>
            <td className="px-4 py-3.5 text-center whitespace-nowrap">
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={items.items[ps.id]?.damaged || ""}
                onFocus={(e) => e.target.select()}
                onChange={(e) => handleChange(ps.id, 'damaged', e.target.value)}
                className="w-24 px-3 py-2 text-center border border-rose-400 bg-rose-50/50 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent"
              />
            </td>
          </>
        )}
        {outstandingBalances && !hideColumns && (
          <td className="px-4 py-3.5 text-center whitespace-nowrap">
            <div
              className={`px-3 py-2 text-sm font-semibold rounded-lg inline-block ${
                borrowedOutstanding && borrowedOutstanding[ps.id] > 0
                  ? "bg-orange-100 text-orange-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {borrowedOutstanding ? borrowedOutstanding[ps.id] || 0 : 0}
            </div>
          </td>
        )}
        {!hideColumns && (
          <>
            <td className="px-4 py-3.5 text-center whitespace-nowrap">
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={items.items[ps.id]?.borrowed || ""}
                onFocus={(e) => e.target.select()}
                onChange={(e) => handleChange(ps.id, 'borrowed', e.target.value)}
                className="w-24 px-3 py-2 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </td>
            <td className="px-4 py-3.5">
              <input
                type="text"
                value={items.items[ps.id]?.note || ""}
                onChange={(e) => handleChange(ps.id, 'note', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t("optionalNote")}
              />
            </td>
          </>
        )}
      </tr>
    );
  };

  const renderMobileRow = (ps: PlateSize, index: number) => {
    const isEntered = Boolean(
      (items.items[ps.id]?.qty || 0) > 0 ||
      (items.items[ps.id]?.borrowed || 0) > 0 ||
      (items.items[ps.id]?.extraQty || 0) > 0 ||
      (items.items[ps.id]?.lost || 0) > 0 ||
      (items.items[ps.id]?.damaged || 0) > 0
    );

    return (
      <tr
        key={ps.id}
        className={`transition-colors ${
          isEntered
            ? "bg-emerald-50/70 border-l-4 border-l-emerald-500 font-medium"
            : (index % 2 === 0 ? "bg-white" : "bg-gray-50/70")
        }`}
      >
        <td
          className={`sticky left-0 z-10 px-1.5 py-2 text-xs font-bold text-center border-r-2 border-gray-300 min-w-[62px] sm:min-w-[76px] transition-colors ${
            isEntered
              ? "bg-emerald-100 text-emerald-950 shadow-2xs"
              : (index % 2 === 0 ? "bg-white text-gray-900" : "bg-gray-50 text-gray-900")
          }`}
        >
          <div className="flex flex-col items-center justify-center leading-tight">
            <span>{ps.name}</span>
            {isEntered && (
              <span className="mt-0.5 inline-flex items-center px-1.5 py-0.2 text-[9px] font-bold rounded-full bg-emerald-600 text-white leading-none">
                ✓ {items.items[ps.id]?.qty || 0}
              </span>
            )}
          </div>
        </td>
        {outstandingBalances && (
          <td className="px-1 py-1.5 text-center border-r border-gray-200">
            <button
              type="button"
              onClick={() => {
                if (outstandingBalances[ps.id] > 0) {
                  const currentQty = items.items[ps.id]?.qty || 0;
                  if (currentQty === 0) {
                    handleChange(ps.id, 'qty', outstandingBalances[ps.id]);
                  }
                }
              }}
              disabled={!outstandingBalances[ps.id] || outstandingBalances[ps.id] <= 0}
              title={outstandingBalances[ps.id] > 0 ? (language === 'gu' ? 'જમા રકમ ભરવા ક્લિક કરો' : 'Tap to fill return quantity') : undefined}
              className={`px-2 py-1 text-xs sm:text-sm font-bold rounded whitespace-nowrap transition-transform active:scale-95 ${
                outstandingBalances[ps.id] > 0
                  ? "bg-red-100 text-red-700 hover:bg-red-200 cursor-pointer border border-red-200 shadow-2xs"
                  : "bg-gray-200 text-gray-600 cursor-default"
              }`}
            >
              {outstandingBalances[ps.id] || 0}
            </button>
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
              className={`px-1.5 py-1 text-xs sm:text-sm font-semibold rounded whitespace-nowrap ${
                stockData.find((s) => s.size === ps.id)?.available_stock === 0
                  ? "bg-red-100 text-red-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {stockData.find((s) => s.size === ps.id)?.available_stock || 0}
            </div>
          </td>
        )}
        <td className="px-1 py-1.5 border-r border-gray-200">
          <div className="relative flex items-center justify-center">
            <input
              type="number"
              inputMode="numeric"
              value={
                items.items[ps.id]?.qty === 0 || items.items[ps.id]?.qty === undefined ? "" : items.items[ps.id]?.qty
              }
              onFocus={(e) => e.target.select()}
              onChange={(e) => handleChange(ps.id, 'qty', e.target.value)}
              placeholder="0"
              className={`w-full px-2 py-2 text-[16px] sm:text-sm text-center font-bold border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[42px] sm:min-h-[44px] touch-manipulation transition-all ${
                isEntered
                  ? "border-emerald-400 bg-white text-emerald-950 font-black shadow-xs ring-1 ring-emerald-200"
                  : "border-gray-300 bg-white text-gray-900"
              }`}
            />
            {(items.items[ps.id]?.qty || 0) > 0 && (
              <button
                type="button"
                onClick={() => handleChange(ps.id, 'qty', 0)}
                className="absolute right-1 text-gray-400 hover:text-red-500 p-0.5 rounded-full"
                title={language === 'gu' ? 'હટાવો' : 'Clear'}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
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
                  onFocus={(e) => e.target.select()}
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
                value={items.items[ps.id]?.lost || ""}
                onFocus={(e) => e.target.select()}
                onChange={(e) => handleChange(ps.id, 'lost', e.target.value)}
                placeholder="0"
                className="w-full px-2 py-2 text-[16px] sm:text-sm text-center font-semibold border border-amber-400 bg-amber-50/50 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent min-h-[42px] sm:min-h-[44px] touch-manipulation"
              />
            </td>
            <td className="px-1 py-1.5 border-r border-gray-200">
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={items.items[ps.id]?.damaged || ""}
                onFocus={(e) => e.target.select()}
                onChange={(e) => handleChange(ps.id, 'damaged', e.target.value)}
                placeholder="0"
                className="w-full px-2 py-2 text-[16px] sm:text-sm text-center font-semibold border border-rose-400 bg-rose-50/50 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent min-h-[42px] sm:min-h-[44px] touch-manipulation"
              />
            </td>
          </>
        )}
        {outstandingBalances && !hideColumns && (
          <td className="px-1 py-1.5 text-center border-r border-gray-200">
            <div
              className={`px-1.5 py-1 text-xs sm:text-sm font-semibold rounded whitespace-nowrap ${
                borrowedOutstanding && borrowedOutstanding[ps.id] > 0
                  ? "bg-orange-100 text-orange-700"
                  : "bg-gray-200 text-gray-600"
              }`}
            >
              {borrowedOutstanding ? borrowedOutstanding[ps.id] || 0 : 0}
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
                value={items.items[ps.id]?.borrowed || ""}
                onFocus={(e) => e.target.select()}
                onChange={(e) => handleChange(ps.id, 'borrowed', e.target.value)}
                placeholder="0"
                className="w-full px-2 py-2 text-[16px] sm:text-sm text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[42px] sm:min-h-[44px] touch-manipulation"
              />
            </td>
            <td className="px-1 py-1.5">
              <input
                type="text"
                value={items.items[ps.id]?.note || ""}
                onChange={(e) => handleChange(ps.id, 'note', e.target.value)}
                className="w-full px-2 py-2 text-[14px] sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[42px] sm:min-h-[44px] touch-manipulation"
                placeholder={t("optionalNote")}
              />
            </td>
          </>
        )}
      </tr>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Item Search Bar & Mobile Quick Filters */}
      {isSearchEligible && (
        <div
          ref={searchBarRef}
          className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] lg:static z-30 p-2 sm:p-3 bg-white/95 backdrop-blur-md border border-blue-200/90 rounded-xl space-y-2 shadow-md transition-all"
        >
          {/* Main Search Input & Filter Tabs in ONE single row on mobile & desktop */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute text-blue-600 transform -translate-y-1/2 left-2.5 sm:left-3 top-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onFocus={scrollToSearchTop}
                onClick={scrollToSearchTop}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchQuery(val);
                  if (val.trim() && filterMode !== 'all') {
                    setFilterMode('all');
                  }
                  if (val) {
                    scrollToSearchTop();
                  }
                }}
                placeholder={getSearchPlaceholder()}
                className="w-full pl-8 sm:pl-9 pr-7 sm:pr-8 py-1.5 sm:py-2 text-xs sm:text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 shadow-2xs transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute transform -translate-y-1/2 right-2 top-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                  title={language === 'gu' ? 'સાફ કરો' : 'Clear'}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Filter: All vs Outstanding vs Entered */}
            <div className="inline-flex rounded-lg border border-gray-300 p-0.5 bg-gray-100 text-xs shadow-2xs shrink-0 items-center">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md font-semibold transition-colors text-center whitespace-nowrap text-xs ${
                  filterMode === 'all'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {language === 'gu' ? 'બધા' : 'All'}
              </button>

              {outstandingItemsCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterMode('outstanding')}
                  className={`px-2 sm:px-3 py-1.5 rounded-md font-semibold transition-colors flex items-center justify-center gap-1 whitespace-nowrap text-xs ${
                    filterMode === 'outstanding'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-amber-800 hover:text-amber-950'
                  }`}
                >
                  <span>{language === 'gu' ? 'બાકી' : 'Pending'}</span>
                  <span className={`px-1 py-0.2 text-[10px] rounded-full font-bold leading-tight ${
                    filterMode === 'outstanding'
                      ? 'bg-white text-amber-800'
                      : 'bg-amber-200 text-amber-900'
                  }`}>
                    {outstandingItemsCount}
                  </span>
                </button>
              )}

              {!hideEnteredFilter && (
                <button
                  type="button"
                  onClick={() => setFilterMode('entered')}
                  className={`px-2 sm:px-3 py-1.5 rounded-md font-semibold transition-colors flex items-center justify-center gap-1 whitespace-nowrap text-xs ${
                    filterMode === 'entered'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span>{language === 'gu' ? 'ભરેલ' : 'Entered'}</span>
                  {enteredItemsCount > 0 && (
                    <span className={`px-1 py-0.2 text-[10px] rounded-full font-bold leading-tight ${
                      filterMode === 'entered'
                        ? 'bg-white text-emerald-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {enteredItemsCount}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Category Chips (when all categories exist together in one view) */}
          {availableCategories.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pt-0.5 no-scrollbar">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`px-2.5 py-1 text-[11px] sm:text-xs rounded-full whitespace-nowrap font-medium transition-colors border ${
                  categoryFilter === 'all'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {language === 'gu' ? 'બધી કેટેગરી' : 'All Categories'} ({plateSizes.length})
              </button>
              {availableCategories.map(cat => {
                const count = plateSizes.filter(ps => (ps.category || 'shuttering') === cat).length;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat as any)}
                    className={`px-2.5 py-1 text-[11px] sm:text-xs rounded-full whitespace-nowrap font-medium transition-colors border ${
                      categoryFilter === cat
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {getCategoryLabel(cat)} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Quick Summary Pill & Status Info - Hidden on mobile to save vertical space */}
          <div className="hidden sm:flex items-center justify-between text-[11px] sm:text-xs bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 truncate">
              <span className="text-gray-600">
                {language === 'gu' ? 'બતાવેલ:' : 'Showing:'}{' '}
                <strong className="text-blue-700 font-bold">{totalVisibleCount}</strong> / {plateSizes.length}
              </span>
              {enteredItemsCount > 0 && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="text-emerald-700 font-bold flex items-center gap-1 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shrink-0" />
                    {enteredItemsCount} {language === 'gu' ? 'આઈટમ' : 'items'} ({totalEnteredQty} {language === 'gu' ? 'નંગ' : 'qty'})
                  </span>
                </>
              )}
            </div>

            {(searchQuery || filterMode !== 'all' || categoryFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFilterMode('all');
                  setCategoryFilter('all');
                }}
                className="text-blue-600 hover:text-blue-800 font-bold text-[11px] sm:text-xs shrink-0 ml-2 hover:underline"
              >
                {language === 'gu' ? 'બધા બતાવો' : 'Reset'}
              </button>
            )}
          </div>
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
            {totalVisibleCount === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-gray-500 bg-gray-50/50">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Search className="w-8 h-8 text-gray-400" />
                    <p className="font-semibold text-gray-700">
                      {language === 'gu' ? 'કોઈ આઈટમ મળી નથી' : 'No matching items found'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setFilterMode('all');
                        setCategoryFilter('all');
                      }}
                      className="mt-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
                    >
                      {language === 'gu' ? 'બધી આઈટમ બતાવો' : 'Show all items'}
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {/* Shuttering Plates Section */}
            {(!enableCategorySeparation || (globalActiveCategory || 'shuttering') === 'shuttering') && shutteringSizes.length > 0 && (
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
                      <span className="text-xs text-blue-600/75">({shutteringSizes.length})</span>
                    </div>
                  </td>
                </tr>
                )}
                {(!enableCategorySeparation ? !collapsedSections.shuttering : true) && shutteringSizes.map(renderDesktopRow)}
              </>
            )}

            {/* Jacks Section */}
            {(!enableCategorySeparation || globalActiveCategory === 'jack') && jackSizes.length > 0 && (
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
                      <span className="text-xs text-purple-600/75">({jackSizes.length})</span>
                    </div>
                  </td>
                </tr>
                )}
                {(!enableCategorySeparation ? !collapsedSections.jack : true) && jackSizes.map(renderDesktopRow)}
              </>
            )}

            {/* Cuplock Section */}
            {(!enableCategorySeparation || globalActiveCategory === 'cuplock') && cuplockSizes.length > 0 && (
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
                      <span className="text-xs text-orange-600/75">({cuplockSizes.length})</span>
                    </div>
                  </td>
                </tr>
                )}
                {(!enableCategorySeparation ? !collapsedSections.cuplock : true) && cuplockSizes.map(renderDesktopRow)}
              </>
            )}

            {/* Other Section */}
            {(!enableCategorySeparation || globalActiveCategory === 'other') && otherSizes.length > 0 && (
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
                      <span className="text-xs text-green-600/75">({otherSizes.length})</span>
                    </div>
                  </td>
                </tr>
                )}
                {(!enableCategorySeparation ? !collapsedSections.other : true) && otherSizes.map(renderDesktopRow)}
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
                  {totalEnteredQty} {language === 'gu' ? 'કુલ' : 'Total'}
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
                    <th className="sticky left-0 z-10 px-1 py-2 text-xs font-bold text-center text-gray-700 bg-gray-100 border-r-2 border-gray-300 min-w-[62px] sm:min-w-[76px] sm:px-2 sm:text-xs">
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
                    <th className="px-1 py-1.5 text-xs sm:text-sm font-semibold text-center text-gray-700 border-r border-gray-200 min-w-[72px] sm:min-w-[84px]">
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
                  {totalVisibleCount === 0 && (
                    <tr>
                      <td colSpan={10} className="px-2 py-8 text-center bg-gray-50/50">
                        <div className="flex flex-col items-center justify-center gap-2 py-4">
                          <Search className="w-8 h-8 text-gray-400" />
                          <p className="text-sm font-semibold text-gray-700">
                            {language === 'gu' ? 'કોઈ આઈટમ મળી નથી' : 'No matching items found'}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setSearchQuery('');
                              setFilterMode('all');
                              setCategoryFilter('all');
                            }}
                            className="mt-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
                          >
                            {language === 'gu' ? 'બધી આઈટમ બતાવો' : 'Show all items'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Shuttering Plates Section */}
                  {(!enableCategorySeparation || (globalActiveCategory || 'shuttering') === 'shuttering') && shutteringSizes.length > 0 && (
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
                            <span className="text-xs text-blue-600/75">({shutteringSizes.length})</span>
                          </div>
                        </td>
                      </tr>
                      )}
                      {(!enableCategorySeparation ? !collapsedSections.shuttering : true) && shutteringSizes.map((ps, idx) => renderMobileRow(ps, idx))}
                    </>
                  )}

                  {/* Jacks Section */}
                  {(!enableCategorySeparation || globalActiveCategory === 'jack') && jackSizes.length > 0 && (
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
                            <span className="text-xs text-purple-600/75">({jackSizes.length})</span>
                          </div>
                        </td>
                      </tr>
                      )}
                      {(!enableCategorySeparation ? !collapsedSections.jack : true) && jackSizes.map((ps, idx) => renderMobileRow(ps, idx))}
                    </>
                  )}

                  {/* Cuplock Section */}
                  {(!enableCategorySeparation || globalActiveCategory === 'cuplock') && cuplockSizes.length > 0 && (
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
                            <span className="text-xs text-orange-600/75">({cuplockSizes.length})</span>
                          </div>
                        </td>
                      </tr>
                      )}
                      {(!enableCategorySeparation ? !collapsedSections.cuplock : true) && cuplockSizes.map((ps, idx) => renderMobileRow(ps, idx))}
                    </>
                  )}

                  {/* Other Section */}
                  {(!enableCategorySeparation || globalActiveCategory === 'other') && otherSizes.length > 0 && (
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
                            <span className="text-xs text-green-600/75">({otherSizes.length})</span>
                          </div>
                        </td>
                      </tr>
                      )}
                      {(!enableCategorySeparation ? !collapsedSections.other : true) && otherSizes.map((ps, idx) => renderMobileRow(ps, idx))}
                    </>
                  )}
                  {/* Totals Summary Row */}
                  <tr className="bg-gray-100 border-t-2 border-gray-300">
                    <td className="sticky left-0 z-10 px-1 py-3 text-xs font-bold text-center text-gray-900 border-r-2 border-gray-300 min-w-[62px] sm:min-w-[76px] sm:text-sm bg-gray-100">
                      {language === 'gu' ? 'કુલ' : 'Total'}
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
                      <div className="px-3 py-1.5 bg-blue-100 rounded-lg text-blue-800 font-bold">
                        {totalEnteredQty} {language === 'gu' ? 'કુલ' : 'Total'}
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
                          <div className="px-2 py-1 rounded-lg bg-amber-50 text-amber-800 font-bold">
                            {Object.values(items.items || {}).reduce((sum, item) => sum + (item.lost || 0), 0)} {language === 'gu' ? 'ગુમ' : 'Lost'}
                          </div>
                        </td>
                        <td className="px-1 py-3 text-xs font-bold text-center border-r border-gray-200 sm:text-sm">
                          <div className="px-2 py-1 rounded-lg bg-rose-50 text-rose-800 font-bold">
                            {Object.values(items.items || {}).reduce((sum, item) => sum + (item.damaged || 0), 0)} {language === 'gu' ? 'નુકસાન' : 'Damaged'}
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
                          <div className="px-2 py-1 rounded-lg bg-orange-50 font-bold text-orange-800">
                            {Object.values(items.items || {}).reduce((sum, item) => sum + (item.borrowed || 0), 0)} {language === 'gu' ? 'બીજો ડેપો' : 'Depot'}
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
