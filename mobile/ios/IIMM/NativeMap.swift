import CoreLocation
import MapplsMap
import SwiftUI

struct MapMarker: Identifiable, Equatable {
  let id = UUID()
  let lat: Double
  let lng: Double
  let title: String
  let kind: String
}
struct MapLine { let points: [CLLocationCoordinate2D] }
struct MapArea { let points: [CLLocationCoordinate2D] }
struct MapDataset {
  var markers: [MapMarker] = []
  var lines: [MapLine] = []
  var areas: [MapArea] = []
  init() {}
  init(json: [String: Any]) {
    func valid(_ lat: Double, _ lng: Double) -> Bool {
      lat.isFinite && lng.isFinite && (-90...90).contains(lat) && (-180...180).contains(lng)
        && !(lat == 0 && lng == 0)
    }
    func pair(_ value: Any?) -> CLLocationCoordinate2D? {
      guard let a = value as? [Any], a.count > 1, let lng = a[0] as? Double,
        let lat = a[1] as? Double, valid(lat, lng)
      else { return nil }
      return .init(latitude: lat, longitude: lng)
    }
    func geometry(_ value: [String: Any], _ name: String) {
      guard let type = value["type"] as? String, let c = value["coordinates"] else { return }
      switch type {
      case "Point":
        if let p = pair(c) {
          markers.append(.init(lat: p.latitude, lng: p.longitude, title: name, kind: "Asset"))
        }
      case "LineString":
        if let values = c as? [Any] {
          let p = values.compactMap(pair)
          if p.count > 1 { lines.append(.init(points: p)) }
        }
      case "MultiLineString":
        if let linesJSON = c as? [[Any]] {
          for value in linesJSON {
            let p = value.compactMap(pair)
            if p.count > 1 { lines.append(.init(points: p)) }
          }
        }
      case "Polygon":
        if let rings = c as? [[Any]], let first = rings.first {
          let p = first.compactMap(pair)
          if p.count > 2 { areas.append(.init(points: p)) }
        }
      case "MultiPolygon":
        if let polygons = c as? [[[Any]]] {
          for polygon in polygons {
            if let first = polygon.first {
              let p = first.compactMap(pair)
              if p.count > 2 { areas.append(.init(points: p)) }
            }
          }
        }
      default: break
      }
    }
    for project in json["projects"] as? [[String: Any]] ?? [] {
      if let center = project["center"] as? [String: Any], let lat = center["lat"] as? Double,
        let lng = center["lng"] as? Double, valid(lat, lng)
      {
        markers.append(
          .init(lat: lat, lng: lng, title: project["name"] as? String ?? "Project", kind: "Project")
        )
      }
    }
    for asset in json["assets"] as? [[String: Any]] ?? [] {
      if let g = asset["geometry"] as? [String: Any] {
        geometry(g, asset["name"] as? String ?? "Asset")
      }
    }
    for defect in json["defects"] as? [[String: Any]] ?? [] {
      if let lat = defect["lat"] as? Double, let lng = defect["lng"] as? Double, valid(lat, lng) {
        markers.append(
          .init(lat: lat, lng: lng, title: defect["title"] as? String ?? "Defect", kind: "Defect"))
      }
    }
    for layer in json["layers"] as? [[String: Any]] ?? [] {
      guard layer["visible"] as? Bool != false,
        let fc = layer["featureCollection"] as? [String: Any]
      else { continue }
      for feature in fc["features"] as? [[String: Any]] ?? [] {
        if let g = feature["geometry"] as? [String: Any] {
          geometry(g, layer["name"] as? String ?? "GIS layer")
        }
      }
    }
  }
}

struct NativeMap: View {
  @EnvironmentObject var mappls: MapplsSDKState
  let dataset: MapDataset
  @Binding var selected: MapMarker?
  var body: some View {
    if mappls.ready {
      MapplsRepresentable(dataset: dataset, selected: $selected)
    } else {
      ZStack {
        LinearGradient(colors: [.iimmSky, .iimmMist], startPoint: .top, endPoint: .bottom)
        VStack(spacing: 13) {
          IIMMSymbolTile(symbol: mappls.symbol, color: mappls.color)
          Text(mappls.title).font(.title3.bold()).foregroundStyle(Color.iimmInk)
          Text(mappls.detail).font(.subheadline).multilineTextAlignment(.center)
            .foregroundStyle(.secondary).padding(.horizontal)
          if case .loading = mappls.status { ProgressView().tint(Color.iimmBlue) }
        }
        .frame(maxWidth: .infinity).iimmCard().padding(22)
      }
    }
  }
}

struct MapplsRepresentable: UIViewRepresentable {
  let dataset: MapDataset
  @Binding var selected: MapMarker?
  func makeCoordinator() -> Coordinator { Coordinator(self) }
  func makeUIView(context: Context) -> MapplsMapView {
    let view = MapplsMapView(frame: .zero)
    view.delegate = context.coordinator
    let tap = UITapGestureRecognizer(
      target: context.coordinator, action: #selector(Coordinator.tap(_:)))
    view.addGestureRecognizer(tap)
    return view
  }
  func updateUIView(_ view: MapplsMapView, context: Context) {
    if let existing = view.annotations { view.removeAnnotations(existing) }
    var objects: [MGLAnnotation] = []
    for marker in dataset.markers + Array(selected.map { [$0] } ?? []) {
      let item = MGLPointAnnotation()
      item.coordinate = .init(latitude: marker.lat, longitude: marker.lng)
      item.title = marker.title
      item.subtitle = marker.kind
      objects.append(item)
    }
    for line in dataset.lines {
      var coords = line.points
      objects.append(MGLPolyline(coordinates: &coords, count: UInt(coords.count)))
    }
    for area in dataset.areas {
      var coords = area.points
      objects.append(MGLPolygon(coordinates: &coords, count: UInt(coords.count)))
    }
    view.addAnnotations(objects)
    if let focus = selected ?? dataset.markers.first {
      view.setCenter(
        .init(latitude: focus.lat, longitude: focus.lng), zoomLevel: 13, animated: true)
    }
  }
  final class Coordinator: NSObject, MapplsMapViewDelegate {
    var parent: MapplsRepresentable
    init(_ parent: MapplsRepresentable) { self.parent = parent }
    @objc func tap(_ sender: UITapGestureRecognizer) {
      guard let view = sender.view as? MapplsMapView else { return }
      let coordinate = view.convert(sender.location(in: view), toCoordinateFrom: view)
      parent.selected = .init(
        lat: coordinate.latitude, lng: coordinate.longitude, title: "Selected location",
        kind: "Selection")
    }
  }
}
