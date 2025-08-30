require('dotenv').config();  // Load environment variables from .env file

// Import dependencies
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const twilio = require('twilio');

// Initialize Express app
const app = express();
const port = process.env.PORT || 5000; // Using a single port for both services

// Twilio Configuration
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const client = new twilio(accountSid, authToken);

// Middleware
app.use(cors()); // Enable CORS for cross-origin requests
app.use(express.json()); // Parse JSON payloads
app.use(bodyParser.json());  // Middleware for body parsing

// Connect to MongoDB for reminders and appointments
const MONGO_URI = process.env.MONGO_URI || 'your_default_mongo_uri_here';
mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1); // Exit process if unable to connect
  });

// Mongoose schema and model for reminders
const reminderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  time: { type: Date, required: true },
  message: { type: String, required: true },
});

const Reminder = mongoose.model('Reminder', reminderSchema);

// Mongoose schema and model for appointments
const appointmentSchema = new mongoose.Schema({
  date: { type: String, required: true },
  time: { type: String, required: true },
  doctor: { type: String, required: true },
  phone: { type: String, required: true }, // Added phone number for reminder notifications
});

const Appointment = mongoose.model('Appointment', appointmentSchema);

// Test route to check if the server is running
app.get('/', (req, res) => {
  res.send('Server is running - Reminder and Appointment services');
});

// Routes for reminders
app.get('/api/reminders', async (req, res) => {
  try {
    const reminders = await Reminder.find();
    res.status(200).json(reminders);
  } catch (err) {
    console.error('Error fetching reminders:', err.message);
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

// Create a reminder
app.post('/api/reminders', async (req, res) => {
  const { name, phone, time, message } = req.body;

  if (!name || !phone || !time || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Save the reminder
    const reminder = new Reminder({ name, phone, time, message });
    const savedReminder = await reminder.save();

    // Schedule the SMS notification
    const sendTime = new Date(time).getTime();
    const currentTime = new Date().getTime();

    if (sendTime > currentTime) {
      setTimeout(() => {
        client.messages
          .create({
            body: `Reminder for ${name},  ${message}`,
            from: twilioPhoneNumber,
            to: phone,
          })
          .then((message) => console.log('Reminder sent:', message.sid))
          .catch((error) => {
            console.error('Error sending reminder:', error.message);
          });
      }, sendTime - currentTime);
    }

    // Respond with the created reminder
    res.status(201).json(savedReminder);
  } catch (err) {
    console.error('Error creating reminder:', err.message);
    res.status(500).json({ error: 'Failed to create a reminder' });
  }
});

// Delete a reminder
app.delete('/api/reminders/:id', async (req, res) => {
  try {
    const reminderId = req.params.id;
    const reminder = await Reminder.findByIdAndDelete(reminderId);

    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    res.status(200).json({ message: 'Reminder deleted successfully' });
  } catch (err) {
    console.error('Error deleting reminder:', err.message);
    res.status(500).json({ error: 'Failed to delete the reminder' });
  }
});

// Routes for appointments
// Get all appointments
app.get('/api/appointments', async (req, res) => {
  try {
    const appointments = await Appointment.find();
    res.status(200).json(appointments);
  } catch (err) {
    console.error('Error fetching appointments:', err.message);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});
// Create an appointment and send an SMS reminder
app.post('/api/appointments', async (req, res) => {
  const { date, time, doctor, phone } = req.body;

  if (!date || !time || !doctor || !phone) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const appointment = new Appointment({ date, time, doctor, phone });
    const savedAppointment = await appointment.save();

    // Schedule the SMS notification for the appointment
    const appointmentTime = new Date(`${date} ${time}`).getTime();
    const currentTime = new Date().getTime();

    if (appointmentTime > currentTime) {
      setTimeout(() => {
        client.messages
          .create({
            body: `Reminder: You have an appointment scheduled with Dr. ${doctor} at ${time} on ${date}.`,
            from: twilioPhoneNumber,
            to: phone,
          })
          .then((message) => console.log('Appointment reminder sent:', message.sid))
          .catch((error) => {
            console.error('Error sending appointment reminder:', error.message);
          });
      }, appointmentTime - currentTime);
    }

    res.status(201).json(savedAppointment);
  } catch (err) {
    console.error('Error creating appointment:', err.message);
    res.status(500).json({ error: 'Failed to create an appointment' });
  }
});
// Update a reminder
// Update an existing appointment
app.put('/api/appointments/:id', async (req, res) => {
  const { date, time, doctor, phone } = req.body;
  const appointmentId = req.params.id;

  if (!date || !time || !doctor || !phone) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const updatedAppointment = await Appointment.findByIdAndUpdate(
      appointmentId,
      { date, time, doctor, phone },
      { new: true } // This option ensures the updated document is returned
    );
    client.messages
      .create({
        body: `Reminder: Your appointment has been  rescheduled with Dr. ${doctor} at ${time} on ${date}.`,
        from: twilioPhoneNumber,
        to: phone,
      })

    if (!updatedAppointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.status(200).json(updatedAppointment); // Send the updated appointment back in response
  } catch (err) {
    console.error('Error updating appointment:', err.message);
    res.status(500).json({ error: 'Failed to update the appointment' });
  }
});

// Delete a reminder
app.delete('/api/reminders/:id', async (req, res) => {
  try {
    const reminderId = req.params.id;
    const reminder = await Reminder.findByIdAndDelete(reminderId);

    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    res.status(200).json({ message: 'Reminder deleted successfully' });
  } catch (err) {
    console.error('Error deleting reminder:', err.message);
    res.status(500).json({ error: 'Failed to delete the reminder' });
  }
});


// Routes for SOS alert (separate from reminders)
app.post('/sos', async (req, res) => {
  const { phoneNumber, message } = req.body;

  if (!phoneNumber || !message) {
    return res.status(400).json({ status: 'error', message: 'Phone number and message are required.' });
  }

  try {
    const smsResponse = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,  // Twilio phone number
      to: phoneNumber,          // Recipient phone number
    });

    console.log('Response:', smsResponse); // Log the full response

    res.status(200).json({ status: 'success', message: 'SOS alert sent successfully!' });
  } catch (error) {
    console.error('Error sending SMS:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to send SOS alert. Please try again.',
      error: error.message,
    });
  }
});

// Start the server on a single port
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
