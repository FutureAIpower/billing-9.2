  import { useState, useEffect, useMemo } from "react";
import { Search, RefreshCw, Filter, Download, X, Wallet, FileText } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useSettings } from "../contexts/SettingsContext";
import { supabase } from "../utils/supabase";
import Navbar from "../components/Navbar";
import toast, { Toaster } from "react-hot-toast";
import * as periodCalculations from "../utils/billingPeriodCalculations";
import { generateBillJPEG } from "../utils/generateBillJPEG";
import { generateBillPDF } from "../utils/generateBillPDF";
import BillInvoiceTemplate from "../components/BillInvoiceTemplate";
import ZoomableBillPreview from "../components/ZoomableBillPreview";
import { useNavigate } from "react-router-dom";
import BillCard, { BillRecord } from "../components/BillCard";
import { usePlateSizes } from "../hooks/usePlateSizes";
import { formatLocalDate } from "../utils/dateUtils";
import { getBusinessInfo } from "../utils/businessInfo";

type SortOption = 'dateNewOld' | 'dateOldNew' | 'amountHighLow' | 'amountLowHigh';

export default function BillBook() {
  const { t, language } = useLanguage();
  const {
    dateSortingMethod, shareBillMode, enableCategorySeparation, activeCategory,
    useCustomBusinessInfo, businessName, businessPhone, businessAddress,
    businessSubtitle, enableCategoryBusinessInfo, categoryBusinessInfo,
    getBillFormatForCategory,
  } = useSettings();
  const businessInfo = getBusinessInfo(
    { useCustomBusinessInfo, businessName, businessPhone, businessAddress, businessSubtitle, enableCategoryBusinessInfo, categoryBusinessInfo },
    language,
    activeCategory
  );
  const navigate = useNavigate();
  const { sizes: plateSizes } = usePlateSizes();

  // State
  const [bills, setBills] = useState<BillRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>('dateNewOld');
  const [showSortMenu, setShowSortMenu] = useState(false);

  // View/Download State
  const [selectedBill, setSelectedBill] = useState<any | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Load Bills
  const loadBills = async (showRefreshToast = false) => {
    if (showRefreshToast) setRefreshing(true);
    else setLoading(true);

    try {
      let query = supabase
        .from("bills")
        .select(`
          *,
          client:clients (
            client_name,
            client_nic_name,
            site,
            primary_phone_number
          )
        `);

      if (enableCategorySeparation && activeCategory) {
        query = query.eq('category', activeCategory);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;
      setBills(data || []);
      if (showRefreshToast) toast.success('Bills refreshed');
    } catch (error) {
      console.error("Error loading bills:", error);
      toast.error('Failed to load bills');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (showModal && selectedBill) {
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
  }, [showModal, selectedBill]);

  useEffect(() => {
    loadBills();
  }, [enableCategorySeparation, activeCategory]);

  // Filter & Sort
  const filteredAndSortedBills = useMemo(() => {
    let result = bills.filter((bill) =>
      bill.bill_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bill.client?.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bill.client?.client_nic_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bill.client?.site?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return result.sort((a, b) => {
      // Priority based on search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();

        // Check Bill Number matches
        const aBill = a.bill_number.toLowerCase();
        const bBill = b.bill_number.toLowerCase();

        // Exact bill number match
        if (aBill === query && bBill !== query) return -1;
        if (bBill === query && aBill !== query) return 1;

        // Check Client Nic Name (ID) matches
        const aNic = (a.client?.client_nic_name || '').toLowerCase();
        const bNic = (b.client?.client_nic_name || '').toLowerCase();

        const getID = (str: string) => {
          const m = str.match(/^(\d+)/);
          return m ? m[1] : '';
        };

        const aId = getID(aNic);
        const bId = getID(bNic);

        // Exact ID matches
        const aExactId = aId === query;
        const bExactId = bId === query;

        if (aExactId && !bExactId) return -1;
        if (bExactId && !aExactId) return 1;

        // Starts with search query
        const aStarts = aBill.startsWith(query) || aNic.startsWith(query);
        const bStarts = bBill.startsWith(query) || bNic.startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (bStarts && !aStarts) return 1;
      }

      const dateA = new Date(a.billdate || a.billing_date || a.bill_date || a.created_at).getTime();
      const dateB = new Date(b.billdate || b.billing_date || b.bill_date || b.created_at).getTime();
      const amountA = a.grand_total || a.total_amount || 0;
      const amountB = b.grand_total || b.total_amount || 0;

      switch (sortOption) {
        case 'dateNewOld': return dateB - dateA;
        case 'dateOldNew': return dateA - dateB;
        case 'amountHighLow': return amountB - amountA;
        case 'amountLowHigh': return amountA - amountB;
        default: return 0;
      }
    });
  }, [bills, searchQuery, sortOption]);

  const summaryStats = useMemo(() => {
    let totalBilled = 0;
    let totalPaid = 0;
    let totalDue = 0;
    (bills || []).forEach((b) => {
      totalBilled += (b.grand_total || b.total_amount || 0);
      totalPaid += (b.total_payment || 0);
      totalDue += (b.due_payment || 0);
    });
    return { totalBilled, totalPaid, totalDue, count: bills.length };
  }, [bills]);

  const getSortLabel = (option: SortOption) => {
    return t(option) || option;
  };

  // Fetch Full Bill Details
  const fetchBillDetails = async (bill: any) => {
    setLoadingDetails(true);
    try {
      // 1. Fetch Related Data (Extra Costs, Discounts, Payments)
      const { data: extraCosts } = await supabase
        .from('bill_extra_costs').select('*').eq('bill_number', bill.bill_number);

      const { data: discounts } = await supabase
        .from('bill_discounts').select('*').eq('bill_number', bill.bill_number);

      const { data: payments } = await supabase
        .from('bill_payments').select('*').eq('bill_number', bill.bill_number);

      // 2. Fetch Client Challans for Re-calculation
      const { data: udharChallans } = await supabase
        .from('udhar_challans')
        .select(`*, items:udhar_items(*)`)
        .eq('client_id', bill.client_id)
        .order('udhar_date', { ascending: true });

      const { data: jamaChallans } = await supabase
        .from('jama_challans')
        .select(`*, items:jama_items(*)`)
        .eq('client_id', bill.client_id)
        .order('jama_date', { ascending: true });

      // Fetch client details
      const { data: clientData } = await supabase
        .from('clients')
        .select('jack_rents, previous_pending_amount')
        .eq('id', bill.client_id)
        .single();
      const jackRents = clientData?.jack_rents || {};

      // resolve main date
      const billDateStr = bill.billdate || bill.billing_date || bill.bill_date || bill.created_at;

      // 3. Re-calculate Bill
      // ... (existing calc code) ...
      const calcExtra = (extraCosts || []).map((c: any) => ({ amount: (c.total_amount || (c.pieces * c.price_per_piece)) }));
      const calcDisc = (discounts || []).map((d: any) => ({ amount: (d.total_amount || (d.pieces * d.discount_per_piece)) }));
      const calcPay = (payments || []).map((p: any) => ({ amount: p.amount }));

      const result = periodCalculations.calculateBill(
        udharChallans || [],
        jamaChallans || [],
        bill.to_date || billDateStr,
        bill.daily_rent || 1.5,
        calcExtra,
        calcDisc,
        calcPay,
        10,
        bill.from_date,
        bill.category
          ? plateSizes.filter((ps) => (ps.category || 'shuttering') === bill.category)
          : plateSizes,
        jackRents,
        dateSortingMethod === 'jamaFirst'
      );

      console.log('Calculated Periods:', result.billingPeriods.periods); // DEBUG LOG

      // FETCH PREVIOUS BILL for Pending Amount Display
      let previousBillData = undefined;
      // We look for the bill that ends just before this one starts, or the immediately preceding bill
      const { data: prevBills } = await supabase
        .from('bills')
        .select('bill_number, due_payment, to_date')
        .eq('client_id', bill.client_id)
        .lt('to_date', bill.from_date || billDateStr) // Bills ending before this one starts
        .order('to_date', { ascending: false })
        .limit(1);

      if (prevBills && prevBills.length > 0) {
        const prev = prevBills[0];
        if ((prev.due_payment || 0) > 0) {
          previousBillData = {
            billNumber: prev.bill_number,
            amount: prev.due_payment
          };
        }
      } else {
        const clientPrevPending = clientData?.previous_pending_amount || 0;
        if (clientPrevPending > 0) {
          previousBillData = {
            billNumber: t('startingBalance') || "Starting Balance",
            amount: clientPrevPending
          };
        }
      }

      // Extract extra costs and deposit discounts from challans in the bill period if not present in bill_extra_costs
      const challanExtraCosts: any[] = [];
      const challanDiscounts: any[] = [];

      const filterDate = (d: string) => {
        if (!d) return true;
        const dStr = String(d).split('T')[0];
        const fromStr = bill.from_date ? String(bill.from_date).split('T')[0] : '';
        const toStr = (bill.to_date || billDateStr) ? String(bill.to_date || billDateStr).split('T')[0] : '';
        if (fromStr && dStr < fromStr) return false;
        if (toStr && dStr > toStr) return false;
        return true;
      };

      (udharChallans || []).forEach((ch: any) => {
        if (!filterDate(ch.udhar_date)) return;
        const num = ch.udhar_challan_number;
        const loadVal = parseFloat(String(ch.loading_unloading_charges || 0)) || 0;
        const rentVal = parseFloat(String(ch.vehicle_rent || 0)) || 0;
        const depVal = parseFloat(String(ch.deposit || 0)) || 0;
        const dateStr = ch.udhar_date ? String(ch.udhar_date).split('T')[0] : '';

        if (loadVal > 0) {
          challanExtraCosts.push({
            id: `udhar-${num}-loading`,
            date: dateStr,
            description: language === 'gu' ? `ચડાય (ઉધાર ચલણ #${num})` : `Loading Charges (Udhar Challan #${num})`,
            pieces: 1,
            rate: loadVal,
            amount: loadVal,
          });
        }
        if (rentVal > 0) {
          challanExtraCosts.push({
            id: `udhar-${num}-rent`,
            date: dateStr,
            description: language === 'gu' ? `વાહન ભાડું (ઉધાર ચલણ #${num})` : `Vehicle Rent (Udhar Challan #${num})`,
            pieces: 1,
            rate: rentVal,
            amount: rentVal,
          });
        }
        if (depVal > 0) {
          challanDiscounts.push({
            id: `udhar-${num}-deposit`,
            date: dateStr,
            description: language === 'gu' ? `ડિપોઝિટ જમા (ઉધાર ચલણ #${num})` : `Deposit Credit (Udhar Challan #${num})`,
            amount: depVal,
          });
        }
      });

      (jamaChallans || []).forEach((ch: any) => {
        if (!filterDate(ch.jama_date)) return;
        const num = ch.jama_challan_number;
        const loadVal = parseFloat(String(ch.loading_unloading_charges || 0)) || 0;
        const rentVal = parseFloat(String(ch.vehicle_rent || 0)) || 0;
        const depVal = parseFloat(String(ch.deposit || 0)) || 0;
        const dateStr = ch.jama_date ? String(ch.jama_date).split('T')[0] : '';

        if (loadVal > 0) {
          challanExtraCosts.push({
            id: `jama-${num}-loading`,
            date: dateStr,
            description: language === 'gu' ? `ઉતરાય (જમા ચલણ #${num})` : `Unloading Charges (Jama Challan #${num})`,
            pieces: 1,
            rate: loadVal,
            amount: loadVal,
          });
        }
        if (rentVal > 0) {
          challanExtraCosts.push({
            id: `jama-${num}-rent`,
            date: dateStr,
            description: language === 'gu' ? `વાહન ભાડું (જમા ચલણ #${num})` : `Vehicle Rent (Jama Challan #${num})`,
            pieces: 1,
            rate: rentVal,
            amount: rentVal,
          });
        }
        if (depVal > 0) {
          challanDiscounts.push({
            id: `jama-${num}-deposit`,
            date: dateStr,
            description: language === 'gu' ? `ડિપોઝિટ જમા (જમા ચલણ #${num})` : `Deposit Credit (Jama Challan #${num})`,
            amount: depVal,
          });
        }
      });

      let mappedExtraCosts: any[] = [];
      if (extraCosts && extraCosts.length > 0) {
        mappedExtraCosts = extraCosts.map((c: any) => {
          let description = c.note || '';
          if (description.includes('ભાડાની હમાલી (ઉધાર ચલણ')) {
            description = description.replace(/ભાડાની હમાલી \(ઉધાર ચલણ/g, 'ચડાય (ઉધાર ચલણ');
          } else if (description.includes('ભાડાની હમાલી (જમા ચલણ')) {
            description = description.replace(/ભાડાની હમાલી \(જમા ચલણ/g, 'ઉતરાય (જમા ચલણ');
          }
          const pieces = Number(c.pieces) || 1;
          const rate = Number(c.price_per_piece) || (Number(c.total_amount) ? Number(c.total_amount) / pieces : 0);
          const amount = Number(c.total_amount) || (pieces * rate) || Number(c.amount) || 0;
          return {
            id: c.id,
            date: c.date,
            description: description,
            amount: amount,
            pieces: pieces,
            rate: rate,
          };
        });
      } else if (challanExtraCosts.length > 0) {
        mappedExtraCosts = challanExtraCosts;
      } else if ((bill.total_extra_cost || 0) > 0) {
        mappedExtraCosts = [{
          id: 'extra-cost-total',
          date: bill.to_date || billDateStr,
          description: language === 'gu' ? 'વધારાનો ખર્ચ' : 'Extra Cost',
          amount: Number(bill.total_extra_cost),
          pieces: 1,
          rate: Number(bill.total_extra_cost),
        }];
      }

      let mappedDiscounts: any[] = [];
      if (discounts && discounts.length > 0) {
        mappedDiscounts = discounts.map((d: any) => {
          const pieces = Number(d.pieces) || 1;
          const rate = Number(d.discount_per_piece) || (Number(d.total_amount) ? Number(d.total_amount) / pieces : 0);
          const amount = Number(d.total_amount) || (pieces * rate) || Number(d.amount) || 0;
          return {
            id: d.id,
            date: d.date,
            description: d.note,
            amount: amount,
            pieces: pieces,
            rate: rate,
          };
        });
      } else if (challanDiscounts.length > 0) {
        mappedDiscounts = challanDiscounts;
      } else if ((bill.total_discount || 0) > 0) {
        mappedDiscounts = [{
          id: 'discount-total',
          date: bill.to_date || billDateStr,
          description: language === 'gu' ? 'કસર / ડિસ્કાઉન્ટ' : 'Discount',
          amount: Number(bill.total_discount),
        }];
      }

      // Calculate derived totals to ensure display even if DB columns are 0
      const calculatedTotalRent = bill.total_rent_amount || result.billingPeriods.totalRent || 0;
      const calculatedExtra = bill.total_extra_cost || mappedExtraCosts.reduce((sum: number, c: any) => sum + (c.amount || 0), 0);
      const calculatedDiscount = bill.total_discount || mappedDiscounts.reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
      const calculatedPaid = bill.total_payment || (payments || []).reduce((sum: any, p: any) => sum + p.amount, 0);
      const pending = previousBillData?.amount || 0;

      const derivedGrandTotal = calculatedTotalRent + calculatedExtra + pending;
      const derivedDue = derivedGrandTotal - calculatedDiscount - calculatedPaid;

      const calculatedDeposit = mappedDiscounts
        .filter((d: any) => String(d.id || '').includes('deposit') || String(d.description || '').includes('ડિપોઝિટ') || String(d.description || '').includes('Deposit'))
        .reduce((sum: number, d: any) => sum + (d.amount || 0), 0);

      const otherDiscounts = mappedDiscounts
        .filter((d: any) => !(String(d.id || '').includes('deposit') || String(d.description || '').includes('ડિપોઝિટ') || String(d.description || '').includes('Deposit')))
        .reduce((sum: number, d: any) => sum + (d.amount || 0), 0);

      // 4. Construct Full Bill Object
      const fullBillData = {
        companyDetails: businessInfo,
        billDetails: {
          billNumber: bill.bill_number,
          billDate: billDateStr,
          fromDate: bill.from_date || (udharChallans && udharChallans[0]?.udhar_date) || billDateStr,
          toDate: bill.to_date || billDateStr,
          dailyRent: bill.daily_rent,
        },
        clientDetails: {
          name: bill.client?.client_name,
          nicName: bill.client?.client_nic_name,
          site: bill.client?.site,
          phone: bill.client?.primary_phone_number,
        },
        previousBill: previousBillData, // Pass the previous bill data here
        rentalCharges: result.billingPeriods.periods.map((p: any) => ({
          size: p.sizeName || "All",
          startDate: p.startDate,
          endDate: p.endDate,
          pieces: p.plateCount,
          days: p.days,
          rate: p.rate || bill.daily_rent || 1.5,
          amount: p.rent,
          causeType: p.causeType,
          txnQty: (p.txnQty !== undefined && p.txnQty !== null) ? p.txnQty : 0,
          udharQty: p.udharQty,
          jamaQty: p.jamaQty,
          udharDetails: p.udharDetails,
          jamaDetails: p.jamaDetails,
          sizeId: p.sizeId,
        })),
        extraCosts: mappedExtraCosts,
        discounts: mappedDiscounts,
        payments: (payments || []).map((p: any) => ({
          id: p.id, date: p.date, method: p.payment_method, note: p.note, amount: p.amount
        })),
        summary: {
          grandTotal: bill.grand_total || bill.total_amount || derivedGrandTotal,
          totalPaid: calculatedPaid,
          duePayment: bill.due_payment !== undefined ? bill.due_payment : derivedDue,
          totalRent: calculatedTotalRent,
          totalExtraCosts: calculatedExtra,
          totalDeposit: calculatedDeposit,
          discounts: otherDiscounts,
          // placeholders for template required fields
          totalUdharPlates: 0,
          totalJamaPlates: 0,
          netPlates: 0,
          serviceCharge: 0,
          advancePaid: 0
        },
        mainNote: ""
      };

      return fullBillData;

    } catch (error) {
      console.error('Error details:', error);
      toast.error('Failed to load bill details');
      return null;
    } finally {
      setLoadingDetails(false);
    }
  };

  const downloadBakiPaymentList = () => {
    try {
      const bakiBills = bills.filter((b) => (b.due_payment || 0) > 0);
      if (bakiBills.length === 0) {
        toast.error(localStorage.getItem('language') === 'gu' ? 'કોઈ બાકી ચૂકવણી મળેલ નથી' : 'No pending payments found');
        return;
      }

      // Build CSV
      const isGu = localStorage.getItem('language') === 'gu';
      const headers = isGu
        ? 'ગ્રાહક આઈડી,ગ્રાહક નામ,બિલ નંબર,બિલ તારીખ,પ્રારંભિક તારીખ,અંતિમ તારીખ,કુલ રકમ,ચૂકવેલ રકમ,બાકી રકમ,મોબાઈલ,સાઈટ'
        : 'Client ID,Client Name,Bill Number,Bill Date,From Date,To Date,Total Amount,Paid Amount,Due Amount,Phone,Site';

      const rows = bakiBills.map((b) => {
        const clientId = b.client?.client_nic_name || '';
        const clientName = b.client?.client_name || '';
        const billNum = b.bill_number || '';
        const billDate = b.billdate || b.billing_date || b.bill_date || b.created_at || '';
        const formattedBillDate = billDate ? new Date(billDate).toLocaleDateString('en-GB') : '';
        const fromDate = b.from_date ? new Date(b.from_date).toLocaleDateString('en-GB') : '';
        const toDate = b.to_date ? new Date(b.to_date).toLocaleDateString('en-GB') : '';
        const total = b.grand_total || b.total_amount || 0;
        const paid = b.total_payment || 0;
        const due = b.due_payment || 0;
        const phone = b.client?.primary_phone_number || '';
        const site = b.client?.site || '';

        // Escape comma
        const escapeCSV = (str: string) => `"${String(str).replace(/"/g, '""')}"`;

        return [
          escapeCSV(clientId),
          escapeCSV(clientName),
          escapeCSV(billNum),
          escapeCSV(formattedBillDate),
          escapeCSV(fromDate),
          escapeCSV(toDate),
          total,
          paid,
          due,
          escapeCSV(phone),
          escapeCSV(site),
        ].join(',');
      });

      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers, ...rows].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', isGu ? 'બાકી_પેમેન્ટ_લિસ્ટ.csv' : 'pending_payments_list.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(isGu ? 'બાકી પેમેન્ટ લિસ્ટ ડાઉનલોડ થઈ ગયું!' : 'Pending payments list downloaded!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export CSV');
    }
  };

  const handleViewBill = async (bill: BillRecord) => {
    const details = await fetchBillDetails(bill);
    if (details) {
      setSelectedBill(details);
      setShowModal(true);
    }
  };

  const handleDownloadBill = async (bill: BillRecord) => {
    const toastId = toast.loading(t("loadingDetails"));
    try {
      const details = await fetchBillDetails(bill);
      if (details) {
        const billCategory = (bill as any).category || activeCategory || null;
        const targetFormat = getBillFormatForCategory(billCategory);

        if (targetFormat === 'pdf') {
          const pdfDataUrl = await generateBillPDF(bill.bill_number, details);
          const link = document.createElement('a');
          link.download = `Bill_${bill.bill_number}.pdf`;
          link.href = pdfDataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          toast.success("Bill PDF downloaded successfully", { id: toastId });
        } else {
          const dataUrl = await generateBillJPEG(bill.bill_number, details);
          const link = document.createElement('a');
          link.download = `Bill_${bill.bill_number}.jpg`;
          link.href = dataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          toast.success(t("challanDownloadSuccess"), { id: toastId });
        }
      } else {
        toast.dismiss(toastId);
      }
    } catch (e) {
      console.error(e);
      toast.error(t("challanDownloadError"), { id: toastId });
    }
  };

  const handleDeleteBill = async (bill: BillRecord) => {
    if (window.confirm(`Are you sure you want to delete Bill #${bill.bill_number}? This action cannot be undone.`)) {
      try {
        const { error } = await supabase
          .from('bills')
          .delete()
          .eq('bill_number', bill.bill_number);

        if (error) throw error;

        toast.success("Bill deleted successfully");
        loadBills(); // Refresh list
      } catch (error) {
        console.error("Error deleting bill:", error);
        toast.error("Failed to delete bill");
      }
    }
  };


  const handleEditBill = (bill: BillRecord) => {
    // Navigate to CreateBill page with edit param
    const encodedBillNumber = encodeURIComponent(bill.bill_number);
    navigate(`/billing/create/${bill.client_id}?edit=${encodedBillNumber}`);
  };

  const handleShareBill = async (bill: BillRecord) => {
    if (shareBillMode === 'text') {
      const phone = bill.client?.primary_phone_number || "";
      const cleanPhone = phone.replace(/\D/g, "");
      const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      
      const date = bill.billdate || bill.billing_date || bill.bill_date || bill.created_at;
      const formattedDate = date ? formatLocalDate(date, "dd MMM yyyy") : "";
      const amount = bill.grand_total || bill.total_amount || 0;
      const due = bill.due_payment || 0;
      
      const clientName = bill.client?.client_name || bill.client?.client_nic_name || "";
      const site = bill.client?.site || "";
      
      let message = "";
      const isGu = localStorage.getItem('language') === 'gu';
      if (isGu) {
        message = `પ્રિય ગ્રાહક,
તમારા બિલની વિગતો નીચે મુજબ છે:

બિલ નંબર: #${bill.bill_number}
તારીખ: ${formattedDate}
નામ: ${clientName}
સાઈટ: ${site || '-'}
કુલ રકમ: ₹${amount.toLocaleString("en-IN")}
બાકી રકમ: ₹${due.toLocaleString("en-IN")}

આભાર,
${businessInfo.name}`;
      } else {
        message = `Dear Customer,
Here are your bill details:

Bill Number: #${bill.bill_number}
Date: ${formattedDate}
Client: ${clientName}
Site: ${site || '-'}
Total Amount: ₹${amount.toLocaleString("en-IN")}
Balance Due: ₹${due.toLocaleString("en-IN")}

Thank you,
${businessInfo.name}`;
      }
      
      window.open(`https://api.whatsapp.com/send?phone=${finalPhone}&text=${encodeURIComponent(message)}`, "_blank");
      toast.success("Opening WhatsApp...");
      return;
    }

    const toastId = toast.loading("Generating photo for WhatsApp...");
    try {
      const details = await fetchBillDetails(bill);
      if (!details) {
        toast.dismiss(toastId);
        return;
      }
      
      const dataUrl = await generateBillJPEG(bill.bill_number, details);
      
      // Convert dataUrl (base64) to Blob
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `Bill_${bill.bill_number}.jpg`, { type: 'image/jpeg' });

      toast.dismiss(toastId);

      // Check if Web Share API is available and can share this file
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Bill #${bill.bill_number}`,
            text: `${businessInfo.name} બિલ #${bill.bill_number}`
          });
          toast.success("Shared successfully");
          return;
        } catch (shareError: any) {
          // If the user cancelled the share, do nothing
          if (shareError.name === 'AbortError') {
            return;
          }
          console.warn("Navigator share failed, falling back", shareError);
        }
      }

      // Fallback: download the image and prompt client to share it manually on WhatsApp
      const link = document.createElement('a');
      link.download = `Bill_${bill.bill_number}.jpg`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      const phone = bill.client?.primary_phone_number || "";
      const cleanPhone = phone.replace(/\D/g, "");
      const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      
      // Open WhatsApp to the contact to let user paste/attach the downloaded image
      setTimeout(() => {
        window.open(`https://api.whatsapp.com/send?phone=${finalPhone}&text=${encodeURIComponent("બિલ નીચે મોકલેલ છે:")}`, "_blank");
      }, 500);

      toast.success("Bill photo downloaded. Redirecting to WhatsApp...");
    } catch (e) {
      console.error(e);
      toast.error("Failed to share photo", { id: toastId });
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Navbar />
      <main className="flex-1 w-full ml-0 app-main-content lg:ml-64">
        <div className="flex flex-col gap-3 sm:gap-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">

          {/* Header */}
          <div className="hidden sm:flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t("billBook")}</h1>
              <p className="text-sm text-gray-500 mt-1">{t("manageViewBills")}</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={downloadBakiPaymentList}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" />
                {localStorage.getItem('language') === 'gu' ? 'બાકી લિસ્ટ' : 'Pending List'}
              </button>

              <button
                onClick={() => navigate('/payments')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Wallet className="w-4 h-4" />
                {t("payments")}
              </button>

              <button
                onClick={() => loadBills(true)}
                className={`p-2 rounded-full hover:bg-gray-100 transition-colors ${refreshing ? 'animate-spin' : ''}`}
              >
                <RefreshCw className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>

          {/* Quick Summary Stats */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <div className="p-2.5 sm:p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
              <span className="text-[11px] sm:text-xs font-medium text-gray-500 block">
                {language === 'gu' ? 'કુલ બિલ રકમ' : 'Total Billed'}
              </span>
              <span className="text-sm sm:text-lg font-bold text-gray-900 tabular-nums">
                ₹{summaryStats.totalBilled.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="p-2.5 sm:p-4 bg-white border border-green-200 rounded-xl shadow-sm bg-gradient-to-br from-green-50/50 to-white">
              <span className="text-[11px] sm:text-xs font-medium text-emerald-700 block">
                {language === 'gu' ? 'જમા / ચૂકવેલ રકમ' : 'Payment Done'}
              </span>
              <span className="text-sm sm:text-lg font-bold text-emerald-600 tabular-nums">
                ₹{summaryStats.totalPaid.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="p-2.5 sm:p-4 bg-white border border-red-200 rounded-xl shadow-sm bg-gradient-to-br from-red-50/50 to-white">
              <span className="text-[11px] sm:text-xs font-medium text-red-700 block">
                {language === 'gu' ? 'કુલ બાકી રકમ' : 'Total Due'}
              </span>
              <span className="text-sm sm:text-lg font-bold text-red-600 tabular-nums">
                ₹{summaryStats.totalDue.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute w-5 h-5 text-gray-400 transform -translate-y-1/2 left-3 top-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('searchBills') || "Search bills..."}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none shadow-sm"
              />
            </div>

            {/* Sort Dropdown */}
            <div className="relative sort-menu-container sm:w-48">
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="w-full flex items-center justify-between px-2 sm:px-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
                title={t('sortBy')}
              >
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700 truncate hidden sm:block">
                    {getSortLabel(sortOption)}
                  </span>
                </div>
              </button>

              {showSortMenu && (
                <div className="absolute right-0 z-10 w-48 sm:w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg shadow-gray-200/50 py-1">
                  {(['dateNewOld', 'dateOldNew', 'amountHighLow', 'amountLowHigh'] as SortOption[]).map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setSortOption(option);
                        setShowSortMenu(false);
                      }}
                      className={`w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center gap-2
                        ${sortOption === option ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50'}
                      `}
                    >
                      {getSortLabel(option)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Download Baki List Button */}
            <button
              onClick={downloadBakiPaymentList}
              className="flex items-center justify-center px-4 py-2.5 bg-emerald-600 text-white rounded-xl shadow-sm hover:bg-emerald-700 transition-colors gap-2"
              title={localStorage.getItem('language') === 'gu' ? 'બાકી પેમેન્ટ લિસ્ટ ડાઉનલોડ કરો' : 'Download Pending Payments'}
            >
              <Download className="w-5 h-5" />
              <span className="text-sm font-semibold hidden md:inline">
                {localStorage.getItem('language') === 'gu' ? 'બાકી લિસ્ટ' : 'Pending List'}
              </span>
            </button>
          </div>

          {/* Results Count */}
          <div className="flex items-center justify-between text-sm text-gray-500 px-1">
            <span className="hidden sm:inline">{t('showing')} {filteredAndSortedBills.length} {t('bills')}</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-blue-600 font-medium hover:underline"
              >
                {t('clearSearch')}
              </button>
            )}
          </div>

          {/* Content */}
          {loading && !refreshing ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl h-48 animate-pulse" />
              ))}
            </div>
          ) : filteredAndSortedBills.length === 0 ? (
            <div className="text-center py-12 bg-white border border-gray-200 rounded-2xl border-dashed">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">{t('noBillsFound')}</h3>
              <p className="text-gray-500">
                {searchQuery ? t('tryAdjustingSearch') : t('noBillsCreated')}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pb-20">
              {filteredAndSortedBills.map((bill, index) => (
                <BillCard
                  key={bill.bill_number || `bill-${index}`}
                  bill={bill}
                  t={t}
                  onView={handleViewBill}
                  onDownload={handleDownloadBill}
                  onDelete={handleDeleteBill}
                  onEdit={handleEditBill}
                  onShare={handleShareBill}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      <Toaster />

      {/* Loading Overlay */}
      {loadingDetails && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-xl shadow-xl flex flex-col items-center">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-gray-900 font-medium">{t("loadingDetails")}</p>
          </div>
        </div>
      )}

      {/* View Bill Modal */}
      {showModal && selectedBill && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[92vh] max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-3 sm:p-4 border-b bg-white shrink-0">
              <h3 className="text-base sm:text-lg font-medium text-gray-900 truncate pr-2">
                {t("viewBill")}: {selectedBill.billDetails.billNumber}
              </h3>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={async () => {
                    const toastId = toast.loading(t("loadingDetails"));
                    try {
                      const dataUrl = await generateBillJPEG(selectedBill.billDetails.billNumber, selectedBill);
                      const link = document.createElement('a');
                      link.download = `Bill_${selectedBill.billDetails.billNumber}.jpg`;
                      link.href = dataUrl;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      toast.success(t("challanDownloadSuccess"), { id: toastId });
                    } catch {
                      toast.error(t("challanDownloadError"), { id: toastId });
                    }
                  }}
                  className="p-2 text-green-600 hover:bg-green-50 rounded-lg flex items-center gap-1"
                >
                  <Download className="w-5 h-5" />
                  <span className="text-sm font-medium hidden sm:inline">{t("download")}</span>
                </button>
                <button
                  onClick={() => {
                    const billRecord = bills.find(b => b.bill_number === selectedBill.billDetails.billNumber);
                    if (billRecord) handleShareBill(billRecord);
                  }}
                  className="p-2 text-green-700 hover:bg-green-50 rounded-lg flex items-center gap-1"
                  title="Share on WhatsApp"
                >
                  <svg className="w-5 h-5 text-green-600 fill-current" viewBox="0 0 24 24">
                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.625 1.45 5.536 0 10.038-4.502 10.04-10.04.002-2.684-1.038-5.207-2.93-7.101C16.43 1.57 13.918.531 11.238.531 5.707.531 1.206 5.033 1.204 10.564c-.001 1.507.412 2.977 1.196 4.275L1.44 20.248l5.207-1.365-.001.271z" />
                  </svg>
                  <span className="text-sm font-medium hidden sm:inline">{t("share") || "શેર કરો"}</span>
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-500 rounded-lg hover:bg-gray-100"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <ZoomableBillPreview defaultZoomMode="fit">
              <BillInvoiceTemplate {...selectedBill} />
            </ZoomableBillPreview>
          </div>
        </div>
      )}

    </div>
  );
}