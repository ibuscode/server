const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const mongoose = require('mongoose');
const moment = require('moment');
const Event = require('./models/event');

// Load environment variables (optional but recommended)
require('dotenv').config();

// Custom delay function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// MongoDB connection with flexibility
const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/student';
mongoose.connect(mongoURI, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true 
})
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

async function scrapeKnowAFest() {
    let browser;
    try {
        // Launch Puppeteer with default Chromium and common args for compatibility
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'], // Improves compatibility across systems
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        // Navigate to the page
        console.log('Navigating to KnowAFest...');
        await page.goto('https://www.knowafest.com/explore/upcomingfests', { waitUntil: 'networkidle2', timeout: 30000 });

        // Scroll to load dynamic content
        console.log('Scrolling page...');
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await delay(5000); // Wait for content to load

        // Wait for the table explicitly
        console.log('Waiting for table...');
        await page.waitForSelector('#tablaDatos', { timeout: 20000 });

        // Scrape events
        const events = await page.evaluate(() => {
            const rows = document.querySelectorAll('#tablaDatos tbody tr:not(:first-child)');
            return Array.from(rows).map(row => {
                const startDate = row.querySelector('td[itemprop="startDate"]')?.innerText.trim() || '';
                const nameElement = row.querySelector('td[itemprop="name"]');
                const festName = nameElement?.childNodes[0].textContent.trim() || 'Unknown';
                const festType = row.cells[2]?.innerText.trim() || 'Unknown';
                const readmore = row.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || '';
                return { 
                    startDate, 
                    festName, 
                    festType, 
                    readmore: readmore ? `https://www.knowafest.com${readmore}` : '' 
                };
            });
        });

        // Format events for MongoDB
        const formattedEvents = events.map(event => ({
            name: event.festName,
            startDate: moment(event.startDate, 'DD MMM YYYY').toDate(),
            festType: event.festType,
            readmore: event.readmore,
            organizer: 'KnowAFest'
        })).filter(event => !isNaN(event.startDate.getTime()));

        console.log('Extracted events:', formattedEvents);

        // Clear old events and insert new ones
        await Event.deleteMany({ organizer: 'KnowAFest' });
        await Event.insertMany(formattedEvents);
        console.log(`Added ${formattedEvents.length} events from KnowAFest`);

    } catch (error) {
        console.error('Error scraping KnowAFest:', error);
        if (browser) {
            const page = (await browser.pages())[0];
            const pageContent = await page.content();
            console.log('Page HTML snippet (first 2000 chars):', pageContent.substring(0, 2000));
        }
    } finally {
        // Clean up
        if (browser) await browser.close();
        await mongoose.connection.close();
        console.log('Browser and MongoDB connection closed.');
    }
}

scrapeKnowAFest();