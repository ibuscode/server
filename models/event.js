const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    name: String,
    startDate: Date,
    endDate: Date,
    festType: String,
    readmore: String,
    organizer: String,
    location: String,
    description: String,
    isActive: { type: Boolean, default: true }, // Add this field
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);