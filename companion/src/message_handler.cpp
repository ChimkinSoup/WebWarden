#include "webwarden/message_handler.h"

#include "webwarden/json_store.h"
#include "webwarden/uptime.h"

#include <chrono>

namespace webwarden {

namespace {

int64_t nowMs() {
  return std::chrono::duration_cast<std::chrono::milliseconds>(
             std::chrono::system_clock::now().time_since_epoch())
      .count();
}

void deductCategoryTime(nlohmann::json& settings, const std::string& categoryId, int64_t deltaMs) {
  if (!settings.contains("categories")) return;
  for (auto& cat : settings["categories"]) {
    if (cat.value("id", "") == categoryId) {
      int64_t remaining = cat.value("remainingMs", 0);
      cat["remainingMs"] = std::max<int64_t>(0, remaining - deltaMs);
      break;
    }
  }
}

void addCategoryTime(nlohmann::json& settings, const std::string& categoryId, int64_t addMs) {
  if (!settings.contains("categories")) return;
  for (auto& cat : settings["categories"]) {
    if (cat.value("id", "") == categoryId) {
      cat["remainingMs"] = cat.value("remainingMs", 0) + addMs;
      break;
    }
  }
}

}  // namespace

nlohmann::json handleMessage(const nlohmann::json& message, JsonStore& store) {
  const std::string type = message.value("type", "");
  const std::string requestId = message.value("requestId", "");
  nlohmann::json response = {{"requestId", requestId}};

  if (type == "PING") {
    response["ok"] = true;
    response["version"] = "0.1.0";
    return response;
  }

  if (type == "GET_STATE") {
    response["settings"] = store.loadSettings();
    return response;
  }

  if (type == "GET_ANALYTICS") {
    auto a = store.loadAnalytics();
    response["analytics"] = {{"restarts", a.restarts},
                             {"timeLimitHits", a.timeLimitHits},
                             {"emergencyPauses", a.emergencyPauses},
                             {"bedtimeChallenges", a.bedtimeChallenges},
                             {"totalSessions", a.totalSessions}};
    return response;
  }

  if (type == "SYNC_SESSION") {
    const std::string categoryId = message.value("categoryId", "");
    const std::string domain = message.value("domain", "");
    const int64_t deltaMs = message.value("deltaMs", 0);
    const int64_t timestamp = message.value("timestamp", nowMs());
    const std::string event = message.value("event", "");

    auto settings = store.loadSettings();
    if (deltaMs > 0) {
      deductCategoryTime(settings, categoryId, deltaMs);
    }
    if (event == "time_limit_hit") {
      store.incrementAnalytics("timeLimitHits");
    }
    store.saveSettings(settings);

    SessionRecord session;
    session.categoryId = categoryId;
    session.domain = domain;
    session.deltaMs = deltaMs;
    session.timestamp = timestamp;
    session.endMs = timestamp;
    session.startMs = timestamp - deltaMs;
    store.appendSession(session);

    int64_t remaining = 0;
    for (const auto& cat : settings["categories"]) {
      if (cat.value("id", "") == categoryId) {
        remaining = cat.value("remainingMs", 0);
        break;
      }
    }
    response["ok"] = true;
    response["remainingMs"] = remaining;
    return response;
  }

  if (type == "VERIFY_RESTART") {
    const uint64_t lastBoot = store.loadLastBootTime();
    const uint64_t currentBoot = getBootTimeMs();
    const bool granted = wasRestartedSince(lastBoot);
    if (granted) {
      store.saveLastBootTime(currentBoot);
      store.incrementAnalytics("restarts");
    }
    response["ok"] = true;
    response["granted"] = granted;
    response["bootTimeMs"] = currentBoot;
    response["lastBootTimeMs"] = lastBoot;
    return response;
  }

  if (type == "CHECK_RESTART") {
    const uint64_t lastBoot = store.loadLastBootTime();
    const uint64_t currentBoot = getBootTimeMs();
    const bool granted = wasRestartedSince(lastBoot);
    response["ok"] = true;
    response["granted"] = granted;
    response["bootTimeMs"] = currentBoot;
    response["lastBootTimeMs"] = lastBoot;
    return response;
  }

  if (type == "DEV_SIMULATE_RESTART") {
    const uint64_t currentBoot = getBootTimeMs();
    constexpr uint64_t kSimulatedBootGapMs = 3600000;
    const uint64_t simulatedLastBoot =
        currentBoot > kSimulatedBootGapMs ? currentBoot - kSimulatedBootGapMs : 0;
    store.saveLastBootTime(simulatedLastBoot);
    response["ok"] = true;
    response["granted"] = true;
    response["bootTimeMs"] = currentBoot;
    response["lastBootTimeMs"] = simulatedLastBoot;
    return response;
  }

  if (type == "GRANT_RESTART_TIME") {
    const std::string categoryId = message.value("categoryId", "");
    auto settings = store.loadSettings();
    const int64_t extra = settings.value("extraTimeOnRestartMs", 30 * 60 * 1000);
    addCategoryTime(settings, categoryId, extra);
    store.saveSettings(settings);
    response["ok"] = true;
    return response;
  }

  if (type == "GRANT_EMERGENCY_PAUSE") {
    const std::string categoryId = message.value("categoryId", "");
    auto settings = store.loadSettings();
    const int64_t pauseMs = settings.value("emergencyPauseMs", 10 * 60 * 1000);
    for (auto& cat : settings["categories"]) {
      if (cat.value("id", "") == categoryId) {
        cat["remainingMs"] = pauseMs;
        break;
      }
    }
    store.incrementAnalytics("emergencyPauses");
    store.saveSettings(settings);
    response["ok"] = true;
    return response;
  }

  if (type == "GRANT_BEDTIME_CHALLENGE") {
    const std::string categoryId = message.value("categoryId", "");
    auto settings = store.loadSettings();
    const int64_t extra = settings.value("extraTimeOnRestartMs", 30 * 60 * 1000);
    addCategoryTime(settings, categoryId, extra);
    store.incrementAnalytics("bedtimeChallenges");
    store.saveSettings(settings);
    response["ok"] = true;
    return response;
  }

  if (type == "SETTINGS_UPDATE") {
    if (message.contains("settings")) {
      store.saveSettings(message["settings"]);
    }
    response["ok"] = true;
    response["settings"] = store.loadSettings();
    return response;
  }

  response["ok"] = false;
  response["error"] = "Unknown message type";
  return response;
}

}  // namespace webwarden
