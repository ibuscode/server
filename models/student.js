const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
    name: String,
    age: Number,
    collegeName: String,
    gender: String,
    email: { type: String, unique: true },
    username: { type: String, unique: true },
    password: String,
    registeredEvents: [{
        eventId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Event' 
        },
        registrationId: {
            type: mongoose.Schema.Types.ObjectId,
            default: () => new mongoose.Types.ObjectId(),
        },
        registeredAt: { 
            type: Date, 
            default: Date.now 
        },
        registrationDetails: {
            name: String,
            email: String,
            phone: String,
        },
        qrCodeDataURL: String,
        checkedIn: {
            type: Boolean,
            default: false
        },
        checkInTime: Date
    }]
});

// Define unique index for registrationId
studentSchema.index({ 'registeredEvents.registrationId': 1 }, { unique: true });

const Student = mongoose.model('Student', studentSchema);
module.exports = Student;