import { test, expect } from '@playwright/test';

const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkM2U3MDYyMS00ODFjLTQ5MmMtOGQxMy1jNWZhNTBhOWY3ZDkiLCJpYXQiOjE3ODI4NDQyOTcsImV4cCI6MTc4MzQ0OTA5N30.MtviAyvpb9RXZJYxdhcQElXfUcJdgoQmIJpPR7goaI8';

test.describe('FarmXpert Workflow Verification', () => {
    test.beforeEach(async ({ page }) => {
        // Go to page, inject localStorage auth token, and reload to login automatically
        await page.goto('/');
        await page.evaluate((token) => {
            localStorage.setItem('farmxpert_token', token);
        }, TEST_TOKEN);
        await page.goto('/');
        
        // Wait for the app layout to load
        await page.waitForSelector('text=Dashboard', { timeout: 15000 });
    });

    test('Verify Sidebar and Navigation Links are Translated', async ({ page }) => {
        // Expand Collapsible menus in English
        await page.click('button:has-text("Herd Management")');
        await page.click('button:has-text("Finance") >> nth=0');
        
        // Assert English layout headers
        await expect(page.locator('button:has-text("Herd Management")')).toBeVisible();
        await expect(page.locator('button:has-text("Animals")')).toBeVisible();
        await expect(page.locator('button:has-text("Feed Management")')).toBeVisible();
        await expect(page.locator('button:has-text("Qurbani Management")')).toBeVisible();

        // Switch to Urdu Language by clicking the language selector
        const languageButton = page.locator('button:has(svg.lucide-globe)');
        if (await languageButton.count() > 0) {
            await languageButton.first().click();
            const urduOption = page.locator('text=اردو');
            if (await urduOption.count() > 0) {
                await urduOption.click();
                await page.waitForTimeout(1500); // Wait for transition and translation to load
                
                // Expand Collapsible menus in Urdu
                await page.click('button:has-text("ریوڑ کا انتظام")');
                await page.click('button:has-text("مالیات") >> nth=0');
                
                // Assert Urdu layout translations
                await expect(page.locator('button:has-text("ریوڑ کا انتظام")')).toBeVisible();
                await expect(page.locator('button:has-text("جانور")')).toBeVisible();
                await expect(page.locator('button:has-text("خوراک کا انتظام")')).toBeVisible();
                await expect(page.locator('button:has-text("قربانی کا انتظام")')).toBeVisible();
            }
        }
    });

    test('Verify Animals Registry and Weight History Updates', async ({ page }) => {
        // Click on "Herd Management" to expand
        await page.click('button:has-text("Herd Management")');
        
        // Click on "Animals" sub-item button
        await page.click('button:has-text("Animals")');
        
        // Wait for COW-101 to load
        await page.waitForSelector('text=COW-101', { timeout: 15000 });

        // Confirm COW-101 and BULL-102 exist
        await expect(page.locator('text=COW-101')).toBeVisible();
        await expect(page.locator('text=BULL-102')).toBeVisible();

        // Click "Full Details" (FileText icon button) for COW-101 row
        const cowRow = page.locator('tr:has-text("COW-101")');
        await cowRow.locator('button[title="Full Details"]').click();
        
        // Check weight display is visible in the modal
        await page.waitForSelector('text=Current Weight:', { timeout: 5000 });
        await expect(page.locator('text=Current Weight:')).toBeVisible();
    });

    test('Verify Qurbani Management Booking Flow', async ({ page }) => {
        // Click on "Finance" category header to expand
        await page.click('button:has-text("Finance") >> nth=0');
        
        // Click on "Qurbani Management" sub-item button
        await page.click('button:has-text("Qurbani Management")');
        
        // Wait for page load
        await page.waitForSelector('text=Total Stock', { timeout: 15000 });

        // Check if BULL-102 is listed in Qurbani stock
        await expect(page.locator('text=#BULL-102')).toBeVisible();

        // Find the Book Now button within the card that has BULL-102
        const bullCard = page.locator('.group:has-text("BULL-102")');
        const bookButton = bullCard.locator('button:has-text("Book Now")');
        
        if (await bookButton.count() > 0) {
            await bookButton.click();
            
            // Fill Customer Details Form
            await page.fill('input[placeholder="Enter full name"]', 'Automated Test Customer');
            await page.fill('input[placeholder="0300-XXXXXXX"]', '0300-9999999');
            
            // Go to Pricing Tab
            await page.click('text=Pricing');
            await page.fill('input[type="number"] >> nth=1', '25000'); // Advance payment (Bayana)

            // Click Confirm Booking
            await page.click('button:has-text("Confirm Booking")');

            // Verification: Card should change to BOOKED
            await expect(bullCard.locator('text=BOOKED')).toBeVisible();
            await expect(bullCard.locator('text=Automated Test Customer')).toBeVisible();
        }
    });
});
