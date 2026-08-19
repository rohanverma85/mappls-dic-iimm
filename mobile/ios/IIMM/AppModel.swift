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
    let operations: [[String: Any]] = items.compactMap { item in
      guard let payload = try? JSONSerialization.jsonObject(with: item.payload) as? [String: Any] else { return nil }
      return ["entityType": item.entityType, "entityId": item.entityId, "clientUpdatedAt": item.clientUpdatedAt, "payload": payload]
    }
    guard !operations.isEmpty else { return }
    do {
      let result = try await api.post("/api/sync", body: ["operations": operations]) as? [String: Any]
      let applied = Set(result?["applied"] as? [String] ?? [])
      queue.remove(Set(items.filter { applied.contains($0.entityId) }.map(\.id)))
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
  func remove(_ ids: Set<UUID>) { save(all().filter { !ids.contains($0.id) }) }
  private func save(_ items: [OfflineOperation]) {
    if let data = try? JSONEncoder().encode(items) { try? data.write(to: url, options: .atomic) }
  }
}
