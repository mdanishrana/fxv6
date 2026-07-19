
export enum CattleStatus {
  ACTIVE = 'Active',
  SICK = 'Sick',
  SOLD = 'Sold',
  QUARANTINE = 'Quarantine',
  BOOKED_QURBANI = 'Booked (Qurbani)',
  READY_FOR_SALE = 'Ready for Sale',
  QUARANTINED = 'Quarantined',
  DEAD = 'Dead',
  DECEASED = 'Deceased'
}

export enum AnimalType {
  // Cattle
  COW = 'Cow',
  BULL = 'Bull',
  HEIFER = 'Heifer',
  MALE_CALF = 'Male Calf',
  FEMALE_CALF = 'Female Calf',
  // Goats
  BUCK = 'Buck',
  DOE = 'Doe',
  MALE_KID = 'Male Kid',
  FEMALE_KID = 'Female Kid',
  // Sheep
  RAM = 'Ram',
  EWE = 'Ewe',
  MALE_LAMB = 'Male Lamb',
  FEMALE_LAMB = 'Female Lamb',
  // Legacy values - kept so already-registered animals keep displaying/filtering
  // correctly. No longer offered in the registration form; superseded by the
  // gendered types above.
  GOAT = 'Goat',
  CALF = 'Calf',
  KID = 'Kid'
}

export enum Breed {
  SAHIWAL = 'Sahiwal',
  CHOLISTANI = 'Cholistani',
  DHANNI = 'Dhanni',
  RED_SINDHI = 'Red Sindhi',
  FRIESIAN_CROSS = 'Friesian Cross',
  BRAHMAN_CROSS = 'Brahman Cross',
  NON_DESCRIPT = 'Desi (Non-Descript)',

  // Goat Breeds
  BALTISTANI = 'Baltistani',
  BARBARI = 'Barbari',
  BEETAL = 'Beetal',
  BEZOAR = 'Bezoar',
  BUGRI = 'Bugri',
  CHAPPAR = 'Chappar',
  DAMANI = 'Damani',
  DERA_DIN_PANAH = 'Dera Din Panah',
  GADDI = 'Gaddi',
  JATTAN = 'Jattan',
  KACHI = 'Kachi',
  KAGHANI = 'Kaghani',
  KAIL = 'Kail',
  KAMORI = 'Kamori',
  KHURASAN = 'Khurasan',
  LEHRI = 'Lehri',
  LOHRI = 'Lohri',
  NACHNI = 'Nachni',
  PAHARI = 'Pahari',
  PATERI = 'Pateri',
  POTOHARI = 'Potohari',
  TAPRI = 'Tapri',
  TEDDY = 'Teddy',
  THARI = 'Thari',
  VATANI = 'Vatani'
}

export enum Gender {
  MALE = 'Male', // Bachra/Bull
  FEMALE = 'Female' // Bachri/Cow
}

export enum ArrivalType {
  PURCHASED = 'Mandi Purchase',
  BORN = 'Born at Farm',
  TRANSFER = 'Transfer'
}

// Removed hardcoded MonthlyPackage enum in favor of dynamic strings
export type FeatureModule = 'CORE' | 'AI_ADVISOR' | 'FEED_OPTIMIZER' | 'QURBANI_TRACKING' | 'FINANCE' | 'SUPPLIER_MANAGEMENT' | 'LABOUR_MANAGEMENT' | 'BREEDING_MANAGEMENT' | 'FINANCE_MANAGER';

export type UserRole = 'OWNER' | 'MANAGER' | 'LABOR' | 'SAAS_ADMIN' | 'ANIMAL_OWNER' | 'READ_ONLY';

export interface SMTPSettings {
  host: string; // e.g. smtp.office365.com
  port: number; // 587
  username: string;
  password?: string; // Optional in frontend state for security visual
  enabled: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  tenantId: string;
  role: UserRole;
}

export interface Tenant {
  id: string;
  name: string; // Farm Name
  branches?: string[]; // Multiple farm locations/branches
  ownerName: string;
  ownerEmail?: string; // For alerts
  whatsappNumber?: string; // CallMeBot Whatsapp Notification
  whatsappApiKey?: string; // CallMeBot API Key
  managerEmail?: string; // For alerts
  tier: 'BASIC' | 'STANDARD' | 'PREMIUM';
  modules: FeatureModule[];
  locale: string; // e.g., 'en-PK'
  currency: string; // 'PKR'
  currentUserRole?: UserRole; // Simulated current user role for the session
  smtpSettings?: SMTPSettings;
  users: User[]; // List of registered users for this farm
  status?: 'ACTIVE' | 'SUSPENDED'; // SaaS status
  joinedDate?: string;
  herdValueRate?: number; // Per kg rate for herd value calculation (default: 1100 PKR)
  logoUrl?: string;
  weightUnit?: string;
  legacyTagScheme?: boolean; // true = keep old per-type client-guessed tag numbering; false = new global sequential PREFIX+4-digit scheme
  createdAt?: string; // tenant registration timestamp (SaaS admin monitoring)
  registrationIp?: string | null; // client IP at signup (SaaS admin monitoring)
  registrationUserAgent?: string | null; // browser/device at signup (SaaS admin monitoring)
}

// --- Domain Types ---

export interface WeightRecord {
  date: string;
  weight: number;
}

export interface VaccinationRecord {
  id: string;
  date: string;
  vaccineName: string; // e.g., FMD, LSD or Medicine Name
  batchNumber?: string;
  notes?: string;
  medicalItemId?: string;
  type?: 'VACCINE' | 'MEDICINE' | 'MEDICAL_RECORD';
  provider?: 'STOCK' | 'DOCTOR';
  status?: 'COMPLETED' | 'SCHEDULED';
  nextBoosterDate?: string;
}

export type MedicalType = 'VACCINE' | 'MEDICINE';
export type MedicalStatus = 'ACTIVE' | 'EXPIRED' | 'DEPLETED';

export interface MedicalItem {
  id: string;
  tenantId: string;
  type: MedicalType;
  name: string;
  targetAnimal?: 'Cow' | 'Goat' | 'Both';
  batchNumber?: string;
  manufacturer?: string;
  quantity: number;
  unit: string; // e.g., 'doses', 'ml', 'pills'
  costPerUnit: number;
  expiryDate?: string;
  status: MedicalStatus;
  notes?: string;
}

export type TransactionType = 'PURCHASE' | 'SALE' | 'EXPENSE' | 'MEDICAL';

export interface Transaction {
  id: string;
  date: string;
  type: TransactionType;
  amount: number; // Positive for Revenue, Negative (or tracked as cost) for Expense
  description: string;
  partyName?: string;
  partyMobile?: string;
}

export interface QurbaniDetails {
  isBooked: boolean;
  customerName?: string;
  customerPhone?: string;
  bookingDate?: string;
  agreedPrice?: number;
  advancePayment?: number;
  deliveryDate?: string;
  qurbaniDay?: 1 | 2 | 3;
}

export interface CattlePhoto {
  id: string;
  url: string;
  caption?: string;
  uploadedAt: string;
}

export interface CattleVideo {
  id: string;
  youtubeUrl: string;
  title?: string;
  addedAt: string;
}

export interface CattleDocument {
  id: string;
  name: string;
  type: 'receipt' | 'health_certificate' | 'vaccination_card' | 'other';
  url: string;
  uploadedAt: string;
}

export interface FeedCostRecord {
  date: string;
  feedCost: number;
  weightGained: number;
}

export interface CostItem {
  id: string;
  costType: 'MEDICAL' | 'VACCINATION' | 'LABOR' | 'OTHER';
  amount: number;
  description: string;
  date: string;
  createdAt: string;
}

export interface Cattle {
  id: string;
  tagNumber: string;
  name?: string;
  branch?: string; // Location or branch of the animal
  type: AnimalType;
  imageUrl?: string; // Base64 or URL
  breed: Breed;
  gender: Gender;
  teeth: number; // Critical for Qurbani (2 teeth min)
  color: string;
  vaccinationStatus: boolean;
  vaccinationHistory: VaccinationRecord[];

  // Arrival Info
  arrivalType: ArrivalType;
  fatherTag?: string;
  motherTag?: string;
  parentTag?: string; // Resolved parent tag if motherTag contains UUID
  entryDate: string;
  entryWeight: number;
  purchasePrice: number;

  currentWeight: number;
  targetWeight: number;
  dailyTargetGain?: number; // Target Daily Gain in KG
  status: CattleStatus;
  weightHistory: WeightRecord[];
  transactions: Transaction[];

  // Owner/Investor Info (For Shartakti farming)
  ownerName: string;
  ownerEmail: string;
  ownerMobile: string;
  ownerWhatsappNumber?: string;
  ownerWhatsappApiKey?: string;
  ownerAddress: string;
  monthlyPackageId: string; // Links to FeedPackage.id
  monthlyCharges: number; // Monthly fee charged to owner in PKR

  // Qurbani Specifics
  qurbaniDetails?: QurbaniDetails;

  // Media & Documents
  photos?: CattlePhoto[];
  videos?: CattleVideo[];
  documents?: CattleDocument[];

  // Feed cost tracking
  feedCostHistory?: FeedCostRecord[];

  notes: string;
  isPregnant?: boolean;

  // New Dairy & Health Fields
  healthStatus?: 'Healthy' | 'Sick' | 'Under Treatment' | 'Quarantine' | 'Recovered' | string;
  expectedCalvingDate?: string | null;
  pregnancyType?: string | null;
  pregnancySireOrEmbryo?: string | null;
  currentDailyMilkYield?: number | null;
  ageMonths?: number | null;

  historicalFeedCost?: number;
  lastFeedLogDate?: string | null;
  isLactating?: boolean;
}

export interface FeedItem {
  id: string;
  name: string; // e.g., "Wanda", "Toori", "Silage"
  quantityKg: number;
  costPerKg: number;
  proteinPercent: number;
  energyMcal: number;
  lowStockThreshold: number;
  priceHistory?: { date: string; price: number }[]; // Historical cost tracking
}

export interface FeedPackageItem {
  feedItemId: string;
  ratioPercent: number; // e.g., 50 for 50%
  // New fields for Roughage/Manual mode
  type?: 'CONCENTRATE' | 'ROUGHAGE' | 'CONCENTRATE_FIXED';
  manualKgPerFeeding?: number;
  manualFeedings?: number;
  dryMatter?: number; // Dry Matter % (e.g., 20 for Berseem, 90 for Straw)
}

export interface FeedPackage {
  id: string;
  name: string; // e.g., "Silver", "Gold"
  dailyIntakePercent: number; // e.g., 2.5 for 2.5% of body weight
  items: FeedPackageItem[];
  description?: string;
}

export interface DeletionRequest {
  id: string;
  targetId: string; // ID of cattle or feed item
  targetName: string;
  type: 'CATTLE' | 'FEED';
  requestedBy: string; // User name/role
  reason: string;
  date: string;
}

export type PaymentStatus = 'PENDING' | 'PAID' | 'OVERDUE';

export interface PaymentRecord {
  id: string;
  cattleId: string;
  cattleTag?: string;
  ownerName?: string;
  ownerEmail?: string;
  amount: number;
  dueDate: string;
  paidDate?: string;
  status: PaymentStatus;
  paymentMethod?: string;
  notes?: string;
  reminderSent: boolean;
}

export type ViewState = 'dashboard' | 'cattle' | 'medical' | 'vaccinations' | 'protocols' | 'feed' | 'inventory' | 'reports' | 'ai-advisor' | 'settings' | 'users' | 'qurbani' | 'logs' | 'payments' | 'suppliers' | 'labour' | 'breeding' | 'finance' | 'genetics' | 'billing';

export type SubscriptionStatus = 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
export type InvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'REFUNDED';
export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export interface TenantSubscription {
  id: string;
  tenantId: string;
  tenantName: string;
  ownerName: string;
  ownerEmail: string;
  planId: number;
  planName: string;
  planCode: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  amount: number;
  startDate: string;
  endDate?: string;
  nextBillingDate: string;
  trialEndsAt?: string;
  cancelledAt?: string;
  createdAt: string;
}

export interface SubscriptionInvoice {
  id: string;
  tenantId: string;
  tenantName: string;
  ownerName: string;
  subscriptionId: string;
  invoiceNumber: string;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  status: InvoiceStatus;
  dueDate?: string;
  paidDate?: string;
  paymentMethod?: string;
  notes?: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  createdAt: string;
}

export interface GeneralTransaction {
  id: string;
  tenantId: string;
  type: 'INCOME' | 'EXPENSE';
  category: string;
  amount: number;
  date: string;
  source?: string;
  description?: string;
  createdAt: string;
}

export interface SubscriptionDashboard {
  mrr: number;
  active_subscriptions: number;
  trial_subscriptions: number;
  past_due_subscriptions: number;
  cancelled_subscriptions: number;
  pending_invoices: number;
  overdue_invoices: number;
  revenueThisMonth: number;
}

export interface PlanFeature {
  id: number;
  text: string;
  displayOrder: number;
}

export interface SubscriptionPlan {
  id: number;
  code: string;
  name: string;
  pricePkr: number | null;
  billingPeriod: string;
  description?: string;
  isCustom: boolean;
  contactEmail: string | null;
  isPopular: boolean;
  displayOrder: number;
  userLimit: number | null;
  cattleLimit: string;
  features: PlanFeature[];
}

export type SupplierCategory = 'Feed' | 'Medicine' | 'Equipment' | 'Veterinary' | 'Other' | 'Rent' | 'Electricity' | 'Fuel' | 'Maintenance' | 'Labor';
export type SupplierStatus = 'ACTIVE' | 'INACTIVE';
export type PaymentStatusSupplier = 'PENDING' | 'PARTIAL' | 'PAID';

export interface Supplier {
  id: string;
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  address?: string;
  category?: SupplierCategory;
  notes?: string;
  status: SupplierStatus;
  createdAt?: string;
}

export interface SupplierPurchaseItem {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface SupplierPurchase {
  id: string;
  supplierId: string;
  supplierName?: string;
  purchaseDate: string;
  invoiceNumber?: string;
  items: SupplierPurchaseItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paymentStatus: PaymentStatusSupplier;
  paidAmount: number;
  paymentDate?: string;
  paymentMethod?: string;
  notes?: string;
  createdAt?: string;
}

// --- Breeding Types ---

export type BreedingStatus = 'OPEN' | 'CONFIRMED_PREGNANT' | 'FAILED' | 'CALVED';

export interface PregnancyCycle {
  id: string;
  tenantId: string;
  animalId: string;
  animalTag: string;
  animalBreed?: string;
  cycleStartDate: string;
  status: BreedingStatus;
  expectedCalvingDate?: string;
  actualCalvingDate?: string;
  notes?: string;
}

export type BreedingEventType = 'HEAT' | 'SERVICE_AI' | 'SERVICE_NATURAL' | 'PREG_CHECK' | 'CALVING' | 'ABORTION' | 'STILLBIRTH' | 'NOTE' | 'EMBRYO_TRANSFER' | 'LACTATION_START' | 'DRY_OFF';

export interface BreedingEvent {
  id: string;
  tenantId: string;
  animalId: string;
  cycleId?: string;
  eventType: BreedingEventType;
  eventDate: string;
  details: any;
  createdBy?: string;
  tagNumber?: string;
}

export interface BreedingStats {
  open_cycles: number;
  pregnant_cows: number;
  recent_calvings: number;
}

export type WorkerRole = 'Farm Worker' | 'Supervisor' | 'Driver' | 'Security' | 'Cleaner' | 'Other';
export type SalaryType = 'MONTHLY' | 'DAILY' | 'HOURLY';
export type WorkerStatus = 'ACTIVE' | 'INACTIVE' | 'TERMINATED';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE';
export type WagePaymentStatus = 'PENDING' | 'PAID';

export interface Worker {
  id: string;
  name: string;
  phone?: string;
  cnic?: string;
  address?: string;
  role?: WorkerRole;
  salaryType: SalaryType;
  salaryAmount: number;
  joinDate?: string;
  status: WorkerStatus;
  emergencyContact?: string;
  emergencyPhone?: string;
  notes?: string;
  createdAt?: string;
}

export interface Attendance {
  id: string;
  workerId: string;
  workerName?: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: AttendanceStatus;
  overtimeHours: number;
  notes?: string;
}

export interface WagePayment {
  id: string;
  workerId: string;
  workerName?: string;
  periodStart: string;
  periodEnd: string;
  daysWorked: number;
  baseAmount: number;
  overtimeAmount: number;
  deductions: number;
  bonus: number;
  totalAmount: number;
  paymentStatus: WagePaymentStatus;
  paymentDate?: string;
  paymentMethod?: string;
  notes?: string;
  createdAt?: string;
}

export interface SystemContent {
  heroTitle: string;
  heroSubtitle: string;
  features: {
    icon: string;
    title: string;
    description: string;
  }[];
  footerPoints: string[];
}

export interface AuditLog {
  id: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  details: any;
  created_at: string;
  user_name: string;
  user_email: string;
}