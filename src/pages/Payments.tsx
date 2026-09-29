import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Clock, Download, X, ArrowUpRight, TrendingUp } from 'lucide-react';
import { supabase } from '../utils/supabase';
import Navbar from '../components/Navbar';
import BillCard, { BillRecord } from '../components/BillCard';
import { useLanguage } from '../contexts/LanguageContext';
import { useSettings } from '../contexts/SettingsContext';
import { generateBillJPEG } from '../utils/generateBillJPEG';
import { generateBillPDF } from '../utils/generateBillPDF';
import BillInvoiceTemplate from '../components/BillInvoiceTemplate';
import ZoomableBillPreview from '../components/ZoomableBillPreview';
import toast, { Toaster } from 'react-hot-toast';
import * as periodCalculations from "../utils/billingPeriodCalculations";
import { usePlateSizes } from '../hooks/usePlateSizes';
import { formatLocalDate } from '../utils/dateUtils';
import { getBusinessInfo } from '../utils/businessInfo';

type Tab = 'pending' | 'cleared';

export default function Payments() {
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
    const [activeTab, setActiveTab] = useState<Tab>('pending');
    const [bills, setBills] = useState<BillRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        pending: 0,
        collected: 0
    });

    // View/Download State (Copied from BillBook logic)
    const [selectedBill, setSelectedBill] = useState<any | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const downloadTemplateRef = useRef<HTMLDivElement>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            // Fetch ALL bills to calculate totals and filter locally
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

            const allBills = data || [];

            // Calculate totals
            const totalPending = allBills.reduce((sum, bill) => sum + (bill.due_payment || 0), 0);
            const totalCollected = allBills.reduce((sum, bill) => sum + (bill.total_payment || 0), 0);

            setStats({
                pending: totalPending,
                collected: totalCollected
            });

            setBills(allBills);
        } catch (error) {
            console.error("Error loading bills:", error);
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
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
        loadData();
    }, [enableCategorySeparation, activeCategory]);

    const filteredBills = bills.filter(bill => {
        if (activeTab === 'pending') return (bill.due_payment || 0) > 0;
        return (bill.due_payment || 0) <= 0;
    });

    // Handle bill actions (Reusing logic from BillBook)
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

            // FETCH PREVIOUS BILL for Pending Amount Display
            let previousBillData = undefined;
            let prevBillsQuery = supabase
                .from('bills')
                .select('bill_number, due_payment, to_date')
                .eq('client_id', bill.client_id)
                .lt('to_date', bill.from_date || billDateStr); // Bills ending before this one starts

            if (enableCategorySeparation && activeCategory) {
                prevBillsQuery = prevBillsQuery.eq('category', activeCategory);
            }

            const { data: prevBills } = await prevBillsQuery
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
                        rate: rate
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

            // Calculate derived totals
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
                previousBill: previousBillData,
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
                    totalUdharPlates: 0, totalJamaPlates: 0, netPlates: 0, serviceCharge: 0, advancePaid: 0
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

    const handleViewBill = async (bill: BillRecord) => {
        const details = await fetchBillDetails(bill);
        if (details) {
            setSelectedBill(details);
            setShowModal(true);
        }
    };

    const handleDownloadBill = async (bill: BillRecord) => {
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
                toast.success("Bill PDF downloaded successfully");
            } else {
                const dataUrl = await generateBillJPEG(bill.bill_number, details);
                const link = document.createElement('a');
                link.download = `Bill_${bill.bill_number}.jpg`;
                link.href = dataUrl;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                toast.success("Bill downloaded successfully");
            }
        }
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
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            const file = new File([blob], `Bill_${bill.bill_number}.jpg`, { type: 'image/jpeg' });

            toast.dismiss(toastId);

            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: `Bill #${bill.bill_number}`,
                        text: `બિલ નંબર: #${bill.bill_number}`
                    });
                    toast.success("Shared successfully");
                    return;
                } catch (shareError: any) {
                    if (shareError.name === 'AbortError') return;
                    console.warn("Share failed, falling back", shareError);
                }
            }

            // Fallback download & redirect
            const link = document.createElement('a');
            link.download = `Bill_${bill.bill_number}.jpg`;
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            const phone = bill.client?.primary_phone_number || "";
            const cleanPhone = phone.replace(/\D/g, "");
            const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
            
            setTimeout(() => {
                window.open(`https://api.whatsapp.com/send?phone=${finalPhone}&text=${encodeURIComponent("બિલ નીચે મોકલેલ છે:")}`, "_blank");
            }, 500);

            toast.success("Bill downloaded. Opening WhatsApp...");
        } catch (e) {
            console.error(e);
            toast.error("Failed to share photo", { id: toastId });
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
                loadData(); // Reload all data to update stats
            } catch (error) {
                console.error("Error deleting bill:", error);
                toast.error("Failed to delete bill");
            }
        }
    };

    const handleEditBill = (bill: BillRecord) => {
        const encodedBillNumber = encodeURIComponent(bill.bill_number);
        navigate(`/billing/create/${bill.client_id}?edit=${encodedBillNumber}`);
    };

    return (
        <div className="flex min-h-screen bg-gray-50">
            <Navbar />
            <main className="flex-1 w-full ml-0 app-main-content lg:ml-64">
                <div className="flex flex-col gap-3 sm:gap-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
                    {/* Header */}
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => navigate('/bill-book')}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                title="Back to Bill Book"
                            >
                                <ArrowLeft className="w-5 h-5 text-gray-600" />
                            </button>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">Payments Dashboard</h1>
                                <p className="text-sm text-gray-500 mt-1">Overview of pending and collected payments</p>
                            </div>
                        </div>
                    </div>

                    {/* New Dashboard Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                        {/* Total Pending Card */}
                        <button
                            onClick={() => setActiveTab('pending')}
                            className={`group relative overflow-hidden rounded-2xl p-6 text-white transition-all transform active:scale-[0.98]
                ${activeTab === 'pending'
                                    ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-xl ring-2 ring-offset-2 ring-red-500 scale-[1.01]'
                                    : 'bg-gradient-to-br from-red-400 to-red-500 shadow-md opacity-90 hover:opacity-100 hover:shadow-lg'
                                }`}
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 -mt-8 -mr-8 bg-white rounded-full opacity-10 group-hover:scale-110 transition-transform"></div>
                            <div className="relative flex justify-between items-start">
                                <div>
                                    <p className="text-red-100 font-medium mb-1">Total Pending</p>
                                    <h3 className="text-3xl font-bold">₹{stats.pending.toLocaleString('en-IN')}</h3>
                                </div>
                                <div className="p-3 bg-white bg-opacity-20 rounded-xl backdrop-blur-sm">
                                    <Clock className="w-6 h-6 text-white" />
                                </div>
                            </div>
                            <div className="mt-4 flex items-center text-sm text-red-100">
                                <span>View outstanding bills</span>
                                <ArrowUpRight className={`ml-2 w-4 h-4 transition-transform ${activeTab === 'pending' ? 'rotate-45' : ''}`} />
                            </div>
                        </button>

                        {/* Total Collected Card */}
                        <button
                            onClick={() => setActiveTab('cleared')}
                            className={`group relative overflow-hidden rounded-2xl p-6 text-white transition-all transform active:scale-[0.98]
                ${activeTab === 'cleared'
                                    ? 'bg-gradient-to-br from-green-500 to-green-600 shadow-xl ring-2 ring-offset-2 ring-green-500 scale-[1.01]'
                                    : 'bg-gradient-to-br from-green-400 to-green-500 shadow-md opacity-90 hover:opacity-100 hover:shadow-lg'
                                }`}
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 -mt-8 -mr-8 bg-white rounded-full opacity-10 group-hover:scale-110 transition-transform"></div>
                            <div className="relative flex justify-between items-start">
                                <div>
                                    <p className="text-green-100 font-medium mb-1">Total Collected</p>
                                    <h3 className="text-3xl font-bold">₹{stats.collected.toLocaleString('en-IN')}</h3>
                                </div>
                                <div className="p-3 bg-white bg-opacity-20 rounded-xl backdrop-blur-sm">
                                    <TrendingUp className="w-6 h-6 text-white" />
                                </div>
                            </div>
                            <div className="mt-4 flex items-center text-sm text-green-100">
                                <span>View corrected history</span>
                                <ArrowUpRight className={`ml-2 w-4 h-4 transition-transform ${activeTab === 'cleared' ? 'rotate-45' : ''}`} />
                            </div>
                        </button>
                    </div>

                    <div className="flex items-center gap-2 mt-4 mb-2">
                        <h2 className={`text-lg font-bold ${activeTab === 'pending' ? 'text-red-600' : 'text-green-600'}`}>
                            {activeTab === 'pending' ? 'Pending Bills' : 'Cleared History'}
                        </h2>
                        <div className="flex-1 h-px bg-gray-200"></div>
                        <span className="text-sm text-gray-500">
                            {filteredBills.length} {filteredBills.length === 1 ? 'bill' : 'bills'}
                        </span>
                    </div>

                    {/* Content */}
                    {loading ? (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <div key={i} className="bg-white border border-gray-200 rounded-xl h-48 animate-pulse" />
                            ))}
                        </div>
                    ) : filteredBills.length === 0 ? (
                        <div className="text-center py-12 bg-white border border-gray-200 rounded-2xl border-dashed">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                {activeTab === 'pending' ? <Clock className="w-8 h-8 text-red-400" /> : <CheckCircle className="w-8 h-8 text-green-400" />}
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 mb-1">
                                No {activeTab} payments found
                            </h3>
                            <p className="text-gray-500">
                                {activeTab === 'pending'
                                    ? 'Great job! All bills are paid.'
                                    : 'No payment history found yet.'
                                }
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pb-20">
                             {filteredBills.map((bill, index) => (
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
                        <p className="text-gray-900 font-medium">Loading details...</p>
                    </div>
                </div>
            )}

            {/* View Bill Modal */}
            {showModal && selectedBill && (
                <div className="fixed inset-0 z-50 overflow-hidden bg-black/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
                    <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[92vh] max-h-[92vh] flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between p-3 sm:p-4 border-b bg-white shrink-0">
                            <h3 className="text-base sm:text-lg font-medium text-gray-900 truncate pr-2">
                                {t("viewBill") || "બિલ જુઓ"}: {selectedBill.billDetails.billNumber}
                            </h3>
                            <div className="flex gap-2 shrink-0">
                                <button
                                    onClick={async () => {
                                        try {
                                            const dataUrl = await generateBillJPEG(selectedBill.billDetails.billNumber, selectedBill);
                                            const link = document.createElement('a');
                                            link.download = `Bill_${selectedBill.billDetails.billNumber}.jpg`;
                                            link.href = dataUrl;
                                            document.body.appendChild(link);
                                            link.click();
                                            document.body.removeChild(link);
                                            toast.success(t("challanDownloadSuccess") || "બિલ ડાઉનલોડ થઈ ગયું");
                                        } catch (e) {
                                            console.error(e);
                                            toast.error(t("challanDownloadError") || "ડાઉનલોડ કરવામાં ભૂલ આવી");
                                        }
                                    }}
                                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg flex items-center gap-1"
                                >
                                    <Download className="w-5 h-5" />
                                    <span className="text-sm font-medium hidden sm:inline">{t("download") || "ડાઉનલોડ"}</span>
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

            {/* Hidden Template for Download */}
            {selectedBill && (
                <div
                    id="invoice-template"
                    ref={downloadTemplateRef}
                    style={{
                        position: 'fixed',
                        top: '-9999px',
                        left: '-9999px',
                        width: '794px',
                        backgroundColor: 'white',
                        zIndex: -1
                    }}
                >
                    <BillInvoiceTemplate {...selectedBill} />
                </div>
            )}
        </div>
    );
}
