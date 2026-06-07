#include "webwarden/uptime.h"

#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <shlobj.h>
#endif

#include <chrono>
#include <filesystem>
#include <stdexcept>

namespace webwarden {

uint64_t getTickCountMs() {
#ifdef _WIN32
  return static_cast<uint64_t>(GetTickCount64());
#else
  return 0;
#endif
}

uint64_t getBootTimeMs() {
  const uint64_t nowMs = static_cast<uint64_t>(
      std::chrono::duration_cast<std::chrono::milliseconds>(
          std::chrono::system_clock::now().time_since_epoch())
          .count());
  return nowMs - getTickCountMs();
}

bool wasRestartedSince(uint64_t lastStoredBootTimeMs) {
  if (lastStoredBootTimeMs == 0) return true;
  const uint64_t currentBoot = getBootTimeMs();
  return currentBoot > lastStoredBootTimeMs + 1000;
}

std::string getAppDataPath() {
#ifdef _WIN32
  PWSTR path = nullptr;
  if (FAILED(SHGetKnownFolderPath(FOLDERID_RoamingAppData, 0, nullptr, &path))) {
    throw std::runtime_error("Failed to get AppData path");
  }
  std::filesystem::path base(path);
  CoTaskMemFree(path);
  base /= "WebWarden";
  std::filesystem::create_directories(base);
  return base.string();
#else
  throw std::runtime_error("WebWarden companion only supports Windows");
#endif
}

}  // namespace webwarden
