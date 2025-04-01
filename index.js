require('dotenv').config({ path: './mail.env' });  // Add this at the top of your main server file
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const Student = require('./models/student');
const Event = require('./models/event');
const natural = require('natural');

const app = express();
const port = 5000;

app.use(express.json());
app.use(cors());



mongoose.connect('mongodb+srv://subhiksharajaram59:ONZM8nxxIk9sbi2e@cluster0.bcusekr.mongodb.net/student')
    .then(() => console.log('Connected to MongoDB'))
    .catch((error) => {
        console.error('Error connecting to MongoDB:', error);
        process.exit(1); // Exit the process if the connection fails
    });

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // Use environment variables for sensitive data
        pass: process.env.EMAIL_PASS,
    },
});

// Middleware to authenticate user
const authenticateUser = async (req, res, next) => {
    const { username } = req.body;
    if (!username) return res.status(401).json({ error: 'Username required' });
    const student = await Student.findOne({ username });
    if (!student) return res.status(401).json({ error: 'User not found' });
    req.user = student;
    next();
};

// Signup route
app.post('/signup', async (req, res) => {
    const { name, age, collegeName, gender, email, username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newStudent = new Student({
            name,
            age,
            collegeName,
            gender,
            email,
            username,
            password: hashedPassword,
        });
        await newStudent.save();
        res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
        if (error.code === 11000) {
            res.status(400).json({ error: 'Email or username already exists' });
        } else {
            console.error('Error during signup:', error);
            res.status(500).json({ error: 'Error creating user' });
        }
    }
});

// Login route
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const student = await Student.findOne({ username });
        if (!student) {
            return res.status(400).json({ success: false, error: 'Invalid username or password' });
        }
        const isMatch = await bcrypt.compare(password, student.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, error: 'Invalid username or password' });
        }
        res.json({
            success: true,
            message: 'Login successful',
            user: {
                username: student.username,
                _id: student._id,
            },
        });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ success: false, error: 'Error during login' });
    }
});

// Fetch all active events
app.get('/events/active', async (req, res) => {
    try {
        console.log('Fetching active events...');
        const activeEvents = await Event.find({ isActive: true }).sort({ startDate: 1 });
        console.log('Active Events:', activeEvents);
        res.json(activeEvents);
    } catch (error) {
        console.error('Error fetching active events:', error);
        res.status(500).json({ error: 'Error fetching active events' });
    }
});

// Fetch event by ID
app.get('/events/:eventId', async (req, res) => {
    const { eventId } = req.params;

    // Validate if eventId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
        return res.status(400).json({ error: 'Invalid event ID' });
    }

    try {
        const event = await Event.findById(eventId);
        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }
        res.json(event);
    } catch (error) {
        console.error('Error fetching event:', error);
        res.status(500).json({ error: 'Error fetching event' });
    }
});

app.post('/register', authenticateUser, async (req, res) => {
    const { eventId, name, email, phone } = req.body;
    console.log('Register Request Body:', req.body);
  
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      console.log('Invalid eventId:', eventId);
      return res.status(400).json({ error: 'Invalid event ID' });
    }
  
    try {
      const event = await Event.findById(eventId);
      console.log('Found Event:', event);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }
  
      const student = req.user;
      console.log('Student:', student);
      if (student.registeredEvents.some(reg => reg.eventId.toString() === eventId)) {
        return res.status(400).json({ error: 'You are already registered for this event' });
      }
  
      const registrationId = new mongoose.Types.ObjectId();
      const qrData = {
        registrationId: registrationId.toString(),
        eventId: eventId,
        studentId: student._id.toString(),
        name: name,
        email: email,
      };
      console.log('QR Data:', qrData);
      const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData));
      console.log('QR Code Generated');
  
      student.registeredEvents.push({
        eventId,
        registrationId,
        registrationDetails: { name, email, phone },
        qrCodeDataURL,
        checkedIn: false,
      });
      await student.save();
      console.log('Student Updated');
  
      const mailOptions = {
        from: process.env.EMAIL_USER || 'subhikshasree19@gmail.com',
        to: email,
        subject: `🎉 Registration Successful for ${event.name} 🎉`,
        html: `
          <h2>Registration Confirmation🎊🎊</h2>
          <p>Hey ${name},</p>
          <p>You're officially signed up for ${event.name}!</p>
          <p>Your check-in QR code:</p>
          <img src="${qrCodeDataURL}" alt="QR Code" style="width: 200px; height: 200px;"/>
          <p>Present this QR code at the event entrance for quick check-in.☺️</p>
             <p style="font-weight: bold; color: #ff5722;">See you at the event! ✨</p>
              <p>Cheers,<br/>✨The Univents Team✨</p>
        `,
        attachments: [{
          filename: 'event-qrcode.png',
          content: qrCodeDataURL.split('base64,')[1],
          encoding: 'base64',
        }],
      };
      await transporter.sendMail(mailOptions);
      console.log('Email Sent');
  
      res.status(201).json({
        message: 'Successfully registered for the event',
        qrCodeDataURL,
        registrationId: registrationId.toString(),
      });
    } catch (error) {
      console.error('Error registering:', error.message, error.stack);
      res.status(500).json({ error: 'Error registering for event', details: error.message });
    }
  });
// NLP Search Endpoint
app.post('/search/nlp', async (req, res) => {
    const { query } = req.body;
    try {
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Invalid search query' });
        }

        const tokenizer = new natural.WordTokenizer();
        const tokens = tokenizer.tokenize(query.toLowerCase());
        console.log('Tokens:', tokens);

        const eventTypes = ['lecture', 'workshop', 'club', 'fest', 'seminar', 'conference', 'paper presentation'];
        const timePhrases = {
            'today': { $gte: new Date(), $lt: new Date(new Date().setHours(24, 0, 0, 0)) },
            'tomorrow': { $gte: new Date(new Date().setHours(24, 0, 0, 0)), $lt: new Date(new Date().setHours(48, 0, 0, 0)) },
            'week': { $gte: new Date(), $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
            'next week': { $gte: new Date(), $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
            'this week': { $gte: new Date(), $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
            'in next week': { $gte: new Date(), $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
            'month': { $gte: new Date(), $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
            'this month': { $gte: new Date(), $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
            'in next month': { $gte: new Date(), $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
        };

        let festTypeFilter = [];
        let dateFilter = {};
        let nameFilter = [];
        let i = 0;

        // Process tokens to detect multi-word time phrases
        while (i < tokens.length) {
            // Check for multi-word phrases first
            let multiWordPhrase = '';
            if (i + 2 < tokens.length) {
                multiWordPhrase = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
                if (timePhrases[multiWordPhrase]) {
                    dateFilter = timePhrases[multiWordPhrase];
                    i += 3;
                    continue;
                }
            }
            if (i + 1 < tokens.length) {
                multiWordPhrase = `${tokens[i]} ${tokens[i + 1]}`;
                if (timePhrases[multiWordPhrase]) {
                    dateFilter = timePhrases[multiWordPhrase];
                    i += 2;
                    continue;
                }
            }
            // Single-word checks
            const token = tokens[i];
            if (eventTypes.includes(token)) {
                festTypeFilter.push(token);
            } else if (timePhrases[token]) {
                dateFilter = timePhrases[token];
            } else {
                nameFilter.push(token);
            }
            i++;
        }

        // Build MongoDB query
        const searchQuery = {
            startDate: { $gte: new Date() }, // Default to future/current events
        };

        if (festTypeFilter.length > 0) {
            searchQuery.festType = { $in: festTypeFilter.map(type => new RegExp(type, 'i')) };
        }

        if (Object.keys(dateFilter).length > 0) {
            searchQuery.startDate = { ...searchQuery.startDate, ...dateFilter };
        }

        if (nameFilter.length > 0) {
            searchQuery.name = { $in: nameFilter.map(name => new RegExp(name, 'i')) };
        }

        console.log('Fest Type Filter:', festTypeFilter);
        console.log('Date Filter:', dateFilter);
        console.log('Name Filter:', nameFilter);
        console.log('MongoDB Query:', searchQuery);

        const events = await Event.find(searchQuery).sort({ startDate: 1 });
        console.log('Query Results:', events.length ? events : 'No events found');
        res.json(events);
    } catch (error) {
        console.error('Error in NLP search:', error);
        res.status(500).json({ error: 'Error searching events' });
    }
});
// Fetch registered events for a user
app.post('/user/registered-events', async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    try {
        // Find the user and populate their registered events
        const user = await Student.findOne({ username }).populate('registeredEvents.eventId');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Map the registered events to include event details
        const registeredEvents = user.registeredEvents.map(event => {
            if (!event.eventId) {
                console.warn('Missing eventId for registered event:', event); // Debug log
                return null; // Skip invalid entries
            }
            return {
                ...event.eventId._doc,
                registrationDetails: event.registrationDetails,
            };
        }).filter(event => event !== null); // Filter out null entries

        res.json(registeredEvents);
    } catch (error) {
        console.error('Error fetching registered events:', error);
        res.status(500).json({ error: 'Error fetching registered events' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});