#include "webwarden/json_store.h"

#include <fstream>
#include <filesystem>

namespace webwarden {

namespace {
constexpr int64_t kMsMinute = 60 * 1000;
constexpr int64_t kMsHour = 60 * kMsMinute;
}  // namespace

nlohmann::json defaultSettings() {
  return nlohmann::json{
      {"listMode", "blocklist"},
      {"resetHour", 4},
      {"allowlistAuthDomains",
       {"accounts.google.com", "login.microsoftonline.com", "appleid.apple.com", "github.com"}},
      {"extraTimeOnRestartMs", 30 * kMsMinute},
      {"emergencyPauseMs", 10 * kMsMinute},
      {"emergencyPauseUsedDate", nullptr},
      {"emergencyPauseCategoryId", nullptr},
      {"settingsLocked", false},
      {"firstEditDone", false},
      {"companionConnected", true},
      {"incognitoAllowed", true},
      {"guardActive", false},
      {"developerMode", false},
      {"lastGlobalResetDate", nullptr},
      {"bedtime", {{"enabled", false}, {"start", "23:00"}, {"end", "07:00"}, {"hardcore", false}}},
      {"productivitySites", nlohmann::json::array()},
      {"customQuotes", nlohmann::json::array()},
      {"customImages", nlohmann::json::array()},
      {"categories",
       {{{"id", "default"},
         {"name", "Default"},
         {"sites", {"youtube.com", "instagram.com", "twitter.com", "x.com", "reddit.com"}},
         {"dailyLimitMs", 2 * kMsHour},
         {"remainingMs", 2 * kMsHour},
         {"lastResetDate", nullptr}}}}};
}

JsonStore::JsonStore(std::string basePath) : base_path_(std::move(basePath)) {
  std::filesystem::create_directories(base_path_);
}

nlohmann::json JsonStore::readJsonFile(const std::string& filename,
                                       const nlohmann::json& defaultVal) {
  const auto path = std::filesystem::path(base_path_) / filename;
  if (!std::filesystem::exists(path)) {
    writeJsonFileAtomic(filename, defaultVal);
    return defaultVal;
  }
  std::ifstream in(path);
  nlohmann::json data;
  in >> data;
  return data;
}

void JsonStore::writeJsonFileAtomic(const std::string& filename, const nlohmann::json& data) {
  const auto path = std::filesystem::path(base_path_) / filename;
  const auto tmp = path.string() + ".tmp";
  {
    std::ofstream out(tmp, std::ios::trunc);
    out << data.dump(2);
  }
  std::filesystem::rename(tmp, path);
}

nlohmann::json JsonStore::loadSettings() {
  return readJsonFile("settings.json", defaultSettings());
}

void JsonStore::saveSettings(const nlohmann::json& settings) {
  writeJsonFileAtomic("settings.json", settings);
}

void JsonStore::appendSession(const SessionRecord& session) {
  auto sessions = readJsonFile("sessions.json", nlohmann::json::array());
  sessions.push_back({{"categoryId", session.categoryId},
                      {"domain", session.domain},
                      {"startMs", session.startMs},
                      {"endMs", session.endMs},
                      {"deltaMs", session.deltaMs},
                      {"timestamp", session.timestamp}});
  writeJsonFileAtomic("sessions.json", sessions);
  incrementAnalytics("totalSessions");
}

std::vector<SessionRecord> JsonStore::loadSessions() {
  auto sessions = readJsonFile("sessions.json", nlohmann::json::array());
  std::vector<SessionRecord> result;
  for (const auto& s : sessions) {
    SessionRecord rec;
    rec.categoryId = s.value("categoryId", "");
    rec.domain = s.value("domain", "");
    rec.startMs = s.value("startMs", 0);
    rec.endMs = s.value("endMs", 0);
    rec.deltaMs = s.value("deltaMs", 0);
    rec.timestamp = s.value("timestamp", 0);
    result.push_back(rec);
  }
  return result;
}

Analytics JsonStore::loadAnalytics() {
  auto j = readJsonFile("analytics.json", nlohmann::json{{"restarts", 0},
                                                         {"timeLimitHits", 0},
                                                         {"emergencyPauses", 0},
                                                         {"bedtimeChallenges", 0},
                                                         {"totalSessions", 0}});
  Analytics a;
  a.restarts = j.value("restarts", 0);
  a.timeLimitHits = j.value("timeLimitHits", 0);
  a.emergencyPauses = j.value("emergencyPauses", 0);
  a.bedtimeChallenges = j.value("bedtimeChallenges", 0);
  a.totalSessions = j.value("totalSessions", 0);
  return a;
}

void JsonStore::incrementAnalytics(const std::string& field) {
  auto j = readJsonFile("analytics.json", nlohmann::json{{"restarts", 0},
                                                         {"timeLimitHits", 0},
                                                         {"emergencyPauses", 0},
                                                         {"bedtimeChallenges", 0},
                                                         {"totalSessions", 0}});
  j[field] = j.value(field, 0) + 1;
  writeJsonFileAtomic("analytics.json", j);
}

uint64_t JsonStore::loadLastBootTime() {
  auto j = readJsonFile("restart_token.json", nlohmann::json{{"lastBootTimeMs", 0}});
  return j.value("lastBootTimeMs", static_cast<uint64_t>(0));
}

void JsonStore::saveLastBootTime(uint64_t bootTimeMs) {
  writeJsonFileAtomic("restart_token.json", nlohmann::json{{"lastBootTimeMs", bootTimeMs}});
}

}  // namespace webwarden
