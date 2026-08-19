import Foundation

enum Role: String, CaseIterable {
  case tenantAdmin = "tenant_admin"
  case authority, maker, checker, citizen
  var label: String {
    switch self {
    case .tenantAdmin: "Tenant Administrator"
    case .authority: "Authority User"
    case .maker: "External User · Maker"
    case .checker: "External User · Checker"
    case .citizen: "Citizen User"
    }
  }
}

struct User: Identifiable {
  let id: String
  let name: String
  let email: String
  let role: Role
  let tenantId: String?
  let designation: String
  init?(_ json: [String: Any]) {
    guard let id = json["id"] as? String, let name = json["name"] as? String,
      let raw = json["role"] as? String, let role = Role(rawValue: raw)
    else { return nil }
    self.id = id
    self.name = name
    self.email = json["email"] as? String ?? ""
    self.role = role
    self.tenantId = json["tenantId"] as? String
    self.designation = json["designation"] as? String ?? ""
  }
}

struct Session {
  let token: String
  let user: User
  let tenantName: String?
}

struct ModuleSpec: Identifiable, Hashable {
  let id: String
  let title: String
  let subtitle: String
  let endpoint: String
  let roles: Set<Role>
  let createKind: String?
}

let allRoles = Set(Role.allCases)
let modules: [ModuleSpec] = [
  .init(
    id: "tenants", title: "Tenants & onboarding",
    subtitle: "Hierarchy, modules, asset types and SLAs", endpoint: "/api/tenants",
    roles: [.tenantAdmin], createKind: "tenant"),
  .init(
    id: "users", title: "Users & access", subtitle: "Role provisioning and access status",
    endpoint: "/api/users", roles: [.tenantAdmin, .authority], createKind: "user"),
  .init(
    id: "projects", title: "Projects", subtitle: "Assignments, milestones, progress and geofences",
    endpoint: "/api/projects", roles: [.authority, .maker, .checker], createKind: "project"),
  .init(
    id: "assets", title: "Assets", subtitle: "Infrastructure registry and condition",
    endpoint: "/api/assets", roles: [.authority, .maker, .checker], createKind: "asset"),
  .init(
    id: "gis", title: "GIS layers", subtitle: "Mappls map, networks and imported versions",
    endpoint: "/api/gis/layers", roles: [.authority, .maker, .checker], createKind: nil),
  .init(
    id: "gis_imports", title: "GIS import history", subtitle: "Publish KML, KMZ and zipped Shapefile network versions",
    endpoint: "/api/gis/imports", roles: [.authority, .maker, .checker], createKind: "gis_import"),
  .init(
    id: "attendance", title: "Attendance", subtitle: "Server-verified project geofence",
    endpoint: "/api/attendance", roles: [.authority, .maker, .checker], createKind: "attendance"),
  .init(
    id: "inspections", title: "Inspections", subtitle: "Joint/RFI checklists and verification",
    endpoint: "/api/inspections", roles: [.authority, .maker, .checker], createKind: "inspection"),
  .init(
    id: "defects", title: "Defects & citizen issues",
    subtitle: "Validation, rectification, ATR and feedback", endpoint: "/api/defects",
    roles: [.authority, .maker, .checker, .citizen], createKind: "defect"),
  .init(
    id: "payments", title: "Payments", subtitle: "Maker → Checker → Authority approvals",
    endpoint: "/api/payments", roles: [.authority, .maker, .checker], createKind: "payment"),
  .init(
    id: "tickets", title: "Helpdesk", subtitle: "Support requests and conversations",
    endpoint: "/api/tickets", roles: allRoles, createKind: "ticket"),
  .init(
    id: "notifications", title: "Notifications", subtitle: "Assignments, approvals and SLA updates",
    endpoint: "/api/notifications", roles: allRoles, createKind: nil),
  .init(
    id: "activity", title: "Activity log", subtitle: "Auditable platform history",
    endpoint: "/api/activities", roles: [.tenantAdmin, .authority, .checker], createKind: nil),
  .init(
    id: "sync", title: "Offline sync", subtitle: "Queued changes and manual conflicts",
    endpoint: "/api/sync/conflicts", roles: [.authority, .maker, .checker], createKind: nil),
]

func title(_ record: [String: Any]) -> String {
  for key in ["name", "title", "subject", "code", "invoiceNo", "id"] {
    if let value = record[key] as? String, !value.isEmpty { return value }
  }
  return "Record"
}
func subtitle(_ record: [String: Any]) -> String {
  ["status", "role", "type", "condition", "location", "description"].compactMap {
    record[$0] as? String
  }.prefix(3).joined(separator: " · ")
}
