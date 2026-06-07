#pragma once

#include <nlohmann/json.hpp>
#include <string>
#include <vector>

namespace webwarden {

struct SessionRecord {
  std::string categoryId;
  std::string domain;
  int64_t startMs = 0;
  int64_t endMs = 0;
  int64_t deltaMs = 0;
  int64_t timestamp = 0;
};

struct Analytics {
  int restarts = 0;
  int timeLimitHits = 0;
  int emergencyPauses = 0;
  int bedtimeChallenges = 0;
  int totalSessions = 0;
};

class JsonStore {
 public:
  explicit JsonStore(std::string basePath);

  nlohmann::json loadSettings();
  void saveSettings(const nlohmann::json& settings);

  void appendSession(const SessionRecord& session);
  std::vector<SessionRecord> loadSessions();

  Analytics loadAnalytics();
  void incrementAnalytics(const std::string& field);

  uint64_t loadLastBootTime();
  void saveLastBootTime(uint64_t bootTimeMs);

  std::string basePath() const { return base_path_; }

 private:
  std::string base_path_;
  nlohmann::json readJsonFile(const std::string& filename, const nlohmann::json& defaultVal);
  void writeJsonFileAtomic(const std::string& filename, const nlohmann::json& data);
};

nlohmann::json defaultSettings();

}  // namespace webwarden
