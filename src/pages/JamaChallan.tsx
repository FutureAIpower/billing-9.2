import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';
import { format } from 'date-fns';
import {
  Search,
  ArrowLeft,
  UserPlus,
  FileText,
  Calendar,
  MapPin,
  Phone,
  User,
  CheckCircle,
  Package,
  ChevronRight,
  Eye,
  EyeOff
} from 'lucide-react';
import { naturalSort } from '../utils/sortingUtils';
import ClientForm from '../components/ClientForm';
import { checkDuplicateClient } from '../utils/clientUtils';
import ItemsTable, { ItemsData } from '../components/ItemsTable';
import { usePlateSizes } from '../hooks/usePlateSizes';
import { mapRecordToArray } from '../utils/challanOperations';
import ReceiptTemplate from '../components/ReceiptTemplate';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../utils/supabase';
import { generateJPEG } from '../utils/generateJPEG';
import { tryExportChallanDesign } from '../utils/challanDesign/exportChallanDesign';
import Navbar from '../components/Navbar';
import toast, { Toaster } from 'react-hot-toast';
import { fetchClientTransactions, fetchBulkClientTransactions } from '../utils/challanFetching';


interface ClientFormData {
  id?: string;
  client_nic_name: string;
  client_name: string;
  site: string;
  primary_phone_number: string;
  is_hidden?: boolean;
}


type Step = 'client-selection' | 'challan-details';


interface ClientSelectionStepProps {
  clients: ClientFormData[];
  onClientSelect: (clientId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onAddNewClick?: () => void;
  clientBalances: { [clientId: string]: number };
}


const ClientSelectionStep: React.FC<ClientSelectionStepProps> = ({
  clients,
  onClientSelect,
  searchQuery,
  onSearchChange,
  onAddNewClick,
  clientBalances,
}) => {
  const { t } = useLanguage();
  const filteredClients = clients
    .filter(client => !client.is_hidden)
    .filter(client => {
      const searchLower = searchQuery.toLowerCase().trim();

      // Try to parse the search term as a number
      const searchNum = parseInt(searchLower);
      const isSearchingNumber = !isNaN(searchNum);

      // If searching for a number, try to match it against the numeric part of client_nic_name
      if (isSearchingNumber) {
        const nicNameMatch = client.client_nic_name?.match(/^(\d+)/);
        if (nicNameMatch) {
          const clientNum = parseInt(nicNameMatch[1]);
          if (clientNum === searchNum) return true;
        }
      }

      // Standard text search
      return (
        (client.client_nic_name || '').toLowerCase().includes(searchLower) ||
        (client.client_name || '').toLowerCase().includes(searchLower) ||
        (client.site || '').toLowerCase().includes(searchLower) ||
        (client.primary_phone_number || '').includes(searchQuery)
      );
    })
    .sort((a, b) => {
      const query = searchQuery.toLowerCase().trim();

      if (!query) {
        return naturalSort(a.client_nic_name || '', b.client_nic_name || '');
      }

      const aNic = (a.client_nic_name || '').toLowerCase();
      const bNic = (b.client_nic_name || '').toLowerCase();

      // Helper to extract numeric ID from start of string
      const getID = (str: string) => {
        const m = str.match(/^(\d+)/);
        return m ? m[1] : '';
      };

      const aId = getID(aNic);
      const bId = getID(bNic);

      // Priority 1: Exact ID match
      const aExactId = aId === query;
      const bExactId = bId === query;
      if (aExactId && !bExactId) return -1;
      if (bExactId && !aExactId) return 1;

      // Priority 2: Starts with search query
      const aStarts = aNic.startsWith(query);
      const bStarts = bNic.startsWith(query);
      if (aStarts && !bStarts) return -1;
      if (bStarts && !aStarts) return 1;

      return naturalSort(a.client_nic_name || '', b.client_nic_name || '');
    });


  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      {/* Header with Add Client Button */}
      {/* Search Bar - Compact */}

      {/* Search Bar - Compact */}
      <div className="relative">
        <Search className="absolute text-gray-400 transform -translate-y-1/2 left-2.5 sm:left-3 top-1/2 w-4 h-4 sm:w-4.5 sm:h-4.5" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('searchClients') || 'Search clients...'}
          className="w-full py-2 sm:py-2.5 lg:py-3 pl-8 sm:pl-10 pr-3 sm:pr-4 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-green-500 focus:border-transparent text-xs sm:text-sm"
        />
      </div>


      {/* Results Count - Compact */}
      {searchQuery && (
        <div className="px-3 py-1.5 sm:px-4 sm:py-2 border border-green-200 rounded-lg bg-green-50">
          <p className="text-xs sm:text-xs lg:text-sm text-green-700">
            {t('clientsFound')}: <span className="font-semibold">{filteredClients.length}</span>
          </p>
        </div>
      )}


      {/* Client Grid - Mobile Optimized */}
      {filteredClients.length === 0 ? (
        <div className="p-8 text-center bg-white border border-gray-200 rounded-lg shadow-sm sm:p-12 lg:p-16 sm:rounded-xl">
          <div className="inline-flex items-center justify-center w-12 h-12 mb-3 bg-gray-100 rounded-full sm:w-14 sm:h-14 sm:mb-4 lg:w-16 lg:h-16">
            <User className="w-6 h-6 text-gray-400 sm:w-7 sm:h-7 lg:w-8 lg:h-8" />
          </div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900 sm:text-base lg:text-lg">{t('noClientsFound')}</h3>
          <p className="mb-3 text-xs sm:text-xs lg:text-sm text-gray-500 sm:mb-4">
            {searchQuery ? t('tryAdjustingSearch') : t('noClientsYet')}
          </p>
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-green-600 transition-colors rounded-lg hover:text-green-700 hover:bg-green-50 touch-manipulation active:scale-95"
            >
              {t('clearSearch')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {filteredClients.map((client) => (
            <button
              key={client.id}
              onClick={() => onClientSelect(client.id!)}
              className="p-3 text-left transition-all bg-white border border-gray-200 shadow-sm sm:p-4 lg:p-5 group rounded-lg sm:rounded-xl hover:shadow-md hover:border-green-500 touch-manipulation active:scale-[0.98]"
            >
              <div className="flex items-center gap-2 mb-2 sm:gap-3 sm:mb-3">
                <div className="p-1.5 sm:p-2 transition-colors bg-green-100 rounded-md sm:rounded-lg group-hover:bg-green-200">
                  <User className="w-4 h-4 text-green-600 sm:w-5 sm:h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-gray-900 truncate transition-colors sm:text-base lg:text-lg group-hover:text-green-600">
                    {client.client_nic_name}
                  </h4>
                  <p className="text-xs sm:text-xs lg:text-sm text-gray-600 truncate">{client.client_name}</p>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="text-[11px] text-gray-500">કુલ બહાર</span>
                  <span className={`text-sm sm:text-base font-bold tabular-nums ${(clientBalances[client.id!] || 0) > 0 ? 'text-amber-600' : 'text-green-600'
                    }`}>
                    {(clientBalances[client.id!] || 0).toLocaleString("en-IN")}
                  </span>
                </div>
                <ChevronRight className="flex-shrink-0 w-4 h-4 text-gray-400 transition-transform sm:w-5 sm:h-5 group-hover:translate-x-1" />
              </div>
              <div className="pt-2 mt-2 border-t border-gray-100 sm:pt-3 sm:mt-3">
                {/* Mobile: Location and Phone in one line | Desktop: Stacked */}
                <div className="flex items-center gap-2 text-xs sm:text-xs lg:text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <MapPin className="flex-shrink-0 w-3 h-3 text-gray-400 sm:w-3.5 sm:h-3.5" />
                    <span className="truncate">{client.site}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Phone className="flex-shrink-0 w-3 h-3 text-gray-400 sm:w-3.5 sm:h-3.5" />
                    <span className="truncate">{client.primary_phone_number}</span>
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}



    </div>
  );
};


interface ChallanDetailsStepProps {
  selectedClient: ClientFormData;
  onBack: () => void;
  onSave: () => void;
  challanNumber: string;
  setChallanNumber: (value: string) => void;
  date: string;
  setDate: (value: string) => void;
  driverName: string;
  setDriverName: (value: string) => void;
  previousDrivers: string[];
  previousDriversVisible: boolean;
  setPreviousDriversVisible: (value: boolean) => void;
  items: ItemsData;
  setItems: (items: ItemsData) => void;
  outstandingBalances: { [key: number]: number };
  borrowedOutstanding: { [key: number]: number };
  innerOutstanding: { [key: number]: number };
  outerOutstanding: { [key: number]: number };
  errors: { [key: string]: string };
  showSuccess: boolean;
  hideExtraColumns: boolean;
  setHideExtraColumns: (value: boolean) => void;
  isAllReturn: boolean;
  onAllReturn: () => void;
  stockData: any[];
  driverPhone: string;
  setDriverPhone: (val: string) => void;
  vehicleNumber: string;
  setVehicleNumber: (val: string) => void;
  showLostAndDamaged: boolean;
  setShowLostAndDamaged: (value: boolean) => void;
  showExtraPortion: boolean;
  setShowExtraPortion: (value: boolean) => void;
  loadingUnloadingCharges: string;
  setLoadingUnloadingCharges: (val: string) => void;
  vehicleRent: string;
  setVehicleRent: (val: string) => void;
  deposit: string;
  setDeposit: (val: string) => void;
}


const ChallanDetailsStep: React.FC<ChallanDetailsStepProps> = ({
  selectedClient,
  onBack,
  onSave,
  challanNumber,
  setChallanNumber,
  date,
  setDate,
  driverName,
  setDriverName,
  previousDrivers,
  previousDriversVisible,
  setPreviousDriversVisible,
  items,
  setItems,
  outstandingBalances,
  borrowedOutstanding,
  innerOutstanding,
  outerOutstanding,
  errors,
  showSuccess,
  hideExtraColumns,
  setHideExtraColumns,
  isAllReturn,
  onAllReturn,
  stockData,
  driverPhone,
  setDriverPhone,
  vehicleNumber,
  setVehicleNumber,
  showLostAndDamaged,
  setShowLostAndDamaged,
  showExtraPortion,
  setShowExtraPortion,
  loadingUnloadingCharges,
  setLoadingUnloadingCharges,
  vehicleRent,
  setVehicleRent,
  deposit,
  setDeposit
}) => {
  const { t, language } = useLanguage();
  const { showDriverDetails, showExtraCost, enableCategorySeparation, activeCategory, jackMaterialType } = useSettings();
  const { sizes: rawPlateSizes } = usePlateSizes();
  const plateSizes = React.useMemo(() => {
    if (!enableCategorySeparation) return rawPlateSizes;
    const cat = activeCategory || 'shuttering';
    return rawPlateSizes.filter(ps => (ps.category || 'shuttering') === cat);
  }, [rawPlateSizes, enableCategorySeparation, activeCategory]);
  const hasJackIronRows = React.useMemo(() => plateSizes.some(ps => ps.category === 'jack' && jackMaterialType === 'iron'), [plateSizes, jackMaterialType]);
  const navigate = useNavigate();

  const getCategoryHeading = () => {
    if (enableCategorySeparation) {
      const cat = activeCategory || 'shuttering';
      if (cat === 'jack') return language === 'gu' ? (jackMaterialType === 'wooden' ? 'ટેકાની વિગતો' : 'જેકની વિગતો') : (jackMaterialType === 'wooden' ? 'Teka Details' : 'Jack Details');
      if (cat === 'cuplock') return language === 'gu' ? 'કપલોકની વિગતો' : 'Cuplock Details';
      if (cat === 'other') return language === 'gu' ? 'અન્ય આઈટમ્સની વિગતો' : 'Other Items Details';
      return language === 'gu' ? 'શટરિંગની વિગતો' : 'Shuttering Details';
    }
    return t('items');
  };


  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      {/* Selected Client Info - Compact Mobile with Back Button */}
      <div className="relative p-3 overflow-hidden border border-green-200 rounded-lg shadow-sm sm:p-4 lg:p-6 bg-gradient-to-br from-green-50 to-emerald-50 sm:rounded-xl">
        <div className="absolute top-0 right-0 w-20 h-20 bg-green-100 rounded-bl-full opacity-30 sm:w-24 sm:h-24 lg:w-32 lg:h-32"></div>
        <div className="relative">
          {/* Mobile Layout */}
          <div className="flex items-start gap-2 sm:hidden">
            <div className="p-2 bg-green-600 rounded-md">
              <User className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-base font-semibold text-gray-900 truncate">{selectedClient.client_nic_name}</h4>
              <p className="text-xs text-gray-700 truncate">{selectedClient.client_name}</p>
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-600">
                <span className="flex items-center gap-1">
                  <MapPin className="flex-shrink-0 w-3 h-3 text-green-600" />
                  <span className="truncate">{selectedClient.site}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Phone className="flex-shrink-0 w-3 h-3 text-green-600" />
                  <span className="truncate">{selectedClient.primary_phone_number}</span>
                </span>
              </div>
            </div>
            <button
              onClick={onBack}
              className="flex-shrink-0 p-2 text-gray-600 transition-colors rounded-md hover:text-gray-900 hover:bg-gray-100 touch-manipulation active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>

          {/* Desktop Layout */}
          <div className="items-start hidden gap-2 sm:flex lg:gap-4">
            <button
              onClick={onBack}
              className="flex-shrink-0 p-2 text-gray-600 transition-colors rounded-md sm:p-2.5 lg:p-3 sm:rounded-lg hover:text-gray-900 hover:bg-gray-100 touch-manipulation active:scale-95"
            >
              <ArrowLeft className="w-5 h-5 sm:w-5 sm:h-5 lg:w-5 lg:h-5" />
            </button>
            <div className="p-2 bg-green-600 rounded-md sm:p-2.5 lg:p-3 sm:rounded-lg">
              <User className="w-5 h-5 text-white sm:w-6 sm:h-6 lg:w-7 lg:h-7" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-gray-900 truncate sm:text-base lg:text-lg">{selectedClient.client_nic_name}</h4>
              <p className="text-xs sm:text-xs lg:text-sm text-gray-700 truncate">{selectedClient.client_name}</p>
              <div className="grid grid-cols-1 gap-1 mt-2 sm:grid-cols-2 sm:gap-2 lg:mt-3">
                <div className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-xs lg:text-sm text-gray-600">
                  <MapPin className="flex-shrink-0 w-3 h-3 text-green-600 sm:w-3.5 sm:h-3.5" />
                  <span className="truncate">{selectedClient.site}</span>
                </div>
                <div className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-xs lg:text-sm text-gray-600">
                  <Phone className="flex-shrink-0 w-3 h-3 text-green-600 sm:w-3.5 sm:h-3.5" />
                  <span className="truncate">{selectedClient.primary_phone_number}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>


      <div className="space-y-3 sm:space-y-4 lg:space-y-6">
        {/* Basic Challan Details - Compact */}
        <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm sm:p-4 lg:p-6 sm:rounded-xl">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <div className="p-1.5 sm:p-2 bg-green-100 rounded-md sm:rounded-lg">
              <FileText className="w-4 h-4 text-green-600 sm:w-4.5 sm:h-4.5 lg:w-5 lg:h-5" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 sm:text-base lg:text-lg">{t('challanDetails')}</h3>
          </div>
          <div className="grid gap-2 sm:gap-3 md:grid-cols-2 lg:gap-4">
            <div>
              <label className="flex items-center gap-1 sm:gap-1.5 mb-1.5 sm:mb-2 text-xs sm:text-xs lg:text-sm font-medium text-gray-700">
                <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                {t('challanNumber')} <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-1.5 sm:gap-2 w-full">
                <input
                  type="text"
                  value={challanNumber}
                  onChange={(e) => setChallanNumber(e.target.value)}
                  placeholder="#"
                  className={`w-14 sm:w-20 md:w-28 flex-shrink-0 h-10 sm:h-11 px-1.5 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm sm:text-base text-center font-bold ${errors.challanNumber ? 'border-red-500' : 'border-gray-300'
                    }`}
                />
                <button
                  type="button"
                  onClick={() => setHideExtraColumns(!hideExtraColumns)}
                  className="flex-1 h-10 sm:h-11 inline-flex items-center justify-center gap-1 px-1.5 sm:px-3 text-xs font-medium text-green-600 transition-colors rounded-lg bg-green-50 hover:bg-green-100 touch-manipulation active:scale-95 border border-green-100 whitespace-nowrap"
                  title={t('columns2')}
                >
                  {hideExtraColumns ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>
                    <span className="sm:hidden">{language === 'gu' ? 'ડેપો ૨' : 'Depo 2'}</span>
                    <span className="hidden sm:inline">{t('columns2')}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowLostAndDamaged(!showLostAndDamaged)}
                  className="flex-1 h-10 sm:h-11 inline-flex items-center justify-center gap-1 px-1.5 sm:px-3 text-xs font-medium text-amber-600 transition-colors rounded-lg bg-amber-50 hover:bg-amber-100 touch-manipulation active:scale-95 border border-amber-100 whitespace-nowrap"
                  title={t('lostDamaged')}
                >
                  {!showLostAndDamaged ? <EyeOff className="w-3.5 h-3.5 text-amber-500" /> : <Eye className="w-3.5 h-3.5 text-amber-600" />}
                  <span>
                    <span className="sm:hidden">{language === 'gu' ? 'ગુમ/નુ.' : 'L/D'}</span>
                    <span className="hidden sm:inline">{t('lostDamaged')}</span>
                  </span>
                </button>
                {hasJackIronRows && (
                  <button
                    type="button"
                    onClick={() => setShowExtraPortion(!showExtraPortion)}
                    className="flex-1 h-10 sm:h-11 inline-flex items-center justify-center gap-1 px-1.5 sm:px-3 text-xs font-medium text-blue-600 transition-colors rounded-lg bg-blue-50 hover:bg-blue-100 touch-manipulation active:scale-95 border border-blue-100 whitespace-nowrap"
                    title={language === 'gu' ? 'વધારાનું (ઈનર/આઉટર)' : 'Extra (Inner/Outer)'}
                  >
                    {!showExtraPortion ? <EyeOff className="w-3.5 h-3.5 text-blue-500" /> : <Eye className="w-3.5 h-3.5 text-blue-600" />}
                    <span>
                      <span className="sm:hidden">{language === 'gu' ? 'વધારાનું' : 'Extra'}</span>
                      <span className="hidden sm:inline">{language === 'gu' ? 'વધારાનું (ઈ/આ)' : 'Extra (I/O)'}</span>
                    </span>
                  </button>
                )}
              </div>
              {errors.challanNumber && (
                <p className="mt-1 text-xs sm:text-xs text-red-600 flex items-center gap-1">
                  <span>•</span> {errors.challanNumber}
                </p>
              )}
            </div>

            <div className="flex gap-2 sm:gap-3 lg:gap-4">
              <div className="w-1/2">
                <label className="flex items-center gap-1 sm:gap-1.5 mb-1.5 sm:mb-2 text-xs sm:text-xs lg:text-sm font-medium text-gray-700">
                  <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  {t('date')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={`w-full px-2.5 py-2 sm:px-3 sm:py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm sm:text-sm ${errors.date ? 'border-red-500' : 'border-gray-300'
                    }`}
                />
                {errors.date && (
                  <p className="mt-1 text-xs sm:text-xs text-red-600 flex items-center gap-1">
                    <span>•</span> {errors.date}
                  </p>
                )}
              </div>

              <div className="w-1/2">
                <label className="flex items-center gap-1 sm:gap-1.5 mb-1.5 sm:mb-2 text-xs sm:text-xs lg:text-sm font-medium text-gray-700">
                  <User className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  {t('driverName')}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    onFocus={() => setPreviousDriversVisible(true)}
                    onBlur={() => {
                      // Use setTimeout to allow click events to fire on suggestions before hiding
                      setTimeout(() => {
                        setPreviousDriversVisible(false);
                      }, 200);
                    }}
                    placeholder={t('optional')}
                    className="w-full px-2.5 py-2 sm:px-3 sm:py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-xs sm:text-sm"
                  />
                  {previousDriversVisible && previousDrivers.length > 0 && (
                    <div
                      className="absolute z-10 w-full mt-1 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg driver-suggestions max-h-40"
                    >
                      {previousDrivers.map((driver, index) => (
                        <button
                          key={index}
                          onClick={(e) => {
                            e.preventDefault();
                            setDriverName(driver);
                            setPreviousDriversVisible(false);
                          }}
                          className="w-full px-3 py-2 text-xs text-left sm:text-sm hover:bg-green-50 focus:bg-green-50 focus:outline-none touch-manipulation"
                        >
                          {driver}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {showDriverDetails && (
              <div className="grid grid-cols-2 gap-4 mt-3 sm:mt-4">
                <div>
                  <label className="flex items-center gap-1 sm:gap-1.5 mb-1.5 sm:mb-2 text-xs sm:text-xs lg:text-sm font-medium text-gray-700">
                    <Phone className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    {t('driverPhone') || 'Driver Mobile'}
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    placeholder={t('optional')}
                    className="w-full px-2.5 py-2 sm:px-3 sm:py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-xs sm:text-sm"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1 sm:gap-1.5 mb-1.5 sm:mb-2 text-xs sm:text-xs lg:text-sm font-medium text-gray-700">
                    <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    {t('vehicleNumber') || 'Vehicle Number'}
                  </label>
                  <input
                    type="text"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    placeholder={t('optional')}
                    className="w-full px-2.5 py-2 sm:px-3 sm:py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-xs sm:text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Items Table - Compact */}
        <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm sm:p-4 lg:p-6 sm:rounded-xl">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <div className="p-1.5 sm:p-2 bg-green-100 rounded-md sm:rounded-lg">
              <Package className="w-4 h-4 text-green-600 sm:w-4.5 sm:h-4.5 lg:w-5 lg:h-5" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 sm:text-base lg:text-lg">{getCategoryHeading()}</h3>
          </div>
          {errors.items && (
            <div className="p-2 mb-3 border border-red-200 rounded-lg sm:p-3 sm:mb-4 bg-red-50">
              <p className="flex items-center gap-1.5 text-xs sm:text-xs text-red-600">
                <span>⚠</span> {errors.items}
              </p>
            </div>
          )}
          <ItemsTable
            items={items}
            onChange={setItems}
            outstandingBalances={outstandingBalances}
            borrowedOutstanding={borrowedOutstanding}
            innerOutstandingBalances={innerOutstanding}
            outerOutstandingBalances={outerOutstanding}
            hideColumns={hideExtraColumns}
            showExtraPortion={showExtraPortion}
            stockData={stockData}
            showAvailable={false}
            showLost={showLostAndDamaged}
            enableItemSearch={true}
            defaultFilterMode="outstanding"
            hideEnteredFilter={true}
          />
        </div>

        {/* Extra Cost Section */}
        {showExtraCost && (
          <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm sm:p-4 lg:p-6 sm:rounded-xl">
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <div className="p-1.5 sm:p-2 bg-amber-100 rounded-md sm:rounded-lg">
                <FileText className="w-4 h-4 text-amber-600 sm:w-4.5 sm:h-4.5 lg:w-5 lg:h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 sm:text-base lg:text-lg">
                  {t('extraCostOption') || 'Extra Cost'}
                </h3>
                <p className="text-xs text-gray-500">{t('optional') || 'Optional'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4">
              <div>
                <label className="block mb-1 text-xs font-medium text-gray-700 sm:text-xs lg:text-sm">
                  1. {t('loadingUnloadingChargesJama') || 'Unloading'}
                </label>
                <div className="relative">
                  <span className="absolute text-gray-500 transform -translate-y-1/2 left-3 top-1/2 text-xs sm:text-sm">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={loadingUnloadingCharges}
                    onChange={(e) => setLoadingUnloadingCharges(e.target.value)}
                    placeholder="0"
                    className="w-full py-2 pl-7 pr-3 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block mb-1 text-xs font-medium text-gray-700 sm:text-xs lg:text-sm">
                  2. {t('vehicleRent') || 'Vehicle Rent'}
                </label>
                <div className="relative">
                  <span className="absolute text-gray-500 transform -translate-y-1/2 left-3 top-1/2 text-xs sm:text-sm">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={vehicleRent}
                    onChange={(e) => setVehicleRent(e.target.value)}
                    placeholder="0"
                    className="w-full py-2 pl-7 pr-3 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Save or Success State - Mobile Optimized */}
        {showSuccess ? (
          <div className="space-y-4 sm:space-y-6">
            <div className="relative p-6 overflow-hidden text-center border border-green-200 rounded-lg shadow-sm sm:p-8 bg-gradient-to-br from-green-50 to-emerald-50 sm:rounded-xl">
              <div className="absolute top-0 right-0 w-24 h-24 bg-green-100 rounded-bl-full opacity-30 sm:w-32 sm:h-32"></div>
              <div className="relative">
                <div className="inline-flex items-center justify-center w-12 h-12 mb-3 bg-green-600 rounded-full sm:w-14 sm:h-14 sm:mb-4 lg:w-16 lg:h-16">
                  <CheckCircle className="w-6 h-6 text-white sm:w-7 sm:h-7 lg:w-8 lg:h-8" />
                </div>
                <h3 className="mb-2 text-lg font-bold text-gray-900 sm:text-xl lg:text-2xl">{t('challanSaved')}</h3>
                <p className="text-xs text-gray-600 sm:text-sm lg:text-base">Challan created and JPEG generated</p>
              </div>
            </div>
            <div className="flex justify-center">
              <button
                onClick={() => navigate('/dashboard')}
                className="inline-flex items-center justify-center w-full gap-2 px-6 py-3 text-sm font-semibold text-white transition-colors bg-green-600 rounded-lg shadow-md sm:w-auto sm:px-8 sm:py-4 sm:text-base lg:text-lg hover:bg-green-700 hover:shadow-lg touch-manipulation active:scale-95"
              >
                <ArrowLeft className="w-5 h-5 sm:w-5 sm:h-5" />
                {t('backToDashboard')}
              </button>
            </div>
          </div>
        ) : (
          <div className="sticky bottom-0 left-0 right-0 z-40 p-3 bg-white border-t border-gray-200 sm:static sm:p-0 sm:border-0 sm:bg-transparent">
            <button
              onClick={onSave}
              className="inline-flex items-center justify-center w-full gap-2 px-6 py-3 text-sm font-semibold text-white transition-colors bg-green-600 rounded-lg shadow-md sm:w-auto sm:mx-auto sm:flex sm:px-8 sm:py-4 sm:text-base lg:text-lg hover:bg-green-700 hover:shadow-lg touch-manipulation active:scale-95"
            >
              <CheckCircle className="w-5 h-5 sm:w-5 sm:h-5" />
              {t('save')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};


const JamaChallan: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, language } = useLanguage();
  const { sizes: rawPlateSizes } = usePlateSizes();
  const { enableCategorySeparation, enableCategoryClientSeparation, enableCategoryChallanSeparation, activeCategory, jackMaterialType } = useSettings();

  const plateSizes = React.useMemo(() => {
    if (!enableCategorySeparation) return rawPlateSizes;
    const cat = activeCategory || 'shuttering';
    return rawPlateSizes.filter(ps => (ps.category || 'shuttering') === cat);
  }, [rawPlateSizes, enableCategorySeparation, activeCategory]);


  // Step management
  const [step, setStep] = useState<Step>('client-selection');
  const [searchQuery, setSearchQuery] = useState('');
  const [clients, setClients] = useState<ClientFormData[]>([]);
  const [showAddClient, setShowAddClient] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientFormData | null>(null);
  const [clientBalances, setClientBalances] = useState<{ [clientId: string]: number }>({});

  // Form states
  const [challanNumber, setChallanNumber] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [driverName, setDriverName] = useState('');
  const [previousDrivers, setPreviousDrivers] = useState<string[]>([]);
  const [previousDriversVisible, setPreviousDriversVisible] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [driverPhone, setDriverPhone] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [loadingUnloadingCharges, setLoadingUnloadingCharges] = useState('');
  const [vehicleRent, setVehicleRent] = useState('');
  const [deposit, setDeposit] = useState('');

  const generateNextChallanNumber = async () => {
    try {
      let query = supabase
        .from("jama_challans")
        .select("jama_challan_number");

      if (enableCategoryChallanSeparation && activeCategory) {
        query = query.eq('category', activeCategory);
      }

      const { data, error } = await query;

      if (error) throw error;

      let maxNumber = 0;
      let formatPrefix = "";
      let padLen = 0;

      if (data && data.length > 0) {
        for (const row of data) {
          const numStr = row.jama_challan_number;
          if (!numStr) continue;
          const match = numStr.match(/(\d+)$/);
          if (match) {
            const currentNum = parseInt(match[1], 10);
            if (currentNum > maxNumber) {
              maxNumber = currentNum;
              formatPrefix = numStr.slice(0, -match[1].length);
              padLen = match[1].length;
            }
          }
        }
      }

      let nextNumber = "1";
      if (maxNumber > 0) {
        const incrementedNumber = maxNumber + 1;
        const paddedNumber = incrementedNumber.toString().padStart(padLen, '0');
        nextNumber = formatPrefix + paddedNumber;
      }

      console.log('Generated next jama challan number:', nextNumber);
      setChallanNumber(nextNumber);

    } catch (error) {
      console.error("Error generating challan number:", error);
      const fallback = "1";
      setChallanNumber(fallback);
    }
  };
  const [hideExtraColumns, setHideExtraColumns] = useState(true);
  const [showLostAndDamaged, setShowLostAndDamaged] = useState(false);
  const [showExtraPortion, setShowExtraPortion] = useState(false);


  const [items, setItems] = useState<ItemsData>({ items: {}, main_note: '' });
  const [outstandingBalances, setOutstandingBalances] = useState<{ [key: number]: number }>({});
  const [borrowedOutstanding, setBorrowedOutstanding] = useState<{ [key: number]: number }>({});
  // Iron-jack-only running totals of the Inner/Outer portions borrowed
  // minus returned so far — a client's history is summed in full every
  // time, so an over-return that pushes one of these negative (a credit)
  // is naturally remembered and carried into the next transaction.
  const [innerOutstanding, setInnerOutstanding] = useState<{ [key: number]: number }>({});
  const [outerOutstanding, setOuterOutstanding] = useState<{ [key: number]: number }>({});
  const [isAllReturn, setIsAllReturn] = useState(false);


  const fetchPreviousDriverNames = async () => {
    try {
      const [jamaResponse, udharResponse] = await Promise.all([
        supabase
          .from('jama_challans')
          .select('driver_name, created_at')
          .not('driver_name', 'is', null),
        supabase
          .from('udhar_challans')
          .select('driver_name, created_at')
          .not('driver_name', 'is', null)
      ]);


      if (jamaResponse.error) throw jamaResponse.error;
      if (udharResponse.error) throw udharResponse.error;


      const allDrivers = [...(jamaResponse.data || []), ...(udharResponse.data || [])]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map(row => row.driver_name?.trim().toLowerCase())
        .filter(Boolean);


      const uniqueDrivers = Array.from(new Set(allDrivers))
        .map(name => name.replace(/\b\w/g, (letter: string) => letter.toUpperCase())) // Capitalize first letter of each word
        .slice(0, 10);


      setPreviousDrivers(uniqueDrivers);
    } catch (error) {
      console.error('Error fetching previous driver names:', error);
    }
  };


  const [stockData, setStockData] = useState<any[]>([]);


  useEffect(() => {
    const init = async () => {
      await fetchClients();
      await generateNextChallanNumber();
      await fetchPreviousDriverNames();

      const { data } = await supabase.from('stock').select('*');
      if (data) {
        setStockData(data);
      }
    };
    init();
  }, [location, enableCategorySeparation, enableCategoryClientSeparation, enableCategoryChallanSeparation, activeCategory]);

  useEffect(() => {
    // Check if client was preselected from navigation
    const state = location.state as { preselectedClient?: { id: string; nicName: string; fullName: string; site: string; phone: string } };
    if (state?.preselectedClient && clients.length > 0) {
      const client = clients.find(c => c.id === state.preselectedClient!.id);
      if (client) {
        handleClientSelect(client.id!);
      }
    }
  }, [location, clients]);


  const fetchClients = async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('client_nic_name');


    if (error) {
      console.error('Error fetching clients:', error);
      toast.error('Failed to load clients');
      return;
    }

    let clientList = data || [];
    if ((enableCategoryClientSeparation || enableCategorySeparation) && activeCategory) {
      clientList = clientList.filter((c: any) =>
        activeCategory === 'shuttering' ? (!c.category || c.category === 'shuttering') : c.category === activeCategory
      );
    }

    setClients(clientList);

    // Fetch balances for all clients
    if (clientList.length > 0) {
      await fetchAllClientBalances(clientList);
    }
  };

  const fetchAllClientBalances = async (clientsList: ClientFormData[]) => {
    const balances: { [clientId: string]: number } = {};

    try {
      const clientIds = clientsList.map(c => c.id).filter((id): id is string => !!id);
      const bulkTransactions = await fetchBulkClientTransactions(clientIds);

      clientsList.forEach(client => {
        const transactions = bulkTransactions.get(client.id!) || [];
        let grandTotal = 0;
        transactions.forEach(transaction => {
          const itemMap = transaction.items?.items || {};
          Object.values(itemMap).forEach((item: any) => {
            const qty = item.qty || 0;
            const borrowed = item.borrowed || 0;
            const lost = item.lost || 0;
            const damaged = item.damaged || 0;

            if (transaction.type === 'udhar') {
              grandTotal += qty + borrowed;
            } else {
              grandTotal -= (qty + borrowed + lost + damaged);
            }
          });
        });
        balances[client.id!] = grandTotal;
      });
    } catch (error) {
      console.error('Error fetching all client balances:', error);
    }

    setClientBalances(balances);
  };


  const handleAddNewClick = () => {
    setShowAddClient(true);
  };


  const handleClientSelect = async (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (client) {
      setSelectedClient(client);
      setStep('challan-details');


      const transactions = await fetchClientTransactions(clientId);


      const balances: { [key: number]: number } = {};
      plateSizes.forEach(ps => {
        balances[ps.id] = 0;
      });


      const borrowedBal: { [key: number]: number } = {};
      plateSizes.forEach(ps => {
        borrowedBal[ps.id] = 0;
      });

      const innerBal: { [key: number]: number } = {};
      const outerBal: { [key: number]: number } = {};
      plateSizes.forEach(ps => {
        innerBal[ps.id] = 0;
        outerBal[ps.id] = 0;
      });


      transactions.forEach(transaction => {
        plateSizes.forEach(ps => {
          const itemDetail = transaction.items?.items?.[ps.id] || {};
          const qty = itemDetail.qty || 0;
          const borrowed = itemDetail.borrowed || 0;
          const lost = itemDetail.lost || 0;
          const damaged = itemDetail.damaged || 0;
          // A jack pair is one Inner + one Outer, so every pair counts
          // toward both portions equally; extraQty only ever nudges the
          // one portion the user picked (e.g. 2 spare Outer pieces on top
          // of the pairs). This is what makes an uneven return show up as
          // an Inner/Outer imbalance instead of just a pair count.
          const pairQty = transaction.type === 'udhar' ? qty : qty + lost + damaged;
          const extraInnerQty = itemDetail.extraPortion === 'inner' ? (itemDetail.extraQty || 0) : 0;
          const extraOuterQty = itemDetail.extraPortion === 'outer' ? (itemDetail.extraQty || 0) : 0;


          if (transaction.type === 'udhar') {
            balances[ps.id] += qty;
            borrowedBal[ps.id] += borrowed;
            innerBal[ps.id] += pairQty + extraInnerQty;
            outerBal[ps.id] += pairQty + extraOuterQty;
          } else {
            balances[ps.id] -= qty + lost + damaged;
            borrowedBal[ps.id] -= borrowed;
            // Over-returns are allowed to go negative on purpose — that
            // negative value *is* the "extra returned" credit, and since
            // it is recomputed from the client's full history every time,
            // it is automatically remembered on their next transaction.
            innerBal[ps.id] -= pairQty + extraInnerQty;
            outerBal[ps.id] -= pairQty + extraOuterQty;
          }
        });
      });

      plateSizes.forEach(ps => {
        if (ps.category === 'jack' && jackMaterialType === 'iron') {
          balances[ps.id] = Math.max(0, Math.min(innerBal[ps.id] || 0, outerBal[ps.id] || 0));
        }
      });

      setOutstandingBalances(balances);
      setBorrowedOutstanding(borrowedBal);
      setInnerOutstanding(innerBal);
      setOuterOutstanding(outerBal);
      setIsAllReturn(false);
      setShowLostAndDamaged(false);

      // Auto-show borrowed column if there are borrowed items
      const hasBorrowedItems = Object.values(borrowedBal).some(val => val > 0);
      if (hasBorrowedItems) {
        setHideExtraColumns(false);
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };


  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };


  const handleQuickAddClient = async (clientData: ClientFormData) => {
    const loadingToast = toast.loading(t('creatingClient'));
    const clientCategory = clientData.category || activeCategory || 'shuttering';

    // Check for duplicate sort name
    const isDuplicate = await checkDuplicateClient(
      clientData.client_nic_name,
      clientCategory,
      enableCategoryClientSeparation
    );

    if (isDuplicate) {
      toast.dismiss(loadingToast);
      toast.error(
        enableCategoryClientSeparation
          ? (language === 'gu' ? 'આ ક્રમાંક/નામ ધરાવતો ગ્રાહક આ વિભાગમાં પહેલાથી જ છે' : 'A client with this sort name already exists in this category')
          : (language === 'gu' ? 'આ ક્રમાંક/નામ ધરાવતો ગ્રાહક પહેલાથી જ છે' : 'A client with this sort name already exists')
      );
      return;
    }

    try {
      const { data, error } = await supabase
        .from('clients')
        .insert([{ ...clientData, category: clientCategory }])
        .select()
        .single();

      toast.dismiss(loadingToast);

      if (error) throw error;

      toast.success('Client created successfully');
      setShowAddClient(false);
      await fetchClients();

      if (data) {
        handleClientSelect(data.id!);
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error('Error adding client:', error);
      toast.error('Failed to create client');
    }
  };


  const handleAllReturn = () => {
    setIsAllReturn(true);
    const newItems = { ...items };
    plateSizes.forEach(ps => {
      (newItems as any)[`size_${ps.id}_qty`] = outstandingBalances[ps.id] || 0;
      (newItems as any)[`size_${ps.id}_borrowed`] = borrowedOutstanding[ps.id] || 0;
    });
    setItems(newItems);
  };

  const handleSave = async () => {
    const newErrors: { [key: string]: string } = {};
    let hasErrors = false;


    if (!selectedClient) {
      newErrors.client = t('requiredField');
      hasErrors = true;
    }


    if (!challanNumber) {
      newErrors.challanNumber = t('requiredField');
      hasErrors = true;
    }


    if (!date) {
      newErrors.date = t('requiredField');
      hasErrors = true;
    }



    const hasQuantities = Object.values(items.items || {}).some(item => (item.qty || 0) > 0);
    const hasExtraItems = Object.values(items.items || {}).some(item => (item.extraQty || 0) > 0 && !!item.extraPortion);
    const hasBorrowedItems = Object.values(items.items || {}).some(item => (item.borrowed || 0) > 0);
    const hasLostItems = Object.values(items.items || {}).some(item => (item.lost || 0) > 0);
    const hasDamagedItems = Object.values(items.items || {}).some(item => (item.damaged || 0) > 0);

    if (!hasQuantities && !hasExtraItems && !hasBorrowedItems && !hasLostItems && !hasDamagedItems) {
      newErrors.items = 'At least one item quantity or borrowed quantity must be greater than 0';
      hasErrors = true;
    }


    if (hasErrors) {
      setErrors(newErrors);
      toast.error('Please fill all required fields');
      return;
    }


    const loadingToast = toast.loading(t('creatingChallan'));


    try {
      if (!selectedClient?.id) return;


      let dupQuery = supabase
        .from('jama_challans')
        .select('jama_challan_number')
        .eq('jama_challan_number', challanNumber);

      if (enableCategoryChallanSeparation && activeCategory) {
        dupQuery = dupQuery.eq('category', activeCategory);
      }

      const { data: existingChallan } = await dupQuery.maybeSingle();


      if (existingChallan) {
        toast.dismiss(loadingToast);
        toast.error(t('duplicateChallan'));
        await generateNextChallanNumber();
        return;
      }


      const insertPayload: any = {
        jama_challan_number: challanNumber,
        client_id: selectedClient.id,
        jama_date: date,
        driver_name: driverName,
        driver_mobile: driverPhone || null,
        vehicle_number: vehicleNumber || null,
        is_all_return: isAllReturn,
        loading_unloading_charges: loadingUnloadingCharges ? parseFloat(loadingUnloadingCharges) || 0 : 0,
        vehicle_rent: vehicleRent ? parseFloat(vehicleRent) || 0 : 0,
        deposit: deposit ? parseFloat(deposit) || 0 : 0,
      };
      if (enableCategorySeparation || activeCategory) {
        insertPayload.category = activeCategory || 'shuttering';
      }

      const { error } = await supabase.from('jama_challans').insert([insertPayload]);


      if (error) throw error;

      const itemsPayload: any = {
        jama_challan_number: challanNumber,
        items: mapRecordToArray(items),
        main_note: items.main_note || null,
      };
      if (enableCategorySeparation || activeCategory) {
        itemsPayload.category = activeCategory || 'shuttering';
      }

      const { error: itemsError } = await supabase.from('jama_items').insert([itemsPayload]);


      if (itemsError) throw itemsError;

      try {
        const lostQuantities: { [key: number]: number } = {};
        const damagedQuantities: { [key: number]: number } = {};

        for (const [sizeIdStr, detail] of Object.entries(items.items || {})) {
          const sizeId = parseInt(sizeIdStr);
          const onRentQty = detail.qty || 0;
          const borrowedQty = detail.borrowed || 0;
          const lostQty = detail.lost || 0;
          const damagedQty = detail.damaged || 0;

          if (onRentQty > 0 || borrowedQty > 0 || lostQty > 0 || damagedQty > 0) {
            // Lost/damaged plates leave "on rent" too; they land in their own buckets instead of available.
            const { error: stockError } = await supabase.rpc('decrement_stock', {
              p_size: sizeId,
              p_on_rent_decrement: onRentQty + lostQty + damagedQty,
              p_borrowed_decrement: borrowedQty,
            });

            if (stockError) {
              console.error(`Error updating stock for size ${sizeId}:`, stockError);
              throw stockError;
            }

            if (lostQty > 0) {
              const { error: lostError } = await supabase.rpc('adjust_lost_stock', {
                p_size: sizeId,
                p_delta: lostQty,
              });

              if (lostError) {
                console.error(`Error updating lost stock for size ${sizeId}:`, lostError);
                throw lostError;
              }

              lostQuantities[sizeId] = lostQty;
            }

            if (damagedQty > 0) {
              const { error: damagedError } = await supabase.rpc('adjust_damaged_stock', {
                p_size: sizeId,
                p_delta: damagedQty,
              });

              if (damagedError) {
                console.error(`Error updating damaged stock for size ${sizeId}:`, damagedError);
                throw damagedError;
              }

              damagedQuantities[sizeId] = damagedQty;
            }
          }
        }

        const historyRows = [
          { type: 'lost', quantities: lostQuantities },
          { type: 'damaged', quantities: damagedQuantities },
        ].filter(r => Object.keys(r.quantities).length > 0);

        for (const row of historyRows) {
          const { error: historyError } = await supabase.from('stock_history').insert({
            type: row.type,
            party_name: selectedClient.client_nic_name || selectedClient.client_name,
            note: `જમા ચલણ #${challanNumber}`,
            amount: 0,
            items: row.quantities,
            date: new Date(date).toISOString(),
          });

          if (historyError) {
            console.error(`Error logging ${row.type} stock history:`, historyError);
          }
        }
      } catch (error) {
        console.error('Error updating stock:', error);
        toast.error('Challan saved but stock update failed');
      }


      toast.dismiss(loadingToast);
      toast.success('Challan created successfully');
      if (extraNotes.length > 0) {
        toast.success(
          (language === 'gu' ? 'નોંધ કરેલ વધારે પરત: ' : 'Extra returned, recorded for next time: ') + extraNotes.join(' | '),
          { duration: 7000 }
        );
      }
      setShowSuccess(true);


      setTimeout(async () => {
        try {
          // Prefer a tenant-configured design (multi-page PDF); fall back to the
          // legacy hard-coded JPEG template when no matching design exists.
          const formattedDate = new Date(date).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          });
          const exported = selectedClient
            ? await tryExportChallanDesign({
              challanType: 'jama',
              challanNumber,
              date: formattedDate,
              plateSizes,
              items,
              clientName: selectedClient.client_name,
              clientNicName: selectedClient.client_nic_name,
              site: selectedClient.site,
              phone: selectedClient.primary_phone_number,
              driverName,
              driverPhone,
              vehicleNumber,
            })
            : false;
          if (!exported) {
            await generateJPEG('jama', challanNumber, date, 2440, 1697);
          }
          toast.success(exported ? 'Challan PDF generated' : 'JPEG generated successfully');
          // Add a delay before refreshing to ensure user sees the success message
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        } catch (error) {
          console.error('Error generating challan export:', error);
          toast.error('Failed to generate challan export');
          // Refresh even if JPEG generation fails
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      }, 500);
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error('Error saving challan:', error);
      toast.error('Failed to create challan');
    }
  };


  return (
    <div className="flex min-h-screen bg-gray-50">
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#363636',
            color: '#fff',
            fontSize: '13px',
            padding: '10px 14px',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
      <Navbar />
      <main className="flex-1 w-full ml-0 app-main-content lg:ml-64">
        <div className="w-full px-3 py-3 pb-20 mx-auto sm:px-4 sm:py-5 lg:px-8 lg:py-12 lg:pb-12 max-w-7xl">
          {step === 'client-selection' ? (
            <>
              <div className="items-center justify-between hidden mb-6 sm:flex lg:mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 lg:text-3xl">{t('jamaChallan')}</h2>
                  <p className="mt-1 text-xs text-gray-600 lg:text-sm lg:mt-2">{t('jamaChallanSubtitle')}</p>
                </div>
              </div>
              <ClientSelectionStep
                clients={clients}
                onClientSelect={handleClientSelect}
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
                clientBalances={clientBalances}
              />
            </>
          ) : (
            selectedClient && (
              <ChallanDetailsStep
                selectedClient={selectedClient}
                onBack={() => setStep('client-selection')}
                onSave={handleSave}
                challanNumber={challanNumber}
                setChallanNumber={setChallanNumber}
                date={date}
                setDate={setDate}
                driverName={driverName}
                setDriverName={setDriverName}
                previousDrivers={previousDrivers}
                previousDriversVisible={previousDriversVisible}
                setPreviousDriversVisible={setPreviousDriversVisible}
                items={items}
                setItems={setItems}
                outstandingBalances={outstandingBalances}
                borrowedOutstanding={borrowedOutstanding}
                innerOutstanding={innerOutstanding}
                outerOutstanding={outerOutstanding}
                errors={errors}
                showSuccess={showSuccess}
                hideExtraColumns={hideExtraColumns}
                setHideExtraColumns={setHideExtraColumns}
                isAllReturn={isAllReturn}
                onAllReturn={handleAllReturn}
                stockData={stockData}
                driverPhone={driverPhone}
                setDriverPhone={setDriverPhone}
                vehicleNumber={vehicleNumber}
                setVehicleNumber={setVehicleNumber}
                showLostAndDamaged={showLostAndDamaged}
                setShowLostAndDamaged={setShowLostAndDamaged}
                showExtraPortion={showExtraPortion}
                setShowExtraPortion={setShowExtraPortion}
                loadingUnloadingCharges={loadingUnloadingCharges}
                setLoadingUnloadingCharges={setLoadingUnloadingCharges}
                vehicleRent={vehicleRent}
                setVehicleRent={setVehicleRent}
                deposit={deposit}
                setDeposit={setDeposit}
              />
            )
          )}


          <div style={{ position: 'absolute', left: '-9999px', width: '2450px' }}>
            {selectedClient && (
              <div
                id="receipt-template"
                style={{
                  display: 'flex',
                  gap: '40px',
                  backgroundColor: 'white',
                  padding: 0
                }}
              >
                <div style={{ position: 'relative', width: '1200px', height: '1697px' }}>
                  <ReceiptTemplate
                    challanType="jama"
                    challanNumber={challanNumber}
                    date={new Date(date).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })}
                    clientName={selectedClient.client_name}
                    clientSortName={selectedClient.client_nic_name}
                    site={selectedClient.site}
                    phone={selectedClient.primary_phone_number}
                    driverName={
                      driverName + (driverPhone || vehicleNumber ? ` (${driverPhone || '-'} / ${vehicleNumber || '-'})` : '')
                    }
                    items={items}
                  />
                </div>
                <div style={{ position: 'relative', width: '1200px', height: '1697px' }}>
                  <ReceiptTemplate
                    challanType="jama"
                    challanNumber={challanNumber}
                    date={new Date(date).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })}
                    clientName={selectedClient.client_name}
                    clientSortName={selectedClient.client_nic_name}
                    site={selectedClient.site}
                    phone={selectedClient.primary_phone_number}
                    driverName={
                      driverName + (driverPhone || vehicleNumber ? ` (${driverPhone || '-'} / ${vehicleNumber || '-'})` : '')
                    }
                    items={items}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};


export default JamaChallan;
