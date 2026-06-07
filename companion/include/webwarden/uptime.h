#pragma once

#include <cstdint>
#include <string>

namespace webwarden {

/** Returns milliseconds since system boot. */
uint64_t getTickCountMs();

/** Returns boot time as Unix epoch ms (approximate). */
uint64_t getBootTimeMs();

/** True if system was restarted since lastStoredBootTimeMs. */
bool wasRestartedSince(uint64_t lastStoredBootTimeMs);

std::string getAppDataPath();

}  // namespace webwarden
