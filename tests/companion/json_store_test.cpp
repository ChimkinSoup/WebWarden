#include <gtest/gtest.h>
#include "webwarden/json_store.h"

#include <filesystem>
#include <fstream>

namespace {

std::string tempDir() {
  auto p = std::filesystem::temp_directory_path() / "webwarden_test";
  std::filesystem::remove_all(p);
  std::filesystem::create_directories(p);
  return p.string();
}

}  // namespace

TEST(JsonStore, DefaultSettingsCreated) {
  webwarden::JsonStore store(tempDir());
  auto settings = store.loadSettings();
  EXPECT_TRUE(settings.contains("categories"));
  EXPECT_EQ(settings["listMode"], "blocklist");
}

TEST(JsonStore, AtomicWriteAndRead) {
  const auto dir = tempDir();
  webwarden::JsonStore store(dir);
  auto settings = store.loadSettings();
  settings["resetHour"] = 6;
  store.saveSettings(settings);

  webwarden::JsonStore store2(dir);
  auto reloaded = store2.loadSettings();
  EXPECT_EQ(reloaded["resetHour"], 6);
}

TEST(JsonStore, AppendSessionIncrementsAnalytics) {
  webwarden::JsonStore store(tempDir());
  webwarden::SessionRecord session;
  session.categoryId = "default";
  session.domain = "youtube.com";
  session.deltaMs = 1000;
  session.timestamp = 12345;
  store.appendSession(session);

  auto analytics = store.loadAnalytics();
  EXPECT_GE(analytics.totalSessions, 1);
}

TEST(JsonStore, BootTimePersistence) {
  webwarden::JsonStore store(tempDir());
  EXPECT_EQ(store.loadLastBootTime(), 0u);
  store.saveLastBootTime(99999);
  EXPECT_EQ(store.loadLastBootTime(), 99999u);
}
