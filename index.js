const puppeteer = require('puppeteer-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(stealthPlugin());

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
            '--start-maximized',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--incognito'
        ]
    });

    const [page] = await browser.pages();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
        });
    });

    // Function to close popups whenever they appear
    async function closePopupIfNeeded() {
        try {
            await page.waitForSelector('.wisepops-content', { timeout: 5000 });
            await page.evaluate(() => {
                const popup = document.querySelector('.wisepops-content');
                if (popup) popup.remove();
            });
            console.log('Popup closed');
        } catch (e) {
            console.log('Popup not found or already closed');
        }
    }

    await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });

    try {
        await page.waitForSelector('#L2AGLb', { timeout: 5000 });
        await page.click('#L2AGLb');
        console.log('Cookies accepted');
    } catch (e) {
        console.log('No cookies popup or already accepted');
    }

    await closePopupIfNeeded(); // Close any popup on the page after the cookies are accepted

    try {
        // Search
        await page.waitForSelector('textarea[name="q"]', { timeout: 5000 });
        await page.type('textarea[name="q"]', 'Wing assistant', { delay: 100 });
        await page.keyboard.press('Enter');

        // Click first search result
        await page.waitForSelector('h3', { timeout: 8000 });
        const firstResult = await page.$('h3');
        if (firstResult) await firstResult.click();

        // Wait for navigation to the result site
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });

        // Close any popups
        await closePopupIfNeeded();

        // Click "Free Consultation" button
        await page.waitForSelector('a.elementor-button.elementor-button-link.elementor-size-lg', { timeout: 10000 });
        await page.click('a.elementor-button.elementor-button-link.elementor-size-lg');

        console.log('Clicked "Free Consultation" button');

        // Wait for Calendly iframe to appear and load fully
        await page.waitForSelector('.calendly-inline-widget iframe', { timeout: 20000 });
        const iframeHandle = await page.$('.calendly-inline-widget iframe');
        const frame = await iframeHandle.contentFrame();

        // Wait for calendar to load
        await frame.waitForSelector('.calendly-header-text', { timeout: 30000 });

        // Get current month and year
        const currentMonthYear = await frame.$eval('.calendly-header-text', el => el.textContent.trim());
        console.log(`Current month: ${currentMonthYear}`);

        // Get all available dates (not disabled)
        const availableDates = await frame.$$eval('.calendly-day:not(.calendly-disabled)', 
            dates => dates.map(date => ({
                date: date.getAttribute('aria-label'),
                day: date.textContent.trim()
            })));

        console.log(`Available dates in ${currentMonthYear}:`);
        console.log(availableDates);

        if (availableDates.length > 0) {
            // Click on the first available date
            await frame.click('.calendly-day:not(.calendly-disabled)');
            console.log('Clicked on the available day');

            // Wait for the time slots to appear
            await frame.waitForSelector('.calendly-timeslots', { timeout: 10000 });
            
            // Get available time slots
            const timeSlots = await frame.$$eval('.calendly-timeslots [data-container="timeslot"]', 
                slots => slots.map(slot => ({
                    time: slot.getAttribute('aria-label'),
                    available: !slot.classList.contains('calendly-disabled')
                })));
            
            console.log('Available time slots:');
            console.log(timeSlots.filter(slot => slot.available).map(slot => slot.time));

            // Click on the first available time slot
            await frame.click('.calendly-timeslots [data-container="timeslot"]:not(.calendly-disabled)');
            console.log('Clicked on the available time slot');

            // Wait for the "Next" button to appear
            await frame.waitForSelector('.calendly-next-button', { timeout: 5000 });

            // Click "Next" to proceed to the form
            await frame.click('.calendly-next-button');
            console.log('Clicked "Next" to proceed to the next step/form');
        }

    } catch (error) {
        console.error('Error:', error.message);
    }

    await browser.close();
})();
