const puppeteer = require('puppeteer-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth');
const ExcelJS = require('exceljs');

puppeteer.use(stealthPlugin());

// Helper function for timeouts
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to show waiting progress
async function waitWithProgress(ms, message) {
    const interval = 1000; // 1 second
    const steps = ms / interval;
    console.log(`${message} (0/${Math.floor(ms/1000)}s)`);
    
    for (let i = 1; i <= steps; i++) {
        await delay(interval);
        console.log(`${message} (${i}/${Math.floor(ms/1000)}s)`);
    }
}

// Helper function to get a random item from an array
function getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

async function readExcelData(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet(1); // Get first worksheet
    
    const data = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) { // Skip header row
        data.push({
          name: row.getCell(1).value,
          email: row.getCell(2).value,
          importantTask: row.getCell(3).value,
          phoneNumber: row.getCell(4).value,
          smsPhoneNumber: row.getCell(5).value || row.getCell(4).value // Fallback to main phone if SMS not specified
        });
      }
    });
    
    return data;
}

(async () => {
    const excelData = await readExcelData('excelprox.xlsx');
    if (excelData.length === 0) {
        console.error('No data found in Excel file');
        return;
    }
    
    const currentData = excelData[0];

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
        
        // Add a global function to remove popups that we can call from our script
        window.removePopups = function() {
            const selectors = [
                '.wisepops-content',
                '.Popup__WisepopContent-sc-1vpebv6-3',
                '.bhShGD',
                '.VideoStopper__Container-sc-1s4dyko-0',
                '[class*="Popup"]',
                '[class*="popup"]'
            ];
            
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    console.log(`Removing popup with selector: ${selector}`);
                    el.remove();
                });
            }
        };
    });

    // Set up a request interceptor to block popup resources
    await page.setRequestInterception(true);
    page.on('request', (request) => {
        // Block known popup resources
        if (request.url().includes('wisepops') || 
            request.url().includes('popup') || 
            request.url().includes('modal')) {
            console.log(`Blocking request to: ${request.url()}`);
            request.abort();
        } else {
            request.continue();
        }
    });

    // Add a script to automatically remove popups when they appear
    await page.addScriptTag({
        content: `
            // Create a MutationObserver to watch for popups
            const popupObserver = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.addedNodes.length) {
                        // Check if any added nodes match our popup selectors
                        if (window.removePopups) {
                            window.removePopups();
                        }
                    }
                }
            });
            
            // Start observing the document with the configured parameters
            popupObserver.observe(document.body, { childList: true, subtree: true });
            
            // Also set an interval to periodically check for popups
            setInterval(() => {
                if (window.removePopups) {
                    window.removePopups();
                }
            }, 2000);
        `
    }).catch(e => console.log('Error adding popup removal script:', e.message));

    try {
        // Navigate to Google
        await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
        console.log('Loaded Google');
        
        // Try to accept cookies if the dialog appears
        try {
            await page.waitForSelector('#L2AGLb', { timeout: 5000 });
            await page.click('#L2AGLb');
            console.log('Cookies accepted');
        } catch (e) {
            console.log('No cookies popup or already accepted');
        }

        // Search for Wing assistant
        await page.waitForSelector('textarea[name="q"]', { timeout: 5000 });
        await page.type('textarea[name="q"]', 'Wing assistant', { delay: 100 });
        await page.keyboard.press('Enter');
        console.log('Searched for Wing assistant');

        // Wait for search results to load
        await delay(2000);

        // Click first search result
        await page.waitForSelector('h3', { timeout: 8000 });
        const firstResult = await page.$('h3');
        if (firstResult) await firstResult.click();
        console.log('Clicked first search result');

        // Wait for navigation to the result site with enhanced waiting
        console.log('Waiting for Wing assistant site to load...');
        await waitWithProgress(10000, 'Waiting for page load');
        
        // Additional check to confirm we're on the right page
        try {
            await page.waitForSelector('a.elementor-button.elementor-button-link.elementor-size-lg', { 
                timeout: 15000,
                visible: true
            });
            console.log('Wing assistant page confirmed loaded');
        } catch (e) {
            console.error('Failed to confirm Wing assistant page loaded:', e.message);
            throw e;
        }

        // Try to remove popups using our injected function
        await page.evaluate(() => {
            if (window.removePopups) {
                window.removePopups();
            }
        }).catch(e => console.log('Error removing popups:', e.message));

        // ENHANCED WAITING BEFORE CLICKING FREE CONSULTATION BUTTON
        console.log('Performing final checks before clicking Free Consultation...');
        
        const freeConsultButtonSelector = 'a.elementor-button.elementor-button-link.elementor-size-lg';
        
        // Wait for selector to be present and visible
        await page.waitForSelector(freeConsultButtonSelector, { 
            timeout: 20000,
            visible: true
        });
        
        // Additional check that the button is clickable (not obscured)
        await page.waitForFunction((selector) => {
            const button = document.querySelector(selector);
            if (!button) return false;
            
            const style = window.getComputedStyle(button);
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   style.opacity !== '0' && 
                   !button.disabled;
        }, { timeout: 10000 }, freeConsultButtonSelector);
        
        console.log('Free Consultation button confirmed ready for interaction');
        
        // Scroll the button into view
        await page.evaluate((selector) => {
            const button = document.querySelector(selector);
            if (button) button.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, freeConsultButtonSelector);
        
        // Small delay for visual confirmation
        await delay(1000);
        
        // Now click the button
        await page.click(freeConsultButtonSelector);
        console.log('Clicked "Free Consultation" button');

        // Wait for navigation after clicking the button
        await delay(5000);

        // Wait for Calendly iframe to appear
        console.log('Waiting for Calendly iframe to appear...');
        await page.waitForSelector('.calendly-inline-widget iframe', { timeout: 30000 });
        console.log('Found Calendly iframe');
        
        // Wait longer before accessing the iframe to ensure it's fully loaded
        console.log('Waiting for iframe to initialize...');
        await waitWithProgress(10000, 'Waiting for iframe initialization');
        
        // Try to remove popups again
        await page.evaluate(() => {
            if (window.removePopups) {
                window.removePopups();
            }
        }).catch(e => console.log('Error removing popups:', e.message));
        
        let iframeHandle;
        let frame;
        
        try {
            iframeHandle = await page.$('.calendly-inline-widget iframe');
            frame = await iframeHandle.contentFrame();
            console.log('Accessed iframe content');
        } catch (e) {
            console.error('Error accessing iframe:', e.message);
            throw new Error('Failed to access iframe content');
        }

        // Wait even longer for the calendar to fully load
        console.log('Waiting for calendar to fully load...');
        await waitWithProgress(15000, 'Waiting for calendar to load');
        
        // Check if calendar is loaded by looking for various elements
        let calendarLoaded = false;
        let retries = 0;
        const maxRetries = 5;
        
        while (!calendarLoaded && retries < maxRetries) {
            try {
                // Try different selectors to confirm calendar is loaded
                const calendarElements = await frame.evaluate(() => {
                    const selectors = [
                        'table[aria-label="Select a Day"]',
                        '[data-testid="calendar"]',
                        '[data-testid="calendar-table"]',
                        '[data-testid="title"]'
                    ];
                    
                    const results = {};
                    for (const selector of selectors) {
                        const element = document.querySelector(selector);
                        results[selector] = !!element;
                    }
                    
                    // Also check for any buttons that might be date buttons
                    const buttons = document.querySelectorAll('button');
                    results.totalButtons = buttons.length;
                    
                    return results;
                }).catch(e => {
                    console.log('Error evaluating calendar elements:', e.message);
                    return { totalButtons: 0 };
                });
                
                console.log('Calendar elements check:', calendarElements);
                
                if (calendarElements.totalButtons > 0 && 
                    (calendarElements['table[aria-label="Select a Day"]'] || 
                     calendarElements['[data-testid="calendar"]'] || 
                     calendarElements['[data-testid="calendar-table"]'])) {
                    calendarLoaded = true;
                    console.log('Calendar confirmed loaded!');
                } else {
                    console.log(`Calendar not fully loaded yet. Retry ${retries + 1}/${maxRetries}`);
                    await waitWithProgress(5000, 'Waiting for calendar elements');
                    retries++;
                }
            } catch (error) {
                console.log(`Error checking calendar: ${error.message}. Retry ${retries + 1}/${maxRetries}`);
                await waitWithProgress(5000, 'Waiting after error');
                retries++;
            }
        }
        
        if (!calendarLoaded) {
            throw new Error('Calendar failed to load after multiple retries');
        }
        
        // Click on the timezone button to open the dropdown
        console.log('Looking for timezone selector...');
        const timezoneButtonClicked = await frame.evaluate(() => {
            // Try to find the timezone button using various selectors
            const timezoneSelectors = [
                '#timezone-field',
                'button[aria-labelledby*="timezone"]',
                'button[name="Timezone dropdown button"]',
                'button[aria-controls="timezone-menu"]',
                '.wmZOnSIRGTQtGCOTi2G7',
                'button:has(.tEuGaNZxLYHN3rpC1UNA)'
            ];
            
            let timezoneButton = null;
            
            // Try each selector
            for (const selector of timezoneSelectors) {
                const button = document.querySelector(selector);
                if (button) {
                    timezoneButton = button;
                    break;
                }
            }
            
            if (!timezoneButton) {
                console.log('No timezone button found');
                return { clicked: false, reason: 'Not found' };
            }
            
            // Get current timezone before clicking
            const currentTimezone = timezoneButton.textContent.trim();
            
            // Click the button to open dropdown
            timezoneButton.click();
            
            return { 
                clicked: true, 
                currentTimezone: currentTimezone
            };
        }).catch(e => {
            console.log('Error clicking timezone button:', e.message);
            return { clicked: false, reason: 'Error: ' + e.message };
        });
        
        console.log('Timezone button click result:', timezoneButtonClicked);
        
        if (timezoneButtonClicked.clicked) {
            // Wait for the timezone dropdown to appear
            console.log('Waiting for timezone dropdown to appear...');
            await delay(2000);
            
            // Select a random timezone from the dropdown
            const timezoneSelected = await frame.evaluate(() => {
                // Look for timezone options in the dropdown
                const timezoneOptions = Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], li, .dropdown-item'));
                
                if (timezoneOptions.length === 0) {
                    return { selected: false, reason: 'No timezone options found' };
                }
                
                // Filter out any non-timezone options (if possible)
                const filteredOptions = timezoneOptions.filter(option => {
                    const text = option.textContent.toLowerCase();
                    return text.includes('time') || 
                           text.includes('gmt') || 
                           text.includes('utc') || 
                           text.includes('est') || 
                           text.includes('pst') || 
                           text.includes('cet');
                });
                
                const optionsToUse = filteredOptions.length > 0 ? filteredOptions : timezoneOptions;
                
                // Select a random timezone
                const randomIndex = Math.floor(Math.random() * optionsToUse.length);
                const selectedOption = optionsToUse[randomIndex];
                
                // Click the selected timezone
                selectedOption.click();
                
                return { 
                    selected: true, 
                    totalOptions: timezoneOptions.length,
                    selectedText: selectedOption.textContent.trim(),
                    selectedIndex: randomIndex
                };
            }).catch(e => {
                console.log('Error selecting timezone:', e.message);
                return { selected: false, reason: 'Error: ' + e.message };
            });
            
            console.log('Timezone selection result:', timezoneSelected);
            
            // Wait for the calendar to update with the new timezone
            console.log('Waiting for calendar to update with new timezone...');
            await delay(3000);
        }
        
        // Function to check for available days using multiple selectors
        async function findAvailableDays(frame) {
            try {
                return await frame.evaluate(() => {
                    // Try multiple selectors to find available days
                    const selectors = [
                        // Original selector from the HTML
                        'button.XXKN9NWALj8Xe4ed0s7r:not([disabled])',
                        // Try by aria-label containing "Times available"
                        'button[aria-label*="Times available"]:not([disabled])',
                        // Try by looking at all buttons that aren't disabled and contain only numbers
                        'button:not([disabled])',
                        // Try by looking at td[role="gridcell"] that don't have disabled buttons
                        'td[role="gridcell"] button:not([disabled])'
                    ];
                    
                    let availableDays = [];
                    
                    // Try each selector
                    for (const selector of selectors) {
                        const elements = document.querySelectorAll(selector);
                        if (elements.length > 0) {
                            // Filter to only include buttons with numeric content (date buttons)
                            const dateButtons = Array.from(elements).filter(el => {
                                const spanText = el.querySelector('span')?.textContent.trim();
                                return spanText && /^\d+$/.test(spanText);
                            });
                            
                            if (dateButtons.length > 0) {
                                availableDays = dateButtons.map(button => ({
                                    date: button.getAttribute('aria-label'),
                                    day: button.querySelector('span').textContent.trim(),
                                    selector: selector
                                }));
                                break;
                            }
                        }
                    }
                    
                    return availableDays;
                });
            } catch (e) {
                console.log('Error finding available days:', e.message);
                return [];
            }
        }

        // Function to get the current month/year
        async function getCurrentMonth(frame) {
            try {
                return await frame.evaluate(() => {
                    const titleElement = document.querySelector('[data-testid="title"]');
                    return titleElement ? titleElement.textContent.trim() : 'Month not found';
                });
            } catch (e) {
                console.log('Error getting current month:', e.message);
                return 'Error getting month';
            }
        }

        // Function to click next month button
        async function clickNextMonth(frame) {
            try {
                return await frame.evaluate(() => {
                    // Find the next month button
                    const nextMonthButton = Array.from(document.querySelectorAll('button'))
                        .find(btn => {
                            const ariaLabel = btn.getAttribute('aria-label');
                            return ariaLabel && ariaLabel.includes('next month') && !btn.hasAttribute('disabled');
                        });
                    
                    if (nextMonthButton) {
                        nextMonthButton.click();
                        return true;
                    }
                    return false;
                });
            } catch (e) {
                console.log('Error clicking next month:', e.message);
                return false;
            }
        }

        // Check up to 6 months ahead
        let foundAvailableDay = false;
        const maxMonthsToCheck = 6;
        let monthsChecked = 0;
        
        while (!foundAvailableDay && monthsChecked < maxMonthsToCheck) {
            // Try to remove popups on the main page
            await page.evaluate(() => {
                if (window.removePopups) {
                    window.removePopups();
                }
            }).catch(e => console.log('Error removing popups:', e.message));
            
            const currentMonth = await getCurrentMonth(frame);
            console.log(`Checking month: ${currentMonth}`);
            
            // Debug: Print all buttons in the current view
            const allButtons = await frame.evaluate(() => {
                return Array.from(document.querySelectorAll('button')).map(btn => ({
                    text: btn.textContent.trim(),
                    ariaLabel: btn.getAttribute('aria-label'),
                    disabled: btn.hasAttribute('disabled'),
                    classes: btn.className
                }));
            }).catch(e => {
                console.log('Error getting buttons:', e.message);
                return [];
            });
            
            console.log(`Found ${allButtons.length} total buttons`);
            console.log(`Disabled buttons: ${allButtons.filter(b => b.disabled).length}`);
            console.log(`Buttons with numbers: ${allButtons.filter(b => /^\d+$/.test(b.text)).length}`);
            
            // Try to find available days
            const availableDays = await findAvailableDays(frame);
            
            console.log(`Available dates in ${currentMonth}:`);
            console.log(availableDays);
            
            if (availableDays.length > 0) {
                foundAvailableDay = true;
                console.log(`Found available days using selector: ${availableDays[0].selector}`);
                
                // Select a random day from available days
                const randomDay = getRandomItem(availableDays);
                console.log(`Randomly selected day: ${randomDay.day}`);
                
                // Try to remove popups on the main page
                await page.evaluate(() => {
                    if (window.removePopups) {
                        window.removePopups();
                    }
                }).catch(e => console.log('Error removing popups:', e.message));
                
                // Click on the randomly selected available date
                await frame.evaluate((dayText) => {
                    // Find all buttons that aren't disabled
                    const buttons = Array.from(document.querySelectorAll('button:not([disabled])'));
                    
                    // Find the button with the matching day text
                    const dayButton = buttons.find(btn => {
                        const span = btn.querySelector('span');
                        return span && span.textContent.trim() === dayText;
                    });
                    
                    if (dayButton) {
                        dayButton.click();
                        return true;
                    }
                    return false;
                }, randomDay.day).catch(e => {
                    console.log('Error clicking day:', e.message);
                    return false;
                });
                
                console.log(`Clicked on day: ${randomDay.day}`);
                
                // Wait for time slots to appear
                console.log('Waiting for time slots to appear...');
                await waitWithProgress(5000, 'Waiting for time slots');
                
                // Try to remove popups on the main page
                await page.evaluate(() => {
                    if (window.removePopups) {
                        window.removePopups();
                    }
                }).catch(e => console.log('Error removing popups:', e.message));
                
                // Find and get available time slots
                const timeSlots = await frame.evaluate(() => {
                    // Look for buttons that contain AM/PM and are not disabled
                    const timeButtons = Array.from(document.querySelectorAll('button:not([disabled])'))
                        .filter(btn => {
                            const text = btn.textContent.trim();
                            const ariaLabel = btn.getAttribute('aria-label') || '';
                            return (text.includes('AM') || text.includes('PM') || 
                                    ariaLabel.includes('AM') || ariaLabel.includes('PM') ||
                                    /\d+:\d+/.test(text)); // Contains time format like 10:30
                        });
                    
                    return timeButtons.map(btn => ({
                        time: btn.textContent.trim(),
                        ariaLabel: btn.getAttribute('aria-label')
                    }));
                }).catch(e => {
                    console.log('Error getting time slots:', e.message);
                    return [];
                });
                
                console.log(`Found ${timeSlots.length} available time slots`);
                
                if (timeSlots.length > 0) {
                    // Select a random time slot
                    const randomTimeSlot = getRandomItem(timeSlots);
                    console.log(`Randomly selected time slot: ${randomTimeSlot.time}`);
                    
                    // Try to remove popups on the main page
                    await page.evaluate(() => {
                        if (window.removePopups) {
                            window.removePopups();
                        }
                    }).catch(e => console.log('Error removing popups:', e.message));
                    
                    // Click on the randomly selected time slot
                    await frame.evaluate((selectedTime) => {
                        // Find all time buttons
                        const timeButtons = Array.from(document.querySelectorAll('button:not([disabled])'))
                            .filter(btn => {
                                const text = btn.textContent.trim();
                                const ariaLabel = btn.getAttribute('aria-label') || '';
                                return (text.includes('AM') || text.includes('PM') || 
                                        ariaLabel.includes('AM') || ariaLabel.includes('PM') ||
                                        /\d+:\d+/.test(text));
                            });
                        
                        // Find the button with matching time text
                        const timeButton = timeButtons.find(btn => btn.textContent.trim() === selectedTime);
                        
                        if (timeButton) {
                            timeButton.click();
                            return true;
                        }
                        return false;
                    }, randomTimeSlot.time).catch(e => {
                        console.log('Error clicking time slot:', e.message);
                        return false;
                    });
                    
                    console.log(`Clicked on time slot: ${randomTimeSlot.time}`);
                    
                    // Wait for the "Next" button to appear
                    console.log('Waiting for Next button to appear...');
                    await waitWithProgress(5000, 'Waiting for Next button');
                    
                    // Try to remove popups on the main page
                    await page.evaluate(() => {
                        if (window.removePopups) {
                            window.removePopups();
                        }
                    }).catch(e => console.log('Error removing popups:', e.message));
                    
                    // Find and click the specific Next button using the provided attributes
                    const clickedNext = await frame.evaluate((selectedTime) => {
                        // Look for the specific Next button with the attributes provided
                        // The aria-label will include the selected time
                        const nextButton = Array.from(document.querySelectorAll('button[role="button"][type="button"]'))
                            .find(btn => {
                                const ariaLabel = btn.getAttribute('aria-label') || '';
                                const classes = btn.className || '';
                                
                                // Check if it has "Next" in the aria-label and contains the selected time
                                // Also check for the specific class pattern
                                return ariaLabel.includes('Next') && 
                                       (ariaLabel.includes(selectedTime) || ariaLabel.toLowerCase().includes('next')) &&
                                       classes.includes('uvkj3lh');
                            });
                        
                        if (nextButton) {
                            console.log(`Found Next button with aria-label: ${nextButton.getAttribute('aria-label')}`);
                            nextButton.click();
                            return { clicked: true, ariaLabel: nextButton.getAttribute('aria-label') };
                        }
                        
                        // Fallback: try to find any button that contains "Next" text or has "next" in aria-label
                        const fallbackNextButton = Array.from(document.querySelectorAll('button:not([disabled])'))
                            .find(btn => {
                                const text = btn.textContent.trim().toLowerCase();
                                const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                                return text.includes('next') || ariaLabel.includes('next');
                            });
                        
                        if (fallbackNextButton) {
                            console.log('Found fallback Next button');
                            fallbackNextButton.click();
                            return { clicked: true, fallback: true };
                        }
                        
                        return { clicked: false, reason: 'Next button not found' };
                    }, randomTimeSlot.time).catch(e => {
                        console.log('Error clicking Next button:', e.message);
                        return { clicked: false, error: e.message };
                    });
                    
                    if (clickedNext.clicked) {
                        console.log('Successfully clicked Next button:', clickedNext);
                        
                        // Wait for the form to load
                        console.log('Waiting for form to load...');
                        await waitWithProgress(8000, 'Waiting for form to appear');
                        
                        // Try to remove popups on the main page
                        await page.evaluate(() => {
                            if (window.removePopups) {
                                window.removePopups();
                            }
                        }).catch(e => console.log('Error removing popups:', e.message));
                        
                        // IMPROVED FORM FILLING SECTION
                        console.log('Starting form filling process...');
                        
                        // First verify our data
                        console.log('Verifying form data:', {
                            name: typeof currentData.name,
                            email: typeof currentData.email,
                            importantTask: typeof currentData.importantTask,
                            phoneNumber: typeof currentData.phoneNumber,
                            smsPhoneNumber: typeof currentData.smsPhoneNumber
                        });
                        
                        // Fill each field separately with error handling
                        async function fillField(frame, fieldId, value) {
                            try {
                                const result = await frame.evaluate(({id, val}) => {
                                    const input = document.getElementById(id);
                                    if (!input) {
                                        console.log(`Field ${id} not found`);
                                        return {success: false, error: `Field ${id} not found`};
                                    }
                                    
                                    // Verify the value is a string
                                    if (typeof val !== 'string') {
                                        console.log(`Value for ${id} is not a string:`, val);
                                        return {success: false, error: `Value for ${id} is not a string`};
                                    }
                                    
                                    input.value = val;
                                    input.dispatchEvent(new Event('input', { bubbles: true }));
                                    return {success: true};
                                }, {id: fieldId, val: String(value)});
                                
                                console.log(`Field ${fieldId} fill result:`, result);
                                return result;
                            } catch (e) {
                                console.error(`Error filling field ${fieldId}:`, e);
                                return {success: false, error: e.message};
                            }
                        }
                        
                        // Fill each field one by one
                        const fillResults = {
                            name: await fillField(frame, 'full_name_input', currentData.name),
                            email: await fillField(frame, 'email_input', currentData.email),
                            importantTask: await fillField(frame, 'rZx2QBcS9XfckC49eTE0I', currentData.importantTask),
                            phoneNumber: await fillField(frame, 'prddK5OHsPhgHIoJnK7bw', currentData.phoneNumber)
                        };
                        
                        // Fill SMS phone if available
                        if (currentData.smsPhoneNumber) {
                            fillResults.smsPhone = await fillField(frame, '87R-S08PlTsiZKN5s8FXk', currentData.smsPhoneNumber);
                        }
                        
                        console.log('All fields fill results:', fillResults);
                        
                        // Wait a moment for any validation to complete
                        await delay(2000);
                        
                        // Submit the form (commented out as per original code)
                        // const submitResult = await frame.evaluate(() => {
                        //     try {
                        //         const submitButton = document.querySelector('button[type="submit"]');
                        //         if (submitButton) {
                        //             submitButton.click();
                        //             return { clicked: true };
                        //         }
                        //         return { clicked: false, reason: 'Submit button not found' };
                        //     } catch (e) {
                        //         return { clicked: false, error: e.message };
                        //     }
                        // });
                        
                        // console.log('Submit result:', submitResult);
                        
                        // Wait for confirmation page
                        await waitWithProgress(10000, 'Waiting for confirmation');
                        
                        // Check for success
                        const confirmation = await frame.evaluate(() => {
                            const confirmationText = document.querySelector('[data-testid="confirmation-page"]')?.textContent || 
                                                   document.querySelector('h1, h2, h3')?.textContent;
                            return confirmationText?.includes('Confirmed') || 
                                   confirmationText?.includes('Scheduled') || 
                                   confirmationText?.includes('Thank you');
                        }).catch(() => false);
                        
                        if (confirmation) {
                            console.log('Successfully scheduled appointment!');
                        } else {
                            console.log('Appointment confirmation not detected');
                        }
                    } else {
                        console.log('Failed to click Next button:', clickedNext);
                    }
                } else {
                    console.log('No available time slots found');
                }
            } else {
                console.log(`No available days found in ${currentMonth}. Checking next month...`);
                
                // Try to remove popups on the main page
                await page.evaluate(() => {
                    if (window.removePopups) {
                        window.removePopups();
                    }
                }).catch(e => console.log('Error removing popups:', e.message));
                
                const nextMonthClicked = await clickNextMonth(frame);
                if (nextMonthClicked) {
                    console.log('Clicked to go to next month');
                    await waitWithProgress(3000, 'Waiting for next month to load');
                    monthsChecked++;
                } else {
                    console.log('Could not navigate to next month');
                    break;
                }
            }
        }
        
        if (!foundAvailableDay) {
            console.log(`No available days found after checking ${monthsChecked} months`);
        }

    } catch (error) {
        console.error('Error:', error.message);
    }

    // Keep the browser open for debugging
    console.log('Script completed. Browser will remain open for debugging.');
    // Uncomment the line below to close the browser when done
    // await browser.close();
})();