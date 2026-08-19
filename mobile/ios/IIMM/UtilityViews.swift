import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct CameraPicker: UIViewControllerRepresentable {
  static var isAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }
  let onCapture: (Data) -> Void
  @Environment(\.dismiss) private var dismiss

  func makeCoordinator() -> Coordinator { Coordinator(parent: self) }
  func makeUIViewController(context: Context) -> UIImagePickerController {
    let picker = UIImagePickerController()
    picker.sourceType = .camera
    picker.cameraCaptureMode = .photo
    picker.delegate = context.coordinator
    return picker
  }
  func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

  final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
    let parent: CameraPicker
    init(parent: CameraPicker) { self.parent = parent }
    func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
      if let image = info[.originalImage] as? UIImage, let data = image.jpegData(compressionQuality: 0.88) {
        parent.onCapture(data)
      }
      parent.dismiss()
    }
    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
  }
}

struct FieldMapView: View {
  @EnvironmentObject var app: AppModel
  @EnvironmentObject var mappls: MapplsSDKState
  @StateObject private var location = LocationController()
  @State private var selected: MapMarker?
  @State private var address = ""
  var body: some View {
    VStack(spacing: 0) {
      NativeMap(dataset: app.map, selected: $selected).ignoresSafeArea(edges: .horizontal)
      VStack(alignment: .leading, spacing: 12) {
        HStack(spacing: 11) {
          IIMMSymbolTile(symbol: selected == nil ? mappls.symbol : "mappin.and.ellipse", color: selected == nil ? mappls.color : .iimmBlue)
          VStack(alignment: .leading, spacing: 3) {
            Text(selected?.title ?? (mappls.ready ? "Tap the map or use GPS" : mappls.title)).font(.headline)
            Text(
              address.isEmpty
                ? selected.map { String(format: "%.6f, %.6f", $0.lat, $0.lng) }
                  ?? (mappls.ready ? "Projects, assets, GIS networks and defects" : mappls.detail) : address
            ).font(.caption).foregroundStyle(.secondary).lineLimit(3)
          }
          Spacer()
        }
        Button {
          location.request()
        } label: {
          Label("Use current GPS", systemImage: "location.circle.fill").font(.headline)
            .frame(maxWidth: .infinity).padding(.vertical, 5)
        }.buttonStyle(.borderedProminent).buttonBorderShape(.roundedRectangle(radius: 14))
      }.padding(16).background(.background).shadow(color: .black.opacity(0.08), radius: 12, y: -4)
    }.navigationTitle("Field map").navigationBarTitleDisplayMode(.inline).task {
      await app.loadMap()
    }.onChange(of: selected) { _, value in
      guard let value else { return }
      Task {
        address =
          (try? await app.api.reverse(lat: value.lat, lng: value.lng))
          ?? "\(value.lat), \(value.lng)"
      }
    }.onChange(of: location.location) { _, value in
      guard let value else { return }
      selected = .init(
        lat: value.coordinate.latitude, lng: value.coordinate.longitude, title: "Device GPS",
        kind: "Current location")
    }
  }
}

struct SearchView: View {
  @EnvironmentObject var app: AppModel
  @State private var query = ""
  var body: some View {
    List {
      ForEach(Array(app.search.enumerated()), id: \.offset) { _, record in
        NavigationLink {
          SearchRecordView(result: record)
        } label: {
          VStack(alignment: .leading) {
            Text(record["type"] as? String ?? "Record").font(.caption).foregroundStyle(.tint)
            Text(title(record)).bold()
            Text(subtitle(record)).font(.caption).foregroundStyle(.secondary)
          }
        }
      }
    }.navigationTitle("Search").searchable(text: $query, prompt: "All IIMM records").onChange(
      of: query
    ) { _, value in
      Task {
        try? await Task.sleep(for: .milliseconds(250))
        if query == value { await app.find(value) }
      }
    }
  }
}

private struct SearchRecordView: View {
  let result: [String: Any]
  private var record: [String: Any] { result["record"] as? [String: Any] ?? result }
  private var rows: [(String, String)] { flatten(record).filter { $0.0 != "tenantId" && !$0.0.hasPrefix("featureCollection") }.prefix(100).map { $0 } }

  var body: some View {
    List {
      Section(result["type"] as? String ?? "IIMM record") {
        ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
          VStack(alignment: .leading, spacing: 3) {
            Text(row.0.isEmpty ? "Value" : row.0).font(.caption).foregroundStyle(.secondary)
            Text(row.1)
          }
        }
      }
    }.navigationTitle(result["title"] as? String ?? "Search result").navigationBarTitleDisplayMode(.inline)
  }

  private func flatten(_ value: Any, prefix: String = "") -> [(String, String)] {
    if let object = value as? [String: Any] {
      return object.keys.sorted().flatMap { flatten(object[$0] as Any, prefix: prefix.isEmpty ? $0 : "\(prefix) · \($0)") }
    }
    if let array = value as? [Any] {
      return array.isEmpty ? [(prefix, "None")] : array.enumerated().flatMap { flatten($0.element, prefix: "\(prefix) \($0.offset + 1)") }
    }
    if value is NSNull { return [(prefix, "Not set")] }
    return [(prefix, String(describing: value))]
  }
}

struct MoreView: View {
  @EnvironmentObject var app: AppModel
  @EnvironmentObject var mappls: MapplsSDKState
  @State private var report = CSVDocument()
  @State private var reportName = "iimm-report.csv"
  @State private var exporting = false
  var body: some View {
    List {
      if let user = app.session?.user {
        Section {
          HStack(spacing: 13) {
            IIMMSymbolTile(symbol: "person.crop.circle.fill", color: .iimmNavy)
            VStack(alignment: .leading) {
              Text(user.name).bold()
              Text("\(user.designation) · \(user.role.label)").font(.caption)
              Text(user.email).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
          }
        }
      }
      Section("Map & GIS") {
        Label {
          VStack(alignment: .leading, spacing: 2) {
            Text(mappls.title)
            Text(mappls.detail).font(.caption).foregroundStyle(.secondary)
          }
        } icon: { Image(systemName: mappls.symbol).foregroundStyle(mappls.color) }
      }
      Section {
        LabeledContent("Pending offline changes", value: "\(app.queue.all().count)")
        Button("Mark all notifications read") {
          Task { await app.mutate { _ = try await app.api.post("/api/notifications/read-all") } }
        }
        Button("Sign out", role: .destructive) { app.logout() }
      }
      if let role = app.session?.user.role, [.tenantAdmin, .authority, .checker].contains(role) {
        Section("CSV reports") {
          ForEach(["projects", "assets", "defects", "payments", "attendance"], id: \.self) { type in
            Button("Export \(type.capitalized)") { Task { await export(type) } }
          }
        }
      }
      Section("Build") {
        Text("Native 1.0.0")
        Text("API \(APIClient.base.absoluteString)")
        Text("Mappls SDK: \(mappls.title)")
      }
    }.navigationTitle("More").fileExporter(isPresented: $exporting, document: report, contentType: .commaSeparatedText, defaultFilename: reportName) { result in
      if case .failure(let error) = result { app.error = error.localizedDescription }
    }
  }
  private func export(_ type: String) async {
    await app.mutate {
      report = CSVDocument(data: try await app.api.download("/api/reports/\(type).csv"))
      reportName = "iimm-\(type)-report.csv"
      exporting = true
    }
  }
}

struct CSVDocument: FileDocument {
  static var readableContentTypes: [UTType] { [.commaSeparatedText] }
  var data = Data()
  init() {}
  init(data: Data) { self.data = data }
  init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
  func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}
