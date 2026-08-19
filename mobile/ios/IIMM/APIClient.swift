import Foundation
import Security

enum APIError: LocalizedError {
  case server(String)
  var errorDescription: String? {
    if case .server(let value) = self { return value }
    return "Request failed"
  }
}

final class KeychainSession {
  private let service = "com.mappls.dic.iimm.session", account = "bearer"
  func token() -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
      kSecAttrAccount as String: account, kSecReturnData as String: true,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
      let data = item as? Data
    else { return nil }
    return String(data: data, encoding: .utf8)
  }
  func save(_ token: String) {
    clear()
    let data = Data(token.utf8)
    SecItemAdd(
      [
        kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
        kSecAttrAccount as String: account, kSecValueData as String: data,
      ] as CFDictionary, nil)
  }
  func clear() {
    SecItemDelete(
      [
        kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
        kSecAttrAccount as String: account,
      ] as CFDictionary)
  }
}

final class APIClient {
  static let base = URL(string: "https://mappls-dic-iimm.replit.app")!
  let keys = KeychainSession()

  func get(_ path: String) async throws -> Any { try await request(path: path, method: "GET") }
  func post(_ path: String, body: [String: Any] = [:]) async throws -> Any {
    try await request(path: path, method: "POST", body: body)
  }
  func patch(_ path: String, body: [String: Any]) async throws -> Any {
    try await request(path: path, method: "PATCH", body: body)
  }
  func download(_ path: String) async throws -> Data {
    var request = URLRequest(url: URL(string: path, relativeTo: Self.base)!)
    request.timeoutInterval = 30
    if let token = keys.token() { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw APIError.server("Report download failed")
    }
    return data
  }
  func login(userId: String) async throws -> Session {
    guard
      let result = try await post("/api/auth/login", body: ["userId": userId]) as? [String: Any],
      let token = result["token"] as? String, let userJSON = result["user"] as? [String: Any],
      let user = User(userJSON)
    else { throw APIError.server("Invalid login response") }
    keys.save(token)
    let tenant = (result["tenant"] as? [String: Any])?["name"] as? String
    return Session(token: token, user: user, tenantName: tenant)
  }
  func reverse(lat: Double, lng: Double) async throws -> String {
    let result =
      try await get("/api/mappls/reverse-geocode?lat=\(lat)&lng=\(lng)") as? [String: Any]
    return result?["address"] as? String ?? "\(lat), \(lng)"
  }

  func upload(
    data: Data, mimeType: String, fileName: String, lat: Double, lng: Double,
    accuracyMeters: Double?
  ) async throws -> [String: Any] {
    var request = URLRequest(url: URL(string: "/api/media", relativeTo: Self.base)!)
    request.httpMethod = "POST"
    request.timeoutInterval = 45
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(mimeType, forHTTPHeaderField: "Content-Type")
    request.setValue(fileName, forHTTPHeaderField: "X-File-Name")
    request.setValue(String(lat), forHTTPHeaderField: "X-Capture-Lat")
    request.setValue(String(lng), forHTTPHeaderField: "X-Capture-Lng")
    request.setValue(ISO8601DateFormatter().string(from: Date()), forHTTPHeaderField: "X-Captured-At")
    if let accuracyMeters { request.setValue(String(accuracyMeters), forHTTPHeaderField: "X-Capture-Accuracy") }
    if let token = keys.token() { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
    request.httpBody = data
    let (responseData, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw APIError.server("No server response") }
    let value = try JSONSerialization.jsonObject(with: responseData)
    guard (200..<300).contains(http.statusCode), let object = value as? [String: Any] else {
      throw APIError.server((value as? [String: Any])?["error"] as? String ?? "Evidence upload failed (\(http.statusCode))")
    }
    return object
  }

  func parseGisFile(data: Data, fileName: String) async throws -> [String: Any] {
    var request = URLRequest(url: URL(string: "/api/gis/parse-file", relativeTo: Self.base)!)
    request.httpMethod = "POST"
    request.timeoutInterval = 60
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
    request.setValue(fileName, forHTTPHeaderField: "X-File-Name")
    if let token = keys.token() { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
    request.httpBody = data
    let (responseData, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw APIError.server("No server response") }
    let value = try JSONSerialization.jsonObject(with: responseData)
    guard (200..<300).contains(http.statusCode), let object = value as? [String: Any] else {
      throw APIError.server((value as? [String: Any])?["error"] as? String ?? "GIS file parsing failed (\(http.statusCode))")
    }
    return object
  }

  private func request(path: String, method: String, body: [String: Any]? = nil) async throws -> Any
  {
    var request = URLRequest(url: URL(string: path, relativeTo: Self.base)!)
    request.httpMethod = method
    request.timeoutInterval = 25
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if let token = keys.token() {
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    }
    if let body {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
    }
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw APIError.server("No server response")
    }
    let value = try JSONSerialization.jsonObject(with: data)
    guard (200..<300).contains(http.statusCode) else {
      throw APIError.server(
        (value as? [String: Any])?["error"] as? String ?? "Request failed (\(http.statusCode))")
    }
    return value
  }
}
