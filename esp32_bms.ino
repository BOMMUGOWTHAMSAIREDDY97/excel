#include <WiFi.h>
#include <Wire.h>
#include <Adafruit_INA219.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>


// ================= WIFI =================
const char* ssid = "GOWTHAM";
const char* password = "123456789";

// ================= SUPABASE (REAL CREDENTIALS) =================
const char* supabaseUrl = "https://jmknmbgssiztxzdttsmp.supabase.co/rest/v1/battery_data";
const char* supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impta25tYmdzc2l6dHh6ZHR0c21wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0OTc0MjIsImV4cCI6MjA4OTA3MzQyMn0.EViFTAl-lpeaz3RkjNefe4aKQvRto9AqINPvLI_G7nc";

// ================= HARDWARE =================
Adafruit_INA219 ina219;

#define ONE_WIRE_BUS 4
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

Adafruit_SSD1306 display(128, 64, &Wire, -1);

// Pins
#define RELAY_PIN 23
#define FAN_PIN 19
#define BUZZER_PIN 18

// ================= TIMING =================
unsigned long lastCloudUpload = 0;
const unsigned long uploadInterval = 10000;

unsigned long lastSensorRead = 0;
const unsigned long sensorInterval = 500;

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);

  pinMode(RELAY_PIN, OUTPUT);
  pinMode(FAN_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  digitalWrite(RELAY_PIN, LOW);
  digitalWrite(FAN_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  // OLED
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED failed");
    while (1);
  }

  display.clearDisplay();
  display.setTextColor(WHITE);
  display.setCursor(0, 0);
  display.println("Connecting WiFi...");
  display.display();

  // WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi Connected");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());

  // INA219 check
  if (!ina219.begin()) {
    Serial.println("INA219 NOT FOUND!");
    while (1);
  }

  sensors.begin();
}

// ================= LOOP =================
void loop() {
  unsigned long now = millis();

  if (now - lastSensorRead >= sensorInterval) {
    lastSensorRead = now;

    // -------- READ SENSORS --------
    float voltage = ina219.getBusVoltage_V();

    float current_mA = ina219.getCurrent_mA();

    // Fix NaN issue
    if (isnan(current_mA)) {
      current_mA = 0;
    }

    float current = current_mA / 1000.0;

    sensors.requestTemperatures();
    float temperature = sensors.getTempCByIndex(0);

    // SOC
    float soc = constrain(((voltage - 3.0) / 1.2) * 100, 0, 100);

    float soh = 95.0;

    // -------- SAFETY --------
    if (temperature > 50.0 || voltage > 4.25) {
      digitalWrite(RELAY_PIN, HIGH);   // cut load
      digitalWrite(BUZZER_PIN, HIGH);
    } else {
      digitalWrite(RELAY_PIN, LOW);    // allow load
      digitalWrite(BUZZER_PIN, LOW);
    }

    // FAN control
    if (temperature > 40.0) {
      digitalWrite(FAN_PIN, HIGH);
    } else if (temperature < 35.0) {
      digitalWrite(FAN_PIN, LOW);
    }

    // -------- DEBUG SERIAL --------
    Serial.print("V: "); Serial.print(voltage);
    Serial.print(" | I: "); Serial.print(current);
    Serial.print(" | Temp: "); Serial.println(temperature);

    // -------- DISPLAY --------
    updateOLED(voltage, current, temperature, soc, soh);

    // -------- CLOUD --------
    if (now - lastCloudUpload >= uploadInterval) {
      lastCloudUpload = now;
      sendToSupabase(voltage, current, temperature, soc, soh);
    }
  }
}

// ================= OLED =================
void updateOLED(float v, float i, float t, float soc, float soh) {
  display.clearDisplay();
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.printf("V: %.2f V", v);

  display.setCursor(0, 12);
  display.printf("I: %.3f A", i);

  display.setCursor(0, 24);
  display.printf("Temp: %.1f C", t);

  display.setCursor(0, 36);
  display.printf("SOC: %.1f %%", soc);

  display.setCursor(0, 48);
  display.printf("SOH: %.1f %%", soh);

  display.setCursor(0, 56);

  if (t > 50 || v > 4.25) {
    display.print("CRITICAL!");
  } else if (t > 40) {
    display.print("COOLING...");
  } else {
    display.print("NORMAL");
  }

  display.display();
}

// ================= SUPABASE =================
void sendToSupabase(float voltage, float current, float temperature, float soc, float soh) {

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected! Reconnecting...");
    WiFi.reconnect();
    return;
  }

  WiFiClientSecure client;
  client.setInsecure(); // No need for SSL certificate validation

  HTTPClient http;
  http.begin(client, supabaseUrl);

  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", supabaseKey);
  http.addHeader("Authorization", "Bearer " + String(supabaseKey));
  http.addHeader("Prefer", "return=minimal");

  String json = "{";
  json += "\"voltage\":" + String(voltage, 2) + ",";
  json += "\"current\":" + String(current, 3) + ",";
  json += "\"temperature\":" + String(temperature, 1) + ",";
  json += "\"soc\":" + String(soc, 1) + ",";
  json += "\"soh\":" + String(soh, 1);
  json += "}";

  Serial.print("Sending to Supabase: ");
  Serial.println(json);

  int code = http.POST(json);

  if (code == 201) {
    Serial.println("✅ Data sent to Supabase successfully!");
  } else {
    Serial.print("❌ Cloud Response Code: ");
    Serial.println(code);
    Serial.print("Response: ");
    Serial.println(http.getString());
  }

  http.end();
}
