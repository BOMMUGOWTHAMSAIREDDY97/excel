/*
 * ESP32 Battery Monitor -> Supabase Integration
 * 
 * Hardware: ESP32 + Battery Monitoring Circuit (Voltage/Current sensors)
 * Dependencies: 
 *  - ArduinoJson (by Benoit Blanchon)
 *  - HTTPClient (built-in)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// WiFi Credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Supabase Configuration
const String supabase_url = "https://jmknmbgssiztxzdttsmp.supabase.co/rest/v1/battery_data";
const String supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impta25tYmdzc2l6dHh6ZHR0c21wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0OTc0MjIsImV4cCI6MjA4OTA3MzQyMn0.EViFTAl-lpeaz3RkjNefe4aKQvRto9AqINPvLI_G7nc";

// Simulation parameters (replace with real sensor readings)
float voltage = 3.9;
float current = 2.1;
float temperature = 38.0;
float soc = 85.0;
float soh = 94.0;

void setup() {
  Serial.begin(115200);
  
  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    // 1. Simulate changing data (Replace this with real sensor reads)
    voltage += (random(-10, 11) / 100.0);
    current = 1.0 + (random(0, 300) / 100.0);
    temperature += (random(-5, 6) / 10.0);
    soc -= 0.05;

    // 2. Prepare JSON payload
    StaticJsonDocument<200> doc;
    doc["voltage"] = voltage;
    doc["current"] = current;
    doc["temperature"] = temperature;
    doc["soc"] = soc;
    doc["soh"] = soh;

    String jsonPayload;
    serializeJson(doc, jsonPayload);

    // 3. Send HTTP POST to Supabase
    HTTPClient http;
    http.begin(supabase_url);
    
    http.addHeader("apikey", supabase_key);
    http.addHeader("Authorization", "Bearer " + supabase_key);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Prefer", "return=minimal");

    Serial.print("Sending data: ");
    Serial.println(jsonPayload);

    int httpResponseCode = http.POST(jsonPayload);

    if (httpResponseCode > 0) {
      Serial.print("HTTP Response code: ");
      Serial.println(httpResponseCode);
    } else {
      Serial.print("Error code: ");
      Serial.println(httpResponseCode);
    }
    
    http.end();
  }

  // Send data every 5 seconds
  delay(5000);
}
