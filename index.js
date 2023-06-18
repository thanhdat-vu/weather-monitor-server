const express = require("express");
const mqtt = require("mqtt");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(express.json());
app.use(cors());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error);
  });

// Create a schema for temperature and humidity data
const dataSchema = new mongoose.Schema({
  temperature: [
    {
      x: String,
      y: Number,
    },
  ],
  humidity: [
    {
      x: String,
      y: Number,
    },
  ],
});

// Create a model for temperature and humidity data
const Data = mongoose.model("Data", dataSchema);

// MQTT topics to subscribe to
const temperatureTopic = "temperature";
const humidityTopic = "humidity";

// Connect to the MQTT broker
const mqttClient = mqtt.connect({
  host: process.env.HIVEMQ_HOST,
  port: process.env.HIVEMQ_PORT,
  protocol: "mqtts",
  username: process.env.HIVEMQ_USERNAME,
  password: process.env.HIVEMQ_PASSWORD,
});

// MQTT connection event handlers
mqttClient.on("connect", () => {
  console.log("Connected to MQTT broker");
  // Subscribe to temperature and humidity topics
  mqttClient.subscribe([temperatureTopic, humidityTopic]);
});

mqttClient.on("message", async (topic, message) => {
  // Handle incoming MQTT messages
  console.log(`Received message on topic '${topic}': ${message.toString()}`);

  const x = new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const y = parseInt(message.toString());

  // Save data to MongoDB
  try {
    // Find the existing data or create a new one
    let data = await Data.findOne({});
    if (!data) {
      data = new Data({
        temperature: [],
        humidity: [],
      });
    }

    // Push new data point to the corresponding arrays and maintain only the latest 6 data points
    if (topic === temperatureTopic) {
      data.temperature.push({ x, y });
      data.temperature = data.temperature.slice(-6);
    } else if (topic === humidityTopic) {
      data.humidity.push({ x, y });
      data.humidity = data.humidity.slice(-6);
    }

    // Save updated data to MongoDB
    await data.save();
  } catch (error) {
    console.error("Error saving data:", error);
  }
});

mqttClient.on("error", (error) => {
  console.error("MQTT error:", error);
});

// API routes for retrieving data
app.get("/api/data", async (req, res) => {
  try {
    const data = await Data.findOne().lean().exec();
    if (!data || !data.temperature || !data.humidity) {
      res.status(404).json({ message: "Data not found" });
    } else {
      res.json({
        temperature: data.temperature.map(({ _id, ...item }) => item),
        humidity: data.humidity.map(({ _id, ...item }) => item),
      });
    }
  } catch (error) {
    console.error("Error retrieving data:", error);
    res.status(500).json({ message: "Error retrieving data" });
  }
});

// Start the server
const port = 5000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
