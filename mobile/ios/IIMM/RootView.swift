import PhotosUI
import SwiftUI

struct RootView: View {
  @EnvironmentObject var app: AppModel
  var body: some View {
    Group { if app.session == nil { LoginView() } else { MainTabs() } }.task { await app.restoreSession() }.overlay(alignment: .top) {
      if app.busy { ProgressView().progressViewStyle(.linear) }
    }.alert(
      "IIMM", isPresented: .init(get: { app.error != nil }, set: { if !$0 { app.error = nil } })
    ) {
      Button("OK") { app.error = nil }
    } message: {
      Text(app.error ?? "")
    }
  }
}

struct LoginView: View {
  @EnvironmentObject var app: AppModel
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          Text("DI").font(.title.bold()).foregroundStyle(.white).frame(width: 64, height: 64)
            .background(Color.iimmNavy, in: RoundedRectangle(cornerRadius: 18))
          Text("IIMM Platform").font(.largeTitle.bold())
          Text("Native field and governance application").foregroundStyle(.secondary)
          Text("Choose a demo role").font(.headline).padding(.top)
          ForEach(app.demoUsers) { user in
            Button {
              Task { await app.login(user.id) }
            } label: {
              HStack {
                Image(systemName: "person.crop.circle").font(.title2)
                VStack(alignment: .leading) {
                  Text(user.name).bold()
                  Text(user.role.label).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
              }.padding().background(.background, in: RoundedRectangle(cornerRadius: 16)).shadow(
                color: .black.opacity(0.08), radius: 8)
            }.buttonStyle(.plain)
          }
        }.padding(24)
      }
    }.task { await app.loadDemos() }
  }
}

struct MainTabs: View {
  var body: some View {
    TabView {
      NavigationStack { HomeView() }.tabItem { Label("Home", systemImage: "house") }
      NavigationStack { ModulesView() }.tabItem { Label("Modules", systemImage: "square.grid.2x2") }
      NavigationStack { FieldMapView() }.tabItem { Label("Map", systemImage: "map") }
      NavigationStack { SearchView() }.tabItem { Label("Search", systemImage: "magnifyingglass") }
      NavigationStack { MoreView() }.tabItem { Label("More", systemImage: "ellipsis") }
    }
  }
}

struct HomeView: View {
  @EnvironmentObject var app: AppModel
  var kpis: [[String: Any]] { app.dashboard["kpis"] as? [[String: Any]] ?? [] }
  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 14) {
        Text(
          "Good day, \(app.session?.user.name.split(separator:" ").first.map(String.init) ?? "")"
        ).font(.title.bold())
        Text(app.session?.tenantName ?? "Integrated infrastructure operations").foregroundStyle(
          .secondary)
        LazyVGrid(columns: [.init(.flexible()), .init(.flexible())], spacing: 12) {
          ForEach(Array(kpis.enumerated()), id: \.offset) { _, item in
            VStack(alignment: .leading) {
              Text(String(describing: item["value"] ?? "–")).font(.title.bold()).foregroundStyle(
                Color.iimmNavy)
              Text(item["label"] as? String ?? "").font(.caption)
            }.frame(maxWidth: .infinity, alignment: .leading).padding().background(
              .background, in: RoundedRectangle(cornerRadius: 16)
            ).shadow(color: .black.opacity(0.06), radius: 7)
          }
        }
        Text("Priority work").font(.title2.bold()).padding(.top)
        ForEach(
          modules.filter { module in
            app.session.map { module.roles.contains($0.user.role) } ?? false
          }.prefix(5)
        ) { module in
          NavigationLink(value: module) { ModuleRow(module: module) }.buttonStyle(.plain)
        }
      }.padding()
    }.navigationTitle("IIMM Platform").navigationDestination(for: ModuleSpec.self) {
      ModuleView(module: $0)
    }.refreshable { await app.loadDashboard() }.task { await app.loadDashboard() }
  }
}

struct ModulesView: View {
  @EnvironmentObject var app: AppModel
  var available: [ModuleSpec] {
    guard let role = app.session?.user.role else { return [] }
    return modules.filter { $0.roles.contains(role) }
  }
  var body: some View {
    List(available) { module in NavigationLink(value: module) { ModuleRow(module: module) } }
      .navigationTitle("All capabilities").navigationDestination(for: ModuleSpec.self) {
        ModuleView(module: $0)
      }
  }
}

struct ModuleRow: View {
  let module: ModuleSpec
  var body: some View {
    HStack(spacing: 14) {
      Image(systemName: icon(module.id)).foregroundStyle(Color.iimmNavy).frame(width: 28)
      VStack(alignment: .leading, spacing: 3) {
        Text(module.title).bold()
        Text(module.subtitle).font(.caption).foregroundStyle(.secondary)
      }
      Spacer()
    }.padding(.vertical, 6)
  }
  func icon(_ key: String) -> String {
    switch key {
    case "projects": "point.3.connected.trianglepath.dotted"
    case "assets": "shippingbox"
    case "gis": "square.3.layers.3d"
    case "attendance": "location.circle"
    case "inspections": "checklist"
    case "defects": "wrench.and.screwdriver"
    case "payments": "creditcard"
    case "tickets": "questionmark.bubble"
    case "notifications": "bell"
    case "sync": "arrow.triangle.2.circlepath"
    default: "list.bullet.rectangle"
    }
  }
}

struct ModuleView: View {
  @EnvironmentObject var app: AppModel
  let module: ModuleSpec
  @State private var creating = false
  var canCreate: Bool {
    guard let role = app.session?.user.role, module.createKind != nil else { return false }
    switch module.id {
    case "tenants": return role == .tenantAdmin
    case "users", "projects", "assets": return role == .tenantAdmin || role == .authority
    case "attendance", "payments": return role == .maker
    case "inspections": return role == .authority || role == .maker || role == .checker
    case "defects", "tickets": return true
    default: return false
    }
  }
  var body: some View {
    List {
      Section {
        Text(module.subtitle).foregroundStyle(.secondary)
        Text("\(app.records.count) records").font(.caption.bold()).foregroundStyle(Color.iimmNavy)
      }
      if app.records.isEmpty && !app.busy {
        ContentUnavailableView(
          "No records", systemImage: "tray",
          description: Text("No records are visible for this role and tenant."))
      }
      ForEach(Array(app.records.enumerated()), id: \.offset) { _, record in
        RecordView(record: record, module: module)
      }
    }.navigationTitle(module.title).toolbar {
      if canCreate {
        Button {
          creating = true
        } label: {
          Image(systemName: "plus")
        }
      }
    }.sheet(isPresented: $creating) { CreateView(module: module, isPresented: $creating) }.task {
      await app.load(module)
    }.refreshable { await app.load(module) }
  }
}

struct RecordView: View {
  @EnvironmentObject var app: AppModel
  let record: [String: Any]
  let module: ModuleSpec
  @State private var showingATR = false
  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      Text(title(record)).bold()
      let detail = subtitle(record)
      if !detail.isEmpty { Text(detail).font(.caption).foregroundStyle(.secondary) }
      HStack {
        ForEach(Array(actions.prefix(2).enumerated()), id: \.offset) { _, action in
          Button(action.label) {
            if action.path == "local:atr" { showingATR = true } else { Task {
              await app.mutate {
                do {
                  if ["tenants", "users", "projects", "assets", "inspections", "tickets"].contains(module.id) {
                    _ = try await app.api.patch(action.path, body: action.body)
                  } else {
                    _ = try await app.api.post(action.path, body: action.body)
                  }
                } catch let network as URLError where module.id == "inspections" || module.id == "defects" {
                  let entity = module.id == "inspections" ? "Inspection" : "Defect"
                  app.queue.enqueue(entityType: entity, entityId: record["id"] as? String ?? UUID().uuidString, payload: action.body)
                  _ = network
                }
                await app.load(module)
              }
            } }
          }.buttonStyle(.bordered)
        }
      }
    }.padding(.vertical, 5).sheet(isPresented: $showingATR) {
      ATRView(defectId: record["id"] as? String ?? "", isPresented: $showingATR)
    }
  }
  struct Action {
    let label, path: String
    let body: [String: Any]
  }
  var actions: [Action] {
    guard let role = app.session?.user.role, let id = record["id"] as? String else { return [] }
    let status = record["status"] as? String ?? ""
    if module.id == "notifications", record["read"] as? Bool != true {
      return [.init(label: "Mark read", path: "/api/notifications/\(id)/read", body: [:])]
    }
    if module.id == "defects", role == .checker, record["checkerValidation"] as? String == "Pending" {
      return [
        .init(
          label: "Validate", path: "/api/defects/\(id)/validate",
          body: ["decision": "approve"]),
        .init(
          label: "Reject", path: "/api/defects/\(id)/validate",
          body: ["decision": "reject"]),
      ]
    }
    if module.id == "defects", role == .maker, status == "Assigned" {
      return [.init(label: "Start work", path: "/api/defects/\(id)/start", body: ["status": "In Progress"])]
    }
    if module.id == "defects", role == .maker, status == "In Progress" {
      return [.init(label: "Submit ATR", path: "local:atr", body: [:])]
    }
    if module.id == "defects", role == .checker, status == "ATR Submitted" {
      return [
        .init(
          label: "Verify ATR", path: "/api/defects/\(id)/verify-atr",
          body: ["decision": "verify", "note": "Verified in native app"]),
        .init(
          label: "Rework", path: "/api/defects/\(id)/verify-atr",
          body: ["decision": "rework", "note": "Further work required"]),
      ]
    }
    if module.id == "defects", role == .citizen, ["Resolved", "Closed"].contains(status) {
      return [
        .init(label: "Close · 5 stars", path: "/api/defects/\(id)/feedback", body: ["rating": 5, "comment": "Resolved satisfactorily in the native app", "reopen": false]),
        .init(label: "Reopen", path: "/api/defects/\(id)/feedback", body: ["rating": 2, "comment": "The issue still requires attention", "reopen": true]),
      ]
    }
    if module.id == "inspections", role == .maker || role == .checker, status == "Scheduled" {
      return [
        .init(label: "Accept", path: "/api/inspections/\(id)", body: ["status": "Accepted"]),
        .init(label: "Not ready", path: "/api/inspections/\(id)", body: ["status": "Not Ready"]),
      ]
    }
    if module.id == "inspections", role == .maker || role == .checker, status == "Accepted" {
      return [.init(label: "Start", path: "/api/inspections/\(id)", body: ["status": "In Progress"])]
    }
    if module.id == "inspections", role == .maker || role == .checker, status == "In Progress" {
      let checklist = (record["checklist"] as? [[String: Any]] ?? []).map { ["item": $0["item"] as? String ?? "Checklist item", "status": "Pass", "note": "Completed in native app"] }
      return [.init(label: "Complete · all pass", path: "/api/inspections/\(id)", body: ["status": "Completed", "checklist": checklist])]
    }
    if module.id == "tickets", [.tenantAdmin, .authority, .checker].contains(role), !["Resolved", "Closed"].contains(status) {
      return [.init(label: "Resolve", path: "/api/tickets/\(id)", body: ["status": "Resolved", "message": "Resolved from the native app"])]
    }
    if module.id == "tenants", role == .tenantAdmin {
      let live = status == "Live"
      return [.init(label: live ? "Deactivate" : "Set live", path: "/api/tenants/\(id)", body: ["status": live ? "Inactive" : "Live"])]
    }
    if module.id == "users", role == .tenantAdmin || role == .authority,
      !["tenant_admin", "citizen"].contains(record["role"] as? String ?? "")
    {
      let active = record["active"] as? Bool ?? true
      return [.init(label: active ? "Deactivate" : "Activate", path: "/api/users/\(id)", body: ["active": !active])]
    }
    if module.id == "projects", role == .authority {
      let next = min((record["progress"] as? Int ?? 0) + 10, 100)
      return [.init(label: next == 100 ? "Complete" : "Advance to \(next)%", path: "/api/projects/\(id)", body: ["progress": next, "status": next == 100 ? "Completed" : "Active"])]
    }
    if module.id == "assets", role == .authority {
      let attention = record["condition"] as? String == "Attention"
      return [.init(label: attention ? "Mark good" : "Needs attention", path: "/api/assets/\(id)", body: ["condition": attention ? "Good" : "Attention"])]
    }
    if module.id == "gis_imports", role == .authority, status == "Published" {
      return [.init(label: "Rollback import", path: "/api/gis/imports/\(id)/rollback", body: [:])]
    }
    if module.id == "payments", role == .checker, status == "Submitted" {
      return [
        .init(
          label: "Verify", path: "/api/payments/\(id)/action",
          body: ["decision": "approve", "note": "Verified in native app"])
      ]
    }
    if module.id == "payments", role == .authority, status == "Checker Verified" {
      return [
        .init(
          label: "Approve", path: "/api/payments/\(id)/action",
          body: ["decision": "approve", "note": "Approved in native app"])
      ]
    }
    if module.id == "sync", role == .checker || role == .authority {
      return [
        .init(
          label: "Keep server", path: "/api/sync/conflicts/\(id)/resolve",
          body: ["decision": "keep-server", "note": "Reviewed in native app"])
      ]
    }
    return []
  }
}

struct ATRView: View {
  @EnvironmentObject var app: AppModel
  let defectId: String
  @Binding var isPresented: Bool
  @StateObject private var location = LocationController()
  @State private var summary = ""
  @State private var evidenceItem: PhotosPickerItem?
  @State private var evidenceData: Data?
  @State private var showingCamera = false
  var body: some View {
    NavigationStack {
      Form {
        TextField("Rectification summary", text: $summary, axis: .vertical).lineLimit(3...6)
        Button {
          if CameraPicker.isAvailable { showingCamera = true }
          else { app.error = "The camera is unavailable in this simulator. Choose a photo or video instead." }
        } label: {
          Label("Capture rectification photo", systemImage: "camera.fill")
        }
        PhotosPicker(selection: $evidenceItem, matching: .any(of: [.images, .videos])) {
          Label(evidenceData == nil ? "Choose photo or video" : "Evidence selected", systemImage: "photo.on.rectangle")
        }.onChange(of: evidenceItem) { _, item in
          Task { evidenceData = try? await item?.loadTransferable(type: Data.self) }
        }
        if let gps = location.location { Text(String(format: "GPS %.6f, %.6f · ±%.0f m", gps.coordinate.latitude, gps.coordinate.longitude, gps.horizontalAccuracy)).font(.caption) }
        else { Button("Acquire current GPS") { location.request() } }
      }.navigationTitle("Submit ATR").toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { isPresented = false } }
        ToolbarItem(placement: .confirmationAction) { Button("Submit") { Task { await submit() } }.disabled(summary.count < 10 || evidenceData == nil) }
      }
    }.task { location.request() }.sheet(isPresented: $showingCamera) {
      CameraPicker { evidenceData = $0 }
    }
  }
  private func submit() async {
    await app.mutate {
      guard let gps = location.location, let evidenceData else { throw APIError.server("Current GPS and one photo or video are required.") }
      let media = try await app.api.upload(data: evidenceData, mimeType: "image/jpeg", fileName: "iimm-atr-\(Int(Date().timeIntervalSince1970)).jpg", lat: gps.coordinate.latitude, lng: gps.coordinate.longitude, accuracyMeters: gps.horizontalAccuracy)
      _ = try await app.api.post("/api/defects/\(defectId)/atr", body: ["summary": summary, "media": [media["id"] as? String ?? ""], "lat": gps.coordinate.latitude, "lng": gps.coordinate.longitude, "accuracyMeters": gps.horizontalAccuracy])
      isPresented = false
    }
  }
}

struct CreateView: View {
  @EnvironmentObject var app: AppModel
  let module: ModuleSpec
  @Binding var isPresented: Bool
  @StateObject private var location = LocationController()
  @State private var first = ""
  @State private var second = ""
  @State private var third = ""
  @State private var evidenceItem: PhotosPickerItem?
  @State private var evidenceData: Data?
  @State private var showingCamera = false
  var labels: [String] {
    switch module.id {
    case "defects": return ["Issue title", "Description", "Severity"]
    case "tickets": return ["Subject", "Description", "Priority"]
    case "payments": return ["Invoice number", "Amount", "Attendance reference"]
    case "projects": return ["Project code", "Project name", "Location"]
    case "assets": return ["Asset name", "Asset type", "Location"]
    case "users": return ["Full name", "Email", "Mobile"]
    case "tenants": return ["Organisation name", "Short name", "Organisation type"]
    case "inspections": return ["Project ID", "Asset ID", "Checker ID"]
    default: return ["Project ID", "", ""]
    }
  }
  var body: some View {
    NavigationStack {
      Form {
        TextField(labels[0], text: $first)
        if !labels[1].isEmpty { TextField(labels[1], text: $second) }
        if !labels[2].isEmpty { TextField(labels[2], text: $third) }
        if module.id == "defects" {
          Button {
            if CameraPicker.isAvailable { showingCamera = true }
            else { app.error = "The camera is unavailable in this simulator. Choose a photo or video instead." }
          } label: {
            Label("Capture issue photo", systemImage: "camera.fill")
          }
          PhotosPicker(selection: $evidenceItem, matching: .any(of: [.images, .videos])) {
            Label(evidenceData == nil ? "Choose required photo or video" : "Evidence selected", systemImage: "photo.on.rectangle")
          }.onChange(of: evidenceItem) { _, item in
            Task { evidenceData = try? await item?.loadTransferable(type: Data.self) }
          }
          if let gps = location.location {
            Text(String(format: "GPS %.6f, %.6f · ±%.0f m", gps.coordinate.latitude, gps.coordinate.longitude, gps.horizontalAccuracy)).font(.caption).foregroundStyle(.secondary)
          } else { Button("Acquire current GPS") { location.request() } }
        }
        Text("Related project/user assignments use the first eligible tenant record when omitted.")
          .font(.caption).foregroundStyle(.secondary)
    }.navigationTitle("Create \(module.id.capitalized)").toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { isPresented = false } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Submit") { Task { await submit() } }.disabled(first.isEmpty || (module.id == "defects" && evidenceData == nil))
        }
      }
    }.task { if module.id == "attendance" || module.id == "defects" { location.request() } }.sheet(isPresented: $showingCamera) {
      CameraPicker { evidenceData = $0 }
    }
  }
  func submit() async {
    await app.mutate {
      let projects = try await app.api.get("/api/projects") as? [[String: Any]] ?? []
      let users = try await app.api.get("/api/users") as? [[String: Any]] ?? []
      let assets = try await app.api.get("/api/assets") as? [[String: Any]] ?? []
      let project = projects.first?["id"] as? String ?? ""
      let checker = users.first { $0["role"] as? String == "checker" }?["id"] as? String ?? ""
      let authority = users.first { $0["role"] as? String == "authority" }?["id"] as? String ?? ""
      let maker = users.first { $0["role"] as? String == "maker" }?["id"] as? String ?? ""
      let path: String
      let body: [String: Any]
      switch module.id {
      case "attendance":
        guard let gps = location.location else { throw APIError.server("Allow location access and wait for a GPS fix before submitting attendance.") }
        path = "/api/attendance"
        body = ["projectId": first.isEmpty ? project : first, "lat": gps.coordinate.latitude, "lng": gps.coordinate.longitude, "accuracyMeters": gps.horizontalAccuracy, "offline": false]
      case "defects":
        guard let gps = location.location, let evidenceData else { throw APIError.server("Current GPS and one photo or video are required.") }
        let uploaded = try await app.api.upload(data: evidenceData, mimeType: "image/jpeg", fileName: "iimm-evidence-\(Int(Date().timeIntervalSince1970)).jpg", lat: gps.coordinate.latitude, lng: gps.coordinate.longitude, accuracyMeters: gps.horizontalAccuracy)
        let address = try await app.api.reverse(lat: gps.coordinate.latitude, lng: gps.coordinate.longitude)
        path = "/api/defects"
        body = [
          "projectId": project, "assetId": NSNull(), "title": first, "description": second,
          "location": address, "lat": gps.coordinate.latitude, "lng": gps.coordinate.longitude,
          "severity": ["Low", "Medium", "High", "Critical"].contains(third) ? third : "Medium",
          "media": [uploaded["id"] as? String ?? ""], "locationAccuracyMeters": gps.horizontalAccuracy,
        ]
      case "tickets":
        path = "/api/tickets"
        body = [
          "category": "Mobile app",
          "priority": ["Low", "Medium", "High", "Critical"].contains(third) ? third : "Medium",
          "subject": first, "description": second,
        ]
      case "payments":
        path = "/api/payments"
        body = [
          "projectId": project, "invoiceNo": first, "checkerId": checker, "authorityId": authority,
          "amount": Double(second) ?? 1, "attendanceReference": third,
          "inspectionReference": "Native app claim",
        ]
      case "projects":
        path = "/api/projects"
        body = [
          "code": first, "name": second, "location": third, "assetType": "Road", "makerIds": [],
          "checkerIds": [], "geofenceRadiusMeters": 250,
        ]
      case "assets":
        path = "/api/assets"
        body = [
          "projectId": project, "name": first, "type": second, "location": third,
          "condition": "Good", "attributes": [:], "layerId": NSNull(),
        ]
      case "users":
        path = "/api/users"
        body = [
          "name": first, "email": second, "mobile": third, "role": "maker",
          "designation": "Field user",
        ]
      case "tenants":
        path = "/api/tenants"
        body = [
          "name": first, "shortName": second, "type": third,
          "hierarchy": "Head Office > Division > Site",
          "modules": ["Asset Management", "Attendance"],
          "assetTypes": [["name": "Road", "attributes": [], "checklist": []]],
        ]
      case "inspections":
        path = "/api/inspections"
        body = [
          "projectId": first.isEmpty ? project : first,
          "assetId": second.isEmpty ? (assets.first?["id"] as? String ?? "") : second,
          "type": "Requested", "makerId": maker, "checkerId": third.isEmpty ? checker : third,
          "scheduledAt": ISO8601DateFormatter().string(from: Date()), "checklist": [],
        ]
      default: return
      }
      do {
        _ = try await app.api.post(path, body: body)
      } catch {
        let networkFailure = (error as NSError).domain == NSURLErrorDomain
        guard module.id == "attendance", networkFailure else { throw error }
        var queuedBody = body
        queuedBody["offline"] = true
        app.queue.enqueue(entityType: "Attendance", entityId: "local-att-\(Int(Date().timeIntervalSince1970 * 1000))", payload: queuedBody)
        isPresented = false
        return
      }
      await app.load(module)
      isPresented = false
    }
  }
}
