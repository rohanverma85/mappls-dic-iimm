import Foundation
import Network

@MainActor
final class AppModel: ObservableObject {
  @Published var session: Session?
  @Published var demoUsers: [User] = []
  @Published var dashboard: [String: Any] = [:]
  @Published var records: [[String: Any]] = []
  @Published var search: [[String: Any]] = []
  @Published var map = MapDataset()
  @Published var busy = false
  @Published var error: String?
  let api = APIClient()
  let queue = OfflineQueue()
  private let monitor = NWPathMonitor()

  init() {
    monitor.pathUpdateHandler = { [weak self] path in
      guard path.status == .satisfied else { return }
      Task { @MainActor in await self?.syncQueued() }
    }
    monitor.start(queue: DispatchQueue(label: "com.mappls.dic.iimm.network"))
  }

  func restoreSession() async {
    guard api.keys.token() != nil, session == nil else { return }
    await perform {
      guard let result = try await self.api.get("/api/session") as? [String: Any],
        let token = result["token"] as? String,
        let json = result["user"] as? [String: Any], let user = User(json)
      else { throw APIError.server("Saved session is no longer valid") }
      self.session = Session(token: token, user: user, tenantName: (result["tenant"] as? [String: Any])?["name"] as? String)
    }
  }

  func loadDemos() async {
    await perform {
      self.demoUsers = (try await self.api.get("/api/demo-users") as? [[String: Any]] ?? [])
        .compactMap(User.init)
    }
  }
  func login(_ id: String) async {
    await perform {
      self.session = try await self.api.login(userId: id)
    }
  }
  func loadDashboard() async {
    await perform {
      self.dashboard = try await self.api.get("/api/dashboard") as? [String: Any] ?? [:]
    }
  }
  func load(_ module: ModuleSpec) async {
    await perform {
      self.records = try await self.api.get(module.endpoint) as? [[String: Any]] ?? []
    }
  }
  func loadMap() async {
    await perform {
      self.map = MapDataset(
        json: try await self.api.get("/api/gis/overview") as? [String: Any] ?? [:])
    }
  }
  func find(_ query: String) async {
    guard query.count > 1 else {
      search = []
      return
    }
    await perform {
      let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
      self.search = try await self.api.get("/api/search?q=\(encoded)") as? [[String: Any]] ?? []
    }
  }
  func mutate(_ block: @escaping () async throws -> Void) async {
    await perform { try await block() }
  }
  func logout() {
    api.keys.clear()
    session = nil
    records = []
    dashboard = [:]
  }
  func syncQueued() async {
    let items = queue.all()
    guard !items.isEmpty, api.keys.token() != nil else { return }
    for item in items where ["DefectCreate", "DefectAtrCreate"].contains(item.entityType) {
      do {
        guard var payload = try JSONSerialization.jsonObject(with: item.payload) as? [String: Any] else { continue }
        var mediaId = payload["mediaId"] as? String ?? ""
        if mediaId.isEmpty {
          guard let path = payload["evidencePath"] as? String else { continue }
          let evidence = try Data(contentsOf: URL(fileURLWithPath: path))
          let uploaded = try await api.upload(
            data: evidence, mimeType: payload["mimeType"] as? String ?? "image/jpeg",
            fileName: payload["fileName"] as? String ?? "offline-evidence.jpg",
            lat: payload["lat"] as? Double ?? 0, lng: payload["lng"] as? Double ?? 0,
            accuracyMeters: payload["locationAccuracyMeters"] as? Double ?? payload["accuracyMeters"] as? Double)
          mediaId = uploaded["id"] as? String ?? ""
        }
        let lat = payload["lat"] as? Double ?? 0, lng = payload["lng"] as? Double ?? 0
        if item.entityType == "DefectAtrCreate" {
          _ = try await api.post("/api/defects/\(payload["defectId"] as? String ?? "")/atr", body: [
            "summary": payload["summary"] as? String ?? "", "media": [mediaId], "lat": lat, "lng": lng,
            "accuracyMeters": payload["accuracyMeters"] as? Double ?? 0,
          ])
          if let path = payload["evidencePath"] as? String { try? FileManager.default.removeItem(atPath: path) }
          queue.remove([item.id])
          continue
        }
        let location: String
        if let storedLocation = payload["location"] as? String, !storedLocation.isEmpty {
          location = storedLocation
        } else {
          location = (try? await api.reverse(lat: lat, lng: lng)) ?? "\(lat), \(lng)"
        }
        payload["location"] = location
        payload["media"] = [mediaId]
        ["mediaId", "evidencePath", "mimeType", "fileName"].forEach { payload.removeValue(forKey: $0) }
        _ = try await api.post("/api/defects", body: payload)
        if let path = (try JSONSerialization.jsonObject(with: item.payload) as? [String: Any])?["evidencePath"] as? String { try? FileManager.default.removeItem(atPath: path) }
        queue.remove([item.id])
      } catch { /* Preserve the deferred report and evidence for the next reconnect. */ }
    }
    let serverItems = queue.all().filter { !["DefectCreate", "DefectAtrCreate"].contains($0.entityType) }
    let operations: [[String: Any]] = serverItems.compactMap { item in
      guard let payload = try? JSONSerialization.jsonObject(with: item.payload) as? [String: Any] else { return nil }
      return ["entityType": item.entityType, "entityId": item.entityId, "clientUpdatedAt": item.clientUpdatedAt, "payload": payload]
    }
    guard !operations.isEmpty else { return }
    do {
      let result = try await api.post("/api/sync", body: ["operations": operations]) as? [String: Any]
      let applied = Set(result?["applied"] as? [String] ?? [])
      queue.remove(Set(serverItems.filter { applied.contains($0.entityId) }.map(\.id)))
    } catch { /* Work remains queued and is retried on the next reconnect. */ }
  }
  private func perform(_ block: @escaping () async throws -> Void) async {
    busy = true
    error = nil
    do { try await block() } catch { self.error = error.localizedDescription }
    busy = false
  }
}

struct OfflineOperation: Codable, Identifiable {
  let id: UUID
  let entityType: String
  let entityId: String
  let clientUpdatedAt: String
  let payload: Data
}
final class OfflineQueue {
  private let url: URL
  init() {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
    url = base.appendingPathComponent("iimm-offline.json")
  }
  func all() -> [OfflineOperation] {
    guard let data = try? Data(contentsOf: url) else { return [] }
    return (try? JSONDecoder().decode([OfflineOperation].self, from: data)) ?? []
  }
  func enqueue(entityType: String, entityId: String, payload: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
    var items = all()
    items.append(
      .init(
        id: UUID(), entityType: entityType, entityId: entityId,
        clientUpdatedAt: ISO8601DateFormatter().string(from: Date()), payload: data))
    save(items)
  }
  func enqueueDefect(entityId: String, payload: [String: Any], evidence: Data, mimeType: String, fileName: String) {
    enqueueEvidence(entityType: "DefectCreate", entityId: entityId, payload: payload, evidence: evidence, mimeType: mimeType, fileName: fileName)
  }
  func enqueueAtr(entityId: String, payload: [String: Any], evidence: Data, mimeType: String, fileName: String) {
    enqueueEvidence(entityType: "DefectAtrCreate", entityId: entityId, payload: payload, evidence: evidence, mimeType: mimeType, fileName: fileName)
  }
  private func enqueueEvidence(entityType: String, entityId: String, payload: [String: Any], evidence: Data, mimeType: String, fileName: String) {
    let directory = url.deletingLastPathComponent().appendingPathComponent("offline-evidence", isDirectory: true)
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let evidenceURL = directory.appendingPathComponent("\(entityId)-\(fileName)")
    guard (try? evidence.write(to: evidenceURL, options: .atomic)) != nil else { return }
    var value = payload
    value["evidencePath"] = evidenceURL.path
    value["mimeType"] = mimeType
    value["fileName"] = fileName
    enqueue(entityType: entityType, entityId: entityId, payload: value)
  }
  func remove(_ ids: Set<UUID>) { save(all().filter { !ids.contains($0.id) }) }
  private func save(_ items: [OfflineOperation]) {
    if let data = try? JSONEncoder().encode(items) { try? data.write(to: url, options: .atomic) }
  }
}
