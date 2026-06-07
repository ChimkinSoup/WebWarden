#pragma once

#include <nlohmann/json.hpp>
#include <string>

namespace webwarden {

class JsonStore;

nlohmann::json handleMessage(const nlohmann::json& message, JsonStore& store);

}  // namespace webwarden
