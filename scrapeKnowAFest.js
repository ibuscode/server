const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const mongoose = require('mongoose');
const moment = require('moment');
const Event = require('./models/event');
require('dotenv').config();

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const mongoURI = 'mongodb+srv://subhiksharajaram59:ONZM8nxxIk9sbi2e@cluster0.bcusekr.mongodb.net/student';
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

async function scrapeKnowAFest() {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: false, // Set to true in production
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        console.log('Navigating to KnowAFest...');
        await page.goto('https://www.knowafest.com/explore/upcomingfests', { waitUntil: 'networkidle2', timeout: 60000 });

        console.log('Waiting for the events table...');
        await page.waitForSelector('#tablaDatos', { timeout: 20000 });

        // Ensure all rows are visible
        await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight);
        });
        await delay(5000); // Extra wait to load dynamic content

        console.log('Scraping event details...');
        const events = await page.evaluate(() => {
            const rows = document.querySelectorAll('#tablaDatos tbody tr');
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

        console.log('Processing extracted data...');
        const formattedEvents = events
            .filter(event => event.startDate) // Filter out invalid dates
            .map(event => ({
                name: event.festName,
                startDate: moment(event.startDate, 'DD MMM YYYY').toDate(),
                festType: event.festType,
                readmore: event.readmore,
                organizer: 'KnowAFest'
            }));

        console.log('Extracted events:', formattedEvents);

        if (formattedEvents.length === 0) {
            throw new Error('No events found, check if the website structure has changed.');
        }

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
        if (browser) await browser.close();
        await mongoose.connection.close();
        console.log('Browser and MongoDB connection closed.');
    }
}

scrapeKnowAFest();
