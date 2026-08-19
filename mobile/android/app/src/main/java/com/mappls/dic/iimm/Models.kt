package com.mappls.dic.iimm

import org.json.JSONObject

enum class Role(val wire: String, val label: String) {
    TENANT_ADMIN("tenant_admin", "Tenant Administrator"),
    AUTHORITY("authority", "Authority User"),
    MAKER("maker", "External User · Maker"),
    CHECKER("checker", "External User · Checker"),
    CITIZEN("citizen", "Citizen User");
    companion object { fun from(value: String) = entries.first { it.wire == value } }
}

data class User(
    val id: String,
    val name: String,
    val email: String,
    val role: Role,
    val tenantId: String?,
    val designation: String,
) {
    companion object {
        fun from(json: JSONObject) = User(
            json.getString("id"), json.getString("name"), json.optString("email"),
            Role.from(json.getString("role")), json.optString("tenantId").takeIf { it.isNotBlank() && it != "null" },
            json.optString("designation")
        )
    }
}

data class Session(val token: String, val user: User, val tenantName: String?)

data class ModuleSpec(
    val key: String,
    val title: String,
    val subtitle: String,
    val endpoint: String,
    val roles: Set<Role> = Role.entries.toSet(),
    val createKind: String? = null,
)

val MODULES = listOf(
    ModuleSpec("tenants", "Tenants & onboarding", "Hierarchy, modules, asset types and SLAs", "/api/tenants", setOf(Role.TENANT_ADMIN), "tenant"),
    ModuleSpec("users", "Users & access", "Role provisioning and access status", "/api/users", setOf(Role.TENANT_ADMIN, Role.AUTHORITY), "user"),
    ModuleSpec("projects", "Projects", "Assignments, milestones, progress and geofences", "/api/projects", setOf(Role.AUTHORITY, Role.MAKER, Role.CHECKER), "project"),
    ModuleSpec("assets", "Assets", "Infrastructure registry and condition", "/api/assets", setOf(Role.AUTHORITY, Role.MAKER, Role.CHECKER), "asset"),
    ModuleSpec("gis", "GIS layers", "Mappls map, networks and imported versions", "/api/gis/layers", setOf(Role.AUTHORITY, Role.MAKER, Role.CHECKER)),
    ModuleSpec("gis_imports", "GIS import history", "Published network versions and rollback", "/api/gis/imports", setOf(Role.AUTHORITY, Role.MAKER, Role.CHECKER)),
    ModuleSpec("attendance", "Attendance", "Server-verified project geofence", "/api/attendance", setOf(Role.AUTHORITY, Role.MAKER, Role.CHECKER), "attendance"),
    ModuleSpec("inspections", "Inspections", "Joint/RFI checklists and verification", "/api/inspections", setOf(Role.AUTHORITY, Role.MAKER, Role.CHECKER), "inspection"),
    ModuleSpec("defects", "Defects & citizen issues", "Validation, rectification, ATR and feedback", "/api/defects", setOf(Role.AUTHORITY, Role.MAKER, Role.CHECKER, Role.CITIZEN), "defect"),
    ModuleSpec("payments", "Payments", "Maker → Checker → Authority approvals", "/api/payments", setOf(Role.AUTHORITY, Role.MAKER, Role.CHECKER), "payment"),
    ModuleSpec("tickets", "Helpdesk", "Support requests and conversations", "/api/tickets", createKind = "ticket"),
    ModuleSpec("notifications", "Notifications", "Assignments, approvals and SLA updates", "/api/notifications"),
    ModuleSpec("activity", "Activity log", "Auditable platform history", "/api/activities", setOf(Role.TENANT_ADMIN, Role.AUTHORITY, Role.CHECKER)),
    ModuleSpec("sync", "Offline sync", "Queued field changes and manual conflicts", "/api/sync/conflicts", setOf(Role.AUTHORITY, Role.MAKER, Role.CHECKER)),
)

fun JSONObject.displayTitle(): String = listOf("name", "title", "subject", "code", "invoiceNo", "id")
    .firstNotNullOfOrNull { key -> optString(key).takeIf { it.isNotBlank() } } ?: "Record"

fun JSONObject.displaySubtitle(): String = listOf("status", "role", "type", "condition", "location", "description")
    .mapNotNull { key -> optString(key).takeIf { it.isNotBlank() } }
    .take(3).joinToString(" · ")
