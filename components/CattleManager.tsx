import React, { useState, useRef, useEffect } from 'react';
import { Cattle, CattleStatus, Breed, Gender, ArrivalType, VaccinationRecord, Transaction, UserRole, DeletionRequest, FeedPackage, FeedItem, AnimalType, Tenant, CattlePhoto, CattleVideo, CattleDocument, MedicalItem } from '../types';
import { Plus, Search, Filter, Syringe, Scale, Upload, X, User, Calendar, Pencil, Trash2, Activity, FileText, ShieldCheck, Shield, Tag, Download, DollarSign, Camera, Image as ImageIcon, AlertTriangle, Wallet, TrendingUp, TrendingDown, Clock, MapPin, Phone, Mail, Sparkles, Loader2, BarChart3, Printer, FileSpreadsheet, FileDown, Images, Video, File, Youtube, ExternalLink, Baby, Slash, Calculator, Info, MessageSquare, Circle, List, Check, GitBranch, Package, Edit3, PauseCircle, Receipt, Pill, ChevronLeft, ChevronRight, Dna, Bell, CheckCircle2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot, ReferenceLine, Label, AreaChart, Area } from 'recharts';
import ReactMarkdown from 'react-markdown';
import { predictWeightGrowth } from '../services/geminiService';
import { api } from '../services/api';
import { CostBreakdown } from './CostBreakdown';
import { AddBreedingEventModal } from './breeding/AddBreedingEventModal';
import { useTheme } from '../services/ThemeContext';
import { calculateCattleFinancials } from '../utils/financials'; // Import financial utility
import { checkVaccineEligibility } from '../utils/vaccinationEligibility';
import { PedigreeTree } from './PedigreeTree';
import { appEvents } from '../utils/events';
import { PAKISTAN_PROTOCOLS } from './VaccinationProtocols';
import { NEW_SCHEME_TYPE_META, NEW_SCHEME_TYPES_BY_SPECIES, LEGACY_ANIMAL_TYPES } from '../utils/animalTagging';

// Splits one CSV row into fields, respecting double-quoted fields that contain
// commas (e.g. "Farm Sector, Region A") - a naive line.split(',') silently
// shifts every column after the first quoted comma.
const TAG_PREFIX_TO_TYPE: Record<string, AnimalType> = Object.entries(NEW_SCHEME_TYPE_META).reduce((acc, [type, meta]) => {
    if (meta) acc[meta.prefix] = type as AnimalType;
    return acc;
}, {} as Record<string, AnimalType>);
TAG_PREFIX_TO_TYPE['H'] = AnimalType.HEIFER; // lenient alias - some real-world exports use H instead of HF
const TAG_PREFIX_CANDIDATES = Object.keys(TAG_PREFIX_TO_TYPE).sort((a, b) => b.length - a.length);

// CSV import type detection, in priority order:
//  1. The tag number's own letter prefix, if it matches a known type exactly -
//     the most reliable signal when present, since it's what the farm actually labeled the animal.
//  2. Otherwise Type + Gender + Age (Cow/Bull/Heifer/Goat/Sheep + Male/Female + <12mo = juvenile).
// Species detection deliberately requires exactly one of sheep/goat/cattle to be
// mentioned - malformed exports sometimes carry the literal column header text
// (e.g. "Cow/Bull/Heifer/Goat") as a placeholder value, which must not silently
// resolve to any one species.
function inferTypeFromTagPrefix(tag: string): AnimalType | null {
    const match = tag.match(/^([A-Za-z]+)/);
    if (!match) return null;
    const prefix = match[1].toUpperCase();
    const candidate = TAG_PREFIX_CANDIDATES.find(p => p === prefix);
    return candidate ? TAG_PREFIX_TO_TYPE[candidate] : null;
}

function inferTypeFromFields(typeStr: string, genderStr: string, ageMonths: number | undefined): AnimalType | null {
    const t = typeStr.toLowerCase();
    const isFemale = genderStr.toLowerCase().includes('female');
    const isJuvenile = typeof ageMonths === 'number' && !isNaN(ageMonths) && ageMonths < 12;

    const mentionsSheep = t.includes('sheep');
    const mentionsGoat = t.includes('goat');
    const mentionsCattle = t.includes('cow') || t.includes('bull') || t.includes('heifer') || t.includes('calf');
    if (Number(mentionsSheep) + Number(mentionsGoat) + Number(mentionsCattle) !== 1) return null;

    if (mentionsSheep) {
        if (isJuvenile) return isFemale ? AnimalType.FEMALE_LAMB : AnimalType.MALE_LAMB;
        return isFemale ? AnimalType.EWE : AnimalType.RAM;
    }
    if (mentionsGoat) {
        if (isJuvenile) return isFemale ? AnimalType.FEMALE_KID : AnimalType.MALE_KID;
        return isFemale ? AnimalType.DOE : AnimalType.BUCK;
    }
    if (isJuvenile) return isFemale ? AnimalType.FEMALE_CALF : AnimalType.MALE_CALF;
    if (isFemale) return t.includes('heifer') ? AnimalType.HEIFER : AnimalType.COW;
    return AnimalType.BULL;
}

function resolveImportedType(tag: string, typeStr: string, genderStr: string, ageMonths: number | undefined): AnimalType | null {
    return inferTypeFromTagPrefix(tag) || inferTypeFromFields(typeStr, genderStr, ageMonths);
}

function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') { current += '"'; i++; }
                else { inQuotes = false; }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                result.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
    }
    result.push(current.trim());
    return result;
}

interface CattleManagerProps {
    cattle: Cattle[];
    setCattle: React.Dispatch<React.SetStateAction<Cattle[]>>;
    feedPackages: FeedPackage[];
    feed: FeedItem[];
    userRole: UserRole;
    onRequestDelete: (req: DeletionRequest) => void;
    tenant: Tenant;
    onRefresh?: () => void;
}

const INITIAL_FORM_STATE = {
    type: AnimalType.BULL,
    tagNumber: '',
    name: '',
    imageUrl: '',
    breed: Breed.SAHIWAL,
    gender: Gender.MALE,
    teeth: 2,
    color: '',
    vaccinationStatus: 'No',
    status: CattleStatus.ACTIVE,

    arrivalType: ArrivalType.PURCHASED,
    fatherTag: '',
    motherTag: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    arrivalWeight: '',
    animalPrice: '',
    sellerName: '',
    sellerMobile: '',

    targetWeight: '',
    dailyTargetGain: '',

    ownerName: '',
    ownerEmail: '',
    ownerWhatsappNumber: '',
    ownerWhatsappApiKey: '',
    ownerMobile: '',
    ownerAddress: '',
    monthlyPackageId: '',
    monthlyCharges: '',

    notes: '',
    healthStatus: 'Healthy',
    isPregnant: false,
    expectedCalvingDate: '',
    pregnancyType: '',
    pregnancySireOrEmbryo: '',
    currentDailyMilkYield: '',
    ageMonths: '',
    branch: ''
};


export const CattleManager: React.FC<CattleManagerProps> = ({ cattle, setCattle, feedPackages, feed, userRole, onRequestDelete, tenant, onRefresh }) => {
    const { isDarkMode } = useTheme();
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('All');

    // Advanced Filters & Sort State
    const [filterType, setFilterType] = useState<string>('All');
    const [filterBreed, setFilterBreed] = useState<string>('All');
    const [filterGender, setFilterGender] = useState<string>('All');
    const [filterBranch, setFilterBranch] = useState<string>('All');
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    const [showCamera, setShowCamera] = useState(false);
    const [actionType, setActionType] = useState<'none' | 'weight' | 'health' | 'vaccine' | 'report' | 'sell'>('none');
    const [selectedActionCattle, setSelectedActionCattle] = useState<Cattle | null>(null);
    const [deleteConfirmation, setDeleteConfirmation] = useState<{ id: string, tag: string } | null>(null);
    const [showBreedingModal, setShowBreedingModal] = useState(false);

    // Lactation End State
    const [showEndLactationModal, setShowEndLactationModal] = useState(false);
    const [endLactationForm, setEndLactationForm] = useState({ endDate: new Date().toISOString().split('T')[0], reason: '' });
    const [reportTab, setReportTab] = useState<'weight' | 'medical' | 'alerts' | 'financial' | 'breeding' | 'info' | 'pedigree' | 'notes' | 'gallery' | 'documents'>('weight');

    // New-scheme tenants (global sequential PREFIX+4-digit tagging): server-computed
    // preview of the tag the next registration will actually receive.
    const isNewTagScheme = tenant.legacyTagScheme === false;
    const [newSchemeTagPreview, setNewSchemeTagPreview] = useState('');

    // Breeding & Lactation State
    const [activeLactation, setActiveLactation] = useState<any>(null);
    const [milkLogs, setMilkLogs] = useState<any[]>([]);
    const [milkForm, setMilkForm] = useState({ date: new Date().toISOString().split('T')[0], morning: '', evening: '', notes: '' });
    const [pregnancyPoint, setPregnancyPoint] = useState<{ date: string, weight: number, actualPregDate: string } | null>(null);

    const [showAddPhotoModal, setShowAddPhotoModal] = useState(false);
    const [showAddVideoModal, setShowAddVideoModal] = useState(false);
    const [showAddDocModal, setShowAddDocModal] = useState(false);
    const [newPhotoCaption, setNewPhotoCaption] = useState('');
    const [newVideoUrl, setNewVideoUrl] = useState('');
    const [newVideoTitle, setNewVideoTitle] = useState('');
    const [newDocName, setNewDocName] = useState('');
    const [newDocType, setNewDocType] = useState<CattleDocument['type']>('other');
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [uploadingDoc, setUploadingDoc] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadToast, setUploadToast] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);
    const docInputRef = useRef<HTMLInputElement>(null);

    const [weightForm, setWeightForm] = useState({ weight: '', date: new Date().toISOString().split('T')[0] });
    const [healthForm, setHealthForm] = useState<{ status: CattleStatus, notes: string }>({ status: CattleStatus.SICK, notes: '' });
    const [vaccineForm, setVaccineForm] = useState({ date: new Date().toISOString().split('T')[0], name: '', batch: '', notes: '', medicalItemId: '', dose: 1, type: 'VACCINE', provider: 'STOCK', status: 'COMPLETED', nextBoosterDate: '' });
    const [medicalInventory, setMedicalInventory] = useState<MedicalItem[]>([]);
    const [semenList, setSemenList] = useState<any[]>([]);
    const [embryoList, setEmbryoList] = useState<any[]>([]);

    useEffect(() => {
        if (showAddModal && tenant?.id) {
            const fetchGenetics = async () => {
                try {
                    const headers = {
                        'Authorization': `Bearer ${localStorage.getItem('farmxpert_token')}`,
                        'x-tenant-id': tenant.id
                    };
                    
                    const [semenRes, embryoRes] = await Promise.all([
                        fetch('/api/genetics/semen', { headers }),
                        fetch('/api/genetics/embryos', { headers })
                    ]);

                    if (semenRes.ok) setSemenList(await semenRes.json());
                    if (embryoRes.ok) setEmbryoList(await embryoRes.json());
                } catch (error) {
                    console.error("Failed to load genetics", error);
                }
            };
            fetchGenetics();
        }
    }, [showAddModal, tenant?.id]);

    useEffect(() => {
        if (tenant?.id) {
            api.medical.list(tenant.id, { status: 'ACTIVE' }).then(setMedicalInventory).catch(console.error);
        }

        const handleFinanceUpdate = () => {
            if (onRefresh) onRefresh();
        };
        appEvents.on('FINANCE_UPDATED', handleFinanceUpdate);

        return () => {
            appEvents.off('FINANCE_UPDATED', handleFinanceUpdate);
        };
    }, [tenant?.id, onRefresh]);

    // Bulk Actions State
    const [selectedCattleIds, setSelectedCattleIds] = useState<string[]>([]);
    const [showBulkActionModal, setShowBulkActionModal] = useState<'status' | 'package' | 'delete' | null>(null);
    const [bulkStatusForm, setBulkStatusForm] = useState(CattleStatus.ACTIVE);
    const [bulkPackageForm, setBulkPackageForm] = useState({ packageId: '', monthlyCharges: '' });
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);

    const toggleSelectAll = () => {
        if (selectedCattleIds.length === paginatedCattle.length && paginatedCattle.length > 0) {
            setSelectedCattleIds([]);
        } else {
            setSelectedCattleIds(paginatedCattle.map(c => c.id));
        }
    };

    const toggleSelectOne = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedCattleIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleBulkActionSubmit = async () => {
        if (!selectedCattleIds.length) return;
        setIsBulkProcessing(true);
        const token = localStorage.getItem('farmxpert_token');
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'x-tenant-id': tenant.id
        };

        try {
            if (showBulkActionModal === 'delete') {
                await fetch('/api/cattle/bulk', {
                    method: 'DELETE',
                    headers,
                    body: JSON.stringify({ ids: selectedCattleIds })
                });
            } else if (showBulkActionModal === 'status') {
                await fetch('/api/cattle/bulk/status', {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({ ids: selectedCattleIds, status: bulkStatusForm })
                });
            } else if (showBulkActionModal === 'package') {
                await fetch('/api/cattle/bulk/package', {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({
                        ids: selectedCattleIds,
                        packageId: bulkPackageForm.packageId,
                        monthlyCharges: bulkPackageForm.monthlyCharges
                    })
                });
            }

            if (onRefresh) onRefresh();
            setSelectedCattleIds([]);
            setShowBulkActionModal(null);
        } catch (err) {
            console.error('Bulk action failed', err);
            alert('Failed to execute bulk action.');
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const [sellForm, setSellForm] = useState({ date: new Date().toISOString().split('T')[0], price: '', saleWeight: '', buyerName: '', buyerMobile: '', notes: '' });
    const [editingWeightIndex, setEditingWeightIndex] = useState<number | null>(null);
    const [editWeightForm, setEditWeightForm] = useState({ weight: '', date: '' });

    // AI Prediction State
    const [predictionResult, setPredictionResult] = useState('');
    const [loadingPrediction, setLoadingPrediction] = useState(false);
    const [feedTimeline, setFeedTimeline] = useState<{ date: string, dailyCost: number }[]>([]);
    const [loadingFeedTimeline, setLoadingFeedTimeline] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importStats, setImportStats] = useState<{ total: number, success: number, failed: number, duplicate: number } | null>(null);
    const [isImporting, setIsImporting] = useState(false);

    const [newAnimal, setNewAnimal] = useState(INITIAL_FORM_STATE);

    const canEdit = userRole === 'OWNER' || userRole === 'MANAGER';
    const canSell = userRole === 'OWNER' || userRole === 'MANAGER';
    const canSeeFinancials = userRole === 'OWNER' || userRole === 'MANAGER';

    // Parse URL params for cross-component navigation
    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const action = searchParams.get('action');
        const targetCattleId = searchParams.get('cattleId');
        const presetVaccine = searchParams.get('vaccineName');

        if (action === 'vaccine' && targetCattleId && cattle.length > 0) {
            const targetCattle = cattle.find(c => c.id === targetCattleId);
            if (targetCattle) {
                setSelectedActionCattle(targetCattle);
                setActionType('vaccine');
                if (presetVaccine) {
                    setVaccineForm(prev => ({ ...prev, name: presetVaccine }));
                }
                
                // Clean up URL
                const newUrl = window.location.pathname;
                window.history.replaceState({}, '', newUrl);
            }
        }
    }, [cattle]);

    // Fetch pregnancy data for visualization
    React.useEffect(() => {
        const fetchPregnancyData = async () => {
            if (reportTab === 'weight' && selectedActionCattle) {
                try {
                    const token = localStorage.getItem('farmxpert_token');
                    const res = await fetch(`/api/breeding/events?tenantId=${tenant.id}&animalId=${selectedActionCattle.id}&type=PREG_CHECK`, {
                        headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenant.id }
                    });
                    if (res.ok) {
                        const events = await res.json();
                        // Find latest POSITIVE result that is NOT followed by CALVING/ABORTION?
                        // Actually, requirement says "Use the most recent valid confirmation." and "If no confirmation exists → do nothing."
                        // It doesn't strictly say to check if it's currently pregnant, but visualization usually implies current or relevant history.
                        // But simple approach: Find the LATEST Positive Preg Check.
                        const latestPositive = events.find((e: any) => e.details?.result === 'POSITIVE');

                        if (latestPositive) {
                            const pregDate = new Date(latestPositive.event_date);

                            // Find closest weight record ON or BEFORE
                            const sortedWeights = [...selectedActionCattle.weightHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                            let closest = null;
                            for (const w of sortedWeights) {
                                const wDate = new Date(w.date);
                                if (wDate <= pregDate) {
                                    closest = w;
                                } else {
                                    break;
                                }
                            }

                            if (closest) {
                                setPregnancyPoint({ date: closest.date, weight: closest.weight, actualPregDate: latestPositive.event_date });
                                return;
                            }
                        }
                    }
                } catch (error) {
                    console.error("Error fetching pregnancy data:", error);
                }
            }
        };

        fetchPregnancyData();
    }, [reportTab, selectedActionCattle, tenant.id]);

    // Fetch Feed Timeline Data
    React.useEffect(() => {
        const fetchFeedTimeline = async () => {
            if (reportTab === 'financial' && selectedActionCattle) {
                setLoadingFeedTimeline(true);
                try {
                    const token = localStorage.getItem('farmxpert_token');
                    const res = await fetch(`/api/cattle/${selectedActionCattle.id}/feed-cost-timeline`, {
                        headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenant.id }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        setFeedTimeline(data);
                    }
                } catch (error) {
                    console.error("Error fetching feed timeline:", error);
                } finally {
                    setLoadingFeedTimeline(false);
                }
            }
        };

        fetchFeedTimeline();
    }, [reportTab, selectedActionCattle, tenant.id]);

    const generateNextTag = (type: AnimalType) => {
        const prefix = type === AnimalType.COW ? 'C' : type === AnimalType.HEIFER ? 'H' : type === AnimalType.BULL ? 'B' : 'G';
        const existingNumbers = cattle.map(c => {
            const match = c.tagNumber.match(/\d+/);
            return match ? parseInt(match[0], 10) : 0;
        });
        const maxNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 1000;
        return `${prefix}${maxNum + 1}`;
    };

    const fetchNewSchemeTagPreview = async (type: AnimalType) => {
        try {
            const res = await api.cattle.getNextTag(tenant.id, type);
            setNewSchemeTagPreview(res.preview || '');
        } catch {
            setNewSchemeTagPreview('');
        }
    };

    const handleAnimalTypeChange = (type: AnimalType) => {
        if (isNewTagScheme) {
            const gender = NEW_SCHEME_TYPE_META[type]?.gender ?? Gender.MALE;
            setNewAnimal(prev => ({ ...prev, type, gender, tagNumber: '' }));
            fetchNewSchemeTagPreview(type);
            return;
        }
        const gender = (type === AnimalType.COW || type === AnimalType.HEIFER) ? Gender.FEMALE : Gender.MALE;
        const nextTag = generateNextTag(type);
        setNewAnimal(prev => ({ ...prev, type: type, gender: gender, tagNumber: nextTag }));
    };

    const handleOpenRegisterModal = () => {
        const defaultType = AnimalType.BULL;
        if (isNewTagScheme) {
            const gender = NEW_SCHEME_TYPE_META[defaultType]?.gender ?? Gender.MALE;
            setNewAnimal({ ...INITIAL_FORM_STATE, type: defaultType, gender, tagNumber: '' });
            fetchNewSchemeTagPreview(defaultType);
        } else {
            const nextTag = generateNextTag(defaultType);
            setNewAnimal({ ...INITIAL_FORM_STATE, type: defaultType, tagNumber: nextTag });
        }
        setEditingId(null);
        setShowAddModal(true);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setNewAnimal(prev => ({ ...prev, imageUrl: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    const startCamera = async () => {
        setShowCamera(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            console.error("Error accessing camera:", err);
            alert("Could not access camera. Please check permissions.");
            setShowCamera(false);
        }
    };

    const capturePhoto = () => {
        if (videoRef.current) {
            const canvas = document.createElement("canvas");
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            canvas.getContext("2d")?.drawImage(videoRef.current, 0, 0);
            const dataUrl = canvas.toDataURL("image/jpeg");
            setNewAnimal(prev => ({ ...prev, imageUrl: dataUrl }));
            stopCamera();
        }
    };

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
        }
        setShowCamera(false);
    };

    const openWeightModal = (c: Cattle) => {
        setSelectedActionCattle(c);
        setWeightForm({ weight: c.currentWeight.toString(), date: new Date().toISOString().split('T')[0] });
        setActionType('weight');
    };

    const openHealthModal = (c: Cattle) => {
        setSelectedActionCattle(c);
        setHealthForm({ status: c.status === CattleStatus.ACTIVE ? CattleStatus.SICK : c.status, notes: '' });
        setActionType('health');
    };

    const openVaccineModal = (c: Cattle) => {
        setSelectedActionCattle(c);
        setVaccineForm({ date: new Date().toISOString().split('T')[0], name: '', batch: '', notes: '', medicalItemId: '', dose: 1, type: 'VACCINE', provider: 'STOCK', status: 'COMPLETED', nextBoosterDate: '' });
        setActionType('vaccine');
    };

    const openSellModal = (c: Cattle) => {
        setSelectedActionCattle(c);
        setSellForm({ date: new Date().toISOString().split('T')[0], price: '', saleWeight: c.currentWeight.toString(), buyerName: '', buyerMobile: '', notes: '' });
        setActionType('sell');
    };

    const openReportModal = (c: Cattle) => {
        setSelectedActionCattle(c);
        setReportTab('weight');

        // Fetch Breeding Data for Females
        const genderUpper = c.gender?.toString().toUpperCase();
        const typeUpper = c.type?.toString().toUpperCase();

        if (['COW', 'BUFFALO', 'HEIFER', 'GOAT', 'SHEEP', 'CAMEL'].includes(typeUpper) && (genderUpper === 'FEMALE' || genderUpper === 'COW' || genderUpper === 'HEIFER')) {
            // Assuming 'token' is available in scope or passed via context/props
            const token = localStorage.getItem('farmxpert_token');
            fetch(`/api/breeding/lactations/${c.id}/active`, { headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenant.id } })
                .then(r => r.json())
                .then(data => {
                    if (data && !data.error) setActiveLactation(data);
                    else setActiveLactation(null);
                })
                .catch(err => { console.error(err); setActiveLactation(null); });

            fetch(`/api/breeding/milk-logs/${c.id}`, { headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenant.id } })
                .then(r => r.json())
                .then(data => {
                    if (Array.isArray(data)) setMilkLogs(data);
                    else setMilkLogs([]);
                })
                .catch(err => { console.error(err); setMilkLogs([]); });
        }

        // setShowReportsModal(true); // Removed to prevent double modal overlap
        setPredictionResult('');
        setActionType('report');
    };

    const [sendingEmail, setSendingEmail] = useState(false);

    const handleSendEmailReport = async () => {
        if (!selectedActionCattle) return;
        if (!selectedActionCattle.ownerEmail) {
            alert("Owner email is missing for this animal.");
            return;
        }

        setSendingEmail(true);
        try {
            const res = await fetch(`/api/cattle/${selectedActionCattle.id}/send-report`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-tenant-id': tenant.id
                }
            });

            if (res.ok) {
                alert("Report email sent successfully to " + selectedActionCattle.ownerEmail);
            } else {
                const data = await res.json();
                alert(data.error || "Failed to send email.");
            }
        } catch (err) {
            console.error("Email send error:", err);
            alert("An error occurred while sending the email.");
        } finally {
            setSendingEmail(false);
        }
    };

    const closeActionModal = () => {
        setActionType('none');
        setSelectedActionCattle(null);
        setPredictionResult('');
    };

    const submitWeightUpdate = async () => {
        if (!selectedActionCattle) return;
        const newWeight = parseFloat(weightForm.weight);
        if (isNaN(newWeight)) return;

        const updatedHistory = [...selectedActionCattle.weightHistory, { date: weightForm.date, weight: newWeight }];

        try {
            await api.cattle.update(tenant.id, selectedActionCattle.id, {
                currentWeight: newWeight,
                weightHistory: updatedHistory
            });
            appEvents.emit('CATTLE_UPDATED');
            onRefresh?.();
            closeActionModal();
        } catch (e) {
            alert("Failed to update weight.");
        }
    };

    const startEditWeight = (index: number, weight: number, date: string) => {
        setEditingWeightIndex(index);
        setEditWeightForm({ weight: weight.toString(), date });
    };

    const cancelEditWeight = () => {
        setEditingWeightIndex(null);
        setEditWeightForm({ weight: '', date: '' });
    };

    const saveEditWeight = async () => {
        if (!selectedActionCattle || editingWeightIndex === null) return;
        const newWeight = parseFloat(editWeightForm.weight);
        if (isNaN(newWeight)) return;

        const updatedHistory = [...selectedActionCattle.weightHistory];
        updatedHistory[editingWeightIndex] = { date: editWeightForm.date, weight: newWeight };

        const latestWeight = updatedHistory[updatedHistory.length - 1].weight;

        try {
            await api.cattle.update(tenant.id, selectedActionCattle.id, {
                currentWeight: latestWeight,
                weightHistory: updatedHistory
            });
            setSelectedActionCattle({
                ...selectedActionCattle,
                currentWeight: latestWeight,
                weightHistory: updatedHistory
            });
            appEvents.emit('CATTLE_UPDATED');
            cancelEditWeight();
            onRefresh?.();
        } catch (e) {
            alert("Failed to update weight entry.");
        }
    };

    const deleteWeightEntry = async (index: number) => {
        if (!selectedActionCattle) return;
        if (selectedActionCattle.weightHistory.length <= 1) {
            alert("Cannot delete the only weight entry.");
            return;
        }
        if (!confirm("Delete this weight entry?")) return;

        const updatedHistory = selectedActionCattle.weightHistory.filter((_, i) => i !== index);
        const latestWeight = updatedHistory[updatedHistory.length - 1].weight;

        try {
            await api.cattle.update(tenant.id, selectedActionCattle.id, {
                currentWeight: latestWeight,
                weightHistory: updatedHistory
            });
            setSelectedActionCattle({
                ...selectedActionCattle,
                currentWeight: latestWeight,
                weightHistory: updatedHistory
            });
            appEvents.emit('FINANCE_UPDATED');
        } catch (error) {
            alert("Failed to delete weight entry.");
        }
    };

    const calculateAvgDailyGain = (history: { date: string, weight: number }[]) => {
        if (history.length < 2) return null;
        const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const weightGain = last.weight - first.weight;
        const days = Math.max(1, Math.floor((new Date(last.date).getTime() - new Date(first.date).getTime()) / (1000 * 3600 * 24)));
        return (weightGain / days).toFixed(2);
    };

    const submitHealthUpdate = async () => {
        if (!selectedActionCattle) return;
        const timestamp = new Date().toLocaleDateString();
        const newNoteEntry = healthForm.notes.trim() ? `[${timestamp} Health Update]: Status changed to ${healthForm.status}. ${healthForm.notes}\n` : `[${timestamp} Health Update]: Status changed to ${healthForm.status}.\n`;

        try {
            await api.cattle.update(tenant.id, selectedActionCattle.id, {
                status: healthForm.status,
                notes: newNoteEntry + selectedActionCattle.notes
            });
            appEvents.emit('CATTLE_UPDATED');
            onRefresh?.();
            closeActionModal();
        } catch (e) {
            alert("Failed to update health record.");
        }
    };

    const submitVaccineUpdate = async () => {
        if (!selectedActionCattle) return;
        if (!vaccineForm.name && !vaccineForm.medicalItemId) {
            alert('Vaccine Name or selection from inventory is required.');
            return;
        }
        if (!vaccineForm.date) {
            alert('Date is required.');
            return;
        }

        if (vaccineForm.type === 'VACCINE') {
            const eligibility = checkVaccineEligibility(selectedActionCattle.vaccinationHistory, vaccineForm.name, vaccineForm.date);
            if (!eligibility.eligible) {
                alert(`Cannot record this vaccine.\n\n${eligibility.reason}`);
                return;
            }
        }

        try {
            const newRecord: VaccinationRecord = {
                id: Date.now().toString(),
                date: vaccineForm.date,
                vaccineName: vaccineForm.name,
                batchNumber: vaccineForm.batch || undefined,
                notes: vaccineForm.notes || undefined,
                type: vaccineForm.type as any,
                provider: vaccineForm.provider as any,
                status: vaccineForm.status as any,
                nextBoosterDate: vaccineForm.nextBoosterDate || undefined,
                medicalItemId: vaccineForm.medicalItemId || undefined
            };

            if (vaccineForm.provider === 'STOCK' && vaccineForm.medicalItemId && vaccineForm.medicalItemId !== 'manual' && vaccineForm.status === 'COMPLETED') {
                // Use new endpoint with stock deduction ONLY if completed
                await api.cattle.addMedicalRecord(tenant.id, selectedActionCattle.id, {
                    medicalItemId: vaccineForm.medicalItemId,
                    date: vaccineForm.date,
                    notes: vaccineForm.notes,
                    dose: Number(vaccineForm.dose) || 1
                });

                // Explicitly deduct from stock
                const item = medicalInventory.find(i => i.id === vaccineForm.medicalItemId);
                if (item) {
                    const usedDose = Number(vaccineForm.dose) || 1;
                    const newQuantity = Math.max(0, item.quantity - usedDose);
                    const updatedItem = { ...item, quantity: newQuantity };
                    await api.medical.update(tenant.id, item.id, updatedItem);
                    setMedicalInventory(prev => prev.map(i => i.id === item.id ? updatedItem : i));
                }
            }

            const updatedHistory = [...(selectedActionCattle.vaccinationHistory || []), newRecord];
            const updatedCattle = { ...selectedActionCattle, vaccinationHistory: updatedHistory };
            
            if (vaccineForm.type === 'VACCINE' && vaccineForm.status === 'COMPLETED') {
                updatedCattle.vaccinationStatus = true;
            }

            await api.cattle.update(tenant.id, selectedActionCattle.id, updatedCattle);

            appEvents.emit('CATTLE_UPDATED');
            onRefresh?.();
            closeActionModal();
            setVaccineForm({ date: new Date().toISOString().split('T')[0], name: '', batch: '', notes: '', medicalItemId: '', dose: 1, type: 'VACCINE', provider: 'STOCK', status: 'COMPLETED', nextBoosterDate: '' }); // Reset form
        } catch (error: any) {
            console.error('Failed to update vaccination:', error);
            alert(`Failed to record vaccination: ${error.message || 'Unknown error'}`);
        }
    };

    const handleMarkVaccineCompleted = async (recordId: string) => {
        if (!selectedActionCattle) return;
        try {
            const record = selectedActionCattle.vaccinationHistory.find(r => r.id === recordId);
            const todayDate = new Date().toISOString().split('T')[0];

            const updatedHistory = selectedActionCattle.vaccinationHistory.map(r => 
                r.id === recordId ? { ...r, status: 'COMPLETED' as const, date: todayDate } : r
            );
            const updatedCattle = { ...selectedActionCattle, vaccinationHistory: updatedHistory, vaccinationStatus: true };

            if (record && record.provider === 'STOCK' && record.medicalItemId && record.medicalItemId !== 'manual') {
                await api.cattle.addMedicalRecord(tenant.id, selectedActionCattle.id, {
                    medicalItemId: record.medicalItemId,
                    date: todayDate,
                    dose: 1
                });

                // Explicitly deduct from stock
                const item = medicalInventory.find(i => i.id === record.medicalItemId);
                if (item) {
                    const newQuantity = Math.max(0, item.quantity - 1);
                    const updatedItem = { ...item, quantity: newQuantity };
                    await api.medical.update(tenant.id, item.id, updatedItem);
                    setMedicalInventory(prev => prev.map(i => i.id === item.id ? updatedItem : i));
                }
            }

            await api.cattle.update(tenant.id, selectedActionCattle.id, updatedCattle);
            appEvents.emit('CATTLE_UPDATED');
            onRefresh?.();
            setSelectedActionCattle(updatedCattle);
        } catch (e) {
            alert('Failed to update status.');
        }
    };

    const submitSale = async () => {
        if (!selectedActionCattle || !sellForm.price || !sellForm.buyerName) return;
        const salePrice = parseFloat(sellForm.price);
        const saleWeight = parseFloat(sellForm.saleWeight);

        const saleTransaction: Transaction = {
            id: `txn-sale-${Date.now()}`, date: sellForm.date, type: 'SALE', amount: salePrice, description: `Sold to ${sellForm.buyerName}. Notes: ${sellForm.notes}`, partyName: sellForm.buyerName, partyMobile: sellForm.buyerMobile
        };

        let updatedHistory = [...selectedActionCattle.weightHistory];
        if (!isNaN(saleWeight) && saleWeight !== selectedActionCattle.currentWeight) { updatedHistory.push({ date: sellForm.date, weight: saleWeight }); }

        try {
            await api.cattle.update(tenant.id, selectedActionCattle.id, {
                status: CattleStatus.SOLD,
                currentWeight: !isNaN(saleWeight) ? saleWeight : selectedActionCattle.currentWeight,
                weightHistory: updatedHistory,
                transactions: [...selectedActionCattle.transactions, saleTransaction],
                notes: `[SOLD]: Sold on ${sellForm.date} for Rs. ${salePrice}. \n` + selectedActionCattle.notes
            });
            appEvents.emit('CATTLE_UPDATED');
            onRefresh?.();
            closeActionModal();
        } catch (e) {
            alert("Failed to process sale.");
        }
    };

    const handleEndLactation = async () => {
        if (!activeLactation || !selectedActionCattle) return;
        try {
            const token = localStorage.getItem('farmxpert_token');
            const res = await fetch('/api/breeding/lactations/end', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenant.id },
                body: JSON.stringify({
                    animalId: selectedActionCattle.id,
                    endDate: endLactationForm.endDate,
                    reason: endLactationForm.reason
                })
            });

            if (res.ok) {
                // Refresh data
                const lacRes = await fetch(`/api/breeding/lactations/${selectedActionCattle.id}/active`, { headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenant.id } });
                const lacData = await lacRes.json();
                setActiveLactation(lacData); // Should be null or updated
                setShowEndLactationModal(false);
                setEndLactationForm({ endDate: new Date().toISOString().split('T')[0], reason: '' }); // Reset
                alert('Lactation ended successfully');
            } else {
                const errData = await res.json();
                alert(`Failed to end lactation: ${errData.error || 'Unknown error'}`);
            }
        } catch (err) {
            console.error(err);
            alert('Error ending lactation');
        }
    };

    const handleGeneratePrediction = async () => {
        if (!selectedActionCattle) return;
        setLoadingPrediction(true);
        const pkg = feedPackages.find(p => p.id === selectedActionCattle.monthlyPackageId);
        const result = await predictWeightGrowth(selectedActionCattle, pkg);
        setPredictionResult(result);
        setLoadingPrediction(false);
    };

    const getDynamicFeedCostParams = (pkgId: string) => {
        const pkg = feedPackages.find(p => p.id === pkgId);
        if (!pkg) return { costPerKg: 0, intakePct: 0.025, label: 'Unknown Package', items: [] };

        let weightedCost = 0;
        let totalRatio = 0;
        let roughageDailyCost = 0;

        pkg.items.forEach(item => {
            const f = feed.find(i => i.id === item.feedItemId);
            if (f) {
                if (item.type === 'ROUGHAGE') {
                    const dailyQty = (item.manualKgPerFeeding || 0) * (item.manualFeedings || 1);
                    roughageDailyCost += dailyQty * f.costPerKg;
                } else {
                    weightedCost += (f.costPerKg * item.ratioPercent);
                    totalRatio += item.ratioPercent;
                }
            }
        });

        const avgCostPerKg = totalRatio > 0 ? (weightedCost / totalRatio) : 0;

        const breakdownItems = pkg.items.map(item => {
            const f = feed.find(i => i.id === item.feedItemId);
            const isRoughage = item.type === 'ROUGHAGE';
            return {
                name: f ? f.name : 'Unknown Ingredient',
                ratioPercent: isRoughage ? 0 : item.ratioPercent,
                costPerKg: f ? f.costPerKg : 0,
                color: '#64748b',
                isRoughage,
                dryMatter: item.dryMatter, // Pass DM% through
                manualDailyQty: isRoughage ? (item.manualKgPerFeeding || 0) * (item.manualFeedings || 1) : 0
            };
        });

        return {
            costPerKg: avgCostPerKg,
            roughageDailyCost,
            intakePct: pkg.dailyIntakePercent / 100,
            label: pkg.name,
            items: breakdownItems,
            totalRatio
        };
    };

    const normalizeEnum = (val: string | undefined, validValues: string[], fallback: string) => {
        if (!val) return fallback;
        const found = validValues.find(v => v.toLowerCase() === val.toLowerCase());
        return found || val;
    };

    const handleEdit = (c: Cattle) => {
        setNewAnimal({
            type: normalizeEnum(c.type || (c.gender?.toLowerCase() === 'female' ? 'Cow' : 'Bull'), Object.values(AnimalType), AnimalType.COW) as AnimalType,
            tagNumber: c.tagNumber,
            name: c.name || '',
            imageUrl: c.imageUrl || '',
            breed: normalizeEnum(c.breed, Object.values(Breed), Breed.NON_DESCRIPT) as Breed,
            gender: normalizeEnum(c.gender, Object.values(Gender), Gender.FEMALE) as Gender,
            teeth: c.teeth,
            color: c.color,
            vaccinationStatus: c.vaccinationStatus ? 'Yes' : 'No',
            status: c.status,
            arrivalType: c.arrivalType,
            fatherTag: c.fatherTag || '',
            motherTag: c.motherTag || '',
            purchaseDate: c.entryDate ? new Date(c.entryDate).toISOString().split('T')[0] : '',
            arrivalWeight: c.entryWeight.toString(),
            animalPrice: c.purchasePrice.toString(),
            sellerName: '',
            sellerMobile: '',
            targetWeight: c.targetWeight.toString(),
            dailyTargetGain: c.dailyTargetGain ? c.dailyTargetGain.toString() : '1.0',
            ownerName: c.ownerName || '',
            ownerEmail: c.ownerEmail || '',
            ownerWhatsappNumber: c.ownerWhatsappNumber || '',
            ownerWhatsappApiKey: c.ownerWhatsappApiKey || '',
            ownerMobile: c.ownerMobile || '',
            ownerAddress: c.ownerAddress || '',
            monthlyPackageId: c.monthlyPackageId || '',
            monthlyCharges: c.monthlyCharges ? c.monthlyCharges.toString() : '',
            notes: c.notes || '',
            healthStatus: c.healthStatus || 'Healthy',
            isPregnant: c.isPregnant !== undefined ? c.isPregnant : !!c.expectedCalvingDate,
            expectedCalvingDate: c.expectedCalvingDate ? new Date(c.expectedCalvingDate).toISOString().split('T')[0] : '',
            pregnancyType: c.pregnancyType || '',
            pregnancySireOrEmbryo: c.pregnancySireOrEmbryo || '',
            currentDailyMilkYield: c.currentDailyMilkYield ? c.currentDailyMilkYield.toString() : '',
            ageMonths: c.ageMonths ? c.ageMonths.toString() : '',
            branch: c.branch || ''
        });
        setEditingId(c.id);
        setShowAddModal(true);
    };

    const handleDeleteClick = (e: React.MouseEvent, id: string, tag: string) => {
        e.preventDefault(); e.stopPropagation();
        if (userRole === 'LABOR') return;
        setDeleteConfirmation({ id, tag });
    };

    const confirmDelete = async () => {
        if (!deleteConfirmation) return;
        const { id, tag } = deleteConfirmation;

        if (userRole === 'MANAGER') {
            onRequestDelete({ id: `req-${Date.now()}`, targetId: id, targetName: tag, type: 'CATTLE', requestedBy: 'Manager', reason: 'Manual deletion request', date: new Date().toISOString() });
            setDeleteConfirmation(null);
            return;
        }

        try {
            await api.cattle.delete(tenant.id, id);
            appEvents.emit('CATTLE_UPDATED');
            onRefresh?.();
            setDeleteConfirmation(null);
        } catch (e) {
            alert("Failed to delete animal.");
        }
    };

    const handleSaveCattle = async () => {
        if (isSaving) return;

        const missingFields: string[] = [];
        if (!newAnimal.breed) missingFields.push('Breed');
        if (!newAnimal.color) missingFields.push('Color');
        if (!newAnimal.gender) missingFields.push('Gender');
        if (!newAnimal.teeth && newAnimal.teeth !== 0) missingFields.push('Teeth');
        if (!newAnimal.arrivalType) missingFields.push('Arrival Type');
        if (!newAnimal.purchaseDate) missingFields.push('Arrival/Birth Date');
        if (!newAnimal.arrivalWeight) missingFields.push('Arrival Weight');
        if (!newAnimal.animalPrice) missingFields.push('Purchase Price');
        if (!newAnimal.ownerName) missingFields.push('Owner Name');
        if (!newAnimal.monthlyPackageId) missingFields.push('Monthly Package');
        if (!newAnimal.monthlyCharges) missingFields.push('Monthly Charges');
        if (!newAnimal.ownerMobile) missingFields.push('Owner Mobile');
        if (!newAnimal.ownerEmail) missingFields.push('Owner Email');
        if (!newAnimal.ownerAddress) missingFields.push('Address');
        if (tenant.branches && tenant.branches.length > 0 && !newAnimal.branch) missingFields.push('Farm Branch / Location');

        if (missingFields.length > 0) {
            alert(`Please fill in the following required fields:\n${missingFields.join(', ')}`);
            return;
        }

        // Check for duplicate Tag Number
        const isDuplicateTag = cattle.some(c =>
            c.tagNumber.toLowerCase() === newAnimal.tagNumber.toLowerCase() &&
            c.id !== editingId
        );

        if (isDuplicateTag) {
            alert(`The Tag Number "${newAnimal.tagNumber}" is already in use by another animal. Please enter a unique Tag ID.`);
            return;
        }

        setIsSaving(true);
        const weight = parseFloat(newAnimal.arrivalWeight);
        const price = parseFloat(newAnimal.animalPrice.toString()) || 0;
        const target = parseFloat(newAnimal.targetWeight?.toString() || '0');
        const targetGain = parseFloat(newAnimal.dailyTargetGain?.toString() || '0');
        const monthlyCharges = parseFloat(newAnimal.monthlyCharges?.toString() || '0');

        try {
            if (editingId) {
                await api.cattle.update(tenant.id, editingId, {
                    tagNumber: newAnimal.tagNumber, type: newAnimal.type, name: newAnimal.name, imageUrl: newAnimal.imageUrl,
                    breed: newAnimal.breed, gender: newAnimal.gender, teeth: Number(newAnimal.teeth), color: newAnimal.color,
                    vaccinationStatus: newAnimal.vaccinationStatus === 'Yes',
                    status: newAnimal.status,
                    arrivalType: newAnimal.arrivalType, fatherTag: newAnimal.fatherTag, motherTag: newAnimal.motherTag,
                    entryDate: newAnimal.purchaseDate, entryWeight: weight,
                    targetWeight: target, dailyTargetGain: targetGain, purchasePrice: price,
                    ownerName: newAnimal.ownerName, ownerEmail: newAnimal.ownerEmail, ownerWhatsappNumber: newAnimal.ownerWhatsappNumber, ownerWhatsappApiKey: newAnimal.ownerWhatsappApiKey, ownerMobile: newAnimal.ownerMobile,
                    ownerAddress: newAnimal.ownerAddress, monthlyPackageId: newAnimal.monthlyPackageId, monthlyCharges: monthlyCharges,
                    notes: newAnimal.notes,
                    healthStatus: newAnimal.healthStatus,
                    isPregnant: newAnimal.isPregnant,
                    expectedCalvingDate: (newAnimal.isPregnant && newAnimal.expectedCalvingDate) ? newAnimal.expectedCalvingDate : undefined,
                    pregnancyType: newAnimal.isPregnant ? newAnimal.pregnancyType : null,
                    pregnancySireOrEmbryo: newAnimal.isPregnant ? newAnimal.pregnancySireOrEmbryo : null,
                    currentDailyMilkYield: newAnimal.currentDailyMilkYield ? parseFloat(newAnimal.currentDailyMilkYield.toString()) : 0,
                    ageMonths: newAnimal.ageMonths ? parseInt(newAnimal.ageMonths.toString()) : undefined,
                    branch: newAnimal.branch
                });
            } else {
                const initialTxn: Transaction = {
                    id: `txn-init-${Date.now()}`, date: newAnimal.purchaseDate, type: 'PURCHASE', amount: price,
                    description: `Initial Registration/Purchase`, partyName: newAnimal.sellerName || 'Mandi/Supplier',
                    partyMobile: newAnimal.sellerMobile
                };

                await api.cattle.create(tenant.id, {
                    tagNumber: newAnimal.tagNumber, type: newAnimal.type, name: newAnimal.name, imageUrl: newAnimal.imageUrl,
                    breed: newAnimal.breed, gender: newAnimal.gender, teeth: Number(newAnimal.teeth), color: newAnimal.color,
                    vaccinationStatus: newAnimal.vaccinationStatus === 'Yes', vaccinationHistory: [],
                    arrivalType: newAnimal.arrivalType, fatherTag: newAnimal.fatherTag, motherTag: newAnimal.motherTag,
                    entryDate: newAnimal.purchaseDate, entryWeight: weight, purchasePrice: price,
                    currentWeight: weight, targetWeight: target, dailyTargetGain: targetGain, status: CattleStatus.ACTIVE,
                    weightHistory: [{ date: newAnimal.purchaseDate, weight: weight }], transactions: [initialTxn],
                    ownerName: newAnimal.ownerName, ownerEmail: newAnimal.ownerEmail, ownerWhatsappNumber: newAnimal.ownerWhatsappNumber, ownerWhatsappApiKey: newAnimal.ownerWhatsappApiKey,
                    ownerMobile: newAnimal.ownerMobile, ownerAddress: newAnimal.ownerAddress,
                    monthlyPackageId: newAnimal.monthlyPackageId, monthlyCharges: monthlyCharges,
                    notes: newAnimal.notes,
                    healthStatus: newAnimal.healthStatus,
                    isPregnant: newAnimal.isPregnant,
                    expectedCalvingDate: (newAnimal.isPregnant && newAnimal.expectedCalvingDate) ? newAnimal.expectedCalvingDate : undefined,
                    pregnancyType: newAnimal.isPregnant ? newAnimal.pregnancyType : null,
                    pregnancySireOrEmbryo: newAnimal.isPregnant ? newAnimal.pregnancySireOrEmbryo : null,
                    currentDailyMilkYield: newAnimal.currentDailyMilkYield ? parseFloat(newAnimal.currentDailyMilkYield.toString()) : 0,
                    ageMonths: newAnimal.ageMonths ? parseInt(newAnimal.ageMonths.toString()) : undefined,
                    branch: newAnimal.branch
                });
            }
            appEvents.emit('CATTLE_UPDATED');
            onRefresh?.();
            handleCloseModal();
        } catch (e) {
            console.error(e);
            alert("Failed to save cattle record.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleCloseModal = () => { setShowAddModal(false); setEditingId(null); setNewAnimal(INITIAL_FORM_STATE); stopCamera(); };

    const handleDownloadTemplate = () => {
        const headers = [
            'Tag Number', 'Name', 'Type (Cow/Bull/Heifer/Goat/Sheep)', 'Breed (Sahiwal/Cholistani/Dhanni/Red Sindhi/Friesian Cross/Brahman Cross/Desi (Non-Descript))',
            'Gender (Male/Female)', 'Age (Months)', 'Teeth', 'Color', 'Pregnant (Pregnant/Not Pregnant)', 'Expected Calving Date (YYYY-MM-DD)',
            'Entry Date (YYYY-MM-DD)', 'Entry Weight (kg)', 'Target Weight (kg)', 'Purchase Price', 'Owner Name', 'Owner Email', 'Owner Mobile',
            'Monthly Package', 'Monthly Charges', 'Owner Address', 'Branch / Location', 'Conception Method (AI/Natural/Embryo)', 'Semen Code / Bull ID', 'Current Daily Milk Yield (Liters)'
        ];
        // Type + Gender + Age (months) together determine the exact category on import:
        // Cattle under 12mo -> Male/Female Calf, Goat under 12mo -> Male/Female Kid,
        // Sheep under 12mo -> Male/Female Lamb; 12mo+ -> Bull/Cow/Heifer, Buck/Doe, Ram/Ewe.
        const sampleRow = [
            'A1001', 'Bessie', 'Cow', 'Sahiwal', 'Female', '24', '2', 'Red', 'Pregnant', '2026-10-15',
            '2026-01-01', '350', '450', '250000', 'John Doe', 'john@example.com', '1234567890',
            'Basic Plan', '20000', '"123 Farm Lane, Sector 4"', 'Main Farm', 'AI', 'HO12345', '12.5'
        ];

        const csvContent = headers.join(',') + '\n' + sampleRow.join(',');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'farmxpert_cattle_import_template.csv';
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        setImportStats(null);

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            const lines = text.split('\n').filter(l => l.trim() !== '');

            let success = 0;
            let failed = 0;
            let duplicate = 0;

            // Guards against re-importing the same file (or an accidental duplicate
            // row within one file): an animal is treated as "already imported" if its
            // name, breed, owner, and entry date all match one that's already on
            // record. Tag numbers alone aren't a reliable key here - new-scheme farms
            // get a fresh auto-generated tag on every import, so a re-run would never
            // collide on tag_number even though it's importing the same animals again.
            const importKey = (n: string, b: string, o: string, d: string) => `${n.trim().toLowerCase()}|${b.trim().toLowerCase()}|${o.trim().toLowerCase()}|${d.trim()}`;
            const seenKeys = new Set(cattle.map(c => importKey(c.name || '', c.breed, c.ownerName || '', c.entryDate)));

            // Skip header row
            const dataLines = lines.slice(1);

            for (let idx = 0; idx < dataLines.length; idx++) {
                const line = dataLines[idx];
                const cols = parseCsvLine(line);
                if (cols.length < 2) continue;

                const tag = cols[0];
                const name = cols[1] || '';
                const typeStr = cols[2]?.trim();
                const breedStr = cols[3]?.toLowerCase() || 'desi (non-descript)';
                const genderStr = cols[4]?.toLowerCase() || 'male';
                const ageMonths = cols[5] ? parseInt(cols[5]) : undefined;
                const teeth = cols[6] ? parseInt(cols[6]) : undefined;
                const color = cols[7] || 'Unknown';
                const isPregnant = cols[8]?.toLowerCase() === 'pregnant';
                const expectedCalving = cols[9] || '';
                const entryDate = cols[10] || new Date().toISOString().split('T')[0];
                const entryWeightRaw = cols[11]?.trim();
                const targetWeightRaw = cols[12]?.trim() || '0';
                const purchasePrice = parseFloat(cols[13]) || 0;
                const ownerName = cols[14] || 'Farm Owned';
                const ownerEmail = cols[15] || '';
                const ownerMobile = cols[16] || '';
                const monthlyPackageStr = cols[17] || 'Basic Plan';
                const monthlyCharges = parseFloat(cols[18]) || 20000;
                const ownerAddress = cols[19] || '';
                const branch = cols[20] || '';
                const pregnancyType = cols[21] || null;
                const pregnancySireOrEmbryo = cols[22] || null;
                const currentDailyMilkYield = cols[23] ? parseFloat(cols[23]) : 0;

                const pkg = feedPackages.find(p => p.name.toLowerCase() === monthlyPackageStr.toLowerCase());
                const monthlyPackageId = pkg ? pkg.id : undefined;

                // Mandatory Field Checking
                if (!typeStr || !entryWeightRaw) {
                    console.error("Row import failed: Missing mandatory fields (Type or Entry Weight) for Tag", tag);
                    failed++;
                    continue;
                }

                const entryWeight = parseFloat(entryWeightRaw);
                const targetWeight = parseFloat(targetWeightRaw);

                if (isNaN(entryWeight) || isNaN(targetWeight)) {
                    console.error("Row import failed: Invalid numeric weight format for Tag", tag);
                    failed++;
                    continue;
                }

                const type = resolveImportedType(tag, typeStr, genderStr, ageMonths);
                if (!type) {
                    console.error("Row import failed: Could not determine animal type (checked tag prefix and Type/Gender/Age) for Tag", tag);
                    failed++;
                    continue;
                }

                let breed = Breed.NON_DESCRIPT;
                Object.values(Breed).forEach(b => { if (b.toLowerCase() === breedStr) breed = b; });

                let gender = Gender.MALE;
                if (genderStr.includes('female')) gender = Gender.FEMALE;

                const key = importKey(name, breed, ownerName, entryDate);
                if (seenKeys.has(key)) {
                    console.warn("Row skipped: an animal with this Name/Breed/Owner/Entry Date is already on record for Tag", tag);
                    duplicate++;
                    continue;
                }
                seenKeys.add(key);

                try {
                    await api.cattle.create(tenant.id, {
                        tagNumber: tag, name, type, breed, gender, ageMonths, teeth, color,
                        vaccinationStatus: false, vaccinationHistory: [], status: CattleStatus.ACTIVE,
                        isPregnant, expectedCalvingDate: isPregnant && expectedCalving ? expectedCalving : undefined,
                        pregnancyType: isPregnant ? pregnancyType : null,
                        pregnancySireOrEmbryo: isPregnant ? pregnancySireOrEmbryo : null,
                        arrivalType: ArrivalType.PURCHASED, entryDate, entryWeight: entryWeight, currentWeight: entryWeight,
                        purchasePrice, targetWeight, dailyTargetGain: 1.0, weightHistory: [{ date: entryDate, weight: entryWeight }], transactions: [],
                        ownerName, ownerEmail, ownerMobile, ownerAddress, monthlyPackageId, monthlyCharges, notes: 'Imported via CSV template',
                        branch, currentDailyMilkYield
                    });
                    success++;
                } catch (err) {
                    console.error("Failed to import row", idx, err);
                    failed++;
                }
            }

            setImportStats({ total: dataLines.length, success, failed, duplicate });
            setIsImporting(false);
            appEvents.emit('CATTLE_UPDATED');
            onRefresh?.();
        };
        reader.readAsText(file);

        if (event.target) {
            event.target.value = ''; // Reset input to allow re-uploading same file
        }
    };

    const handlePrintInventory = () => {
        const farmName = tenant.name;
        const activeCattle = cattle.filter(c => c.status !== CattleStatus.SOLD);

        const printContent = `
      <html>
        <head>
          <title>Herd Inventory Report</title>
          <style>
            body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 20px; color: #333; }
            h1 { color: #0C2B4E; border-bottom: 2px solid #1D546C; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; color: #1A3D64; }
            .header { display: flex; justify-content: space-between; align-items: flex-end; }
            .meta { font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
                <h1>${farmName} - Inventory Report</h1>
                <p>Date: ${new Date().toLocaleDateString()}</p>
            </div>
            <div class="meta">Total Animals: ${activeCattle.length}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Tag ID</th>
                <th>Breed</th>
                <th>Gender</th>
                <th>Entry Date</th>
                <th>Entry Wt</th>
                <th>Current Wt</th>
                <th>Status</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              ${activeCattle.map(c => `
                <tr>
                  <td><strong>${c.tagNumber}</strong></td>
                  <td>${c.breed}</td>
                  <td>${c.gender}</td>
                  <td>${c.entryDate}</td>
                  <td>${c.entryWeight} kg</td>
                  <td><strong>${c.currentWeight} kg</strong></td>
                  <td>${c.status}</td>
                  <td>${c.ownerName}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;
        const printWindow = window.open('', '', 'width=900,height=700');
        printWindow?.document.write(printContent);
        printWindow?.document.close();
    };

    const handlePrintSales = () => {
        const soldCattle = cattle.filter(c => c.status === CattleStatus.SOLD);
        const totalRevenue = soldCattle.reduce((acc, c) => {
            const sale = c.transactions.find(t => t.type === 'SALE');
            return acc + (sale ? sale.amount : 0);
        }, 0);

        const printContent = `
      <html>
        <head>
          <title>Sales & Revenue Report</title>
          <style>
            body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 20px; color: #333; }
            h1 { color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #ecfdf5; color: #065f46; }
            .summary { margin-top: 20px; text-align: right; font-size: 16px; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>Sales Summary</h1>
          <table>
            <thead>
              <tr>
                <th>Tag ID</th>
                <th>Sale Date</th>
                <th>Buyer</th>
                <th>Sale Wt (kg)</th>
                <th>Purchase Cost</th>
                <th>Sale Price</th>
                <th>Gross Margin</th>
              </tr>
            </thead>
            <tbody>
              ${soldCattle.map(c => {
            const sale = c.transactions.find(t => t.type === 'SALE');
            const price = sale ? sale.amount : 0;
            const date = sale ? sale.date : '-';
            const buyer = sale ? sale.partyName : '-';
            const margin = price - c.purchasePrice;
            return `
                    <tr>
                      <td>${c.tagNumber}</td>
                      <td>${date}</td>
                      <td>${buyer}</td>
                      <td>${c.currentWeight}</td>
                      <td>Rs. ${c.purchasePrice.toLocaleString()}</td>
                      <td><strong>Rs. ${price.toLocaleString()}</strong></td>
                      <td style="color:${margin >= 0 ? 'green' : 'red'}">Rs. ${margin.toLocaleString()}</td>
                    </tr>
                  `;
        }).join('')}
            </tbody>
          </table>
          <div class="summary">Total Revenue: Rs. ${totalRevenue.toLocaleString()}</div>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;
        const printWindow = window.open('', '', 'width=900,height=700');
        printWindow?.document.write(printContent);
        printWindow?.document.close();
    };

    const handlePrintIndividualReport = (animal: Cattle) => {
        const pkgName = feedPackages.find(p => p.id === animal.monthlyPackageId)?.name || 'Unassigned';
        const totalGain = animal.currentWeight - animal.entryWeight;
        const daysOnFarm = Math.floor((new Date().getTime() - new Date(animal.entryDate).getTime()) / (1000 * 3600 * 24)) || 1;
        const adg = (totalGain / daysOnFarm).toFixed(2);

        const { costPerKg, intakePct } = getDynamicFeedCostParams(animal.monthlyPackageId);
        const avgWeight = (animal.entryWeight + animal.currentWeight) / 2;
        const totalEstFeedCost = avgWeight * intakePct * costPerKg * daysOnFarm;

        const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${animal.tagNumber} - Report</title>
          <style>
            @page { size: A4; margin: 10mm; }
            body { 
                font-family: 'Helvetica', 'Arial', sans-serif; 
                color: #1e293b; 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact; 
                font-size: 12px;
                line-height: 1.4;
            }
            .container { max-width: 100%; margin: 0 auto; }
            .main-header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #0C2B4E; padding-bottom: 10px; }
            .farm-name { font-size: 28px; font-weight: 800; color: #0C2B4E; text-transform: uppercase; margin: 0; letter-spacing: 1px; }
            .report-title { font-size: 14px; color: #64748b; margin-top: 5px; text-transform: uppercase; letter-spacing: 2px; }
            .tag-banner { 
                background: #0C2B4E; color: white; padding: 15px 20px; border-radius: 8px; 
                display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;
            }
            .tag-main { font-size: 32px; font-weight: 800; }
            .owner-info { text-align: right; }
            .owner-label { font-size: 10px; text-transform: uppercase; opacity: 0.7; }
            .owner-name { font-size: 18px; font-weight: bold; color: #F4F4F4; }
            .section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; break-inside: avoid; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
            .card h3 { margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: #1A3D64; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
            .stat-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 12px; }
            .stat-label { color: #64748b; font-weight: 500; }
            .stat-val { font-weight: 700; color: #0f172a; }
            .big-stat-box { text-align: center; padding: 10px; background: white; border-radius: 6px; border: 1px solid #e2e8f0; }
            .big-stat-val { font-size: 24px; font-weight: 800; color: #1D546C; }
            .big-stat-lbl { font-size: 10px; text-transform: uppercase; color: #64748b; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th { text-align: left; background: #e2e8f0; padding: 6px; color: #475569; font-weight: bold; text-transform: uppercase; }
            td { padding: 6px; border-bottom: 1px solid #f1f5f9; }
            .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="main-header">
                <h1 class="farm-name">${tenant.name}</h1>
                <div class="report-title">Individual Cattle Performance Report</div>
            </div>

            <div class="tag-banner">
                <div class="tag-main">${animal.tagNumber}</div>
                <div class="owner-info">
                    <div class="owner-label">Owner Name</div>
                    <div class="owner-name">${animal.ownerName}</div>
                </div>
            </div>

            <div class="section-grid">
                <div class="card">
                    <h3>Identity & Origin</h3>
                    <div class="stat-row"><span class="stat-label">Breed:</span> <span class="stat-val">${animal.breed}</span></div>
                    <div class="stat-row"><span class="stat-label">Gender/Type:</span> <span class="stat-val">${animal.type} / ${animal.gender}</span></div>
                    <div class="stat-row"><span class="stat-label">Age (Teeth):</span> <span class="stat-val">${animal.teeth}</span></div>
                    <div class="stat-row"><span class="stat-label">Entry Date:</span> <span class="stat-val">${animal.entryDate}</span></div>
                    <div class="stat-row"><span class="stat-label">Purchase Price:</span> <span class="stat-val">Rs. ${animal.purchasePrice.toLocaleString()}</span></div>
                </div>

                <div class="card">
                    <h3>Growth Performance</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                        <div class="big-stat-box">
                            <div class="big-stat-val">${animal.currentWeight} <span style="font-size:12px">kg</span></div>
                            <div class="big-stat-lbl">Current Weight</div>
                        </div>
                        <div class="big-stat-box">
                            <div class="big-stat-val" style="color:${totalGain > 0 ? '#059669' : '#333'}">${totalGain > 0 ? '+' : ''}${totalGain} <span style="font-size:12px">kg</span></div>
                            <div class="big-stat-lbl">Total Gain</div>
                        </div>
                    </div>
                    <div class="stat-row"><span class="stat-label">Entry Weight:</span> <span class="stat-val">${animal.entryWeight} kg</span></div>
                    <div class="stat-row"><span class="stat-label">Days on Farm:</span> <span class="stat-val">${daysOnFarm} Days</span></div>
                    <div class="stat-row"><span class="stat-label">Avg Daily Gain (ADG):</span> <span class="stat-val" style="color:#1D546C">${adg} kg/day</span></div>
                </div>
            </div>

            <div class="card" style="break-inside: avoid;">
                <h3>Diet & Expenses</h3>
                <div class="section-grid" style="margin-bottom:0; grid-template-columns: 2fr 1fr;">
                    <div>
                         <div class="stat-row"><span class="stat-label">Feed Plan:</span> <span class="stat-val">${pkgName}</span></div>
                         <div class="stat-row"><span class="stat-label">Target Intake:</span> <span class="stat-val">${(intakePct * 100).toFixed(1)}% of Body Weight</span></div>
                         <div class="stat-row"><span class="stat-label">Estimated Feed Cost:</span> <span class="stat-val">Rs. ${Math.round(totalEstFeedCost).toLocaleString()}</span></div>
                    </div>
                    <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:8px; border-radius:4px; text-align:center;">
                        <div style="font-size:10px; color:#166534; font-weight:bold; text-transform:uppercase;">Net Profit Estimate</div>
                        <div style="font-size:16px; font-weight:bold; color:#15803d; margin-top:4px;">
                             Rs. ${(
                animal.transactions.reduce((acc, t) => t.type === 'SALE' ? acc + t.amount : acc - t.amount, 0)
                - totalEstFeedCost
            ).toLocaleString()}
                        </div>
                    </div>
                </div>
            </div>

            <div class="card" style="break-inside: avoid;">
                <h3>Vaccination & Health Log</h3>
                <table>
                    <thead>
                        <tr>
                            <th style="width:20%">Date</th>
                            <th style="width:30%">Treatment</th>
                            <th>Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${animal.vaccinationHistory.length > 0 ? animal.vaccinationHistory.map(v => `
                        <tr>
                            <td>${v.date}</td>
                            <td><strong>${v.vaccineName}</strong></td>
                            <td>${v.notes || '-'}</td>
                        </tr>
                        `).join('') : '<tr><td colspan="3" style="text-align:center; padding:10px; color:#94a3b8">No records found</td></tr>'}
                    </tbody>
                </table>
            </div>

            <div class="card" style="break-inside: avoid;">
                <h3>Notes</h3>
                <div style="font-size:11px; color:#475569; min-height:40px;">
                    ${animal.notes || 'No additional observations recorded.'}
                </div>
            </div>

            <div class="footer">
                Report Generated on ${new Date().toLocaleDateString()} via FarmXpert SaaS
            </div>
          </div>
          <script>
             window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
      `;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(printContent);
            printWindow.document.close();
        }
    };

    const handleExportCSV = () => {
        const headers = [
            'Tag Number', 'Name', 'Breed', 'Gender', 'Teeth', 'Status',
            'Current Weight (kg)', 'Target Weight (kg)', 'Daily Gain Goal (kg)',
            'Entry Date', 'Entry Weight', 'Purchase Price',
            'Owner Name', 'Owner Mobile', 'Package',
            'Vaccination Status', 'Notes',
            'Weight History', 'Vaccination History'
        ];

        const csvContent = [
            headers.join(','),
            ...cattle.map(c => {
                const wHist = c.weightHistory.map(w => `${w.date}:${w.weight}`).join(' | ');
                const vHist = c.vaccinationHistory.map(v => `${v.date}:${v.vaccineName}`).join(' | ');
                const pkgName = feedPackages.find(p => p.id === c.monthlyPackageId)?.name || 'None';

                return [
                    c.tagNumber,
                    c.name || '',
                    c.breed,
                    c.gender,
                    c.teeth,
                    c.status,
                    c.currentWeight,
                    c.targetWeight,
                    c.dailyTargetGain || '',
                    c.entryDate ? new Date(c.entryDate).toISOString().split('T')[0] : '',
                    c.entryWeight,
                    c.purchasePrice,
                    `"${c.ownerName}"`,
                    c.ownerMobile || '',
                    pkgName,
                    c.vaccinationStatus ? 'Yes' : 'No',
                    `"${(c.notes || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
                    `"${wHist}"`,
                    `"${vHist}"`
                ].join(',');
            })
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `herd_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const filteredCattle = cattle.filter(c => {
        const matchesSearch = c.tagNumber.toLowerCase().includes(searchTerm.toLowerCase()) || (c.name && c.name.toLowerCase().includes(searchTerm.toLowerCase())) || (c.ownerName && c.ownerName.toLowerCase().includes(searchTerm.toLowerCase()));
        let matchesStatus = false;
        if (filterStatus === 'All') {
            matchesStatus = true;
        } else if (filterStatus === 'Financial: Profit') {
            const { netProfit } = calculateCattleFinancials(c, tenant, feedPackages, feed);
            matchesStatus = netProfit >= 0;
        } else if (filterStatus === 'Financial: Loss') {
            const { netProfit } = calculateCattleFinancials(c, tenant, feedPackages, feed);
            matchesStatus = netProfit < 0;
        } else if (filterStatus === 'Pregnant') {
            matchesStatus = c.isPregnant === true && c.status !== CattleStatus.SOLD && c.status !== CattleStatus.DEAD;
        } else {
            matchesStatus = c.status === filterStatus;
        }

        const matchesType = filterType === 'All' || c.type === filterType;
        const matchesBreed = filterBreed === 'All' || c.breed === filterBreed;
        const matchesGender = filterGender === 'All' || c.gender === filterGender;
        const matchesBranch = filterBranch === 'All' || c.branch === filterBranch || (!c.branch && filterBranch === 'Main Farm');

        return matchesSearch && matchesStatus && matchesType && matchesBreed && matchesGender && matchesBranch;
    });

    const sortedCattle = [...filteredCattle].sort((a, b) => {
        if (!sortConfig) return 0;
        const { key, direction } = sortConfig;

        // Handle nested or computed sorting
        let valA: any = a[key as keyof Cattle];
        let valB: any = b[key as keyof Cattle];

        if (key === 'profit') {
            valA = calculateCattleFinancials(a, tenant, feedPackages, feed).netProfit;
            valB = calculateCattleFinancials(b, tenant, feedPackages, feed).netProfit;
        }
        if (key === 'tagNumber') {
            // Try to treat tag as a number for sorting if possible
            const numA = parseInt(valA as string);
            const numB = parseInt(valB as string);
            if (!isNaN(numA) && !isNaN(numB)) {
                valA = numA;
                valB = numB;
            }
        }

        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    });

    const totalPages = Math.ceil(sortedCattle.length / itemsPerPage) || 1;
    const paginatedCattle = sortedCattle.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // Reset pagination when filters change
    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(1);
        }
    }, [filteredCattle.length, currentPage, totalPages]);

    const tabLabels: Record<string, string> = {
        weight: 'Weight History',
        breeding: 'Breeding & Lactation',
        medical: 'Medical & Vaccines',
        alerts: 'Alerts',
        financial: 'Financials',
        info: 'Owner & Info',
        gallery: 'Gallery',
        documents: 'Documents',
        notes: 'Notes'
    };

    // --- KPI Calculations ---
    const branchFilteredCattle = cattle.filter(c => filterBranch === 'All' || c.branch === filterBranch || (!c.branch && filterBranch === 'Main Farm'));

    const totalHeadcount = branchFilteredCattle.filter(c => c.status !== CattleStatus.SOLD && c.status !== CattleStatus.DEAD && c.status !== CattleStatus.DECEASED).length;
    // Dynamic per-type breakdown - covers every type actually present on the farm
    // (legacy Cow/Bull/Heifer/Goat/Calf/Kid or the new full Cattle/Goat/Sheep taxonomy),
    // rather than a handful of hardcoded categories that silently omit the rest.
    const activeCattleForBreakdown = branchFilteredCattle.filter(c => c.status !== CattleStatus.SOLD && c.status !== CattleStatus.DEAD && c.status !== CattleStatus.DECEASED);
    const typeBreakdown: { type: string; count: number }[] = Object.values(AnimalType)
        .map(t => ({ type: t as string, count: activeCattleForBreakdown.filter(c => c.type === t).length }))
        .filter(t => t.count > 0);
    const totalInvestment = branchFilteredCattle.filter(c => c.status !== CattleStatus.SOLD && c.status !== CattleStatus.DEAD && c.status !== CattleStatus.DECEASED).reduce((sum, c) => sum + (Number(c.purchasePrice) || 0), 0);
    const sickCount = branchFilteredCattle.filter(c => c.status === CattleStatus.SICK || c.healthStatus?.toLowerCase() === 'sick').length;
    const pregnantCount = branchFilteredCattle.filter(c => c.isPregnant && c.status !== CattleStatus.SOLD && c.status !== CattleStatus.DEAD && c.status !== CattleStatus.DECEASED).length;

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const renderSortIcon = (key: string) => {
        if (sortConfig?.key !== key) return <TrendingUp className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity ml-1 inline-block" />;
        return sortConfig.direction === 'asc' ? <TrendingUp className="w-3 h-3 text-emerald-500 ml-1 inline-block" /> : <TrendingDown className="w-3 h-3 text-emerald-500 ml-1 inline-block" />;
    };

    // Render component...
    // (Full Render content preserved as per previous logic but logic is updated)
    return (
        <div className="space-y-6 animate-fade-in max-w-[1920px] mx-auto pb-10">
            <div className="flex flex-col gap-6">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-3xl border border-white/50 dark:border-slate-800/50 shadow-sm">
                    <div>
                        <h2 className="text-3xl font-black bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-teal-300 bg-clip-text text-transparent tracking-tight">
                            Herd Management
                        </h2>
                        <p className="text-slate-500 font-medium text-sm mt-1">Comprehensive oversight of livestock inventory, growth metrics, and health records.</p>
                    </div>
                    <button
                        onClick={handleOpenRegisterModal}
                        className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-6 py-3 rounded-2xl flex items-center gap-2 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all duration-300 hover:-translate-y-1 active:scale-95 font-bold"
                    >
                        <Plus className="w-5 h-5" /> <span>Register New Animal</span>
                    </button>
                </div>

                {/* KPI Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-2">
                    {/* Active Headcount */}
                    <div className="group bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50 dark:from-blue-950/40 dark:to-indigo-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(59,130,246,0.15)] hover:shadow-[0_8px_30px_rgb(59,130,246,0.3)] border border-blue-100 dark:border-blue-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                        <div className="flex items-start justify-between mb-4 relative">
                            <div className="p-3 bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
                                <List className="w-6 h-6" />
                            </div>
                            <span className="text-[10px] bg-white/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Active Inventory</span>
                        </div>
                        <div className="relative">
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Active Headcount</p>
                            <h3 className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{totalHeadcount}</h3>
                        </div>
                    </div>

                    {/* Gender & Type */}
                    <div className="group bg-gradient-to-br from-purple-50 via-fuchsia-50 to-purple-50 dark:from-purple-950/40 dark:to-fuchsia-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(168,85,247,0.15)] hover:shadow-[0_8px_30px_rgb(168,85,247,0.3)] border border-purple-100 dark:border-purple-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                        <div className="flex items-start justify-between mb-4 relative">
                            <div className="p-3 bg-white dark:bg-slate-800 border border-purple-100 dark:border-purple-900/50 text-purple-600 dark:text-purple-400 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300">
                                <Package className="w-6 h-6" />
                            </div>
                            <span className="text-[10px] bg-white/60 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm">Breakdown</span>
                        </div>
                        <div className="relative">
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Gender & Type</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                                {typeBreakdown.map(({ type, count }) => (
                                    <span key={type} className="bg-white/50 dark:bg-slate-800/50 px-2 py-1 rounded-md">{count} {type}</span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Financials */}
                    {canSeeFinancials ? (
                        <div className="group bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/40 dark:to-orange-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(251,191,36,0.15)] hover:shadow-[0_8px_30px_rgb(251,191,36,0.3)] border border-amber-100 dark:border-amber-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                            <div className="flex items-start justify-between mb-4 relative">
                                <div className="p-3 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl text-white shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform duration-300">
                                    <Wallet className="w-6 h-6" />
                                </div>
                                <span className="text-[10px] bg-white/60 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full font-bold uppercase tracking-wide backdrop-blur-sm border border-amber-200 dark:border-amber-800/50">Invested</span>
                            </div>
                            <div className="relative">
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Total Active Investment</p>
                                <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight overflow-hidden text-ellipsis whitespace-nowrap">
                                    <span className="text-lg text-amber-600/80 dark:text-amber-500 font-bold mr-1">Rs.</span>
                                    {totalInvestment.toLocaleString()}
                                </h3>
                            </div>
                        </div>
                    ) : (
                        <div className="group bg-slate-50 dark:bg-slate-800/40 p-6 rounded-3xl border border-slate-200 dark:border-slate-700/50 relative overflow-hidden opacity-75">
                            <div className="flex items-start justify-between mb-4 relative">
                                <div className="p-3 bg-slate-200 dark:bg-slate-700 text-slate-400 rounded-2xl shadow-sm">
                                    <ShieldCheck className="w-6 h-6" />
                                </div>
                            </div>
                            <div className="relative">
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Financials</p>
                                <h3 className="text-2xl font-bold text-slate-400 dark:text-slate-500 tracking-tight mt-1">Access Restricted</h3>
                            </div>
                        </div>
                    )}

                    {/* Health Alerts */}
                    <div className="group bg-gradient-to-br from-red-50 via-rose-50 to-red-50 dark:from-red-950/40 dark:to-rose-950/30 p-6 rounded-3xl shadow-[0_8px_30px_rgb(225,29,72,0.15)] hover:shadow-[0_8px_30px_rgb(225,29,72,0.3)] border border-red-100 dark:border-red-900/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-red-400/20 to-transparent rounded-bl-full -mr-8 -mt-8 blur-2xl"></div>
                        <div className="flex items-start justify-between mb-4 relative">
                            <div className={`p-3 rounded-2xl shadow-md group-hover:scale-110 transition-transform duration-300 ${sickCount > 0 ? 'bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-red-500/30' : 'bg-white dark:bg-slate-800 border border-emerald-100 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400'}`}>
                                <Activity className="w-6 h-6" />
                            </div>
                            {sickCount > 0 && <span className="absolute top-0 right-0 -mt-1 -mr-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-slate-800 animate-pulse"></span>}
                        </div>
                        <div className="relative">
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-1">Health Alerts</p>
                            <div className="flex items-center gap-3 mt-1">
                                <span className={`text-2xl font-black ${sickCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                    {sickCount} Sick
                                </span>
                                {pregnantCount > 0 && (
                                    <>
                                        <span className="text-slate-300 dark:text-slate-600 text-sm">•</span>
                                        <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">{pregnantCount} Pregnant</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl p-3 md:p-4 rounded-3xl border border-white/50 dark:border-slate-800/50 shadow-sm flex flex-col md:flex-row gap-4 items-center transition-all">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-emerald-500" size={20} />
                        <input
                            type="text"
                            placeholder="Search Tag, Name, Owner..."
                            className="w-full pl-12 pr-4 py-3 bg-white/80 dark:bg-slate-800/80 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500/50 outline-none text-slate-800 dark:text-slate-100 placeholder-slate-400 font-medium shadow-sm transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-3 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto scrollbar-hide">
                        <div className="flex items-center gap-2 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md rounded-2xl p-1.5 shadow-sm border border-white/20 dark:border-slate-700/50">
                            <div className="relative min-w-[140px]">
                                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500" size={16} />
                                <select
                                    className="w-full appearance-none pl-9 pr-6 py-2 bg-transparent focus:ring-0 outline-none text-slate-700 dark:text-slate-200 text-sm font-bold cursor-pointer transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                >
                                    <option value="All">All Status</option>
                                    {Object.values(CattleStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                    <option disabled>──────</option>
                                    <option value="Pregnant">🤰 Pregnant</option>
                                    <option disabled>──────</option>
                                    <option value="Financial: Profit">💰 Profitable</option>
                                    <option value="Financial: Loss">📉 Loss Making</option>
                                </select>
                            </div>
                            <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 rounded-full"></div>
                            <div className="relative min-w-[120px]">
                                <select
                                    className="w-full appearance-none px-3 py-2 bg-transparent focus:ring-0 outline-none text-slate-700 dark:text-slate-200 text-sm font-bold cursor-pointer transition-colors hover:text-teal-600 dark:hover:text-teal-400"
                                    value={filterType}
                                    onChange={(e) => setFilterType(e.target.value)}
                                >
                                    <option value="All">All Types</option>
                                    {isNewTagScheme
                                        ? NEW_SCHEME_TYPES_BY_SPECIES.map(group => (
                                            <optgroup key={group.species} label={group.species}>
                                                {group.types.map(t => <option key={t} value={t}>{t}</option>)}
                                            </optgroup>
                                        ))
                                        : LEGACY_ANIMAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 rounded-full"></div>
                            <div className="relative min-w-[120px]">
                                <select
                                    className="w-full appearance-none px-3 py-2 bg-transparent focus:ring-0 outline-none text-slate-700 dark:text-slate-200 text-sm font-bold cursor-pointer transition-colors hover:text-pink-600 dark:hover:text-pink-400"
                                    value={filterGender}
                                    onChange={(e) => setFilterGender(e.target.value)}
                                >
                                    <option value="All">All Genders</option>
                                    {Object.values(Gender).map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                            </div>
                            {tenant?.branches && tenant.branches.length > 0 && (
                                <>
                                    <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 rounded-full"></div>
                                    <div className="relative min-w-[120px]">
                                        <select
                                            className="w-full appearance-none px-3 py-2 bg-transparent focus:ring-0 outline-none text-slate-700 dark:text-slate-200 text-sm font-bold cursor-pointer transition-colors hover:text-amber-600 dark:hover:text-amber-400"
                                            value={filterBranch}
                                            onChange={(e) => setFilterBranch(e.target.value)}
                                        >
                                            <option value="All">All Branches</option>
                                            <option value="Main Farm">Main Farm</option>
                                            {tenant.branches.map(b => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={handleExportCSV}
                                className="bg-white/80 dark:bg-slate-800/80 border border-white/20 dark:border-slate-700/50 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-2xl flex items-center gap-2 hover:bg-white dark:hover:bg-slate-700 transition-all shadow-sm group font-bold text-sm"
                                title="Export Current View"
                            >
                                <Download className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" /> <span className="hidden lg:inline">Export</span>
                            </button>

                            <button
                                onClick={() => setShowImportModal(true)}
                                className="bg-white/80 dark:bg-slate-800/80 border border-white/20 dark:border-slate-700/50 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-2xl flex items-center gap-2 hover:bg-white dark:hover:bg-slate-700 transition-all shadow-sm group font-bold text-sm"
                                title="Bulk Import Data"
                            >
                                <Upload className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" /> <span className="hidden lg:inline">Import</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-white/40 dark:bg-slate-800/40 backdrop-blur-xl rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-700/60 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-100/50 dark:bg-slate-700/50 border-b border-slate-200/60 dark:border-slate-700/60 sticky top-0 z-10 backdrop-blur-md">
                            <tr>
                                <th className="px-4 py-4 w-12">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                        checked={selectedCattleIds.length === paginatedCattle.length && paginatedCattle.length > 0}
                                        onChange={toggleSelectAll}
                                    />
                                </th>
                                <th className="px-4 sm:px-6 py-4 text-left font-bold text-slate-600 dark:text-slate-400 text-xs sm:text-sm uppercase tracking-wider cursor-pointer group hover:bg-slate-200/50 dark:hover:bg-slate-600/50 transition-colors whitespace-nowrap" onClick={() => handleSort('tagNumber')}>
                                    <div className="flex items-center justify-start">Identity {renderSortIcon('tagNumber')}</div>
                                </th>
                                <th className="px-4 sm:px-6 py-4 text-left font-bold text-slate-600 dark:text-slate-400 text-xs sm:text-sm uppercase tracking-wider hidden md:table-cell cursor-pointer group hover:bg-slate-200/50 dark:hover:bg-slate-600/50 transition-colors whitespace-nowrap" onClick={() => handleSort('ownerName')}>
                                    <div className="flex items-center justify-start">Owner {renderSortIcon('ownerName')}</div>
                                </th>
                                <th className="px-4 sm:px-6 py-4 text-left font-bold text-slate-600 dark:text-slate-400 text-xs sm:text-sm uppercase tracking-wider hidden lg:table-cell cursor-pointer group hover:bg-slate-200/50 dark:hover:bg-slate-600/50 transition-colors whitespace-nowrap" onClick={() => handleSort('breed')}>
                                    <div className="flex items-center justify-start">Details {renderSortIcon('breed')}</div>
                                </th>
                                <th className="px-4 sm:px-6 py-4 text-left font-bold text-slate-600 dark:text-slate-400 text-xs sm:text-sm uppercase tracking-wider cursor-pointer group hover:bg-slate-200/50 dark:hover:bg-slate-600/50 transition-colors whitespace-nowrap" onClick={() => handleSort('status')}>
                                    <div className="flex items-center justify-start">Status {renderSortIcon('status')}</div>
                                </th>
                                <th className="px-4 sm:px-6 py-4 text-left font-bold text-slate-600 dark:text-slate-400 text-xs sm:text-sm uppercase tracking-wider hidden sm:table-cell cursor-pointer group hover:bg-slate-200/50 dark:hover:bg-slate-600/50 transition-colors whitespace-nowrap" onClick={() => handleSort('currentWeight')}>
                                    <div className="flex items-center justify-start">Growth {renderSortIcon('currentWeight')}</div>
                                </th>
                                <th className="px-4 sm:px-6 py-4 font-bold text-slate-600 dark:text-slate-400 text-xs sm:text-sm uppercase tracking-wider text-center whitespace-nowrap">
                                    <div className="flex items-center justify-center">Actions</div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/60 dark:divide-slate-700/60">
                            {paginatedCattle.map((c) => {
                                const progress = Math.min(100, Math.round((c.currentWeight / c.targetWeight) * 100));
                                const pkgName = feedPackages.find(p => p.id === c.monthlyPackageId)?.name || 'Unassigned';

                                // Alert Logic
                                let isWeightStale = false;
                                if (c.weightHistory && c.weightHistory.length > 0) {
                                    const lastWeightDate = new Date(c.weightHistory[c.weightHistory.length - 1].date);
                                    const daysSinceWeighing = Math.floor((new Date().getTime() - lastWeightDate.getTime()) / (1000 * 3600 * 24));
                                    if (daysSinceWeighing > 14) isWeightStale = true;
                                } else {
                                    isWeightStale = true; // No weight history at all
                                }

                                let isLowGrowth = false;
                                if (c.weightHistory && c.weightHistory.length > 1) {
                                    const firstWeight = c.weightHistory[0];
                                    const lastWeight = c.weightHistory[c.weightHistory.length - 1];
                                    const daysPassed = Math.floor((new Date(lastWeight.date).getTime() - new Date(firstWeight.date).getTime()) / (1000 * 3600 * 24));
                                    if (daysPassed > 0) {
                                        const adg = (lastWeight.weight - firstWeight.weight) / daysPassed;
                                        if (adg > 0 && c.dailyTargetGain && c.dailyTargetGain > 0 && adg < (c.dailyTargetGain * 0.5)) {
                                            isLowGrowth = true;
                                        }
                                    }
                                }

                                let calvingDays = -1;
                                if (c.isPregnant && c.expectedCalvingDate) {
                                    calvingDays = Math.floor((new Date(c.expectedCalvingDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                                }
                                const isCalvingSoon = calvingDays >= 0 && calvingDays <= 30;

                                return (
                                    <tr key={c.id} className={`hover:bg-emerald-50/50 dark:hover:bg-blue-900/20 transition-colors group ${selectedCattleIds.includes(c.id) ? 'bg-emerald-50/50 dark:bg-blue-900/30' : ''}`}>
                                        <td className="px-4 py-4" onClick={(e) => toggleSelectOne(c.id, e)}>
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer pointer-events-none"
                                                checked={selectedCattleIds.includes(c.id)}
                                                readOnly
                                            />
                                        </td>
                                        <td className="px-4 sm:px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="relative">
                                                    {c.imageUrl ? (
                                                        <img src={c.imageUrl} alt="Cattle" className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-600 shadow-sm transition-transform group-hover:scale-105" />
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center text-slate-400 border border-slate-200 dark:border-slate-600">
                                                            <ImageIcon className="w-6 h-6" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-800 dark:text-slate-100 text-base flex items-center gap-2">
                                                        #{c.tagNumber}
                                                        {isWeightStale && c.status === 'Active' && (
                                                            <div className="relative group cursor-help" title="Weight not updated in over 14 days">
                                                                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                                                                </span>
                                                                <Scale size={14} className="text-orange-500" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    {c.name && c.name.toLowerCase().includes('calf of') && (c.parentTag || c.motherTag) ? (
                                                        <div className="text-[10px] sm:text-xs text-slate-500 flex items-center gap-1"><Baby size={12} /> Calf of {c.parentTag || c.motherTag}</div>
                                                    ) : (
                                                        c.name && <div className="text-[10px] sm:text-xs text-slate-500 font-medium">{c.name}</div>
                                                    )}
                                                    <div className="text-[10px] text-slate-400 md:hidden mt-0.5">{c.ownerName}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 sm:px-6 py-4 hidden md:table-cell">
                                            <div className="text-sm font-medium text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                                <User size={14} className="text-slate-400" /> {c.ownerName}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                                <FileText size={12} /> {pkgName}
                                            </div>
                                        </td>
                                        <td className="px-4 sm:px-6 py-4 text-sm text-slate-600 dark:text-slate-400 hidden lg:table-cell">
                                            <div className="font-medium text-slate-700 dark:text-slate-200">{c.breed}</div>
                                            <div className="text-xs text-slate-400 mt-0.5">{c.teeth} • {c.gender}</div>
                                        </td>
                                        <td className="px-4 sm:px-6 py-4">
                                            <div className="flex flex-col gap-1 items-start">
                                                {c.status === 'Active' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"><Activity size={12} className="mr-1" /> Active</span>}
                                                {c.status === 'Sold' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800"><DollarSign size={12} className="mr-1" /> Sold</span>}
                                                {c.status === 'Sick' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"><AlertTriangle size={12} className="mr-1" /> Sick</span>}
                                                {c.status === 'Quarantined' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800"><ShieldCheck size={12} className="mr-1" /> Quarantined</span>}
                                                {(c.status === 'Dead' || c.status === 'Deceased') && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"><X size={12} className="mr-1" /> Deceased</span>}
                                                {['Active', 'Sold', 'Sick', 'Quarantined', 'Dead', 'Deceased'].indexOf(c.status) === -1 && (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600">{c.status}</span>
                                                )}

                                                {isCalvingSoon && (
                                                    <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800/50 animate-pulse" title={`Expected in ${calvingDays} days`}>
                                                        <Baby size={10} /> Calving
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 sm:px-6 py-4 hidden sm:table-cell">
                                            <div className="flex justify-between text-xs font-bold mb-1.5 items-center">
                                                <span className="text-slate-700 dark:text-slate-300">{c.currentWeight}kg</span>
                                                <div className="flex items-center gap-1">
                                                    {isLowGrowth && c.status === 'Active' && (
                                                        <span title="Warning: Very Low Growth Rate" className="flex items-center">
                                                            <TrendingDown size={14} className="text-red-500 animate-pulse" />
                                                        </span>
                                                    )}
                                                    <span className="text-slate-400">Target: {c.targetWeight}kg</span>
                                                </div>
                                            </div>
                                            <div className="w-full max-w-[140px] bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                                                <div className={`h-full rounded-full transition-all duration-500 ${progress >= 90 ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : isLowGrowth ? 'bg-gradient-to-r from-red-500 to-orange-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'}`} style={{ width: `${progress}%` }}></div>
                                            </div>
                                        </td>
                                        <td className="px-4 sm:px-6 py-4">
                                            <div className="flex items-center justify-end gap-2">
                                                <button onClick={() => openReportModal(c)} className="p-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-slate-400 hover:text-emerald-600 rounded-xl transition-colors" title="Full Details"><FileText size={18} /></button>
                                                <button onClick={() => openWeightModal(c)} className="p-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-slate-400 hover:text-emerald-600 rounded-xl transition-colors" title="Update Weight"><Scale size={18} /></button>
                                                <button onClick={() => openVaccineModal(c)} className="p-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-slate-400 hover:text-emerald-600 rounded-xl transition-colors hidden sm:block" title="Vaccinate"><Syringe size={18} /></button>
                                                {canSell && (<button onClick={() => openSellModal(c)} className="p-2 hover:bg-green-50 dark:hover:bg-green-900/30 text-slate-400 hover:text-green-600 rounded-xl transition-colors hidden sm:block" title="Sell Animal"><DollarSign size={18} /></button>)}
                                                <button onClick={() => openHealthModal(c)} className="p-2 hover:bg-amber-50 dark:hover:bg-amber-900/30 text-slate-400 hover:text-amber-600 rounded-xl transition-colors hidden md:block" title="Log Health Issue"><Activity size={18} /></button>
                                                {canEdit && (<button onClick={() => handleEdit(c)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl transition-colors hidden sm:block" title="Edit"><Pencil size={18} /></button>)}
                                                {userRole !== 'LABOR' && (<button onClick={(e) => handleDeleteClick(e, c.id, c.tagNumber)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600 rounded-xl transition-colors hidden sm:block" title="Delete"><Trash2 size={18} /></button>)}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="p-4 sm:p-6 border-t border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-800/50 flex flex-col md:flex-row items-center justify-between gap-4 w-full">
                        <div className="text-sm font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            Showing <span className="font-bold text-slate-700 dark:text-slate-200">{sortedCattle.length === 0 ? 0 : ((currentPage - 1) * itemsPerPage) + 1}</span> to <span className="font-bold text-slate-700 dark:text-slate-200">{Math.min(currentPage * itemsPerPage, sortedCattle.length)}</span> of <span className="font-bold text-slate-700 dark:text-slate-200">{sortedCattle.length}</span> entries
                        </div>

                        <div className="flex items-center flex-wrap justify-center gap-1.5 sm:gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-2 sm:px-4 sm:py-2 flex items-center gap-1 sm:gap-2 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-bold text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-emerald-600 transition-all active:scale-95"
                            >
                                <ChevronLeft size={16} /> <span className="hidden sm:inline">Previous</span>
                            </button>

                            <div className="flex items-center gap-1">
                                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                    // Complex visual pagination logic to always show ~5 buttons and handle ends
                                    let pageNum = i + 1;
                                    if (totalPages > 5) {
                                        if (currentPage > 3 && currentPage < totalPages - 1) {
                                            pageNum = currentPage - 2 + i;
                                        } else if (currentPage >= totalPages - 1) {
                                            pageNum = totalPages - 4 + i;
                                        }
                                    }

                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => setCurrentPage(pageNum)}
                                            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-sm font-bold transition-all active:scale-95 flex items-center justify-center ${currentPage === pageNum
                                                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20 shadow-inner ring-2 ring-emerald-600/50'
                                                : 'border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                                }`}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-2 sm:px-4 sm:py-2 flex items-center gap-1 sm:gap-2 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-bold text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-emerald-600 transition-all active:scale-95"
                            >
                                <span className="hidden sm:inline">Next</span> <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>


            {deleteConfirmation && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-2xl rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-6 border border-slate-200/60 dark:border-slate-700/60">
                        <div className="flex justify-center mb-4">
                            <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-full text-red-600 dark:text-red-400">
                                <AlertTriangle size={32} />
                            </div>
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2 text-center">Confirm Deletion</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-center mb-6 text-sm leading-relaxed">
                            Are you sure you want to {userRole === 'MANAGER' ? 'request to delete' : 'permanently delete'} <span className="font-bold text-slate-800 dark:text-slate-200">{deleteConfirmation.tag}</span>?
                            This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteConfirmation(null)} className="flex-1 py-2.5 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">Cancel</button>
                            <button onClick={confirmDelete} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all active:scale-95">
                                {userRole === 'MANAGER' ? 'Send Request' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showAddModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-0 sm:p-4 animate-fade-in">
                    <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-5xl h-full sm:h-[90vh] overflow-hidden flex flex-col border border-slate-200/60 dark:border-slate-700/60">
                        <div className="p-6 border-b border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900/50 flex justify-between items-center">
                            <h3 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                                {editingId ? 'Edit Animal Details' : 'Register New Animal'}
                            </h3>
                            <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"><X size={24} /></button>
                        </div>

                        <div className="p-8 overflow-y-auto flex-1 space-y-10 bg-slate-50/30 dark:bg-slate-900/30">
                            {/* Image Section */}
                            <div className="flex flex-col items-center justify-center">
                                <div className="w-40 h-40 rounded-full bg-white dark:bg-slate-800 border-4 border-white dark:border-slate-700 shadow-xl flex items-center justify-center overflow-hidden relative group">
                                    {newAnimal.imageUrl ? (<img src={newAnimal.imageUrl} alt="Animal" className="w-full h-full object-cover" />) : (<ImageIcon size={48} className="text-slate-300 dark:text-slate-600" />)}
                                    {showCamera && (<video ref={videoRef} autoPlay className="absolute inset-0 w-full h-full object-cover z-10" />)}
                                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer" onClick={() => imageInputRef.current?.click()}>
                                        <Camera className="text-white" size={32} />
                                    </div>
                                </div>
                                <div className="flex gap-3 mt-6">
                                    <button onClick={() => imageInputRef.current?.click()} className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm rounded-xl text-sm font-medium hover:bg-white dark:hover:bg-slate-700 transition-colors">Upload Photo</button>
                                    <button onClick={startCamera} className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm rounded-xl text-sm font-medium hover:bg-white dark:hover:bg-slate-700 transition-colors">Use Camera</button>
                                    {showCamera && <button onClick={capturePhoto} className="px-4 py-2 bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 rounded-xl text-sm font-bold hover:bg-emerald-600 transition-colors">Capture</button>}
                                    <input type="file" ref={imageInputRef} accept="image/*" onChange={handleImageUpload} className="hidden" />
                                </div>
                            </div>

                            <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm p-6 rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-sm">
                                <h4 className="text-sm font-bold text-emerald-600 dark:text-blue-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                                    <span className="bg-blue-100 dark:bg-blue-900/30 p-1.5 rounded-lg"><Tag size={16} /></span> Identity & Breed
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Animal Type</label>
                                        <select
                                            value={newAnimal.type}
                                            onChange={(e) => handleAnimalTypeChange(e.target.value as AnimalType)}
                                            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                                            disabled={!!editingId}
                                        >
                                            {isNewTagScheme
                                                ? NEW_SCHEME_TYPES_BY_SPECIES.map(group => (
                                                    <optgroup key={group.species} label={group.species}>
                                                        {group.types.map(t => <option key={t} value={t}>{t}</option>)}
                                                    </optgroup>
                                                ))
                                                : LEGACY_ANIMAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Tag Number <span className="text-red-500">*</span></label>
                                        <input
                                            type="text"
                                            value={isNewTagScheme && !editingId ? (newSchemeTagPreview || 'Generating...') : newAnimal.tagNumber}
                                            onChange={(e) => setNewAnimal({ ...newAnimal, tagNumber: e.target.value })}
                                            readOnly={isNewTagScheme && !editingId}
                                            className={`w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900/50 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all ${isNewTagScheme && !editingId ? 'opacity-70 cursor-not-allowed' : ''}`}
                                            placeholder="e.g. B1001"
                                        />
                                        {!editingId && (
                                            <p className="text-xs text-slate-400 mt-1.5 mx-1">
                                                {isNewTagScheme ? 'Auto-generated - one running sequence across every animal type on your farm.' : 'Auto-generated based on type. Can be edited.'}
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Name (Optional)</label>
                                        <input type="text" value={newAnimal.name} onChange={(e) => setNewAnimal({ ...newAnimal, name: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all placeholder-slate-400" placeholder="e.g. Sultan" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-6">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Breed</label>
                                        <select value={newAnimal.breed} onChange={(e) => setNewAnimal({ ...newAnimal, breed: e.target.value as Breed })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all">
                                            {Object.values(Breed).map(b => <option key={b} value={b}>{b}</option>)}
                                            {!Object.values(Breed).includes(newAnimal.breed as Breed) && newAnimal.breed && (
                                                <option key={newAnimal.breed} value={newAnimal.breed}>{newAnimal.breed}</option>
                                            )}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Gender</label>
                                        <select value={newAnimal.gender} onChange={(e) => setNewAnimal({ ...newAnimal, gender: e.target.value as Gender })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all">
                                            {Object.values(Gender).map(g => <option key={g} value={g}>{g}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Teeth (Age)</label>
                                        <select value={newAnimal.teeth} onChange={(e) => setNewAnimal({ ...newAnimal, teeth: Number(e.target.value) })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all">
                                            <option value={0}>Milk Teeth (0)</option>
                                            <option value={2}>2 Teeth</option>
                                            <option value={4}>4 Teeth</option>
                                            <option value={6}>6 Teeth</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Age (Months)</label>
                                        <input type="number" value={newAnimal.ageMonths} onChange={(e) => setNewAnimal({ ...newAnimal, ageMonths: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all placeholder-slate-400" placeholder="e.g. 24" />
                                    </div>
                                    {tenant?.branches && tenant.branches.length > 0 && (
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Branch / Location <span className="text-red-500">*</span></label>
                                            <select value={newAnimal.branch || ''} onChange={(e) => setNewAnimal({ ...newAnimal, branch: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all">
                                                <option value="" disabled>Select Branch</option>
                                                <option value="Main Farm">Main Farm</option>
                                                {tenant.branches.map(b => <option key={b} value={b}>{b}</option>)}
                                            </select>
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Color</label>
                                        <input type="text" value={newAnimal.color} onChange={(e) => setNewAnimal({ ...newAnimal, color: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all placeholder-slate-400" placeholder="e.g. Red" />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm p-6 rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-sm">
                                <h4 className="text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                                    <span className="bg-emerald-100 dark:bg-emerald-900/30 p-1.5 rounded-lg"><Activity size={16} /></span> Health & Medical
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Health Status</label>
                                        <select
                                            value={newAnimal.healthStatus}
                                            onChange={(e) => setNewAnimal({ ...newAnimal, healthStatus: e.target.value })}
                                            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                                        >
                                            <option value="Healthy">Healthy</option>
                                            <option value="Sick">Sick</option>
                                            <option value="Under Treatment">Under Treatment</option>
                                            <option value="Quarantine">Quarantine</option>
                                            <option value="Recovered">Recovered</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Vaccinated?</label>
                                        <select
                                            value={newAnimal.vaccinationStatus}
                                            onChange={(e) => setNewAnimal({ ...newAnimal, vaccinationStatus: e.target.value })}
                                            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                                        >
                                            <option value="No">No (Needs Vaccination)</option>
                                            <option value="Yes">Yes (Already Vaccinated)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {(newAnimal.gender === Gender.FEMALE || newAnimal.type === AnimalType.COW || newAnimal.type === AnimalType.HEIFER) && (
                                <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm p-6 rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-sm">
                                    <h4 className="text-sm font-bold text-pink-600 dark:text-pink-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                                        <span className="bg-pink-100 dark:bg-pink-900/30 p-1.5 rounded-lg"><Baby size={16} /></span> Dairy & Reproduction
                                    </h4>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Pregnancy Status <span className="text-red-500">*</span></label>
                                            <select
                                                value={newAnimal.isPregnant ? 'Yes' : 'No'}
                                                onChange={(e) => setNewAnimal({ ...newAnimal, isPregnant: e.target.value === 'Yes' })}
                                                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 outline-none transition-all"
                                            >
                                                <option value="No">Not Pregnant / Open</option>
                                                <option value="Yes">Pregnant</option>
                                            </select>
                                        </div>

                                        {newAnimal.isPregnant && (
                                            <>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Expected Calving Date <span className="text-red-500">*</span></label>
                                                    <input
                                                        type="date"
                                                        required={newAnimal.isPregnant}
                                                        value={newAnimal.expectedCalvingDate}
                                                        onChange={(e) => setNewAnimal({ ...newAnimal, expectedCalvingDate: e.target.value })}
                                                        className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 outline-none transition-all"
                                                    />
                                                </div>
                                                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 bg-pink-50 dark:bg-pink-900/10 p-4 rounded-xl border border-pink-100 dark:border-pink-900/30">
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Conception Method</label>
                                                        <select
                                                            value={newAnimal.pregnancyType || ''}
                                                            onChange={(e) => setNewAnimal({ ...newAnimal, pregnancyType: e.target.value })}
                                                            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 outline-none transition-all"
                                                        >
                                                            <option value="">Select Method...</option>
                                                            <option value="AI">Artificial Insemination (AI)</option>
                                                            <option value="NATURAL">Natural Service</option>
                                                            <option value="EMBRYO">Embryo Transfer</option>
                                                            <option value="UNKNOWN">Unknown</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                            {newAnimal.pregnancyType === 'EMBRYO' ? 'Embryo Code / Details' : 'AI Bull Name / Semen Code'}
                                                        </label>
                                                        <input
                                                            type="text"
                                                            list={newAnimal.pregnancyType === 'EMBRYO' ? "embryo-options-reg" : "semen-options-reg"}
                                                            value={newAnimal.pregnancySireOrEmbryo || ''}
                                                            onChange={(e) => setNewAnimal({ ...newAnimal, pregnancySireOrEmbryo: e.target.value })}
                                                            placeholder={newAnimal.pregnancyType === 'EMBRYO' ? "Enter Embryo Details" : "e.g., Bull Tag or Name"}
                                                            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 outline-none transition-all placeholder-slate-400"
                                                        />
                                                        {newAnimal.pregnancyType !== 'EMBRYO' && (
                                                            <datalist id="semen-options-reg">
                                                                {semenList.filter((s: any) => s.status === 'AVAILABLE').map((s: any) => (
                                                                    <option key={s.id} value={s.code}>
                                                                        {s.bull_name} ({s.breed})
                                                                    </option>
                                                                ))}
                                                            </datalist>
                                                        )}
                                                        {newAnimal.pregnancyType === 'EMBRYO' && (
                                                            <datalist id="embryo-options-reg">
                                                                {embryoList.filter((e: any) => e.status === 'AVAILABLE').map((e: any) => (
                                                                    <option key={e.id} value={e.code}>
                                                                        {e.bull_name} x {e.donor_cow} ({e.breed})
                                                                    </option>
                                                                ))}
                                                            </datalist>
                                                        )}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    <div className="border-t border-slate-100 dark:border-slate-700/50 pt-6">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Current Daily Milk Yield (Liters/KG)</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={newAnimal.currentDailyMilkYield}
                                            onChange={(e) => setNewAnimal({ ...newAnimal, currentDailyMilkYield: e.target.value })}
                                            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 outline-none transition-all placeholder-slate-400"
                                            placeholder="e.g. 12.5"
                                        />
                                        <p className="text-xs text-slate-400 mt-1.5 mx-1">Leave as 0 if dry or immature.</p>
                                    </div>
                                </div>
                            )}


                            <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm p-6 rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-sm">
                                <h4 className="text-sm font-bold text-emerald-600 dark:text-indigo-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                                    <span className="bg-indigo-100 dark:bg-indigo-900/30 p-1.5 rounded-lg"><Calendar size={16} /></span> Origin & Arrival
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Arrival Type</label>
                                        <select value={newAnimal.arrivalType} onChange={(e) => setNewAnimal({ ...newAnimal, arrivalType: e.target.value as ArrivalType })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all">
                                            {Object.values(ArrivalType).map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Arrival/Birth Date</label>
                                        <input type="date" value={newAnimal.purchaseDate} onChange={(e) => setNewAnimal({ ...newAnimal, purchaseDate: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Arrival Weight (kg) <span className="text-red-500">*</span></label>
                                        <input type="number" value={newAnimal.arrivalWeight} onChange={(e) => setNewAnimal({ ...newAnimal, arrivalWeight: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all placeholder-slate-400" placeholder="e.g. 220" />
                                    </div>
                                </div>

                                {newAnimal.arrivalType === ArrivalType.BORN && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 bg-emerald-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-800/30">
                                        <div className="relative">
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Sire (Father) Tag / Semen Code</label>
                                            <input
                                                type="text"
                                                list="father-options-reg"
                                                value={newAnimal.fatherTag}
                                                onChange={(e) => setNewAnimal({ ...newAnimal, fatherTag: e.target.value })}
                                                className="w-full border border-blue-200 dark:border-blue-700 rounded-xl px-4 py-3 bg-white dark:bg-slate-800/50 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                                                placeholder="Optional: Tag or Semen Code"
                                            />
                                            <datalist id="father-options-reg">
                                                {semenList.map((s: any) => (
                                                    <option key={s.id} value={s.code}>
                                                        {s.bull_name} ({s.breed})
                                                    </option>
                                                ))}
                                                {embryoList.map((e: any) => (
                                                    <option key={e.id} value={e.code}>
                                                        {e.bull_name} x {e.donor_cow} ({e.breed})
                                                    </option>
                                                ))}
                                            </datalist>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Dam (Mother) Tag</label>
                                            <input type="text" value={newAnimal.motherTag} onChange={(e) => setNewAnimal({ ...newAnimal, motherTag: e.target.value })} className="w-full border border-blue-200 dark:border-blue-700 rounded-xl px-4 py-3 bg-white dark:bg-slate-800/50 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none" placeholder="Optional" />
                                        </div>
                                    </div>
                                )}

                                {newAnimal.arrivalType === ArrivalType.PURCHASED && (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 bg-white dark:bg-slate-700/30 p-4 rounded-xl border border-slate-100 dark:border-slate-600/50">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Purchase Price (Rs)</label>
                                            <input type="number" value={newAnimal.animalPrice} onChange={(e) => setNewAnimal({ ...newAnimal, animalPrice: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-800/50 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none" placeholder="e.g. 85000" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Seller/Mandi Name</label>
                                            <input type="text" value={newAnimal.sellerName} onChange={(e) => setNewAnimal({ ...newAnimal, sellerName: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-800/50 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none" placeholder="e.g. Arifwala Mandi" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Seller Mobile</label>
                                            <input type="text" value={newAnimal.sellerMobile} onChange={(e) => setNewAnimal({ ...newAnimal, sellerMobile: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-800/50 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none" placeholder="e.g. 0300-1234567" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm p-6 rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-sm">
                                <h4 className="text-sm font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                                    <span className="bg-purple-100 dark:bg-purple-900/30 p-1.5 rounded-lg"><TrendingUp size={16} /></span> Growth Targets
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Target Weight (kg)</label>
                                        <input type="number" value={newAnimal.targetWeight} onChange={(e) => setNewAnimal({ ...newAnimal, targetWeight: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all placeholder-slate-400" placeholder="e.g. 450" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Target Daily Gain (kg/day)</label>
                                        <input type="number" step="0.1" value={newAnimal.dailyTargetGain} onChange={(e) => setNewAnimal({ ...newAnimal, dailyTargetGain: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all placeholder-slate-400" placeholder="e.g. 1.2" />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm p-6 rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-sm">
                                <h4 className="text-sm font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                                    <span className="bg-amber-100 dark:bg-amber-900/30 p-1.5 rounded-lg"><User size={16} /></span> Ownership & Diet
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Owner Name <span className="text-red-500">*</span></label>
                                        <input type="text" value={newAnimal.ownerName} onChange={(e) => setNewAnimal({ ...newAnimal, ownerName: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all placeholder-slate-400" placeholder="Owner full name" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Monthly Package <span className="text-red-500">*</span></label>
                                        <select
                                            value={newAnimal.monthlyPackageId}
                                            onChange={(e) => setNewAnimal({ ...newAnimal, monthlyPackageId: e.target.value })}
                                            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
                                        >
                                            <option value="">-- Select Package --</option>
                                            {feedPackages.map(p => (
                                                <option key={p.id} value={p.id}>{p.name} ({p.dailyIntakePercent}% Body Wt)</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Monthly Charges ({tenant?.currency || 'PKR'}) <span className="text-red-500">*</span></label>
                                        <input type="number" value={newAnimal.monthlyCharges} onChange={(e) => setNewAnimal({ ...newAnimal, monthlyCharges: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all placeholder-slate-400" placeholder="e.g. 15000" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Owner Mobile <span className="text-red-500">*</span></label>
                                        <div className="relative">
                                            <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input type="text" value={newAnimal.ownerMobile} onChange={(e) => setNewAnimal({ ...newAnimal, ownerMobile: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl pl-12 pr-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all placeholder-slate-400" placeholder="03001234567" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Owner Email <span className="text-red-500">*</span></label>
                                        <div className="relative">
                                            <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input type="email" value={newAnimal.ownerEmail} onChange={(e) => setNewAnimal({ ...newAnimal, ownerEmail: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl pl-12 pr-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all placeholder-slate-400" placeholder="owner@email.com" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Address <span className="text-red-500">*</span></label>
                                        <div className="relative">
                                            <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input type="text" value={newAnimal.ownerAddress} onChange={(e) => setNewAnimal({ ...newAnimal, ownerAddress: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl pl-12 pr-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all placeholder-slate-400" placeholder="Full address" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">WhatsApp Number</label>
                                        <div className="relative">
                                            <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500" />
                                            <input type="text" value={newAnimal.ownerWhatsappNumber || ''} onChange={(e) => setNewAnimal({ ...newAnimal, ownerWhatsappNumber: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl pl-12 pr-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all placeholder-slate-400" placeholder="+923001234567" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">CallMeBot API Key</label>
                                        <div className="relative">
                                            <Shield size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500" />
                                            <input type="text" value={newAnimal.ownerWhatsappApiKey || ''} onChange={(e) => setNewAnimal({ ...newAnimal, ownerWhatsappApiKey: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl pl-12 pr-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all placeholder-slate-400" placeholder="123456" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm p-6 rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-sm">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Additional Notes</label>
                                <textarea
                                    value={newAnimal.notes}
                                    onChange={(e) => setNewAnimal({ ...newAnimal, notes: e.target.value })}
                                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 h-28 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all placeholder-slate-400 resize-y"
                                    placeholder="Any markings, specific health conditions, etc."
                                ></textarea>
                            </div>

                        </div>
                        <div className="p-6 border-t border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900/50 flex justify-end gap-3 filter backdrop-blur-md">
                            <button onClick={handleCloseModal} disabled={isSaving} className="px-6 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-bold transition-colors disabled:opacity-50">Cancel</button>
                            <button onClick={handleSaveCattle} disabled={isSaving} className="px-8 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-xl shadow-lg shadow-emerald-500/20 font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                                {isSaving && <Loader2 size={18} className="animate-spin" />}
                                {isSaving ? 'Saving...' : (editingId ? 'Save Changes' : 'Register Animal')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ... Other modals (Weight, Health, Vaccine, Sell, Report) same as before but using submitWeightUpdate etc which now call api ... */}
            {/* For brevity, keeping other modal render code as it was, just ensuring they trigger the updated submit functions */}

            {actionType === 'weight' && selectedActionCattle && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-2xl rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-6 border border-slate-200/60 dark:border-slate-700/60">
                        <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500 mb-6 flex items-center gap-3">
                            <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-xl text-emerald-600 dark:text-emerald-400">
                                <Scale size={20} />
                            </div>
                            Update Weight
                        </h3>
                        <div className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">New Weight (kg)</label>
                                <input type="number" value={weightForm.weight} onChange={(e) => setWeightForm({ ...weightForm, weight: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 font-bold text-2xl text-center bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all" autoFocus />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Date</label>
                                <input type="date" value={weightForm.date} onChange={(e) => setWeightForm({ ...weightForm, date: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all" />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-8">
                            <button onClick={closeActionModal} className="flex-1 py-3 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">Cancel</button>
                            <button onClick={submitWeightUpdate} className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 transition-all active:scale-95">Save Update</button>
                        </div>
                    </div>
                </div>
            )}

            {actionType === 'health' && selectedActionCattle && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 animate-fade-in">
                    <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-2xl rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6 border border-slate-200/60 dark:border-slate-700/60">
                        <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-orange-500 mb-6 flex items-center gap-3">
                            <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-xl text-amber-600 dark:text-amber-400">
                                <Activity size={20} />
                            </div>
                            Log Health Issue
                        </h3>
                        <div className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Health Status</label>
                                <select value={healthForm.status} onChange={(e) => setHealthForm({ ...healthForm, status: e.target.value as CattleStatus })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all">
                                    {Object.values(CattleStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Symptoms / Treatment Notes</label>
                                <textarea value={healthForm.notes} onChange={(e) => setHealthForm({ ...healthForm, notes: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 h-32 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all resize-none"></textarea>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-8">
                            <button onClick={closeActionModal} className="flex-1 py-3 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">Cancel</button>
                            <button onClick={submitHealthUpdate} className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl font-bold shadow-lg shadow-amber-500/20 transition-all active:scale-95">Update Log</button>
                        </div>
                    </div>
                </div>
            )}

            {actionType === 'vaccine' && selectedActionCattle && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 animate-fade-in">
                    <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-2xl rounded-2xl shadow-2xl w-full max-w-md overflow-y-auto max-h-[90vh] p-5 sm:p-6 border border-slate-200/60 dark:border-slate-700/60">
                        <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-500 mb-5 flex items-center gap-3">
                            <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-xl text-emerald-600 dark:text-indigo-400">
                                <Syringe size={20} />
                            </div>
                            Record Health / Vaccination
                        </h3>
                        <div className="space-y-4">
                            <div className="flex gap-2 p-1 bg-white dark:bg-slate-700 rounded-xl mb-4">
                                <button
                                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${vaccineForm.type === 'VACCINE' ? 'bg-white dark:bg-slate-600 shadow text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                                    onClick={() => setVaccineForm({ ...vaccineForm, type: 'VACCINE', medicalItemId: '', name: '' })}
                                >
                                    Vaccination
                                </button>
                                <button
                                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${vaccineForm.type === 'MEDICAL_RECORD' ? 'bg-white dark:bg-slate-600 shadow text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                                    onClick={() => setVaccineForm({ ...vaccineForm, type: 'MEDICAL_RECORD', medicalItemId: '', name: '' })}
                                >
                                    Treatment / Medicine
                                </button>
                            </div>

                            {vaccineForm.type === 'VACCINE' && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Provider</label>
                                    <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                                        <button
                                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${vaccineForm.provider === 'STOCK' ? 'bg-emerald-500 text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                                            onClick={() => setVaccineForm({ ...vaccineForm, provider: 'STOCK', medicalItemId: '', name: '' })}
                                        >
                                            Use from Stock
                                        </button>
                                        <button
                                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${vaccineForm.provider === 'DOCTOR' ? 'bg-emerald-500 text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                                            onClick={() => setVaccineForm({ ...vaccineForm, provider: 'DOCTOR', medicalItemId: '', name: '' })}
                                        >
                                            Provided by Doctor
                                        </button>
                                    </div>
                                    {vaccineForm.provider === 'STOCK' && (
                                        <p className="text-[10px] text-emerald-600 mt-1 pl-1">This will deduct a dose from your inventory.</p>
                                    )}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select Item</label>
                                {vaccineForm.type === 'VACCINE' && vaccineForm.provider === 'DOCTOR' ? (
                                    <select
                                        value={vaccineForm.name}
                                        onChange={(e) => {
                                            setVaccineForm({ ...vaccineForm, name: e.target.value, medicalItemId: '' });
                                        }}
                                        className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/20 mb-3"
                                    >
                                        <option value="">-- Select Standard Vaccine --</option>
                                        {PAKISTAN_PROTOCOLS.filter(p => {
                                            const isSmallRuminant = selectedActionCattle.type === 'Goat';
                                            if (isSmallRuminant && p.target.includes('Cows')) return false;
                                            if (!isSmallRuminant && p.target.includes('Goats')) return false;
                                            return true;
                                        }).map((protocol, idx) => (
                                            <option key={idx} value={protocol.disease}>
                                                {protocol.disease} ({protocol.localName})
                                            </option>
                                        ))}
                                        <option value="Other">Other</option>
                                    </select>
                                ) : (
                                    <select
                                        value={vaccineForm.medicalItemId}
                                        onChange={(e) => {
                                            const id = e.target.value;
                                            if (id && id !== 'manual') {
                                                const item = medicalInventory.find(i => i.id === id);
                                                setVaccineForm({
                                                    ...vaccineForm,
                                                    medicalItemId: id,
                                                    name: item?.name || '',
                                                    batch: item?.batchNumber || ''
                                                });
                                            } else {
                                                setVaccineForm({ ...vaccineForm, medicalItemId: id, name: '', batch: '' });
                                            }
                                        }}
                                        className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/20 mb-3"
                                    >
                                        <option value="">-- Select from Inventory --</option>
                                        {medicalInventory.filter(i => {
                                            if (i.type !== (vaccineForm.type === 'MEDICAL_RECORD' ? 'MEDICINE' : 'VACCINE')) return false;
                                            if (i.type === 'VACCINE') {
                                                let tAnimal = i.targetAnimal || 'Both';
                                                if (!i.targetAnimal) {
                                                    const nameUpper = i.name.toUpperCase();
                                                    if (nameUpper.includes('FMD') || nameUpper.includes('LSD') || nameUpper.includes('HS') || nameUpper.includes('BQ') || nameUpper.includes('CHOR MAR') || nameUpper.includes('GAL GHOTU') || nameUpper.includes('MUNH KHUR')) tAnimal = 'Cow';
                                                    if (nameUpper.includes('PPR') || nameUpper.includes('ET') || nameUpper.includes('ANTARI MAAR')) tAnimal = 'Goat';
                                                }
                                                if (tAnimal !== 'Both') {
                                                    const isSmallRuminant = selectedActionCattle.type === 'Goat';
                                                    if (isSmallRuminant && tAnimal === 'Cow') return false;
                                                    if (!isSmallRuminant && tAnimal === 'Goat') return false;
                                                }
                                            }
                                            return true;
                                        }).map(item => (
                                            <option key={item.id} value={item.id}>
                                                {item.name} ({item.quantity} {item.unit} available)
                                            </option>
                                        ))}
                                        <option value="manual">Other (Manual Entry)</option>
                                    </select>
                                )}

                                {((!vaccineForm.medicalItemId || vaccineForm.medicalItemId === 'manual') && !(vaccineForm.type === 'VACCINE' && vaccineForm.provider === 'DOCTOR' && vaccineForm.name && vaccineForm.name !== 'Other')) && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 mt-3">Item Name (Manual)</label>
                                        <input type="text" value={vaccineForm.name === 'Other' ? '' : vaccineForm.name} onChange={(e) => setVaccineForm({ ...vaccineForm, name: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all" placeholder={vaccineForm.type === 'VACCINE' ? "e.g. FMD" : "e.g. Panadol"} />
                                    </div>
                                )}
                            </div>

                            {vaccineForm.medicalItemId && vaccineForm.medicalItemId !== 'manual' && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Dose / Quantity Used</label>
                                    <div className="relative">
                                        <input type="number" step="0.1" value={vaccineForm.dose} onChange={(e) => setVaccineForm({ ...vaccineForm, dose: parseFloat(e.target.value) })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all" />
                                        <div className="absolute right-4 top-3 text-slate-400 text-sm font-medium">
                                            {medicalInventory.find(i => i.id === vaccineForm.medicalItemId)?.unit || 'units'}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Record Action</label>
                                <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-4">
                                    <button
                                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${vaccineForm.status === 'COMPLETED' ? 'bg-white dark:bg-slate-700 shadow text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                                        onClick={() => setVaccineForm({ ...vaccineForm, status: 'COMPLETED' })}
                                    >
                                        Mark Administered
                                    </button>
                                    <button
                                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${vaccineForm.status === 'SCHEDULED' ? 'bg-amber-500 text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                                        onClick={() => setVaccineForm({ ...vaccineForm, status: 'SCHEDULED' })}
                                    >
                                        Schedule Future
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    {vaccineForm.status === 'COMPLETED' ? 'Date Administered' : 'Scheduled Date'}
                                </label>
                                <input type="date" value={vaccineForm.date} onChange={(e) => setVaccineForm({ ...vaccineForm, date: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all" />
                            </div>
                            
                            {vaccineForm.status === 'COMPLETED' && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Schedule Next Booster (Optional)</label>
                                    <input type="date" value={vaccineForm.nextBoosterDate || ''} onChange={(e) => setVaccineForm({ ...vaccineForm, nextBoosterDate: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all" />
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Notes</label>
                                <textarea value={vaccineForm.notes} onChange={(e) => setVaccineForm({ ...vaccineForm, notes: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 h-16 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all resize-none"></textarea>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={closeActionModal} className="flex-1 py-3 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">Cancel</button>
                            <button onClick={submitVaccineUpdate} className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 transition-all active:scale-95">Record Entry</button>
                        </div>
                    </div>
                </div>
            )}

            {actionType === 'sell' && selectedActionCattle && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 animate-fade-in">
                    <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-2xl rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6 border border-slate-200/60 dark:border-slate-700/60">
                        <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-emerald-500 mb-6 flex items-center gap-3">
                            <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-xl text-green-600 dark:text-green-400">
                                <DollarSign size={20} />
                            </div>
                            Sell Animal
                        </h3>
                        <div className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Sale Price (Rs) <span className="text-red-500">*</span></label>
                                <input type="number" value={sellForm.price} onChange={(e) => setSellForm({ ...sellForm, price: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 font-bold text-lg bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all" autoFocus />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Final Weight (kg)</label>
                                    <input type="number" value={sellForm.saleWeight} onChange={(e) => setSellForm({ ...sellForm, saleWeight: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Sale Date</label>
                                    <input type="date" value={sellForm.date} onChange={(e) => setSellForm({ ...sellForm, date: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Buyer Name <span className="text-red-500">*</span></label>
                                <input type="text" value={sellForm.buyerName} onChange={(e) => setSellForm({ ...sellForm, buyerName: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Buyer Mobile</label>
                                <input type="text" value={sellForm.buyerMobile} onChange={(e) => setSellForm({ ...sellForm, buyerMobile: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Notes</label>
                                <textarea value={sellForm.notes} onChange={(e) => setSellForm({ ...sellForm, notes: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 h-20 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all resize-none"></textarea>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-8">
                            <button onClick={closeActionModal} className="flex-1 py-3 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">Cancel</button>
                            <button onClick={submitSale} className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-green-500/20 transition-all active:scale-95">Confirm Sale</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Report Modal */}
            {actionType === 'report' && selectedActionCattle && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-0 sm:p-4 animate-fade-in text-slate-800 dark:text-slate-100">
                    <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-6xl h-full sm:h-[90vh] flex flex-col border border-slate-200/60 dark:border-slate-700/60 overflow-hidden">
                        {/* Header */}
                        <div className="p-4 sm:p-6 border-b border-slate-200/60 dark:border-slate-700/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800/50">
                            <div>
                                <h3 className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">{selectedActionCattle.tagNumber}</h3>
                                <p className="text-slate-500 dark:text-slate-400 font-medium mt-1 flex items-center gap-2 text-sm sm:text-base">
                                    <span className="bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">{selectedActionCattle.breed}</span>
                                    <span>•</span>
                                    <span className="capitalize">{selectedActionCattle.gender}</span>
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                                <button
                                    onClick={handleSendEmailReport}
                                    disabled={sendingEmail}
                                    className="flex-1 sm:flex-none justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 sm:px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-sm active:scale-95 disabled:opacity-50 text-sm"
                                >
                                    {sendingEmail ? <Loader2 className="animate-spin" size={16} /> : <Mail size={16} className="text-emerald-500" />}
                                    Email
                                </button>
                                <button
                                    onClick={() => handlePrintIndividualReport(selectedActionCattle)}
                                    className="flex-1 sm:flex-none justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 sm:px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-sm active:scale-95 text-sm"
                                >
                                    <FileDown size={16} className="text-emerald-500" /> PDF
                                </button>
                                <button
                                    onClick={() => handlePrintIndividualReport(selectedActionCattle)}
                                    className="flex-1 sm:flex-none justify-center bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white border border-transparent px-4 sm:px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 text-sm"
                                >
                                    <Printer size={16} /> <span className="hidden sm:inline">Print Report</span><span className="sm:hidden">Print</span>
                                </button>
                                <button onClick={closeActionModal} className="p-2.5 bg-white dark:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><X size={20} /></button>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="px-4 sm:px-6 border-b border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 flex gap-4 sm:gap-6 overflow-x-auto no-scrollbar">
                            {/* Explicit Breeding Tab */}
                            {(() => {
                                const genderUpper = selectedActionCattle.gender?.toString().toUpperCase();
                                // Show for all females regardless of type to prevent missing tab
                                const isFemale = ['FEMALE', 'COW', 'HEIFER', 'DAM', 'DOE', 'EWE'].some(g => genderUpper?.includes(g));

                                if (isFemale) {
                                    return (
                                        <button
                                            key="breeding"
                                            type="button"
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReportTab('breeding'); }}
                                            className={`py-3 sm:py-4 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${reportTab === 'breeding' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300'}`}
                                        >
                                            <Activity size={14} className="sm:w-4 sm:h-4" /> Breeding & Lactation
                                        </button>
                                    );
                                }
                                return null;
                            })()}

                            {(['weight', 'medical', 'alerts', 'financial', 'info', 'pedigree', 'gallery', 'documents', 'notes'] as const).map(tab => {
                                if ((tab === 'financial') && !canSeeFinancials) return null;
                                const icons: any = { weight: Scale, medical: Activity, alerts: Bell, financial: TrendingUp, info: Info, pedigree: GitBranch, gallery: Images, documents: FileText, notes: MessageSquare };
                                const Icon = icons[tab] || Circle;
                                return (
                                    <button key={tab} type="button" onClick={(e) => { e.stopPropagation(); setReportTab(tab); }} className={`py-3 sm:py-4 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${reportTab === tab ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300'}`}>
                                        <Icon size={14} className="sm:w-4 sm:h-4" /> {tabLabels[tab]}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-white dark:bg-slate-900/50 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600">
                            {reportTab === 'weight' && (
                                <div className="space-y-4 sm:space-y-6 animate-fade-in">
                                    <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                                            <div>
                                                <h4 className="font-bold text-slate-800 dark:text-slate-100 text-lg flex items-center gap-2">
                                                    <div className="bg-emerald-100 dark:bg-emerald-900/30 p-1.5 rounded-lg text-emerald-600 dark:text-emerald-400">
                                                        <TrendingUp size={18} />
                                                    </div>
                                                    Growth Trajectory
                                                </h4>
                                                <div className="text-sm mt-1 ml-9">
                                                    <span className="text-slate-500 dark:text-slate-400">Current Weight:</span> <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xl ml-1">{selectedActionCattle.currentWeight} kg</span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={handleGeneratePrediction}
                                                disabled={loadingPrediction}
                                                className="w-full sm:w-auto justify-center bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all border border-emerald-100 dark:border-emerald-800/50 disabled:opacity-50 active:scale-95"
                                            >
                                                {loadingPrediction ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                                                AI Growth Forecast
                                            </button>
                                        </div>

                                        {predictionResult && (
                                            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800/50 rounded-2xl p-5 mb-8 animate-fade-in">
                                                <h5 className="font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-2 mb-3 text-sm uppercase tracking-wider">
                                                    <Sparkles size={14} /> Gemini Prediction
                                                </h5>
                                                <div className="prose prose-sm prose-indigo dark:prose-invert max-w-none text-slate-700 dark:text-slate-300">
                                                    <ReactMarkdown>{predictionResult}</ReactMarkdown>
                                                </div>
                                            </div>
                                        )}

                                        <div className="h-64 sm:h-80 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={selectedActionCattle.weightHistory}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#334155' : '#e2e8f0'} vertical={false} />
                                                    <XAxis
                                                        dataKey="date"
                                                        stroke={isDarkMode ? '#94a3b8' : '#64748b'}
                                                        fontSize={12}
                                                        tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                        tickLine={false}
                                                        axisLine={false}
                                                        dy={10}
                                                    />
                                                    <YAxis
                                                        stroke={isDarkMode ? '#94a3b8' : '#64748b'}
                                                        fontSize={12}
                                                        domain={['auto', 'auto']}
                                                        tickLine={false}
                                                        axisLine={false}
                                                        dx={-10}
                                                    />
                                                    <Tooltip
                                                        contentStyle={{
                                                            backgroundColor: isDarkMode ? '#1e293b' : '#fff',
                                                            borderColor: isDarkMode ? '#334155' : '#e2e8f0',
                                                            color: isDarkMode ? '#f1f5f9' : '#1e293b',
                                                            borderRadius: '12px',
                                                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                                                        }}
                                                    />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="weight"
                                                        stroke="#10b981"
                                                        strokeWidth={3}
                                                        dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
                                                        activeDot={{ r: 6, strokeWidth: 0 }}
                                                    />
                                                    {pregnancyPoint && (
                                                        <ReferenceDot
                                                            x={pregnancyPoint.date}
                                                            y={pregnancyPoint.weight}
                                                            r={6}
                                                            fill="#8b5cf6"
                                                            stroke="white"
                                                            strokeWidth={2}
                                                        >
                                                            <Label
                                                                value="Pregnancy Confirmed"
                                                                position="top"
                                                                offset={10}
                                                                className="fill-purple-600 dark:fill-purple-400 text-xs font-bold"
                                                            />
                                                        </ReferenceDot>
                                                    )}
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-3">
                                            <h4 className="font-bold text-slate-800 dark:text-slate-100 text-lg flex items-center gap-2">
                                                <div className="bg-white dark:bg-slate-700 p-1.5 rounded-lg text-slate-600 dark:text-slate-300">
                                                    <List size={18} />
                                                </div>
                                                Weight Log
                                            </h4>
                                            {(() => {
                                                const avgGain = calculateAvgDailyGain(selectedActionCattle.weightHistory);
                                                return avgGain ? (
                                                    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-4 py-2 rounded-xl text-sm w-full sm:w-auto text-center sm:text-left">
                                                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">Avg Daily Gain: </span>
                                                        <span className={`font-bold ml-1 ${parseFloat(avgGain) >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'}`}>{avgGain} kg/day</span>
                                                    </div>
                                                ) : null;
                                            })()}
                                        </div>
                                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                                            <table className="w-full text-sm text-left whitespace-nowrap">
                                                <thead className="bg-white dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-700">
                                                    <tr>
                                                        <th className="p-3 sm:p-4">Date</th>
                                                        <th className="p-3 sm:p-4">Weight</th>
                                                        <th className="p-3 sm:p-4 hidden sm:table-cell">Gain</th>
                                                        {canEdit && <th className="p-3 sm:p-4 text-right">Actions</th>}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 bg-white dark:bg-slate-800">
                                                    {[...selectedActionCattle.weightHistory].reverse().map((r, displayIndex, arr) => {
                                                        const originalIndex = selectedActionCattle.weightHistory.length - 1 - displayIndex;
                                                        const prev = arr[displayIndex + 1];
                                                        const gain = prev ? r.weight - prev.weight : 0;
                                                        const isEditing = editingWeightIndex === originalIndex;
                                                        return (
                                                            <tr key={displayIndex} className="hover:bg-white dark:hover:bg-slate-700/30 transition-colors">
                                                                <td className="p-3 sm:p-4 text-slate-800 dark:text-slate-200 font-medium">
                                                                    {isEditing ? (
                                                                        <input type="date" value={editWeightForm.date} onChange={e => setEditWeightForm({ ...editWeightForm, date: e.target.value })} className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm w-32 sm:w-36 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none" />
                                                                    ) : new Date(r.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                                                </td>
                                                                <td className="p-3 sm:p-4 font-bold text-slate-800 dark:text-slate-100">
                                                                    {isEditing ? (
                                                                        <input type="number" step="0.1" value={editWeightForm.weight} onChange={e => setEditWeightForm({ ...editWeightForm, weight: e.target.value })} className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm w-20 sm:w-24 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none" />
                                                                    ) : `${r.weight} kg`}
                                                                </td>
                                                                <td className="p-3 sm:p-4 hidden sm:table-cell">
                                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${gain > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : gain < 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                                                                        {prev ? (gain > 0 ? `+${gain.toFixed(1)}` : gain.toFixed(1)) : '-'}
                                                                    </span>
                                                                </td>
                                                                {canEdit && (
                                                                    <td className="p-3 sm:p-4 text-right">
                                                                        {isEditing ? (
                                                                            <div className="flex justify-end gap-2">
                                                                                <button onClick={saveEditWeight} className="p-2 bg-emerald-100 text-emerald-600 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 rounded-lg transition-colors" title="Save">
                                                                                    <Check size={16} />
                                                                                </button>
                                                                                <button onClick={cancelEditWeight} className="p-2 bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600 rounded-lg transition-colors" title="Cancel">
                                                                                    <X size={16} />
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex justify-end gap-2">
                                                                                <button onClick={() => startEditWeight(originalIndex, r.weight, r.date)} className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Edit"><Pencil size={16} /></button>
                                                                                <button onClick={() => deleteWeightEntry(originalIndex)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Delete"><Trash2 size={16} /></button>
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                )}
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Other tabs content remains same logic just render */}
                            {reportTab === 'medical' && (
                                <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 animate-fade-in">
                                    <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3 mb-6 text-lg">
                                        <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-xl text-emerald-600 dark:text-indigo-400">
                                            <ShieldCheck size={20} />
                                        </div>
                                        Health & Vaccination History
                                    </h4>
                                    {selectedActionCattle.vaccinationHistory.length === 0 ? (
                                        <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-100 dark:border-slate-700 rounded-xl">
                                            <Syringe size={48} className="mx-auto mb-2 opacity-20" />
                                            <p>No vaccination or health records found.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {selectedActionCattle.vaccinationHistory.map(v => {
                                                const isMedicine = v.type === 'MEDICINE' || v.type === 'MEDICAL_RECORD';
                                                const recordType = isMedicine ? 'Treatment' : 'Vaccine';
                                                const isScheduled = v.status === 'SCHEDULED';
                                                const providerName = v.provider === 'DOCTOR' ? "Doctor's Visit" : "From Stock";

                                                return (
                                                    <div key={v.id} className={`flex gap-3 sm:gap-4 p-4 sm:p-5 border ${isScheduled ? 'border-amber-200 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-900/10' : 'border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800'} rounded-xl hover:bg-white dark:hover:bg-slate-700/30 transition-all shadow-sm relative overflow-hidden group`}>
                                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${isScheduled ? 'bg-amber-400' : isMedicine ? 'bg-rose-500' : 'bg-indigo-500'} rounded-l-xl`}></div>
                                                        <div className={`${isScheduled ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' : isMedicine ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400' : 'bg-indigo-50 dark:bg-indigo-900/20 text-emerald-600 dark:text-indigo-400'} p-2 sm:p-3 rounded-xl h-fit`}>
                                                            {isScheduled ? <Clock size={18} className="sm:w-5 sm:h-5" /> : isMedicine ? <Pill size={18} className="sm:w-5 sm:h-5" /> : <CheckCircle2 size={18} className="sm:w-5 sm:h-5" />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                                                                <div className="flex flex-col">
                                                                    <p className="font-bold text-slate-800 dark:text-slate-100 text-base sm:text-lg truncate w-full flex items-center gap-2">
                                                                        {v.vaccineName}
                                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${isMedicine ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'}`}>
                                                                            {recordType}
                                                                        </span>
                                                                        {v.provider && (
                                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                                                                {providerName}
                                                                            </span>
                                                                        )}
                                                                        {isScheduled && (
                                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                                                                Scheduled
                                                                            </span>
                                                                        )}
                                                                    </p>
                                                                </div>
                                                                <div className="flex items-center gap-3">
                                                                    <span className="text-xs font-medium bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-1 rounded-lg whitespace-nowrap">
                                                                        {new Date(v.date).toLocaleDateString()}
                                                                    </span>
                                                                    {isScheduled && (
                                                                        <button onClick={() => handleMarkVaccineCompleted(v.id)} className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-lg transition-colors shadow-sm active:scale-95">
                                                                            Mark Completed
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {v.batchNumber && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1"><span className="opacity-70">Batch:</span> {v.batchNumber}</p>}
                                                            {v.nextBoosterDate && <p className="text-sm text-amber-600 dark:text-amber-400 mt-1 font-semibold flex items-center gap-1"><Clock size={14} /> Next Booster Due: {new Date(v.nextBoosterDate).toLocaleDateString()}</p>}
                                                            {v.notes && <p className="text-sm text-slate-600 dark:text-slate-300 mt-3 bg-white dark:bg-slate-700/30 p-3 rounded-lg border border-slate-100 dark:border-slate-700 italic">{v.notes}</p>}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {reportTab === 'alerts' && (
                                <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 animate-fade-in">
                                    <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3 mb-6 text-lg">
                                        <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-xl text-amber-600 dark:text-amber-400">
                                            <Bell size={20} />
                                        </div>
                                        Alerts & Reminders
                                    </h4>
                                    <div className="space-y-4">
                                        {(() => {
                                            const alerts = [];
                                            
                                            // Weight Alert
                                            if (selectedActionCattle.weightHistory && selectedActionCattle.weightHistory.length > 0) {
                                                const lastWeightDate = new Date(selectedActionCattle.weightHistory[selectedActionCattle.weightHistory.length - 1].date);
                                                const daysSinceWeighing = Math.floor((new Date().getTime() - lastWeightDate.getTime()) / (1000 * 3600 * 24));
                                                if (daysSinceWeighing > 14) {
                                                    alerts.push({ type: 'warning', title: 'Weight Update Overdue', desc: `It has been ${daysSinceWeighing} days since the last recorded weight.` });
                                                }
                                            } else {
                                                alerts.push({ type: 'warning', title: 'No Weight Recorded', desc: 'Please record an initial weight for tracking growth.' });
                                            }

                                            // Calving Alert
                                            if (selectedActionCattle.isPregnant && selectedActionCattle.expectedCalvingDate) {
                                                const calvingDays = Math.floor((new Date(selectedActionCattle.expectedCalvingDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                                                if (calvingDays >= 0 && calvingDays <= 30) {
                                                    alerts.push({ type: 'info', title: 'Upcoming Calving', desc: `Expected to calve in approximately ${calvingDays} days.` });
                                                }
                                            }

                                            if (alerts.length === 0) {
                                                return (
                                                    <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-100 dark:border-slate-700 rounded-xl">
                                                        <ShieldCheck size={48} className="mx-auto mb-2 opacity-20 text-emerald-500" />
                                                        <p>No active alerts. Everything looks good!</p>
                                                    </div>
                                                );
                                            }

                                            return alerts.map((alert, idx) => (
                                                <div key={idx} className={`flex gap-3 sm:gap-4 p-4 sm:p-5 border rounded-xl shadow-sm relative overflow-hidden group ${
                                                    alert.type === 'warning' ? 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800' : 'bg-purple-50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-800'
                                                }`}>
                                                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${alert.type === 'warning' ? 'bg-orange-500' : 'bg-purple-500'} rounded-l-xl`}></div>
                                                    <div className={`${alert.type === 'warning' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'} p-2 sm:p-3 rounded-xl h-fit`}>
                                                        <Bell size={18} className="sm:w-5 sm:h-5" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h5 className={`font-bold text-base ${alert.type === 'warning' ? 'text-orange-800 dark:text-orange-200' : 'text-purple-800 dark:text-purple-200'}`}>{alert.title}</h5>
                                                        <p className={`text-sm mt-1 ${alert.type === 'warning' ? 'text-orange-700 dark:text-orange-300' : 'text-purple-700 dark:text-purple-300'}`}>{alert.desc}</p>
                                                    </div>
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                </div>
                            )}


                            {reportTab === 'financial' && canSeeFinancials && (
                                <div className="space-y-4 sm:space-y-6 animate-fade-in">
                                    {(() => {
                                        const fin = calculateCattleFinancials(selectedActionCattle, tenant, feedPackages, feed);
                                        const { purchaseCost, feedCost, medicalCost, totalCost, currentValue, netProfit, roiPercent, daysOnFarm, feedBreakdown } = fin;

                                        // Append Today's estimated feed cost to the historical timeline
                                        const extendedTimeline = [...(feedTimeline || [])];
                                        const todayStr = new Date().toISOString().split('T')[0];
                                        if (!extendedTimeline.some(t => t.date.startsWith(todayStr))) {
                                            extendedTimeline.push({
                                                date: new Date().toISOString(),
                                                dailyCost: fin.dailyFeedCost || 0
                                            });
                                        }

                                        return (
                                            <div className="space-y-4 sm:space-y-6">
                                                {/* Summary Cards */}
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                                                    <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-2xl shadow-md border border-slate-100 dark:border-slate-700">
                                                        <h4 className="text-xs sm:text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Total Investment</h4>
                                                        <p className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100">Rs. {Math.round(totalCost || 0).toLocaleString()}</p>
                                                        <p className="text-xs text-slate-400 mt-1">Purchase + Feed + Medical</p>
                                                    </div>
                                                    <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-2xl shadow-md border border-slate-100 dark:border-slate-700">
                                                        <h4 className="text-xs sm:text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Current Value</h4>
                                                        <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-blue-400">Rs. {Math.round(currentValue || 0).toLocaleString()}</p>
                                                        <p className="text-xs text-slate-400 mt-1">{selectedActionCattle.currentWeight} kg @ {tenant.herdValueRate || 1100}/kg</p>
                                                    </div>
                                                    <div className={`p-4 sm:p-6 rounded-2xl shadow-md border ${netProfit >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-800'}`}>
                                                        <h4 className={`text-xs sm:text-sm font-bold uppercase tracking-wider mb-2 ${netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>Net Profit / Loss</h4>
                                                        <p className={`text-2xl sm:text-3xl font-black ${netProfit >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                                                            {netProfit >= 0 ? '+' : ''}Rs. {Math.round(netProfit || 0).toLocaleString()}
                                                        </p>
                                                        <p className={`text-sm font-bold mt-1 ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                            {isFinite(roiPercent) ? roiPercent.toFixed(1) : 0}% ROI
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Visual Breakdown */}
                                                <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                                                    <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3 mb-6 text-lg">
                                                        <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-xl text-emerald-600 dark:text-indigo-400">
                                                            <BarChart3 size={20} />
                                                        </div>
                                                        Cost Breakdown
                                                    </h4>

                                                    <div className="space-y-4 mb-8">
                                                        {/* Purchase */}
                                                        <div>
                                                            <div className="flex justify-between text-sm font-medium mb-1">
                                                                <span className="text-slate-600 dark:text-slate-300">Purchase Price</span>
                                                                <span className="text-slate-800 dark:text-slate-100">Rs. {Math.round(purchaseCost).toLocaleString()}</span>
                                                            </div>
                                                            <div className="w-full bg-white dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                                                                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${totalCost > 0 ? Math.min(100, (purchaseCost / totalCost) * 100) : 0}%` }}></div>
                                                            </div>
                                                        </div>

                                                        {/* Feed */}
                                                        <div>
                                                            <div className="flex justify-between text-sm font-medium mb-1">
                                                                <span className="text-slate-600 dark:text-slate-300">Estimated Feed Cost ({daysOnFarm} days)</span>
                                                                <span className="text-slate-800 dark:text-slate-100">Rs. {Math.round(feedCost).toLocaleString()}</span>
                                                            </div>
                                                            <div className="w-full bg-white dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                                                                <div className="bg-amber-500 h-full rounded-full" style={{ width: `${totalCost > 0 ? Math.min(100, (feedCost / totalCost) * 100) : 0}%` }}></div>
                                                            </div>
                                                            <div className="flex justify-between items-center mt-1">
                                                                <p className="text-xs text-slate-400">Avg ~Rs. {Math.round(feedCost / (daysOnFarm || 1))} / day</p>
                                                                <span className="text-xs font-bold text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-md border border-amber-100 dark:border-amber-800/50">Current Rate: Rs. {Math.round(fin.dailyFeedCost || 0)} / day</span>
                                                            </div>
                                                        </div>

                                                        {/* Medical */}
                                                        <div>
                                                            <div className="flex justify-between text-sm font-medium mb-1">
                                                                <span className="text-slate-600 dark:text-slate-300">Medical & Other Expenses</span>
                                                                <span className="text-slate-800 dark:text-slate-100">Rs. {Math.round(medicalCost).toLocaleString()}</span>
                                                            </div>
                                                            <div className="w-full bg-white dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                                                                <div className="bg-red-500 h-full rounded-full" style={{ width: `${totalCost > 0 ? Math.min(100, (medicalCost / totalCost) * 100) : 0}%` }}></div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Daily Feed Bill Itemized */}
                                                    {feedBreakdown && feedBreakdown.length > 0 && (
                                                        <div className="mt-6 border-t border-slate-100 dark:border-slate-700 pt-6">
                                                            <h5 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                                                                <Receipt size={16} /> Daily Feed Bill (Current)
                                                            </h5>
                                                            <div className="bg-white dark:bg-slate-900/50 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                                                                <table className="w-full text-sm">
                                                                    <thead className="bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold text-xs uppercase">
                                                                        <tr>
                                                                            <th className="px-4 py-3 text-left">Item</th>
                                                                            <th className="px-4 py-3 text-right">Qty</th>
                                                                            <th className="px-4 py-3 text-right">Rate</th>
                                                                            <th className="px-4 py-3 text-right">Cost</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                                                        {feedBreakdown.map((item, idx) => (
                                                                            <tr key={idx} className="hover:bg-white dark:hover:bg-slate-800 transition-colors">
                                                                                <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">
                                                                                    {item.name}
                                                                                    {(item.type === 'ROUGHAGE' || item.type === 'CONCENTRATE_FIXED') && <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md">Fixed</span>}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                                                                                    {item.quantity.toFixed(2)} <span className="text-xs opacity-70">{item.unit}</span>
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                                                                                    Rs. {Math.round(item.costPerKg)}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right font-bold text-slate-800 dark:text-slate-100">
                                                                                    Rs. {Math.round(item.dailyCost)}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                        <tr className="bg-white dark:bg-slate-800 font-bold border-t-2 border-slate-200 dark:border-slate-600">
                                                                            <td className="px-4 py-3 text-slate-800 dark:text-slate-100">Total</td>
                                                                            <td className="px-4 py-3"></td>
                                                                            <td className="px-4 py-3"></td>
                                                                            <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">
                                                                                Rs. {Math.round(fin.dailyFeedCost).toLocaleString()} <span className="text-xs font-normal text-slate-500">/ day</span>
                                                                            </td>
                                                                        </tr>
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Feed Cost Timeline Chart */}
                                                    <div className="mt-6 border-t border-slate-100 dark:border-slate-700 pt-6">
                                                        <div className="flex justify-between items-center mb-4">
                                                            <h5 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                                                <TrendingUp size={16} className="text-emerald-500" /> Daily Feed Cost Timeline
                                                            </h5>
                                                        </div>
                                                        <div className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4 relative min-h-[250px] flex items-center justify-center">
                                                            {loadingFeedTimeline ? (
                                                                <div className="flex flex-col items-center justify-center text-slate-500 gap-2">
                                                                    <Loader2 size={24} className="animate-spin text-emerald-500" />
                                                                    <span className="text-sm">Loading historical data...</span>
                                                                </div>
                                                            ) : extendedTimeline && extendedTimeline.length > 0 ? (
                                                                // Valid Timeline Data exists
                                                                <div className="w-full h-[220px]">
                                                                    <ResponsiveContainer width="100%" height="100%">
                                                                        <AreaChart data={extendedTimeline} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                                                                            <defs>
                                                                                <linearGradient id="colorDailyCost" x1="0" y1="0" x2="0" y2="1">
                                                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                                                </linearGradient>
                                                                            </defs>
                                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                                                                            <XAxis
                                                                                dataKey="date"
                                                                                stroke={isDarkMode ? '#94a3b8' : '#64748b'}
                                                                                fontSize={12}
                                                                                tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                                                tickLine={false}
                                                                                axisLine={false}
                                                                                dy={10}
                                                                            />
                                                                            <YAxis
                                                                                stroke={isDarkMode ? '#94a3b8' : '#64748b'}
                                                                                fontSize={12}
                                                                                tickLine={false}
                                                                                axisLine={false}
                                                                                tickFormatter={(val) => `Rs ${val}`}
                                                                            />
                                                                            <Tooltip
                                                                                contentStyle={{ backgroundColor: isDarkMode ? '#1e293b' : '#ffffff', borderColor: isDarkMode ? '#334155' : '#e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                                                labelStyle={{ color: isDarkMode ? '#cbd5e1' : '#475569', fontWeight: 'bold', marginBottom: '4px' }}
                                                                                itemStyle={{ color: '#3b82f6', fontWeight: 'bold' }}
                                                                                formatter={(value: any) => [`Rs. ${value}`, 'Daily Cost']}
                                                                                labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                                                            />
                                                                            <Area
                                                                                type="stepAfter"
                                                                                dataKey="dailyCost"
                                                                                stroke="#3b82f6"
                                                                                strokeWidth={2}
                                                                                fillOpacity={1}
                                                                                fill="url(#colorDailyCost)"
                                                                            />
                                                                        </AreaChart>
                                                                    </ResponsiveContainer>
                                                                </div>
                                                            ) : (
                                                                // No Logs Yet
                                                                <div className="flex flex-col items-center justify-center text-slate-500 py-8">
                                                                    <div className="bg-slate-200 dark:bg-slate-800 p-3 rounded-full mb-3 opacity-50">
                                                                        <TrendingUp size={24} />
                                                                    </div>
                                                                    <p className="font-medium">No Historical Cost Data</p>
                                                                    <p className="text-xs text-center max-w-xs mt-1 opacity-70">
                                                                        Historical snapshots will appear here over time automatically as feed prices or plans are changed.
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}


                            {reportTab === 'breeding' && (
                                <div className="space-y-4 sm:space-y-6 animate-fade-in">
                                    {(() => {
                                        const typeUpper = selectedActionCattle.type?.toString().toUpperCase();
                                        const genderUpper = selectedActionCattle.gender?.toString().toUpperCase();
                                        const isBreedable = ['COW', 'BUFFALO', 'HEIFER', 'GOAT', 'SHEEP', 'CAMEL'].includes(typeUpper);
                                        const isFemale = ['FEMALE', 'COW', 'HEIFER'].includes(genderUpper);

                                        if (isBreedable && isFemale) {
                                            return (
                                                <>
                                                    {/* Status Cards */}
                                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-4">
                                                        <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-600 to-purple-600 dark:from-pink-400 dark:to-purple-400 flex items-center gap-2">
                                                            <Activity size={24} className="text-pink-500" />
                                                            Reproduction Overview
                                                        </h3>
                                                        <button
                                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowBreedingModal(true); }}
                                                            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                                                        >
                                                            <Plus size={16} /> Record Event
                                                        </button>
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                                                        <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 relative overflow-hidden">
                                                            <div className="absolute top-0 right-0 p-4 opacity-5">
                                                                <Activity size={100} />
                                                            </div>
                                                            <h4 className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100 mb-4 text-lg">
                                                                <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg text-purple-600 dark:text-purple-400">
                                                                    <Activity size={18} />
                                                                </div>
                                                                Lactation Status
                                                            </h4>
                                                            {activeLactation ? (
                                                                <div className="flex justify-between items-start relative z-10">
                                                                    <div>
                                                                        <span className="inline-flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
                                                                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                                                            Active
                                                                        </span>
                                                                        <p className="text-sm mt-2 text-slate-600 dark:text-slate-300">Started: <span className="font-semibold text-slate-800 dark:text-slate-100">{new Date(activeLactation.start_date).toLocaleDateString()}</span></p>
                                                                        <p className="text-3xl font-bold mt-2 text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-indigo-600">Lactation #{activeLactation.lactation_number}</p>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => setShowEndLactationModal(true)}
                                                                        className="text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-600 transition-colors font-medium shadow-sm"
                                                                    >
                                                                        End Lactation
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="text-center py-6 text-slate-400 relative z-10">
                                                                    <p>No active lactation</p>
                                                                    <p className="text-xs opacity-70">(Dry or Heifer)</p>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 relative overflow-hidden">
                                                            <div className="absolute top-0 right-0 p-4 opacity-5">
                                                                <TrendingUp size={100} />
                                                            </div>
                                                            <h4 className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100 mb-4 text-lg">
                                                                <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg text-emerald-600 dark:text-blue-400">
                                                                    <TrendingUp size={18} />
                                                                </div>
                                                                {activeLactation ? "Daily Milk Log" : "Milk History"}
                                                            </h4>
                                                            {activeLactation && (
                                                                <div className="flex flex-col sm:flex-row gap-4 items-end relative z-10">
                                                                    <div className="flex-1 w-full">
                                                                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block uppercase">Morn (L)</label>
                                                                        <input type="number" step="0.1" className="w-full p-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700/50 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-bold" value={milkForm.morning} onChange={e => setMilkForm({ ...milkForm, morning: e.target.value })} placeholder="0.0" />
                                                                    </div>
                                                                    <div className="flex-1 w-full">
                                                                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block uppercase">Eve (L)</label>
                                                                        <input type="number" step="0.1" className="w-full p-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700/50 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-bold" value={milkForm.evening} onChange={e => setMilkForm({ ...milkForm, evening: e.target.value })} placeholder="0.0" />
                                                                    </div>
                                                                    <button type="button" onClick={async (e) => {
                                                                        e.preventDefault();
                                                                        try {
                                                                            const token = localStorage.getItem('farmxpert_token');
                                                                            const res = await fetch('/api/breeding/milk-logs', {
                                                                                method: 'POST',
                                                                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenant.id },
                                                                                body: JSON.stringify({
                                                                                    ...milkForm,
                                                                                    animalId: selectedActionCattle.id,
                                                                                    logDate: new Date().toISOString()
                                                                                })
                                                                            });
                                                                            if (res.ok) {
                                                                                // Refresh logs
                                                                                fetch(`/api/breeding/milk-logs/${selectedActionCattle.id}`, { headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenant.id } })
                                                                                    .then(r => r.json()).then(data => setMilkLogs(data));
                                                                                setMilkForm({ ...milkForm, morning: '', evening: '' });
                                                                                alert('Milk log saved!');
                                                                            }
                                                                        } catch (err) { alert('Failed to save'); }
                                                                    }} className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all mb-[1px]">Save</button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Milk History Chart/Table */}
                                                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
                                                        <div className="bg-white dark:bg-slate-800/80 px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 backdrop-blur-sm">
                                                            <List size={18} /> Recent Production
                                                        </div>
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-sm text-left whitespace-nowrap">
                                                                <thead className="bg-white dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">
                                                                    <tr>
                                                                        <th className="px-4 sm:px-6 py-3">Date</th>
                                                                        <th className="px-4 sm:px-6 py-3">Morning</th>
                                                                        <th className="px-4 sm:px-6 py-3">Evening</th>
                                                                        <th className="px-4 sm:px-6 py-3">Total</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                                                    {(Array.isArray(milkLogs) ? milkLogs : []).slice(0, 5).map((log, idx) => (
                                                                        <tr key={log.id} className="hover:bg-white dark:hover:bg-slate-700/30 transition-colors">
                                                                            <td className="px-4 sm:px-6 py-3 text-slate-800 dark:text-slate-200 font-medium">{new Date(log.log_date).toLocaleDateString()}</td>
                                                                            <td className="px-6 py-3 text-slate-600 dark:text-slate-400">{log.morning_yield} L</td>
                                                                            <td className="px-6 py-3 text-slate-600 dark:text-slate-400">{log.evening_yield} L</td>
                                                                            <td className="px-6 py-3 font-bold text-slate-800 dark:text-slate-100">{log.total_yield} L</td>
                                                                        </tr>
                                                                    ))}
                                                                    {milkLogs.length === 0 && <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400 italic">No milk logs recorded yet</td></tr>}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </>
                                            );
                                        } else {
                                            return (
                                                <div className="text-center py-12 text-slate-400 bg-white dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                                                    <Activity size={48} className="mx-auto mb-2 opacity-20" />
                                                    <p>Breeding & Lactation features are not applicable for this animal type.</p>
                                                </div>
                                            );
                                        }
                                    })()}
                                </div >
                            )}

                            {reportTab === 'info' && (
                                <div className="space-y-4 sm:space-y-6 animate-fade-in">
                                    <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                                        <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3 mb-6 text-lg">
                                            <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-xl text-emerald-600 dark:text-blue-400">
                                                <Info size={20} />
                                            </div>
                                            Animal Details
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                                            {/* General Info Card */}
                                            <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-5 border border-slate-100 dark:border-slate-700/50 shadow-sm">
                                                <h5 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-5 tracking-wider flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500"></span> General Info
                                                </h5>
                                                <div className="space-y-4">
                                                    <div className="flex justify-between items-center py-2.5 border-b border-slate-200/60 dark:border-slate-700/60">
                                                        <span className="text-slate-600 dark:text-slate-400 text-sm flex items-center gap-2">
                                                            <Dna size={16} className="text-slate-400" /> Breed
                                                        </span>
                                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedActionCattle.breed}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center py-2.5 border-b border-slate-200/60 dark:border-slate-700/60">
                                                        <span className="text-slate-600 dark:text-slate-400 text-sm flex items-center gap-2">
                                                            <Baby size={16} className="text-slate-400" /> Gender
                                                        </span>
                                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedActionCattle.gender}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center py-2.5 border-b border-slate-200/60 dark:border-slate-700/60">
                                                        <span className="text-slate-600 dark:text-slate-400 text-sm flex items-center gap-2">
                                                            <List size={16} className="text-slate-400" /> Teeth
                                                        </span>
                                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedActionCattle.teeth}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center py-2.5 border-b border-slate-200/60 dark:border-slate-700/60">
                                                        <span className="text-slate-600 dark:text-slate-400 text-sm flex items-center gap-2">
                                                            <Tag size={16} className="text-slate-400" /> Color
                                                        </span>
                                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedActionCattle.color}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Arrival Info Card */}
                                            <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-5 border border-slate-100 dark:border-slate-700/50 shadow-sm">
                                                <h5 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-5 tracking-wider flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-400 dark:bg-emerald-500"></span> Arrival Info
                                                </h5>
                                                <div className="space-y-4">
                                                    <div className="flex justify-between items-center py-2.5 border-b border-slate-200/60 dark:border-slate-700/60">
                                                        <span className="text-slate-600 dark:text-slate-400 text-sm flex items-center gap-2">
                                                            {selectedActionCattle.arrivalType === ArrivalType.BORN ? <GitBranch size={16} className="text-purple-500" /> : <Package size={16} className="text-emerald-500" />}
                                                            Type
                                                        </span>
                                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedActionCattle.arrivalType}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center py-2.5 border-b border-slate-200/60 dark:border-slate-700/60">
                                                        <span className="text-slate-600 dark:text-slate-400 text-sm flex items-center gap-2">
                                                            <Calendar size={16} className="text-slate-400" /> Date
                                                        </span>
                                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{new Date(selectedActionCattle.entryDate).toLocaleDateString()}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center py-2.5 border-b border-slate-200/60 dark:border-slate-700/60">
                                                        <span className="text-slate-600 dark:text-slate-400 text-sm flex items-center gap-2">
                                                            <Scale size={16} className="text-slate-400" /> Initial Weight
                                                        </span>
                                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedActionCattle.entryWeight} kg</span>
                                                    </div>

                                                    {canSeeFinancials && (
                                                        <div className="flex justify-between items-center py-2.5 border-b border-slate-200/60 dark:border-slate-700/60">
                                                            <span className="text-slate-600 dark:text-slate-400 text-sm flex items-center gap-2">
                                                                <DollarSign size={16} className="text-emerald-500" /> Purchase Cost
                                                            </span>
                                                            <span className="font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1 rounded-lg">
                                                                Rs. {Number(selectedActionCattle.purchasePrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Pedigree & Relations Card */}
                                        <div className="mt-8 bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-5 border border-slate-100 dark:border-slate-700/50 shadow-sm">
                                            <h5 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-5 tracking-wider flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-purple-400 dark:bg-purple-500"></span> Pedigree & Relations
                                            </h5>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                                <div className="flex flex-col gap-2">
                                                    <span className="text-slate-600 dark:text-slate-400 text-sm flex items-center gap-2">
                                                        <GitBranch size={16} className="text-slate-400" /> Sire (Father)
                                                    </span>
                                                    {selectedActionCattle.fatherTag ? (
                                                        <button type="button" onClick={() => {
                                                            const sire = cattle.find(c => c.tagNumber === selectedActionCattle.fatherTag);
                                                            if (sire) setSelectedActionCattle(sire);
                                                        }} className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer w-fit text-left">{selectedActionCattle.fatherTag}</button>
                                                    ) : (
                                                        <span className="font-semibold text-slate-800 dark:text-slate-200">Unknown / N/A</span>
                                                    )}
                                                </div>
                                                <div className="flex flex-col gap-2 border-t sm:border-t-0 sm:border-l border-slate-200/60 dark:border-slate-700/60 pt-4 sm:pt-0 sm:pl-6">
                                                    <span className="text-slate-600 dark:text-slate-400 text-sm flex items-center gap-2">
                                                        <GitBranch size={16} className="text-slate-400" /> Dam (Mother)
                                                    </span>
                                                    {selectedActionCattle.motherTag ? (
                                                        <button type="button" onClick={() => {
                                                            const dam = cattle.find(c => c.tagNumber === selectedActionCattle.motherTag);
                                                            if (dam) setSelectedActionCattle(dam);
                                                        }} className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer w-fit text-left">{selectedActionCattle.motherTag}</button>
                                                    ) : (
                                                        <span className="font-semibold text-slate-800 dark:text-slate-200">Unknown / N/A</span>
                                                    )}
                                                </div>
                                                <div className="flex flex-col gap-2 border-t sm:border-t-0 sm:border-l border-slate-200/60 dark:border-slate-700/60 pt-4 sm:pt-0 sm:pl-6">
                                                    <span className="text-slate-600 dark:text-slate-400 text-sm flex items-center gap-2">
                                                        <Baby size={16} className="text-slate-400" /> Calves / Offspring
                                                    </span>
                                                    {(() => {
                                                        const calves = cattle.filter(c => c.motherTag === selectedActionCattle.tagNumber || c.fatherTag === selectedActionCattle.tagNumber || c.parentTag === selectedActionCattle.tagNumber);
                                                        if (calves.length === 0) {
                                                            return <span className="font-semibold text-slate-800 dark:text-slate-200">No recorded calves</span>;
                                                        }
                                                        return (
                                                            <div className="flex gap-2 flex-wrap">
                                                                {calves.map(calf => (
                                                                    <button type="button" key={calf.id} onClick={() => setSelectedActionCattle(calf)} className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/50 cursor-pointer transition-colors border border-emerald-200 dark:border-emerald-800/50">
                                                                        {calf.tagNumber} {calf.name ? `(${calf.name})` : ''}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-8">
                                            {/* Owner Details Card */}
                                            <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-5 border border-slate-100 dark:border-slate-700/50 shadow-sm">
                                                <h5 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-5 tracking-wider flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-indigo-400 dark:bg-indigo-500"></span> Owner Details
                                                </h5>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                                    <div className="flex justify-between items-center py-2.5 border-b border-slate-200/60 dark:border-slate-700/60">
                                                        <span className="text-slate-600 dark:text-slate-400 text-sm flex items-center gap-2">
                                                            <User size={16} className="text-slate-400" /> Name
                                                        </span>
                                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedActionCattle.ownerName || '-'}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center py-2.5 border-b border-slate-200/60 dark:border-slate-700/60">
                                                        <span className="text-slate-600 dark:text-slate-400 text-sm flex items-center gap-2">
                                                            <Phone size={16} className="text-slate-400" /> Mobile
                                                        </span>
                                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedActionCattle.ownerMobile || '-'}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center py-2.5 border-b border-slate-200/60 dark:border-slate-700/60">
                                                        <span className="text-slate-600 dark:text-slate-400 text-sm flex items-center gap-2">
                                                            <Mail size={16} className="text-slate-400" /> Email
                                                        </span>
                                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedActionCattle.ownerEmail || '-'}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center py-2.5 border-b border-slate-200/60 dark:border-slate-700/60">
                                                        <span className="text-slate-600 dark:text-slate-400 text-sm flex items-center gap-2">
                                                            <MapPin size={16} className="text-slate-400" /> Address
                                                        </span>
                                                        <span className="font-semibold text-slate-800 dark:text-slate-200 text-right max-w-xs">{selectedActionCattle.ownerAddress || '-'}</span>
                                                    </div>
                                                    {tenant?.branches && tenant.branches.length > 0 && (
                                                        <div className="flex justify-between items-center py-2.5 border-b border-slate-200/60 dark:border-slate-700/60 col-span-1 md:col-span-2">
                                                            <span className="text-slate-600 dark:text-slate-400 text-sm flex items-center gap-2">
                                                                <GitBranch size={16} className="text-slate-400" /> Farm Branch / Location
                                                            </span>
                                                            <select
                                                                value={selectedActionCattle.branch || 'Main Farm'}
                                                                onChange={async (e) => {
                                                                    const val = e.target.value;
                                                                    setSelectedActionCattle({ ...selectedActionCattle, branch: val === 'Main Farm' ? '' : val });
                                                                    try {
                                                                        await api.cattle.update(tenant.id, selectedActionCattle.id, { branch: val === 'Main Farm' ? '' : val });
                                                                        onRefresh?.();
                                                                    } catch(err) {
                                                                        console.error(err);
                                                                    }
                                                                }}
                                                                className="border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 font-medium"
                                                            >
                                                                <option value="Main Farm">Main Farm</option>
                                                                {tenant.branches.map(b => <option key={b} value={b}>{b}</option>)}
                                                            </select>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-6 pt-6 sm:mt-8 border-t border-slate-100 dark:border-slate-700">
                                            <h5 className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase mb-4 flex items-center gap-2">
                                                <TrendingUp size={16} /> Growth Targets
                                            </h5>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-purple-50/50 dark:bg-purple-900/10 p-4 sm:p-5 rounded-xl border border-purple-100 dark:border-purple-800/30">
                                                <div>
                                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Target Weight (kg)</label>
                                                    <div className="relative">
                                                        <input
                                                            type="number"
                                                            value={selectedActionCattle.targetWeight || ''}
                                                            onChange={async (e) => {
                                                                const newTarget = e.target.value ? parseFloat(e.target.value) : 0;
                                                                setSelectedActionCattle({ ...selectedActionCattle, targetWeight: newTarget });
                                                                try {
                                                                    await api.cattle.update(tenant.id, selectedActionCattle.id, { targetWeight: newTarget });
                                                                    onRefresh?.();
                                                                } catch (err) {
                                                                    console.error('Failed to update target weight:', err);
                                                                }
                                                            }}
                                                            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm transition-all"
                                                            placeholder="Enter target weight"
                                                        />
                                                        <div className="absolute right-4 top-3 text-slate-400 text-sm font-medium">kg</div>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Target Daily Gain (kg/day)</label>
                                                    <div className="relative">
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            value={selectedActionCattle.dailyTargetGain || ''}
                                                            onChange={async (e) => {
                                                                const newGain = e.target.value ? parseFloat(e.target.value) : 0;
                                                                setSelectedActionCattle({ ...selectedActionCattle, dailyTargetGain: newGain });
                                                                try {
                                                                    await api.cattle.update(tenant.id, selectedActionCattle.id, { dailyTargetGain: newGain });
                                                                    onRefresh?.();
                                                                } catch (err) {
                                                                    console.error('Failed to update daily gain:', err);
                                                                }
                                                            }}
                                                            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm transition-all"
                                                            placeholder="Enter daily gain"
                                                        />
                                                        <div className="absolute right-4 top-3 text-slate-400 text-sm font-medium">kg/day</div>
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-3 flex items-center gap-1">
                                                <Info size={12} /> Changes are saved automatically as you type
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {reportTab === 'gallery' && (
                                <div className="space-y-8 animate-fade-in">
                                    {uploadToast && (
                                        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${uploadToast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                                            }`}>
                                            {uploadToast.type === 'success' ? (
                                                <ShieldCheck size={18} />
                                            ) : (
                                                <AlertTriangle size={18} />
                                            )}
                                            <span className="font-medium">{uploadToast.message}</span>
                                        </div>
                                    )}
                                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                                        <div className="flex justify-between items-center mb-6">
                                            <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3 text-lg">
                                                <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-xl text-emerald-600 dark:text-emerald-400">
                                                    <Images size={20} />
                                                </div>
                                                Photo Gallery
                                            </h4>
                                            <div className="flex gap-2">
                                                <input
                                                    type="file"
                                                    ref={galleryInputRef}
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={async (e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                            if (file.size > 2 * 1024 * 1024) {
                                                                alert('Photo must be less than 2MB');
                                                                return;
                                                            }
                                                            const currentPhotos = selectedActionCattle.photos || [];
                                                            if (currentPhotos.length >= 10) {
                                                                alert('Maximum 10 photos allowed per animal');
                                                                return;
                                                            }
                                                            setUploadingPhoto(true);
                                                            setUploadProgress(0);
                                                            const reader = new FileReader();
                                                            reader.onprogress = (event) => {
                                                                if (event.lengthComputable) {
                                                                    setUploadProgress(Math.round((event.loaded / event.total) * 50));
                                                                }
                                                            };
                                                            reader.onloadend = async () => {
                                                                setUploadProgress(60);
                                                                const newPhoto: CattlePhoto = {
                                                                    id: Date.now().toString(),
                                                                    url: reader.result as string,
                                                                    caption: '',
                                                                    uploadedAt: new Date().toISOString()
                                                                };
                                                                try {
                                                                    setUploadProgress(80);
                                                                    await api.cattle.update(tenant.id, selectedActionCattle.id, {
                                                                        photos: [...currentPhotos, newPhoto]
                                                                    });
                                                                    setUploadProgress(100);
                                                                    setUploadToast({ type: 'success', message: 'Photo uploaded successfully!' });
                                                                    setTimeout(() => setUploadToast(null), 3000);
                                                                    onRefresh?.();
                                                                } catch (err) {
                                                                    console.error('Failed to add photo:', err);
                                                                    setUploadToast({ type: 'error', message: 'Failed to upload photo' });
                                                                    setTimeout(() => setUploadToast(null), 3000);
                                                                } finally {
                                                                    setUploadingPhoto(false);
                                                                    setUploadProgress(0);
                                                                }
                                                            };
                                                            reader.readAsDataURL(file);
                                                        }
                                                    }}
                                                />
                                                <button
                                                    onClick={() => galleryInputRef.current?.click()}
                                                    disabled={uploadingPhoto}
                                                    className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:from-slate-400 disabled:to-slate-500 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-all hover:shadow-md"
                                                >
                                                    {uploadingPhoto ? (
                                                        <>
                                                            <Loader2 size={18} className="animate-spin" /> Uploading {uploadProgress}%
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Plus size={18} /> Add Photo
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                                            {(selectedActionCattle.photos || []).map((photo, idx) => (
                                                <div key={photo.id} className="relative group rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-700">
                                                    <img
                                                        src={photo.url}
                                                        alt={photo.caption || `Photo ${idx + 1}`}
                                                        className="w-full h-40 object-cover transform group-hover:scale-110 transition-transform duration-500"
                                                    />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]">
                                                        <button
                                                            onClick={async () => {
                                                                if (confirm('Delete this photo?')) {
                                                                    const updatedPhotos = (selectedActionCattle.photos || []).filter(p => p.id !== photo.id);
                                                                    try {
                                                                        await api.cattle.update(tenant.id, selectedActionCattle.id, { photos: updatedPhotos });
                                                                        onRefresh?.();
                                                                    } catch (err) {
                                                                        console.error('Failed to delete photo:', err);
                                                                    }
                                                                }
                                                            }}
                                                            className="p-2 bg-red-500/90 hover:bg-emerald-600 text-white rounded-lg shadow-lg transform hover:scale-110 transition-all"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                    {photo.caption && (
                                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm title py-1 px-2">
                                                            <p className="text-xs text-white truncate">{photo.caption}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            {(!selectedActionCattle.photos || selectedActionCattle.photos.length === 0) && (
                                                <div className="col-span-full text-center py-16 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-800/50">
                                                    <ImageIcon size={48} className="mx-auto mb-3 opacity-30" />
                                                    <p className="font-medium text-slate-500 dark:text-slate-400">No photos uploaded yet</p>
                                                    <p className="text-sm mt-1 mb-4">Upload up to 10 photos (max 2MB each)</p>
                                                    <button
                                                        onClick={() => galleryInputRef.current?.click()}
                                                        className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline text-sm"
                                                    >
                                                        Browse Files
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                                        <div className="flex justify-between items-center mb-6">
                                            <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3 text-lg">
                                                <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-xl text-red-600 dark:text-red-400">
                                                    <Youtube size={20} />
                                                </div>
                                                YouTube Videos
                                            </h4>
                                            <button
                                                onClick={() => setShowAddVideoModal(true)}
                                                className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-all hover:shadow-md"
                                            >
                                                <Plus size={18} /> Add Video Link
                                            </button>
                                        </div>
                                        <div className="space-y-4">
                                            {(selectedActionCattle.videos || []).map((video) => (
                                                <div key={video.id} className="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow group">
                                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                                        <div className="w-12 h-12 bg-red-50 dark:bg-red-900/10 rounded-xl flex items-center justify-center border border-red-100 dark:border-red-900/30 group-hover:bg-red-100 dark:group-hover:bg-red-900/30 transition-colors">
                                                            <Video size={24} className="text-red-500" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-bold text-slate-800 dark:text-slate-100 truncate text-base">{video.title || 'Untitled Video'}</p>
                                                            <p className="text-sm text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                                                                {video.youtubeUrl}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 ml-4">
                                                        <a
                                                            href={video.youtubeUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="p-2.5 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg transition-colors"
                                                            title="Watch Video"
                                                        >
                                                            <ExternalLink size={18} />
                                                        </a>
                                                        <button
                                                            onClick={async () => {
                                                                if (confirm('Remove this video?')) {
                                                                    const updatedVideos = (selectedActionCattle.videos || []).filter(v => v.id !== video.id);
                                                                    try {
                                                                        await api.cattle.update(tenant.id, selectedActionCattle.id, { videos: updatedVideos });
                                                                        onRefresh?.();
                                                                    } catch (err) {
                                                                        console.error('Failed to remove video:', err);
                                                                    }
                                                                }
                                                            }}
                                                            className="p-2.5 text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                                                            title="Remove"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {(!selectedActionCattle.videos || selectedActionCattle.videos.length === 0) && (
                                                <div className="text-center py-16 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-800/50">
                                                    <Video size={48} className="mx-auto mb-3 opacity-30" />
                                                    <p className="font-medium text-slate-500 dark:text-slate-400">No videos linked yet</p>
                                                    <p className="text-sm mt-1">Add YouTube video URLs to showcase this animal</p>
                                                </div>
                                            )}
                                        </div>

                                        {showAddVideoModal && (
                                            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm p-4">
                                                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 ring-1 ring-slate-900/5">
                                                    <div className="p-6 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center bg-white dark:bg-slate-800/50">
                                                        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                                            <Youtube className="text-red-500" size={20} /> Add YouTube Video
                                                        </h3>
                                                        <button
                                                            onClick={() => { setShowAddVideoModal(false); setNewVideoUrl(''); setNewVideoTitle(''); }}
                                                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                                        >
                                                            <X size={20} />
                                                        </button>
                                                    </div>
                                                    <div className="p-6 space-y-5">
                                                        <div>
                                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Video Title</label>
                                                            <input
                                                                type="text"
                                                                value={newVideoTitle}
                                                                onChange={(e) => setNewVideoTitle(e.target.value)}
                                                                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-700/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all shadow-sm"
                                                                placeholder="e.g., Weight Update - Week 4"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">YouTube URL</label>
                                                            <input
                                                                type="url"
                                                                value={newVideoUrl}
                                                                onChange={(e) => setNewVideoUrl(e.target.value)}
                                                                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-700/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all shadow-sm"
                                                                placeholder="https://youtube.com/watch?v=..."
                                                            />
                                                        </div>

                                                        <div className="pt-2 flex justify-end gap-3">
                                                            <button
                                                                onClick={() => { setShowAddVideoModal(false); setNewVideoUrl(''); setNewVideoTitle(''); }}
                                                                className="px-5 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl font-medium transition-colors"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                onClick={async () => {
                                                                    if (!newVideoUrl.includes('youtube.com') && !newVideoUrl.includes('youtu.be')) {
                                                                        alert('Please enter a valid YouTube URL');
                                                                        return;
                                                                    }
                                                                    const newVideo: CattleVideo = {
                                                                        id: Date.now().toString(),
                                                                        youtubeUrl: newVideoUrl,
                                                                        title: newVideoTitle,
                                                                        addedAt: new Date().toISOString()
                                                                    };
                                                                    const currentVideos = selectedActionCattle.videos || [];
                                                                    try {
                                                                        await api.cattle.update(tenant.id, selectedActionCattle.id, {
                                                                            videos: [...currentVideos, newVideo]
                                                                        });
                                                                        onRefresh?.();
                                                                        setShowAddVideoModal(false);
                                                                        setNewVideoUrl('');
                                                                        setNewVideoTitle('');
                                                                    } catch (err) {
                                                                        console.error('Failed to add video:', err);
                                                                        alert('Failed to add video');
                                                                    }
                                                                }}
                                                                className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-red-500/30 transition-all"
                                                            >
                                                                Add Video
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {reportTab === 'documents' && (
                                <div className="space-y-8 animate-fade-in">
                                    {uploadToast && (
                                        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${uploadToast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                                            }`}>
                                            {uploadToast.type === 'success' ? (
                                                <ShieldCheck size={18} />
                                            ) : (
                                                <AlertTriangle size={18} />
                                            )}
                                            <span className="font-medium">{uploadToast.message}</span>
                                        </div>
                                    )}
                                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                                        <div className="flex justify-between items-center mb-6">
                                            <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3 text-lg">
                                                <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-xl text-emerald-600 dark:text-blue-400">
                                                    <FileText size={20} />
                                                </div>
                                                Documents
                                            </h4>
                                            <div>
                                                <input
                                                    type="file"
                                                    ref={docInputRef}
                                                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                                    className="hidden"
                                                    onChange={async (e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                            if (file.size > 5 * 1024 * 1024) {
                                                                alert('Document must be less than 5MB');
                                                                return;
                                                            }
                                                            const currentDocs = selectedActionCattle.documents || [];
                                                            if (currentDocs.length >= 20) {
                                                                alert('Maximum 20 documents allowed per animal');
                                                                return;
                                                            }
                                                            setUploadingDoc(true);
                                                            setUploadProgress(0);
                                                            const reader = new FileReader();
                                                            reader.onprogress = (event) => {
                                                                if (event.lengthComputable) {
                                                                    setUploadProgress(Math.round((event.loaded / event.total) * 50));
                                                                }
                                                            };
                                                            reader.onloadend = async () => {
                                                                setUploadProgress(60);
                                                                const newDoc: CattleDocument = {
                                                                    id: Date.now().toString(),
                                                                    name: file.name,
                                                                    type: 'other',
                                                                    url: reader.result as string,
                                                                    uploadedAt: new Date().toISOString()
                                                                };
                                                                try {
                                                                    setUploadProgress(80);
                                                                    await api.cattle.update(tenant.id, selectedActionCattle.id, {
                                                                        documents: [...currentDocs, newDoc]
                                                                    });
                                                                    setUploadProgress(100);
                                                                    setUploadToast({ type: 'success', message: 'Document uploaded successfully!' });
                                                                    setTimeout(() => setUploadToast(null), 3000);
                                                                    onRefresh?.();
                                                                } catch (err) {
                                                                    console.error('Failed to add document:', err);
                                                                    setUploadToast({ type: 'error', message: 'Failed to upload document' });
                                                                    setTimeout(() => setUploadToast(null), 3000);
                                                                } finally {
                                                                    setUploadingDoc(false);
                                                                    setUploadProgress(0);
                                                                }
                                                            };
                                                            reader.readAsDataURL(file);
                                                        }
                                                    }}
                                                />
                                                <button
                                                    onClick={() => docInputRef.current?.click()}
                                                    disabled={uploadingDoc}
                                                    className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:from-slate-400 disabled:to-slate-500 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-all hover:shadow-md"
                                                >
                                                    {uploadingDoc ? (
                                                        <>
                                                            <Loader2 size={18} className="animate-spin" /> Uploading {uploadProgress}%
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Upload size={18} /> Upload Document
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="bg-emerald-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 mb-6 flex items-start gap-3">
                                            <Info className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                                            <p className="text-sm text-blue-800 dark:text-blue-200">
                                                Upload receipts, health certificates, vaccination cards, and other important documents (PDF, images, Word - max 5MB each).
                                            </p>
                                        </div>

                                        <div className="space-y-3">
                                            {(selectedActionCattle.documents || []).map((doc) => (
                                                <div key={doc.id} className="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow group">
                                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-colors ${doc.name.endsWith('.pdf') ? 'bg-red-50 dark:bg-red-900/10 text-red-500 border-red-100 dark:border-red-900/30 group-hover:bg-red-100 dark:group-hover:bg-red-900/30' :
                                                            doc.name.match(/\.(jpg|jpeg|png)$/i) ? 'bg-green-50 dark:bg-green-900/10 text-green-500 border-green-100 dark:border-green-900/30 group-hover:bg-green-100 dark:group-hover:bg-green-900/30' :
                                                                'bg-emerald-50 dark:bg-blue-900/10 text-emerald-500 border-blue-100 dark:border-blue-900/30 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30'
                                                            }`}>
                                                            <FileText size={24} />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-bold text-slate-800 dark:text-slate-100 truncate text-base">{doc.name}</p>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                                                    {doc.type.replace('_', ' ')}
                                                                </span>
                                                                <span className="text-xs text-slate-400">
                                                                    • Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 ml-4">
                                                        <a
                                                            href={doc.url}
                                                            download={doc.name}
                                                            className="p-2.5 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg transition-colors"
                                                            title="Download"
                                                        >
                                                            <Download size={18} />
                                                        </a>
                                                        <button
                                                            onClick={async () => {
                                                                if (confirm('Delete this document?')) {
                                                                    const updatedDocs = (selectedActionCattle.documents || []).filter(d => d.id !== doc.id);
                                                                    try {
                                                                        await api.cattle.update(tenant.id, selectedActionCattle.id, { documents: updatedDocs });
                                                                        onRefresh?.();
                                                                    } catch (err) {
                                                                        console.error('Failed to delete document:', err);
                                                                    }
                                                                }
                                                            }}
                                                            className="p-2.5 text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {(!selectedActionCattle.documents || selectedActionCattle.documents.length === 0) && (
                                                <div className="text-center py-16 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-800/50">
                                                    <FileText size={48} className="mx-auto mb-3 opacity-30" />
                                                    <p className="font-medium text-slate-500 dark:text-slate-400">No documents uploaded yet</p>
                                                    <p className="text-sm mt-1 mb-4">Upload purchase receipts, health certificates, and other records</p>
                                                    <button
                                                        onClick={() => docInputRef.current?.click()}
                                                        className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline text-sm"
                                                    >
                                                        Browse Files
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {reportTab === 'notes' && (
                                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 animate-fade-in h-[500px] flex flex-col">
                                    <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3 mb-6 text-lg">
                                        <div className="bg-orange-100 dark:bg-orange-900/30 p-2 rounded-xl text-orange-600 dark:text-orange-400">
                                            <Edit3 size={20} />
                                        </div>
                                        Notes & Observations
                                    </h4>
                                    <div className="flex-1 bg-white dark:bg-slate-700/30 p-6 rounded-xl border border-slate-200 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 whitespace-pre-wrap text-base leading-relaxed overflow-y-auto font-mono">
                                        {selectedActionCattle.notes || <span className="text-slate-400 italic">No notes recorded for this animal.</span>}
                                    </div>
                                </div>
                            )}

                            {reportTab === 'pedigree' && (
                                <div className="animate-fade-in h-full flex flex-col">
                                    <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3 mb-6 text-lg px-2">
                                        <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-xl text-purple-600 dark:text-purple-400">
                                            <GitBranch size={20} />
                                        </div>
                                        Pedigree Tree
                                    </h4>
                                    <div className="flex-1 min-h-0 bg-white dark:bg-slate-800 p-2 sm:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
                                       <div className="flex-1 min-h-0 overflow-auto">
                                            <PedigreeTree 
                                                cattle={cattle} 
                                                mainAnimal={selectedActionCattle} 
                                                tenant={tenant}
                                                onSelectAnimal={(animal) => {
                                                    setSelectedActionCattle(animal);
                                                }}
                                            />
                                       </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-900/50">
                            <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
                                <Upload size={24} className="text-indigo-500" />
                                Bulk Import Cattle
                            </h3>
                            <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1"><X size={24} /></button>
                        </div>
                        <div className="p-6 space-y-6">

                            <div className="bg-emerald-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded-r-lg">
                                <p className="text-sm text-blue-800 dark:text-blue-300 font-medium mb-2">
                                    Step 1: Download Template
                                </p>
                                <p className="text-xs text-emerald-600 dark:text-blue-400 mb-3">
                                    Use our perfectly formatted CSV template. Do not change the header names. Fill your data exactly matching the allowed text formats.
                                </p>
                                <button
                                    onClick={handleDownloadTemplate}
                                    className="bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 px-4 py-2 text-sm rounded-lg font-medium hover:bg-emerald-100 dark:hover:bg-emerald-800/50 transition-colors shadow-sm flex items-center gap-2"
                                >
                                    <Download size={16} /> Download Template
                                </button>
                            </div>

                            <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 p-4 rounded-xl">
                                <p className="text-sm text-slate-700 dark:text-slate-300 font-medium mb-3">
                                    Step 2: Upload Filled Template
                                </p>
                                <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 text-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                    <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleFileUpload} />
                                    <div className="flex justify-center mb-3">
                                        <div className="bg-indigo-100 dark:bg-indigo-900/40 p-3 rounded-full text-indigo-500 group-hover:scale-110 transition-transform">
                                            <Upload size={24} />
                                        </div>
                                    </div>
                                    {isImporting ? (
                                        <div className="text-sm text-slate-500 font-medium animate-pulse">Processing CSV data, please wait...</div>
                                    ) : (
                                        <>
                                            <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">Click to select CSV file</p>
                                            <p className="text-xs text-slate-500">Only .csv files are supported</p>
                                        </>
                                    )}
                                </div>
                            </div>

                            {importStats && (
                                <div className={`p-4 rounded-xl border ${importStats.failed === 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'}`}>
                                    <h4 className={`font-bold text-sm mb-2 ${importStats.failed === 0 ? 'text-emerald-800 dark:text-emerald-400' : 'text-orange-800 dark:text-orange-400'}`}>Import Complete</h4>
                                    <div className="grid grid-cols-4 gap-2 text-center text-xs font-medium">
                                        <div className="bg-white dark:bg-slate-900/50 p-2 rounded-lg">
                                            <span className="block text-slate-500">Total Rows</span>
                                            <span className="text-lg text-slate-800 dark:text-slate-200">{importStats.total}</span>
                                        </div>
                                        <div className="bg-white dark:bg-slate-900/50 p-2 rounded-lg">
                                            <span className="block text-emerald-600 dark:text-emerald-500">Succeeded</span>
                                            <span className="text-lg text-emerald-700 dark:text-emerald-400">{importStats.success}</span>
                                        </div>
                                        <div className="bg-white dark:bg-slate-900/50 p-2 rounded-lg">
                                            <span className="block text-amber-500 dark:text-amber-400">Duplicate</span>
                                            <span className="text-lg text-amber-600 dark:text-amber-400">{importStats.duplicate}</span>
                                        </div>
                                        <div className="bg-white dark:bg-slate-900/50 p-2 rounded-lg">
                                            <span className="block text-red-500 dark:text-red-400">Failed</span>
                                            <span className="text-lg text-red-600 dark:text-red-400">{importStats.failed}</span>
                                        </div>
                                    </div>
                                    {importStats.failed > 0 && (
                                        <p className="text-xs text-orange-600 mt-2 font-medium">Some rows failed. Check if Tag numbers were unique and dates were valid.</p>
                                    )}
                                </div>
                            )}

                        </div>
                        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 flex justify-end">
                            <button
                                onClick={() => { setShowImportModal(false); setImportStats(null); }}
                                className="px-5 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showBreedingModal && selectedActionCattle && (
                <AddBreedingEventModal
                    tenantId={tenant.id}
                    onClose={() => setShowBreedingModal(false)}
                    initialData={undefined}
                    preSelectedAnimalId={selectedActionCattle.id}
                    onSuccess={() => {
                        // Refresh breeding data with slight delay to ensure DB propagation
                        setTimeout(() => {
                            const token = localStorage.getItem('farmxpert_token');
                            if (token) {
                                console.log("Refreshing lactation data...");
                                fetch(`/api/breeding/lactations/${selectedActionCattle.id}/active`, { headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenant.id } })
                                    .then(r => r.json())
                                    .then(data => {
                                        console.log("Active Lactation Data:", data);
                                        if (data && !data.error) setActiveLactation(data);
                                        else setActiveLactation(null);
                                    })
                                    .catch(err => { console.error("Lactation fetch error:", err); setActiveLactation(null); });

                                fetch(`/api/breeding/milk-logs/${selectedActionCattle.id}`, { headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenant.id } })
                                    .then(r => r.json())
                                    .then(data => {
                                        if (Array.isArray(data)) setMilkLogs(data);
                                        else setMilkLogs([]);
                                    })
                                    .catch(() => setMilkLogs([]));
                            }
                        }, 500);
                    }}
                />
            )}
            {showEndLactationModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 ring-1 ring-slate-900/5">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center bg-white dark:bg-slate-800/50">
                            <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                <PauseCircle className="text-purple-600 dark:text-purple-400" size={20} /> End Lactation
                            </h3>
                            <button onClick={() => setShowEndLactationModal(false)}><X size={20} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" /></button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">End Date</label>
                                <input
                                    type="date"
                                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-700/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all shadow-sm"
                                    value={endLactationForm.endDate}
                                    onChange={e => setEndLactationForm({ ...endLactationForm, endDate: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Reason (Optional)</label>
                                <textarea
                                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-700/50 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all shadow-sm placeholder-slate-400"
                                    placeholder="e.g. Dry Off, Sold, etc."
                                    rows={3}
                                    value={endLactationForm.reason}
                                    onChange={e => setEndLactationForm({ ...endLactationForm, reason: e.target.value })}
                                />
                            </div>
                            <button
                                onClick={handleEndLactation}
                                className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/30 transition-all mt-2"
                            >
                                Confirm End Lactation
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Actions FAB */}
            {selectedCattleIds.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/90 dark:bg-slate-800/90 backdrop-blur-md text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-5 fade-in duration-300 border border-slate-700/50">
                    <div className="flex items-center gap-2 font-medium">
                        <span className="bg-emerald-600 px-2.5 py-1 rounded-full text-sm">{selectedCattleIds.length}</span>
                        <span className="text-slate-300">Selected</span>
                    </div>
                    <div className="w-px h-6 bg-slate-700"></div>
                    <div className="flex items-center gap-3">
                        <button onClick={() => setShowBulkActionModal('status')} className="text-sm font-semibold hover:text-emerald-400 transition-colors flex items-center gap-2">
                            <Activity size={16} /> Status
                        </button>
                        <button onClick={() => setShowBulkActionModal('package')} className="text-sm font-semibold hover:text-emerald-400 transition-colors flex items-center gap-2">
                            <Package size={16} /> Feed Plan
                        </button>
                        <button onClick={() => setShowBulkActionModal('delete')} className="text-sm font-semibold text-red-400 hover:text-red-300 transition-colors flex items-center gap-2 ml-2">
                            <Trash2 size={16} /> Delete
                        </button>
                    </div>
                    <div className="w-px h-6 bg-slate-700 ml-2"></div>
                    <button onClick={() => setSelectedCattleIds([])} className="p-1 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white ml-2">
                        <X size={18} />
                    </button>
                </div>
            )}

            {/* Bulk Action Modals */}
            {showBulkActionModal === 'status' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 ring-1 ring-slate-900/5">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center bg-white dark:bg-slate-800/50">
                            <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                <Activity className="text-emerald-600 dark:text-blue-400" size={20} /> Update Status
                            </h3>
                            <button onClick={() => setShowBulkActionModal(null)}><X size={20} className="text-slate-400 hover:text-slate-600" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-slate-500">Updating status for {selectedCattleIds.length} animals.</p>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">New Status</label>
                                <select
                                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-700/50 text-slate-800 dark:text-slate-100"
                                    value={bulkStatusForm}
                                    onChange={(e) => setBulkStatusForm(e.target.value as CattleStatus)}
                                >
                                    {Object.values(CattleStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <button
                                onClick={handleBulkActionSubmit}
                                disabled={isBulkProcessing}
                                className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-xl font-bold shadow-lg disabled:opacity-50 mt-4"
                            >
                                {isBulkProcessing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Confirm Update'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showBulkActionModal === 'package' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 ring-1 ring-slate-900/5">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center bg-white dark:bg-slate-800/50">
                            <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                <Package className="text-emerald-600 dark:text-indigo-400" size={20} /> Assign Feed Plan
                            </h3>
                            <button onClick={() => setShowBulkActionModal(null)}><X size={20} className="text-slate-400 hover:text-slate-600" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-slate-500">Assigning feed plan to {selectedCattleIds.length} animals.</p>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Feed Plan</label>
                                <select
                                    className="w-full border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-700/50 text-slate-800 dark:text-slate-100"
                                    value={bulkPackageForm.packageId}
                                    onChange={(e) => {
                                        setBulkPackageForm({
                                            packageId: e.target.value,
                                            monthlyCharges: '0'
                                        });
                                    }}
                                >
                                    <option value="">No Plan (Unassigned)</option>
                                    {feedPackages.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                            <button
                                onClick={handleBulkActionSubmit}
                                disabled={isBulkProcessing}
                                className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-xl font-bold shadow-lg disabled:opacity-50 mt-4"
                            >
                                {isBulkProcessing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Confirm Assignment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showBulkActionModal === 'delete' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 ring-1 ring-slate-900/5 border border-red-200 dark:border-red-900/50">
                        <div className="p-6 border-b border-red-100 dark:border-red-900/30 flex justify-between items-center bg-red-50/50 dark:bg-red-900/20">
                            <h3 className="font-bold text-lg text-red-700 dark:text-red-400 flex items-center gap-2">
                                <AlertTriangle className="text-red-600 dark:text-red-400" size={20} /> Delete Multiple
                            </h3>
                            <button onClick={() => setShowBulkActionModal(null)}><X size={20} className="text-red-400 hover:text-red-600" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-slate-700 dark:text-slate-300 font-medium">Are you sure you want to delete {selectedCattleIds.length} animals?</p>
                            <p className="text-sm text-red-600 dark:text-red-400 font-bold">This action cannot be undone. All related records will be permanently removed.</p>
                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setShowBulkActionModal(null)}
                                    className="flex-1 py-2.5 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl font-bold transition-colors"
                                    disabled={isBulkProcessing}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleBulkActionSubmit}
                                    disabled={isBulkProcessing}
                                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-colors flex items-center justify-center disabled:opacity-50"
                                >
                                    {isBulkProcessing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Delete All'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
