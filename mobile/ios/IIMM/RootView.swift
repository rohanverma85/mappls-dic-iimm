import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

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
    case "gis_imports": return role == .authority
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
      if module.id == "tickets" {
        Section("Self-serve help") {
          DisclosureGroup("How does offline sync work?") {
            Text("Field actions are stored locally when connectivity is poor. On reconnect, the server timestamp wins; conflicting local edits remain in a manual-review queue instead of being silently dropped.")
          }
          DisclosureGroup("Why was my report linked as a duplicate?") {
            Text("Nearby open reports on the same asset are linked to one official defect. Your report still counts, raises visibility and may escalate severity.")
          }
          DisclosureGroup("Who verifies my Action Taken Report?") {
            Text("The assigned Checker reviews your evidence and work outcome. A defect becomes resolved only after that independent verification.")
          }
        }
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
    }.sheet(isPresented: $creating) {
      if module.id == "gis_imports" { GisImportView(isPresented: $creating) }
      else { CreateView(module: module, isPresented: $creating) }
    }.task {
      await app.load(module)
    }.refreshable { await app.load(module) }
  }
}

struct RecordView: View {
  @EnvironmentObject var app: AppModel
  let record: [String: Any]
  let module: ModuleSpec
  @State private var showingATR = false
  @State private var showingInspection = false
  @State private var showingTicket = false
  @State private var showingDetail = false
  @State private var showingManage = false
  @State private var showingValidation = false
  @State private var showingFeedback = false
  @State private var showingReview = false
  @State private var reviewKind = ""
  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      Text(title(record)).bold()
      let detail = subtitle(record)
      if !detail.isEmpty { Text(detail).font(.caption).foregroundStyle(.secondary) }
      HStack {
        ForEach(Array(actions.prefix(2).enumerated()), id: \.offset) { _, action in
          Button(action.label) {
            if action.path == "local:atr" { showingATR = true }
            else if action.path == "local:inspection" { showingInspection = true }
            else if action.path == "local:ticket" { showingTicket = true }
            else if action.path == "local:manage" { showingManage = true }
            else if action.path == "local:defect-validation" { showingValidation = true }
            else if action.path == "local:feedback" { showingFeedback = true }
            else if ["local:payment-review","local:atr-review"].contains(action.path) { reviewKind=action.path;showingReview=true }
            else { Task {
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
        Button("Details") { showingDetail = true }.buttonStyle(.bordered)
      }
    }.padding(.vertical, 5).sheet(isPresented: $showingATR) {
      ATRView(defectId: record["id"] as? String ?? "", isPresented: $showingATR)
    }.sheet(isPresented: $showingInspection) {
      InspectionDetailView(record: record, isPresented: $showingInspection)
    }.sheet(isPresented: $showingTicket) {
      TicketDetailView(record: record, isPresented: $showingTicket)
    }.sheet(isPresented: $showingDetail) {
      NativeRecordDetailView(record: record, module: module, isPresented: $showingDetail)
    }.sheet(isPresented: $showingManage) {
      ManageRecordView(record: record, module: module, isPresented: $showingManage)
    }.sheet(isPresented: $showingValidation) {
      DefectValidationView(record: record, module: module, isPresented: $showingValidation)
    }.sheet(isPresented: $showingFeedback) {
      CitizenFeedbackView(record: record, module: module, isPresented: $showingFeedback)
    }.sheet(isPresented: $showingReview) {
      DecisionReviewView(record: record, module: module, kind: reviewKind, isPresented: $showingReview)
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
      return [.init(label: "Review & assign", path: "local:defect-validation", body: [:])]
    }
    if module.id == "defects", role == .maker, ["Assigned", "Reopened"].contains(status) {
      return [.init(label: "Start work", path: "/api/defects/\(id)/start", body: ["status": "In Progress"])]
    }
    if module.id == "defects", role == .maker, status == "In Progress" {
      return [.init(label: "Submit ATR", path: "local:atr", body: [:])]
    }
    if module.id == "defects", role == .checker, status == "ATR Submitted" {
      return [.init(label: "Review ATR", path: "local:atr-review", body: [:])]
    }
    if module.id == "defects", role == .citizen, ["Resolved", "Closed"].contains(status) {
      return [.init(label: "Rate resolution", path: "local:feedback", body: [:])]
    }
    if module.id == "inspections" { return [.init(label: "Open checklist", path: "local:inspection", body: [:])] }
    if module.id == "tickets" { return [.init(label: "View & respond", path: "local:ticket", body: [:])] }
    if module.id == "tenants", role == .tenantAdmin {
      let live = status == "Live"
      return [.init(label: live ? "Deactivate" : "Set live", path: "/api/tenants/\(id)", body: ["status": live ? "Inactive" : "Live"]), .init(label: "Configure", path: "local:manage", body: [:])]
    }
    if module.id == "users", role == .tenantAdmin || role == .authority,
      !["tenant_admin", "citizen"].contains(record["role"] as? String ?? "")
    {
      let active = record["active"] as? Bool ?? true
      return [.init(label: active ? "Deactivate" : "Activate", path: "/api/users/\(id)", body: ["active": !active]), .init(label: "Edit access", path: "local:manage", body: [:])]
    }
    if module.id == "projects", role == .authority {
      let next = min((record["progress"] as? Int ?? 0) + 10, 100)
      return [.init(label: next == 100 ? "Complete" : "Advance to \(next)%", path: "/api/projects/\(id)", body: ["progress": next, "status": next == 100 ? "Completed" : "Active"]), .init(label: "Manage", path: "local:manage", body: [:])]
    }
    if module.id == "assets", role == .authority {
      let attention = record["condition"] as? String == "Attention"
      return [.init(label: attention ? "Mark good" : "Needs attention", path: "/api/assets/\(id)", body: ["condition": attention ? "Good" : "Attention"]), .init(label: "Manage", path: "local:manage", body: [:])]
    }
    if module.id == "gis_imports", role == .authority, status == "Published" {
      return [.init(label: "Rollback import", path: "/api/gis/imports/\(id)/rollback", body: [:])]
    }
    if module.id == "payments", role == .checker, status == "Submitted" {
      return [.init(label: "Review claim", path: "local:payment-review", body: [:])]
    }
    if module.id == "payments", role == .authority, status == "Checker Verified" {
      return [.init(label: "Authorise claim", path: "local:payment-review", body: [:])]
    }
    if module.id == "sync", role == .checker || role == .authority {
      return [
        .init(
          label: "Keep server", path: "/api/sync/conflicts/\(id)/resolve",
          body: ["decision": "keep-server", "note": "Compared the queued edit with the current server record in the native app."]),
        .init(
          label: "Accept reviewed client", path: "/api/sync/conflicts/\(id)/resolve",
          body: ["decision": "reviewed-client", "note": "Reviewed the queued client edit and accepted it for manual follow-up."]),
      ]
    }
    return []
  }
}

struct NativeRecordDetailView: View {
  let record: [String: Any]
  let module: ModuleSpec
  @Binding var isPresented: Bool
  var rows: [(String, String)] { flatten(record).filter { $0.0 != "tenantId" && !$0.0.hasPrefix("featureCollection") }.prefix(100).map { $0 } }
  var body: some View {
    NavigationStack {
      List {
        Section("\(module.title) record") {
          ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
            VStack(alignment: .leading, spacing: 3) {
              Text(row.0.replacingOccurrences(of: "_", with: " ").capitalized).font(.caption).foregroundStyle(.secondary)
              Text(row.1).textSelection(.enabled)
            }.padding(.vertical, 3)
          }
        }
      }.navigationTitle(title(record)).toolbar { Button("Done") { isPresented = false } }
    }
  }
  private func flatten(_ value: Any, prefix: String = "") -> [(String, String)] {
    if let object = value as? [String: Any] {
      return object.keys.sorted().flatMap { flatten(object[$0] as Any, prefix: prefix.isEmpty ? $0 : "\(prefix) · \($0)") }
    }
    if let array = value as? [Any] {
      if array.isEmpty { return [(prefix, "None")] }
      return array.enumerated().flatMap { flatten($0.element, prefix: "\(prefix) \($0.offset + 1)") }
    }
    if value is NSNull { return [(prefix, "Not set")] }
    return [(prefix, String(describing: value))]
  }
}

struct DefectValidationView: View {
  @EnvironmentObject var app: AppModel
  let record: [String:Any];let module:ModuleSpec;@Binding var isPresented:Bool
  @State private var approve=true;@State private var users:[[String:Any]]=[];@State private var projects:[[String:Any]]=[];@State private var makerId="";@State private var projectId=""
  var body:some View{NavigationStack{Form{Picker("Decision",selection:$approve){Text("Approve and assign").tag(true);Text("Reject report").tag(false)}.pickerStyle(.segmented);if approve{Picker("Assigned Maker",selection:$makerId){ForEach(Array(users.enumerated()),id:\.offset){_,user in Text(user["name"] as? String ?? "Maker").tag(user["id"] as? String ?? "")}};Picker("Project",selection:$projectId){ForEach(Array(projects.enumerated()),id:\.offset){_,project in Text("\(project["code"] as? String ?? "") · \(project["name"] as? String ?? "")").tag(project["id"] as? String ?? "")}}};Text("Approval links the report to the chosen project and Maker. Rejection closes it as invalid.").font(.caption).foregroundStyle(.secondary)}.navigationTitle("Validate citizen issue").toolbar{ToolbarItem(placement:.cancellationAction){Button("Cancel"){isPresented=false}};ToolbarItem(placement:.confirmationAction){Button("Submit"){Task{await submit()}}.disabled(approve&&(makerId.isEmpty||projectId.isEmpty))}}}.task{await app.mutate{let all=try await app.api.get("/api/users") as? [[String:Any]] ?? [];users=all.filter{$0["role"] as? String=="maker"&&($0["active"] as? Bool != false)};projects=try await app.api.get("/api/projects") as? [[String:Any]] ?? [];makerId=users.first?["id"] as? String ?? "";projectId=projects.first?["id"] as? String ?? ""}}}
  func submit()async{await app.mutate{var body:[String:Any]=["decision":approve ? "approve":"reject"];if approve{body["makerId"]=makerId;body["projectId"]=projectId};_ = try await app.api.post("/api/defects/\(record["id"] as? String ?? "")/validate",body:body);await app.load(module);isPresented=false}}
}

struct CitizenFeedbackView:View{
  @EnvironmentObject var app:AppModel;let record:[String:Any];let module:ModuleSpec;@Binding var isPresented:Bool;@State private var rating=5.0;@State private var comment="";@State private var reopen=false
  var body:some View{NavigationStack{Form{Section("Resolution rating"){Text("\(Int(rating)) out of 5 stars").bold();Slider(value:$rating,in:1...5,step:1);TextField("Comments",text:$comment,axis:.vertical).lineLimit(3...8);Toggle("Reopen because work is incomplete",isOn:$reopen)}}.navigationTitle("Rate issue resolution").toolbar{ToolbarItem(placement:.cancellationAction){Button("Cancel"){isPresented=false}};ToolbarItem(placement:.confirmationAction){Button(reopen ? "Submit & reopen":"Close report"){Task{await submit()}}}}}}
  func submit()async{await app.mutate{_ = try await app.api.post("/api/defects/\(record["id"] as? String ?? "")/feedback",body:["rating":Int(rating),"comment":comment,"reopen":reopen]);await app.load(module);isPresented=false}}
}

struct DecisionReviewView:View{
  @EnvironmentObject var app:AppModel;let record:[String:Any];let module:ModuleSpec;let kind:String;@Binding var isPresented:Bool;@State private var approve=true;@State private var note=""
  var body:some View{NavigationStack{Form{Picker("Decision",selection:$approve){Text("Approve / verify").tag(true);Text("Reject / rework").tag(false)}.pickerStyle(.segmented);TextField("Auditable review note",text:$note,axis:.vertical).lineLimit(3...8);Text("The decision and note are stored on the approval record and activity log.").font(.caption).foregroundStyle(.secondary)}.navigationTitle(kind=="local:atr-review" ? "Review ATR":"Review payment claim").toolbar{ToolbarItem(placement:.cancellationAction){Button("Cancel"){isPresented=false}};ToolbarItem(placement:.confirmationAction){Button("Submit review"){Task{await submit()}}.disabled(note.trimmingCharacters(in:.whitespacesAndNewlines).count<3)}}}}
  func submit()async{await app.mutate{let atr=kind=="local:atr-review";let path=atr ? "/api/defects/\(record["id"] as? String ?? "")/verify-atr":"/api/payments/\(record["id"] as? String ?? "")/action";_ = try await app.api.post(path,body:["decision":atr ? (approve ? "verify":"rework"):(approve ? "approve":"reject"),"note":note]);await app.load(module);isPresented=false}}
}

struct ManageRecordView: View {
  @EnvironmentObject var app: AppModel
  let record: [String: Any]
  let module: ModuleSpec
  @Binding var isPresented: Bool
  @State private var name: String
  @State private var location: String
  @State private var status: String
  @State private var condition: String
  @State private var role: String
  @State private var designation: String
  @State private var active: Bool
  @State private var progress: String
  @State private var radius: String
  @State private var hierarchy: String
  @State private var modulesText: String
  @State private var makers: String
  @State private var checkers: String
  @State private var slas: String
  @State private var assetTypesText: String
  @State private var milestones: String
  @State private var documents: String
  @State private var attributes: String
  @State private var mapSelection: MapMarker?
  init(record: [String: Any], module: ModuleSpec, isPresented: Binding<Bool>) {
    self.record=record;self.module=module;_isPresented=isPresented
    _name=State(initialValue:record["name"] as? String ?? "");_location=State(initialValue:record["location"] as? String ?? "");_status=State(initialValue:record["status"] as? String ?? "");_condition=State(initialValue:record["condition"] as? String ?? "Good");_role=State(initialValue:record["role"] as? String ?? "maker");_designation=State(initialValue:record["designation"] as? String ?? "");_active=State(initialValue:record["active"] as? Bool ?? true);_progress=State(initialValue:String(record["progress"] as? Int ?? 0));_radius=State(initialValue:String(record["geofenceRadiusMeters"] as? Int ?? 250));_hierarchy=State(initialValue:record["hierarchy"] as? String ?? "");_modulesText=State(initialValue:(record["modules"] as? [String] ?? []).joined(separator:", "));_makers=State(initialValue:(record["makerIds"] as? [String] ?? []).joined(separator:", "));_checkers=State(initialValue:(record["checkerIds"] as? [String] ?? []).joined(separator:", "))
    let sla=record["slas"] as? [String:Any] ?? [:];_slas=State(initialValue:"\(sla["Critical"] as? Int ?? 24),\(sla["High"] as? Int ?? 72),\(sla["Medium"] as? Int ?? 168),\(sla["Low"] as? Int ?? 360)");_assetTypesText=State(initialValue:(record["assetTypes"] as? [[String:Any]] ?? []).map{item in "\(item["name"] as? String ?? "") | \((item["attributes"] as? [String] ?? []).joined(separator:", ")) | \((item["checklist"] as? [String] ?? []).joined(separator:", "))"}.joined(separator:"\n"))
    _milestones=State(initialValue:(record["milestones"] as? [[String:Any]] ?? []).map{"\(($0["done"] as? Bool)==true ? "✓":"○") \($0["name"] as? String ?? "") | \($0["due"] as? String ?? "")"}.joined(separator:"\n"));_documents=State(initialValue:(record["documents"] as? [[String:Any]] ?? []).compactMap{$0["name"] as? String}.joined(separator:"\n"));_attributes=State(initialValue:(record["attributes"] as? [String:Any] ?? [:]).keys.sorted().map{"\($0)=\((record["attributes"] as? [String:Any])?[$0] as? String ?? "")"}.joined(separator:"\n"));let center=(record["center"] as? [String:Any]).flatMap{c->MapMarker? in guard let lat=c["lat"] as? Double,let lng=c["lng"] as? Double else{return nil};return .init(lat:lat,lng:lng,title:"Project centre",kind:"Selection")};let point=(record["geometry"] as? [String:Any]).flatMap{g->MapMarker? in guard g["type"] as? String=="Point",let c=g["coordinates"] as? [Double],c.count>1 else{return nil};return .init(lat:c[1],lng:c[0],title:"Asset location",kind:"Selection")};_mapSelection=State(initialValue:module.id=="projects" ? center:point)
  }
  var body: some View {
    NavigationStack {
      Form {
        if ["tenants","projects","assets"].contains(module.id) { TextField("Name",text:$name) }
        if module.id == "tenants" {
          Picker("Status",selection:$status){ForEach(["Live","Provisioning","Requested","Inactive"],id:\.self){Text($0).tag($0)}}
          TextField("Hierarchy",text:$hierarchy);TextField("Modules · comma separated",text:$modulesText,axis:.vertical);TextField("Asset types · Name | attrs | checklist",text:$assetTypesText,axis:.vertical).lineLimit(5...12);TextField("SLA hours · Critical, High, Medium, Low",text:$slas)
        }
        if module.id == "users" {
          Picker("Role",selection:$role){Text("Authority").tag("authority");Text("Maker").tag("maker");Text("Checker").tag("checker")};TextField("Designation",text:$designation);Toggle("Active access",isOn:$active)
        }
        if module.id == "projects" {
          NativeMap(dataset:MapDataset(),selected:$mapSelection).frame(height:230).clipShape(RoundedRectangle(cornerRadius:14));TextField("Location",text:$location);Picker("Status",selection:$status){ForEach(["Active","Pending","In Review","Overdue","Completed"],id:\.self){Text($0).tag($0)}};TextField("Progress · 0–100",text:$progress).keyboardType(.numberPad);TextField("Geofence radius · metres",text:$radius).keyboardType(.numberPad);TextField("Maker IDs · comma separated",text:$makers);TextField("Checker IDs · comma separated",text:$checkers);TextField("Milestones · ✓/○ name | due",text:$milestones,axis:.vertical).lineLimit(4...10);TextField("Project documents · one name per line",text:$documents,axis:.vertical).lineLimit(4...10)
        }
        if module.id == "assets" {
          NativeMap(dataset:MapDataset(),selected:$mapSelection).frame(height:230).clipShape(RoundedRectangle(cornerRadius:14));Picker("Condition",selection:$condition){ForEach(["Good","Fair","Attention","Critical"],id:\.self){Text($0).tag($0)}};TextField("Location",text:$location);TextField("Attributes · one key=value per line",text:$attributes,axis:.vertical).lineLimit(5...12)
        }
      }.navigationTitle("Manage \(title(record))").toolbar { ToolbarItem(placement:.cancellationAction){Button("Cancel"){isPresented=false}};ToolbarItem(placement:.confirmationAction){Button("Save"){Task{await save()}}} }
    }
  }
  func csv(_ value:String)->[String]{value.split(separator:",").map{$0.trimmingCharacters(in:.whitespaces)}.filter{!$0.isEmpty}}
  func payload()->[String:Any]{
    switch module.id {
    case "tenants":
      let h=csv(slas).compactMap(Int.init);let existing=record["assetTypes"] as? [[String:Any]] ?? [];let types=assetTypesText.split(separator:"\n").enumerated().compactMap{index,line->[String:Any]? in let p=line.split(separator:"|",maxSplits:2).map{String($0).trimmingCharacters(in:.whitespaces)};guard let name=p.first,!name.isEmpty else{return nil};return ["id":existing.indices.contains(index) ? existing[index]["id"] as? String ?? "at-native-\(UUID().uuidString)":"at-native-\(UUID().uuidString)","name":name,"attributes":p.count>1 ? csv(p[1]):[],"checklist":p.count>2 ? csv(p[2]):[]]};return ["name":name,"hierarchy":hierarchy,"modules":csv(modulesText),"assetTypes":types,"status":status,"slas":["Critical":h.count>0 ? h[0]:24,"High":h.count>1 ? h[1]:72,"Medium":h.count>2 ? h[2]:168,"Low":h.count>3 ? h[3]:360]]
    case "users": return ["role":role,"designation":designation,"active":active]
    case "projects":
      let existing=record["documents"] as? [[String:Any]] ?? [];let docs=documents.split(separator:"\n").enumerated().map{index,line in ["id":existing.indices.contains(index) ? existing[index]["id"] as? String ?? "doc-\(UUID().uuidString)":"doc-\(UUID().uuidString)","name":String(line).trimmingCharacters(in:.whitespaces),"category":existing.indices.contains(index) ? existing[index]["category"] as? String ?? "Project document":"Project document","uploadedAt":existing.indices.contains(index) ? existing[index]["uploadedAt"] as? String ?? ISO8601DateFormatter().string(from:Date()):ISO8601DateFormatter().string(from:Date())]}
      let marks=milestones.split(separator:"\n").map{line->[String:Any] in let raw=String(line);let parts=raw.trimmingCharacters(in:CharacterSet(charactersIn:"✓○ ")).split(separator:"|",maxSplits:1).map{String($0).trimmingCharacters(in:.whitespaces)};return ["name":parts.first ?? "Milestone","due":parts.count>1 ? parts[1]:"TBD","done":raw.trimmingCharacters(in:.whitespaces).hasPrefix("✓")]}
      var value:[String:Any]=["name":name,"location":location,"status":status,"progress":Int(progress) ?? 0,"geofenceRadiusMeters":Int(radius) ?? 250,"makerIds":csv(makers),"checkerIds":csv(checkers),"milestones":marks,"documents":docs];if let p=mapSelection{value["center"]=["lat":p.lat,"lng":p.lng]};return value
    case "assets": var value:[String:Any]=["name":name,"location":location,"condition":condition,"attributes":Dictionary(uniqueKeysWithValues:attributes.split(separator:"\n").compactMap{line->(String,String)? in let p=line.split(separator:"=",maxSplits:1).map{String($0).trimmingCharacters(in:.whitespaces)};return p.count==2 ? (p[0],p[1]):nil})];if let p=mapSelection{value["geometry"]=["type":"Point","coordinates":[p.lng,p.lat]]};return value
    default:return [:]
    }
  }
  func save() async { await app.mutate { _ = try await app.api.patch("/api/\(module.id)/\(record["id"] as? String ?? "")",body:payload());await app.load(module);isPresented=false } }
}

struct GisImportView: View {
  @EnvironmentObject var app: AppModel
  @Binding var isPresented: Bool
  @State private var choosingFile = false
  @State private var fileName = ""
  @State private var parsed: [String: Any]?
  @State private var projects: [[String: Any]] = []
  @State private var assets: [[String: Any]] = []
  @State private var layers: [[String: Any]] = []
  @State private var projectId = ""
  @State private var assetType = ""
  @State private var layerName = ""
  @State private var description = "Imported infrastructure network"
  @State private var sourceIdField = ""
  @State private var nameField = ""
  @State private var replaceLayerId = ""
  var fields: [String] { parsed?["fields"] as? [String] ?? [] }
  var types: [String] {
    Array(Set(assets.compactMap { $0["type"] as? String } + projects.compactMap { $0["assetType"] as? String })).sorted()
  }
  var projectLayers: [[String: Any]] { layers.filter { ($0["projectId"] as? String) == projectId && ($0["visible"] as? Bool) != false } }
  var featureCount: Int { ((parsed?["featureCollection"] as? [String: Any])?["features"] as? [Any])?.count ?? 0 }
  var body: some View {
    NavigationStack {
      Form {
        Section("Source file") {
          Button { choosingFile = true } label: { Label(fileName.isEmpty ? "Choose KML, KMZ or Shapefile ZIP" : fileName, systemImage: "doc.badge.plus") }
          if let parsed {
            LabeledContent("Format", value: parsed["format"] as? String ?? "")
            LabeledContent("Features", value: "\(featureCount)")
          }
        }
        if parsed != nil {
          Section("Publish as versioned infrastructure") {
            Picker("Project", selection: $projectId) {
              ForEach(Array(projects.enumerated()), id: \.offset) { _, project in
                Text("\(project["code"] as? String ?? "") · \(project["name"] as? String ?? "")").tag(project["id"] as? String ?? "")
              }
            }
            Picker("Asset type", selection: $assetType) { ForEach(types, id: \.self) { Text($0).tag($0) } }
            TextField("Layer name", text: $layerName)
            TextField("Description", text: $description, axis: .vertical)
            Picker("Unique source ID", selection: $sourceIdField) {
              Text("Generate deterministic IDs").tag("")
              ForEach(fields, id: \.self) { Text($0).tag($0) }
            }
            Picker("Feature name", selection: $nameField) {
              Text("Generate names").tag("")
              ForEach(fields, id: \.self) { Text($0).tag($0) }
            }
            if !projectLayers.isEmpty {
              Picker("Replace layer", selection: $replaceLayerId) {
                Text("Publish as new layer").tag("")
                ForEach(Array(projectLayers.enumerated()), id: \.offset) { _, layer in
                  Text("\(layer["name"] as? String ?? "Layer") · v\(layer["version"] as? Int ?? 1)").tag(layer["id"] as? String ?? "")
                }
              }
            }
          }
          if let warnings = parsed?["warnings"] as? [String], !warnings.isEmpty {
            Section("Validation notes") { ForEach(warnings, id: \.self) { Text($0).foregroundStyle(.orange) } }
          }
          Section { Text("Publishing creates or updates mapped assets, records an auditable layer version, and supports one-tap rollback.").font(.caption).foregroundStyle(.secondary) }
        }
      }.navigationTitle("Import GIS network").toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { isPresented = false } }
        ToolbarItem(placement: .confirmationAction) { Button("Publish") { Task { await publish() } }.disabled(parsed == nil || projectId.isEmpty || assetType.isEmpty || layerName.count < 3) }
      }.fileImporter(isPresented: $choosingFile, allowedContentTypes: [.data, .archive], allowsMultipleSelection: false) { result in
        Task { await select(result) }
      }.task { await loadOptions() }
    }
  }
  func loadOptions() async {
    await app.mutate {
      projects = try await app.api.get("/api/projects") as? [[String: Any]] ?? []
      assets = try await app.api.get("/api/assets") as? [[String: Any]] ?? []
      layers = try await app.api.get("/api/gis/layers") as? [[String: Any]] ?? []
      projectId = projects.first?["id"] as? String ?? ""
      assetType = assets.first?["type"] as? String ?? projects.first?["assetType"] as? String ?? ""
    }
  }
  func select(_ result: Result<[URL], Error>) async {
    await app.mutate {
      let urls = try result.get()
      guard let url = urls.first else { throw APIError.server("No GIS file was selected") }
      let scoped = url.startAccessingSecurityScopedResource()
      defer { if scoped { url.stopAccessingSecurityScopedResource() } }
      let data = try Data(contentsOf: url)
      fileName = url.lastPathComponent
      parsed = try await app.api.parseGisFile(data: data, fileName: fileName)
      layerName = url.deletingPathExtension().lastPathComponent.replacingOccurrences(of: "_", with: " ").replacingOccurrences(of: "-", with: " ")
      sourceIdField = fields.first { $0.range(of: "^(asset_?id|id|uid)$", options: [.regularExpression, .caseInsensitive]) != nil } ?? ""
      nameField = fields.first { $0.caseInsensitiveCompare("name") == .orderedSame } ?? ""
    }
  }
  func publish() async {
    guard let parsed, let featureCollection = parsed["featureCollection"] else { return }
    await app.mutate {
      _ = try await app.api.post("/api/gis/imports", body: [
        "projectId": projectId, "assetType": assetType, "layerName": layerName, "description": description,
        "fileName": fileName, "format": parsed["format"] as? String ?? "KML",
        "sourceIdField": sourceIdField.isEmpty ? NSNull() : sourceIdField,
        "nameField": nameField.isEmpty ? NSNull() : nameField,
        "replaceLayerId": replaceLayerId.isEmpty ? NSNull() : replaceLayerId,
        "style": ["color": "#104685", "width": 5, "opacity": 0.82],
        "featureCollection": featureCollection, "warnings": parsed["warnings"] as? [String] ?? [],
      ])
      await app.load(modules.first { $0.id == "gis_imports" }!)
      isPresented = false
    }
  }
}

struct InspectionChecklistDraft: Identifiable {
  let id = UUID()
  var item: String
  var status: String
  var note: String
}

struct InspectionDetailView: View {
  @EnvironmentObject var app: AppModel
  let record: [String: Any]
  @Binding var isPresented: Bool
  @State private var checklist: [InspectionChecklistDraft]

  init(record: [String: Any], isPresented: Binding<Bool>) {
    self.record = record
    self._isPresented = isPresented
    let values = (record["checklist"] as? [[String: Any]] ?? []).map {
      InspectionChecklistDraft(
        item: $0["item"] as? String ?? "Checklist item",
        status: $0["status"] as? String ?? "Pending",
        note: $0["note"] as? String ?? "")
    }
    self._checklist = State(initialValue: values)
  }

  private var role: Role? { app.session?.user.role }
  private var editable: Bool { role == .maker || role == .checker }
  private var status: String { record["status"] as? String ?? "" }
  private var id: String { record["id"] as? String ?? "" }
  private var checklistJSON: [[String: Any]] {
    checklist.map { item in
      var value: [String: Any] = ["item": item.item, "status": item.status]
      if !item.note.isEmpty { value["note"] = item.note }
      return value
    }
  }

  var body: some View {
    NavigationStack {
      Form {
        Section("Inspection") {
          LabeledContent("ID", value: id)
          LabeledContent("Type", value: record["type"] as? String ?? "")
          LabeledContent("Status", value: status)
          if let defectIds = record["defectIds"] as? [String], !defectIds.isEmpty {
            LabeledContent("Raised defects", value: defectIds.joined(separator: ", "))
          }
        }
        Section("Asset checklist") {
          if checklist.isEmpty { Text("No checklist items were configured.").foregroundStyle(.secondary) }
          ForEach($checklist) { $item in
            VStack(alignment: .leading, spacing: 8) {
              Text(item.item).font(.headline)
              if editable && ["In Progress", "Paused"].contains(status) {
                Picker("Result", selection: $item.status) {
                  Text("Pending").tag("Pending")
                  Text("Pass").tag("Pass")
                  Text("Flag").tag("Flag")
                }.pickerStyle(.segmented)
                if item.status == "Flag" {
                  TextField("Describe the issue", text: $item.note, axis: .vertical).lineLimit(2...4)
                }
              } else { Text(item.status).foregroundStyle(.secondary) }
            }.padding(.vertical, 4)
          }
        }
        if editable {
          Section("Workflow") {
            if status == "Scheduled" {
              Button("Accept") { Task { await update(["status": "Accepted"]) } }
              Button("Not ready") { Task { await update(["status": "Not Ready"]) } }
              Button("Reject", role: .destructive) { Task { await update(["status": "Rejected"]) } }
            } else if status == "Accepted" {
              Button("Start inspection") { Task { await update(["status": "In Progress"]) } }
            } else if status == "Paused" {
              Button("Resume inspection") { Task { await update(["status": "In Progress", "checklist": checklistJSON]) } }
            } else if status == "In Progress" {
              Button("Pause and save") { Task { await update(["status": "Paused", "checklist": checklistJSON]) } }
              Button("Complete inspection") { Task { await update(["status": "Completed", "checklist": checklistJSON]) } }
                .disabled(checklist.contains { $0.status == "Pending" })
            }
          }
        }
      }.navigationTitle("Inspection checklist").navigationBarTitleDisplayMode(.inline).toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Close") { isPresented = false } }
        if editable && ["In Progress", "Paused"].contains(status) {
          ToolbarItem(placement: .confirmationAction) { Button("Save") { Task { await update(["checklist": checklistJSON]) } } }
        }
      }
    }
  }

  private func update(_ body: [String: Any]) async {
    await app.mutate {
      do { _ = try await app.api.patch("/api/inspections/\(id)", body: body) }
      catch {
        guard (error as NSError).domain == NSURLErrorDomain else { throw error }
        app.queue.enqueue(entityType: "Inspection", entityId: id, payload: body)
      }
      isPresented = false
    }
  }
}

struct TicketDetailView: View {
  @EnvironmentObject var app: AppModel
  let record: [String: Any]
  @Binding var isPresented: Bool
  @State private var message = ""
  private var id: String { record["id"] as? String ?? "" }
  private var status: String { record["status"] as? String ?? "" }
  private var manager: Bool {
    guard let role = app.session?.user.role else { return false }
    return [.tenantAdmin, .authority, .checker].contains(role)
  }
  private var nextStatus: String? {
    switch status {
    case "Open", "Reopened": "Assigned"
    case "Assigned": "In Progress"
    case "In Progress": "Resolved"
    case "Resolved": "Closed"
    default: nil
    }
  }
  var body: some View {
    NavigationStack {
      Form {
        Section("Ticket") {
          Text(record["subject"] as? String ?? id).font(.headline)
          LabeledContent("Priority", value: record["priority"] as? String ?? "")
          LabeledContent("Status", value: status)
        }
        Section("Conversation") {
          let messages = record["messages"] as? [[String: Any]] ?? []
          ForEach(Array(messages.suffix(10).enumerated()), id: \.offset) { _, item in
            VStack(alignment: .leading, spacing: 4) {
              Text((item["by"] as? String) == app.session?.user.id ? "You" : item["by"] as? String ?? "Support").font(.caption.bold())
              Text(item["text"] as? String ?? "")
              Text(item["at"] as? String ?? "").font(.caption2).foregroundStyle(.secondary)
            }.padding(.vertical, 3)
          }
          TextField("Add an update", text: $message, axis: .vertical).lineLimit(2...5)
          Button("Send update") { Task { await update(["message": message.trimmingCharacters(in: .whitespacesAndNewlines)]) } }
            .disabled(message.trimmingCharacters(in: .whitespacesAndNewlines).count < 2)
        }
        Section("Workflow") {
          if manager, let nextStatus {
            Button("Move to \(nextStatus)") { Task { await update(["status": nextStatus, "message": "Moved to \(nextStatus) from the native helpdesk."]) } }
          }
          if !manager, (record["raisedBy"] as? String) == app.session?.user.id, ["Resolved", "Closed"].contains(status) {
            Button("Reopen ticket") { Task { await update(["status": "Reopened", "message": "Resolution is not satisfactory; reopening for support."]) } }
          }
        }
      }.navigationTitle("Helpdesk").navigationBarTitleDisplayMode(.inline).toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Close") { isPresented = false } }
      }
    }
  }
  private func update(_ body: [String: Any]) async {
    await app.mutate {
      _ = try await app.api.patch("/api/tickets/\(id)", body: body)
      isPresented = false
    }
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
  @State private var evidenceMimeType = "image/jpeg"
  @State private var evidenceFileExtension = "jpg"
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
          Task {
            evidenceData = try? await item?.loadTransferable(type: Data.self)
            if let type = item?.supportedContentTypes.first {
              evidenceMimeType = type.preferredMIMEType ?? "image/jpeg"
              evidenceFileExtension = type.preferredFilenameExtension ?? "jpg"
            }
          }
        }
        if let gps = location.location { Text(String(format: "GPS %.6f, %.6f · ±%.0f m", gps.coordinate.latitude, gps.coordinate.longitude, gps.horizontalAccuracy)).font(.caption) }
        else { Button("Acquire current GPS") { location.request() } }
      }.navigationTitle("Submit ATR").toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { isPresented = false } }
        ToolbarItem(placement: .confirmationAction) { Button("Submit") { Task { await submit() } }.disabled(summary.count < 10 || evidenceData == nil) }
      }
    }.task { location.request() }.sheet(isPresented: $showingCamera) {
      CameraPicker { evidenceData = $0; evidenceMimeType = "image/jpeg"; evidenceFileExtension = "jpg" }
    }
  }
  private func submit() async {
    await app.mutate {
      guard let gps = location.location, let evidenceData else { throw APIError.server("Current GPS and one photo or video are required.") }
      let timestamp = Int(Date().timeIntervalSince1970 * 1000)
      let localId = "local-atr-\(timestamp)"
      let fileName = "iimm-atr-\(timestamp).\(evidenceFileExtension)"
      let payload: [String: Any] = ["defectId": defectId, "summary": summary, "lat": gps.coordinate.latitude, "lng": gps.coordinate.longitude, "accuracyMeters": gps.horizontalAccuracy]
      do {
        let media = try await app.api.upload(data: evidenceData, mimeType: evidenceMimeType, fileName: fileName, lat: gps.coordinate.latitude, lng: gps.coordinate.longitude, accuracyMeters: gps.horizontalAccuracy)
        do {
          _ = try await app.api.post("/api/defects/\(defectId)/atr", body: ["summary": summary, "media": [media["id"] as? String ?? ""], "lat": gps.coordinate.latitude, "lng": gps.coordinate.longitude, "accuracyMeters": gps.horizontalAccuracy])
        } catch {
          guard (error as NSError).domain == NSURLErrorDomain else { throw error }
          var queued = payload
          queued["mediaId"] = media["id"] as? String ?? ""
          app.queue.enqueue(entityType: "DefectAtrCreate", entityId: localId, payload: queued)
        }
      } catch {
        guard (error as NSError).domain == NSURLErrorDomain else { throw error }
        app.queue.enqueueAtr(entityId: localId, payload: payload, evidence: evidenceData, mimeType: evidenceMimeType, fileName: fileName)
      }
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
  @State private var fourth = ""
  @State private var projects: [[String: Any]] = []
  @State private var users: [[String: Any]] = []
  @State private var assets: [[String: Any]] = []
  @State private var tenants: [[String: Any]] = []
  @State private var projectId = ""
  @State private var makerId = ""
  @State private var checkerId = ""
  @State private var authorityId = ""
  @State private var assetId = ""
  @State private var tenantId = ""
  @State private var userRole = "maker"
  @State private var designation = "Field user"
  @State private var bulkUsers = ""
  @State private var assetType = "Road"
  @State private var condition = "Good"
  @State private var attributes = ""
  @State private var latitude = "28.613900"
  @State private var longitude = "77.209000"
  @State private var radius = "250"
  @State private var inspectionType = "Requested"
  @State private var inspectionDate = Date().addingTimeInterval(86_400)
  @State private var inspectionChecklist = "Structural condition, Electrical safety, Fire safety"
  @State private var hierarchy = "Head Office > Division > Site"
  @State private var enabledModules = "Asset Management, Attendance, Inspections, Defect Management"
  @State private var tenantAssetType = "Road"
  @State private var tenantAttributes = "Length, Surface"
  @State private var tenantChecklist = "Surface condition, Drainage, Safety"
  @State private var additionalAssetTypes = ""
  @State private var slaHours = "24,72,168,360"
  @State private var dataMigration = false
  @State private var adminName = ""
  @State private var adminEmail = ""
  @State private var adminMobile = ""
  @State private var mapSelection: MapMarker?
  @State private var evidenceItem: PhotosPickerItem?
  @State private var evidenceData: Data?
  @State private var evidenceMimeType = "image/jpeg"
  @State private var evidenceFileExtension = "jpg"
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
    case "inspections": return ["Inspection request reference", "", ""]
    default: return ["Project ID", "", ""]
    }
  }
  var canSubmit: Bool { (module.id == "attendance" || module.id == "inspections" || !first.isEmpty || (module.id == "users" && !bulkUsers.isEmpty)) && (module.id != "defects" || evidenceData != nil) }
  var body: some View {
    NavigationStack {
      Form {
        TextField(labels[0], text: $first)
        if !labels[1].isEmpty { TextField(labels[1], text: $second) }
        if !labels[2].isEmpty { TextField(labels[2], text: $third) }
        if ["projects","assets"].contains(module.id) {
          NativeMap(dataset: MapDataset(), selected: $mapSelection).frame(height: 230).clipShape(RoundedRectangle(cornerRadius: 14))
            .onChange(of: mapSelection) { _, point in guard let point else{return};latitude=String(format:"%.6f",point.lat);longitude=String(format:"%.6f",point.lng);Task{third=(try? await app.api.reverse(lat:point.lat,lng:point.lng)) ?? "\(latitude), \(longitude)"} }
          Text("Tap the Mappls map to place the \(module.id == "projects" ? "project centre":"asset").").font(.caption).foregroundStyle(.secondary)
        }
        if module.id == "users" {
          if app.session?.user.role == .tenantAdmin {
            Picker("Tenant", selection: $tenantId) {
              Text("Platform-wide / no tenant").tag("")
              ForEach(Array(tenants.enumerated()), id: \.offset) { _, tenant in Text(tenant["name"] as? String ?? "Tenant").tag(tenant["id"] as? String ?? "") }
            }
          }
          Picker("Role", selection: $userRole) { Text("Authority").tag("authority"); Text("Maker").tag("maker"); Text("Checker").tag("checker") }
          TextField("Designation", text: $designation)
          TextField("Bulk users · Name | email | mobile | role | designation", text: $bulkUsers, axis: .vertical).lineLimit(3...10)
          Text("Optional: one user per line. Bulk rows use the selected tenant.").font(.caption).foregroundStyle(.secondary)
        }
        if module.id == "projects" {
          Picker("Primary asset type", selection: $assetType) { ForEach(Array(Set(projects.compactMap { $0["assetType"] as? String } + assets.compactMap { $0["type"] as? String })).sorted().isEmpty ? ["Road"] : Array(Set(projects.compactMap { $0["assetType"] as? String } + assets.compactMap { $0["type"] as? String })).sorted(), id: \.self) { Text($0).tag($0) } }
          Picker("Assigned Maker", selection: $makerId) { Text("Assign later").tag(""); ForEach(Array(users.filter { $0["role"] as? String == "maker" }.enumerated()), id: \.offset) { _, user in Text(user["name"] as? String ?? "Maker").tag(user["id"] as? String ?? "") } }
          Picker("Assigned Checker", selection: $checkerId) { Text("Assign later").tag(""); ForEach(Array(users.filter { $0["role"] as? String == "checker" }.enumerated()), id: \.offset) { _, user in Text(user["name"] as? String ?? "Checker").tag(user["id"] as? String ?? "") } }
          TextField("Centre latitude", text: $latitude).keyboardType(.numbersAndPunctuation)
          TextField("Centre longitude", text: $longitude).keyboardType(.numbersAndPunctuation)
          TextField("Geofence radius · metres", text: $radius).keyboardType(.numberPad)
          Button("Use current GPS and Mappls address") { location.request(); applyCurrentLocation() }
        }
        if module.id == "assets" {
          Picker("Project", selection: $projectId) { ForEach(Array(projects.enumerated()), id: \.offset) { _, project in Text("\(project["code"] as? String ?? "") · \(project["name"] as? String ?? "")").tag(project["id"] as? String ?? "") } }
          Picker("Condition", selection: $condition) { ForEach(["Good","Fair","Attention","Critical"], id: \.self) { Text($0).tag($0) } }
          TextField("Attributes · one key=value per line", text: $attributes, axis: .vertical).lineLimit(3...8)
          TextField("Latitude", text: $latitude).keyboardType(.numbersAndPunctuation)
          TextField("Longitude", text: $longitude).keyboardType(.numbersAndPunctuation)
          Button("Place at current GPS") { location.request(); applyCurrentLocation() }
        }
        if module.id == "payments" {
          Picker("Project", selection: $projectId) { ForEach(Array(projects.enumerated()), id: \.offset) { _, project in Text("\(project["code"] as? String ?? "") · \(project["name"] as? String ?? "")").tag(project["id"] as? String ?? "") } }
          Picker("Checker", selection: $checkerId) { ForEach(Array(users.filter { $0["role"] as? String == "checker" }.enumerated()), id: \.offset) { _, user in Text(user["name"] as? String ?? "Checker").tag(user["id"] as? String ?? "") } }
          Picker("Authority", selection: $authorityId) { ForEach(Array(users.filter { $0["role"] as? String == "authority" }.enumerated()), id: \.offset) { _, user in Text(user["name"] as? String ?? "Authority").tag(user["id"] as? String ?? "") } }
          TextField("Inspection reference", text: $fourth)
        }
        if module.id == "inspections" {
          Picker("Project", selection: $projectId) { ForEach(Array(projects.enumerated()), id: \.offset) { _, project in Text("\(project["code"] as? String ?? "") · \(project["name"] as? String ?? "")").tag(project["id"] as? String ?? "") } }
          Picker("Asset", selection: $assetId) { ForEach(Array(assets.filter { projectId.isEmpty || $0["projectId"] as? String == projectId }.enumerated()), id: \.offset) { _, asset in Text(asset["name"] as? String ?? "Asset").tag(asset["id"] as? String ?? "") } }
          Picker("Inspection type", selection: $inspectionType) { Text("Request for Inspection").tag("Requested"); Text("Joint inspection").tag("Joint") }
          Picker("Maker", selection: $makerId) { ForEach(Array(users.filter { $0["role"] as? String == "maker" }.enumerated()), id: \.offset) { _, user in Text(user["name"] as? String ?? "Maker").tag(user["id"] as? String ?? "") } }
          Picker("Checker", selection: $checkerId) { ForEach(Array(users.filter { $0["role"] as? String == "checker" }.enumerated()), id: \.offset) { _, user in Text(user["name"] as? String ?? "Checker").tag(user["id"] as? String ?? "") } }
          DatePicker("Schedule", selection: $inspectionDate)
          TextField("Checklist items · comma separated", text: $inspectionChecklist, axis: .vertical).lineLimit(3...8)
        }
        if module.id == "tenants" {
          TextField("Organisation hierarchy", text: $hierarchy)
          TextField("Enabled modules · comma separated", text: $enabledModules, axis: .vertical)
          TextField("Initial asset type", text: $tenantAssetType)
          TextField("Asset attributes · comma separated", text: $tenantAttributes)
          TextField("Inspection checklist · comma separated", text: $tenantChecklist)
          TextField("Additional asset types · Name | attrs | checklist", text: $additionalAssetTypes, axis: .vertical).lineLimit(3...8)
          TextField("SLA hours · Critical, High, Medium, Low", text: $slaHours)
          Toggle("Existing-data migration required", isOn: $dataMigration)
          Section("Optional initial Authority administrator") { TextField("Admin name", text: $adminName); TextField("Admin email", text: $adminEmail).textInputAutocapitalization(.never); TextField("Admin mobile", text: $adminMobile).keyboardType(.phonePad) }
        }
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
            Task {
              evidenceData = try? await item?.loadTransferable(type: Data.self)
              if let type = item?.supportedContentTypes.first {
                evidenceMimeType = type.preferredMIMEType ?? "image/jpeg"
                evidenceFileExtension = type.preferredFilenameExtension ?? "jpg"
              }
            }
          }
          if let gps = location.location {
            Text(String(format: "GPS %.6f, %.6f · ±%.0f m", gps.coordinate.latitude, gps.coordinate.longitude, gps.horizontalAccuracy)).font(.caption).foregroundStyle(.secondary)
          } else { Button("Acquire current GPS") { location.request() } }
        }
        Text("Assignments, geofences and configuration values are validated by the server before creation.")
          .font(.caption).foregroundStyle(.secondary)
    }.navigationTitle("Create \(module.id.capitalized)").toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { isPresented = false } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Submit") { Task { await submit() } }.disabled(!canSubmit)
        }
      }
    }.task { await loadOptions(); if ["attendance","defects","projects","assets"].contains(module.id) { location.request() } }.sheet(isPresented: $showingCamera) {
      CameraPicker { evidenceData = $0; evidenceMimeType = "image/jpeg"; evidenceFileExtension = "jpg" }
    }
  }
  func loadOptions() async {
    await app.mutate {
      projects = (try? await app.api.get("/api/projects")) as? [[String: Any]] ?? []
      users = (try? await app.api.get("/api/users")) as? [[String: Any]] ?? []
      assets = (try? await app.api.get("/api/assets")) as? [[String: Any]] ?? []
      if app.session?.user.role == .tenantAdmin { tenants = (try? await app.api.get("/api/tenants")) as? [[String: Any]] ?? [] }
      projectId = projects.first?["id"] as? String ?? ""
      tenantId = tenants.first?["id"] as? String ?? ""
      assetId = assets.first?["id"] as? String ?? ""
      makerId = users.first { $0["role"] as? String == "maker" }?["id"] as? String ?? ""
      checkerId = users.first { $0["role"] as? String == "checker" }?["id"] as? String ?? ""
      authorityId = users.first { $0["role"] as? String == "authority" }?["id"] as? String ?? ""
      assetType = projects.first?["assetType"] as? String ?? assets.first?["type"] as? String ?? "Road"
    }
  }
  func applyCurrentLocation() {
    guard let gps = location.location else { return }
    latitude = String(format: "%.6f", gps.coordinate.latitude)
    longitude = String(format: "%.6f", gps.coordinate.longitude)
    mapSelection = .init(lat:gps.coordinate.latitude,lng:gps.coordinate.longitude,title:module.id == "projects" ? "Project centre":"Asset location",kind:"Selection")
    Task { third = (try? await app.api.reverse(lat: gps.coordinate.latitude, lng: gps.coordinate.longitude)) ?? "\(latitude), \(longitude)" }
  }
  func submit() async {
    await app.mutate {
      let projects = (try? await app.api.get("/api/projects")) as? [[String: Any]] ?? []
      let users = (try? await app.api.get("/api/users")) as? [[String: Any]] ?? []
      let assets = (try? await app.api.get("/api/assets")) as? [[String: Any]] ?? []
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
        body = ["projectId": projectId.isEmpty ? project : projectId, "lat": gps.coordinate.latitude, "lng": gps.coordinate.longitude, "accuracyMeters": gps.horizontalAccuracy, "offline": false]
      case "defects":
        guard let gps = location.location, let evidenceData else { throw APIError.server("Current GPS and one photo or video are required.") }
        let timestamp = Int(Date().timeIntervalSince1970 * 1000)
        let fileName = "iimm-evidence-\(timestamp).\(evidenceFileExtension)"
        let address = (try? await app.api.reverse(lat: gps.coordinate.latitude, lng: gps.coordinate.longitude)) ?? "\(gps.coordinate.latitude), \(gps.coordinate.longitude)"
        let defectBody: [String: Any] = [
          "projectId": project.isEmpty ? NSNull() : project, "assetId": NSNull(), "title": first, "description": second,
          "location": address, "lat": gps.coordinate.latitude, "lng": gps.coordinate.longitude,
          "severity": ["Low", "Medium", "High", "Critical"].contains(third) ? third : "Medium",
          "locationAccuracyMeters": gps.horizontalAccuracy,
        ]
        do {
          let uploaded = try await app.api.upload(data: evidenceData, mimeType: evidenceMimeType, fileName: fileName, lat: gps.coordinate.latitude, lng: gps.coordinate.longitude, accuracyMeters: gps.horizontalAccuracy)
          var onlineBody = defectBody
          onlineBody["media"] = [uploaded["id"] as? String ?? ""]
          _ = try await app.api.post("/api/defects", body: onlineBody)
        } catch {
          guard (error as NSError).domain == NSURLErrorDomain else { throw error }
          app.queue.enqueueDefect(entityId: "local-defect-\(timestamp)", payload: defectBody, evidence: evidenceData, mimeType: evidenceMimeType, fileName: fileName)
          app.error = "The issue report and its evidence were saved offline and will sync automatically when connectivity returns."
        }
        isPresented = false
        return
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
          "projectId": projectId.isEmpty ? project : projectId, "invoiceNo": first, "checkerId": checkerId.isEmpty ? checker : checkerId, "authorityId": authorityId.isEmpty ? authority : authorityId,
          "amount": Double(second) ?? 1, "attendanceReference": third,
          "inspectionReference": fourth.isEmpty ? "Native app claim" : fourth,
        ]
      case "projects":
        path = "/api/projects"
        body = [
          "code": first, "name": second, "location": third, "assetType": assetType,
          "makerIds": makerId.isEmpty ? [] : [makerId], "checkerIds": checkerId.isEmpty ? [] : [checkerId],
          "center": ["lat": Double(latitude) ?? 28.6139, "lng": Double(longitude) ?? 77.2090],
          "geofenceRadiusMeters": Int(radius) ?? 250,
        ]
      case "assets":
        path = "/api/assets"
        body = [
          "projectId": projectId.isEmpty ? project : projectId, "name": first, "type": second.isEmpty ? assetType : second, "location": third,
          "condition": condition, "attributes": Dictionary(uniqueKeysWithValues: attributes.split(separator: "\n").compactMap { line -> (String,String)? in let parts=line.split(separator:"=",maxSplits:1).map{String($0).trimmingCharacters(in:.whitespaces)}; return parts.count==2 && !parts[0].isEmpty ? (parts[0],parts[1]) : nil }),
          "geometry": ["type":"Point","coordinates":[Double(longitude) ?? 77.2090,Double(latitude) ?? 28.6139]], "layerId": NSNull(),
        ]
      case "users":
        let selectedTenant: Any = tenantId.isEmpty ? NSNull() : tenantId
        let bulkRows = bulkUsers.split(separator: "\n").filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if !bulkRows.isEmpty {
          for row in bulkRows {
            let parts = row.split(separator: "|", omittingEmptySubsequences: false).map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            guard parts.count >= 3 else { throw APIError.server("Each bulk user needs Name | email | mobile | role | designation.") }
            _ = try await app.api.post("/api/users", body: ["name":parts[0],"email":parts[1],"mobile":parts[2],"role":parts.count>3 && !parts[3].isEmpty ? parts[3]:"maker","designation":parts.count>4 && !parts[4].isEmpty ? parts[4]:"Field user","tenantId":selectedTenant])
          }
          await app.load(module)
          isPresented = false
          return
        }
        path = "/api/users"
        body = [
          "name": first, "email": second, "mobile": third, "role": userRole,
          "designation": designation, "tenantId": selectedTenant,
        ]
      case "tenants":
        path = "/api/tenants"
        let hours = slaHours.split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        var types:[[String:Any]] = [["name": tenantAssetType, "attributes": tenantAttributes.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }, "checklist": tenantChecklist.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }]]
        types += additionalAssetTypes.split(separator:"\n").compactMap{line in let p=line.split(separator:"|",maxSplits:2).map{String($0).trimmingCharacters(in:.whitespaces)};guard let name=p.first,!name.isEmpty else{return nil};return ["name":name,"attributes":p.count>1 ? p[1].split(separator:",").map{String($0).trimmingCharacters(in:.whitespaces)}:[],"checklist":p.count>2 ? p[2].split(separator:",").map{String($0).trimmingCharacters(in:.whitespaces)}:[]]}
        var tenantBody: [String: Any] = [
          "name": first, "shortName": second, "type": third,
          "hierarchy": hierarchy,
          "modules": enabledModules.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty },
          "assetTypes": types,
          "slas": ["Critical":hours.count>0 ? hours[0]:24,"High":hours.count>1 ? hours[1]:72,"Medium":hours.count>2 ? hours[2]:168,"Low":hours.count>3 ? hours[3]:360],
          "dataMigration": dataMigration,
        ]
        if !adminName.isEmpty { tenantBody["initialAdmin"] = ["name":adminName,"email":adminEmail,"mobile":adminMobile,"designation":"Authority Administrator"] }
        body = tenantBody
      case "inspections":
        path = "/api/inspections"
        body = [
          "projectId": projectId.isEmpty ? project : projectId,
          "assetId": assetId.isEmpty ? (assets.first?["id"] as? String ?? "") : assetId,
          "type": inspectionType, "makerId": makerId.isEmpty ? maker : makerId, "checkerId": checkerId.isEmpty ? checker : checkerId,
          "scheduledAt": ISO8601DateFormatter().string(from: inspectionDate), "checklist": inspectionChecklist.split(separator:",").map{$0.trimmingCharacters(in:.whitespaces)}.filter{!$0.isEmpty},
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
