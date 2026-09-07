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
  Plus,
  Eye,
  EyeOff
} from 'lucide-react';
import { fetchUdharChallansForClient, fetchJamaChallansForClient } from '../utils/challanFetching';
import { naturalSort } from '../utils/sortingUtils';
import ClientForm, { ClientFormData } from '../components/ClientForm';
import { checkDuplicateClient } from '../utils/clientUtils';
import ItemsTable, { ItemsData } from '../components/ItemsTable';
import { usePlateSizes } from '../hooks/usePlateSizes';
import { mapRecordToArray } from '../utils/challanOperations';
import ReceiptTemplate from '../components/ReceiptTemplate';

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
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../utils/supabase';
import { generateJPEG } from '../utils/generateJPEG';
import { tryExportChallanDesign } from '../utils/challanDesign/exportChallanDesign';
import Navbar from '../components/Navbar';
import toast, { Toaster } from 'react-hot-toast';

type Step = 'client-selection' | 'challan-details';

interface ClientSelectionStepProps {
  clients: ClientFormData[];
  onClientSelect: (clientId: string) => void;
  onAddNewClick: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isFormOpen?: boolean;
}

const ClientSelectionStep: React.FC<ClientSelectionStepProps> = ({
  clients,
  onClientSelect,
  onAddNewClick,
  searchQuery,
  onSearchChange,
  isFormOpen = false,
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
      {/* Header Actions - Desktop Only */}
      <div className="items-center justify-between hidden p-4 mb-4 bg-white border border-gray-200 sm:flex rounded-xl">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 lg:text-xl">{t('selectClient')}</h3>
          <p className="mt-0.5 text-xs text-gray-500 lg:text-sm">Choose client for udhar challan</p>
        </div>
        <button
          onClick={onAddNewClick}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-sm hover:shadow-md touch-manipulation active:scale-95"
        >
          <UserPlus className="w-4.5 h-4.5" />
          {t('addNewClient')}
        </button>
      </div>

      {/* Search Bar - Compact */}
      <div className="relative">
        <Search className="absolute text-gray-400 transform -translate-y-1/2 left-2.5 sm:left-3 top-1/2 w-4 h-4 sm:w-4.5 sm:h-4.5" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('searchClients') || 'Search clients...'}
          className="w-full py-2 sm:py-2.5 lg:py-3 pl-8 sm:pl-10 pr-3 sm:pr-4 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs sm:text-sm"
        />
      </div>

      {/* Results Count - Compact */}
      {searchQuery && (
        <div className="px-3 py-1.5 sm:px-4 sm:py-2 border border-blue-200 rounded-lg bg-blue-50">
          <p className="text-xs sm:text-xs lg:text-sm text-blue-700">
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
            {searchQuery ? t('tryAdjustingSearch') : t('addYourFirstClient')}
          </p>
          <button
            onClick={searchQuery ? () => onSearchChange('') : onAddNewClick}
            className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-blue-600 transition-colors rounded-lg hover:text-blue-700 hover:bg-blue-50 touch-manipulation active:scale-95"
          >
            {searchQuery ? t('clearSearch') : t('addNewClient')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {filteredClients.map((client) => (
            <button
              key={client.id}
              onClick={() => client.id && onClientSelect(client.id)}
              className="p-3 text-left transition-all bg-white border border-gray-200 shadow-sm sm:p-4 lg:p-5 group rounded-lg sm:rounded-xl hover:shadow-md hover:border-blue-500 touch-manipulation active:scale-[0.98]"
            >
              <div className="flex items-center gap-2 mb-2 sm:gap-3 sm:mb-3">
                <div className="p-1.5 sm:p-2 transition-colors bg-blue-100 rounded-md sm:rounded-lg group-hover:bg-blue-200">
                  <User className="w-4 h-4 text-blue-600 sm:w-5 sm:h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-gray-900 truncate transition-colors sm:text-base lg:text-lg group-hover:text-blue-600">
                    {client.client_nic_name}
                  </h4>
                  <p className="text-xs sm:text-xs lg:text-sm text-gray-600 truncate">{client.client_name}</p>
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

      {/* Mobile FAB for Add Client */}
      {!isFormOpen && (
        <button
          onClick={onAddNewClick}
          className="fixed z-50 flex items-center justify-center transition-all shadow-2xl sm:hidden right-5 w-16 h-16 bg-gradient-to-br from-green-500 to-green-700 rounded-full hover:shadow-green-500/50 active:scale-90 touch-manipulation border-2 border-white ring-4 ring-green-600/30"
          style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
          aria-label="Add new client"
        >
          <Plus className="text-white w-9 h-9" strokeWidth={3} />
        </button>
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
  alternativeSite: string;
  setAlternativeSite: (value: string) => void;
  secondaryPhone: string;
  setSecondaryPhone: (value: string) => void;
  items: ItemsData;
  setItems: (items: ItemsData) => void;
  errors: { [key: string]: string };
  showSuccess: boolean;
  hideExtraColumns: boolean;
  setHideExtraColumns: (value: boolean) => void;
  showExtraPortion: boolean;
  setShowExtraPortion: (value: boolean) => void;
  driverPhone: string;
  setDriverPhone: (val: string) => void;
  vehicleNumber: string;
  setVehicleNumber: (val: string) => void;
  loadingUnloadingCharges: string;
  setLoadingUnloadingCharges: (val: string) => void;
  vehicleRent: string;
  setVehicleRent: (val: string) => void;
  deposit: string;
  setDeposit: (val: string) => void;
  stockData: StockData[];
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
  alternativeSite,
  setAlternativeSite,
  secondaryPhone,
  setSecondaryPhone,
  items,
  setItems,
  errors,
  showSuccess,
  hideExtraColumns,
  setHideExtraColumns,
  showExtraPortion,
  setShowExtraPortion,
  stockData,
  driverPhone,
  setDriverPhone,
  vehicleNumber,
  setVehicleNumber,
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
    return t('itemsDetails');
  };

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      {/* Selected Client Info - Compact Mobile with Back Button */}
      <div className="relative p-3 overflow-hidden border border-blue-200 rounded-lg shadow-sm sm:p-4 lg:p-6 bg-gradient-to-br from-blue-50 to-indigo-50 sm:rounded-xl">
        <div className="absolute top-0 right-0 w-20 h-20 bg-blue-100 rounded-bl-full opacity-30 sm:w-24 sm:h-24 lg:w-32 lg:h-32"></div>
        <div className="relative">
          {/* Mobile Layout */}
          <div className="flex items-start gap-2 sm:hidden">
            <div className="p-2 bg-blue-600 rounded-md">
              <User className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-base font-semibold text-gray-900 truncate">{selectedClient.client_nic_name}</h4>
              <p className="text-xs text-gray-700 truncate">{selectedClient.client_name}</p>
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-600">
                <span className="flex items-center gap-1">
                  <MapPin className="flex-shrink-0 w-3 h-3 text-blue-600" />
                  <span className="truncate">{selectedClient.site}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Phone className="flex-shrink-0 w-3 h-3 text-blue-600" />
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
            <div className="p-2 bg-blue-600 rounded-md sm:p-2.5 lg:p-3 sm:rounded-lg">
              <User className="w-5 h-5 text-white sm:w-6 sm:h-6 lg:w-7 lg:h-7" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-gray-900 truncate sm:text-base lg:text-lg">{selectedClient.client_nic_name}</h4>
              <p className="text-xs text-gray-700 truncate sm:text-xs lg:text-sm">{selectedClient.client_name}</p>
              <div className="grid grid-cols-1 gap-1 mt-2 sm:grid-cols-2 sm:gap-2 lg:mt-3">
                <div className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-xs lg:text-sm text-gray-600">
                  <MapPin className="flex-shrink-0 w-3 h-3 text-blue-600 sm:w-3.5 sm:h-3.5" />
                  <span className="truncate">{selectedClient.site}</span>
                </div>
                <div className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-xs lg:text-sm text-gray-600">
                  <Phone className="flex-shrink-0 w-3 h-3 text-blue-600 sm:w-3.5 sm:h-3.5" />
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
            <div className="p-1.5 sm:p-2 bg-blue-100 rounded-md sm:rounded-lg">
              <FileText className="w-4 h-4 text-blue-600 sm:w-4.5 sm:h-4.5 lg:w-5 lg:h-5" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 sm:text-base lg:text-lg">{t('basicDetails')}</h3>
          </div>
          <div className="space-y-3 sm:space-y-4">
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
                  className={`w-16 sm:w-24 md:w-32 flex-shrink-0 h-10 sm:h-11 px-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base text-center font-bold ${errors.challanNumber ? 'border-red-500' : 'border-gray-300'
                    }`}
                />
                <button
                  onClick={() => setHideExtraColumns(!hideExtraColumns)}
                  className="flex-1 h-10 sm:h-11 inline-flex items-center justify-center gap-1 px-2 sm:px-3 text-xs font-medium text-blue-600 transition-colors rounded-lg bg-blue-50 hover:bg-blue-100 touch-manipulation active:scale-95 border border-blue-100 whitespace-nowrap"
                >
                  {hideExtraColumns ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5" />
                  )}
                  <span>
                    <span className="sm:hidden">{language === 'gu' ? 'ડેપો ૨' : 'Depo 2'}</span>
                    <span className="hidden sm:inline">{t('columns2')}</span>
                  </span>
                </button>
                {hasJackIronRows && (
                  <button
                    type="button"
                    onClick={() => setShowExtraPortion(!showExtraPortion)}
                    className="flex-1 h-10 sm:h-11 inline-flex items-center justify-center gap-1 px-2 sm:px-3 text-xs font-medium text-blue-600 transition-colors rounded-lg bg-blue-50 hover:bg-blue-100 touch-manipulation active:scale-95 border border-blue-100 whitespace-nowrap"
                    title={language === 'gu' ? 'વધારાનું (ઈનર/આઉટર)' : 'Extra (Inner/Outer)'}
                  >
                    {!showExtraPortion ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                    <span>
                      <span className="sm:hidden">{language === 'gu' ? 'વધારાનું' : 'Extra'}</span>
                      <span className="hidden sm:inline">{language === 'gu' ? 'વધારાનું (ઈ/આ)' : 'Extra (I/O)'}</span>
                    </span>
                  </button>
                )}
              </div>
              {errors.challanNumber && (
                <p className="flex items-center gap-1 mt-1 text-xs text-red-600 sm:text-xs">
                  <span>•</span> {errors.challanNumber}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-1 sm:gap-1.5 mb-1.5 sm:mb-2 text-xs sm:text-xs lg:text-sm font-medium text-gray-700">
                  <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  {t('date')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={`w-full px-2.5 py-2 sm:px-3 sm:py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-sm ${errors.date ? 'border-red-500' : 'border-gray-300'
                    }`}
                />
                {errors.date && (
                  <p className="flex items-center gap-1 mt-1 text-xs text-red-600 sm:text-xs">
                    <span>•</span> {errors.date}
                  </p>
                )}
              </div>
              <div>
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
                    className="w-full px-2.5 py-2 sm:px-3 sm:py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs sm:text-sm driver-suggestions"
                  />
                  {previousDriversVisible && previousDrivers.length > 0 && (
                    <div
                      className="absolute z-10 w-full mt-1 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 driver-suggestions"
                    >
                      {previousDrivers.map((driver, index) => (
                        <button
                          key={index}
                          onClick={(e) => {
                            e.preventDefault();
                            setDriverName(driver);
                            setPreviousDriversVisible(false);
                          }}
                          className="w-full px-3 py-2 text-xs text-left sm:text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none touch-manipulation"
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
                    className="w-full px-2.5 py-2 sm:px-3 sm:py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs sm:text-sm"
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
                    className="w-full px-2.5 py-2 sm:px-3 sm:py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs sm:text-sm"
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
            hideColumns={hideExtraColumns}
            showExtraPortion={showExtraPortion}
            stockData={stockData}
            showAvailable={true}
            enableItemSearch={true}
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
              <div>
                <label className="block mb-1 text-xs font-medium text-gray-700 sm:text-xs lg:text-sm">
                  1. {t('loadingUnloadingChargesUdhar') || 'Loading'}
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
                    className="w-full py-2 pl-7 pr-3 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    className="w-full py-2 pl-7 pr-3 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block mb-1 text-xs font-medium text-gray-700 sm:text-xs lg:text-sm">
                  3. {t('deposit') || 'Deposit'}
                </label>
                <div className="relative">
                  <span className="absolute text-gray-500 transform -translate-y-1/2 left-3 top-1/2 text-xs sm:text-sm">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={deposit}
                    onChange={(e) => setDeposit(e.target.value)}
                    placeholder="0"
                    className="w-full py-2 pl-7 pr-3 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Override Details - Collapsible on Mobile */}
        <details className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm sm:p-4 lg:p-6 sm:rounded-xl group">
          <summary className="flex items-center justify-between cursor-pointer list-none touch-manipulation active:scale-[0.99]">
            <div className="flex items-center gap-2">
              <div className="p-1.5 sm:p-2 bg-yellow-100 rounded-md sm:rounded-lg">
                <FileText className="w-4 h-4 text-yellow-600 sm:w-4.5 sm:h-4.5 lg:w-5 lg:h-5" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 sm:text-base lg:text-lg">{t('overrideDetails')}</h3>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 transition-transform sm:w-5 sm:h-5 group-open:rotate-90" />
          </summary>
          <div className="mt-3 sm:mt-4">
            <div className="grid gap-2 sm:gap-3 md:grid-cols-2 lg:gap-4">
              <div>
                <label className="flex items-center gap-1 sm:gap-1.5 mb-1.5 sm:mb-2 text-xs sm:text-xs lg:text-sm font-medium text-gray-700">
                  <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  {t('alternativeSite')}
                </label>
                <input
                  type="text"
                  value={alternativeSite}
                  onChange={(e) => setAlternativeSite(e.target.value)}
                  placeholder={t('optional')}
                  className="w-full px-2.5 py-2 sm:px-3 sm:py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-sm"
                />
              </div>
              <div>
                <label className="flex items-center gap-1 sm:gap-1.5 mb-1.5 sm:mb-2 text-xs sm:text-xs lg:text-sm font-medium text-gray-700">
                  <Phone className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  {t('secondaryPhone')}
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={secondaryPhone}
                  onChange={(e) => setSecondaryPhone(e.target.value)}
                  placeholder={t('optional')}
                  className="w-full px-2.5 py-2 sm:px-3 sm:py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs sm:text-sm"
                />
              </div>
            </div>
          </div>
        </details>

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
                className="inline-flex items-center justify-center w-full gap-2 px-6 py-3 text-sm font-semibold text-white transition-colors bg-blue-600 rounded-lg shadow-md sm:w-auto sm:px-8 sm:py-4 sm:text-base lg:text-lg hover:bg-blue-700 hover:shadow-lg touch-manipulation active:scale-95"
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
              className="inline-flex items-center justify-center w-full gap-2 px-6 py-3 text-sm font-semibold text-white transition-colors bg-blue-600 rounded-lg shadow-md sm:w-auto sm:mx-auto sm:flex sm:px-8 sm:py-4 sm:text-base lg:text-lg hover:bg-blue-700 hover:shadow-lg touch-manipulation active:scale-95"
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

const UdharChallan: React.FC = () => {
  const location = useLocation();
  const { t, language } = useLanguage();
  const { sizes: rawPlateSizes } = usePlateSizes();
  const { enableCategorySeparation, enableCategoryClientSeparation, enableCategoryChallanSeparation, activeCategory } = useSettings();

  const plateSizes = React.useMemo(() => {
    if (!enableCategorySeparation) return rawPlateSizes;
    const cat = activeCategory || 'shuttering';
    return rawPlateSizes.filter(ps => (ps.category || 'shuttering') === cat);
  }, [rawPlateSizes, enableCategorySeparation, activeCategory]);

  // Step management
  const [currentStep, setCurrentStep] = useState<Step>('client-selection');
  const [searchQuery, setSearchQuery] = useState('');

  // Client management
  const [clients, setClients] = useState<ClientFormData[]>([]);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');

  // Stock management
  const [stockData, setStockData] = useState<StockData[]>([]);

  // Challan details
  const [challanNumber, setChallanNumber] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [driverName, setDriverName] = useState('');
  const [previousDrivers, setPreviousDrivers] = useState<string[]>([]);
  const [previousDriversVisible, setPreviousDriversVisible] = useState(false);
  const [alternativeSite, setAlternativeSite] = useState('');
  const [secondaryPhone, setSecondaryPhone] = useState('');
  const [items, setItems] = useState<ItemsData>({ items: {}, main_note: '' });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [hideExtraColumns, setHideExtraColumns] = useState(true);
  const [showExtraPortion, setShowExtraPortion] = useState(false);
  const [driverPhone, setDriverPhone] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [loadingUnloadingCharges, setLoadingUnloadingCharges] = useState('');
  const [vehicleRent, setVehicleRent] = useState('');
  const [deposit, setDeposit] = useState('');

  const generateNextChallanNumber = async () => {
    try {
      let query = supabase
        .from("udhar_challans")
        .select("udhar_challan_number");

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
          const numStr = row.udhar_challan_number;
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

      if (maxNumber > 0) {
        const incrementedNumber = maxNumber + 1;
        const paddedNumber = incrementedNumber.toString().padStart(padLen, '0');
        setChallanNumber(formatPrefix + paddedNumber);
      } else {
        setChallanNumber("1");
      }

    } catch (error) {
      console.error("Error generating challan number:", error);
      setChallanNumber("1");
    }
  };

  const fetchPreviousDriverNames = async () => {
    try {
      const { data, error } = await supabase
        .from('udhar_challans')
        .select('driver_name')
        .not('driver_name', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const uniqueDrivers = [...new Set(data
        .map(row => row.driver_name?.trim())
        .filter(name => name && name.length > 0))]
        .slice(0, 10);

      setPreviousDrivers(uniqueDrivers);
    } catch (error) {
      console.error('Error fetching previous driver names:', error);
    }
  };

  const fetchStock = async () => {
    try {
      const [stockResponse, allUdhar, allJama] = await Promise.all([
        supabase.from('stock').select('*').order('size'),
        fetchUdharChallansForClient(),
        fetchJamaChallansForClient(),
      ]);

      if (stockResponse.error) throw stockResponse.error;

      // Calculate rent stock dynamically (matching StockManagement calculation)
      const calculations = new Map<number, number>();

      // Process Udhar
      allUdhar.forEach(challan => {
        const itemMap = challan.items?.items || {};
        Object.entries(itemMap).forEach(([sizeIdStr, item]: [string, any]) => {
          const sizeId = parseInt(sizeIdStr);
          const qty = Number(item.qty) || 0;
          calculations.set(sizeId, (calculations.get(sizeId) || 0) + qty);
        });
      });

      // Process Jama
      allJama.forEach(challan => {
        const itemMap = challan.items?.items || {};
        Object.entries(itemMap).forEach(([sizeIdStr, item]: [string, any]) => {
          const sizeId = parseInt(sizeIdStr);
          const qty = Number(item.qty) || 0;
          const lost = Number(item.lost) || 0;
          const damaged = Number(item.damaged) || 0;
          calculations.set(sizeId, (calculations.get(sizeId) || 0) - (qty + lost + damaged));
        });
      });

      const computed = (stockResponse.data || []).map((s: any) => {
        const rentStock = calculations.get(s.size) || 0;
        return {
          ...s,
          available_stock: Math.max(0, (s.total_stock || 0) - rentStock - (s.lost_stock || 0) - (s.damaged_stock || 0))
        };
      });

      setStockData(computed);
    } catch (error) {
      console.error('Error fetching stock:', error);
      toast.error('Failed to fetch stock data');
    }
  };

  useEffect(() => {
    const init = async () => {
      await fetchClients();
      await generateNextChallanNumber();
      await fetchPreviousDriverNames();
      await fetchStock();

      // Check if client was preselected from navigation
      const state = location.state as { preselectedClient?: { id: string } };
      if (state?.preselectedClient?.id) {
        setSelectedClientId(state.preselectedClient.id);
        setCurrentStep('challan-details');
      }
    };
    init();
  }, [location, enableCategorySeparation, enableCategoryClientSeparation, enableCategoryChallanSeparation, activeCategory]);

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
          : t('clientExists')
      );
      return;
    }

    const { data, error } = await supabase
      .from('clients')
      .insert({
        client_nic_name: clientData.client_nic_name,
        client_name: clientData.client_name,
        site: clientData.site,
        primary_phone_number: clientData.primary_phone_number,
        category: clientCategory,
      })
      .select()
      .single();

    toast.dismiss(loadingToast);

    if (error) {
      console.error('Error creating client:', error);
      toast.error('Failed to create client');
    } else {
      toast.success('Client created successfully');
      setShowQuickAdd(false);
      await fetchClients();
      if (data) {
        setSelectedClientId(data.id);
      }
    }
  };

  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!challanNumber) {
      newErrors.challanNumber = t('requiredField');
    }
    if (!date) {
      newErrors.date = t('requiredField');
    }
    if (!selectedClientId) {
      newErrors.client = t('requiredField');
    }

    const hasItems = Object.values(items.items || {}).some(item => {
      return (item.qty && item.qty > 0) || (item.borrowed && item.borrowed > 0);
    });

    if (!hasItems) {
      newErrors.items = 'At least one item quantity must be greater than 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      toast.error('Please fill all required fields');
      return;
    }


    let dupQuery = supabase
      .from('udhar_challans')
      .select('udhar_challan_number')
      .eq('udhar_challan_number', challanNumber);

    if (enableCategoryChallanSeparation && activeCategory) {
      dupQuery = dupQuery.eq('category', activeCategory);
    }

    const { data: existingChallan } = await dupQuery.maybeSingle();

    if (existingChallan) {
      toast.error(t('duplicateChallan'));
      await generateNextChallanNumber();
      return;
    }

    const loadingToast = toast.loading(t('creatingChallan'));

    const insertPayload: any = {
      udhar_challan_number: challanNumber,
      client_id: selectedClientId,
      alternative_site: alternativeSite || null,
      secondary_phone_number: secondaryPhone || null,
      udhar_date: date,
      driver_name: driverName || null,
      driver_mobile: driverPhone || null,
      vehicle_number: vehicleNumber || null,
      loading_unloading_charges: loadingUnloadingCharges ? parseFloat(loadingUnloadingCharges) || 0 : 0,
      vehicle_rent: vehicleRent ? parseFloat(vehicleRent) || 0 : 0,
      deposit: deposit ? parseFloat(deposit) || 0 : 0,
    };
    if (enableCategorySeparation || activeCategory) {
      insertPayload.category = activeCategory || 'shuttering';
    }

    const { error: challanError } = await supabase
      .from('udhar_challans')
      .insert(insertPayload);

    if (challanError) {
      toast.dismiss(loadingToast);
      console.error('Error creating challan:', challanError);
      toast.error('Failed to create challan');
      return;
    }

    const itemsPayload: any = {
      udhar_challan_number: challanNumber,
      items: mapRecordToArray(items),
      main_note: items.main_note || null,
    };
    if (enableCategorySeparation || activeCategory) {
      itemsPayload.category = activeCategory || 'shuttering';
    }

    const { error: itemsError } = await supabase
      .from('udhar_items')
      .insert(itemsPayload);

    if (itemsError) {
      toast.dismiss(loadingToast);
      console.error('Error creating items:', itemsError);
      toast.error('Failed to create items');
      return;
    }

    try {
      for (const [sizeIdStr, detail] of Object.entries(items.items || {})) {
        const sizeId = parseInt(sizeIdStr);
        const onRentQty = detail.qty || 0;
        const borrowedQty = detail.borrowed || 0;

        if (onRentQty > 0 || borrowedQty > 0) {
          const { error: stockError } = await supabase.rpc('increment_stock', {
            p_size: sizeId,
            p_on_rent_increment: onRentQty,
            p_borrowed_increment: borrowedQty,
          });

          if (stockError) {
            console.error(`Error updating stock for size ${sizeId}:`, stockError);
            throw stockError;
          }
        }
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error('Error updating stock:', error);
      toast.error('Challan saved but stock update failed');
    }

    toast.dismiss(loadingToast);
    toast.success('Challan created successfully');
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
        const client = clients.find((c) => c.id === selectedClientId);
        const exported = client
          ? await tryExportChallanDesign({
            challanType: 'udhar',
            challanNumber,
            date: formattedDate,
            plateSizes,
            items,
            clientName: client.client_name,
            clientNicName: client.client_nic_name,
            site: alternativeSite || client.site,
            phone: secondaryPhone || client.primary_phone_number,
            driverName,
            driverPhone,
            vehicleNumber,
          })
          : false;
        if (!exported) {
          await generateJPEG('udhar', challanNumber, date, 2440, 1697);
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
  };

  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId);
    setCurrentStep('challan-details');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setCurrentStep('client-selection');
  };

  const selectedClient = clients.find(c => c.id === selectedClientId);

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
        <div className="w-full px-3 pb-20 mx-auto sm:px-4 sm:py-5 lg:px-8 lg:py-12 lg:pb-12 max-w-7xl">
          {currentStep === 'client-selection' ? (
            <>
              <div className="hidden mb-4 sm:block sm:mb-6 lg:mb-8">
                <h2 className="text-xl font-bold text-gray-900 sm:text-2xl lg:text-3xl">{t('udharChallanTitle')}</h2>
                <p className="mt-1 text-xs sm:text-xs lg:text-sm lg:mt-2 text-gray-600">{t('udharChallanSubtitle')}</p>
              </div>
              {showQuickAdd && (
                <>
                  {/* Mobile slide-up form */}
                  <div
                    className="fixed inset-0 z-50 overflow-hidden lg:hidden"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) setShowQuickAdd(false);
                    }}
                  >
                    <div className="absolute inset-0 transition-opacity bg-black bg-opacity-25" />
                    <div className="absolute inset-x-0 bottom-0 max-h-[90%] overflow-auto bg-white rounded-t-2xl shadow-xl transform transition-transform">
                      <div className="p-4 sm:p-6">
                        <ClientForm
                          onSubmit={handleQuickAddClient}
                          onCancel={() => setShowQuickAdd(false)}
                          isQuickAdd={true}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Desktop modal form */}
                  <div className="fixed inset-0 z-50 items-center justify-center hidden lg:flex">
                    <div className="absolute inset-0 bg-black bg-opacity-25" onClick={() => setShowQuickAdd(false)} />
                    <div className="relative w-full max-w-2xl p-6 bg-white shadow-xl rounded-xl">
                      <ClientForm
                        onSubmit={handleQuickAddClient}
                        onCancel={() => setShowQuickAdd(false)}
                        isQuickAdd={true}
                      />
                    </div>
                  </div>
                </>
              )}
              <ClientSelectionStep
                clients={clients}
                onClientSelect={handleClientSelect}
                onAddNewClick={() => setShowQuickAdd(true)}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                isFormOpen={showQuickAdd}
              />
            </>
          ) : (
            selectedClient && (
              <ChallanDetailsStep
                selectedClient={selectedClient}
                onBack={handleBack}
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
                alternativeSite={alternativeSite}
                setAlternativeSite={setAlternativeSite}
                secondaryPhone={secondaryPhone}
                setSecondaryPhone={setSecondaryPhone}
                items={items}
                setItems={setItems}
                errors={errors}
                showSuccess={showSuccess}
                hideExtraColumns={hideExtraColumns}
                setHideExtraColumns={setHideExtraColumns}
                showExtraPortion={showExtraPortion}
                setShowExtraPortion={setShowExtraPortion}
                stockData={stockData}
                driverPhone={driverPhone}
                setDriverPhone={setDriverPhone}
                vehicleNumber={vehicleNumber}
                setVehicleNumber={setVehicleNumber}
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
                    challanType="udhar"
                    challanNumber={challanNumber}
                    date={new Date(date).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })}
                    clientName={selectedClient.client_name}
                    clientSortName={selectedClient.client_nic_name}
                    site={alternativeSite || selectedClient.site}
                    phone={secondaryPhone || selectedClient.primary_phone_number}
                    driverName={
                      driverName + (driverPhone || vehicleNumber ? ` (${driverPhone || '-'} / ${vehicleNumber || '-'})` : '')
                    }
                    items={items}
                  />
                </div>
                <div style={{ position: 'relative', width: '1200px', height: '1697px' }}>
                  <ReceiptTemplate
                    challanType="udhar"
                    challanNumber={challanNumber}
                    date={new Date(date).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })}
                    clientName={selectedClient.client_name}
                    clientSortName={selectedClient.client_nic_name}
                    site={alternativeSite || selectedClient.site}
                    phone={secondaryPhone || selectedClient.primary_phone_number}
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

export default UdharChallan;
