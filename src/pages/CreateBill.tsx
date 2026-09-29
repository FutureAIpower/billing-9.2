import React, { useState, useEffect, useMemo, Fragment } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { format, parseISO, differenceInDays, addDays } from "date-fns";
import { formatLocalDate, safeParseLocalDate } from "../utils/dateUtils";
import { generateBillJPEG } from '../utils/generateBillJPEG';
import { generateBillPDF } from '../utils/generateBillPDF';
import BillInvoiceTemplate from '../components/BillInvoiceTemplate';
import ZoomableBillPreview from '../components/ZoomableBillPreview';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Receipt,
  CreditCard,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  X,
  ChevronDown,
  Save,
} from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useSettings } from "../contexts/SettingsContext";

import * as periodCalculations from "../utils/billingPeriodCalculations";
import { validateClientData } from "../utils/dataValidation";
import { supabase } from "../utils/supabase";
import Navbar from "../components/Navbar";
import toast, { Toaster } from "react-hot-toast";
import { ClientFormData } from "../components/ClientForm";
import { usePlateSizes } from "../hooks/usePlateSizes";
import { getBusinessInfo } from "../utils/businessInfo";






interface SizeBalance {
  size: string;
  main: number;
  borrowed: number;
  total: number;
}
interface ChallanItem {
  size_1_qty: number;
  size_2_qty: number;
  size_3_qty: number;
  size_4_qty: number;
  size_5_qty: number;
  size_6_qty: number;
  size_7_qty: number;
  size_8_qty: number;
  size_9_qty: number; size_10_qty: number;
  size_1_borrowed: number;
  size_2_borrowed: number;
  size_3_borrowed: number;
  size_4_borrowed: number;
  size_5_borrowed: number;
  size_6_borrowed: number;
  size_7_borrowed: number;
  size_8_borrowed: number;
  size_9_borrowed: number; size_10_borrowed: number;
}

interface Transaction {
  type: "udhar" | "jama";
  challanNumber: string;
  date: string;
  grandTotal: number;
  sizes: { [key: string]: { qty: number; borrowed: number } };
  site: string;
  driverName: string;
  items: ChallanItem[];
  challanId: string;
}

interface ClientBalance {
  grandTotal: number;
  sizes: { [key: string]: SizeBalance };
}

interface ExtraCost {
  id: string;
  date: string;
  note: string;
  pieces: number;
  pricePerPiece: number;
  total: number;
}

interface Discount {
  id: string;
  date: string;
  note: string;
  pieces: number;
  discountPerPiece: number;
  total: number;
}

interface Payment {
  id: string;
  date: string;
  note: string;
  amount: number;
  method: "cash" | "bank";
}

interface BillData {
  billNumber: string;
  billDate: string;
  toDate: string;
  dailyRent: number;
  fromDate?: string;
  extraCosts: ExtraCost[];
  discounts: Discount[];
  payments: Payment[];
  mainNote: string;
  errors: {
    billNumber?: string;
    billDate?: string;
    toDate?: string;
    dailyRent?: string;
  };
  transactions?: Transaction[];
  currentBalance?: ClientBalance;
}

export default function CreateBill() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editBillNumber = searchParams.get("edit");
  const isEditMode = !!editBillNumber;
  const { t, language } = useLanguage();
  const {
    dateSortingMethod, enableCategorySeparation, enableCategoryClientSeparation, activeCategory, showExtraCost,
    useCustomBusinessInfo, businessName, businessPhone, businessAddress,
    businessSubtitle, enableCategoryBusinessInfo, categoryBusinessInfo,
    getBillFormatForCategory,
  } = useSettings();
  const businessInfo = getBusinessInfo(
    { useCustomBusinessInfo, businessName, businessPhone, businessAddress, businessSubtitle, enableCategoryBusinessInfo, categoryBusinessInfo },
    language,
    activeCategory
  );
  const { sizes: rawPlateSizes } = usePlateSizes();
  const plateSizes = useMemo(() => {
    if (enableCategorySeparation) {
      const cat = activeCategory || 'shuttering';
      return rawPlateSizes.filter(size => (size.category || 'shuttering') === cat);
    }
    return rawPlateSizes;
  }, [rawPlateSizes, enableCategorySeparation, activeCategory]);

  const [client, setClient] = useState<ClientFormData | null>(null);
  const [billResult, setBillResult] = useState<ReturnType<
    typeof periodCalculations.calculateBill
  > | null>(null);
  const [showCustomRents, setShowCustomRents] = useState(false);
  const [selectedSizeIds, setSelectedSizeIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (plateSizes && plateSizes.length > 0) {
      setSelectedSizeIds(new Set(plateSizes.map(s => s.id)));
    }
  }, [plateSizes]);

  const groupedSizes = useMemo(() => {
    const groups: Record<string, typeof plateSizes> = {
      shuttering: [],
      jack: [],
      cuplock: [],
      other: [],
    };
    plateSizes.forEach((size) => {
      const cat = size.category || "shuttering";
      if (groups[cat]) {
        groups[cat].push(size);
      } else {
        groups[cat] = [size];
      }
    });
    return groups;
  }, [plateSizes]);
  const [billData, setBillData] = useState<BillData>({
    billNumber: "",
    billDate: format(new Date(), "yyyy-MM-dd"),
    toDate: format(new Date(), "yyyy-MM-dd"),
    dailyRent: 1,
    extraCosts: [],
    discounts: [],
    payments: [],
    mainNote: "",
    errors: {},
    transactions: [],
    currentBalance: { grandTotal: 0, sizes: {} }
  });
  const [showLedger, setShowLedger] = useState(false);
  const [currentBalance, setCurrentBalance] = useState<ClientBalance>({
    grandTotal: 0,
    sizes: {},
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showCalculation, setShowCalculation] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [pendingAmount, setPendingAmount] = useState<number>(0);
  const [lastUnpaidBillNumber, setLastUnpaidBillNumber] = useState<string>("");
  // billingMode is standard

  useEffect(() => {
    if (showPreview) {
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
  }, [showPreview]);

  useEffect(() => {
    if (clientId) {
      if (isEditMode && editBillNumber) {
        fetchBillForEdit(editBillNumber);
      } else {
        fetchClient();
      }
    }
  }, [clientId, isEditMode, editBillNumber]);

  // Auto-calculate bill when parameters change
  useEffect(() => {
    if (billData.toDate && billData.dailyRent) {
      const timer = setTimeout(() => {
        calculateBill();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [billData.toDate, billData.fromDate, billData.dailyRent, JSON.stringify(client?.jack_rents)]);

  const fetchBillForEdit = async (billNumber: string) => {
    setIsLoading(true);
    try {
      // 1. Fetch Bill Details
      const { data: bill, error: billError } = await supabase
        .from('bills')
        .select('*')
        .eq('bill_number', billNumber)
        .single();

      if (billError || !bill) throw new Error("Bill not found");

      // 2. Fetch Client Data for context
      // Reuse validation logic roughly but we need setting state
      const validation = await validateClientData(clientId!);
      if (!validation.success) {
        toast.error("Client data issue");
        return;
      }
      setClient(validation.data.client);

      // 3. Fetch Related Items
      const { data: extraCosts } = await supabase.from('bill_extra_costs').select('*').eq('bill_number', billNumber);
      const { data: discounts } = await supabase.from('bill_discounts').select('*').eq('bill_number', billNumber);
      const { data: payments } = await supabase.from('bill_payments').select('*').eq('bill_number', billNumber);

      // 4. Calculate Pending Amount (excluding current bill)
      let prevBillsQuery = supabase
        .from("bills")
        .select("bill_number, due_payment, to_date")
        .eq("client_id", clientId)
        .neq('bill_number', billNumber) // Exclude current
        .lt('to_date', bill.from_date || bill.billing_date); // Strictly before this bill starts

      if (enableCategorySeparation && activeCategory) {
        prevBillsQuery = prevBillsQuery.eq("category", activeCategory);
      }

      const { data: billsData } = await prevBillsQuery
        .order("to_date", { ascending: true });

      let pending = 0;
      let lastUnpaid = "";

      if (billsData && billsData.length > 0) {
        const lastBill = billsData[billsData.length - 1];
        pending = lastBill.due_payment || 0;

        const unpaidBills = billsData.filter(b => (b.due_payment || 0) > 0);
        if (unpaidBills.length > 0) {
          lastUnpaid = unpaidBills[unpaidBills.length - 1].bill_number;
        }
      } else {
        pending = validation.data.client?.previous_pending_amount || 0;
      }
      setPendingAmount(pending);
      setLastUnpaidBillNumber(lastUnpaid);


      // 5. Populate State 
      setBillData({
        billNumber: bill.bill_number,
        billDate: bill.billdate || bill.billing_date || bill.created_at.split('T')[0],
        toDate: bill.to_date,
        fromDate: bill.from_date,
        dailyRent: bill.daily_rent,
        extraCosts: (extraCosts || []).map((c: any) => {
          let note = c.note || '';
          if (note.includes('ભાડાની હમાલી (ઉધાર ચલણ')) {
            note = note.replace(/ભાડાની હમાલી \(ઉધાર ચલણ/g, 'ચડાય (ઉધાર ચલણ');
          } else if (note.includes('ભાડાની હમાલી (જમા ચલણ')) {
            note = note.replace(/ભાડાની હમાલી \(જમા ચલણ/g, 'ઉતરાય (જમા ચલણ');
          }
          return {
            id: c.id,
            date: c.date,
            note: note,
            pieces: c.pieces,
            pricePerPiece: c.price_per_piece,
            total: c.total_amount || (c.pieces * c.price_per_piece)
          };
        }),
        discounts: (discounts || []).map((d: any) => ({
          id: d.id,
          date: d.date,
          note: d.note,
          pieces: d.pieces,
          discountPerPiece: d.discount_per_piece,
          total: d.total_amount || (d.pieces * d.discount_per_piece)
        })),
        payments: (payments || []).map((p: any) => ({
          id: p.id,
          date: p.date,
          note: p.note,
          amount: p.amount,
          method: p.payment_method
        })),
        mainNote: "",
        errors: {},
      });

      // Trigger calculation
      setShowLedger(true);
      // Note: allow the effect hook to trigger calculation or call it manually?
      // Since setting state is async, we might rely on the effect that watches billData.toDate/dailyRent
      // But we just set them.

    } catch (error) {
      console.error("Error loading bill for edit:", error);
      toast.error("Failed to load bill details");
      navigate('/bill-book');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchClient = async () => {
    try {
      // Fetch and validate all client data first
      const validation = await validateClientData(clientId!);

      if (!validation.success) {
        console.error("Data validation failed:", validation.message);
        toast.error(validation.message);
        navigate("/billing");
        return;
      }

      const { client, udharChallans } = validation.data;

      // Generate bill number
      let billSeqQuery = supabase
        .from("bills")
        .select("bill_number");

      if (enableCategorySeparation && activeCategory) {
        billSeqQuery = billSeqQuery.eq("category", activeCategory);
      }

      const { data: lastBill, error: billError } = await billSeqQuery
        .order("bill_number", { ascending: false })
        .limit(100); // Get more bills to ensure we find the right sequence

      if (!billError) {
        let sequence = 1;
        let clientPrefix = client?.client_nic_name || clientId;
        if (enableCategorySeparation && activeCategory) {
          const categorySuffix = activeCategory === 'shuttering' ? 'S' :
            activeCategory === 'jack' ? 'J' :
              activeCategory === 'cuplock' ? 'C' : 'O';
          clientPrefix = `${clientPrefix}-${categorySuffix}`;
        }

        // Find the last bill number for this client
        const clientBills =
          lastBill?.filter((bill) =>
            bill.bill_number.startsWith(clientPrefix + "/")
          ) || [];

        if (clientBills.length > 0) {
          // Extract the highest sequence number
          const sequences = clientBills.map((bill) => {
            const match = bill.bill_number.match(/\/(\d+)$/);
            return match ? parseInt(match[1]) : 0;
          });
          sequence = Math.max(...sequences) + 1;
        }

        const newBillNumber = `${clientPrefix}/${sequence}`;
        setBillData((prev) => ({ ...prev, billNumber: newBillNumber }));
      }

      // Fetch pending amount and dates from previous bills
      let previousBillsQuery = supabase
        .from("bills")
        .select("bill_number, due_payment, created_at, to_date")
        .eq("client_id", clientId);

      if (enableCategorySeparation && activeCategory) {
        previousBillsQuery = previousBillsQuery.eq("category", activeCategory);
      }

      const { data: billsData, error: billsError } = await previousBillsQuery
        .order("to_date", { ascending: true }); // Order by to_date to find the latest covered period

      let calculatedFromDate = udharChallans?.[0]?.udhar_date || "";

      if (!billsError && billsData && billsData.length > 0) {
        // PENDING AMOUNT LOGIC
        // "make sure its count only last one"
        // Instead of summing all bills, we take the due_payment of the LATEST bill, 
        // assuming it carries forward previous dues.
        const lastBill = billsData[billsData.length - 1];
        const totalPending = lastBill.due_payment || 0;

        setPendingAmount(totalPending);

        // Find last unpaid bill number
        const unpaidBills = billsData.filter(b => (b.due_payment || 0) > 0);
        if (unpaidBills.length > 0) {
          // Get the last one in the sorted list (by to_date now)
          setLastUnpaidBillNumber(unpaidBills[unpaidBills.length - 1].bill_number);
        } else {
          setLastUnpaidBillNumber("");
        }

        // AUTO-SET START DATE LOGIC
        // "first fetch pervious date bill was generated till when date and then start from that date"
        // lastBill is already defined above
        if (lastBill.to_date) {
          // Start from next day
          const nextDay = addDays(parseISO(lastBill.to_date), 1);
          calculatedFromDate = format(nextDay, 'yyyy-MM-dd');
          console.log(`Auto-setting fromDate to ${calculatedFromDate} (Day after last bill end date ${lastBill.to_date})`);
        }

      } else if (billsError) {
        console.error("Error fetching pending amount:", billsError);
      } else {
        // No bills found, use client's previous pending amount
        const initialPending = client?.previous_pending_amount || 0;
        setPendingAmount(initialPending);

        if (udharChallans?.[0]) {
          // already set above
        }
      }

      // Log validation results
      console.log("Data Validation Results:", {
        client: validation.data.validation.clientData,
        udharChallans: validation.data.validation.udharChallans,
        jamaChallans: validation.data.validation.jamaChallans,
      });

      // Log detailed data for debugging (omitted for brevity)

      // Set client data
      setClient(client);

      // Set from date and daily rent from client
      if (calculatedFromDate) {
        setBillData((prev) => ({
          ...prev,
          fromDate: calculatedFromDate,
          dailyRent: client?.daily_rent_price ?? 1,
        }));
      } else {
        // Still set the daily rent even if no fromDate
        setBillData((prev) => ({
          ...prev,
          dailyRent: client?.daily_rent_price ?? 1,
        }));
      }
    } catch (error) {
      console.error("Error fetching client:", error);
      toast.error(
        error instanceof Error ? error.message : "Error fetching client data"
      );
      navigate("/billing");
    }
  };

  const validateBillNumber = async (billNumber: string) => {
    if (!billNumber.trim()) return false;

    try {
      const { data, error } = await supabase
        .from("bills")
        .select("bill_number")
        .eq("bill_number", billNumber)
        .maybeSingle();

      if (error) throw error;
      return !data; // Returns true if bill number is available (no matching record found)
    } catch (error) {
      console.error("Error validating bill number:", error);
      return false;
    }
  };

  const handleInputChange = async (
    field: keyof BillData,
    value: string | number
  ) => {
    const newErrors = { ...billData.errors };

    if (field === "billNumber") {
      const isValid = await validateBillNumber(value as string);
      if (!isValid) {
        newErrors.billNumber = "Bill number already exists";
      } else {
        delete newErrors.billNumber;
      }
    }

    setBillData((prev) => ({
      ...prev,
      [field]: value,
      billDate: field === 'toDate' ? (value as string) : prev.billDate,
      errors: newErrors,
    }));
  };

  // Calculate total rent with adjusted days
  const calculatedTotalRent = billResult?.billingPeriods.totalRent || 0;

  // Compute full bill summary once for rendering (size breakdown, totals, payments, due)
  const fullSummary = billResult
    ? {
      totalRent: calculatedTotalRent,
      totalUdharPlates: currentBalance?.sizes
        ? Object.values(currentBalance.sizes).reduce(
          (sum, size) => sum + (size.main || 0),
          0
        )
        : 0,
      totalJamaPlates: currentBalance?.sizes
        ? Object.values(currentBalance.sizes).reduce(
          (sum, size) => sum + (size.borrowed || 0),
          0
        )
        : 0,
      netPlates: currentBalance?.sizes
        ? Object.values(currentBalance.sizes).reduce(
          (sum, size) => sum + ((size.main || 0) - (size.borrowed || 0)),
          0
        )
        : 0,
      serviceCharge: 0, // TODO: Add service charge calculation
      totalExtraCosts: billData.extraCosts.reduce(
        (sum, cost) => sum + cost.total,
        0
      ),
      totalDeposit: billData.discounts
        .filter((d: any) => d.id?.includes('deposit') || d.note?.includes('ડિપોઝિટ') || d.note?.includes('Deposit'))
        .reduce((sum, d) => sum + d.total, 0),
      otherDiscounts: billData.discounts
        .filter((d: any) => !(d.id?.includes('deposit') || d.note?.includes('ડિપોઝિટ') || d.note?.includes('Deposit')))
        .reduce((sum, d) => sum + d.total, 0),
      discounts: billData.discounts
        .filter((d: any) => !(d.id?.includes('deposit') || d.note?.includes('ડિપોઝિટ') || d.note?.includes('Deposit')))
        .reduce((sum, d) => sum + d.total, 0),
      grandTotal:
        calculatedTotalRent +
        billData.extraCosts.reduce((sum, cost) => sum + cost.total, 0) -
        billData.discounts.reduce((sum, discount) => sum + discount.total, 0) +
        (pendingAmount || 0),
      totalPaid: billData.payments.reduce(
        (sum, payment) => sum + payment.amount,
        0
      ),
      advancePaid: 0, // TODO: Add advance payment tracking
      duePayment:
        calculatedTotalRent +
        billData.extraCosts.reduce((sum, cost) => sum + cost.total, 0) +
        (pendingAmount || 0) -
        billData.discounts.reduce(
          (sum, discount) => sum + discount.total,
          0
        ) -
        billData.payments.reduce((sum, payment) => sum + payment.amount, 0),
    }
    : {
      totalRent: 0,
      totalUdharPlates: 0,
      totalJamaPlates: 0,
      netPlates: 0,
      serviceCharge: 0,
      totalExtraCosts: 0,
      totalDeposit: 0,
      otherDiscounts: 0,
      discounts: 0,
      grandTotal: 0,
      totalPaid: 0,
      advancePaid: 0,
      duePayment: 0,
    };

  // UI-friendly map of labels -> amounts (used in Bill Summary section)
  const summaryMap: Record<string, number> = {
    [language === 'gu' ? "કુલ ભાડું" : "Total Rent"]: fullSummary.totalRent,
    ...(fullSummary.totalExtraCosts > 0
      ? { [language === 'gu' ? "વધારાના ચાર્જ (+)" : "Extra Costs (+)"]: fullSummary.totalExtraCosts }
      : {}),
    [language === 'gu' ? "પેટા કુલ" : "Sub Total"]: fullSummary.totalRent + fullSummary.totalExtraCosts,
    ...(fullSummary.totalDeposit > 0
      ? { [language === 'gu' ? "ડિપોઝિટ જમા (-)" : "Deposit Credit (-)"]: fullSummary.totalDeposit }
      : {}),
    ...(fullSummary.otherDiscounts > 0
      ? { [language === 'gu' ? "કસર / ડિસ્કાઉન્ટ (-)" : "Discount (-)"]: fullSummary.otherDiscounts }
      : {}),
    [language === 'gu' ? "કુલ રકમ" : "Grand Total"]: fullSummary.grandTotal,
    ...(fullSummary.totalPaid > 0
      ? { [language === 'gu' ? "ચૂકવણી મળી (-)" : "Total Paid (-)"]: fullSummary.totalPaid }
      : {}),
    [language === 'gu' ? "બાકી રકમ" : "Due Payment"]: fullSummary.duePayment,
  };

  const handleGenerateBill = async () => {
    try {
      setIsLoading(true);

      // Save client custom rents to the database client profile to persist them
      if (client && clientId) {
        await supabase
          .from("clients")
          .update({ jack_rents: client.jack_rents || {} })
          .eq("id", clientId);
      }

      if (isEditMode) {
        // UPDATE EXISTING BILL
        const updatePayload: any = {
          billing_date: billData.billDate,
          from_date: billData.fromDate,
          to_date: billData.toDate,
          daily_rent: billData.dailyRent,
          total_rent_amount: fullSummary.totalRent,
          total_extra_cost: fullSummary.totalExtraCosts,
          total_discount: fullSummary.discounts,
          grand_total: fullSummary.grandTotal,
          total_payment: fullSummary.totalPaid,
          due_payment: Math.round(fullSummary.duePayment),
        };
        if (enableCategorySeparation && activeCategory) {
          updatePayload.category = activeCategory;
        }

        const { error: billUpdateError } = await supabase.from("bills").update(updatePayload).eq('bill_number', billData.billNumber);

        if (billUpdateError) throw billUpdateError;

        // 2. Delete Existing Related Data (graceful fallback if table cache isn't available)
        try { await supabase.from("bill_extra_costs").delete().eq('bill_number', billData.billNumber); } catch (e) { console.warn("Notice: bill_extra_costs delete:", e); }
        try { await supabase.from("bill_discounts").delete().eq('bill_number', billData.billNumber); } catch (e) { console.warn("Notice: bill_discounts delete:", e); }
        try { await supabase.from("bill_payments").delete().eq('bill_number', billData.billNumber); } catch (e) { console.warn("Notice: bill_payments delete:", e); }

        // 3. Insert New Related Data
        if (billData.extraCosts.length > 0) {
          const extraCostsData = billData.extraCosts.map((cost) => {
            const pieces = (cost.pieces !== undefined && cost.pieces !== null && Number(cost.pieces) > 0) ? Number(cost.pieces) : 1;
            const price = (cost.pricePerPiece !== undefined && cost.pricePerPiece !== null && Number(cost.pricePerPiece) > 0)
              ? Number(cost.pricePerPiece)
              : (Number(cost.total) || 0) / pieces;
            return {
              bill_number: billData.billNumber,
              date: cost.date || billData.billDate,
              note: cost.note || 'Extra Cost',
              pieces: pieces,
              price_per_piece: price,
            };
          });
          const { error: extraCostsError } = await supabase.from("bill_extra_costs").insert(extraCostsData);
          if (extraCostsError) console.warn("Could not insert bill_extra_costs:", extraCostsError);
        }

        if (billData.discounts.length > 0) {
          const discountsData = billData.discounts.map((discount) => {
            const pieces = (discount.pieces !== undefined && discount.pieces !== null && Number(discount.pieces) > 0) ? Number(discount.pieces) : 1;
            const price = (discount.discountPerPiece !== undefined && discount.discountPerPiece !== null && Number(discount.discountPerPiece) > 0)
              ? Number(discount.discountPerPiece)
              : (Number(discount.total) || 0) / pieces;
            return {
              bill_number: billData.billNumber,
              date: discount.date || billData.billDate,
              note: discount.note || 'Discount',
              pieces: pieces,
              discount_per_piece: price,
            };
          });
          const { error: discountsError } = await supabase.from("bill_discounts").insert(discountsData);
          if (discountsError) console.warn("Could not insert bill_discounts:", discountsError);
        }

        if (billData.payments.length > 0) {
          const paymentsData = billData.payments.map((payment) => ({
            bill_number: billData.billNumber,
            date: payment.date || billData.billDate,
            note: payment.note,
            amount: Number(payment.amount) || 0,
            payment_method: payment.method,
          }));
          const { error: paymentsError } = await supabase.from("bill_payments").insert(paymentsData);
          if (paymentsError) console.warn("Could not insert bill_payments:", paymentsError);
        }

        toast.success("Bill updated successfully!");

      } else {
        // CREATE NEW BILL
        const insertPayload: any = {
          bill_number: billData.billNumber,
          billing_date: billData.billDate,
          from_date: billData.fromDate,
          to_date: billData.toDate,
          daily_rent: billData.dailyRent,
          client_id: clientId,
          total_rent_amount: fullSummary.totalRent,
          total_extra_cost: fullSummary.totalExtraCosts,
          total_discount: fullSummary.discounts,
          grand_total: fullSummary.grandTotal,
          total_payment: fullSummary.totalPaid,
          due_payment: Math.round(fullSummary.duePayment),
        };
        if (enableCategorySeparation) {
          insertPayload.category = activeCategory || 'shuttering';
        }

        const { error } = await supabase.from("bills").insert(insertPayload);

        if (error) throw error;

        // Save extra costs
        if (billData.extraCosts.length > 0) {
          const extraCostsData = billData.extraCosts.map((cost) => {
            const pieces = (cost.pieces !== undefined && cost.pieces !== null && Number(cost.pieces) > 0) ? Number(cost.pieces) : 1;
            const price = (cost.pricePerPiece !== undefined && cost.pricePerPiece !== null && Number(cost.pricePerPiece) > 0)
              ? Number(cost.pricePerPiece)
              : (Number(cost.total) || 0) / pieces;
            return {
              bill_number: billData.billNumber,
              date: cost.date || billData.billDate,
              note: cost.note || 'Extra Cost',
              pieces: pieces,
              price_per_piece: price,
            };
          });

          const { error: extraCostsError } = await supabase
            .from("bill_extra_costs")
            .insert(extraCostsData);

          if (extraCostsError) console.warn("Could not insert bill_extra_costs:", extraCostsError);
        }

        // Save discounts
        if (billData.discounts.length > 0) {
          const discountsData = billData.discounts.map((discount) => {
            const pieces = (discount.pieces !== undefined && discount.pieces !== null && Number(discount.pieces) > 0) ? Number(discount.pieces) : 1;
            const price = (discount.discountPerPiece !== undefined && discount.discountPerPiece !== null && Number(discount.discountPerPiece) > 0)
              ? Number(discount.discountPerPiece)
              : (Number(discount.total) || 0) / pieces;
            return {
              bill_number: billData.billNumber,
              date: discount.date || billData.billDate,
              note: discount.note || 'Discount',
              pieces: pieces,
              discount_per_piece: price,
            };
          });

          const { error: discountsError } = await supabase
            .from("bill_discounts")
            .insert(discountsData);

          if (discountsError) console.warn("Could not insert bill_discounts:", discountsError);
        }

        // Save payments
        if (billData.payments.length > 0) {
          const paymentsData = billData.payments.map((payment) => ({
            bill_number: billData.billNumber,
            date: payment.date,
            note: payment.note,
            amount: payment.amount,
            payment_method: payment.method,
          }));

          const { error: paymentsError } = await supabase
            .from("bill_payments")
            .insert(paymentsData);

          if (paymentsError) console.warn("Could not insert bill_payments:", paymentsError);
        }

        toast.success("Bill generated successfully!");
      }

      // Generate and download bill in configured format (PDF or JPG)
      try {
        const billCategory = activeCategory || client?.category || null;
        const targetFormat = getBillFormatForCategory(billCategory);

        if (targetFormat === 'pdf') {
          const pdfDataUrl = await generateBillPDF(billData.billNumber, invoiceProps);
          const link = document.createElement('a');
          link.download = `Bill_${billData.billNumber}.pdf`;
          link.href = pdfDataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          toast.success(isEditMode ? 'Bill PDF updated successfully' : 'Bill PDF generated successfully');
        } else {
          const dataUrl = await generateBillJPEG(billData.billNumber, invoiceProps);
          const link = document.createElement('a');
          link.download = `Bill_${billData.billNumber}.jpg`;
          link.href = dataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          toast.success(isEditMode ? 'Bill JPEG updated successfully' : 'Bill JPEG generated successfully');
        }
        // Add a delay before navigating to ensure user sees the success message
        setTimeout(() => {
          navigate("/bill-book");
        }, 1000);
      } catch (error) {
        console.error('Error generating bill file:', error);
        toast.error('Failed to generate bill file');
        // Navigate even if file generation fails
        setTimeout(() => {
          navigate("/bill-book");
        }, 1000);
      }
    } catch (error) {
      console.error("Error generating/updating bill:", error);
      toast.error(isEditMode ? "Failed to update bill" : "Failed to generate bill");
      // Bill header was already saved — still navigate to bill book so user can see it
      setTimeout(() => {
        navigate("/bill-book");
      }, 1500);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateDailyRent = async () => {
    if (!clientId || !billData.dailyRent) return;

    try {
      const { error } = await supabase
        .from('clients')
        .update({ daily_rent_price: billData.dailyRent })
        .eq('id', clientId);

      if (error) throw error;
      toast.success(t("saveSuccess") || "Saved Successfully");
    } catch (error) {
      console.error("Error updating daily rent:", error);
      toast.error("Failed to update daily rent");
    }
  };

  const handleUpdateCustomRents = async (newRents: Record<string, number>) => {
    if (!clientId) return;
    const loadingToast = toast.loading("Saving custom rents...");
    try {
      const { error } = await supabase
        .from('clients')
        .update({ jack_rents: newRents })
        .eq('id', clientId);

      if (error) throw error;
      toast.success(t("saveSuccess") || "Saved Successfully");
    } catch (error) {
      console.error("Error updating custom rents:", error);
      toast.error("Failed to update custom rents");
    } finally {
      toast.dismiss(loadingToast);
    }
  };

  const calculateBill = async () => {
    setIsLoading(true);
    try {
      // Fetch Udhar challans with their items & extra costs
      let udharQuery = supabase
        .from("udhar_challans")
        .select(
          `
          udhar_challan_number,
          udhar_date,
          driver_name,
          alternative_site,
          loading_unloading_charges,
          vehicle_rent,
          deposit,
          category,
          items:udhar_items (
            items,
            main_note
          )
        `
        )
        .eq("client_id", clientId);

      if (enableCategorySeparation && activeCategory) {
        udharQuery = udharQuery.eq("category", activeCategory);
      }

      const { data: udharChallans, error: udharError } = await udharQuery.order("udhar_date", { ascending: true });

      console.log("Udhar Challans:", udharChallans);

      if (udharError) {
        console.error("Error fetching Udhar challans:", udharError);
        throw udharError;
      }

      // Fetch Jama challans with their items & extra costs
      let jamaQuery = supabase
        .from("jama_challans")
        .select(
          `
          jama_challan_number,
          jama_date,
          driver_name,
          alternative_site,
          is_all_return,
          loading_unloading_charges,
          vehicle_rent,
          deposit,
          category,
          items:jama_items (
            items,
            main_note
          )
        `
        )
        .eq("client_id", clientId);

      if (enableCategorySeparation && activeCategory) {
        jamaQuery = jamaQuery.eq("category", activeCategory);
      }

      const { data: rawJamaChallans, error: jamaError } = await jamaQuery.order("jama_date", { ascending: true });

      if (jamaError) throw jamaError;

      const jamaChallans = rawJamaChallans;
      console.log("Jama Challans:", jamaChallans);

      if ((udharChallans && udharChallans.length > 0) || (jamaChallans && jamaChallans.length > 0)) {
        // Extract extra costs & deposit discounts from challans in billing period
        const challanExtraCosts: typeof billData.extraCosts = [];
        const challanDiscounts: typeof billData.discounts = [];

        const filterDate = (d: string) => {
          if (!d) return true;
          const dStr = String(d).split('T')[0];
          const fromStr = billData.fromDate ? String(billData.fromDate).split('T')[0] : '';
          const toStr = billData.toDate ? String(billData.toDate).split('T')[0] : '';
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
              note: language === 'gu' ? `ચડાય (ઉધાર ચલણ #${num})` : `Loading Charges (Udhar Challan #${num})`,
              pieces: 1,
              pricePerPiece: loadVal,
              total: loadVal,
              isFromChallan: true,
            } as any);
          }
          if (rentVal > 0) {
            challanExtraCosts.push({
              id: `udhar-${num}-rent`,
              date: dateStr,
              note: language === 'gu' ? `વાહન ભાડું (ઉધાર ચલણ #${num})` : `Vehicle Rent (Udhar Challan #${num})`,
              pieces: 1,
              pricePerPiece: rentVal,
              total: rentVal,
              isFromChallan: true,
            } as any);
          }
          if (depVal > 0) {
            challanDiscounts.push({
              id: `udhar-${num}-deposit`,
              date: dateStr,
              note: language === 'gu' ? `ડિપોઝિટ જમા (ઉધાર ચલણ #${num})` : `Deposit Credit (Udhar Challan #${num})`,
              pieces: 1,
              discountPerPiece: depVal,
              total: depVal,
              isFromChallan: true,
            } as any);
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
              note: language === 'gu' ? `ઉતરાય (જમા ચલણ #${num})` : `Unloading Charges (Jama Challan #${num})`,
              pieces: 1,
              pricePerPiece: loadVal,
              total: loadVal,
              isFromChallan: true,
            } as any);
          }
          if (rentVal > 0) {
            challanExtraCosts.push({
              id: `jama-${num}-rent`,
              date: dateStr,
              note: language === 'gu' ? `વાહન ભાડું (જમા ચલણ #${num})` : `Vehicle Rent (Jama Challan #${num})`,
              pieces: 1,
              pricePerPiece: rentVal,
              total: rentVal,
              isFromChallan: true,
            } as any);
          }
          if (depVal > 0) {
            challanDiscounts.push({
              id: `jama-${num}-deposit`,
              date: dateStr,
              note: language === 'gu' ? `ડિપોઝિટ જમા (જમા ચલણ #${num})` : `Deposit Credit (Jama Challan #${num})`,
              pieces: 1,
              discountPerPiece: depVal,
              total: depVal,
              isFromChallan: true,
            } as any);
          }
        });

        // Combine challan extra costs and discounts with manually entered items
        const manualCosts = billData.extraCosts.filter((c: any) => !c.isFromChallan && !c.id?.startsWith('udhar-') && !c.id?.startsWith('jama-'));
        const combinedExtraCosts = [...challanExtraCosts, ...manualCosts];

        const manualDiscounts = billData.discounts.filter((d: any) => !d.isFromChallan && !d.id?.startsWith('udhar-') && !d.id?.startsWith('jama-'));
        const combinedDiscounts = [...challanDiscounts, ...manualDiscounts];

        // Update billData if changed
        setBillData((prev) => ({
          ...prev,
          extraCosts: combinedExtraCosts,
          discounts: combinedDiscounts,
        }));

        // Convert cost/discount/payment objects for period calculations
        const extraCharges = combinedExtraCosts.map((cost) => ({
          amount: cost.pieces * cost.pricePerPiece,
        }));
        const discounts = combinedDiscounts.map((discount) => ({
          amount: discount.pieces * discount.discountPerPiece,
        }));
        const payments = billData.payments.map((payment) => ({
          amount: payment.amount,
        }));

        // Calculate bill using the new period-based system
        const result = periodCalculations.calculateBill(
          udharChallans,
          jamaChallans,
          billData.toDate,
          billData.dailyRent,
          extraCharges,
          discounts,
          payments,
          10,
          billData.fromDate,
          plateSizes.filter((ps) => selectedSizeIds.has(ps.id)),
          client?.jack_rents || {},
          dateSortingMethod === 'jamaFirst'
        );

        setBillResult(result);

        // Show which mode was used and the calculated rent total
        const methodLabel = dateSortingMethod === 'jamaFirst' ? '🟢 Jama First' : '🔵 Standard';
        toast.success(`${methodLabel} | Rent: ₹${result.billingPeriods.totalRent.toFixed(2)}`, { duration: 5000 });

        // Initialize balance tracking from the per-size results
        const balance: ClientBalance = {
          grandTotal: 0,
          sizes: {},
        };

        plateSizes.forEach((ps) => {
          const sizePeriods = result.billingPeriods.periods.filter(
            (p: any) => p.sizeId === ps.id
          );
          const lastSizePeriod = sizePeriods[sizePeriods.length - 1];
          const count = lastSizePeriod?.plateCount || 0;
          balance.sizes[ps.id.toString()] = {
            size: ps.name,
            main: count,
            borrowed: 0,
            total: count,
          };
          balance.grandTotal += count;
        });

        // Sum lost and damaged quantities from jama challans inside the billing period
        // so a charge line can be prefilled per size per bucket.
        const lostBySize: Record<number, number> = {};
        const damagedBySize: Record<number, number> = {};
        (jamaChallans || []).forEach((ch: any) => {
          if (billData.fromDate && ch.jama_date < billData.fromDate) return;
          if (ch.jama_date > billData.toDate) return;
          const row = Array.isArray(ch.items) ? ch.items[0] : ch.items;
          const itemsArr = Array.isArray(row?.items) ? row.items : [];
          itemsArr.forEach((it: any) => {
            if (!selectedSizeIds.has(it.size_id)) return;
            if ((it.lost || 0) > 0) {
              lostBySize[it.size_id] = (lostBySize[it.size_id] || 0) + it.lost;
            }
            if ((it.damaged || 0) > 0) {
              damagedBySize[it.size_id] = (damagedBySize[it.size_id] || 0) + it.damaged;
            }
          });
        });

        // idPrefix: 'lost-'/'damaged-'; notePrefix builds 'ગુમ - <size>' / 'નુકસાન - <size>'.
        // legacyNotePrefix matches pre-split saved rows ('ગુમ/નુ. - <size>') so they
        // still block auto-adding a duplicate charge in edit mode.
        const mergeBucketExtraCosts = (
          extraCosts: ExtraCost[],
          bySize: Record<number, number>,
          idPrefix: string,
          notePrefix: string,
          legacyNotePrefix?: string,
        ): ExtraCost[] => {
          const next = extraCosts
            // Drop stale unpriced auto rows whose size no longer has quantity in the period
            .filter((c) => {
              if (!c.id.startsWith(idPrefix)) return true;
              const sizeId = parseInt(c.id.slice(idPrefix.length));
              return (bySize[sizeId] || 0) > 0 || c.pricePerPiece > 0;
            })
            // Keep unpriced auto rows in sync with the recalculated quantities
            .map((c) => {
              if (!c.id.startsWith(idPrefix) || c.pricePerPiece > 0) return c;
              const sizeId = parseInt(c.id.slice(idPrefix.length));
              const qty = bySize[sizeId] || c.pieces;
              const sizeName = plateSizes.find((ps) => ps.id === sizeId)?.name || String(sizeId);
              return { ...c, pieces: qty, note: `${notePrefix} - ${sizeName} (${qty} નંગ)`, total: qty * c.pricePerPiece };
            });

          Object.entries(bySize).forEach(([sizeIdStr, qty]) => {
            const sizeId = parseInt(sizeIdStr);
            const sizeName = plateSizes.find((ps) => ps.id === sizeId)?.name || sizeIdStr;
            const autoExists = next.some((c) => c.id === `${idPrefix}${sizeId}`);
            // In edit mode, previously saved damage lines come back with uuid ids —
            // match them by note prefix so we don't double-add.
            const savedExists = next.some((c) =>
              !c.id.startsWith(idPrefix) &&
              (c.note.startsWith(`${notePrefix} - ${sizeName}`) ||
                (legacyNotePrefix ? c.note.startsWith(`${legacyNotePrefix} - ${sizeName}`) : false)));
            if (!autoExists && !savedExists) {
              next.push({
                id: `${idPrefix}${sizeId}`,
                date: billData.toDate,
                note: `${notePrefix} - ${sizeName} (${qty} નંગ)`,
                pieces: qty,
                pricePerPiece: 0,
                total: 0,
              });
            }
          });

          return next;
        };

        const mergeLostExtraCosts = (extraCosts: ExtraCost[]): ExtraCost[] =>
          mergeBucketExtraCosts(
            mergeBucketExtraCosts(extraCosts, lostBySize, 'lost-', 'ગુમ', 'ગુમ/નુ.'),
            damagedBySize, 'damaged-', 'નુકસાન');

        // Update state with the calculated results
        setCurrentBalance(balance);
        setBillData((prev) => ({
          ...prev,
          // fromDate: earliestDate, // REMOVED: Do not override user selection
          extraCosts: mergeLostExtraCosts(prev.extraCosts),
          currentBalance: balance,
          // Convert transactions from the ledger for UI display
          transactions: result.billingPeriods.ledger.map((entry) => ({
            type: entry.entryType,
            challanNumber: entry.challanNumber,
            date: entry.transactionDate,
            grandTotal:
              entry.entryType === "udhar"
                ? entry.udharAmount || 0
                : entry.jamaAmount || 0,
            items: [], // We don't need detailed items for display
            sizes: {}, // We don't need size breakdown for display
            site: "", // This info isn't critical for the ledger display
            driverName: "",
            challanId: entry.challanNumber,
          })),
        }));
        setShowLedger(true);
      }
    } catch (error) {
      console.error("Error calculating bill:", error);
      toast.error("Failed to calculate bill");
    } finally {
      setIsLoading(false);
    }
  };

  // const handleSave = async () => {
  //   // Implement save functionality
  //   toast.success("Bill generated successfully!");
  //   navigate("/billing");
  // };

  if (!client) {
    return null;
  }

  const invoiceProps = {
    companyDetails: businessInfo,
    billDetails: {
      billNumber: billData.billNumber,
      billDate: billData.billDate,
      fromDate: billData.fromDate || "",
      toDate: billData.toDate,
      dailyRent: billData.dailyRent,
      category: activeCategory || client?.category,
    },
    clientDetails: {
      name: client?.client_name || "",
      nicName: client?.client_nic_name || "",
      site: client?.site || "",
      phone: client?.primary_phone_number || "",
    },
    rentalCharges: billResult?.billingPeriods.periods.map((period) => {

      let end = parseISO(period.endDate);
      const newDisplayEndDate = end.toISOString();

      return {
        size: (period as any).sizeName || "All",
        pieces: period.plateCount,
        days: period.days,
        rate: (period as any).rate || billData.dailyRent,
        amount: period.rent,
        startDate: period.startDate,
        endDate: newDisplayEndDate,
        causeType: period.causeType as 'udhar' | 'jama',
        udharQty: period.udharQty,
        jamaQty: period.jamaQty,
        udharDetails: period.udharDetails,
        jamaDetails: period.jamaDetails,
      };
    }) || [],
    extraCosts: billData.extraCosts.map(cost => ({
      id: cost.id,
      date: cost.date,
      description: cost.note,
      amount: cost.total,
      pieces: cost.pieces,
      rate: cost.pricePerPiece
    })),
    discounts: billData.discounts.map(discount => ({
      id: discount.id,
      date: discount.date,
      description: discount.note,
      amount: discount.total,
    })),
    payments: billData.payments.map(payment => ({
      id: payment.id,
      date: payment.date,
      method: payment.method,
      note: payment.note,
      amount: payment.amount,
    })),
    summary: fullSummary,
    mainNote: billData.mainNote,
    previousBill: pendingAmount > 0 ? {
      billNumber: lastUnpaidBillNumber,
      amount: pendingAmount
    } : undefined
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Navbar />
      <main className="flex-1 w-full ml-0 app-main-content pb-20 sm:pb-0 lg:ml-64">
        <div className="w-full max-w-6xl px-4 py-4 mx-auto sm:px-6 lg:px-8 sm:py-6 lg:py-8">
          <div className="space-y-4">
            {/* Section A: Client Information */}
            <div className="px-4 py-3 bg-white border border-gray-200 rounded-xl">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-baseline gap-6">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {client.client_nic_name}
                    </h3>
                    <p className="text-sm text-gray-500">{client.client_name}</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate("/billing")}
                  className="p-2 text-gray-400 transition-colors rounded-lg hover:bg-gray-100 hover:text-gray-600"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-0">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin className="flex-shrink-0 w-4 h-4 text-gray-400" />
                  <span>{client.site}</span>
                </div>
              </div>

              {/* Pending Amount Alert */}
              {pendingAmount > 0 && (
                <div className="flex items-center gap-3 p-3 mt-4 bg-red-50 border border-red-100 rounded-lg">
                  <div className="p-2 bg-red-100 rounded-full">
                    <Receipt className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-red-800">{t('totalPendingAmount')}</p>
                    <p className="text-lg font-bold text-red-700">₹{pendingAmount.toLocaleString("en-IN")}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Section B: Bill Header Information */}
            <div className="p-4 bg-white border border-gray-200 rounded-xl space-y-4">
              <h4 className="text-base font-bold text-gray-900">
                {t("billDetails")}
              </h4>
              <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                <div className="space-y-3">
                  {/* Line 1: Bill Number & Till Date side-by-side */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block mb-1 text-xs font-semibold text-gray-700">
                        {t("billNumber")}
                        <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Receipt className="absolute w-4 h-4 text-gray-400 transform -translate-y-1/2 left-2.5 top-1/2" />
                        <input
                          type="text"
                          disabled={isEditMode}
                          value={billData.billNumber}
                          onChange={(e) =>
                            handleInputChange("billNumber", e.target.value)
                          }
                          className={`block w-full py-1.5 pl-8 pr-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${billData.errors.billNumber
                            ? "border-red-500"
                            : "border-gray-300"
                            } ${isEditMode ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""}`}
                          placeholder="BILL-..."
                        />
                      </div>
                      {billData.errors.billNumber && (
                        <p className="mt-1 text-xs text-red-500">
                          {billData.errors.billNumber}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block mb-1 text-xs font-semibold text-gray-700">
                        {t("tillDate")}
                        <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Calendar className="absolute w-4 h-4 text-gray-400 transform -translate-y-1/2 left-2.5 top-1/2" />
                        <input
                          type="date"
                          value={billData.toDate}
                          onChange={(e) =>
                            handleInputChange("toDate", e.target.value)
                          }
                          className="block w-full py-1.5 pl-8 pr-2 text-xs border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Line 2: Daily Rent & Custom Rents Toggle side-by-side */}
                  <div className="grid grid-cols-2 gap-3 items-end">
                    <div>
                      <label className="block mb-1 text-xs font-semibold text-gray-700">
                        {t("dailyRent")}
                        <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-1.5 w-full">
                        <div className="relative flex-1 min-w-0">
                          <CreditCard className="absolute w-4 h-4 text-gray-400 transform -translate-y-1/2 left-2.5 top-1/2" />
                          <input
                            type="number"
                            step="0.01"
                            value={billData.dailyRent}
                            onChange={(e) =>
                              handleInputChange(
                                "dailyRent",
                                parseFloat(e.target.value)
                              )
                            }
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="block w-full py-1.5 pl-8 pr-2 text-xs border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 font-medium"
                            placeholder="1.50"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleUpdateDailyRent}
                          className="p-1.5 text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center justify-center shrink-0 min-h-[32px] min-w-[32px]"
                          title="Save Default"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block mb-1 text-xs font-semibold text-gray-700">
                        {language === 'gu' ? 'કસ્ટમ સાઈઝ ભાડું' : 'Custom Rents'}
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowCustomRents(!showCustomRents)}
                        className={`flex items-center justify-between w-full py-1.5 px-3 text-xs font-semibold rounded-lg border transition-all min-h-[32px] ${showCustomRents
                            ? 'bg-blue-50 border-blue-300 text-blue-700'
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                      >
                        <span className="flex items-center gap-1">
                          <span>📂</span>
                          <span>{language === 'gu' ? 'સેટ કરો' : 'Configure'}</span>
                        </span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showCustomRents ? 'rotate-180 text-blue-500' : ''}`} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Select Items to Include Section */}
                {plateSizes && plateSizes.length > 0 && (
                  <div className="pt-2 border-t border-gray-150">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-gray-700">
                        {language === 'gu' ? 'બિલમાં સામેલ કરવા માટે સાઇઝ પસંદ કરો' : 'Select Sizes to Include in Bill'}
                      </label>
                      <div className="flex gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setSelectedSizeIds(new Set(plateSizes.map((s) => s.id)))}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {language === 'gu' ? 'બધા પસંદ કરો' : 'Select All'}
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                          type="button"
                          onClick={() => setSelectedSizeIds(new Set())}
                          className="font-medium text-gray-500 hover:underline"
                        >
                          {language === 'gu' ? 'બધા કાઢી નાખો' : 'Clear All'}
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 border border-gray-200 rounded-lg max-h-[160px] overflow-y-auto">
                      {plateSizes.map((size) => {
                        const isChecked = selectedSizeIds.has(size.id);
                        return (
                          <button
                            key={size.id}
                            type="button"
                            onClick={() => {
                              const nextSelected = new Set(selectedSizeIds);
                              if (nextSelected.has(size.id)) {
                                nextSelected.delete(size.id);
                              } else {
                                nextSelected.add(size.id);
                              }
                              setSelectedSizeIds(nextSelected);
                            }}
                            className={`px-2 py-1.5 text-xs font-bold rounded-lg border transition-all ${isChecked
                                ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-sm'
                                : 'bg-white border-gray-300 text-gray-500 opacity-60 hover:opacity-100 hover:bg-gray-50'
                              }`}
                          >
                            {size.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Calculate Bill Button below */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={calculateBill}
                    disabled={
                      isLoading ||
                      !billData.billNumber ||
                      !billData.billDate ||
                      !billData.toDate ||
                      !billData.dailyRent ||
                      Object.keys(billData.errors).length > 0
                    }
                    className="w-full px-4 py-2 text-xs font-bold text-white transition-colors bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 flex items-center justify-center min-h-[36px] active:scale-[0.98] transition-transform"
                  >
                    {isLoading ? "ગણતરી થય રહી છે..." : `${t("calculateBill")}`}
                  </button>
                </div>
              </form>

              {/* Custom size rents collapsible accordion section */}
              {showCustomRents && (
                <div className="border-t border-gray-150 pt-3 mt-1 p-3 bg-gray-50 rounded-xl space-y-4">
                  {(() => {
                    const selectedCategory = activeCategory || client?.category;
                    const visibleEntries = Object.entries(groupedSizes).filter(([category, sizes]) => {
                      if (!sizes || sizes.length === 0) return false;
                      if (enableCategoryClientSeparation && selectedCategory) {
                        return category === selectedCategory;
                      }
                      return true;
                    });

                    if (visibleEntries.length === 0) {
                      return (
                        <p className="text-xs text-gray-500 text-center py-2">
                          {language === 'gu' ? 'આ વિભાગ માટે કોઈ કસ્ટમ કદ ભાડું નથી' : 'No custom size rents for this category'}
                        </p>
                      );
                    }

                    return visibleEntries.map(([category, sizes]) => {
                      const categoryLabel = category === 'shuttering' ? (language === 'gu' ? 'શટરિંગ / પ્લેટ' : 'Shuttering / Plates') :
                        category === 'jack' ? (language === 'gu' ? 'જેક' : 'Jack') :
                          category === 'cuplock' ? (language === 'gu' ? 'કપલોક' : 'Cuplock') :
                            (language === 'gu' ? 'અન્ય' : 'Other');
                      return (
                        <div key={category} className="space-y-2">
                          <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                            {categoryLabel}
                          </h5>
                          <div className="grid grid-cols-2 gap-3 pl-2 border-l-2 border-gray-200 sm:grid-cols-4">
                            {sizes.map((size) => {
                              const currentRent = client?.jack_rents?.[size.id] ?? '';
                              return (
                                <div key={size.id} className="space-y-1">
                                  <label className="block text-xs font-semibold text-gray-600 truncate">
                                    {size.name}
                                  </label>
                                  <input
                                    type="number"
                                    value={currentRent}
                                    placeholder={`${billData.dailyRent} (${language === 'gu' ? 'ડિફોલ્ટ' : 'Default'})`}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      const nextRents = { ...(client?.jack_rents || {}) };
                                      if (isNaN(val)) {
                                        delete nextRents[size.id];
                                      } else {
                                        nextRents[size.id] = val;
                                      }
                                      setClient(prev => prev ? { ...prev, jack_rents: nextRents } : null);
                                    }}
                                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white font-medium text-center"
                                    min={0}
                                    step="any"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                  <div className="flex justify-end pt-2 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => handleUpdateCustomRents(client?.jack_rents || {})}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {language === 'gu' ? 'કસ્ટમ ભાડું સાચવો' : 'Save Custom Rents'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Billing Mode Selector removed */}

            {/* Section C: Rental Calculation */}
            {showLedger && billData.fromDate && (
              <div className="p-4 mb-4 bg-white border border-gray-200 rounded-xl">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-base font-medium text-gray-900">
                    {t("rentalCalculation")}
                  </h4>
                  <button
                    onClick={() => setShowCalculation(!showCalculation)}
                    className="p-1 text-gray-500 rounded hover:bg-gray-100"
                    title={showCalculation ? "Hide Calculation" : "Show Calculation"}
                  >
                    {showCalculation ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
                <div className="space-y-6">
                  {/* Date Information Table */}
                  <table className="w-full overflow-hidden text-sm border border-gray-200 rounded-lg">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                          થી તારીખ
                        </th>
                        <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                          સુધી તારીખ
                        </th>
                        <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                          કુલ દિવસો
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-white">
                        <td className="px-4 py-3 font-medium">
                          {formatLocalDate(billData.fromDate, "dd/MM/yyyy")}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {formatLocalDate(billData.toDate, "dd/MM/yyyy")}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {differenceInDays(
                            safeParseLocalDate(billData.toDate),
                            safeParseLocalDate(billData.fromDate)
                          ) + 1}{" "}દિવસો
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Rental Breakdown Table */}
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table
                      className={`w-full text-sm ${showCalculation ? "min-w-[600px]" : ""
                        } sm:min-w-0`}
                    >
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="w-1/4 px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                            સમયગાળો
                          </th>
                          <th className="w-1/6 px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                            દિવસો
                          </th>
                          {showCalculation && (
                            <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                              ગણતરી
                            </th>
                          )}
                          <th className="w-1/6 px-4 py-3 text-xs font-medium tracking-wider text-right text-gray-500 uppercase">
                            રકમ
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {billResult?.billingPeriods.periods.map(
                          (period, index, array) => {
                            // const isLastPeriod = index === array.length - 1;
                            // For Jama periods, show the actual return date
                            // For other periods, show one day before the next period starts
                            let end = parseISO(period.endDate);
                            if (period.days > 0) {
                              end = addDays(end, -1);
                            }

                            const newDisplayEndDate = format(end, "dd/MM/yyyy");

                            // Days calculation is now handled in billingPeriodCalculations.ts
                            const rate = (period as any).rate || billData.dailyRent;
                            const amount = period.rent;
                            const sizeName = (period as any).sizeName;

                            const isNewSize = Boolean(
                              sizeName &&
                              (index === 0 || sizeName !== (array[index - 1] as any).sizeName)
                            );

                            const catName = (activeCategory || sizeName || client?.category || '').toLowerCase();
                            const unitLabel = (catName.includes('zula') || catName.includes('jhula') || catName.includes('ઝૂલા')) ? 'ઝૂલા' :
                              (catName.includes('pharma') || catName.includes('ફર્મા')) ? 'ફર્મા' :
                                (catName.includes('jack') || catName.includes('જેક')) ? 'જેક' : 'પ્લેટ';

                            return (
                              <React.Fragment key={`period-row-${index}`}>
                                {isNewSize && (
                                  <tr className="bg-slate-100/90 border-t border-b border-slate-300 font-semibold">
                                    <td colSpan={showCalculation ? 4 : 3} className="px-4 py-2 text-xs text-slate-800">
                                      <div className="flex items-center gap-2">
                                        <span className="inline-block w-2 h-2 rounded-full bg-blue-600"></span>
                                        <span>સાઈઝ: <strong className="text-gray-900 text-xs sm:text-sm font-bold">{sizeName}</strong></span>
                                        {rate ? <span className="text-gray-500 font-normal ml-1 text-[11px]">(ભાવ: ₹{rate}/દિવસ)</span> : null}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                                <tr
                                  className={
                                    period.causeType === "udhar"
                                      ? "bg-red-50"
                                      : "bg-green-50"
                                  }
                                >
                                  <td className="px-4 py-3">
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-2">
                                        <div
                                          className={`w-2 h-2 rounded-full ${period.causeType === "udhar"
                                            ? "bg-red-500"
                                            : "bg-green-500"
                                            }`}
                                        ></div>
                                        <span>
                                          {period.days === 0
                                            ? newDisplayEndDate
                                            : <>{format(parseISO(period.startDate), "dd/MM/yyyy")} થી {newDisplayEndDate}</>
                                          }
                                        </span>
                                      </div>
                                      {sizeName && (
                                        <div className="text-xs text-gray-500 ml-4 font-semibold">
                                          સાઈઝ: {sizeName}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">{period.days}</td>
                                  {showCalculation && (
                                    <td className="px-4 py-3">
                                      {period.plateCount} {unitLabel} × {period.days} દિવસો
                                      × ₹{rate}
                                    </td>
                                  )}
                                  <td className="px-4 py-3 font-medium text-right">
                                    ₹{amount.toLocaleString("en-IN")}
                                  </td>
                                </tr>
                              </React.Fragment>
                            );
                          }
                        )}
                      </tbody>
                    </table>
                  </div>
                  {/* Total Row */}
                  <div className="pt-4 mt-4 border-t">
                    <div className="flex justify-between text-base font-semibold">
                      <span>કુલ ભાડું:</span>
                      <span>
                        ₹
                        {(
                          billResult?.billingPeriods.totalRent || 0
                        ).toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Section D, E, F: Extra Costs, Discounts, Payments */}
            {showLedger && billData.fromDate && (
              <>
                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      setBillData((prev) => ({
                        ...prev,
                        extraCosts: [
                          ...prev.extraCosts,
                          {
                            id: crypto.randomUUID(),
                            date: format(new Date(), "yyyy-MM-dd"),
                            note: "",
                            pieces: 1,
                            pricePerPiece: 1,
                            total: 1,
                          },
                        ],
                      }));
                    }}
                    className="flex-grow flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors shadow-sm active:scale-[0.98]"
                  >
                    <Plus className="w-4 h-4" />
                    {t('cost')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBillData((prev) => ({
                        ...prev,
                        discounts: [
                          ...prev.discounts,
                          {
                            id: crypto.randomUUID(),
                            date: format(new Date(), "yyyy-MM-dd"),
                            note: "",
                            pieces: 0,
                            discountPerPiece: 0,
                            total: 0,
                          },
                        ],
                      }));
                    }}
                    className="flex-grow flex-items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors shadow-sm active:scale-[0.98]"
                  >
                    <Plus className="w-4 h-4" />
                    {t('discount')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBillData((prev) => ({
                        ...prev,
                        payments: [
                          ...prev.payments,
                          {
                            id: crypto.randomUUID(),
                            date: format(new Date(), "yyyy-MM-dd"),
                            note: "",
                            amount: 0,
                            method: "cash",
                          },
                        ],
                      }));
                    }}
                    className="flex-grow flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors shadow-sm active:scale-[0.98]"
                  >
                    <Plus className="w-4 h-4" />
                    {t('payment')}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 mb-4 md:grid-cols-3">
                  {/* Section D: Extra Costs */}
                  <div className={`p-4 bg-white border border-gray-200 rounded-xl ${billData.extraCosts.length === 0 ? 'hidden' : 'block'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-base font-medium text-gray-900">
                        વધારાનો ખર્ચ
                      </h4>
                      <div className="flex items-center gap-2">
                        {billData.extraCosts.length > 0 && (
                          <button
                            onClick={() => {
                              setBillData((prev) => ({
                                ...prev,
                                extraCosts: [],
                              }));
                            }}
                            className="block p-1 text-red-600 transition-colors rounded hover:bg-red-50"
                            title="Clear all"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {billData.extraCosts.length > 0 && (
                      <div className="space-y-3">
                        {billData.extraCosts.map((cost, index) => (
                          <div key={cost.id} className="relative p-3 pt-9 border border-gray-200 rounded-lg bg-gray-50">
                            {/* Absolute Delete Button */}
                            <button
                              onClick={() => {
                                const newCosts = billData.extraCosts.filter(
                                  (c) => c.id !== cost.id
                                );
                                setBillData((prev) => ({
                                  ...prev,
                                  extraCosts: newCosts,
                                }));
                              }}
                              className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>

                            <div className="space-y-2 mb-2">
                              <div>
                                <label className="block mb-0.5 text-xs font-medium text-gray-600">તારીખ</label>
                                <input
                                  type="date"
                                  value={cost.date}
                                  onChange={(e) => {
                                    const newCosts = [...billData.extraCosts];
                                    newCosts[index] = {
                                      ...cost,
                                      date: e.target.value,
                                    };
                                    setBillData((prev) => ({
                                      ...prev,
                                      extraCosts: newCosts,
                                    }));
                                  }}
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block mb-0.5 text-xs font-medium text-gray-600">નોંધ</label>
                                <input
                                  type="text"
                                  value={cost.note}
                                  onChange={(e) => {
                                    const newCosts = [...billData.extraCosts];
                                    newCosts[index] = {
                                      ...cost,
                                      note: e.target.value,
                                    };
                                    setBillData((prev) => ({
                                      ...prev,
                                      extraCosts: newCosts,
                                    }));
                                  }}
                                  placeholder="નોંધ"
                                  list="cost-suggestions"
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="block mb-1 text-xs font-medium text-gray-600">સંખ્યા</label>
                                <input
                                  type="number"
                                  value={cost.pieces === 0 ? '' : cost.pieces}
                                  onChange={(e) => {
                                    const pieces = parseInt(e.target.value) || 0;
                                    const newCosts = [...billData.extraCosts];
                                    newCosts[index] = {
                                      ...cost,
                                      pieces,
                                      total: pieces * (cost.pricePerPiece || 1),
                                    };
                                    setBillData((prev) => ({
                                      ...prev,
                                      extraCosts: newCosts,
                                    }));
                                  }}
                                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                  min="0"
                                  className="w-full px-2 py-1 text-sm border rounded"
                                />
                              </div>
                              <div>
                                <label className="block mb-1 text-xs font-medium text-gray-600">નંગ</label>
                                <input
                                  type="number"
                                  value={cost.pricePerPiece === 0 ? '' : cost.pricePerPiece}
                                  onChange={(e) => {
                                    const price = parseFloat(e.target.value) || 0;
                                    const newCosts = [...billData.extraCosts];
                                    newCosts[index] = {
                                      ...cost,
                                      pricePerPiece: price,
                                      total: (cost.pieces || 1) * price,
                                    };
                                    setBillData((prev) => ({
                                      ...prev,
                                      extraCosts: newCosts,
                                    }));
                                  }}
                                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                  min="0"
                                  step="0.01"
                                  className="w-full px-2 py-1 text-sm border rounded"
                                />
                              </div>
                              <div>
                                <label className="block mb-1 text-xs font-medium text-gray-600">કુલ</label>
                                <div className="px-2 py-1 text-sm font-medium text-gray-900">
                                  ₹{cost.total.toLocaleString("en-IN")}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}

                        {/* Total */}
                        <div className="flex justify-between p-3 font-medium border-t-2 border-gray-300 bg-gray-50">
                          <span>કુલ ચાર્જિસ:</span>
                          <span>
                            ₹{billData.extraCosts
                              .reduce((sum, cost) => sum + cost.total, 0)
                              .toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Section E: Deposits & Discounts */}
                  <div className={`p-4 bg-white border border-gray-200 rounded-xl ${billData.discounts.length === 0 ? 'hidden' : 'block'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-base font-medium text-gray-900">
                        {language === 'gu' ? 'ડિપોઝિટ / છૂટ' : 'Deposit / Discounts'}
                      </h4>
                      <div className="flex items-center gap-2">
                        {billData.discounts.length > 0 && (
                          <button
                            onClick={() => {
                              setBillData((prev) => ({
                                ...prev,
                                discounts: [],
                              }));
                            }}
                            className="block p-1 text-red-600 transition-colors rounded hover:bg-red-50"
                            title="Clear all"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        )}
                      </div>

                      <datalist id="cost-suggestions">
                        <option value="સર્વિસ ચાર્જ" />
                        <option value="ભરાઈ / ઉતરાઈ" />
                        <option value="ગુમ" />
                        <option value="નુકસાન" />
                      </datalist>
                    </div>

                    {billData.discounts.length > 0 && (
                      <div className="space-y-3">
                        {billData.discounts.map((discount, index) => (
                          <div key={discount.id} className="relative p-3 pt-9 border border-gray-200 rounded-lg bg-gray-50">
                            {/* Absolute Delete Button */}
                            <button
                              onClick={() => {
                                const newDiscounts = billData.discounts.filter(
                                  (d) => d.id !== discount.id
                                );
                                setBillData((prev) => ({
                                  ...prev,
                                  discounts: newDiscounts,
                                }));
                              }}
                              className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>

                            <div className="space-y-2 mb-2">
                              <div>
                                <label className="block mb-0.5 text-xs font-medium text-gray-600">તારીખ</label>
                                <input
                                  type="date"
                                  value={discount.date}
                                  onChange={(e) => {
                                    const newDiscounts = [...billData.discounts];
                                    newDiscounts[index] = {
                                      ...discount,
                                      date: e.target.value,
                                    };
                                    setBillData((prev) => ({
                                      ...prev,
                                      discounts: newDiscounts,
                                    }));
                                  }}
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block mb-0.5 text-xs font-medium text-gray-600">નોંધ</label>
                                <input
                                  type="text"
                                  value={discount.note}
                                  onChange={(e) => {
                                    const newDiscounts = [...billData.discounts];
                                    newDiscounts[index] = {
                                      ...discount,
                                      note: e.target.value,
                                    };
                                    setBillData((prev) => ({
                                      ...prev,
                                      discounts: newDiscounts,
                                    }));
                                  }}
                                  placeholder="નોંધ"
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="block mb-1 text-xs font-medium text-gray-600">સંખ્યા</label>
                                <input
                                  type="number"
                                  value={discount.pieces === 0 ? '' : discount.pieces}
                                  onChange={(e) => {
                                    const pieces = parseInt(e.target.value) || 0;
                                    const newDiscounts = [...billData.discounts];
                                    newDiscounts[index] = {
                                      ...discount,
                                      pieces,
                                      total: pieces * (discount.discountPerPiece || 0),
                                    };
                                    setBillData((prev) => ({
                                      ...prev,
                                      discounts: newDiscounts,
                                    }));
                                  }}
                                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                  min="0"
                                  className="w-full px-2 py-1 text-sm border rounded"
                                />
                              </div>
                              <div>
                                <label className="block mb-1 text-xs font-medium text-gray-600">નંગ</label>
                                <input
                                  type="number"
                                  value={discount.discountPerPiece === 0 ? '' : discount.discountPerPiece}
                                  onChange={(e) => {
                                    const discountPerPiece = parseFloat(e.target.value) || 0;
                                    const newDiscounts = [...billData.discounts];
                                    newDiscounts[index] = {
                                      ...discount,
                                      discountPerPiece,
                                      total: (discount.pieces || 1) * discountPerPiece,
                                    };
                                    setBillData((prev) => ({
                                      ...prev,
                                      discounts: newDiscounts,
                                    }));
                                  }}
                                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                  min="0"
                                  step="0.01"
                                  className="w-full px-2 py-1 text-sm border rounded"
                                />
                              </div>
                              <div>
                                <label className="block mb-1 text-xs font-medium text-gray-600">કુલ</label>
                                <div className="px-2 py-1 text-sm font-medium text-gray-900">
                                  ₹{discount.total.toLocaleString("en-IN")}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}

                        {/* Total */}
                        <div className="flex justify-between p-3 font-medium border-t-2 border-gray-300 bg-gray-50">
                          <span>કુલ છૂટ / ડિપોઝિટ:</span>
                          <span>
                            ₹{billData.discounts
                              .reduce((sum, discount) => sum + discount.total, 0)
                              .toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Section F: Payments */}
                  <div className={`p-4 bg-white border border-gray-200 rounded-xl ${billData.payments.length === 0 ? 'hidden' : 'block'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-base font-medium text-gray-900">
                        ચુકવણી
                      </h4>
                      <div className="flex items-center gap-2">
                        {billData.payments.length > 0 && (
                          <button
                            onClick={() => {
                              setBillData((prev) => ({
                                ...prev,
                                payments: [],
                              }));
                            }}
                            className="block p-1 text-red-600 transition-colors rounded hover:bg-red-50"
                            title="Clear all"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {billData.payments.length > 0 && (
                      <div className="space-y-3">
                        {billData.payments.map((payment, index) => (
                          <div key={payment.id} className="relative p-3 pt-9 border border-gray-200 rounded-lg bg-gray-50">
                            {/* Absolute Delete Button */}
                            <button
                              onClick={() => {
                                const newPayments = billData.payments.filter(
                                  (p) => p.id !== payment.id
                                );
                                setBillData((prev) => ({
                                  ...prev,
                                  payments: newPayments,
                                }));
                              }}
                              className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>

                            <div className="space-y-2 mb-2">
                              <div>
                                <label className="block mb-0.5 text-xs font-medium text-gray-600">તારીખ</label>
                                <input
                                  type="date"
                                  value={payment.date}
                                  onChange={(e) => {
                                    const newPayments = [...billData.payments];
                                    newPayments[index] = {
                                      ...payment,
                                      date: e.target.value,
                                    };
                                    setBillData((prev) => ({
                                      ...prev,
                                      payments: newPayments,
                                    }));
                                  }}
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block mb-0.5 text-xs font-medium text-gray-600">નોંધ</label>
                                <input
                                  type="text"
                                  value={payment.note}
                                  onChange={(e) => {
                                    const newPayments = [...billData.payments];
                                    newPayments[index] = {
                                      ...payment,
                                      note: e.target.value,
                                    };
                                    setBillData((prev) => ({
                                      ...prev,
                                      payments: newPayments,
                                    }));
                                  }}
                                  placeholder="નોંધ"
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block mb-1 text-xs font-medium text-gray-600">ચુકવણી પદ્ધતિ</label>
                                <select
                                  value={payment.method}
                                  onChange={(e) => {
                                    const newPayments = [...billData.payments];
                                    newPayments[index] = {
                                      ...payment,
                                      method: e.target.value as "cash" | "bank",
                                    };
                                    setBillData((prev) => ({
                                      ...prev,
                                      payments: newPayments,
                                    }));
                                  }}
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                >
                                  <option value="cash">રોકડ (Cash)</option>
                                  <option value="bank">બેંક (Bank)</option>
                                </select>
                              </div>
                              <div>
                                <label className="block mb-1 text-xs font-medium text-gray-600">પેમેન્ટ</label>
                                <input
                                  type="number"
                                  value={payment.amount === 0 ? '' : payment.amount}
                                  onChange={(e) => {
                                    const amount = parseFloat(e.target.value) || 0;
                                    const newPayments = [...billData.payments];
                                    newPayments[index] = {
                                      ...payment,
                                      amount,
                                    };
                                    setBillData((prev) => ({
                                      ...prev,
                                      payments: newPayments,
                                    }));
                                  }}
                                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                  min="0"
                                  step="0.01"
                                  className="w-full px-2 py-1 text-sm border rounded"
                                />
                              </div>
                            </div>
                          </div>
                        ))}

                        {/* Total */}
                        <div className="flex justify-between p-3 font-medium border-t-2 border-gray-300 bg-gray-50">
                          <span>કુલ પેમેન્ટ:</span>
                          <span>
                            ₹{billData.payments
                              .reduce((sum, payment) => sum + payment.amount, 0)
                              .toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}


            {/* Section G: Bill Summary */}
            {showLedger && billData.fromDate && (
              <div className="p-4 mb-4 bg-white border border-gray-200 rounded-xl">
                <h4 className="mb-4 text-base font-medium text-gray-900">
                  બિલ સારાંશ
                </h4>
                <div className="space-y-3 text-sm">
                  {Object.entries(summaryMap as Record<string, number>).map(
                    ([label, amount]) => (
                      <div
                        key={label}
                        className={`flex justify-between items-center ${label.startsWith("Sub Total") ||
                          label.startsWith("GRAND TOTAL") ||
                          label.startsWith("DUE PAYMENT") ||
                          label.includes("પેટા કુલ") ||
                          label.includes("કુલ રકમ") ||
                          label.includes("બાકી રકમ")
                          ? "pt-2 text-base font-semibold border-t border-gray-200"
                          : ""
                          } ${label.includes("બાકી રકમ") || label.includes("Due Payment")
                            ? amount > 0
                              ? "text-red-600 font-bold text-base"
                              : "text-green-600 font-bold text-base"
                            : label.includes("કુલ રકમ") || label.includes("Grand Total")
                              ? "text-blue-700 font-bold text-base"
                              : label.includes("ડિપોઝિટ") || label.includes("Deposit")
                                ? "text-green-700 font-medium"
                                : ""
                          }`}
                      >
                        <span>{label}:</span>
                        <span className={label.includes("ડિપોઝિટ") || label.includes("Deposit") ? "text-green-700 font-semibold" : ""}>
                          {label.includes("(-)") ? "-" : ""}₹{Math.abs(amount).toLocaleString("en-IN")}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {/* Section H: Main Note */}
            {showLedger && billData.fromDate && (
              <div className="p-4 mb-4 bg-white border border-gray-200 rounded-xl">
                <h4 className="mb-4 text-base font-medium text-gray-900">
                  મુખ્ય નોંધ
                </h4>
                <textarea
                  value={billData.mainNote}
                  onChange={(e) =>
                    setBillData((prev) => ({ ...prev, mainNote: e.target.value }))
                  }
                  placeholder="શરતો ..."
                  className="w-full h-32 px-3 py-2 border rounded-lg resize-none"
                />
              </div>
            )}

            {/* Section I: Action Buttons */}
            {showLedger && billData.fromDate && (
              <div className="flex justify-end gap-4">
                <button
                  onClick={() => setShowPreview(true)}
                  className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  પ્રિવ્યુ
                </button>
                <button
                  onClick={handleGenerateBill}
                  className={`px-6 py-2 text-sm font-medium text-white rounded-lg hover:bg-green-700 ${isEditMode ? "bg-amber-600 hover:bg-amber-700" : "bg-green-600"}`}
                >
                  {isEditMode ? "બિલ અપડેટ કરો" : "બિલ જનરેટ કરો"}
                </button>
              </div>
            )}

          </div>
        </div>
      </main>
      <Toaster />

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-5xl h-[92vh] max-h-[92vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-white shrink-0">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">બિલ પ્રિવ્યુ</h3>
              <button
                onClick={() => setShowPreview(false)}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <ZoomableBillPreview defaultZoomMode="fit">
              <BillInvoiceTemplate {...invoiceProps} />
            </ZoomableBillPreview>
            <div className="flex justify-end gap-2 sm:gap-3 p-3 sm:p-4 border-t bg-gray-50 shrink-0">
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                બંધ કરો
              </button>
              <button
                onClick={() => {
                  setShowPreview(false);
                  handleGenerateBill();
                }}
                className={`px-4 py-2 text-sm font-medium text-white rounded-md ${isEditMode ? "bg-amber-600 hover:bg-amber-700" : "bg-green-600 hover:bg-green-700"}`}
              >
                {isEditMode ? "બિલ અપડેટ કરો" : "બિલ જનરેટ કરો"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Bill Template for JPEG generation - Source for cloning */}
      <div id="invoice-template" style={{ display: 'none' }}>
        <BillInvoiceTemplate {...invoiceProps} />
      </div>
    </div >
  );
}
