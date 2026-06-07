#include "webwarden/json_store.h"
#include "webwarden/message_handler.h"
#include "webwarden/uptime.h"

#include <nlohmann/json.hpp>

#include <iostream>
#include <fstream>
#include <vector>
#include <cstdint>

#ifdef _WIN32
#include <io.h>
#include <fcntl.h>
#endif

namespace {

void logError(const std::string& msg) {
  try {
    const auto path = webwarden::getAppDataPath() + "/companion.log";
    std::ofstream log(path, std::ios::app);
    log << msg << std::endl;
  } catch (...) {
    /* ignore logging failures */
  }
}

bool readExact(std::istream& in, char* buf, size_t len) {
  return static_cast<bool>(in.read(buf, static_cast<std::streamsize>(len)));
}

bool writeExact(std::ostream& out, const char* buf, size_t len) {
  out.write(buf, static_cast<std::streamsize>(len));
  return out.good();
}

bool readMessage(std::istream& in, std::string& out) {
  uint32_t length = 0;
  if (!readExact(in, reinterpret_cast<char*>(&length), 4)) return false;
  if (length == 0 || length > 1024 * 1024) return false;
  std::vector<char> buf(length);
  if (!readExact(in, buf.data(), length)) return false;
  out.assign(buf.begin(), buf.end());
  return true;
}

bool writeMessage(std::ostream& out, const std::string& msg) {
  const uint32_t length = static_cast<uint32_t>(msg.size());
  if (!writeExact(out, reinterpret_cast<const char*>(&length), 4)) return false;
  return writeExact(out, msg.data(), msg.size());
}

}  // namespace

int main() {
#ifdef _WIN32
  _setmode(_fileno(stdin), _O_BINARY);
  _setmode(_fileno(stdout), _O_BINARY);
#endif

  try {
    webwarden::JsonStore store(webwarden::getAppDataPath());

    std::string raw;
    while (readMessage(std::cin, raw)) {
      try {
        auto message = nlohmann::json::parse(raw);
        auto response = webwarden::handleMessage(message, store);
        response["type"] = message.value("type", "");
        const std::string out = response.dump();
        if (!writeMessage(std::cout, out)) break;
        std::cout.flush();
      } catch (const std::exception& e) {
        logError(std::string("Message error: ") + e.what());
      }
    }
  } catch (const std::exception& e) {
    logError(std::string("Fatal: ") + e.what());
    return 1;
  }

  return 0;
}
