import { Cattle, FeedItem, FeedPackage, Tenant, UserRole, CattleStatus, Breed, Gender, ArrivalType, AnimalType, SubscriptionPlan, PaymentRecord, Supplier, SupplierPurchase, Worker, Attendance, WagePayment, CostItem, TenantCapacity } from '../types';

const API_URL = '/api';

let USE_MOCK = false;

const getHeaders = (tenantId: string) => {
    const token = localStorage.getItem('farmxpert_token');
    return {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId,
        'Authorization': token ? `Bearer ${token}` : '',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    };
};

// --- MOCK DATA & SERVICE ---

const mockTenants: Tenant[] = [
    { id: 't1', name: 'Green Pastures (Demo)', ownerName: 'Ali Khan', tier: 'PREMIUM', modules: ['CORE', 'AI_ADVISOR', 'FEED_OPTIMIZER', 'QURBANI_TRACKING', 'FINANCE'], locale: 'en-PK', currency: 'PKR', status: 'ACTIVE', users: [] },
    { id: 't2', name: 'Sunny Dairy', ownerName: 'Omer PO', tier: 'STANDARD', modules: ['CORE', 'FEED_OPTIMIZER'], locale: 'en-PK', currency: 'PKR', status: 'ACTIVE', users: [] }
];

const mockCattle: Cattle[] = [
    {
        id: 'c1', tagNumber: 'B1001', type: AnimalType.BULL, breed: Breed.SAHIWAL, gender: Gender.MALE, teeth: 2, color: 'Red', status: CattleStatus.ACTIVE,
        arrivalType: ArrivalType.PURCHASED, entryDate: '2023-10-01', entryWeight: 220, currentWeight: 340, targetWeight: 450, dailyTargetGain: 1.2, purchasePrice: 85000,
        weightHistory: [{ date: '2023-10-01', weight: 220 }, { date: '2023-11-01', weight: 255 }, { date: '2023-12-01', weight: 290 }, { date: '2024-01-01', weight: 340 }],
        vaccinationStatus: true, vaccinationHistory: [{ id: 'v1', date: '2023-10-05', vaccineName: 'FMD', notes: 'Batch A' }], transactions: [],
        ownerName: 'Farm Owned', ownerEmail: 'owner@farm.pk', ownerMobile: '03001234567', ownerAddress: 'Lahore, Pakistan',
        monthlyPackageId: 'pkg1', monthlyCharges: 15000, notes: 'Healthy'
    }
];

const mockFeed: FeedItem[] = [
    { id: 'f1', name: 'Wheat Straw (Bhusa)', quantityKg: 5000, costPerKg: 15, proteinPercent: 3.5, energyMcal: 1.6, lowStockThreshold: 1000 },
    { id: 'f2', name: 'Wanda (Fattening)', quantityKg: 400, costPerKg: 95, proteinPercent: 18, energyMcal: 2.8, lowStockThreshold: 500 },
    { id: 'f3', name: 'Silage (Maize)', quantityKg: 12000, costPerKg: 12, proteinPercent: 8, energyMcal: 2.4, lowStockThreshold: 2000 }
];

const mockPackages: FeedPackage[] = [
    { id: 'pkg1', name: 'Gold Fattening', dailyIntakePercent: 3.0, items: [{ feedItemId: 'f1', ratioPercent: 40 }, { feedItemId: 'f2', ratioPercent: 60 }], description: 'High energy mix' }
];

// LocalStorage Helper
const getStore = (key: string, defaultVal: any) => {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultVal;
};
const setStore = (key: string, val: any) => localStorage.setItem(key, JSON.stringify(val));

const MockService = {
    tenants: {
        list: async () => {
            console.log("[Mock] Fetching Tenants");
            return mockTenants;
        },
        create: async (data: any) => {
            console.log("[Mock] Creating Tenant", data);
            return { ...data, id: `t-${Date.now()}`, status: 'ACTIVE', users: [] };
        }
    },
    cattle: {
        list: async (tenantId: string) => {
            return getStore(`cattle_${tenantId}`, mockCattle);
        },
        create: async (tenantId: string, data: any) => {
            const list = getStore(`cattle_${tenantId}`, mockCattle);
            const newItem = { ...data, id: `c-${Date.now()}` };
            setStore(`cattle_${tenantId}`, [newItem, ...list]);
            return newItem;
        },
        update: async (tenantId: string, id: string, data: any) => {
            const list = getStore(`cattle_${tenantId}`, mockCattle);
            const updated = list.map((c: any) => c.id === id ? { ...c, ...data } : c);
            setStore(`cattle_${tenantId}`, updated);
            return { id, ...data };
        },
        delete: async (tenantId: string, id: string) => {
            const list = getStore(`cattle_${tenantId}`, mockCattle);
            setStore(`cattle_${tenantId}`, list.filter((c: any) => c.id !== id));
            return { success: true };
        }
    },
    feed: {
        listItems: async (tenantId: string) => getStore(`feed_${tenantId}`, mockFeed),
        createItem: async (tenantId: string, data: any) => {
            const list = getStore(`feed_${tenantId}`, mockFeed);
            const newItem = { ...data, id: `f-${Date.now()}` };
            setStore(`feed_${tenantId}`, [...list, newItem]);
            return newItem;
        },
        updateItem: async (tenantId: string, id: string, data: any) => {
            const list = getStore(`feed_${tenantId}`, mockFeed);
            const updated = list.map((f: any) => f.id === id ? { ...f, ...data } : f);
            setStore(`feed_${tenantId}`, updated);
            return { id, ...data };
        },
        deleteItem: async (tenantId: string, id: string) => {
            const list = getStore(`feed_${tenantId}`, mockFeed);
            setStore(`feed_${tenantId}`, list.filter((f: any) => f.id !== id));
            return { success: true };
        },
        listPackages: async (tenantId: string) => getStore(`pkgs_${tenantId}`, mockPackages),
        createPackage: async (tenantId: string, data: any) => {
            const list = getStore(`pkgs_${tenantId}`, mockPackages);
            const newItem = { ...data, id: `p-${Date.now()}` };
            setStore(`pkgs_${tenantId}`, [...list, newItem]);
            return newItem;
        },
        updatePackage: async (tenantId: string, id: string, data: any) => {
            const list = getStore(`pkgs_${tenantId}`, mockPackages);
            const updated = list.map((p: any) => p.id === id ? { ...p, ...data } : p);
            setStore(`pkgs_${tenantId}`, updated);
            return { id, ...data };
        },
        deletePackage: async (tenantId: string, id: string) => {
            const list = getStore(`pkgs_${tenantId}`, mockPackages);
            setStore(`pkgs_${tenantId}`, list.filter((p: any) => p.id !== id));
            return { success: true };
        }
    }
};

// --- MAIN REQUEST HANDLER ---

const handleRequest = async (promise: Promise<Response>, fallback: () => Promise<any>) => {
    if (USE_MOCK) return fallback();

    try {
        const res = await promise;
        const contentType = res.headers.get("content-type");

        if (!res.ok) {
            // If 404 (Route not found) or 500, likely backend issue/missing. Fallback locally but DO NOT set global USE_MOCK.
            if (res.status === 404 || res.status >= 500) {
                console.warn(`Backend unreachable (${res.status}). Using local mock fallback for this request.`);
                return fallback();
            }
            const text = await res.text();
            throw new Error(`Server Error: ${res.status} ${text}`);
        }

        if (contentType && contentType.indexOf("application/json") !== -1) {
            return await res.json();
        } else {
            // Got HTML/Text instead of JSON? Backend routing issue.
            console.warn("Received non-JSON response. Switching to Mock Mode.");
            USE_MOCK = true;
            return fallback();
        }
    } catch (error: any) {
        console.error("API Request Failed:", error);
        console.warn("Using local mock fallback due to connection failure.");
        return fallback();
    }
};

export const api = {
    tenants: {
        list: () => {
            const token = localStorage.getItem('farmxpert_token');
            return handleRequest(fetch(`${API_URL}/tenants`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            }), MockService.tenants.list);
        },
        create: (data: Partial<Tenant>) => {
            const token = localStorage.getItem('farmxpert_token');
            return handleRequest(fetch(`${API_URL}/tenants`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(data)
            }), () => MockService.tenants.create(data));
        },
        impersonate: async (tenantId: string): Promise<{ token: string; user: any; tenant: any }> => {
            const token = localStorage.getItem('farmxpert_token');
            const res = await fetch(`${API_URL}/tenants/${tenantId}/impersonate`, {
                method: 'POST',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to open farm session');
            return json;
        },
        update: (tenantId: string, data: { name?: string; ownerEmail?: string; managerEmail?: string; whatsappNumber?: string; whatsappApiKey?: string; smtpSettings?: any; herdValueRate?: number; logoUrl?: string; currency?: string; weightUnit?: string; branches?: string[]; country?: string; timezone?: string; }) => {
            const token = localStorage.getItem('farmxpert_token');
            return fetch(`${API_URL}/tenants/${tenantId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(data)
            }).then(async res => {
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'Failed to save settings');
                return json;
            });
        },
        getCapacity: async (): Promise<TenantCapacity[]> => {
            const token = localStorage.getItem('farmxpert_token');
            const res = await fetch(`${API_URL}/tenants/capacity`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to fetch capacity report');
            return json;
        },
        setCapacityOverride: async (tenantId: string, data: { cattleLimitOverride?: string | null; userLimitOverride?: number | null }) => {
            const token = localStorage.getItem('farmxpert_token');
            const res = await fetch(`${API_URL}/tenants/${tenantId}/capacity-override`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(data)
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to update capacity override');
            return json;
        }
    },
    cattle: {
        list: (tenantId: string) => handleRequest(
            fetch(`${API_URL}/cattle`, { headers: getHeaders(tenantId) }),
            () => MockService.cattle.list(tenantId)
        ),
        create: async (tenantId: string, data: Partial<Cattle>) => {
            if (USE_MOCK) return MockService.cattle.create(tenantId, data);
            const res = await fetch(`${API_URL}/cattle`, {
                method: 'POST',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            });
            const json = await res.json();
            if (!res.ok) {
                const err: any = new Error(json.error || 'Failed to save cattle');
                if (json.limitReached) err.limitReached = true;
                throw err;
            }
            return json;
        },
        update: (tenantId: string, id: string, data: Partial<Cattle>) => handleRequest(
            fetch(`${API_URL}/cattle/${id}`, {
                method: 'PUT',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            }),
            () => MockService.cattle.update(tenantId, id, data)
        ),
        getNextTag: async (tenantId: string, type: string): Promise<{ legacyTagScheme: boolean; preview?: string }> => {
            if (USE_MOCK) return { legacyTagScheme: true };
            const res = await fetch(`${API_URL}/cattle/next-tag?type=${encodeURIComponent(type)}`, { headers: getHeaders(tenantId) });
            if (!res.ok) return { legacyTagScheme: true };
            return res.json();
        },
        delete: (tenantId: string, id: string) => handleRequest(
            fetch(`${API_URL}/cattle/${id}`, {
                method: 'DELETE',
                headers: getHeaders(tenantId)
            }),
            () => MockService.cattle.delete(tenantId, id)
        ),
        addCost: (tenantId: string, cattleId: string, costData: any) => handleRequest(
            fetch(`${API_URL}/cattle/${cattleId}/costs`, {
                method: 'POST',
                headers: getHeaders(tenantId),
                body: JSON.stringify(costData)
            }),
            async () => ({ ...costData, id: `cc-${Date.now()}` })
        ),
        deleteCost: (tenantId: string, cattleId: string, costId: string) => handleRequest(
            fetch(`${API_URL}/cattle/${cattleId}/costs/${costId}`, {
                method: 'DELETE',
                headers: getHeaders(tenantId)
            }),
            async () => ({ success: true })
        ),
        addMedicalRecord: (tenantId: string, cattleId: string, data: { medicalItemId?: string, date: string, notes?: string, dose?: number, name?: string, type?: string, provider?: string, status?: string }) => handleRequest(
            fetch(`${API_URL}/cattle/${cattleId}/medical-record`, {
                method: 'POST',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            }),
            async () => ({ success: true, message: 'Mock: Medical record added' })
        )
    },
    feed: {
        listItems: (tenantId: string) => handleRequest(
            fetch(`${API_URL}/feed/items`, { headers: getHeaders(tenantId) }),
            () => MockService.feed.listItems(tenantId)
        ),
        createItem: (tenantId: string, data: Partial<FeedItem>) => handleRequest(
            fetch(`${API_URL}/feed/items`, {
                method: 'POST',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            }),
            () => MockService.feed.createItem(tenantId, data)
        ),
        updateItem: (tenantId: string, id: string, data: Partial<FeedItem>) => handleRequest(
            fetch(`${API_URL}/feed/items/${id}`, {
                method: 'PUT',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            }),
            () => MockService.feed.updateItem(tenantId, id, data)
        ),
        deleteItem: (tenantId: string, id: string) => handleRequest(
            fetch(`${API_URL}/feed/items/${id}`, {
                method: 'DELETE',
                headers: getHeaders(tenantId)
            }),
            () => MockService.feed.deleteItem(tenantId, id)
        ),
        listPackages: (tenantId: string) => handleRequest(
            fetch(`${API_URL}/feed/packages`, { headers: getHeaders(tenantId) }),
            () => MockService.feed.listPackages(tenantId)
        ),
        createPackage: (tenantId: string, data: Partial<FeedPackage>) => handleRequest(
            fetch(`${API_URL}/feed/packages`, {
                method: 'POST',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            }),
            () => MockService.feed.createPackage(tenantId, data)
        ),
        updatePackage: (tenantId: string, id: string, data: Partial<FeedPackage>) => handleRequest(
            fetch(`${API_URL}/feed/packages/${id}`, {
                method: 'PUT',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            }),
            () => MockService.feed.updatePackage(tenantId, id, data)
        ),
        deletePackage: (tenantId: string, id: string) => handleRequest(
            fetch(`${API_URL}/feed/packages/${id}`, {
                method: 'DELETE',
                headers: getHeaders(tenantId)
            }),
            () => MockService.feed.deletePackage(tenantId, id)
        ),
        getUsageLog: (tenantId: string) => handleRequest(
            fetch(`${API_URL}/feed/usage-log`, { headers: getHeaders(tenantId) }),
            async () => []
        ),
        processDaily: (tenantId: string, date?: string) => handleRequest(
            fetch(`${API_URL}/feed/process-daily`, {
                method: 'POST',
                headers: getHeaders(tenantId),
                body: JSON.stringify({ date })
            }),
            async () => ({ success: false, error: 'Mock mode does not support feed processing' })
        ),
        processMultipleDays: (tenantId: string, days: number) => handleRequest(
            fetch(`${API_URL}/feed/process-multiple-days`, {
                method: 'POST',
                headers: getHeaders(tenantId),
                body: JSON.stringify({ days })
            }),
            async () => ({ success: false, error: 'Mock mode does not support feed processing' })
        ),
        deleteUsageLog: (tenantId: string, id: string) => handleRequest(
            fetch(`${API_URL}/feed/usage-log/${id}`, {
                method: 'DELETE',
                headers: getHeaders(tenantId)
            }),
            async () => ({ success: true, message: 'Mock: Log deleted' })
        ),
        sendLowStockAlert: (tenantId: string, lowStockItems: FeedItem[]) => handleRequest(
            fetch(`${API_URL}/feed/send-low-stock-alert`, {
                method: 'POST',
                headers: getHeaders(tenantId),
                body: JSON.stringify({ lowStockItems })
            }),
            async () => ({ success: false, message: 'Mock mode: Alert simulated' })
        )
    },
    ai: {
        predictGrowth: (cattle: Cattle, feedPackage: FeedPackage | undefined) => handleRequest(
            fetch(`${API_URL}/ai/predict-growth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cattle, feedPackage })
            }),
            // Mock AI response
            async () => ({ text: "AI Analysis (Mock Mode): Growth trajectory looks positive based on the simulated feed plan." })
        ).then(res => res.text || res)
    },
    users: {
        list: (tenantId: string) => {
            const token = localStorage.getItem('farmxpert_token');
            return handleRequest(
                fetch(`${API_URL}/users/${tenantId}`, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                }),
                async () => []
            );
        },
        create: (tenantId: string, data: { name: string; email: string; role: string; mobile?: string }) => {
            const token = localStorage.getItem('farmxpert_token');
            return fetch(`${API_URL}/users/${tenantId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(data)
            }).then(async res => {
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'Failed to add user');
                return json;
            });
        },
        delete: (tenantId: string, userId: string) => {
            const token = localStorage.getItem('farmxpert_token');
            return fetch(`${API_URL}/users/${tenantId}/${userId}`, {
                method: 'DELETE',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            }).then(async res => {
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'Failed to delete user');
                return json;
            });
        }
    },
    plans: {
        list: async (): Promise<SubscriptionPlan[]> => {
            try {
                const res = await fetch(`${API_URL}/plans`);
                if (!res.ok) throw new Error('Failed to fetch plans');
                return await res.json();
            } catch (err) {
                console.error('Failed to fetch plans:', err);
                return [];
            }
        },
        create: (data: Partial<SubscriptionPlan>) => {
            const token = localStorage.getItem('farmxpert_token');
            return fetch(`${API_URL}/plans`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(data)
            }).then(async res => {
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'Failed to create plan');
                return json;
            });
        },
        update: (planId: number, data: Partial<SubscriptionPlan>) => {
            const token = localStorage.getItem('farmxpert_token');
            return fetch(`${API_URL}/plans/${planId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(data)
            }).then(async res => {
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'Failed to update plan');
                return json;
            });
        },
        delete: (planId: number) => {
            const token = localStorage.getItem('farmxpert_token');
            return fetch(`${API_URL}/plans/${planId}`, {
                method: 'DELETE',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            }).then(async res => {
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'Failed to delete plan');
                return json;
            });
        },
        addFeature: (planId: number, featureText: string) => {
            const token = localStorage.getItem('farmxpert_token');
            return fetch(`${API_URL}/plans/${planId}/features`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ featureText })
            }).then(async res => {
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'Failed to add feature');
                return json;
            });
        },
        updateFeature: (planId: number, featureId: number, data: { featureText?: string; displayOrder?: number }) => {
            const token = localStorage.getItem('farmxpert_token');
            return fetch(`${API_URL}/plans/${planId}/features/${featureId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(data)
            }).then(async res => {
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'Failed to update feature');
                return json;
            });
        },
        deleteFeature: (planId: number, featureId: number) => {
            const token = localStorage.getItem('farmxpert_token');
            return fetch(`${API_URL}/plans/${planId}/features/${featureId}`, {
                method: 'DELETE',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            }).then(async res => {
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'Failed to delete feature');
                return json;
            });
        }
    },
    payments: {
        list: (tenantId: string, cattleId?: string): Promise<PaymentRecord[]> => handleRequest(
            fetch(`${API_URL}/payments${cattleId ? `?cattleId=${cattleId}` : ''}`, { headers: getHeaders(tenantId) }),
            async () => []
        ),
        create: (tenantId: string, data: Partial<PaymentRecord>) => handleRequest(
            fetch(`${API_URL}/payments`, {
                method: 'POST',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            }),
            async () => ({ ...data, id: `p-${Date.now()}` })
        ),
        update: (tenantId: string, id: string, data: Partial<PaymentRecord>) => handleRequest(
            fetch(`${API_URL}/payments/${id}`, {
                method: 'PUT',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            }),
            async () => ({ id, ...data })
        ),
        delete: (tenantId: string, id: string) => handleRequest(
            fetch(`${API_URL}/payments/${id}`, {
                method: 'DELETE',
                headers: getHeaders(tenantId)
            }),
            async () => ({ success: true })
        ),
        deleteAllForCattle: (tenantId: string, cattleId: string) => handleRequest(
            fetch(`${API_URL}/payments/cattle/${cattleId}`, {
                method: 'DELETE',
                headers: getHeaders(tenantId)
            }),
            async () => ({ success: true })
        ),
        generateMonthly: (tenantId: string) => handleRequest(
            fetch(`${API_URL}/payments/generate-monthly`, {
                method: 'POST',
                headers: getHeaders(tenantId)
            }),
            async () => ({ message: 'Generated monthly payments' })
        ),
        getSummary: (tenantId: string) => handleRequest(
            fetch(`${API_URL}/payments/summary`, { headers: getHeaders(tenantId) }),
            async () => []
        ),
        settle: (tenantId: string, cattleId: string, data?: { amountPaid?: number }) => handleRequest(
            fetch(`${API_URL}/payments/settle/${cattleId}`, {
                method: 'POST',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data || {})
            }),
            async () => ({ success: true })
        ),
        sendReminder: (tenantId: string, cattleId: string) => handleRequest(
            fetch(`${API_URL}/payments/remind/${cattleId}`, {
                method: 'POST',
                headers: getHeaders(tenantId)
            }),
            async () => ({ success: true })
        )
    },
    suppliers: {
        list: (tenantId: string): Promise<Supplier[]> => handleRequest(
            fetch(`${API_URL}/suppliers`, { headers: getHeaders(tenantId) }),
            async () => []
        ),
        create: (tenantId: string, data: Partial<Supplier>) => handleRequest(
            fetch(`${API_URL}/suppliers`, {
                method: 'POST',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            }),
            async () => ({ ...data, id: `s-${Date.now()}` })
        ),
        update: (tenantId: string, id: string, data: Partial<Supplier>) => handleRequest(
            fetch(`${API_URL}/suppliers/${id}`, {
                method: 'PUT',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            }),
            async () => ({ id, ...data })
        ),
        delete: (tenantId: string, id: string) => handleRequest(
            fetch(`${API_URL}/suppliers/${id}`, {
                method: 'DELETE',
                headers: getHeaders(tenantId)
            }),
            async () => ({ success: true })
        ),
        listPurchases: (tenantId: string, supplierId?: string): Promise<SupplierPurchase[]> => handleRequest(
            fetch(`${API_URL}/suppliers/purchases${supplierId ? `?supplierId=${supplierId}` : ''}`, { headers: getHeaders(tenantId) }),
            async () => []
        ),
        createPurchase: (tenantId: string, data: Partial<SupplierPurchase>) => handleRequest(
            fetch(`${API_URL}/suppliers/purchases`, {
                method: 'POST',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            }),
            async () => ({ ...data, id: `sp-${Date.now()}` })
        ),
        updatePurchase: (tenantId: string, id: string, data: Partial<SupplierPurchase>) => handleRequest(
            fetch(`${API_URL}/suppliers/purchases/${id}`, {
                method: 'PUT',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            }),
            async () => ({ id, ...data })
        ),
        deletePurchase: (tenantId: string, id: string) => handleRequest(
            fetch(`${API_URL}/suppliers/purchases/${id}`, {
                method: 'DELETE',
                headers: getHeaders(tenantId)
            }),
            async () => ({ success: true })
        )
    },
    finance: {
        listTransactions: (tenantId: string) => handleRequest(
            fetch(`${API_URL}/finance/transactions`, { headers: getHeaders(tenantId) }),
            async () => []
        ),
        createTransaction: (tenantId: string, data: any) => handleRequest(
            fetch(`${API_URL}/finance/transactions`, {
                method: 'POST',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            }),
            async () => ({ ...data, id: `ft-${Date.now()}` })
        ),
        deleteTransaction: (tenantId: string, id: string) => handleRequest(
            fetch(`${API_URL}/finance/transactions/${id}`, {
                method: 'DELETE',
                headers: getHeaders(tenantId)
            }),
            async () => ({ success: true })
        )
    },
    labour: {
        listWorkers: (tenantId: string): Promise<Worker[]> => handleRequest(
            fetch(`${API_URL}/labour/workers`, { headers: getHeaders(tenantId) }),
            async () => []
        ),
        createWorker: (tenantId: string, data: Partial<Worker>) => handleRequest(
            fetch(`${API_URL}/labour/workers`, {
                method: 'POST',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            }),
            async () => ({ ...data, id: `w-${Date.now()}` })
        ),
        updateWorker: (tenantId: string, id: string, data: Partial<Worker>) => handleRequest(
            fetch(`${API_URL}/labour/workers/${id}`, {
                method: 'PUT',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            }),
            async () => ({ id, ...data })
        ),
        deleteWorker: (tenantId: string, id: string) => handleRequest(
            fetch(`${API_URL}/labour/workers/${id}`, {
                method: 'DELETE',
                headers: getHeaders(tenantId)
            }),
            async () => ({ success: true })
        ),
        getAttendance: (tenantId: string, params?: { date?: string; workerId?: string; startDate?: string; endDate?: string }): Promise<Attendance[]> => {
            const queryParams = new URLSearchParams();
            if (params?.date) queryParams.set('date', params.date);
            if (params?.workerId) queryParams.set('workerId', params.workerId);
            if (params?.startDate) queryParams.set('startDate', params.startDate);
            if (params?.endDate) queryParams.set('endDate', params.endDate);
            const queryString = queryParams.toString();
            return handleRequest(
                fetch(`${API_URL}/labour/attendance${queryString ? `?${queryString}` : ''}`, { headers: getHeaders(tenantId) }),
                async () => []
            );
        },
        saveAttendance: (tenantId: string, data: Partial<Attendance>) => handleRequest(
            fetch(`${API_URL}/labour/attendance`, {
                method: 'POST',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            }),
            async () => ({ ...data, id: `a-${Date.now()}` })
        ),
        bulkSaveAttendance: (tenantId: string, date: string, records: Partial<Attendance>[]) => handleRequest(
            fetch(`${API_URL}/labour/attendance/bulk`, {
                method: 'POST',
                headers: getHeaders(tenantId),
                body: JSON.stringify({ date, records })
            }),
            async () => ({ success: true, count: records.length })
        ),
        listWages: (tenantId: string, workerId?: string): Promise<WagePayment[]> => handleRequest(
            fetch(`${API_URL}/labour/wages${workerId ? `?workerId=${workerId}` : ''}`, { headers: getHeaders(tenantId) }),
            async () => []
        ),
        createWage: (tenantId: string, data: Partial<WagePayment>) => handleRequest(
            fetch(`${API_URL}/labour/wages`, {
                method: 'POST',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            }),
            async () => ({ ...data, id: `wage-${Date.now()}` })
        ),
        updateWage: (tenantId: string, id: string, data: Partial<WagePayment>) => handleRequest(
            fetch(`${API_URL}/labour/wages/${id}`, {
                method: 'PUT',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            }),
            async () => ({ id, ...data })
        ),
        calculateWages: (tenantId: string, workerId: string, periodStart: string, periodEnd: string) => handleRequest(
            fetch(`${API_URL}/labour/wages/calculate`, {
                method: 'POST',
                headers: getHeaders(tenantId),
                body: JSON.stringify({ workerId, periodStart, periodEnd })
            }),
            async () => ({ daysWorked: 0, overtimeHours: 0, baseAmount: 0, overtimeAmount: 0 })
        )
    },
    content: {
        get: (key: string): Promise<any> => {
            return fetch(`${API_URL}/content/${key}`).then(async res => {
                if (!res.ok) throw new Error('Failed to fetch content');
                return await res.json();
            });
        },
        update: (key: string, content: any): Promise<any> => {
            const token = localStorage.getItem('farmxpert_token');
            return fetch(`${API_URL}/content/${key}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(content)
            }).then(async res => {
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'Failed to update content');
                return json;
            });
        }
    },
    medical: {
        list: async (tenantId: string, filters?: { type?: string, status?: string }) => {
            if (USE_MOCK) {
                let list = getStore(`medical_${tenantId}`, []);
                if (filters?.type) list = list.filter((m: any) => m.type === filters.type);
                if (filters?.status) list = list.filter((m: any) => m.status === filters.status);
                return list;
            }
            const params = new URLSearchParams();
            if (filters?.type) params.append('type', filters.type);
            if (filters?.status) params.append('status', filters.status);

            const res = await fetch(`${API_URL}/medical/${tenantId}?${params.toString()}`, {
                headers: getHeaders(tenantId),
                cache: 'no-store'
            });
            if (!res.ok) throw new Error('Failed to fetch medical inventory');
            return res.json();
        },
        create: async (tenantId: string, data: any) => {
            if (USE_MOCK) {
                const newItem = { ...data, id: 'm-' + Date.now() };
                const list = getStore(`medical_${tenantId}`, []);
                setStore(`medical_${tenantId}`, [...list, newItem]);
                return newItem;
            }
            const res = await fetch(`${API_URL}/medical/${tenantId}`, {
                method: 'POST',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            });
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Failed to create medical item: ${res.status} ${err}`);
            }
            return res.json();
        },
        update: async (tenantId: string, id: string, data: any) => {
            if (USE_MOCK) {
                const list = getStore(`medical_${tenantId}`, []);
                const updated = list.map((m: any) => m.id === id ? { ...m, ...data } : m);
                setStore(`medical_${tenantId}`, updated);
                return { ...data, id };
            }
            const res = await fetch(`${API_URL}/medical/${tenantId}/${id}`, {
                method: 'PUT',
                headers: getHeaders(tenantId),
                body: JSON.stringify(data)
            });
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Failed to update medical item: ${res.status} ${err}`);
            }
            return res.json();
        },
        delete: async (tenantId: string, id: string) => {
            if (USE_MOCK) {
                const list = getStore(`medical_${tenantId}`, []);
                setStore(`medical_${tenantId}`, list.filter((m: any) => m.id !== id));
                return { success: true };
            }
            const res = await fetch(`${API_URL}/medical/${tenantId}/${id}`, {
                method: 'DELETE',
                headers: getHeaders(tenantId)
            });
            if (!res.ok) throw new Error('Failed to delete medical item');
            return res.json();
        }
    },
    reports: {
        getExpenses: (tenantId: string, startDate: string, endDate: string) => handleRequest(
            fetch(`${API_URL}/reports/expenses?startDate=${startDate}&endDate=${endDate}`, { headers: getHeaders(tenantId) }),
            async () => ({ breakdown: [], total: 0 })
        ),
        getGrowth: (tenantId: string, startDate: string, endDate: string) => handleRequest(
            fetch(`${API_URL}/reports/growth?startDate=${startDate}&endDate=${endDate}`, { headers: getHeaders(tenantId) }),
            async () => ({ overview: { totalAnimals: 0, avgWeight: 0, avgADG: 0, totalHerdWeight: 0 }, topPerformers: [], bottomPerformers: [] })
        ),
        getAnimalCosts: (tenantId: string, animalId?: string) => handleRequest(
            fetch(`${API_URL}/reports/animal-costs${animalId ? `?animalId=${animalId}` : ''}`, { headers: getHeaders(tenantId) }),
            async () => ({ costs: [] })
        )
    },
    logs: {
        list: async (tenantId: string, page: number = 1, limit: number = 50) => {
            const token = localStorage.getItem('farmxpert_token');
            const res = await fetch(`${API_URL}/logs?page=${page}&limit=${limit}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-tenant-id': tenantId,
                    'Authorization': token ? `Bearer ${token}` : ''
                }
            });
            if (!res.ok) throw new Error('Failed to fetch activity logs');
            return res.json();
        }
    },
    billing: {
        getSubscription: async (tenantId: string) => {
            const res = await fetch(`${API_URL}/tenants/${tenantId}/billing`, {
                headers: getHeaders(tenantId)
            });
            if (!res.ok) throw new Error('Failed to fetch subscription details');
            return res.json();
        },
        upgrade: async (tenantId: string, planId: number) => {
            const res = await fetch(`${API_URL}/tenants/${tenantId}/upgrade`, {
                method: 'POST',
                headers: getHeaders(tenantId),
                body: JSON.stringify({ planId })
            });
            if (!res.ok) {
                const err = await res.text();
                throw new Error(JSON.parse(err).error || 'Failed to upgrade plan');
            }
            return res.json();
        }
    }
};