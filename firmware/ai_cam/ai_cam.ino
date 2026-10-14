// AI-CAM — firmware ESP32-S3 (Arduino-ESP32 3.x)
//
// Appui sur le bouton -> photo JPEG -> POST au serveur relais -> le serveur
// demande à Claude de décrire la photo, synthétise la voix et renvoie du PCM
// 16 bits mono -> lecture par le haut-parleur ultrason (porteuse 40 kHz
// modulée en largeur d'impulsion, pont TC4427A).
//
// Carte Arduino : "ESP32S3 Dev Module", PSRAM : "QSPI PSRAM",
// USB CDC On Boot : "Enabled".

#include <WiFi.h>
#include <HTTPClient.h>
#include <math.h>
#include "esp_camera.h"
#include "driver/ledc.h"
#include "driver/rtc_io.h"
#include "esp_timer.h"
#include "esp_sleep.h"
#include "config.h"

// ---- Brochage (voir hardware/gen_netlist.py)
#define PIN_BTN        1
#define PIN_LED        2
#define PIN_VBAT       4
#define PIN_BOOST_EN   5
#define PIN_US_A       6
#define PIN_US_B       7

#define CAM_PIN_PWDN   21
#define CAM_PIN_XCLK   10
#define CAM_PIN_SIOD   40
#define CAM_PIN_SIOC   39
#define CAM_PIN_D7     48
#define CAM_PIN_D6     11
#define CAM_PIN_D5     12
#define CAM_PIN_D4     14
#define CAM_PIN_D3     16
#define CAM_PIN_D2     18
#define CAM_PIN_D1     17
#define CAM_PIN_D0     15
#define CAM_PIN_VSYNC  38
#define CAM_PIN_HREF   47
#define CAM_PIN_PCLK   13

// ---- Ultrason : 40 kHz, résolution 10 bits (80 MHz / 40 kHz = 2000 > 1024)
#define US_FREQ_HZ     40000
#define US_RES         LEDC_TIMER_10_BIT
#define US_TIMER       LEDC_TIMER_1      // LEDC_TIMER_0 est pris par XCLK caméra
#define US_CH_A        LEDC_CHANNEL_1
#define US_CH_B        LEDC_CHANNEL_2
#define US_MOD_DEPTH   0.8f              // profondeur de modulation (0..1)

static uint16_t dutyLut[256];

// Pour un signal carré, l'amplitude du fondamental vaut sin(pi * D).
// L'enveloppe ultrason doit être E = sqrt((1 + m*x) / 2) (pré-correction de la
// démodulation quadratique dans l'air), donc D = asin(E) / pi, dans [0 ; 0,5].
static void buildDutyLut() {
  for (int i = 0; i < 256; i++) {
    float x = (i - 128) / 128.0f;
    float e = sqrtf((1.0f + US_MOD_DEPTH * x) / 2.0f);
    dutyLut[i] = (uint16_t)(asinf(e) / (float)M_PI * 1024.0f);
  }
}

static void ultrasonInit() {
  ledc_timer_config_t t = {};
  t.speed_mode = LEDC_LOW_SPEED_MODE;
  t.duty_resolution = US_RES;
  t.timer_num = US_TIMER;
  t.freq_hz = US_FREQ_HZ;
  t.clk_cfg = LEDC_AUTO_CLK;
  ESP_ERROR_CHECK(ledc_timer_config(&t));

  // Deux canaux, même rapport cyclique, le second inversé : US_B = NOT US_A,
  // donc le pont TC4427A applique ±12 V aux transducteurs.
  ledc_channel_config_t c = {};
  c.speed_mode = LEDC_LOW_SPEED_MODE;
  c.timer_sel = US_TIMER;
  c.duty = 0;
  c.hpoint = 0;
  c.gpio_num = PIN_US_A;
  c.channel = US_CH_A;
  ESP_ERROR_CHECK(ledc_channel_config(&c));
  c.gpio_num = PIN_US_B;
  c.channel = US_CH_B;
  c.flags.output_invert = 1;
  ESP_ERROR_CHECK(ledc_channel_config(&c));
}

static inline void ultrasonSetDuty(uint32_t d) {
  ledc_set_duty(LEDC_LOW_SPEED_MODE, US_CH_A, d);
  ledc_update_duty(LEDC_LOW_SPEED_MODE, US_CH_A);
  ledc_set_duty(LEDC_LOW_SPEED_MODE, US_CH_B, d);
  ledc_update_duty(LEDC_LOW_SPEED_MODE, US_CH_B);
}

// Joue du PCM 16 bits signé mono. Boucle cadencée par esp_timer_get_time() :
// simple et assez précise à 16-22 kHz ; le Wi-Fi tourne sur l'autre cœur.
static void ultrasonPlay(const int16_t *pcm, size_t n, uint32_t rate) {
  digitalWrite(PIN_BOOST_EN, HIGH);
  delay(20);  // montée du boost à 11,4 V
  const int64_t period_ns = 1000000000LL / rate;
  int64_t t0 = esp_timer_get_time() * 1000;
  for (size_t i = 0; i < n; i++) {
    ultrasonSetDuty(dutyLut[(uint8_t)((pcm[i] >> 8) + 128)]);
    int64_t next = t0 + (int64_t)(i + 1) * period_ns;
    while (esp_timer_get_time() * 1000 < next) {
    }
    if ((i & 4095) == 0) vTaskDelay(0);  // laisse respirer l'ordonnanceur
  }
  ultrasonSetDuty(0);
  digitalWrite(PIN_BOOST_EN, LOW);
}

// Petit bip ultrason (enveloppe 1 kHz) pour confirmer l'appui.
static void beep(int ms) {
  const uint32_t rate = 16000;
  size_t n = rate * ms / 1000;
  int16_t *buf = (int16_t *)ps_malloc(n * sizeof(int16_t));
  if (!buf) return;
  for (size_t i = 0; i < n; i++) buf[i] = (int16_t)(20000 * sinf(2 * M_PI * 1000 * i / rate));
  ultrasonPlay(buf, n, rate);
  free(buf);
}

static bool cameraInit() {
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0;
  c.ledc_timer = LEDC_TIMER_0;
  c.pin_d0 = CAM_PIN_D0;
  c.pin_d1 = CAM_PIN_D1;
  c.pin_d2 = CAM_PIN_D2;
  c.pin_d3 = CAM_PIN_D3;
  c.pin_d4 = CAM_PIN_D4;
  c.pin_d5 = CAM_PIN_D5;
  c.pin_d6 = CAM_PIN_D6;
  c.pin_d7 = CAM_PIN_D7;
  c.pin_xclk = CAM_PIN_XCLK;
  c.pin_pclk = CAM_PIN_PCLK;
  c.pin_vsync = CAM_PIN_VSYNC;
  c.pin_href = CAM_PIN_HREF;
  c.pin_sccb_sda = CAM_PIN_SIOD;
  c.pin_sccb_scl = CAM_PIN_SIOC;
  c.pin_pwdn = CAM_PIN_PWDN;
  c.pin_reset = -1;  // RC matériel R13/C13
  c.xclk_freq_hz = 20000000;
  c.pixel_format = PIXFORMAT_JPEG;
  c.frame_size = FRAMESIZE_VGA;  // 640x480 : assez pour Claude, ~30-60 ko
  c.jpeg_quality = 12;
  c.fb_count = 1;
  c.fb_location = CAMERA_FB_IN_PSRAM;
  c.grab_mode = CAMERA_GRAB_LATEST;
  return esp_camera_init(&c) == ESP_OK;
}

static float batteryVolts() {
  return analogReadMilliVolts(PIN_VBAT) * 2 / 1000.0f;  // pont 220k/220k
}

static bool wifiConnect() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 100 && WiFi.status() != WL_CONNECTED; i++) delay(100);
  return WiFi.status() == WL_CONNECTED;
}

// Envoie le JPEG, reçoit du PCM 16 bits (Content-Length connu) dans la PSRAM.
static int16_t *askServer(camera_fb_t *fb, size_t *samples, uint32_t *rate) {
  HTTPClient http;
  http.begin(SERVER_URL);
  http.setTimeout(60000);
  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  const char *keys[] = {"X-Sample-Rate"};
  http.collectHeaders(keys, 1);

  int code = http.POST(fb->buf, fb->len);
  if (code != 200) {
    Serial.printf("Serveur : HTTP %d\n", code);
    http.end();
    return nullptr;
  }
  *rate = http.header("X-Sample-Rate").toInt();
  int len = http.getSize();
  if (*rate == 0 || len <= 0) {
    http.end();
    return nullptr;
  }
  uint8_t *buf = (uint8_t *)ps_malloc(len);
  if (!buf) {
    http.end();
    return nullptr;
  }
  WiFiClient *s = http.getStreamPtr();
  int got = 0;
  uint32_t last = millis();
  while (got < len && millis() - last < 10000) {
    int n = s->read(buf + got, len - got);
    if (n > 0) {
      got += n;
      last = millis();
    } else {
      delay(2);
    }
  }
  http.end();
  *samples = got / 2;
  return (int16_t *)buf;
}

static void handlePress() {
  digitalWrite(PIN_LED, HIGH);
  beep(80);

  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("Capture échouée");
    beep(400);
    digitalWrite(PIN_LED, LOW);
    return;
  }
  Serial.printf("Photo %u octets, batterie %.2f V\n", fb->len, batteryVolts());

  size_t n = 0;
  uint32_t rate = 0;
  int16_t *pcm = wifiConnect() ? askServer(fb, &n, &rate) : nullptr;
  esp_camera_fb_return(fb);

  if (pcm) {
    Serial.printf("Lecture %u échantillons @ %lu Hz\n", n, (unsigned long)rate);
    ultrasonPlay(pcm, n, rate);
    free(pcm);
  } else {
    beep(400);
  }
  digitalWrite(PIN_LED, LOW);
}

static uint32_t lastActivity;

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BTN, INPUT_PULLUP);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BOOST_EN, OUTPUT);
  digitalWrite(PIN_BOOST_EN, LOW);

  buildDutyLut();
  ultrasonInit();
  if (!cameraInit()) {
    Serial.println("Caméra introuvable");
    for (int i = 0; i < 3; i++) beep(150), delay(150);
  }
  wifiConnect();
  lastActivity = millis();

  // Réveillé par le bouton : traiter tout de suite cet appui.
  if (esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_EXT0) handlePress();
}

void loop() {
  if (digitalRead(PIN_BTN) == LOW) {
    delay(30);  // anti-rebond
    if (digitalRead(PIN_BTN) == LOW) {
      handlePress();
      while (digitalRead(PIN_BTN) == LOW) delay(10);
      lastActivity = millis();
    }
  }

  // Inactif : deep-sleep (~20 µA), réveil par le bouton (IO1 est une broche RTC).
  if (millis() - lastActivity > IDLE_SLEEP_MS) {
    esp_camera_deinit();  // R14 remonte PWDN : caméra coupée
    WiFi.disconnect(true);
    esp_sleep_enable_ext0_wakeup((gpio_num_t)PIN_BTN, 0);
    rtc_gpio_pullup_en((gpio_num_t)PIN_BTN);
    esp_deep_sleep_start();
  }
  delay(5);
}
